/**
 * alterar-senha — usuário troca a própria senha
 *
 * Fluxo:
 *   1. Recebe { usuario_id, senha_atual, nova_senha }
 *   2. Carrega usuario_custom pelo ID
 *   3. Valida senha_atual com o hash do banco
 *   4. Valida políticas mínimas da nova senha (8+ chars, mistura)
 *   5. Atualiza senha_hash = bcrypt(nova) + senha_provisoria = false
 *
 * Diferente do login-custom: este endpoint EXIGE conhecer a senha atual
 * (mesmo se a atual é provisória). Pra reset por admin sem conhecer a senha
 * atual, use redefinir-senha-admin.
 */

import { createAdminClient } from "../_shared/supabase-admin.ts";
import { verifyPassword, hashPassword } from "../_shared/passwords.ts";
import { preflightResponse, ok, fail, withCors } from "../_shared/cors.ts";
import { atualizarSenhaAuth } from "../_shared/auth-bridge.ts";

interface AlterarBody {
  usuario_id?: string;
  senha_atual?: string;
  nova_senha?: string;
}

function validarPolitica(senha: string): string | null {
  if (senha.length < 8) return "Senha deve ter ao menos 8 caracteres";
  if (!/[a-z]/.test(senha)) return "Senha precisa de pelo menos 1 letra minúscula";
  if (!/[A-Z]/.test(senha)) return "Senha precisa de pelo menos 1 letra maiúscula";
  if (!/[0-9]/.test(senha)) return "Senha precisa de pelo menos 1 número";
  // Bloqueia sequências triviais
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

    let body: AlterarBody;
    try {
      body = await req.json();
    } catch {
      return fail("Payload inválido", 400);
    }

    const { usuario_id, senha_atual, nova_senha } = body;
    if (!usuario_id || !senha_atual || !nova_senha) {
      return fail("usuario_id, senha_atual e nova_senha são obrigatórios", 400);
    }

    const politicaErro = validarPolitica(nova_senha);
    if (politicaErro) return fail(politicaErro, 400);

    if (senha_atual === nova_senha) {
      return fail("A nova senha precisa ser diferente da atual", 400);
    }

    const supabase = createAdminClient();

    const { data: usuario, error } = await supabase
      .from("usuario_custom")
      .select("id, senha_hash, ativo, deleted_at, email, auth_user_id")
      .eq("id", usuario_id)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      console.error("Erro consultando usuario_custom:", error);
      return fail("Erro interno", 500);
    }
    if (!usuario || !usuario.ativo) return fail("Usuário inválido", 404);

    const { ok: senhaCorreta } = await verifyPassword(senha_atual, usuario.senha_hash);
    if (!senhaCorreta) return fail("Senha atual incorreta", 401);

    const novoHash = await hashPassword(nova_senha);
    const { error: updateErr } = await supabase
      .from("usuario_custom")
      .update({
        senha_hash: novoHash,
        senha_provisoria: false,
        // limpa qualquer token de reset legado, just in case
        reset_token: null,
        reset_token_expira: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", usuario_id);

    if (updateErr) {
      console.error("Erro atualizando senha:", updateErr);
      return fail("Erro ao salvar nova senha", 500);
    }

    // Reflete a nova senha no Auth (best-effort — login se auto-cura se falhar)
    try {
      await atualizarSenhaAuth(supabase, {
        email: usuario.email,
        senha: nova_senha,
        authUserId: usuario.auth_user_id,
      });
    } catch (e) {
      console.error("[alterar-senha] sync Auth falhou (não-fatal):", (e as Error)?.message);
    }

    return ok({ message: "Senha alterada com sucesso", must_change_password: false });
  })
);
