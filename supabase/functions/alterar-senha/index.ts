/**
 * alterar-senha — usuário troca a própria senha
 *
 * Fluxo:
 *   1. Exige o access token do chamador (Authorization: Bearer) e identifica o
 *      usuário SÓ por ele (usuarioCustomDoCaller). usuario_id/email do corpo
 *      são ignorados — antes decidiam de quem era a senha conferida, o que
 *      virava um oráculo de senha ilimitado de qualquer conta com a anon key
 *      (e 404 × 401 revelava quem estava cadastrado).
 *   2. Recebe { senha_atual, nova_senha }; valida a política da nova senha
 *   3. Limite de senha atual errada por conta (5 a cada 15 min)
 *   4. Valida senha_atual com o hash do banco
 *   5. Atualiza senha_hash = bcrypt(nova) + senha_provisoria = false
 *   6. Sincroniza o Auth e encerra as OUTRAS sessões (a atual continua)
 *
 * Diferente do login-custom: este endpoint EXIGE conhecer a senha atual
 * (mesmo se a atual é provisória). Pra reset por admin sem conhecer a senha
 * atual, use redefinir-senha-admin.
 */

import { createAdminClient } from "../_shared/supabase-admin.ts";
import { verifyPassword, hashPassword } from "../_shared/passwords.ts";
import { preflightResponse, ok, fail, withCors } from "../_shared/cors.ts";
import { atualizarSenhaAuth } from "../_shared/auth-bridge.ts";
import { getCallerFromJWT, usuarioCustomDoCaller } from "../_shared/auth-jwt.ts";
import { jwtDaRequisicao, revogarSessoesAuth } from "../_shared/sessoes-auth.ts";
import {
  consumirTentativa,
  liberarTentativas,
  MSG_MUITAS_TENTATIVAS,
} from "../_shared/limite-tentativas.ts";

const JANELA_SEG = 15 * 60;
const MAX_ERROS_POR_CONTA = 5;

interface AlterarBody {
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

    const caller = await getCallerFromJWT(req);
    if (!caller) return fail("Sessão inválida ou expirada. Faça login novamente.", 401);

    let body: AlterarBody;
    try {
      body = await req.json();
    } catch {
      return fail("Payload inválido", 400);
    }

    const { senha_atual, nova_senha } = body;
    if (!senha_atual || !nova_senha) {
      return fail("senha_atual e nova_senha são obrigatórios", 400);
    }

    const politicaErro = validarPolitica(nova_senha);
    if (politicaErro) return fail(politicaErro, 400);

    if (senha_atual === nova_senha) {
      return fail("A nova senha precisa ser diferente da atual", 400);
    }

    const supabase = createAdminClient();

    let usuario;
    try {
      usuario = await usuarioCustomDoCaller(
        supabase,
        caller,
        "id, senha_hash, ativo, email, auth_user_id"
      );
    } catch (e) {
      console.error("[alterar-senha] consultando usuario_custom:", (e as Error)?.message);
      return fail("Erro interno", 500);
    }
    if (!usuario || !usuario.ativo) return fail("Usuário inválido", 403);

    const limite = await consumirTentativa(supabase, "alterar-senha", JANELA_SEG, [
      { tipo: "conta", valor: usuario.id, max: MAX_ERROS_POR_CONTA },
    ]);
    if (!limite.permitido) return fail(MSG_MUITAS_TENTATIVAS, 429);

    const { ok: senhaCorreta } = await verifyPassword(senha_atual, usuario.senha_hash);
    if (!senhaCorreta) return fail("Senha atual incorreta", 401);
    await liberarTentativas(supabase, limite);

    const novoHash = await hashPassword(nova_senha);
    const { error: updateErr } = await supabase
      .from("usuario_custom")
      .update({
        senha_hash: novoHash,
        senha_provisoria: false,
        // senha trocada invalida qualquer código de recuperação pendente
        reset_token: null,
        reset_token_expira: null,
        reset_tentativas: 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", usuario.id);

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

    // Outras sessões (outro navegador, sessão roubada) caem; esta continua
    try {
      await revogarSessoesAuth(supabase, {
        email: usuario.email,
        authUserId: usuario.auth_user_id,
        jwtAtual: jwtDaRequisicao(req),
      });
    } catch (e) {
      console.error("[alterar-senha] revogar outras sessões (não-fatal):", (e as Error)?.message);
    }

    return ok({ message: "Senha alterada com sucesso", must_change_password: false });
  })
);
