// node --test supabase/functions/_shared/orcamento/cronograma.test.ts
// Contas copiadas de apps/web/src/lib/cronograma-ff.test.js e a validação do JSON do conector
// (as mensagens da tela ficam provadas em apps/web/src/lib/cronograma-paridade.test.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_MESES,
  etapasDoOrcamento,
  lerPercentual,
  linhaFecha,
  normalizarCronograma,
  resumoCronograma,
  somaCentesimos,
  validarCronogramaConector,
  valoresDaLinha,
} from "./cronograma.ts";

const soma = (lista: number[]) => lista.reduce((s, v) => s + v, 0);

test("âncora da spec 08/10: etapa de R$ 1.417.472,96 em 20/35/30/15", () => {
  assert.deepEqual(
    valoresDaLinha([20, 35, 30, 15], 141747296),
    [28349459, 49611554, 42524189, 21262094]
  );
});

test("valoresDaLinha: o último mês com % > 0 absorve o centavo; maior resto sem célula negativa", () => {
  assert.deepEqual(valoresDaLinha([33.33, 33.33, 33.34], 100001), [33330, 33330, 33341]);
  assert.deepEqual(valoresDaLinha([0, 25, 25, 50, 0], 99999), [0, 25000, 25000, 49999, 0]);
  assert.deepEqual(valoresDaLinha([33.33, 33.33], 100001), [33330, 33330]);
  const tres = valoresDaLinha([16.67, 16.67, 16.67, 16.67, 16.67, 16.65], 3);
  assert.deepEqual(tres, [1, 1, 1, 0, 0, 0]);
  assert.equal(soma(tres), 3);
  const grande = valoresDaLinha([33.33, 33.33, 33.34], 900000000000001);
  assert.equal(grande[0], 299970000000000);
  assert.equal(soma(grande), 900000000000001);
  assert.deepEqual(valoresDaLinha([], 5000), []);
});

test("lerPercentual: formatos, vazio, inválido e 2 casas antes da faixa", () => {
  assert.equal(lerPercentual(20), 20);
  assert.equal(lerPercentual(" 12,5 % "), 12.5);
  assert.equal(lerPercentual(",5"), 0.5);
  for (const v of ["", "   ", "%", null, undefined]) assert.equal(lerPercentual(v), null);
  for (const v of ["abc", "1.234,5", "-5", "+5", "100,01", 101, -0.5, NaN, "5 0", {}]) {
    assert.ok(Number.isNaN(lerPercentual(v)), String(v));
  }
  assert.equal(lerPercentual("33,335"), 33.34);
  assert.equal(lerPercentual(100.004), 100);
  assert.ok(Number.isNaN(lerPercentual(100.005)));
  assert.ok(Object.is(lerPercentual(-0.004), 0));
});

test("somaCentesimos e linhaFecha", () => {
  assert.equal(somaCentesimos([33.33, 33.33, 33.34]), 10000);
  assert.equal(somaCentesimos([0.1, 0.2]), 30);
  assert.equal(linhaFecha([20, 35, 30, 15]), true);
  assert.equal(linhaFecha([20, 35, 30, 14.99]), false);
  assert.equal(linhaFecha([]), false);
});

test("normalizarCronograma: vazio, corte, % inválido e meses fora da faixa", () => {
  for (const v of [{}, null, undefined, "x", 5, [1, 2], { meses: "abc" }]) {
    assert.deepEqual(normalizarCronograma(v), { meses: 0, pct: {} });
  }
  assert.deepEqual(
    normalizarCronograma({
      meses: 3,
      pct: { 1: [20, 35, 30, 15], 2: [50], 3: [-1, 101, "20"], 4: "x", 5: [33.333, null, 0] },
      origem: "importado",
      arquivo_nome: "via Claude",
      atualizado_em: "2026-10-08T12:00:00.000Z",
    }),
    {
      meses: 3,
      pct: { 1: [20, 35, 30], 2: [50, 0, 0], 3: [0, 0, 0], 5: [33.33, 0, 0] },
      origem: "importado",
      arquivo_nome: "via Claude",
      atualizado_em: "2026-10-08T12:00:00.000Z",
    }
  );
  assert.equal(normalizarCronograma({ meses: 99, pct: {} }).meses, MAX_MESES);
  assert.deepEqual(normalizarCronograma({ meses: 1, pct: [], origem: "outra" }), {
    meses: 1,
    pct: {},
  });
});

test("etapasDoOrcamento: só nível 1, na ordem da tela, com o subtotal em centavos", () => {
  assert.deepEqual(
    etapasDoOrcamento([
      { id: "e2", etapa: true, numero: "2", descricao: "POSTES", ordem: 3 },
      { id: "i21", etapa: false, numero: "2.1", valor_total: 21032.94, ordem: 4 },
      { id: "e1", etapa: true, numero: "1", descricao: "PRELIMINARES", ordem: 0 },
      { id: "e11", etapa: true, numero: "1.1", descricao: "Sub", ordem: 1 },
      { id: "i111", etapa: false, numero: "1.1.1", valor_total: 1315.24, ordem: 2 },
      { id: "i12", etapa: false, numero: "1.2", valor_total: "0.01", ordem: 2 },
      { id: "e3", etapa: true, numero: "3", descricao: "VAZIA", ordem: 5 },
      { id: "x", etapa: true, numero: null, descricao: "sem número", ordem: 6 },
    ]),
    [
      { numero: "1", descricao: "PRELIMINARES", centavos: 131525 },
      { numero: "2", descricao: "POSTES", centavos: 2103294 },
      { numero: "3", descricao: "VAZIA", centavos: 0 },
    ]
  );
});

test("resumoCronograma: linhas, meses acumulados e órfãs", () => {
  const etapas = [
    { numero: "1", descricao: "PRELIMINARES", centavos: 100000 },
    { numero: "2", descricao: "POSTES", centavos: 50001 },
    { numero: "3", descricao: "SEM LINHA", centavos: 0 },
  ];
  const r = resumoCronograma(etapas, {
    meses: 4,
    pct: { 1: [20, 35, 30, 15], 2: [0, 50, 50, 0], 9: [100, 0, 0, 0], 10: [0, 0, 0, 0] },
  });
  assert.equal(r.totalCentavos, 150001);
  assert.deepEqual(r.linhas[1].valores, [0, 25001, 25000, 0]);
  assert.deepEqual(r.linhas[2], {
    numero: "3",
    descricao: "SEM LINHA",
    centavos: 0,
    peso: 0,
    pct: [0, 0, 0, 0],
    valores: [0, 0, 0, 0],
    fecha: false,
    diferenca: 100,
  });
  assert.deepEqual(r.meses, [
    { centavos: 20000, pct: 13.33, acumCentavos: 20000, acumPct: 13.33 },
    { centavos: 60001, pct: 40, acumCentavos: 80001, acumPct: 53.33 },
    { centavos: 55000, pct: 36.67, acumCentavos: 135001, acumPct: 90 },
    { centavos: 15000, pct: 10, acumCentavos: 150001, acumPct: 100 },
  ]);
  assert.equal(r.todasFecham, false);
  assert.deepEqual(r.orfas, ["9", "10"]);
});

// ─── validarCronogramaConector ─────────────────────────────────────────────

test("validarCronogramaConector: caminho feliz, linha curta completa com 0", () => {
  const r = validarCronogramaConector(
    4,
    [
      { item: "1", pct: [20, 35, 30, 15] },
      { item: 2, pct: ["0", "50", "50"] },
    ],
    ["1", "2"]
  );
  assert.deepEqual(r.erros, []);
  assert.deepEqual(r.avisos, []);
  assert.deepEqual(r.naoEtapas, []);
  assert.deepEqual(r.cronograma, {
    meses: 4,
    pct: { 1: [20, 35, 30, 15], 2: [0, 50, 50, 0] },
    origem: "importado",
  });
  assert.deepEqual(r.resumo, { meses: 4, linhas: 2, ignoradas: 0, faltando: 0 });
});

test("validarCronogramaConector: meses fora de 1 a 60 (ou não inteiro) é erro", () => {
  for (const meses of [0, 61, 2.5, "4", null, undefined]) {
    const r = validarCronogramaConector(meses, [{ item: "1", pct: [100] }], ["1"]);
    assert.deepEqual(r.erros, ["O número de meses vai de 1 a 60"], String(meses));
    assert.equal(r.cronograma, null);
  }
  assert.deepEqual(validarCronogramaConector(60, [{ item: "1", pct: [100] }], ["1"]).erros, []);
});

test("validarCronogramaConector: pct mais longo que meses é erro", () => {
  const r = validarCronogramaConector(3, [{ item: "1", pct: [20, 35, 30, 15] }], ["1"]);
  assert.deepEqual(r.erros, ["Linha 2: tem 4 meses, mais que os 3 informados."]);
  assert.equal(r.cronograma, null);
});

test("validarCronogramaConector: item que não é etapa de nível 1 vai para naoEtapas (o conector bloqueia)", () => {
  const r = validarCronogramaConector(
    4,
    [
      { item: "1", pct: [100, 0, 0, 0] },
      { item: "1.1", pct: [100, 0, 0, 0] },
      { item: "9", pct: [0, 0, 0, 0] },
    ],
    ["1", "2", "3"]
  );
  assert.deepEqual(r.erros, []);
  assert.deepEqual(r.naoEtapas, ["1.1", "9"]);
  assert.deepEqual(r.avisos, [
    "Linha 3: Item 1.1 não é etapa do orçamento; foi ignorado.",
    "Linha 4: Item 9 não é etapa do orçamento; foi ignorado.",
    "Etapa 2 do orçamento sem linha no cronograma; fica vazia.",
    "Etapa 3 do orçamento sem linha no cronograma; fica vazia.",
  ]);
  assert.deepEqual(r.resumo, { meses: 4, linhas: 1, ignoradas: 2, faltando: 2 });
});

test("validarCronogramaConector: % inválido, repetido e linha que não fecha (só aviso)", () => {
  const erro = validarCronogramaConector(
    4,
    [
      { item: "1", pct: [-5, 120, "abc", "-3"] },
      { item: "2", pct: [100, 0, 0, 0] },
      { item: "2", pct: [0, 0, 0, 100] },
    ],
    ["1", "2"]
  );
  assert.equal(erro.cronograma, null);
  assert.deepEqual(erro.erros, [
    "Linha 2, Mês 1: % negativo (-5).",
    "Linha 2, Mês 2: % acima de 100 (120).",
    'Linha 2, Mês 3: "abc" não é um % de 0 a 100.',
    'Linha 2, Mês 4: "-3" não é um % de 0 a 100.',
    "Linha 4: Item 2 repetido (já está na linha 3).",
  ]);
  const aviso = validarCronogramaConector(4, [{ item: "1", pct: [20, 35, 30, 14.99] }], ["1"]);
  assert.deepEqual(aviso.erros, []);
  assert.deepEqual(aviso.avisos, [
    "Linha 2: a etapa 1 soma 99,99%, e não 100,00%; fica vermelha até ser corrigida.",
  ]);
});

test("validarCronogramaConector: linhas vazias, sem Item e sem nenhuma etapa", () => {
  const r = validarCronogramaConector(
    2,
    [
      { item: null, pct: [] },
      { item: "", pct: [10, 0] },
      { item: "1", pct: [50, 50] },
    ],
    ["1"]
  );
  assert.deepEqual(r.erros, []);
  assert.deepEqual(r.avisos, ["Linha 3: linha sem Item; foi ignorada."]);
  assert.deepEqual(r.resumo, { meses: 2, linhas: 1, ignoradas: 1, faltando: 0 });
  assert.deepEqual(validarCronogramaConector(2, [], ["1"]).erros, [
    'A aba "Cronograma" não tem linhas preenchidas.',
  ]);
  assert.deepEqual(validarCronogramaConector(2, [{ item: "7", pct: [100] }], ["1"]).erros, [
    'Nenhuma linha da aba "Cronograma" tem o Item de uma etapa do orçamento.',
  ]);
});

// ─── Entrada malformada: o despacho só confere campos a mais, não os tipos ───────────────────

test("validarCronogramaConector: linha que não é objeto e pct que não é lista são erro", () => {
  const ruim = (v: unknown) => v as never;
  const r = validarCronogramaConector(
    2,
    [
      ruim("1"),
      { item: "1", pct: ruim("50,50") },
      ruim(null),
      { item: "2", pct: ruim({ 0: 100 }) },
      { item: "3", pct: [50, 50] },
      { item: "9", pct: ruim("x") },
      { item: null, pct: ruim(5) },
      ruim([1, 2]),
      { item: ruim({ a: 1 }), pct: [50, 50] },
    ],
    ["1", "2", "3"]
  );
  assert.deepEqual(r.erros, [
    "Linha 2: a linha deve ser um objeto { item, pct }.",
    "Linha 3: pct deve ser uma lista de percentuais, um por mês.",
    "Linha 5: pct deve ser uma lista de percentuais, um por mês.",
    "Linha 9: a linha deve ser um objeto { item, pct }.",
    "Linha 10: Item deve ser texto ou número.",
  ]);
  assert.equal(r.cronograma, null);
  // item que não é etapa e linha sem Item seguem como na tela: avisados e ignorados
  assert.deepEqual(r.naoEtapas, ["9"]);
  assert.ok(r.avisos.includes("Linha 8: linha sem Item; foi ignorada."));
});
