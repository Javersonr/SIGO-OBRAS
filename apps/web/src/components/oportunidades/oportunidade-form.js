import { safeParseJSON } from "@/lib/json-utils";

/**
 * Funções puras do cadastro de oportunidade (sem React) — testadas em
 * oportunidade-form.test.js.
 */

/**
 * valor_estimado → número. Com vírgula é texto pt-BR digitado ("1.234,56" →
 * 1234.56); SEM vírgula o ponto é o decimal do banco/JS ("1234.5" → 1234.5).
 * Tratar "1234.5" como pt-BR (tirar o ponto) multiplicava o valor por 10/100.
 * Vazio ou ilegível → 0.
 */
export function parseValorEstimado(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v ?? "").replace(/[^\d,.-]/g, "");
  if (!s) return 0;
  const n = s.includes(",")
    ? Number.parseFloat(s.replace(/\./g, "").replace(",", "."))
    : Number.parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * valor_estimado para o formData do FormularioOportunidade: sempre NÚMERO (o
 * formatarMoeda de lá só entende string sem ponto) ou "" quando não há valor.
 */
export function valorEstimadoParaForm(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "string" && !v.trim()) return "";
  return parseValorEstimado(v);
}

/** Título da oportunidade duplicada. */
export function nomeDaCopia(op) {
  const nome = String(op?.nome || op?.titulo || "").trim();
  return `Cópia de ${nome || "oportunidade"}`;
}

/**
 * O "Atende?" grava edital_analise em segundo plano; uma leitura do banco que
 * saiu ANTES dessa gravação chega sem o `atende`. Mantém a análise já
 * conferida quando a lida é a MESMA leitura do edital (mesmo analisado_em)
 * ainda sem o resultado — evita pedir de novo uma análise paga.
 */
export function preservarAtende(anterior, lida) {
  const a = safeParseJSON(anterior, null);
  const b = safeParseJSON(lida, null);
  if (
    a &&
    typeof a === "object" &&
    a.atende &&
    b &&
    typeof b === "object" &&
    !b.atende &&
    a.analisado_em === b.analisado_em
  ) {
    return anterior;
  }
  return lida;
}
