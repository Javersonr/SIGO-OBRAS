/**
 * trocar-empresa — usuário multi-empresa troca a empresa ativa da sessão.
 *
 * Fluxo:
 *   1. Recebe { usuario_id (ou email), empresa_id }
 *   2. Carrega usuario_custom e valida vínculo ativo com a empresa alvo
 *      (usuario_empresa). Super admin pode trocar p/ qualquer empresa ativa.
 *   3. Atualiza app_metadata.empresa_id/perfil no auth.users (não mexe na senha).
 *   4. Emite uma sessão NOVA (sem senha, via magic link admin-side) já com o
 *      novo empresa_id no JWT, e devolve { usuario, session }.
 *
 * Best-effort na emissão de sessão: se falhar, devolve needs_refresh=true para o
 * front chamar supabase.auth.refreshSession() (o refresh relê o app_metadata).
 * Se ainda não existir espelho no Auth, devolve needs_relogin=true.
 *
 * Segurança: hoje usa service role + --no-verify-jwt (igual login-custom). A
 * checagem de "o chamador é mesmo esse usuário" entra na Etapa 4 (validar JWT).
 */

import { createAdminClient } from "../_shared/supabase-admin.ts";
import { preflightResponse, ok, fail } from "../_shared/cors.ts";
import { atualizarAppMetadataEmpresa, emitirSessaoSemSenha } from "../_shared/auth-bridge.ts";

interface TrocarBody {
  usuario_id?: string;
  email?: string;
  empresa_id?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflightResponse();
  if (req.method !== "POST") return fail("Método não permitido", 405);

  let body: TrocarBody;
  try {
    body = await req.json();
  } catch {
    return fail("Payload inválido", 400);
  }

  const empresaId = (body.empresa_id ?? "").trim();
  const emailBody = (body.email ?? "").trim().toLowerCase();
  if (!empresaId || (!body.usuario_id && !emailBody)) {
    return fail("Informe usuario_id (ou email) e empresa_id", 400);
  }

  const supabase = createAdminClient();

  // 1. Carrega o usuário
  const userQuery = supabase
    .from("usuario_custom")
    .select("id, email, nome_completo, empresa_id, is_super_admin, ativo, deleted_at, auth_user_id")
    .is("deleted_at", null);
  const { data: usuario, error: userErr } = await (body.usuario_id
    ? userQuery.eq("id", body.usuario_id).maybeSingle()
    : userQuery.eq("email", emailBody).maybeSingle());

  if (userErr) {
    console.error("Erro consultando usuario_custom:", userErr);
    return fail("Erro interno", 500);
  }
  if (!usuario || !usuario.ativo) return fail("Usuário inválido", 404);

  // 2. Valida vínculo com a empresa alvo (super admin dispensa vínculo)
  const { data: vinc } = await supabase
    .from("usuario_empresa")
    .select("perfil, is_owner, grupo_id, ativo, deleted_at")
    .eq("usuario_email", usuario.email)
    .eq("empresa_id", empresaId)
    .eq("ativo", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (!vinc && !usuario.is_super_admin) {
    return fail("Empresa não está vinculada ao usuário", 403);
  }

  const { data: empresa } = await supabase
    .from("empresa")
    .select(
      "id, nome, nome_fantasia, razao_social, cnpj, logo_url, tema_cores, is_holding, grupo_id, ativo"
    )
    .eq("id", empresaId)
    .maybeSingle();

  if (!empresa || !empresa.ativo) return fail("Empresa inativa ou inexistente", 403);

  const perfil = vinc?.perfil ?? "Admin";

  // 3. Atualiza app_metadata no Auth (sem mexer na senha)
  let authUserId: string | null = null;
  try {
    authUserId = await atualizarAppMetadataEmpresa(supabase, {
      email: usuario.email,
      authUserId: usuario.auth_user_id,
      empresa_id: empresa.id,
      perfil,
      is_super_admin: !!usuario.is_super_admin,
    });
  } catch (e) {
    console.error("[trocar-empresa] falha ao atualizar app_metadata:", (e as Error)?.message);
    return fail("Não foi possível atualizar a sessão", 500);
  }

  const usuarioResp = {
    id: usuario.id,
    email: usuario.email,
    nome_completo: usuario.nome_completo,
    empresa_id: empresa.id,
    empresa_nome: empresa.nome,
    empresa,
    perfil,
    is_owner: vinc?.is_owner ?? false,
    is_super_admin: !!usuario.is_super_admin,
    grupo_id: vinc?.grupo_id ?? empresa.grupo_id ?? null,
  };

  // Sem espelho no Auth ainda → front precisa relogar pra ter sessão
  if (!authUserId) {
    return ok({ usuario: usuarioResp, session: null, needs_relogin: true });
  }

  // Persiste auth_user_id se descobrimos agora
  if (authUserId !== usuario.auth_user_id) {
    await supabase.from("usuario_custom").update({ auth_user_id: authUserId }).eq("id", usuario.id);
  }

  // 4. Emite sessão nova já com o empresa_id atualizado (best-effort)
  let session = null;
  try {
    session = await emitirSessaoSemSenha(supabase, usuario.email);
  } catch (e) {
    console.error("[trocar-empresa] falha ao emitir sessão:", (e as Error)?.message);
    return ok({ usuario: usuarioResp, session: null, needs_refresh: true });
  }

  return ok({ usuario: usuarioResp, session });
});
