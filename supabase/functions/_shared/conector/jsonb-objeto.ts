/**
 * jsonb que pode chegar como objeto ou como TEXTO (o legado do Base44 gravou vários jsonb como string).
 * Uma função só para toda leitura desse tipo: edital_analise, orcamento_info, cronograma_ff. Puro: sem Deno e sem
 * import.
 */

/**
 * O objeto, ou null quando o valor não é um objeto (lista, número, nulo, texto que não é JSON de objeto).
 * Quem precisa de um objeto sempre usa `jsonbComoObjeto(v) ?? {}`.
 */
export function jsonbComoObjeto(v: unknown): Record<string, unknown> | null {
  let x = v;
  if (typeof x === "string") {
    try {
      x = JSON.parse(x);
    } catch {
      return null;
    }
  }
  return x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : null;
}
