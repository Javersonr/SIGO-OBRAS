import { describe, it, expect } from "vitest";
import {
  precoComDesconto,
  totalLinha,
  totalLinhaLegado,
  validarDesconto,
  aplicarDesconto,
  subtotaisEtapas,
  resumoOrcamento,
} from "./orcamento-desconto";

describe("precoComDesconto", () => {
  it("exemplo da spec: 10,48 com 12,35% → 9,18 (corta, não arredonda 9,18572)", () => {
    expect(precoComDesconto(10.48, 12.35)).toBe(9.18);
  });
  it("referência com 4 casas", () => {
    expect(precoComDesconto(10.4899, 12.35)).toBe(9.19); // 9,19439735
    expect(precoComDesconto(2827.9249, 12.35)).toBe(2478.67); // 2.478,6761…
  });
  it("desconto 0 corta a referência na 2ª casa", () => {
    expect(precoComDesconto(10.48, 0)).toBe(10.48);
    expect(precoComDesconto(10.4899, 0)).toBe(10.48);
    expect(precoComDesconto(0.29, 0)).toBe(0.29); // Math.floor(0.29 * 100) / 100 daria 0,28
    expect(precoComDesconto(1.15, 0)).toBe(1.15); // Math.floor(1.15 * 100) / 100 daria 1,14
  });
  it("desconto 99,99", () => {
    expect(precoComDesconto(10.48, 99.99)).toBe(0); // 0,001048
    expect(precoComDesconto(1234.5678, 99.99)).toBe(0.12); // 0,12345678
  });
  it("nunca passa de referência × (1 − d)", () => {
    for (const ref of [0.01, 0.29, 1.005, 10.48, 99.9999, 2827.92]) {
      const unit = precoComDesconto(ref, 12.35);
      expect(unit).toBeLessThanOrEqual(ref * 0.8765 + 1e-9);
      expect(Math.round(unit * 100) / 100).toBe(unit);
    }
  });
});

describe("totalLinha", () => {
  it("exemplo da spec: 125,5 × 9,18 = 1.152,09", () => {
    expect(totalLinha(125.5, 9.18)).toBe(1152.09);
  });
  it("sem erro de ponto flutuante", () => {
    expect(totalLinha(100, 0.29)).toBe(29); // 0.29 * 100 = 28.999999999999996
    expect(totalLinha(1, 1.005)).toBe(1.01); // Math.round(1.005 * 100) / 100 daria 1
    expect(totalLinha(3, 0.1)).toBe(0.3);
  });
  it("arredonda o meio para cima", () => {
    expect(totalLinha(1, 0.125)).toBe(0.13);
    expect(totalLinha(2.345, 3.3333)).toBe(7.82); // 7,8165885
  });
  it("produto acima de 2^53 (BigInt)", () => {
    expect(totalLinha(123456.789, 98765.4321)).toBe(12193263111.26);
  });
  it("null quando falta quantidade ou unitário; zero é zero", () => {
    expect(totalLinha(null, 10)).toBeNull();
    expect(totalLinha(10, undefined)).toBeNull();
    expect(totalLinha(0, 10)).toBe(0);
  });
});

describe("totalLinhaLegado", () => {
  it("sem BDI e imposto é o totalLinha", () => {
    expect(totalLinhaLegado({ quantidade: 125.5, valor_unitario: 9.18, bdi: 0, imposto: 0 })).toBe(
      1152.09
    );
    expect(totalLinhaLegado({ quantidade: "3", valor_unitario: "0.1", bdi: null })).toBe(0.3);
    expect(totalLinhaLegado({ quantidade: null, valor_unitario: 10 })).toBe(0);
  });
  it("com BDI/imposto mantém a fórmula antiga, arredondada em 2 casas", () => {
    expect(totalLinhaLegado({ quantidade: 2, valor_unitario: 100, bdi: 25, imposto: 10 })).toBe(
      275
    );
    expect(totalLinhaLegado({ quantidade: 3, valor_unitario: 10.555, bdi: 10, imposto: 0 })).toBe(
      34.83
    ); // 34,8315
  });
});

describe("validarDesconto", () => {
  it("aceita vírgula, ponto, número, espaços e %", () => {
    expect(validarDesconto("12,35")).toEqual({ ok: true, valor: 12.35 });
    expect(validarDesconto("12.35")).toEqual({ ok: true, valor: 12.35 });
    expect(validarDesconto(12.35)).toEqual({ ok: true, valor: 12.35 });
    expect(validarDesconto(" 12,35 % ")).toEqual({ ok: true, valor: 12.35 });
    expect(validarDesconto("0")).toEqual({ ok: true, valor: 0 });
    expect(validarDesconto("99,99")).toEqual({ ok: true, valor: 99.99 });
    expect(validarDesconto("12,350")).toEqual({ ok: true, valor: 12.35 });
  });
  it("mensagens de erro", () => {
    expect(validarDesconto("")).toEqual({ ok: false, erro: "Informe o desconto em %" });
    expect(validarDesconto("   ")).toEqual({ ok: false, erro: "Informe o desconto em %" });
    expect(validarDesconto(null)).toEqual({ ok: false, erro: "Informe o desconto em %" });
    expect(validarDesconto("abc")).toEqual({ ok: false, erro: "Desconto inválido" });
    expect(validarDesconto("1,2,3")).toEqual({ ok: false, erro: "Desconto inválido" });
    expect(validarDesconto("100")).toEqual({ ok: false, erro: "O desconto vai de 0 a 99,99%" });
    expect(validarDesconto("-1")).toEqual({ ok: false, erro: "O desconto vai de 0 a 99,99%" });
    expect(validarDesconto("12,345")).toEqual({
      ok: false,
      erro: "Use no máximo 2 casas decimais",
    });
  });
});

describe("aplicarDesconto", () => {
  it("recalcula só os itens com referência; pula etapas e itens manuais", () => {
    const itens = [
      { id: "e1", numero: "1", etapa: true, valor_unitario_ref: null },
      { id: "i1", numero: "1.1", etapa: false, quantidade: 125.5, valor_unitario_ref: 10.48 },
      { id: "i2", numero: "1.2", etapa: false, quantidade: 2, valor_unitario_ref: null },
    ];
    expect(aplicarDesconto(itens, 12.35)).toEqual([
      { id: "i1", valor_unitario: 9.18, valor_total: 1152.09 },
    ]);
    expect(aplicarDesconto(itens, 0)).toEqual([
      { id: "i1", valor_unitario: 10.48, valor_total: 1315.24 },
    ]);
  });
});

describe("subtotaisEtapas", () => {
  it("etapas aninhadas: 1 soma 1.1 e 1.2; 1.2 soma 1.2.1; não confunde 1.2 com 1.20", () => {
    const itens = [
      { numero: "1", etapa: true },
      { numero: "1.1", etapa: false, valor_total: 100.1 },
      { numero: "1.2", etapa: true },
      { numero: "1.2.1", etapa: false, valor_total: 0.2 },
      { numero: "1.20", etapa: true },
      { numero: "1.20.1", etapa: false, valor_total: 5 },
      { numero: "2", etapa: true },
      { numero: "3", etapa: false, valor_total: 7 },
    ];
    const sub = subtotaisEtapas(itens);
    expect(Object.keys(sub).sort()).toEqual(["1", "1.2", "1.20", "2"]);
    expect(sub["1"]).toBe(105.3); // soma em centavos (100.1 + 0.2 daria 100.30000000000001)
    expect(sub["1.2"]).toBe(0.2);
    expect(sub["1.20"]).toBe(5);
    expect(sub["2"]).toBe(0);
  });
});

describe("resumoOrcamento", () => {
  it("totais, desconto real e item sem referência", () => {
    const itens = [
      { numero: "1", etapa: true },
      {
        numero: "1.1",
        etapa: false,
        quantidade: 125.5,
        valor_unitario_ref: 10.48,
        valor_unitario: 9.18,
        valor_total: 1152.09,
      },
      {
        numero: "1.2",
        etapa: false,
        quantidade: 1,
        valor_unitario_ref: null,
        valor_unitario: 500,
        valor_total: 500,
      },
    ];
    expect(resumoOrcamento(itens)).toEqual({
      totalReferencia: 1315.24,
      totalProposta: 1652.09,
      descontoReal: 12.4, // 1 − 1.152,09 ÷ 1.315,24 = 12,4046%
      itensSemReferencia: 1,
      qtdItens: 2,
      qtdEtapas: 1,
    });
  });
  it("sem referência, desconto real 0", () => {
    expect(resumoOrcamento([])).toEqual({
      totalReferencia: 0,
      totalProposta: 0,
      descontoReal: 0,
      itensSemReferencia: 0,
      qtdItens: 0,
      qtdEtapas: 0,
    });
  });
});
