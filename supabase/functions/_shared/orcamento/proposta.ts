/**
 * Versão da proposta que o conector do Claude registra em `proposta_oportunidade` — a mesma do
 * "Registrar como nova versão" do Exportar proposta (apps/web/src/lib/proposta-orcamento.js,
 * descricaoVersaoProposta e o totalGeral de montarDadosProposta). Paridade no Vitest
 * (apps/web/src/lib/cronograma-paridade.test.js). Puro: roda no Deno e no Node.
 */
import { resumoOrcamento, type ItemOrcamento } from "./desconto.ts";

/** "Orçamento com desconto de 12,35% (real 12,40%) — 57 itens". */
export function descricaoVersaoProposta(p: {
  descontoPct: unknown;
  descontoReal: unknown;
  qtdItens: unknown;
}): string {
  const pct = (v: unknown) =>
    (Number(v) || 0).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const n = Number(p.qtdItens) || 0;
  return `Orçamento com desconto de ${pct(p.descontoPct)}% (real ${pct(p.descontoReal)}%) — ${n} ${
    n === 1 ? "item" : "itens"
  }`;
}

/** Valor da versão = Σ valor_total dos itens (sem as etapas), somado em centavos. */
export function totalDaProposta(itens: ItemOrcamento[]): number {
  return resumoOrcamento(itens).totalProposta;
}
