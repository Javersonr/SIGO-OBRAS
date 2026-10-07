/**
 * Leitura de uma tabela inteira, página por página — pura, sem rede própria (a consulta vem de fora).
 *
 * O PostgREST corta QUALQUER resposta em 1000 linhas. `lerEmPaginas` repete a consulta com `.range()` até
 * a página vir incompleta. Serve para ler só as colunas que a tela precisa (o SDK `sigo.entities` traz
 * sempre `select *`, e a tabela de tentativas guarda a prova inteira em `jsonb`).
 *
 * Quem usa: components/seguranca/TreinamentosEadTab.jsx (progresso e tentativas da empresa, que não têm
 * `deleted_at`). Os testes ficam em leitura-em-paginas.test.js.
 */

export const TAMANHO_DA_PAGINA = 1000;
export const MAX_PAGINAS = 50;

/**
 * @param {() => { range: (de: number, ate: number) => PromiseLike<{ data: any[] | null, error: any }> }} montarConsulta
 *   devolve a consulta já com filtro e ordem estável (por `id`); é chamada de novo a cada página
 * @returns {Promise<{ linhas: any[], truncado: boolean }>} `truncado` = passou de `maxPaginas` e parou
 * @throws se qualquer página falhar: metade da tabela não é devolvida como se fosse tudo
 */
export async function lerEmPaginas(
  montarConsulta,
  { tamanho = TAMANHO_DA_PAGINA, maxPaginas = MAX_PAGINAS } = {}
) {
  const linhas = [];
  for (let pagina = 0; pagina < maxPaginas; pagina += 1) {
    const { data, error } = await montarConsulta().range(
      pagina * tamanho,
      pagina * tamanho + tamanho - 1
    );
    if (error) throw error;
    const recebidas = data ?? [];
    linhas.push(...recebidas);
    if (recebidas.length < tamanho) return { linhas, truncado: false };
  }
  return { linhas, truncado: true };
}
