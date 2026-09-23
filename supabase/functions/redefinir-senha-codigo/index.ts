/**
 * redefinir-senha-codigo — passo 2 da recuperação por WhatsApp
 *
 * Recebe { email, codigo, nova_senha }:
 *   1. Valida política da nova senha (mesmas regras do alterar-senha)
 *   2. Confere código: existe, não expirou, < 5 tentativas erradas,
 *      bcrypt bate (reset_token)
 *   3. Grava senha_hash novo, limpa token/tentativas, senha_provisoria=false
 *   4. Sincroniza o Supabase Auth (best-effort)
 */

import { createAdminClient } from "../_shared/supabase-admin.ts";
import { verifyPassword, hashPassword } from "../_shared/passwords.ts";
import { preflightResponse, ok, fail, withCors } from "../_shared/cors.ts";
import { atualizarSenhaAuth } from "../_shared/auth-bridge.ts";

const MAX_TENTATIVAS = 5;

function validarPolitica(senha: string): string | null {
  if (senha.length < 8) return "Senha deve ter ao menos 8 caracteres";
  if (!/[a-z]/.test(senha)) return "Senha precisa de pelo menos 1 letra minúscula";
  if (!/[A-Z]/.test(senha)) return "Senha precisa de pelo menos 1 letra maiúscula";
  if (!/[0-9]/.test(senha)) return "Senha precisa de pelo menos 1 número";
  const triviais = ["12345678", "abcdefgh", "qwertyui", "password", "senha"];
  if (triviais.some((t) => senha.toLowerCase().includes(t))) {
    return "Senha muito previsível, escolha outra";
  }
  return null;
}

Deno.serve(
  withCors(async (req) => {
    if (req.method === "OPTIONS") return preflightResponse();
    if (req.method !== "POST") return fail("Método não permitido", 405);

    let body: { email?: string; codigo?: string; nova_senha?: string };
    try {
      body = await req.json();
    } catch {
      return fail("Payload inválido", 400);
    }
    const email = (body.email ?? "").trim().toLowerCase();
    const codigo = (body.codigo ?? "").trim();
    const novaSenha = body.nova_senha ?? "";
    if (!email || !codigo || !novaSenha) {
      return fail("email, codigo e nova_senha são obrigatórios", 400);
    }
    if (!/^\d{6}$/.test(codigo)) return fail("Código inválido", 401);

    const politicaErro = validarPolitica(novaSenha);
    if (politicaErro) return fail(politicaErro, 400);

    const supabase = createAdminClient();

    const { data: usuario, error } = await supabase
      .from("usuario_custom")
      .select("id, email, ativo, auth_user_id, reset_token, reset_token_expira, reset_tentativas")
      .eq("email", email)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) {
      console.error("[redefinir-senha-codigo] consulta:", error);
      return fail("Erro interno", 500);
    }
    if (!usuario || !usuario.ativo || !usuario.reset_token) {
      return fail("Código inválido ou expirado. Peça um novo código.", 401);
    }
    if (!usuario.reset_token_expira || new Date(usuario.reset_token_expira) < new Date()) {
      return fail("Código expirado. Peça um novo código.", 401);
    }
    if ((usuario.reset_tentativas ?? 0) >= MAX_TENTATIVAS) {
      await supabase
        .from("usuario_custom")
        .update({ reset_token: null, reset_token_expira: null })
        .eq("id", usuario.id);
      return fail("Muitas tentativas erradas. Peça um novo código.", 429);
    }

    const { ok: codigoOk } = await verifyPassword(codigo, usuario.reset_token);
    if (!codigoOk) {
      await supabase
        .from("usuario_custom")
        .update({ reset_tentativas: (usuario.reset_tentativas ?? 0) + 1 })
        .eq("id", usuario.id);
      return fail("Código inválido", 401);
    }

    const novoHash = await hashPassword(novaSenha);
    const { error: upErr } = await supabase
      .from("usuario_custom")
      .update({
        senha_hash: novoHash,
        senha_provisoria: false,
        reset_token: null,
        reset_token_expira: null,
        reset_tentativas: 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", usuario.id);
    if (upErr) {
      console.error("[redefinir-senha-codigo] update senha:", upErr);
      return fail("Erro ao salvar nova senha", 500);
    }

    try {
      await atualizarSenhaAuth(supabase, {
        email: usuario.email,
        senha: novaSenha,
        authUserId: usuario.auth_user_id,
      });
    } catch (e) {
      console.error("[redefinir-senha-codigo] sync Auth (não-fatal):", (e as Error)?.message);
    }

    return ok({ message: "Senha redefinida com sucesso. Faça login com a nova senha." });
  })
);
