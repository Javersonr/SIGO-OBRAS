/**
 * funcionario-acesso — o RH gerencia o login do Portal do Funcionário.
 *
 * Exige sessão de STAFF, e o funcionário tem de ser da empresa ativa dessa
 * sessão (super admin passa). Ações:
 *   { acao:"status", empresa_id? }                   → { acessos:[...] } da empresa
 *   { acao:"criar", funcionario_id, usuario? }       → { usuario, senha_provisoria }
 *   { acao:"redefinir", funcionario_id }             → { usuario, senha_provisoria }
 *   { acao:"ativo", funcionario_id, ativo:boolean }  → { ativo }
 *
 * Permissão (espelha a aba Funcionários de RH & Segurança, onde fica a ficha
 * com o AcessoPortalCard): super admin, Admin, dono ou permissão na aba.
 * "status" basta ver a aba; criar/redefinir/ativar exigem a função "editar".
 *
 * A senha provisória volta UMA vez (para o RH entregar); no primeiro acesso o
 * funcionário cria a própria senha, que ninguém do RH conhece.
 */
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { preflightResponse, ok, fail, withCors } from "../_shared/cors.ts";
import { usuarioDaRequisicao } from "../_shared/usuario-request.ts";
import { hashPassword } from "../_shared/passwords.ts";
import { temPermissaoServidor, type Vinculo } from "../_shared/conector/acesso.ts";
import {
  normalizarUsuario,
  gerarSenhaProvisoria,
  registrarEvento,
} from "../_shared/portal-funcionario.ts";

// mesmo módulo/aba do front (pages/SegurancaTrabalho.jsx → aba Funcionários)
const MODULO = "Segurança do Trabalho";
const ABA = "Funcionários";
const ACOES_ESCRITA = new Set(["criar", "redefinir", "ativo"]);

interface Body {
  acao?: string;
  empresa_id?: string;
  funcionario_id?: string;
  usuario?: string;
  ativo?: boolean;
}

/**
 * Vínculo ATIVO do chamador na empresa da sessão (e-mail do usuário do JWT +
 * empresa do JWT). null = sem vínculo. Erro de leitura lança (vira 500).
 */
async function vinculoDoChamador(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  email: string,
  empresaId: string | null
): Promise<Vinculo | null> {
  if (!empresaId) return null;
  const { data, error } = await supabase
    .from("usuario_empresa")
    .select("perfil, is_owner, permissoes, ativo, deleted_at")
    .eq("usuario_email", email.toLowerCase())
    .eq("empresa_id", empresaId)
    .eq("ativo", true)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("usuario_empresa: " + error.message);
  return data ?? null;
}

Deno.serve(
  withCors(async (req) => {
    if (req.method === "OPTIONS") return preflightResponse();
    if (req.method !== "POST") return fail("Método não permitido", 405);

    const staff = await usuarioDaRequisicao(req);
    if (!staff) return fail("Sessão inválida", 401);

    let body: Body;
    try {
      body = await req.json();
    } catch {
      return fail("Payload inválido", 400);
    }
    const acao = body.acao ?? "";
    if (acao !== "status" && !ACOES_ESCRITA.has(acao)) return fail("Ação desconhecida", 400);
    const supabase = createAdminClient();

    // Antes: qualquer usuário da empresa (Compras, Estoque...) redefinia a
    // senha de qualquer funcionário e recebia a provisória. Agora: ver a aba
    // para qualquer ação; "editar" para o que altera o acesso (logo antes de
    // alterar, para o 409 "já tem acesso" do avisarNoPortal seguir igual).
    let podeEditar = true;
    if (!staff.is_super_admin) {
      const vinculo = await vinculoDoChamador(supabase, staff.email, staff.empresa_id);
      if (!vinculo || !temPermissaoServidor(vinculo, MODULO, ABA)) {
        return fail("Sem permissão para gerenciar o acesso ao Portal do Funcionário", 403);
      }
      podeEditar = temPermissaoServidor(vinculo, MODULO, ABA, "editar");
    }
    const semEdicao = () =>
      fail("Sem permissão para alterar o acesso ao Portal do Funcionário", 403);

    if (acao === "status") {
      // super admin consulta a empresa aberta na tela; os demais, só a da sessão
      const empresaId =
        staff.is_super_admin && body.empresa_id ? body.empresa_id : staff.empresa_id;
      if (!empresaId) return fail("Sessão sem empresa ativa", 400);
      const { data, error } = await supabase
        .from("funcionario_portal_acesso")
        .select("funcionario_id, usuario, ativo, senha_provisoria, bloqueado_ate, ultimo_acesso")
        .eq("empresa_id", empresaId);
      if (error) return fail("Erro ao carregar acessos", 500);
      const agora = Date.now();
      return ok({
        acessos: (data ?? []).map((a) => ({
          funcionario_id: a.funcionario_id,
          usuario: a.usuario,
          ativo: a.ativo,
          primeiro_acesso_pendente: a.senha_provisoria,
          bloqueado: !!a.bloqueado_ate && Date.parse(a.bloqueado_ate) > agora,
          ultimo_acesso: a.ultimo_acesso,
        })),
      });
    }

    if (!body.funcionario_id) return fail("funcionario_id é obrigatório", 400);
    const { data: func } = await supabase
      .from("funcionario")
      .select("id, empresa_id, cpf, nome_completo")
      .eq("id", body.funcionario_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!func) return fail("Funcionário não encontrado", 404);
    if (!staff.is_super_admin && func.empresa_id !== staff.empresa_id) {
      return fail("Funcionário de outra empresa", 403);
    }
    const { data: atual } = await supabase
      .from("funcionario_portal_acesso")
      .select("usuario, sessao_versao, ativo")
      .eq("funcionario_id", func.id)
      .maybeSingle();
    const evento = (nome: string) =>
      registrarEvento(supabase, req, {
        empresa_id: func.empresa_id,
        funcionario_id: func.id,
        evento: nome,
        detalhe: { por: staff.email },
      });

    if (body.acao === "criar") {
      if (atual) return fail("Este funcionário já tem acesso — use Redefinir senha", 409);
      if (!podeEditar) return semEdicao();
      const usuario = normalizarUsuario(body.usuario || func.cpf || "");
      if (!usuario) {
        return fail("Funcionário sem CPF cadastrado — informe um usuário", 400);
      }
      if (/^\d+$/.test(usuario) && usuario.length !== 11) {
        return fail(
          "CPF do funcionário incompleto — corrija o cadastro ou informe outro usuário",
          400
        );
      }
      const senha = gerarSenhaProvisoria();
      const { error } = await supabase.from("funcionario_portal_acesso").insert({
        funcionario_id: func.id,
        empresa_id: func.empresa_id,
        usuario,
        senha_hash: await hashPassword(senha),
        senha_provisoria: true,
        ativo: true,
        criado_por: staff.email,
      });
      if (error) {
        if (error.code === "23505") {
          return fail(`O usuário "${usuario}" já está em uso — informe outro`, 409);
        }
        console.error("[funcionario-acesso] criar:", error);
        return fail("Erro ao criar acesso", 500);
      }
      await evento("acesso_criado");
      return ok({ usuario, senha_provisoria: senha, url_path: "/PortalFuncionario" });
    }

    if (!atual) return fail("Este funcionário ainda não tem acesso ao portal", 404);
    if (!podeEditar) return semEdicao(); // redefinir / ativo

    if (body.acao === "redefinir") {
      const senha = gerarSenhaProvisoria();
      const { error } = await supabase
        .from("funcionario_portal_acesso")
        .update({
          senha_hash: await hashPassword(senha),
          senha_provisoria: true,
          ativo: true,
          tentativas: 0,
          bloqueado_ate: null,
          sessao_versao: atual.sessao_versao + 1,
        })
        .eq("funcionario_id", func.id);
      if (error) return fail("Erro ao redefinir senha", 500);
      await evento("senha_redefinida");
      return ok({
        usuario: atual.usuario,
        senha_provisoria: senha,
        url_path: "/PortalFuncionario",
      });
    }

    if (body.acao === "ativo") {
      const ativo = body.ativo === true;
      const { error } = await supabase
        .from("funcionario_portal_acesso")
        .update({
          ativo,
          // desativar derruba as sessões abertas na hora
          sessao_versao: ativo ? atual.sessao_versao : atual.sessao_versao + 1,
        })
        .eq("funcionario_id", func.id);
      if (error) return fail("Erro ao alterar acesso", 500);
      await evento(ativo ? "acesso_reativado" : "acesso_desativado");
      return ok({ ativo });
    }

    return fail("Ação desconhecida", 400);
  })
);
