/**
 * keywords.ts — parser/matcher da sintaxe de palavras-chave usada na config
 * de licitações. Compartilhado entre a ingestão (PNCP) e a limpeza da lista
 * (licitacoes-triagem → "limpar fora do filtro"), pra o critério ser idêntico.
 *
 * Sintaxe:
 *   vírgula separa termos (OU) · "aspas" = frase exata · -palavra = excluir
 */

/** lowercase + remove acentos */
export function norm(s: string): string {
  return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export interface ParsedKeywords {
  includes: string[];
  excludes: string[];
}

export function parseKeywords(raw: string): ParsedKeywords {
  const includes: string[] = [];
  const excludes: string[] = [];
  for (let term of (raw || "").split(",")) {
    term = term.trim();
    if (!term) continue;
    let neg = false;
    if (term.startsWith("-")) {
      neg = true;
      term = term.slice(1).trim();
    }
    term = term.replace(/^["']|["']$/g, "").trim(); // tira aspas
    if (!term) continue;
    (neg ? excludes : includes).push(norm(term));
  }
  return { includes, excludes };
}

/** true = o texto CASA com o filtro (deve ficar na lista) */
export function matchKeywords(text: string, kw: ParsedKeywords): boolean {
  const t = norm(text);
  if (kw.excludes.some((e) => t.includes(e))) return false;
  if (kw.includes.length === 0) return true;
  return kw.includes.some((i) => t.includes(i));
}
