/**
 * usuario-request — identifica o usuário SIGO da requisição.
 *
 * O frontend manda o JWT da sessão Supabase Auth (emitida pelo login-custom
 * via auth-bridge). Validamos o JWT e cruzamos com usuario_custom pelo
 * auth_user_id (usuarioCustomDoCaller) para saber quem é e se é super admin —
 * nunca só pelo e-mail do token, que um cadastro público no Auth pode repetir.
 * null = sem sessão válida.
 */
import { createAdminClient } from "./supabase-admin.ts";
import { getCallerFromJWT, usuarioCustomDoCaller } from "./auth-jwt.ts";

export async function usuarioDaRequisicao(
  req: Request
): Promise<{ email: string; is_super_admin: boolean; empresa_id: string | null } | null> {
  const caller = await getCallerFromJWT(req);
  if (!caller) return null;
  let uc;
  try {
    uc = await usuarioCustomDoCaller(createAdminClient(), caller, "email, is_super_admin, ativo");
  } catch (e) {
    console.error("[usuario-request] erro consultando usuario_custom:", (e as Error)?.message);
    return null;
  }
  if (!uc || !uc.ativo) return null;
  // empresa ATIVA da sessão (troca de empresa reemite o JWT com a nova)
  return { email: uc.email, is_super_admin: !!uc.is_super_admin, empresa_id: caller.empresa_id };
}
