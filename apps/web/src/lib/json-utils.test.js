import { describe, it, expect } from "vitest";
import { safeParseJSON } from "./json-utils";

// Bug histórico: JSONB do supabase-js já vem como objeto; JSON.parse(obj)
// lançava e caía no catch ("nenhum módulo disponível"). safeParseJSON é
// idempotente — aceita string OU objeto.

describe("safeParseJSON", () => {
  it("parseia string JSON", () => {
    expect(safeParseJSON('{"a":1}')).toEqual({ a: 1 });
    expect(safeParseJSON("[1,2,3]")).toEqual([1, 2, 3]);
  });
  it("idempotente: objeto/array já parseado volta igual", () => {
    const obj = { a: 1 };
    expect(safeParseJSON(obj)).toBe(obj); // mesma referência
    const arr = [1, 2];
    expect(safeParseJSON(arr)).toBe(arr);
  });
  it("trim antes de parsear", () => {
    expect(safeParseJSON('  {"b":2}  ')).toEqual({ b: 2 });
  });
  it("fallback para null/vazio/inválido", () => {
    expect(safeParseJSON(null)).toEqual({});
    expect(safeParseJSON(undefined)).toEqual({});
    expect(safeParseJSON("")).toEqual({});
    expect(safeParseJSON("   ")).toEqual({});
    expect(safeParseJSON("não é json")).toEqual({});
  });
  it("respeita fallback custom", () => {
    expect(safeParseJSON(null, [])).toEqual([]);
    expect(safeParseJSON("quebrado", { x: 9 })).toEqual({ x: 9 });
  });
  it("number/boolean caem no fallback (não são string nem objeto)", () => {
    expect(safeParseJSON(123, "fb")).toBe("fb");
    expect(safeParseJSON(true, "fb")).toBe("fb");
  });
});
