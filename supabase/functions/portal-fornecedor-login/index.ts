/**
 * portal-fornecedor-login — autentica o fornecedor (email + senha) contra a
 * tabela `fornecedor_acesso` no Supabase e emite um TOKEN DE PORTAL assinado
 * (HMAC, NÃO um JWT do Supabase Auth — ver _shared/portal-token.ts).
 *
 * Substitui a função legada Base44 `autenticarFornecedor`. Como o Base44 está
 * obsoleto, esta passa a ser a fonte de verdade da autenticação do fornecedor.
 *
 * Senha: o frontend grava SHA-256 hex (lib/senha-portal.js) e o primeiro login
 * bem-sucedido regrava como bcrypt. Texto puro NÃO é mais aceito: a comparação
 * `armazenado === digitado` deixava entrar com o PRÓPRIO hash (quem lê a
 * tabela, logava como o fornecedor). Conferido em 24/09/2026: nenhuma linha em
 * texto puro em produção (12 SHA-256).
 *
 * Proteções: limite por IP e por e-mail (_shared/limite-tentativas) e bcrypt
 * fictício quando o acesso não existe — resposta e tempo iguais aos de senha
 * errada. Obs.: o EntrarSistema tenta este login ANTES do login-custom, então
 * logins de funcionários também contam no limite por IP daqui (429 aqui só faz
 * o EntrarSistema seguir para o login-custom).
 * Acesso cujo fornecedor não é da mesma empresa do acesso = credencial inválida.
 *
 * Resposta: { success, fornecedor_id, fornecedor_nome, email, empresa_id, portal_token }
 */

import { createAdminClient } from "../_shared/supabase-admin.ts";
import { verifyPassword, hashPassword, verificarSenhaFicticia } from "../_shared/passwords.ts";
import { preflightResponse, ok, fail, withCors } from "../_shared/cors.ts";
import { signPortalToken } from "../_shared/portal-token.ts";
import {
  consumirTentativa,
  ipDaRequisicao,
  liberarTentativas,
  MSG_MUITAS_TENTATIVAS,
} from "../_shared/limite-tentativas.ts";

const JANELA_SEG = 15 * 60;
const MAX_POR_IP = 30;
const MAX_POR_CONTA = 8;

interface Body {
  email?: string;
  senha?: string;
}

Deno.serve(
  withCors(async (req) => {
    if (req.method === "OPTIONS") return preflightResponse();
    if (req.method !== "POST") return fail("Método não permitido", 405);

    let body: Body;
    try {
      body = await req.json();
    } catch {
      return fail("Payload inválido", 400);
    }

    const email = (body.email ?? "").trim().toLowerCase();
    const senha = body.senha ?? "";
    if (!email || !senha) return fail("Email e senha são obrigatórios", 400);

    const supabase = createAdminClient();

    const limite = await consumirTentativa(supabase, "fornecedor-login", JANELA_SEG, [
      { tipo: "ip", valor: ipDaRequisicao(req), max: MAX_POR_IP },
      { tipo: "conta", valor: email, max: MAX_POR_CONTA },
    ]);
    if (!limite.permitido) return fail(MSG_MUITAS_TENTATIVAS, 429);

    // Busca acesso do fornecedor (tenta lowercase; cai pro original por compat)
    let { data: acesso } = await supabase
      .from("fornecedor_acesso")
      .select(
        "id, empresa_id, fornecedor_id, fornecedor_email, fornecedor_nome, senha_acesso, ativo"
      )
      .eq("fornecedor_email", email)
      .eq("ativo", true)
      .is("deleted_at", null)
      .maybeSingle();

    if (!acesso) {
      const orig = (body.email ?? "").trim();
      if (orig !== email) {
        const r = await supabase
          .from("fornecedor_acesso")
          .select(
            "id, empresa_id, fornecedor_id, fornecedor_email, fornecedor_nome, senha_acesso, ativo"
          )
          .eq("fornecedor_email", orig)
          .eq("ativo", true)
          .is("deleted_at", null)
          .maybeSingle();
        acesso = r.data;
      }
    }

    // Mensagem e tempo genéricos pra não revelar se o email existe
    if (!acesso) {
      await verificarSenhaFicticia(senha);
      return fail("Credenciais inválidas", 401);
    }

    // Validação de senha: só bcrypt / SHA-256 (via verifyPassword)
    const { ok: senhaOk, needsRehash } = await verifyPassword(senha, acesso.senha_acesso ?? "");
    if (!senhaOk) return fail("Credenciais inválidas", 401);

    // O fornecedor do acesso tem de ser da MESMA empresa do acesso. A RLS só
    // confere o empresa_id da linha: um acesso apontando para o fornecedor de
    // outra empresa daria a quem o criou as cotações dela (a trigger da 0118
    // barra linhas novas assim; aqui cobre o legado).
    const { data: forn, error: fornErr } = acesso.fornecedor_id
      ? await supabase
          .from("fornecedor")
          .select("nome_razao")
          .eq("id", acesso.fornecedor_id)
          .eq("empresa_id", acesso.empresa_id)
          .maybeSingle()
      : { data: null, error: null };
    if (fornErr) {
      console.error("[portal-fornecedor-login] erro consultando fornecedor:", fornErr.message);
      return fail("Erro interno", 500);
    }
    if (!forn) {
      console.warn(
        "[portal-fornecedor-login] acesso",
        acesso.id,
        "aponta para fornecedor inexistente ou de outra empresa — recusado"
      );
      return fail("Credenciais inválidas", 401);
    }
    await liberarTentativas(supabase, limite);

    // Rehash transparente p/ bcrypt
    if (needsRehash) {
      try {
        const novoHash = await hashPassword(senha);
        await supabase
          .from("fornecedor_acesso")
          .update({ senha_acesso: novoHash })
          .eq("id", acesso.id);
      } catch (e) {
        console.error(
          "[portal-fornecedor-login] rehash falhou (não-fatal):",
          (e as Error)?.message
        );
      }
    }

    // Nome do fornecedor (display) — usa o do acesso; senão o do cadastro
    const fornecedorNome = acesso.fornecedor_nome || forn.nome_razao || null;

    const portal_token = await signPortalToken({
      scope: "fornecedor",
      empresa_id: acesso.empresa_id,
      fornecedor_id: acesso.fornecedor_id,
      email: acesso.fornecedor_email,
    });

    return ok({
      fornecedor_id: acesso.fornecedor_id,
      fornecedor_nome: fornecedorNome,
      email: acesso.fornecedor_email,
      empresa_id: acesso.empresa_id,
      portal_token,
    });
  })
);
