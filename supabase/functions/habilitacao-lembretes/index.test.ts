// node --test supabase/functions/habilitacao-lembretes/index.test.ts
// O index.ts só roda no Deno (Deno.serve), então o teste lê o texto dele. A função é pública (sem JWT): a resposta
// não pode vazar as contagens da fila de todas as empresas.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const fonte = readFileSync(new URL("./index.ts", import.meta.url), "utf8");

test("habilitacao-lembretes: a resposta é só { success: true } (ou o erro genérico), sem as contagens da fila", () => {
  const respostas = [...fonte.matchAll(/return json\((\d+), (\{[^}]*\})\)/g)].map((m) => [
    m[1],
    m[2],
  ]);
  assert.deepEqual(respostas, [
    ["405", '{ error: "method_not_allowed" }'],
    ["200", "{ success: true }"],
    ["500", '{ success: false, error: "Erro interno" }'],
  ]);
  // o resultado de esvaziarFila não é espalhado na resposta (lidos, enviados, falhas, parou)
  assert.ok(!/\.\.\.r\b/.test(fonte), "a resposta não pode espalhar o resultado da fila");
  assert.ok(!/json\(200, \{[^}]*\b(lidos|enviados|falhas|parou)\b/.test(fonte));
});
