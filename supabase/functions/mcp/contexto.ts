/**
 * Chave opaca do conector → contexto da chamada (usuário, empresa da chave,
 * vínculo). Confere TUDO a cada chamada (avaliarAcesso): usuário desativado,
 * vínculo removido ou autorização revogada perdem o acesso na hora. Senha
 * trocada depois da autorização (usuario_custom.senha_alterada_em, 0124) também
 * a revoga, mesmo se a revogação explícita da função de senha falhou.
 *
 * Falha do banco (timeout, pooler, 5xx) NUNCA vira negação: uma consulta que
 * volta com `error` é sinalizada à parte como "indisponivel" — não pode virar
 * chave_invalida (o Claude descartaria a chave à toa) nem uma negação
 * auditada com motivo falso.
 */
import { hashSegredo, PREFIXO } from "../_shared/conector/cripto.ts";
import { nomeDoApp } from "../_shared/conector/oauth-regras.ts";
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
  | { ok: false; motivo: Negacao; empresaId?: string; email?: string; autorizacaoId?: string }
  | { ok: false; motivo: "indisponivel" };

function indisponivel(tabela: string, mensagem: string): Resolucao {
  console.error("[mcp] contexto:", tabela, mensagem);
  return { ok: false, motivo: "indisponivel" };
}

export async function resolverChave(admin: Admin, bearer: string): Promise<Resolucao> {
  if (!bearer.startsWith(PREFIXO.acesso) && !bearer.startsWith(PREFIXO.manual)) {
    return { ok: false, motivo: "chave_invalida" };
  }
  const { data: chave, error: erroChave } = await admin
    .from("conector_chave")
    .select("autorizacao_id, expira_em, revogada_em")
    .eq("chave_hash", await hashSegredo(bearer))
    .in("tipo", ["acesso", "manual"])
    .maybeSingle();
  if (erroChave) return indisponivel("conector_chave", erroChave.message);
  if (!chave) return { ok: false, motivo: "chave_invalida" };
  const { data: aut, error: erroAut } = await admin
    .from("conector_autorizacao")
    .select(
      "id, empresa_id, usuario_custom_id, usuario_email, cliente_id, tipo, criado_em, revogado_em"
    )
    .eq("id", chave.autorizacao_id)
    .maybeSingle();
  if (erroAut) return indisponivel("conector_autorizacao", erroAut.message);
  if (!aut) return { ok: false, motivo: "chave_invalida" };

  const [
    { data: usuario, error: erroUsuario },
    { data: vinculo, error: erroVinculo },
    { data: empresa, error: erroEmpresa },
    { data: assins, error: erroAssins },
    { data: cli, error: erroCli },
  ] = await Promise.all([
    admin
      .from("usuario_custom")
      .select("id, email, nome_completo, ativo, deleted_at, senha_alterada_em")
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
      ? admin.from("conector_cliente").select("tipo").eq("id", aut.cliente_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (erroUsuario) return indisponivel("usuario_custom", erroUsuario.message);
  if (erroVinculo) return indisponivel("usuario_empresa", erroVinculo.message);
  if (erroEmpresa) return indisponivel("empresa", erroEmpresa.message);
  if (erroAssins) return indisponivel("assinatura", erroAssins.message);
  if (erroCli) return indisponivel("conector_cliente", erroCli.message);

  const planoIds = ((assins ?? []) as { plano_id: string }[]).map((a) => a.plano_id);
  const { data: planos, error: erroPlano } = planoIds.length
    ? await admin.from("plano").select("modulos_liberados").in("id", planoIds)
    : { data: [], error: null };
  if (erroPlano) return indisponivel("plano", erroPlano.message);

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
  const nomeCliente = nomeDoApp(aut.tipo, cli?.tipo);
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
