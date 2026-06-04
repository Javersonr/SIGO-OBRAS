/**
 * redefinir-senha-admin — admin reseta a senha de outro usuário
 *
 * Fluxo:
 *   1. Recebe { admin_id, alvo_id, nova_senha?, forcar_troca? }
 *      OU formato legacy { admin_id, usuario_email, nova_senha? }
 *   2. Confirma que admin_id existe, está ativo e tem privilégio (perfil
 *      "Admin"/"Owner" na mesma empresa do alvo, OU is_super_admin)
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
import { preflightResponse, ok, fail } from "../_shared/cors.ts";
import { atualizarSenhaAuth } from "../_shared/auth-bridge.ts";

interface RedefinirBody {
  admin_id?: string;
  alvo_id?: string;
  usuario_email?: string; // formato legacy — frontend antigo manda email do alvo
  nova_senha?: string;
  forcar_troca?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflightResponse();
  if (req.method !== "POST") return fail("Método não permitido", 405);

  let body: RedefinirBody;
  try {
    body = await req.json();
  } catch {
    return fail("Payload inválido", 400);
  }

  const { admin_id, alvo_id, usuario_email, nova_senha, forcar_troca } = body;
  if (!admin_id) return fail("admin_id é obrigatório", 400);
  if (!alvo_id && !usuario_email) {
    return fail("Informe alvo_id ou usuario_email do alvo", 400);
  }
  if (nova_senha && nova_senha.length < 6) {
    return fail("Nova senha deve ter no mínimo 6 caracteres", 400);
  }

  const supabase = createAdminClient();

  // 1. Carrega admin e alvo (alvo pode vir por id ou email)
  const alvoQuery = supabase
    .from("usuario_custom")
    .select("id, email, nome_completo, empresa_id, ativo, deleted_at, auth_user_id")
    .is("deleted_at", null);

  const [{ data: admin }, { data: alvo }] = await Promise.all([
    supabase
      .from("usuario_custom")
      .select("id, email, nome_completo, empresa_id, is_super_admin, ativo, deleted_at")
      .eq("id", admin_id)
      .is("deleted_at", null)
      .maybeSingle(),
    alvo_id
      ? alvoQuery.eq("id", alvo_id).maybeSingle()
      : alvoQuery.eq("email", (usuario_email || "").toLowerCase().trim()).maybeSingle(),
  ]);

  if (!admin || !admin.ativo) return fail("Admin inválido", 403);
  if (!alvo || !alvo.ativo) return fail("Usuário alvo inválido", 404);
  if (admin.id === alvo.id) {
    return fail("Use alterar-senha para mudar a própria senha", 400);
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
});
