/**
 * redefinir-senha-admin — admin reseta a senha de outro usuário
 *
 * Fluxo:
 *   1. Exige o access token do chamador (Authorization: Bearer): o ADMIN é o
 *      dono do token. Recebe { alvo_id, nova_senha?, forcar_troca? } OU o
 *      formato legacy { usuario_email, nova_senha? }. `admin_id` do corpo é
 *      ignorado (antes decidia quem era o admin — qualquer um se passava por ele).
 *   2. Confirma que o admin está ativo e tem privilégio (perfil "Admin"/Owner
 *      na mesma empresa do alvo, OU is_super_admin). Só super admin redefine a
 *      senha de outro super admin.
 *   3. Se `nova_senha` vier: usa ela (deve ter >= 6 chars)
 *      Se não vier: gera senha aleatória de 12 chars
 *   4. Salva senha_hash + senha_provisoria conforme `forcar_troca`
 *      (default true se senha aleatória; default false se admin escolheu)
 *   5. Retorna { success, senha_provisoria, alvo_email }
 *
 * Log: registra na audit_log toda operação.
 */

import { createAdminClient } from "../_shared/supabase-admin.ts";
import { hashPassword, generateProvisionalPassword } from "../_shared/passwords.ts";
import { preflightResponse, ok, fail, withCors } from "../_shared/cors.ts";
import { atualizarSenhaAuth } from "../_shared/auth-bridge.ts";
import { revogarSessoesAuth } from "../_shared/sessoes-auth.ts";
import { getCallerFromJWT, usuarioCustomDoCaller } from "../_shared/auth-jwt.ts";

interface RedefinirBody {
  alvo_id?: string;
  usuario_email?: string; // formato legacy — frontend antigo manda email do alvo
  nova_senha?: string;
  forcar_troca?: boolean;
}

Deno.serve(
  withCors(async (req) => {
    if (req.method === "OPTIONS") return preflightResponse();
    if (req.method !== "POST") return fail("Método não permitido", 405);

    const caller = await getCallerFromJWT(req);
    if (!caller) return fail("Sessão inválida ou expirada. Faça login novamente.", 401);

    let body: RedefinirBody;
    try {
      body = await req.json();
    } catch {
      return fail("Payload inválido", 400);
    }

    const { alvo_id, usuario_email, nova_senha, forcar_troca } = body;
    if (!alvo_id && !usuario_email) {
      return fail("Informe alvo_id ou usuario_email do alvo", 400);
    }
    if (nova_senha && nova_senha.length < 6) {
      return fail("Nova senha deve ter no mínimo 6 caracteres", 400);
    }

    const supabase = createAdminClient();

    // 1. Carrega admin (do TOKEN, nunca do corpo) e alvo (por id ou email)
    const alvoQuery = supabase
      .from("usuario_custom")
      .select(
        "id, email, nome_completo, empresa_id, is_super_admin, ativo, deleted_at, auth_user_id"
      )
      .is("deleted_at", null);

    let admin;
    let alvo;
    try {
      const [adminDoToken, { data: alvoData }] = await Promise.all([
        usuarioCustomDoCaller(
          supabase,
          caller,
          "id, email, nome_completo, empresa_id, is_super_admin, ativo, deleted_at, auth_user_id"
        ),
        alvo_id
          ? alvoQuery.eq("id", alvo_id).maybeSingle()
          : alvoQuery.eq("email", (usuario_email || "").toLowerCase().trim()).maybeSingle(),
      ]);
      admin = adminDoToken;
      alvo = alvoData;
    } catch (e) {
      console.error("[redefinir-senha-admin] erro carregando usuários:", (e as Error)?.message);
      return fail("Erro interno", 500);
    }

    if (!admin || !admin.ativo) return fail("Admin inválido", 403);
    if (!alvo || !alvo.ativo) return fail("Usuário alvo inválido", 404);
    if (admin.id === alvo.id) {
      return fail("Use alterar-senha para mudar a própria senha", 400);
    }

    // Admin comum não mexe na senha de super admin (seria tomar a conta dele)
    if (alvo.is_super_admin === true && admin.is_super_admin !== true) {
      return fail("Sem permissão para redefinir senha deste usuário", 403);
    }

    // 2. Verifica privilégios do admin
    let autorizado = admin.is_super_admin === true;

    if (!autorizado) {
      // Admin precisa ter perfil Admin/Owner na empresa do alvo
      const { data: vinculo } = await supabase
        .from("usuario_empresa")
        .select("perfil, is_owner")
        .eq("usuario_email", admin.email)
        .eq("empresa_id", alvo.empresa_id)
        .eq("ativo", true)
        .is("deleted_at", null)
        .maybeSingle();

      autorizado = !!(vinculo && (vinculo.is_owner || vinculo.perfil === "Admin"));
    }

    if (!autorizado) {
      return fail("Sem permissão para redefinir senha deste usuário", 403);
    }

    // 3. Define a senha: usa a que o admin enviou, ou gera aleatória
    //    - Senha enviada pelo admin → senha_provisoria respeita forcar_troca (default false)
    //    - Senha gerada pelo sistema → senha_provisoria = true (sempre força trocar)
    const senhaEnviada = (nova_senha || "").trim();
    const usouSenhaCustomizada = senhaEnviada.length >= 6;
    const novaSenha = usouSenhaCustomizada ? senhaEnviada : generateProvisionalPassword();
    const flagProvisoria = usouSenhaCustomizada ? Boolean(forcar_troca) : true;
    const novoHash = await hashPassword(novaSenha);

    // 4. Atualiza alvo
    const { error: updateErr } = await supabase
      .from("usuario_custom")
      .update({
        senha_hash: novoHash,
        senha_provisoria: flagProvisoria,
        reset_token: null,
        reset_token_expira: null,
        reset_tentativas: 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", alvo.id);

    if (updateErr) {
      console.error("Erro redefinindo senha:", updateErr);
      return fail("Erro ao redefinir senha", 500);
    }

    // Reflete a nova senha no Auth (best-effort — login se auto-cura se falhar)
    try {
      await atualizarSenhaAuth(supabase, {
        email: alvo.email,
        senha: novaSenha,
        authUserId: alvo.auth_user_id,
      });
    } catch (e) {
      console.error("[redefinir-senha-admin] sync Auth falhou (não-fatal):", (e as Error)?.message);
    }

    // Senha redefinida = sessões abertas do alvo caem (quem estava com a conta
    // dele, inclusive por sessão roubada, precisa da senha nova)
    try {
      await revogarSessoesAuth(supabase, {
        email: alvo.email,
        authUserId: alvo.auth_user_id,
        senhaNova: novaSenha,
      });
    } catch (e) {
      console.error("[redefinir-senha-admin] revogar sessões (não-fatal):", (e as Error)?.message);
    }

    // 5. Audit log (best-effort, não bloqueia o sucesso)
    try {
      await supabase.from("audit_log").insert({
        empresa_id: alvo.empresa_id,
        tipo_acao: "redefinir_senha",
        entidade: "usuario_custom",
        entidade_id: alvo.id,
        descricao: usouSenhaCustomizada
          ? `Admin ${admin.email} redefiniu a senha de ${alvo.email} (senha customizada, forcar_troca=${flagProvisoria})`
          : `Admin ${admin.email} redefiniu a senha de ${alvo.email} (senha aleatória gerada)`,
        usuario_email: admin.email,
      });
    } catch (e) {
      console.warn("Falha ao gravar audit_log (não-fatal):", e);
    }

    return ok({
      // Compatibilidade: nome legado + nome novo
      senha_provisoria: usouSenhaCustomizada ? null : novaSenha,
      senha_gerada: usouSenhaCustomizada ? null : novaSenha,
      senha_definida_admin: usouSenhaCustomizada,
      forcar_troca: flagProvisoria,
      alvo_email: alvo.email,
      alvo_nome: alvo.nome_completo,
      message: usouSenhaCustomizada
        ? `Senha redefinida pelo admin. ${flagProvisoria ? "Usuário precisará trocar no primeiro acesso." : "Usuário já pode entrar com esta senha."}`
        : "Senha aleatória gerada. Entregue ao usuário por canal seguro. Será obrigado a trocar no primeiro acesso.",
    });
  })
);
