// node --test supabase/functions/_shared/habilitacao/data-sessao.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { dataDaSessao } from "./data-sessao.ts";

const HOJE = "2026-10-13";
const edital = (data: unknown) => ({ extraido: { datas: { sessao: { data } } } });

test("dataDaSessao: a coluna licitacao_data da oportunidade vale quando está preenchida", () => {
  const r = dataDaSessao(
    { licitacao_data: "2026-11-20", edital_analise: edital("2026-11-05") },
    HOJE
  );
  assert.deepEqual(r, { data: "2026-11-20", origem: "oportunidade", futura: "2026-11-20" });
});

test("dataDaSessao: sem a coluna, cai na data da sessão do edital", () => {
  for (const coluna of [null, undefined, "", "   "]) {
    const r = dataDaSessao({ licitacao_data: coluna, edital_analise: edital("2026-11-05") }, HOJE);
    assert.deepEqual(r, { data: "2026-11-05", origem: "edital", futura: "2026-11-05" });
  }
  // o edital pode vir como texto (jsonb legado)
  const texto = dataDaSessao({ edital_analise: JSON.stringify(edital("2026-11-05")) }, HOJE);
  assert.deepEqual(texto, { data: "2026-11-05", origem: "edital", futura: "2026-11-05" });
});

test("dataDaSessao: valor inválido na coluna é ignorado (cai no edital); inválido nos dois, nenhuma data", () => {
  const invalidos = [
    "05/11/2026",
    "2026-02-30",
    "2026-13-01",
    "2026-11-5",
    "2026-11-05T10:00:00Z", // o formato é só a data
    "2026-11-05 ",
    " 2026-11-05",
    20261105,
    {},
    "amanhã",
  ];
  for (const ruim of invalidos) {
    const r = dataDaSessao({ licitacao_data: ruim, edital_analise: edital("2026-11-05") }, HOJE);
    assert.equal(r.origem, "edital", String(ruim));
    assert.equal(r.futura, "2026-11-05");
    const nenhuma = dataDaSessao({ licitacao_data: ruim, edital_analise: edital(ruim) }, HOJE);
    assert.deepEqual(nenhuma, { data: null, origem: null, futura: null }, String(ruim));
  }
});

test("dataDaSessao: nem coluna nem edital → nenhuma data", () => {
  const vazio = { data: null, origem: null, futura: null };
  assert.deepEqual(dataDaSessao({ licitacao_data: null, edital_analise: null }, HOJE), vazio);
  assert.deepEqual(dataDaSessao({ edital_analise: {} }, HOJE), vazio);
  assert.deepEqual(dataDaSessao({ edital_analise: "não é json" }, HOJE), vazio);
  assert.deepEqual(dataDaSessao({ edital_analise: [] }, HOJE), vazio);
  assert.deepEqual(dataDaSessao({}, HOJE), vazio);
  assert.deepEqual(dataDaSessao(null, HOJE), vazio);
  assert.deepEqual(dataDaSessao(undefined, HOJE), vazio);
});

test("dataDaSessao: coluna no passado com edital no futuro → vale a coluna (o usuário corrigiu): sem data futura", () => {
  const r = dataDaSessao(
    { licitacao_data: "2026-10-01", edital_analise: edital("2026-11-05") },
    HOJE
  );
  assert.deepEqual(r, { data: "2026-10-01", origem: "oportunidade", futura: null });
});

test("dataDaSessao: edital no passado sem coluna → sem data futura (a data fica em `data`)", () => {
  const r = dataDaSessao({ licitacao_data: null, edital_analise: edital("2026-10-01") }, HOJE);
  assert.deepEqual(r, { data: "2026-10-01", origem: "edital", futura: null });
});

test("dataDaSessao: a fronteira é o dia de hoje (hoje não é futuro; amanhã é)", () => {
  assert.equal(dataDaSessao({ licitacao_data: "2026-10-13" }, HOJE).futura, null);
  assert.equal(dataDaSessao({ licitacao_data: "2026-10-14" }, HOJE).futura, "2026-10-14");
  assert.equal(dataDaSessao({ edital_analise: edital("2026-10-13") }, HOJE).futura, null);
  assert.equal(dataDaSessao({ edital_analise: edital("2026-10-14") }, HOJE).futura, "2026-10-14");
});
