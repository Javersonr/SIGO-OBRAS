/**
 * sessoes-auth — derruba as sessões do Supabase Auth depois de troca ou
 * redefinição de senha: quem roubou uma sessão (ou conhecia a senha antiga)
 * perde o refresh token. O access token já emitido segue aceito pelo PostgREST
 * até expirar (JWT sem estado, ~1h); getCallerFromJWT já o recusa, pois
 * consulta o Auth, que não acha mais a sessão.
 *
 * Quando atualizarSenhaAuth dá certo o próprio Auth já fez logout geral (o
 * GoTrue encerra todas as sessões em toda troca de senha pelo admin — por isso
 * cada login-custom também derruba as sessões anteriores). Esta função garante
 * o mesmo quando a sincronização falhou: o Auth só encerra sessões a partir de
 * um token do próprio usuário, então emitimos uma sessão descartável (senha
 * nova; fallback magic link admin-side, sem e-mail) e encerramos TODAS
 * (scope "global"), inclusive ela.
 *
 * Best-effort: o chamador envolve em try/catch e só registra o erro — a senha
 * já foi trocada e isso não pode virar falha para o usuário.
 */
import { emitirSessao, emitirSessaoSemSenha, findAuthUserIdByEmail } from "./auth-bridge.ts";

export async function revogarSessoesAuth(
  // deno-lint-ignore no-explicit-any
  admin: any,
  opts: {
    email: string;
    authUserId?: string | null;
    senhaNova?: string;
  }
): Promise<void> {
  const id = opts.authUserId || (await findAuthUserIdByEmail(admin, opts.email));
  if (!id) return; // sem espelho no Auth = nenhuma sessão emitida

  // E-mail do PRÓPRIO auth user (o vínculo é por id; o e-mail do cadastro
  // pode divergir e aí encerraríamos as sessões de outra conta).
  const { data: alvo, error: errAlvo } = await admin.auth.admin.getUserById(id);
  if (errAlvo) throw errAlvo;
  const emailAuth = alvo?.user?.email;
  if (!emailAuth) throw new Error("usuário do Auth sem e-mail");

  // deno-lint-ignore no-explicit-any
  let sessao: any = null;
  if (opts.senhaNova) {
    try {
      sessao = await emitirSessao(emailAuth, opts.senhaNova);
    } catch {
      // senha do Auth não sincronizou — tenta sem senha
    }
  }
  if (!sessao) sessao = await emitirSessaoSemSenha(admin, emailAuth);
  if (!sessao?.access_token || sessao.user?.id !== id) {
    throw new Error("sessão descartável não pertence ao usuário alvo");
  }

  const { error } = await admin.auth.admin.signOut(sessao.access_token, "global");
  if (error) throw error;
}
