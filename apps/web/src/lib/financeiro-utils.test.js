import { describe, it, expect } from "vitest";
import {
  isStatusPago,
  isStatusPendente,
  isStatusEncerrado,
  isReceita,
  isDespesa,
  normalizeStatus,
  normalizeTipo,
  parseValor,
  parseData,
} from "./financeiro-utils";

// Estas funções são o coração da consistência financeira (DRE, Balanço,
// contas a pagar/receber). O bug histórico era comparação case-sensitive
// fazendo registro sumir de relatório — estes testes travam isso.

describe("status financeiro", () => {
  it("isStatusPago aceita pago/realizado em qualquer caixa", () => {
    expect(isStatusPago("pago")).toBe(true);
    expect(isStatusPago("Pago")).toBe(true);
    expect(isStatusPago("REALIZADO")).toBe(true);
    expect(isStatusPago(" pago ")).toBe(true); // normalizeStatus faz trim
  });
  it("isStatusPago rejeita não-pagos e vazios", () => {
    expect(isStatusPago("pendente")).toBe(false);
    expect(isStatusPago("atrasado")).toBe(false);
    expect(isStatusPago("")).toBe(false);
    expect(isStatusPago(null)).toBe(false);
    expect(isStatusPago(undefined)).toBe(false);
  });

  it("isStatusPendente cobre em_aberto/pendente/atrasado", () => {
    expect(isStatusPendente("em_aberto")).toBe(true);
    expect(isStatusPendente("pendente")).toBe(true);
    expect(isStatusPendente("atrasado")).toBe(true);
  });
  it("isStatusPendente exclui pago/cancelado/agendado", () => {
    expect(isStatusPendente("pago")).toBe(false);
    expect(isStatusPendente("cancelado")).toBe(false);
    expect(isStatusPendente("agendado")).toBe(false);
  });

  it("isStatusEncerrado = pago/realizado/cancelado", () => {
    expect(isStatusEncerrado("pago")).toBe(true);
    expect(isStatusEncerrado("realizado")).toBe(true);
    expect(isStatusEncerrado("cancelado")).toBe(true);
    expect(isStatusEncerrado("pendente")).toBe(false);
  });

  it("normalizeStatus minúsculas + trim", () => {
    expect(normalizeStatus("  PaGo ")).toBe("pago");
    expect(normalizeStatus(null)).toBe("");
  });
});

describe("tipo de transação", () => {
  it("isReceita/isDespesa são case-insensitive", () => {
    expect(isReceita({ tipo: "Receita" })).toBe(true);
    expect(isReceita({ tipo: "receita" })).toBe(true);
    expect(isDespesa({ tipo: "DESPESA" })).toBe(true);
    expect(isReceita({ tipo: "despesa" })).toBe(false);
  });
  it("trata objeto nulo/sem tipo", () => {
    expect(isReceita(null)).toBe(false);
    expect(isDespesa(undefined)).toBe(false);
    expect(isReceita({})).toBe(false);
  });
  it("normalizeTipo", () => {
    expect(normalizeTipo(" Receita ")).toBe("receita");
  });
});

describe("parseValor (moeda BR/US)", () => {
  it("formato brasileiro 1.234,56", () => {
    expect(parseValor("R$ 1.234,56")).toBeCloseTo(1234.56, 2);
    expect(parseValor("1.234,56")).toBeCloseTo(1234.56, 2);
  });
  it("formato americano 1,234.56", () => {
    expect(parseValor("1,234.56")).toBeCloseTo(1234.56, 2);
  });
  it("só vírgula decimal vs milhar", () => {
    expect(parseValor("1234,56")).toBeCloseTo(1234.56, 2); // decimal (2 casas)
    expect(parseValor("1,234")).toBe(1234); // milhar (3 casas)
  });
  it("R$ e símbolos", () => {
    expect(parseValor("R$ 250,00")).toBe(250);
    expect(parseValor("R$1.000,00")).toBe(1000);
  });
  it("sempre positivo (Math.abs) e fallback 0", () => {
    expect(parseValor("-50,00")).toBe(50);
    expect(parseValor("")).toBe(0);
    expect(parseValor(null)).toBe(0);
    expect(parseValor("abc")).toBe(0);
  });
  it("aceita number direto", () => {
    expect(parseValor(1234.5)).toBeCloseTo(1234.5, 2);
  });
});

describe("parseData (normaliza para ISO yyyy-mm-dd)", () => {
  const ISO = /^\d{4}-\d{2}-\d{2}$/;

  it("ISO passa direto", () => {
    expect(parseData("2026-12-25")).toBe("2026-12-25");
  });
  it("DD/MM/YYYY e DD/MM/YY", () => {
    expect(parseData("25/12/2026")).toBe("2026-12-25");
    expect(parseData("25/12/26")).toBe("2026-12-25");
    expect(parseData("5/3/2026")).toBe("2026-03-05");
  });
  it("YYYY/MM/DD", () => {
    expect(parseData("2026/12/25")).toBe("2026-12-25");
  });
  it("aceita Date", () => {
    expect(parseData(new Date(Date.UTC(2026, 11, 25)))).toBe("2026-12-25");
  });
  it("serial do Excel vira ISO válido", () => {
    const r = parseData("45658");
    expect(r).toMatch(ISO);
    expect(Number(r.slice(0, 4))).toBeGreaterThan(1900);
  });
  it("entrada inválida cai pra hoje (ISO válido)", () => {
    expect(parseData("")).toMatch(ISO);
    expect(parseData("xyz")).toMatch(ISO);
  });
});
