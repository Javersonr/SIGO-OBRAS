// node --test supabase/functions/_shared/orcamento/numeros.test.ts
// Casos copiados de apps/web/src/lib/orcamento-modelo.test.js (describe "lerNumeroBR").
import { test } from "node:test";
import assert from "node:assert/strict";
import { lerNumeroBR } from "./numeros.ts";

const NBSP = String.fromCharCode(0xa0);

test("lerNumeroBR: números e textos pt-BR", () => {
  assert.equal(lerNumeroBR(12.5), 12.5);
  assert.equal(lerNumeroBR(-3), -3);
  assert.equal(lerNumeroBR("1.234,56"), 1234.56);
  assert.equal(lerNumeroBR("12,5"), 12.5);
  assert.equal(lerNumeroBR("1234.56"), 1234.56);
  assert.equal(lerNumeroBR(" R$ 1.234,56 "), 1234.56);
  assert.equal(lerNumeroBR(`R$${NBSP}1.234,56`), 1234.56); // formatBRL usa espaço não separável
  assert.equal(lerNumeroBR("1.234.567,89"), 1234567.89);
  assert.equal(lerNumeroBR("1.234.567"), 1234567);
  assert.equal(lerNumeroBR("1,234.56"), 1234.56);
  assert.equal(lerNumeroBR("-3,5"), -3.5);
});

test("lerNumeroBR: vazio → null; inválido → NaN", () => {
  assert.equal(lerNumeroBR(null), null);
  assert.equal(lerNumeroBR(undefined), null);
  assert.equal(lerNumeroBR(""), null);
  assert.equal(lerNumeroBR("   "), null);
  assert.ok(Number.isNaN(lerNumeroBR("abc")));
  assert.ok(Number.isNaN(lerNumeroBR("1,2,3")));
  assert.ok(Number.isNaN(lerNumeroBR(Infinity)));
  assert.ok(Number.isNaN(lerNumeroBR(true)));
});
