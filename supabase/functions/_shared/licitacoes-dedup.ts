// deno-lint-ignore-file no-explicit-any
/**
 * Dedup CROSS-SOURCE de licitações.
 *
 * O Alerta e o PNCP geram `id_licitacao` diferentes para a MESMA licitação real
 * (ex.: "117900" no Alerta vs "PNCP-cnpj-ano-seq" no PNCP). A trava por
 * (empresa_id, id_licitacao) impede re-inserir a mesma da MESMA fonte, mas não
 * pega a duplicata da OUTRA fonte. Resultado: o usuário exclui a versão de uma
 * fonte e, ao clicar em "Buscar agora", a outra fonte re-traz a "mesma"
 * licitação como Nova.
 *
 * Aqui removemos dos candidatos a inserir aquelas cujo CONTEÚDO
 * (municipio_ibge + abertura + valor — os 3 presentes e exatos) já existe em
 * status TERMINAL (Excluída ou Convertida) para a empresa. Conservador: só pega
 * quando os 3 campos batem exatamente, então o risco de esconder uma licitação
 * genuinamente diferente é baixo; e só afeta o que o usuário já excluiu/converteu.
 */

const contentKey = (r: any): string | null =>
  r && r.municipio_ibge && r.abertura && r.valor != null
    ? `${r.municipio_ibge}|${r.abertura}|${Number(r.valor)}`
    : null;

export async function filtrarTerminaisDuplicados(
  supabase: any,
  empresaId: string,
  rows: any[]
): Promise<any[]> {
  if (!rows || rows.length === 0) return rows;
  const ibges = [...new Set(rows.map((r) => r.municipio_ibge).filter(Boolean))];
  if (ibges.length === 0) return rows;

  const { data: terminais } = await supabase
    .from("licitacao_encontrada")
    .select("municipio_ibge, abertura, valor")
    .eq("empresa_id", empresaId)
    .in("status", ["Excluída", "Convertida"])
    .in("municipio_ibge", ibges);

  const terminalKeys = new Set((terminais || []).map(contentKey).filter(Boolean));
  if (terminalKeys.size === 0) return rows;

  return rows.filter((r) => {
    const k = contentKey(r);
    return !k || !terminalKeys.has(k);
  });
}
