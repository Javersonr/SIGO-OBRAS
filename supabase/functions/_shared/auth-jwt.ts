/**
 * auth-jwt — extrai e VALIDA o usuário chamador a partir do header
 * Authorization: Bearer <access_token> (o supabase-js anexa o token da sessão
 * em functions.invoke). Usa o admin client só para validar o token e ler o
 * app_metadata (empresa_id/perfil/is_super_admin).
 *
 * Para funções `--no-verify-jwt`: o gateway não valida o JWT, então validamos
 * aqui. Devolve null se não houver token de usuário válido (ex.: anon key).
 */
import { createAdminClient } from "./supabase-admin.ts";

export interface Caller {
  user_id: string;
  email: string | null;
  empresa_id: string | null;
  perfil: string | null;
  is_super_admin: boolean;
}

export async function getCallerFromJWT(req: Request): Promise<Caller | null> {
  const auth = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const admin = createAdminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;

  const meta = (data.user.app_metadata || {}) as Record<string, unknown>;
  return {
    user_id: data.user.id,
    email: data.user.email ?? null,
    empresa_id: (meta.empresa_id as string) ?? null,
    perfil: (meta.perfil as string) ?? null,
    is_super_admin: meta.is_super_admin === true,
  };
}

/**
 * Linha de usuario_custom do chamador autenticado (ou null). Casa pelo
 * auth_user_id que a ponte grava no login. Fallback por e-mail só quando esse
 * vínculo ainda não foi gravado E o auth user foi provisionado pela ponte
 * (app_metadata.empresa_id só é escrito com service role) — assim um cadastro
 * público no Auth com o e-mail de outra pessoa não herda a identidade dela.
 * `campos` deve incluir o que o chamador precisa (ativo, email, ...).
 */
export async function usuarioCustomDoCaller(
  // deno-lint-ignore no-explicit-any
  admin: any,
  caller: Caller,
  campos: string
  // deno-lint-ignore no-explicit-any
): Promise<any | null> {
  const { data: porAuthId, error } = await admin
    .from("usuario_custom")
    .select(campos)
    .eq("auth_user_id", caller.user_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (porAuthId) return porAuthId;

  if (!caller.email || !caller.empresa_id) return null;
  const { data: porEmail, error: errEmail } = await admin
    .from("usuario_custom")
    .select(campos)
    .eq("email", caller.email.toLowerCase())
    .is("auth_user_id", null)
    .is("deleted_at", null)
    .maybeSingle();
  if (errEmail) throw errEmail;
  return porEmail ?? null;
}

/**
 * Resolve o empresa_id efetivo de uma chamada: super admin pode operar em
 * qualquer empresa (usa o empresa_id do body, se vier); demais perfis ficam
 * SEMPRE presos à empresa do próprio JWT (fecha cross-tenant via body).
 */
export function empresaIdEfetivo(caller: Caller, bodyEmpresaId?: unknown): string | null {
  if (caller.is_super_admin && bodyEmpresaId) return String(bodyEmpresaId);
  return caller.empresa_id;
}
