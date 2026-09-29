// Roda com Node 23.6+ (type stripping):  node --test supabase/functions/_shared/ia-cotas.test.ts
// ou com Deno:                           deno test supabase/functions/_shared/ia-cotas.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACOES_EDITAL,
  ACOES_GERAIS,
  CHAVE_COTA_EDITAL,
  CHAVE_COTA_GERAL,
  COTA_EDITAL_PADRAO,
  COTA_GERAL_PADRAO,
  ehAcaoEdital,
  ehAcaoGeral,
  lerCota,
} from "./ia-cotas.ts";

test("padrões e chaves das duas cotas", () => {
  assert.equal(COTA_EDITAL_PADRAO, 400);
  assert.equal(COTA_GERAL_PADRAO, 300);
  assert.equal(CHAVE_COTA_EDITAL, "ia_cota_edital_dia");
  assert.equal(CHAVE_COTA_GERAL, "ia_cota_geral_dia");
});

test("ehAcaoEdital só para as 3 ações de edital", () => {
  assert.equal(ehAcaoEdital("edital_atende"), true);
  assert.equal(ehAcaoEdital("edital_xyz"), false);
  assert.equal(ehAcaoEdital("llm"), false);
});

test("ehAcaoGeral só para as 4 ações da cota geral", () => {
  for (const acao of ["llm", "extrair_documentos", "validar_exames_pcmso"]) {
    assert.equal(ehAcaoGeral(acao), true);
  }
  assert.equal(ehAcaoGeral("financeiro_ler_documento"), true);
  assert.deepEqual(
    [...ACOES_GERAIS],
    ["llm", "extrair_documentos", "validar_exames_pcmso", "financeiro_ler_documento"]
  );
  // edital tem cota própria: nunca entra na geral
  assert.equal(ehAcaoGeral("edital_consolidar"), false);
  assert.equal(ehAcaoGeral("edital_atende"), false);
  assert.equal(ehAcaoGeral("xyz"), false);
  assert.equal(ehAcaoGeral(""), false);
  assert.equal(ehAcaoGeral(undefined), false);
  assert.equal(ehAcaoGeral(null), false);
  assert.equal(ehAcaoGeral(42), false);
  assert.equal(ehAcaoGeral(["llm"]), false);
  // as duas listas nunca se sobrepõem (uma requisição conta em uma cota só)
  assert.equal(
    ACOES_EDITAL.some((a) => (ACOES_GERAIS as readonly string[]).includes(a)),
    false
  );
});

test("lerCota: inteiro ≥ 1, senão o padrão", () => {
  assert.equal(lerCota("50"), 50);
  assert.equal(lerCota(" 1000 "), 1000);
  assert.equal(lerCota("0"), COTA_EDITAL_PADRAO);
  assert.equal(lerCota("abc"), COTA_EDITAL_PADRAO);
  assert.equal(lerCota(null), COTA_EDITAL_PADRAO);
  assert.equal(lerCota("2.5"), COTA_EDITAL_PADRAO);
});

test("lerCota: o padrão é o 2º parâmetro (edital 400, geral 300)", () => {
  assert.equal(lerCota(undefined, COTA_GERAL_PADRAO), 300);
  assert.equal(lerCota("0", COTA_GERAL_PADRAO), 300);
  assert.equal(lerCota("abc", 7), 7);
  assert.equal(lerCota(" 25 ", COTA_GERAL_PADRAO), 25);
  assert.equal(lerCota(80, COTA_GERAL_PADRAO), 80);
});
