/**
 * Chave opaca do conector → contexto da chamada (usuário, empresa da chave,
 * vínculo). Confere TUDO a cada chamada (avaliarAcesso): usuário desativado,
 * vínculo removido ou autorização revogada perdem o acesso na hora.
 */
import { hashSegredo, PREFIXO } from "../_shared/conector/cripto.ts";
import {
  avaliarAcesso,
  modulosDoPlano,
  type Negacao,
  type Vinculo,
} from "../_shared/conector/acesso.ts";

// deno-lint-ignore no-explicit-any
type Admin = any;

export interface ContextoMcp {
  autorizacaoId: string;
  cliente: string;
  usuario: { id: string; email: string; nome: string };
  empresa: { id: string; nome: string; cnpj: string | null };
  vinculo: Vinculo;
}

export type Resolucao =
  | { ok: true; ctx: ContextoMcp }
  | { ok: false; motivo: Negacao; empresaId?: string; email?: string; autorizacaoId?: string };

export async function resolverChave(admin: Admin, bearer: string): Promise<Resolucao> {
  if (!bearer.startsWith(PREFIXO.acesso) && !bearer.startsWith(PREFIXO.manual)) {
    return { ok: false, motivo: "chave_invalida" };
  }
  const { data: chave } = await admin
    .from("conector_chave")
    .select("autorizacao_id, expira_em, revogada_em")
    .eq("chave_hash", await hashSegredo(bearer))
    .in("tipo", ["acesso", "manual"])
    .maybeSingle();
  if (!chave) return { ok: false, motivo: "chave_invalida" };
  const { data: aut } = await admin
    .from("conector_autorizacao")
    .select("id, empresa_id, usuario_custom_id, usuario_email, cliente_id, tipo, revogado_em")
    .eq("id", chave.autorizacao_id)
    .maybeSingle();
  if (!aut) return { ok: false, motivo: "chave_invalida" };

  const [{ data: usuario }, { data: vinculo }, { data: empresa }, { data: assins }, { data: cli }] =
    await Promise.all([
      admin
        .from("usuario_custom")
        .select("id, email, nome_completo, ativo, deleted_at")
        .eq("id", aut.usuario_custom_id)
        .maybeSingle(),
      admin
        .from("usuario_empresa")
        .select("id, perfil, is_owner, permissoes, ativo, deleted_at")
        .eq("usuario_email", aut.usuario_email)
        .eq("empresa_id", aut.empresa_id)
        .eq("ativo", true)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
      admin
        .from("empresa")
        .select("id, nome, nome_fantasia, cnpj, ativo, deleted_at, conector_claude")
        .eq("id", aut.empresa_id)
        .maybeSingle(),
      admin
        .from("assinatura")
        .select("plano_id")
        .eq("empresa_id", aut.empresa_id)
        .in("status", ["Ativa", "Trial"])
        .is("deleted_at", null),
      aut.cliente_id
        ? admin.from("conector_cliente").select("nome, tipo").eq("id", aut.cliente_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
  const planoIds = ((assins ?? []) as { plano_id: string }[]).map((a) => a.plano_id);
  const { data: planos } = planoIds.length
    ? await admin.from("plano").select("modulos_liberados").in("id", planoIds)
    : { data: [] };

  const r = avaliarAcesso({
    chave,
    autorizacao: aut,
    usuario,
    vinculo,
    empresa,
    modulosDosPlanos: ((planos ?? []) as { modulos_liberados: unknown }[]).map((p) =>
      modulosDoPlano(p.modulos_liberados)
    ),
  });
  if (!r.ok)
    return {
      ok: false,
      motivo: r.motivo,
      empresaId: aut.empresa_id,
      email: aut.usuario_email,
      autorizacaoId: aut.id,
    };

  // último uso: não bloqueia a resposta
  admin
    .from("conector_autorizacao")
    .update({ ultimo_uso: new Date().toISOString() })
    .eq("id", aut.id)
    .then(
      () => {},
      () => {}
    );
  const nomeCliente =
    aut.tipo === "manual"
      ? "Chave do Claude Code"
      : cli?.tipo === "loopback"
        ? "Programa neste computador"
        : (cli?.nome ?? "Claude");
  return {
    ok: true,
    ctx: {
      autorizacaoId: aut.id,
      cliente: nomeCliente,
      usuario: {
        id: usuario.id,
        email: String(usuario.email).toLowerCase(),
        nome: usuario.nome_completo,
      },
      empresa: {
        id: empresa.id,
        nome: empresa.nome_fantasia || empresa.nome,
        cnpj: empresa.cnpj ?? null,
      },
      vinculo,
    },
  };
}
