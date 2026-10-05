import { describe, it, expect } from "vitest";
import {
  MAX_MESES,
  etapasDoOrcamento,
  normalizarCronograma,
  lerPercentual,
  somaCentesimos,
  linhaFecha,
  valoresDaLinha,
  resumoCronograma,
  ajustarMeses,
  reperiodizarLinha,
  reperiodizar,
} from "./cronograma-ff";

const soma = (lista) => lista.reduce((s, v) => s + v, 0);

describe("etapasDoOrcamento", () => {
  it("só etapas de nível 1, na ordem da tela, com o subtotal com desconto em centavos", () => {
    const itens = [
      { id: "e2", etapa: true, numero: "2", descricao: "POSTES", ordem: 3 },
      { id: "i21", etapa: false, numero: "2.1", valor_total: 21032.94, ordem: 4 },
      { id: "e1", etapa: true, numero: "1", descricao: "PRELIMINARES", ordem: 0 },
      { id: "e11", etapa: true, numero: "1.1", descricao: "Sub", ordem: 1 },
      { id: "i111", etapa: false, numero: "1.1.1", valor_total: 1315.24, ordem: 2 },
      { id: "i12", etapa: false, numero: "1.2", valor_total: "0.01", ordem: 2 },
      { id: "e3", etapa: true, numero: "3", descricao: "VAZIA", ordem: 5 },
      { id: "x", etapa: true, numero: null, descricao: "sem número", ordem: 6 },
      null,
    ];
    expect(etapasDoOrcamento(itens)).toEqual([
      { numero: "1", descricao: "PRELIMINARES", centavos: 131525 },
      { numero: "2", descricao: "POSTES", centavos: 2103294 },
      { numero: "3", descricao: "VAZIA", centavos: 0 },
    ]);
  });
  it("sem itens ou sem etapas → lista vazia", () => {
    expect(etapasDoOrcamento(undefined)).toEqual([]);
    expect(etapasDoOrcamento([{ etapa: false, numero: "1", valor_total: 10 }])).toEqual([]);
  });
  it("ordem nula conta como 0 e o desempate é pelo número", () => {
    const itens = [
      { etapa: true, numero: "10", descricao: "Dez" },
      { etapa: true, numero: "2", descricao: "Dois" },
    ];
    expect(etapasDoOrcamento(itens).map((e) => e.numero)).toEqual(["2", "10"]);
  });
});

describe("normalizarCronograma", () => {
  it("vazio, null e inválido → { meses: 0, pct: {} }", () => {
    for (const v of [{}, null, undefined, "x", 5, [1, 2], { meses: "abc" }]) {
      expect(normalizarCronograma(v)).toEqual({ meses: 0, pct: {} });
    }
  });
  it("corta e completa as linhas até meses; % inválido vira 0; 2 casas", () => {
    const r = normalizarCronograma({
      meses: 3,
      pct: { 1: [20, 35, 30, 15], 2: [50], 3: [-1, 101, "20"], 4: "x", 5: [33.333, null, 0] },
      origem: "importado",
      arquivo_nome: "Orcamento SIGO - PM Itatinga.xlsx",
      atualizado_em: "2026-10-05T12:00:00.000Z",
    });
    expect(r).toEqual({
      meses: 3,
      pct: { 1: [20, 35, 30], 2: [50, 0, 0], 3: [0, 0, 0], 5: [33.33, 0, 0] },
      origem: "importado",
      arquivo_nome: "Orcamento SIGO - PM Itatinga.xlsx",
      atualizado_em: "2026-10-05T12:00:00.000Z",
    });
  });
  it("meses fica entre 0 e MAX_MESES; com 0 não sobra linha; origem desconhecida sai", () => {
    expect(normalizarCronograma({ meses: 99, pct: {} }).meses).toBe(MAX_MESES);
    expect(normalizarCronograma({ meses: -2, pct: { 1: [10] } })).toEqual({ meses: 0, pct: {} });
    expect(normalizarCronograma({ meses: 2.7, pct: { 1: [10, 20, 30] } })).toEqual({
      meses: 2,
      pct: { 1: [10, 20] },
    });
    expect(normalizarCronograma({ meses: 1, pct: [], origem: "outra" })).toEqual({
      meses: 1,
      pct: {},
    });
  });
});

describe("lerPercentual", () => {
  it("number, vírgula, ponto, % e espaços", () => {
    expect(lerPercentual(20)).toBe(20);
    expect(lerPercentual("12,5")).toBe(12.5);
    expect(lerPercentual("12.5")).toBe(12.5);
    expect(lerPercentual(" 12,5 % ")).toBe(12.5);
    expect(lerPercentual("100")).toBe(100);
    expect(lerPercentual("0")).toBe(0);
    expect(lerPercentual(",5")).toBe(0.5);
  });
  it("vazio → null", () => {
    expect(lerPercentual("")).toBeNull();
    expect(lerPercentual("   ")).toBeNull();
    expect(lerPercentual("%")).toBeNull();
    expect(lerPercentual(null)).toBeNull();
    expect(lerPercentual(undefined)).toBeNull();
  });
  it("inválido ou fora de 0 a 100 → NaN", () => {
    for (const v of ["abc", "12abc", "1.234,5", "1,2,3", "-5", "+5", "100,01", 101, -0.5, NaN]) {
      expect(lerPercentual(v)).toBeNaN();
    }
    expect(lerPercentual(Infinity)).toBeNaN();
    expect(lerPercentual({})).toBeNaN();
  });
  it("arredonda em 2 casas, meio para cima", () => {
    expect(lerPercentual("33,335")).toBe(33.34);
    expect(lerPercentual(1.005)).toBe(1.01);
    expect(lerPercentual("33,3333")).toBe(33.33);
    expect(lerPercentual("100,004")).toBe(100);
  });
  it("number arredonda em 2 casas antes de conferir a faixa; texto com sinal continua inválido", () => {
    expect(lerPercentual(100.004)).toBe(100);
    expect(lerPercentual(100.005)).toBeNaN(); // vira 100,01
    expect(lerPercentual(-0.004)).toBe(0);
    expect(Object.is(lerPercentual(-0.004), 0)).toBe(true); // sem −0
    expect(lerPercentual(-0.006)).toBeNaN(); // vira −0,01
    expect(lerPercentual("-0,004")).toBeNaN();
    expect(lerPercentual("-0.004")).toBeNaN();
  });
});

describe("somaCentesimos e linhaFecha", () => {
  it("soma em centésimos, sem erro de ponto flutuante", () => {
    expect(somaCentesimos([33.33, 33.33, 33.34])).toBe(10000);
    expect(somaCentesimos([0.1, 0.2])).toBe(30);
    expect(somaCentesimos([])).toBe(0);
    expect(somaCentesimos(undefined)).toBe(0);
    expect(linhaFecha([33.33, 33.33, 33.34])).toBe(true);
    expect(linhaFecha([20, 35, 30, 15])).toBe(true);
    expect(linhaFecha([20, 35, 30, 14.99])).toBe(false);
    expect(linhaFecha([])).toBe(false);
  });
});

describe("valoresDaLinha", () => {
  it("33,33/33,33/33,34 com subtotal ímpar: o último mês absorve o centavo", () => {
    const v = valoresDaLinha([33.33, 33.33, 33.34], 100001);
    // 100001 × 33,34% = 33340,33 → 33340 sem ajuste; com o ajuste, 33341
    expect(v).toEqual([33330, 33330, 33341]);
    expect(soma(v)).toBe(100001);
  });
  it("o ajuste vai no último mês com % > 0, não na última coluna", () => {
    const v = valoresDaLinha([50, 50, 0], 1);
    expect(v).toEqual([1, 0, 0]);
    expect(soma(v)).toBe(1);
    expect(valoresDaLinha([0, 25, 25, 50, 0], 99999)).toEqual([0, 25000, 25000, 49999, 0]);
  });
  it("linha que não fecha: cada célula só arredondada, sem ajuste", () => {
    const v = valoresDaLinha([33.33, 33.33], 100001);
    expect(v).toEqual([33330, 33330]);
    expect(valoresDaLinha([60, 50], 1000)).toEqual([600, 500]);
  });
  it("etapa acima de 2^53 em centavos × centésimos (BigInt)", () => {
    const cents = 900000000000001; // R$ 9 trilhões e 1 centavo
    const v = valoresDaLinha([33.33, 33.33, 33.34], cents);
    expect(v[0]).toBe(299970000000000); // 900000000000001 × 3333 ÷ 10000 = 299970000000000,3
    expect(soma(v)).toBe(cents);
  });
  it("linha vazia ou zerada", () => {
    expect(valoresDaLinha([], 5000)).toEqual([]);
    expect(valoresDaLinha([0, 0], 5000)).toEqual([0, 0]);
  });
});

describe("resumoCronograma", () => {
  const etapas = [
    { numero: "1", descricao: "PRELIMINARES", centavos: 100000 },
    { numero: "2", descricao: "POSTES", centavos: 50001 },
    { numero: "3", descricao: "SEM LINHA", centavos: 0 },
  ];
  const cron = {
    meses: 4,
    pct: { 1: [20, 35, 30, 15], 2: [0, 50, 50, 0], 9: [100, 0, 0, 0], 10: [0, 0, 0, 0] },
  };

  it("linhas com peso, valores, fecha e diferença", () => {
    const r = resumoCronograma(etapas, cron);
    expect(r.totalCentavos).toBe(150001);
    expect(r.linhas[0]).toEqual({
      numero: "1",
      descricao: "PRELIMINARES",
      centavos: 100000,
      peso: 66.67,
      pct: [20, 35, 30, 15],
      valores: [20000, 35000, 30000, 15000],
      fecha: true,
      diferenca: 0,
    });
    // 50001 × 50% = 25000,5 → 25001; o último mês com % > 0 fica com 50001 − 25001
    expect(r.linhas[1].valores).toEqual([0, 25001, 25000, 0]);
    expect(r.linhas[1].peso).toBe(33.33);
    expect(r.linhas[2]).toEqual({
      numero: "3",
      descricao: "SEM LINHA",
      centavos: 0,
      peso: 0,
      pct: [0, 0, 0, 0],
      valores: [0, 0, 0, 0],
      fecha: false,
      diferenca: 100,
    });
    expect(r.todasFecham).toBe(false);
    expect(r.orfas).toEqual(["9", "10"]);
  });

  it("totais do mês e acumulados em R$ e em % do total", () => {
    const r = resumoCronograma(etapas, cron);
    expect(r.meses).toEqual([
      { centavos: 20000, pct: 13.33, acumCentavos: 20000, acumPct: 13.33 },
      { centavos: 60001, pct: 40, acumCentavos: 80001, acumPct: 53.33 },
      { centavos: 55000, pct: 36.67, acumCentavos: 135001, acumPct: 90 },
      { centavos: 15000, pct: 10, acumCentavos: 150001, acumPct: 100 },
    ]);
  });

  it("todas fecham → todasFecham; diferença com sinal quando passa de 100", () => {
    const so2 = etapas.slice(0, 2);
    expect(resumoCronograma(so2, cron).todasFecham).toBe(true);
    const r = resumoCronograma(so2, { meses: 2, pct: { 1: [60, 45], 2: [50, 49.99] } });
    expect(r.linhas.map((l) => [l.fecha, l.diferenca])).toEqual([
      [false, -5],
      [false, 0.01],
    ]);
    expect(r.todasFecham).toBe(false);
  });

  it("sem etapas ou sem cronograma", () => {
    expect(resumoCronograma([], cron)).toEqual({
      linhas: [],
      meses: [
        { centavos: 0, pct: 0, acumCentavos: 0, acumPct: 0 },
        { centavos: 0, pct: 0, acumCentavos: 0, acumPct: 0 },
        { centavos: 0, pct: 0, acumCentavos: 0, acumPct: 0 },
        { centavos: 0, pct: 0, acumCentavos: 0, acumPct: 0 },
      ],
      totalCentavos: 0,
      todasFecham: false,
      orfas: ["1", "2", "9", "10"],
    });
    const r = resumoCronograma(etapas.slice(0, 1), {});
    expect(r.meses).toEqual([]);
    expect(r.linhas[0]).toMatchObject({ pct: [], valores: [], fecha: false, diferenca: 100 });
  });
});

describe("ajustarMeses", () => {
  const cron = {
    meses: 4,
    pct: { 1: [20, 35, 30, 15], 2: [50, 50, 0, 0] },
    origem: "importado",
    arquivo_nome: "x.xlsx",
  };
  it("para mais: colunas com 0, sem corte", () => {
    expect(ajustarMeses(cron, 6)).toEqual({
      cronograma: {
        meses: 6,
        pct: { 1: [20, 35, 30, 15, 0, 0], 2: [50, 50, 0, 0, 0, 0] },
        origem: "importado",
        arquivo_nome: "x.xlsx",
      },
      cortouValores: false,
    });
  });
  it("para menos: corta as do fim e avisa se havia valor", () => {
    const r = ajustarMeses(cron, 3);
    expect(r.cronograma.pct).toEqual({ 1: [20, 35, 30], 2: [50, 50, 0] });
    expect(r.cronograma.meses).toBe(3);
    expect(r.cortouValores).toBe(true);
    expect(linhaFecha(r.cronograma.pct[1])).toBe(false);
    expect(ajustarMeses({ meses: 4, pct: { 2: [50, 50, 0, 0] } }, 2).cortouValores).toBe(false);
  });
  it("mesmo número de meses não muda nada; não altera o objeto recebido", () => {
    const copia = JSON.parse(JSON.stringify(cron));
    expect(ajustarMeses(cron, 4)).toEqual({ cronograma: copia, cortouValores: false });
    expect(cron).toEqual(copia);
  });
  it("meses fora de 1 a 60 ou não inteiro lança RangeError", () => {
    for (const n of [0, 61, 2.5, NaN, "3", null]) {
      expect(() => ajustarMeses(cron, n)).toThrow(RangeError);
    }
  });
});

describe("reperiodizarLinha", () => {
  it("20/35/30/15 em 4 meses → 2 meses = 55/45", () => {
    expect(reperiodizarLinha([20, 35, 30, 15], 2)).toEqual([55, 45]);
  });
  it("20/35/30/15 → 8 meses mantém a forma e soma 100,00", () => {
    const r = reperiodizarLinha([20, 35, 30, 15], 8);
    expect(r).toEqual([10, 10, 17.5, 17.5, 15, 15, 7.5, 7.5]);
    expect(somaCentesimos(r)).toBe(10000);
  });
  it("8 → 5", () => {
    const r = reperiodizarLinha([5, 10, 15, 20, 20, 15, 10, 5], 5);
    // limites em 1,6 · 3,2 · 4,8 · 6,4 · 8: C = 11 · 34 · 66 · 89 · 100
    expect(r).toEqual([11, 23, 32, 23, 11]);
    expect(somaCentesimos(r)).toBe(10000);
  });
  it("maior resto: 8 × 12,5 → 3 meses = 33,34/33,33/33,33", () => {
    const r = reperiodizarLinha(new Array(8).fill(12.5), 3);
    expect(r).toEqual([33.34, 33.33, 33.33]);
    expect(somaCentesimos(r)).toBe(10000);
  });
  it("3 → 2 com 33,33/33,33/33,34 fecha 100,00", () => {
    const r = reperiodizarLinha([33.33, 33.33, 33.34], 2);
    expect(r).toEqual([50, 50]);
    expect(somaCentesimos(r)).toBe(10000);
  });
  it("2 → 4 → 2 volta ao original", () => {
    const ida = reperiodizarLinha([55, 45], 4);
    expect(ida).toEqual([27.5, 27.5, 22.5, 22.5]);
    expect(reperiodizarLinha(ida, 2)).toEqual([55, 45]);
  });
  it("linha com meses zerados", () => {
    expect(reperiodizarLinha([0, 0, 50, 50], 2)).toEqual([0, 100]);
    expect(reperiodizarLinha([0, 0, 50, 50], 8)).toEqual([0, 0, 0, 0, 25, 25, 25, 25]);
    expect(reperiodizarLinha([0, 0, 0], 5)).toEqual([0, 0, 0, 0, 0]);
  });
  it("linha que não fecha 100 mantém a soma", () => {
    const r = reperiodizarLinha([20, 30, 10], 2);
    expect(r).toEqual([35, 25]);
    expect(somaCentesimos(r)).toBe(6000);
    const r2 = reperiodizarLinha([10, 10, 10.01], 7);
    expect(somaCentesimos(r2)).toBe(3001);
  });
  it("todo N → M de 1 a 12 fecha 100,00 e não dá % negativo", () => {
    const base = [7.77, 12.34, 0, 25, 18.18, 9.09, 0.01, 27.61];
    expect(somaCentesimos(base)).toBe(10000);
    for (let M = 1; M <= 12; M++) {
      const r = reperiodizarLinha(base, M);
      expect(r).toHaveLength(M);
      expect(somaCentesimos(r)).toBe(10000);
      expect(r.every((v) => v >= 0)).toBe(true);
    }
  });
  it("linha vazia → zeros; meses inválidos lançam RangeError", () => {
    expect(reperiodizarLinha([], 3)).toEqual([0, 0, 0]);
    expect(() => reperiodizarLinha([100], 0)).toThrow(RangeError);
    expect(() => reperiodizarLinha([100], 61)).toThrow(RangeError);
  });
});

describe("reperiodizar", () => {
  it("todas as linhas, meses novos e origem manual", () => {
    const cron = {
      meses: 4,
      pct: { 1: [20, 35, 30, 15], 2: [0, 0, 50, 50] },
      origem: "importado",
      arquivo_nome: "Orcamento SIGO - PM Itatinga.xlsx",
    };
    expect(reperiodizar(cron, 2)).toEqual({
      meses: 2,
      pct: { 1: [55, 45], 2: [0, 100] },
      origem: "manual",
      arquivo_nome: "Orcamento SIGO - PM Itatinga.xlsx",
    });
  });
  it("cronograma vazio continua vazio, com os meses novos", () => {
    expect(reperiodizar({}, 5)).toEqual({ meses: 5, pct: {}, origem: "manual" });
  });
});
