// node --test supabase/functions/_shared/habilitacao/listas-fechadas.test.ts
// As listas fechadas do código e as regras das migrações não derivam em silêncio: o banco recusa o que o código
// aceita (ou o contrário) e o erro só aparece em produção, na hora de gravar. Os testes leem o texto das migrações
// (e do código da tela, que não é importável aqui), no padrão do teste da 0156 em arquivo-servidor.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { IDS_TIPO_DOCUMENTO, TIPOS_DOCUMENTO } from "./documentos-regras.ts";

const ler = (caminho: string) =>
  readFileSync(new URL(caminho, import.meta.url), "utf8").replaceAll("\r\n", "\n");

test("0154: o CHECK de acervo_documento.tipo tem exatamente os ids de TIPOS_DOCUMENTO, na mesma ordem", () => {
  const sql = ler("../../../migrations/0154_acervo_documento.sql");
  const m = /constraint acervo_documento_tipo_check check \(tipo in \(([^)]*)\)\)/.exec(sql);
  assert.ok(m, "o CHECK acervo_documento_tipo_check não está mais na 0154");
  const ids = [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
  assert.equal(ids.length, 18);
  assert.deepEqual(ids, [...IDS_TIPO_DOCUMENTO]);
  assert.deepEqual(
    ids,
    TIPOS_DOCUMENTO.map((t) => t.id)
  );
  assert.equal(new Set(ids).size, ids.length, "id repetido no CHECK");
});

test("0156: a regex da chave do modelo é a de declaracoes.ts e a de declaracoes-modelos.js (a da tela), e o prefixo edital_ é reservado", () => {
  const sql = ler("../../../migrations/0156_documentos_gerados.sql");
  const doBanco = /constraint modelo_declaracao_chave_check check \(chave ~ '([^']+)'\)/.exec(sql);
  assert.ok(doBanco, "o CHECK modelo_declaracao_chave_check não está mais na 0156");
  const doServidorTs = ler("../documentos/declaracoes.ts");
  const doServidor = /const CHAVE_MODELO = \/(.+)\/;/.exec(doServidorTs);
  assert.ok(doServidor, "CHAVE_MODELO não está mais em declaracoes.ts");
  const daTelaJs = ler("../../../../apps/web/src/lib/declaracoes-modelos.js");
  const daTela = /const CHAVE_VALIDA = \/(.+)\/;/.exec(daTelaJs);
  assert.ok(daTela, "CHAVE_VALIDA não está mais em declaracoes-modelos.js");
  assert.equal(doServidor[1], doBanco[1], "servidor × banco");
  assert.equal(daTela[1], doBanco[1], "tela × banco");
  // a regex, de fato, aceita e recusa o que a documentação diz (2 a 60 caracteres, minúsculas, dígitos e _)
  const re = new RegExp(doBanco[1]);
  for (const boa of ["me_epp", "ab", `a${"b".repeat(59)}`, "modelo_2"])
    assert.ok(re.test(boa), boa);
  for (const ruim of ["a", `a${"b".repeat(60)}`, "Me_epp", "1abc", "a-b", "a b", ""]) {
    assert.ok(!re.test(ruim), ruim);
  }
  // o prefixo reservado às declarações do texto do edital: o banco recusa e o código só o gera por chaveDoItem
  assert.match(
    sql,
    /constraint modelo_declaracao_chave_reservada_chk check \(chave !~ '\^edital_'\)/
  );
  assert.ok(
    doServidorTs.includes("`edital_${"),
    "declaracoes.ts não monta mais a chave com edital_"
  );
  assert.ok(daTelaJs.includes("edital_"), "a tela não conhece mais o prefixo edital_");
});
