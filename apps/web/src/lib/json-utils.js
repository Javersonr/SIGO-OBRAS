/**
 * safeParseJSON — aceita string OU objeto (idempotente).
 *
 * Histórico: campos JSONB no Postgres (ex: `plano.modulos_liberados`,
 * `vinculo.permissoes`, `empresa.tema_cores`) vêm como **objeto** pelo
 * driver supabase-js — não como string. Código que chamava `JSON.parse(obj)`
 * estava lançando `SyntaxError: "[object Object]" is not valid JSON`
 * e caindo no catch, voltando `{}` (= "Nenhum módulo disponível").
 *
 * Use sempre `safeParseJSON(value, fallback)` para resolver esses casos
 * sem ter que saber se o backend devolveu já parseado ou ainda string.
 */
export function safeParseJSON(value, fallback = {}) {
  if (value == null) return fallback;
  // Já é objeto/array — devolve direto (não tenta reparsear)
  if (typeof value === "object") return value;
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  try {
    return JSON.parse(trimmed);
  } catch {
    return fallback;
  }
}
