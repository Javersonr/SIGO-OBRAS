import { describe, it, expect } from "vitest";
import { calcularValoresMedicao } from "./medicao-calc";

// Coração comercial: a conta da medição (retenção + ISS + INSS → líquido).
// Estes testes travam a fórmula e a regra "faturada usa snapshot, pendente
// calcula prévia pelos percentuais".

describe("calcularValoresMedicao — prévia (não faturada)", () => {
  it("desconta retenção + ISS + INSS dos percentuais", () => {
    const r = calcularValoresMedicao({
      status: "Pendente",
      valor_medido: 10000,
      retencao_percentual: 5,
      iss_percentual: 3,
      inss_percentual: 11,
    });
    expect(r.faturada).toBe(false);
    expect(r.retencao).toBeCloseTo(500, 2);
    expect(r.iss).toBeCloseTo(300, 2);
    expect(r.inss).toBeCloseTo(1100, 2);
    expect(r.liquido).toBeCloseTo(8100, 2); // 10000 - 500 - 300 - 1100
  });

  it("sem percentuais, líquido = medido", () => {
    const r = calcularValoresMedicao({ status: "Pendente", valor_medido: 5000 });
    expect(r.retencao).toBe(0);
    expect(r.iss).toBe(0);
    expect(r.inss).toBe(0);
    expect(r.liquido).toBe(5000);
  });
});

describe("calcularValoresMedicao — faturada (usa snapshots)", () => {
  it("ignora os percentuais e usa os valores gravados", () => {
    const r = calcularValoresMedicao({
      status: "Faturada",
      valor_medido: 10000,
      retencao_percentual: 5, // se calculasse daria 500...
      valor_retencao: 999, // ...mas o snapshot é 999
      iss_percentual: 3,
      valor_iss: 111,
      inss_percentual: 11,
      valor_inss: 222,
      valor_liquido: 8668,
    });
    expect(r.faturada).toBe(true);
    expect(r.retencao).toBe(999);
    expect(r.iss).toBe(111);
    expect(r.inss).toBe(222);
    expect(r.liquido).toBe(8668);
  });
});

describe("calcularValoresMedicao — defensivo", () => {
  it("medição nula/indefinida → tudo zero", () => {
    for (const m of [null, undefined, {}]) {
      const r = calcularValoresMedicao(m);
      expect(r.faturada).toBe(false);
      expect(r.medido).toBe(0);
      expect(r.liquido).toBe(0);
    }
  });
});
