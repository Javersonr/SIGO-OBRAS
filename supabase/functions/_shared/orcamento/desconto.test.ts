// node --test supabase/functions/_shared/orcamento/desconto.test.ts
// Casos copiados de apps/web/src/lib/orcamento-desconto.test.js, mais as âncoras da spec 08/10 §6.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aplicarDesconto,
  precoComDesconto,
  resumoOrcamento,
  subtotaisEtapas,
  totalLinha,
  validarDesconto,
  type ItemOrcamento,
} from "./desconto.ts";

// os testes de entrada inválida passam o que o tipo não deixa (como o front em JS)
const qualquer = (v: unknown) => v as number;

test("âncoras da spec 08/10: Itatinga com 12,35% (item 1.1) e o exemplo do §8", () => {
  assert.equal(precoComDesconto(3505.49, 12.35), 3072.56);
  assert.equal(totalLinha(6, 3072.56), 18435.36);
  assert.equal(precoComDesconto(10.48, 12.35), 9.18);
  assert.equal(totalLinha(125.5, 9.18), 1152.09);
});

test("precoComDesconto: corta na 2ª casa, nunca arredonda", () => {
  assert.equal(precoComDesconto(10.4899, 12.35), 9.19); // 9,19439735
  assert.equal(precoComDesconto(2827.9249, 12.35), 2478.67); // 2.478,6761…
  assert.equal(precoComDesconto(10.48, 0), 10.48);
  assert.equal(precoComDesconto(10.4899, 0), 10.48);
  assert.equal(precoComDesconto(0.29, 0), 0.29); // Math.floor(0.29 * 100) / 100 daria 0,28
  assert.equal(precoComDesconto(1.15, 0), 1.15); // Math.floor(1.15 * 100) / 100 daria 1,14
  assert.equal(precoComDesconto(10.48, 99.99), 0); // 0,001048
  assert.equal(precoComDesconto(1234.5678, 99.99), 0.12); // 0,12345678
  assert.equal(precoComDesconto(0, 0), 0);
  assert.equal(precoComDesconto(0, 99.99), 0);
});

test("precoComDesconto: nunca passa de referência × (1 − d) e fica a menos de 1 centavo dele", () => {
  for (const ref of [0.01, 0.29, 1.005, 10.48, 99.9999, 2827.92]) {
    const unit = precoComDesconto(ref, 12.35);
    assert.ok(unit <= ref * 0.8765 + 1e-9, String(ref));
    assert.ok(unit + 0.01 > ref * 0.8765 - 1e-9, String(ref));
    assert.equal(Math.round(unit * 100) / 100, unit);
  }
});

test("precoComDesconto: desconto ou referência inválidos lançam RangeError (sem coerção)", () => {
  for (const pct of [NaN, Infinity, 100, 99.991, -1, "12,35", "12.35", undefined, null]) {
    assert.throws(() => precoComDesconto(10, qualquer(pct)), RangeError, String(pct));
  }
  assert.throws(() => precoComDesconto(10, 100), { message: "Desconto fora de 0 a 99,99%" });
  for (const ref of [undefined, null, NaN, Infinity, "10.48", -10]) {
    assert.throws(() => precoComDesconto(qualquer(ref), 10), RangeError, String(ref));
  }
  assert.throws(() => precoComDesconto(qualquer(undefined), 10), {
    message: "Preço de referência inválido",
  });
});

test("totalLinha: meio para cima, sem erro de ponto flutuante, BigInt acima de 2^53", () => {
  assert.equal(totalLinha(100, 0.29), 29); // 0.29 * 100 = 28.999999999999996
  assert.equal(totalLinha(1, 1.005), 1.01);
  assert.equal(totalLinha(3, 0.1), 0.3);
  assert.equal(totalLinha(1, 0.125), 0.13);
  assert.equal(totalLinha(2.345, 3.3333), 7.82); // 7,8165885
  assert.equal(totalLinha(123456.789, 98765.4321), 12193263111.26);
  assert.equal(totalLinha(442591.303, 86956.6132), 38486240740.65);
  assert.equal(totalLinha(571643.263, 30695), 17546589957.79);
});

test("totalLinha: null quando falta um dos dois; texto numérico estrito; inválido é null", () => {
  assert.equal(totalLinha(null, 10), null);
  assert.equal(totalLinha(10, undefined), null);
  assert.equal(totalLinha(0, 10), 0);
  assert.equal(totalLinha("125.5", "9.18"), 1152.09);
  assert.equal(totalLinha(".5", 10), 5);
  assert.equal(totalLinha("5.", 2), 10);
  assert.equal(totalLinha(" 2 ", "3.5"), 7);
  for (const [q, u] of [
    ["", 3],
    ["   ", 3],
    ["abc", 3],
    ["1,5", 2],
    ["12abc", 2],
    ["10 un", 2],
    ["1.234,56", 1],
    ["1e3", 1],
    [2, "1,5"],
    [NaN, 2],
    [2, Infinity],
  ]) {
    assert.equal(totalLinha(q, u), null, `${q} × ${u}`);
  }
});

test("validarDesconto: aceita vírgula, ponto, número, espaços e %", () => {
  assert.deepEqual(validarDesconto("12,35"), { ok: true, valor: 12.35 });
  assert.deepEqual(validarDesconto("12.35"), { ok: true, valor: 12.35 });
  assert.deepEqual(validarDesconto(12.35), { ok: true, valor: 12.35 });
  assert.deepEqual(validarDesconto(" 12,35 % "), { ok: true, valor: 12.35 });
  assert.deepEqual(validarDesconto("0"), { ok: true, valor: 0 });
  assert.deepEqual(validarDesconto("99,99"), { ok: true, valor: 99.99 });
  assert.deepEqual(validarDesconto("12,350"), { ok: true, valor: 12.35 });
  const zero = validarDesconto("-0");
  assert.ok(zero.ok && Object.is(zero.valor, 0)); // "-0" não vira −0
});

test("validarDesconto: mensagens de erro", () => {
  assert.deepEqual(validarDesconto(""), { ok: false, erro: "Informe o desconto em %" });
  assert.deepEqual(validarDesconto("   "), { ok: false, erro: "Informe o desconto em %" });
  assert.deepEqual(validarDesconto(null), { ok: false, erro: "Informe o desconto em %" });
  assert.deepEqual(validarDesconto("abc"), { ok: false, erro: "Desconto inválido" });
  assert.deepEqual(validarDesconto("1,2,3"), { ok: false, erro: "Desconto inválido" });
  assert.deepEqual(validarDesconto("100"), { ok: false, erro: "O desconto vai de 0 a 99,99%" });
  assert.deepEqual(validarDesconto("-1"), { ok: false, erro: "O desconto vai de 0 a 99,99%" });
  assert.deepEqual(validarDesconto("12,345"), {
    ok: false,
    erro: "Use no máximo 2 casas decimais",
  });
});

test("aplicarDesconto: só os itens com referência; etapas e itens manuais ficam de fora", () => {
  const itens: ItemOrcamento[] = [
    { id: "e1", numero: "1", etapa: true, valor_unitario_ref: null },
    { id: "i1", numero: "1.1", etapa: false, quantidade: 125.5, valor_unitario_ref: 10.48 },
    { id: "i2", numero: "1.2", etapa: false, quantidade: 2, valor_unitario_ref: null },
  ];
  assert.deepEqual(aplicarDesconto(itens, 12.35), [
    { id: "i1", valor_unitario: 9.18, valor_total: 1152.09 },
  ]);
  assert.deepEqual(aplicarDesconto(itens, 0), [
    { id: "i1", valor_unitario: 10.48, valor_total: 1315.24 },
  ]);
  const texto: ItemOrcamento[] = [
    { id: "i1", etapa: false, quantidade: "125.5", valor_unitario_ref: "10.48" },
  ];
  assert.deepEqual(aplicarDesconto(texto, 12.35), [
    { id: "i1", valor_unitario: 9.18, valor_total: 1152.09 },
  ]);
  const semQtd: ItemOrcamento[] = [
    { id: "i1", etapa: false, quantidade: null, valor_unitario_ref: 10.48 },
  ];
  assert.deepEqual(aplicarDesconto(semQtd, 12.35), [
    { id: "i1", valor_unitario: 9.18, valor_total: 0 },
  ]);
});

test("aplicarDesconto: desconto ou referência inválidos lançam em vez de gravar o preço cheio", () => {
  const itens: ItemOrcamento[] = [
    { id: "i1", etapa: false, quantidade: 2, valor_unitario_ref: 10 },
  ];
  for (const pct of ["abc", "12,35", 100, NaN, undefined]) {
    assert.throws(() => aplicarDesconto(itens, qualquer(pct)), RangeError, String(pct));
  }
  const negativo: ItemOrcamento[] = [
    { id: "i1", etapa: false, quantidade: 2, valor_unitario_ref: -10 },
  ];
  assert.throws(() => aplicarDesconto(negativo, 10), { message: "Preço de referência inválido" });
});

test("subtotaisEtapas: aninhadas, em centavos, sem confundir 1.2 com 1.20", () => {
  const sub = subtotaisEtapas([
    { numero: "1", etapa: true },
    { numero: "1.1", etapa: false, valor_total: 100.1 },
    { numero: "1.2", etapa: true },
    { numero: "1.2.1", etapa: false, valor_total: 0.2 },
    { numero: "1.20", etapa: true },
    { numero: "1.20.1", etapa: false, valor_total: 5 },
    { numero: "2", etapa: true },
    { numero: "3", etapa: false, valor_total: 7 },
  ]);
  assert.deepEqual(Object.keys(sub).sort(), ["1", "1.2", "1.20", "2"]);
  assert.equal(sub["1"], 105.3);
  assert.equal(sub["1.2"], 0.2);
  assert.equal(sub["1.20"], 5);
  assert.equal(sub["2"], 0);
  const texto = subtotaisEtapas([
    { numero: "1", etapa: true },
    { numero: "1.1", etapa: false, valor_total: "100.10" },
    { numero: "1.2", etapa: false, valor_total: "1.234,56" },
    { numero: "1.3", etapa: false, valor_total: null },
  ]);
  assert.equal(texto["1"], 100.1);
});

test("resumoOrcamento: totais, desconto real e item sem referência", () => {
  assert.deepEqual(
    resumoOrcamento([
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
    ]),
    {
      totalReferencia: 1315.24,
      totalProposta: 1652.09,
      descontoReal: 12.4,
      itensSemReferencia: 1,
      qtdItens: 2,
      qtdEtapas: 1,
    }
  );
  assert.deepEqual(
    resumoOrcamento([
      { numero: "1", etapa: true },
      { etapa: false, quantidade: 100, valor_unitario_ref: 0.29, valor_total: 20 },
      { etapa: false, quantidade: 3, valor_unitario_ref: 0.1, valor_total: 0.2 },
      { etapa: false, quantidade: null, valor_unitario_ref: 5, valor_total: 0 },
      { etapa: false, quantidade: "2.5", valor_unitario_ref: "4", valor_total: 8 },
    ]),
    {
      totalReferencia: 39.3,
      totalProposta: 28.2,
      descontoReal: 28.24,
      itensSemReferencia: 0,
      qtdItens: 4,
      qtdEtapas: 1,
    }
  );
  const invalido = resumoOrcamento([
    { numero: "1.1", etapa: false, quantidade: 1, valor_unitario_ref: 10, valor_total: "1.234,56" },
  ]);
  assert.equal(invalido.totalProposta, 0);
  assert.equal(invalido.totalReferencia, 10);
  assert.deepEqual(resumoOrcamento([]), {
    totalReferencia: 0,
    totalProposta: 0,
    descontoReal: 0,
    itensSemReferencia: 0,
    qtdItens: 0,
    qtdEtapas: 0,
  });
});
