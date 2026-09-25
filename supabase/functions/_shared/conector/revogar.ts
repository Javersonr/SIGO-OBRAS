/**
 * Revogação de acesso do conector do Claude. Sem imports por URL (testável no
 * Node). Revogar a autorização derruba todas as chaves dela na hora — o mcp
 * confere a autorização a cada chamada.
 */

// deno-lint-ignore no-explicit-any
type Admin = any;

export async function revogarAutorizacao(
  admin: Admin,
  autorizacaoId: string,
  motivo: string
): Promise<void> {
  const agora = new Date().toISOString();
  const { error } = await admin
    .from("conector_autorizacao")
    .update({ revogado_em: agora, revogado_motivo: motivo })
    .eq("id", autorizacaoId)
    .is("revogado_em", null);
  if (error) throw new Error(error.message);
  const { error: e2 } = await admin
    .from("conector_chave")
    .update({ revogada_em: agora })
    .eq("autorizacao_id", autorizacaoId)
    .is("revogada_em", null);
  if (e2) throw new Error(e2.message);
}

/** Senha trocada/redefinida → todas as conexões do Claude do usuário caem. */
export async function revogarConectorDoUsuario(
  admin: Admin,
  usuarioCustomId: string,
  motivo: string
): Promise<number> {
  const agora = new Date().toISOString();
  const { data, error } = await admin
    .from("conector_autorizacao")
    .update({ revogado_em: agora, revogado_motivo: motivo })
    .eq("usuario_custom_id", usuarioCustomId)
    .is("revogado_em", null)
    .select("id");
  if (error) throw new Error(error.message);
  const ids = ((data ?? []) as { id: string }[]).map((r) => r.id);
  if (ids.length) {
    const { error: e2 } = await admin
      .from("conector_chave")
      .update({ revogada_em: agora })
      .in("autorizacao_id", ids)
      .is("revogada_em", null);
    if (e2) throw new Error(e2.message);
  }
  return ids.length;
}
