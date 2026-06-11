/**
 * portal-fornecedor-login — autentica o fornecedor (email + senha) contra a
 * tabela `fornecedor_acesso` no Supabase e emite um TOKEN DE PORTAL assinado
 * (HMAC, NÃO um JWT do Supabase Auth — ver _shared/portal-token.ts).
 *
 * Substitui a função legada Base44 `autenticarFornecedor`. Como o Base44 está
 * obsoleto, esta passa a ser a fonte de verdade da autenticação do fornecedor.
 *
 * Migração transparente de senha: a `senha_acesso` legada estava em TEXTO PURO.
 * Validamos texto puro / SHA-256 / bcrypt e, no primeiro login bem-sucedido,
 * regravamos como bcrypt.
 *
 * Resposta: { success, fornecedor_id, fornecedor_nome, email, empresa_id, portal_token }
 */

import { createAdminClient } from "../_shared/supabase-admin.ts";
import { verifyPassword, hashPassword } from "../_shared/passwords.ts";
import { preflightResponse, ok, fail, withCors } from "../_shared/cors.ts";
import { signPortalToken } from "../_shared/portal-token.ts";

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

    // Mensagem genérica pra não revelar se o email existe
    if (!acesso) return fail("Credenciais inválidas", 401);

    // Validação de senha: bcrypt / SHA-256 (via verifyPassword) ou texto puro legado
    const stored = acesso.senha_acesso ?? "";
    let { ok: senhaOk, needsRehash } = await verifyPassword(senha, stored);
    if (!senhaOk && stored && stored === senha) {
      // senha_acesso legada em texto puro
      senhaOk = true;
      needsRehash = true;
    }
    if (!senhaOk) return fail("Credenciais inválidas", 401);

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

    // Nome do fornecedor (display) — usa o do acesso; tenta enriquecer pelo cadastro
    let fornecedorNome = acesso.fornecedor_nome ?? null;
    if (!fornecedorNome) {
      const { data: forn } = await supabase
        .from("fornecedor")
        .select("nome_razao")
        .eq("id", acesso.fornecedor_id)
        .maybeSingle();
      fornecedorNome = forn?.nome_razao ?? null;
    }

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
