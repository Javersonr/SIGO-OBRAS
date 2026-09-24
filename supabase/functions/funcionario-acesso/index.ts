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
 * A senha provisória volta UMA vez (para o RH entregar); no primeiro acesso o
 * funcionário cria a própria senha, que ninguém do RH conhece.
 */
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { preflightResponse, ok, fail, withCors } from "../_shared/cors.ts";
import { usuarioDaRequisicao } from "../_shared/usuario-request.ts";
import { hashPassword } from "../_shared/passwords.ts";
import {
  normalizarUsuario,
  gerarSenhaProvisoria,
  registrarEvento,
} from "../_shared/portal-funcionario.ts";

interface Body {
  acao?: string;
  empresa_id?: string;
  funcionario_id?: string;
  usuario?: string;
  ativo?: boolean;
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
    const supabase = createAdminClient();

    if (body.acao === "status") {
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
