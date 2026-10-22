/**
 * Quais arquivos da oportunidade/projeto o cliente vê no Portal do Cliente (portal-cliente-dados).
 *
 * As cópias que o conector do Claude faz da biblioteca de habilitação (origem "biblioteca:<id>":
 * certidões, balanço, contrato social, procurações) e do acervo técnico (origem "acervo:<id>": CATs)
 * são documentos internos da empresa para o envelope da licitação: ficam nos Arquivos da equipe e
 * NÃO aparecem para o cliente (decisão do Javerson, 21/10/2026). O resto continua como antes,
 * inclusive arquivos sem origem (enviados pela tela) e os documentos gerados (proposta, declarações).
 * Módulo puro: roda no Node.
 */

const ORIGENS_INTERNAS = /^(biblioteca|acervo):/;

/** true = é cópia interna (biblioteca de habilitação ou acervo técnico) e não vai para o cliente. */
export function ehCopiaInterna(origem: unknown): boolean {
  return typeof origem === "string" && ORIGENS_INTERNAS.test(origem.trim().toLowerCase());
}

/** Tira as cópias internas e a coluna `origem` (o portal não precisa dela). */
export function arquivosVisiveisAoCliente<T extends { origem?: unknown }>(
  linhas: readonly T[] | null | undefined
): Omit<T, "origem">[] {
  return (linhas ?? [])
    .filter((l) => l && !ehCopiaInterna(l.origem))
    .map(({ origem: _origem, ...resto }) => resto);
}
