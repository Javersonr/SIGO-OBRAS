import { describe, it, expect } from "vitest";
import {
  formatBRL,
  formatBRLCompact,
  formatNumber,
  formatShortDate,
  formatFullDate,
} from "./formatters";

// Intl insere espaço NBSP (U+00A0) entre "R$" e o número. Normalizamos QUALQUER
// espaço (incl. NBSP via \s) para espaço comum nas asserções — evita fragilidade.
const norm = (s) => s.replace(/\s/g, " ");

describe("formatBRL", () => {
  it("formata moeda BR", () => {
    expect(norm(formatBRL(1234.56))).toBe("R$ 1.234,56");
    expect(norm(formatBRL(0))).toBe("R$ 0,00");
  });
  it("coage nulo/NaN para 0", () => {
    expect(norm(formatBRL(null))).toBe("R$ 0,00");
    expect(norm(formatBRL("abc"))).toBe("R$ 0,00");
  });
});

describe("formatBRLCompact", () => {
  it("usa notação compacta", () => {
    // 1,2 mi — só garantimos que comprime (contém "mi") e tem R$
    const out = norm(formatBRLCompact(1200000));
    expect(out).toMatch(/^R\$/);
    expect(out.toLowerCase()).toContain("mi");
  });
});

describe("formatNumber", () => {
  it("número BR com até 2 casas", () => {
    expect(formatNumber(1234.5)).toBe("1.234,5");
    expect(formatNumber(null)).toBe("0");
  });
});

describe("datas (sem timezone surprise)", () => {
  it("formatShortDate dd/mm", () => {
    expect(formatShortDate("2026-12-25")).toBe("25/12");
    expect(formatShortDate("")).toBe("");
    expect(formatShortDate(null)).toBe("");
  });
  it("formatFullDate dd/mm/aaaa", () => {
    expect(formatFullDate("2026-12-25")).toBe("25/12/2026");
    expect(formatFullDate(null)).toBe("");
  });
});
