/**
 * trocar-empresa — usuário multi-empresa troca a empresa ativa da sessão.
 *
 * Fluxo:
 *   1. Exige o access token do chamador (Authorization: Bearer) e identifica o
 *      usuário SÓ por ele. Recebe { empresa_id } no corpo; usuario_id/email do
 *      corpo são ignorados (antes eles decidiam de quem era a sessão emitida).
 *   2. Carrega usuario_custom do chamador e valida vínculo ativo com a empresa
 *      alvo (usuario_empresa). Super admin pode trocar p/ qualquer empresa ativa.
 *   3. Atualiza app_metadata.empresa_id/perfil no auth.users (não mexe na senha).
 *   4. Emite uma sessão NOVA (sem senha, via magic link admin-side) já com o
 *      novo empresa_id no JWT, e devolve { usuario, session }.
 *
 * Best-effort na emissão de sessão: se falhar, devolve needs_refresh=true para o
 * front chamar supabase.auth.refreshSession() (o refresh relê o app_metadata).
 *
 * Segurança: service role + --no-verify-jwt (o gateway não valida o JWT), então
 * a validação do token é feita aqui via getCallerFromJWT.
 */

import { createAdminClient } from "../_shared/supabase-admin.ts";
import { preflightResponse, ok, fail, withCors } from "../_shared/cors.ts";
import { atualizarAppMetadataEmpresa, emitirSessaoSemSenha } from "../_shared/auth-bridge.ts";
import { getCallerFromJWT, usuarioCustomDoCaller } from "../_shared/auth-jwt.ts";
import { mapaLogosAssinados } from "../_shared/logos-assinados.ts";

interface TrocarBody {
  empresa_id?: string;
}

Deno.serve(
  withCors(async (req) => {
    if (req.method === "OPTIONS") return preflightResponse();
    if (req.method !== "POST") return fail("Método não permitido", 405);

    const caller = await getCallerFromJWT(req);
    if (!caller) return fail("Sessão inválida ou expirada. Faça login novamente.", 401);

    let body: TrocarBody;
    try {
      body = await req.json();
    } catch {
      return fail("Payload inválido", 400);
    }

    const empresaId = String(body.empresa_id ?? "").trim();
    if (!empresaId) return fail("Informe empresa_id", 400);

    const supabase = createAdminClient();

    // 1. Carrega o usuário do TOKEN (nunca do corpo)
    let usuario;
    try {
      usuario = await usuarioCustomDoCaller(
        supabase,
        caller,
        "id, email, nome_completo, empresa_id, is_super_admin, ativo, deleted_at, auth_user_id"
      );
    } catch (userErr) {
      console.error("Erro consultando usuario_custom:", userErr);
      return fail("Erro interno", 500);
    }
    if (!usuario || !usuario.ativo) return fail("Usuário inválido", 403);
    // O magic link do passo 4 é gerado pelo e-mail: ele tem que ser o do auth
    // user do token, senão a sessão emitida seria de outra conta.
    if ((caller.email ?? "").toLowerCase() !== String(usuario.email).toLowerCase()) {
      console.error("[trocar-empresa] e-mail do token diverge de usuario_custom", usuario.id);
      return fail("Usuário inválido", 403);
    }

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

    // Logo já assinado (mapa por id, no nível de cima da resposta — nunca dentro
    // do objeto empresa) para quem ainda não tem sessão com o novo empresa_id.
    const logos_assinados = await mapaLogosAssinados(supabase, [
      { id: empresa.id, logo_url: empresa.logo_url, empresasPermitidas: [empresa.id] },
    ]);

    const perfil = vinc?.perfil ?? "Admin";

    // 3. Atualiza app_metadata no Auth (sem mexer na senha) — o auth user é o
    //    do próprio token.
    try {
      await atualizarAppMetadataEmpresa(supabase, {
        authUserId: caller.user_id,
        empresa_id: empresa.id,
        perfil,
        is_super_admin: !!usuario.is_super_admin,
      });
    } catch (e) {
      console.error("[trocar-empresa] falha ao atualizar app_metadata:", (e as Error)?.message);
      return fail("Não foi possível atualizar a sessão", 500);
    }

    // Persiste auth_user_id se o vínculo ainda não estava gravado
    if (usuario.auth_user_id !== caller.user_id) {
      await supabase
        .from("usuario_custom")
        .update({ auth_user_id: caller.user_id })
        .eq("id", usuario.id);
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

    // 4. Emite sessão nova já com o empresa_id atualizado (best-effort)
    let session = null;
    try {
      session = await emitirSessaoSemSenha(supabase, caller.email as string);
    } catch (e) {
      console.error("[trocar-empresa] falha ao emitir sessão:", (e as Error)?.message);
      return ok({ usuario: usuarioResp, session: null, needs_refresh: true, logos_assinados });
    }

    return ok({ usuario: usuarioResp, session, logos_assinados });
  })
);
