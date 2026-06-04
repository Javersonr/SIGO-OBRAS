// deno-lint-ignore-file no-explicit-any
/**
 * resolverStatusOportunidade — devolve { status_id, status_nome } para uma nova
 * oportunidade.
 *
 * O Kanban de Oportunidades agrupa por `status_id`. Ao converter uma licitação,
 * gravava-se só `status_nome` (ex.: "Triagem Licitação") e `status_id` ficava
 * NULL → a oportunidade sumia do funil (aparecia só na Lista). Aqui resolvemos
 * o id real:
 *   1. tenta casar pelo nome desejado (config);
 *   2. senão, usa o 1º status "aberto" do funil (menor ordem);
 *   3. se a empresa não tiver status nenhum, devolve status_id null (sem quebrar).
 */
export async function resolverStatusOportunidade(
  supabase: any,
  empresaId: string,
  nomeDesejado?: string | null
): Promise<{ status_id: string | null; status_nome: string | null }> {
  if (nomeDesejado) {
    const { data } = await supabase
      .from("status_oportunidade")
      .select("id, nome")
      .eq("empresa_id", empresaId)
      .is("deleted_at", null)
      .ilike("nome", nomeDesejado)
      .limit(1);
    if (data && data.length > 0) {
      return { status_id: data[0].id, status_nome: data[0].nome };
    }
  }

  const { data: aberto } = await supabase
    .from("status_oportunidade")
    .select("id, nome")
    .eq("empresa_id", empresaId)
    .is("deleted_at", null)
    .eq("tipo", "aberto")
    .order("ordem", { ascending: true })
    .limit(1);
  if (aberto && aberto.length > 0) {
    return { status_id: aberto[0].id, status_nome: aberto[0].nome };
  }

  return { status_id: null, status_nome: nomeDesejado ?? null };
}
