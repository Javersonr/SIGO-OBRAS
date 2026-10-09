/**
 * Leitura de número em pt-BR, igual à da tela (apps/web/src/lib/orcamento-modelo.js, lerNumeroBR).
 * Porte linha a linha para o servidor (spec 2026-10-08 §3): o conector do Claude valida as linhas do
 * orçamento com as MESMAS regras da importação pela tela. A paridade é conferida no Vitest
 * (apps/web/src/lib/orcamento-paridade.test.js). Puro: roda no Deno e no Node.
 */

/**
 * Número de uma célula: number finito → ele mesmo; texto pt-BR ("1.234,56", "12,5",
 * "R$ 1.234,56") ou com ponto decimal ("1234.56") → number; vazio/null/undefined → null;
 * qualquer outra coisa → NaN.
 */
export function lerNumeroBR(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : NaN;
  if (typeof valor !== "string") return NaN;
  let s = valor.replace(/R\$/gi, "").replace(/\s+/g, "");
  if (s === "") return null;
  const virgula = s.includes(",");
  const ponto = s.includes(".");
  if (virgula && ponto) {
    s =
      s.lastIndexOf(",") > s.lastIndexOf(".")
        ? s.replace(/\./g, "").replace(",", ".") // 1.234,56
        : s.replace(/,/g, ""); // 1,234.56
  } else if (virgula) {
    s = s.replace(",", "."); // 12,5 (duas vírgulas não passam no teste abaixo)
  } else if ((s.match(/\./g) || []).length > 1) {
    s = s.replace(/\./g, ""); // 1.234.567
  }
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}
