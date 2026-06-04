// deno-lint-ignore-file no-explicit-any
/**
 * Dedup CROSS-SOURCE de licitações.
 *
 * O Alerta e o PNCP geram `id_licitacao` diferentes para a MESMA licitação real
 * (ex.: "117900" no Alerta vs "PNCP-cnpj-ano-seq" no PNCP). A trava por
 * (empresa_id, id_licitacao) impede re-inserir a mesma da MESMA fonte, mas não
 * pega a duplicata da OUTRA fonte — então a mesma licitação aparecia 2× (uma
 * por fonte) ou "voltava" depois de excluída.
 *
 * Identidade de conteúdo: municipio_ibge + abertura + valor (os 3 presentes e
 * exatos). Conservador: só casa quando os 3 batem, então o risco de esconder
 * uma licitação genuinamente diferente é baixo.
 */

const contentKey = (r: any): string | null =>
  r && r.municipio_ibge && r.abertura && r.valor != null
    ? `${r.municipio_ibge}|${r.abertura}|${Number(r.valor)}`
    : null;

/**
 * Remove dos candidatos a inserir aqueles cujo conteúdo já existe para a empresa
 * em QUALQUER status (Nova/Em análise/Convertida/Excluída) — evita criar a
 * duplicata da outra fonte e evita que uma excluída "volte".
 */
export async function filtrarConteudoDuplicado(
  supabase: any,
  empresaId: string,
  rows: any[]
): Promise<any[]> {
  if (!rows || rows.length === 0) return rows;
  const ibges = [...new Set(rows.map((r) => r.municipio_ibge).filter(Boolean))];
  if (ibges.length === 0) return rows;

  const { data: existentes } = await supabase
    .from("licitacao_encontrada")
    .select("municipio_ibge, abertura, valor")
    .eq("empresa_id", empresaId)
    .is("deleted_at", null)
    .in("municipio_ibge", ibges);

  const existKeys = new Set((existentes || []).map(contentKey).filter(Boolean));
  if (existKeys.size === 0) return rows;

  return rows.filter((r) => {
    const k = contentKey(r);
    return !k || !existKeys.has(k);
  });
}

/**
 * Devolve os IDs de "Nova" REDUNDANTES por conteúdo (limpa duplicatas que já
 * entraram). Regra:
 *   - se o conteúdo também existe em outro status (Em análise/Convertida/
 *     Excluída), remove TODAS as Novas daquele conteúdo (a versão "boa" já está
 *     em outro status);
 *   - se só há Novas duplicadas, mantém a mais antiga e remove o resto.
 * Nunca remove o que não é "Nova".
 */
export async function idsNovasDuplicadas(supabase: any, empresaId: string): Promise<string[]> {
  const { data: rows } = await supabase
    .from("licitacao_encontrada")
    .select("id, status, municipio_ibge, abertura, valor, created_at")
    .eq("empresa_id", empresaId)
    .is("deleted_at", null)
    .limit(20000);

  const groups = new Map<string, any[]>();
  for (const r of rows || []) {
    const k = contentKey(r);
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }

  const remover: string[] = [];
  for (const grp of groups.values()) {
    if (grp.length < 2) continue;
    const novas = grp.filter((r) => r.status === "Nova");
    if (novas.length === 0) continue;
    const temNaoNova = grp.some((r) => r.status !== "Nova");
    if (temNaoNova) {
      for (const n of novas) remover.push(n.id);
    } else {
      novas.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
      for (const n of novas.slice(1)) remover.push(n.id);
    }
  }
  return remover;
}
