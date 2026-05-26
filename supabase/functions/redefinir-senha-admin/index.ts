/**
 * redefinir-senha-admin — admin reseta a senha de outro usuário
 *
 * Fluxo:
 *   1. Recebe { admin_id, alvo_id }
 *   2. Confirma que admin_id existe, está ativo e tem privilégio (perfil
 *      "Admin"/"Owner" na mesma empresa do alvo, OU is_super_admin)
 *   3. Gera senha provisória de 12 chars (lib local)
 *   4. Salva senha_hash = bcrypt(provisoria) + senha_provisoria = true no alvo
 *   5. Retorna { success, senha_provisoria } — só o admin vê a senha em texto;
 *      ele entrega ao usuário por canal seguro (presencial/WhatsApp)
 *
 * Log: registra na audit_log toda operação (admin_id, alvo_id, timestamp).
 */

import { createAdminClient } from "../_shared/supabase-admin.ts";
import { hashPassword, generateProvisionalPassword } from "../_shared/passwords.ts";
import { preflightResponse, ok, fail } from "../_shared/cors.ts";

interface RedefinirBody {
  admin_id?: string;
  alvo_id?: string;
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

  const { admin_id, alvo_id } = body;
  if (!admin_id || !alvo_id) {
    return fail("admin_id e alvo_id são obrigatórios", 400);
  }
  if (admin_id === alvo_id) {
    return fail("Use alterar-senha para mudar a própria senha", 400);
  }

  const supabase = createAdminClient();

  // 1. Carrega admin e alvo
  const [{ data: admin }, { data: alvo }] = await Promise.all([
    supabase
      .from("usuario_custom")
      .select("id, email, nome_completo, empresa_id, is_super_admin, ativo, deleted_at")
      .eq("id", admin_id)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("usuario_custom")
      .select("id, email, nome_completo, empresa_id, ativo, deleted_at")
      .eq("id", alvo_id)
      .is("deleted_at", null)
      .maybeSingle(),
  ]);

  if (!admin || !admin.ativo) return fail("Admin inválido", 403);
  if (!alvo || !alvo.ativo) return fail("Usuário alvo inválido", 404);

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

  // 3. Gera senha provisória
  const novaSenha = generateProvisionalPassword();
  const novoHash = await hashPassword(novaSenha);

  // 4. Atualiza alvo
  const { error: updateErr } = await supabase
    .from("usuario_custom")
    .update({
      senha_hash: novoHash,
      senha_provisoria: true,
      reset_token: null,
      reset_token_expira: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", alvo_id);

  if (updateErr) {
    console.error("Erro redefinindo senha:", updateErr);
    return fail("Erro ao redefinir senha", 500);
  }

  // 5. Audit log (best-effort, não bloqueia o sucesso)
  try {
    await supabase.from("audit_log").insert({
      empresa_id: alvo.empresa_id,
      tipo_acao: "redefinir_senha",
      entidade: "usuario_custom",
      entidade_id: alvo_id,
      descricao: `Admin ${admin.email} redefiniu a senha de ${alvo.email}`,
      usuario_email: admin.email,
    });
  } catch (e) {
    console.warn("Falha ao gravar audit_log (não-fatal):", e);
  }

  return ok({
    senha_provisoria: novaSenha,
    alvo_email: alvo.email,
    alvo_nome: alvo.nome_completo,
    message:
      "Senha redefinida. Entregue esta senha ao usuário por canal seguro. Ele será obrigado a trocar no primeiro acesso.",
  });
});
