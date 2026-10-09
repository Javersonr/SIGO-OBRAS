/**
 * "Atende?" que sai para o Claude sem os valores econômicos da empresa (spec 25/09 §4.9).
 * O resultado completo continua gravado em edital_analise.atende para a tela; ao conector vai
 * esta cópia, em que capital, PL, CCL, índices e receitas do perfil (formatados como a regra
 * os escreve: brl() e fmtNum()) viram "[valor da empresa]". Também saem os valores que
 * permitiriam recalcular o da empresa: o "Faltam R$ x" e o teto "até R$ x" do item econômico.
 * Puro: sem Deno, sem import de URL.
 */
import { arr, brl, fmtNum, numero, obj, type AcervoPerfil } from "./edital-regras.ts";
import type { AtendeResultado, ItemAtende } from "./edital-schemas.ts";

export const VALOR_OCULTO = "[valor da empresa]";

const CAMPOS_ECONOMICOS = [
  "capital_social",
  "patrimonio_liquido",
  "ccl",
  "liquidez_corrente",
  "liquidez_geral",
  "solvencia_geral",
  "endividamento_geral",
] as const;

/**
 * Os números do perfil que não podem sair pelo conector. Negativos entram (PL a descoberto e CCL
 * negativo saem da regra como "-R$ x"); o zero não, porque fmtNum(0) = "0" apagaria todo "0" solto.
 */
export function valoresEconomicos(perfil: AcervoPerfil | null): number[] {
  if (!perfil) return [];
  const out = new Set<number>();
  for (const c of CAMPOS_ECONOMICOS) {
    const n = numero(perfil[c]);
    if (n !== null && n !== 0) out.add(n);
  }
  for (const f of arr(perfil.faturamento)) {
    const n = numero(obj(f).receita_bruta);
    if (n !== null && n !== 0) out.add(n);
  }
  return [...out];
}

const escaparRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Troca brl(v) e fmtNum(v) de cada valor por "[valor da empresa]", sem pegar pedaço de outro número. */
export function ocultarValores(texto: string | null, valores: number[]): string | null {
  if (!texto || !valores.length) return texto;
  const formas = new Set<string>();
  for (const v of valores) {
    formas.add(brl(v));
    formas.add(fmtNum(v));
  }
  // a forma mais longa primeiro: "R$ 1.234,56" antes de "1.234,56"; o espaço do brl() (U+00A0)
  // casa com qualquer espaço (\s cobre U+00A0 e U+202F), para pegar também o valor digitado
  // com espaço comum nos alertas do acervo
  let out = texto;
  for (const f of [...formas].sort((a, b) => b.length - a.length)) {
    const padrao = escaparRegex(f).replace(/\s/g, "\\s?");
    const re = new RegExp(`(?<![\\p{L}\\p{N}_.,])${padrao}(?![\\p{L}\\p{N}_]|[.,]\\d)`, "gu");
    out = out.replace(re, VALOR_OCULTO);
  }
  return out;
}

/**
 * "Faltam R$ x" e "… de até R$ x" (teto) do item econômico também revelam o valor da empresa.
 * O "-?" pega o teto de um PL/CCL negativo ("de até -R$ 800.005,00").
 */
const DERIVADOS = /\b(Faltam|até)(\s+)-?R\$\s?[\d.]+,\d{2}/g;

function itemEconomico(i: ItemAtende, valores: number[]): ItemAtende {
  const limpar = (t: string | null) =>
    ocultarValores(t, valores)?.replace(DERIVADOS, `$1$2${VALOR_OCULTO}`) ?? null;
  return {
    ...i,
    comprovacao: limpar(i.comprovacao),
    justificativa: limpar(i.justificativa) ?? "",
  };
}

/** Cópia para o conector: itens econômicos e pendências/riscos/alertas sem os valores da empresa. */
export function atendeParaConector(
  r: AtendeResultado | null,
  valores: number[]
): AtendeResultado | null {
  if (!r) return null;
  const textos = (l: string[]) => l.map((t) => ocultarValores(t, valores) ?? t);
  return {
    ...r,
    itens: r.itens.map((i) => (i.grupo === "economica" ? itemEconomico(i, valores) : i)),
    pendencias: textos(r.pendencias),
    riscos: textos(r.riscos),
    alertas: textos(r.alertas),
  };
}
