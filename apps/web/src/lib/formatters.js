/**
 * Formatters compartilhados (moeda, número, data).
 *
 * Antes: cada widget e cada modal redefinia o próprio formatter Intl.
 * Agora: 1 lugar só, com variantes default + compactas.
 */

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const BRL_COMPACT = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

/** R$ 1.234,56 */
export function formatBRL(value) {
  return BRL.format(Number(value) || 0);
}

/** R$ 1,2 mi — para dashboards/widgets onde espaço é crítico */
export function formatBRLCompact(value) {
  return BRL_COMPACT.format(Number(value) || 0);
}

/** 1.234,56 */
const NUM = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
export function formatNumber(value) {
  return NUM.format(Number(value) || 0);
}

/** 25/12 a partir de "2026-12-25" (sem timezone surprise) */
export function formatShortDate(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  } catch {
    return "";
  }
}

/** 25/12/2026 */
export function formatFullDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso + "T12:00:00").toLocaleDateString("pt-BR");
  } catch {
    return "";
  }
}
