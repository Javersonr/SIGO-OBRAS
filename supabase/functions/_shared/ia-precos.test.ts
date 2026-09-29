// Roda com Node 23.6+ (type stripping):  node --test supabase/functions/_shared/ia-precos.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { custoUsd, precoDoModelo, REAJUSTE_GEMINI_FLASH } from "./ia-precos.ts";

const EM_2026 = new Date("2026-12-31T23:59:59Z");
const EM_2027 = new Date("2027-01-01T00:00:00Z");
const uso = (input_tokens: number, output_tokens: number) => ({ input_tokens, output_tokens });

test("flash-lite: preço fixo por 1M tokens", () => {
  assert.equal(custoUsd("gemini-3.5-flash-lite", uso(1_000_000, 1_000_000), EM_2026), 2.8);
  // 2000 × 0,25 + 1000 × 1,50 = 2000 micro-US$
  assert.equal(custoUsd("gemini-3.1-flash-lite", uso(2000, 1000), EM_2026), 0.002);
});

test("gemini-3.8-flash muda de preço em 01/01/2027 (UTC)", () => {
  assert.equal(REAJUSTE_GEMINI_FLASH.toISOString(), "2027-01-01T00:00:00.000Z");
  // 10000 × 0,75 + 2000 × 3,75 = 15000 micro-US$
  assert.equal(custoUsd("gemini-3.8-flash", uso(10_000, 2000), EM_2026), 0.015);
  // 10000 × 1,50 + 2000 × 7,50 = 30000 micro-US$
  assert.equal(custoUsd("gemini-3.8-flash", uso(10_000, 2000), EM_2027), 0.03);
  // 3.7 e 3.6-flash seguem a mesma tabela; sufixo de versão casa com o base
  assert.equal(custoUsd("gemini-3.7-flash", uso(10_000, 2000), EM_2027), 0.03);
  assert.equal(custoUsd("gemini-3.6-flash-preview", uso(10_000, 2000), EM_2026), 0.015);
  // "-lite" é OUTRO modelo (sem preço na tabela)
  assert.equal(custoUsd("gemini-3.8-flash-lite", uso(10_000, 2000), EM_2026), null);
});

test("gemini-3.1-pro-preview: faixa cara acima de 200 mil tokens de entrada", () => {
  // 200000 × 2 + 1000 × 12 = 412000 micro-US$
  assert.equal(custoUsd("gemini-3.1-pro-preview", uso(200_000, 1000), EM_2026), 0.412);
  // 200001 × 4 + 1000 × 18 = 818004 micro-US$
  assert.equal(custoUsd("gemini-3.1-pro-preview", uso(200_001, 1000), EM_2026), 0.818004);
  assert.deepEqual(precoDoModelo("gemini-3.1-pro-preview", 250_000), { entrada: 4, saida: 18 });
});

test("OpenAI: mini não é confundido com o gpt-4o; versão datada casa", () => {
  assert.equal(custoUsd("gpt-4o-mini", uso(1000, 1000)), 0.00075);
  assert.equal(custoUsd("gpt-4o-mini-2024-07-18", uso(1000, 1000)), 0.00075);
  assert.equal(custoUsd("gpt-4o", uso(1000, 1000)), 0.0125);
  assert.equal(custoUsd("gpt-4o-2024-08-06", uso(1000, 1000)), 0.0125);
});

test("normaliza o nome (maiúsculas, espaços, prefixo models/)", () => {
  assert.equal(custoUsd(" GPT-4o ", uso(1000, 1000)), 0.0125);
  assert.equal(custoUsd("models/gemini-3.5-flash-lite", uso(1000, 0), EM_2026), 0.0003);
});

test("modelo desconhecido → null; sem uso ou tokens inválidos → 0", () => {
  assert.equal(custoUsd("gpt-5", uso(1000, 1000)), null);
  assert.equal(custoUsd("gemini-2.5-flash", uso(1000, 1000)), null);
  assert.equal(custoUsd(undefined, uso(1000, 1000)), null);
  assert.equal(custoUsd("", uso(1000, 1000)), null);
  assert.equal(precoDoModelo("claude-x"), null);
  assert.equal(custoUsd("gpt-4o", undefined), 0);
  assert.equal(custoUsd("gpt-4o", { input_tokens: -5, output_tokens: Number.NaN }), 0);
});

test("arredonda em micro-dólar (6 casas, igual ao numeric(12,6))", () => {
  // 7 × 2,5 + 3 × 10 = 47,5 micro-US$ → 48
  assert.equal(custoUsd("gpt-4o", uso(7, 3)), 0.000048);
});
