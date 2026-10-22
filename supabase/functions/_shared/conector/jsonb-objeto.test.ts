// node --test supabase/functions/_shared/conector/jsonb-objeto.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { jsonbComoObjeto } from "./jsonb-objeto.ts";

test("jsonbComoObjeto: objeto fica como está; texto JSON de objeto (jsonb que o legado gravou como string) vira objeto", () => {
  const objeto = { a: 1, b: { c: [1, 2] } };
  assert.equal(jsonbComoObjeto(objeto), objeto);
  assert.deepEqual(jsonbComoObjeto('{"a":1,"b":{"c":[1,2]}}'), objeto);
  assert.deepEqual(jsonbComoObjeto("  {}  "), {});
  assert.deepEqual(jsonbComoObjeto({}), {});
});

test("jsonbComoObjeto: o que não é objeto (lista, texto que não é JSON, número, nulo) devolve null, sem lançar", () => {
  for (const ruim of [
    null,
    undefined,
    [],
    [1, 2],
    "[1,2]",
    "texto solto",
    "",
    "{quebrado",
    "null",
    "123",
    '"texto"',
    "true",
    42,
    true,
  ]) {
    assert.equal(jsonbComoObjeto(ruim), null, JSON.stringify(ruim));
  }
});

test("jsonb-objeto.ts é puro (sem Deno, sem import) e as ferramentas e o data-sessao não têm mais a própria cópia", () => {
  const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8");
  const modulo = ler("./jsonb-objeto.ts");
  assert.ok(!/\bDeno\./.test(modulo), "usa Deno.*");
  assert.ok(!/^\s*import\s/m.test(modulo), "importa algo");
  assert.ok(!/npm:|https?:\/\//.test(modulo.replace(/\/\*[\s\S]*?\*\//g, "")), "import de URL");
  for (const [arquivo, copia] of [
    ["../../mcp/ferramentas-habilitacao.ts", /function analiseDe\b/],
    ["../../mcp/ferramentas-documentos.ts", /function objetoDoJson\b/],
    ["../habilitacao/data-sessao.ts", /function objetoDe\b/],
  ] as const) {
    const fonte = ler(arquivo);
    assert.ok(!copia.test(fonte), `${arquivo} ainda tem a própria cópia`);
    assert.ok(fonte.includes("jsonbComoObjeto"), `${arquivo} não usa jsonbComoObjeto`);
  }
});
