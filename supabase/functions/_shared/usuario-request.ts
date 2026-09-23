/**
 * usuario-request — identifica o usuário SIGO da requisição.
 *
 * O frontend manda o JWT da sessão Supabase Auth (emitida pelo login-custom
 * via auth-bridge). Validamos o JWT e cruzamos com usuario_custom para saber
 * quem é e se é super admin. null = sem sessão válida.
 */
import { createAdminClient } from "./supabase-admin.ts";

export async function usuarioDaRequisicao(
  req: Request
): Promise<{ email: string; is_super_admin: boolean } | null> {
  const auth = req.headers.get("Authorization") ?? "";
  const jwt = auth.replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const supabase = createAdminClient();
  const { data, error } = await supabase.auth.getUser(jwt);
  const email = data?.user?.email?.toLowerCase();
  if (error || !email) return null;
  const { data: uc } = await supabase
    .from("usuario_custom")
    .select("email, is_super_admin, ativo")
    .eq("email", email)
    .is("deleted_at", null)
    .maybeSingle();
  if (!uc || !uc.ativo) return null;
  return { email: uc.email, is_super_admin: !!uc.is_super_admin };
}
