import { test } from "node:test";
import assert from "node:assert/strict";
import { arquivosVisiveisAoCliente, ehCopiaInterna } from "./portal-cliente-arquivos.ts";

test("ehCopiaInterna: só as cópias da biblioteca e do acervo", () => {
  assert.equal(ehCopiaInterna("biblioteca:11111111-1111-1111-1111-111111111111"), true);
  assert.equal(ehCopiaInterna("acervo:22222222-2222-2222-2222-222222222222"), true);
  assert.equal(ehCopiaInterna(" Biblioteca:x"), true);
  assert.equal(ehCopiaInterna("gerado:proposta:pdf"), false);
  assert.equal(ehCopiaInterna("declaracao:me_epp:pdf"), false);
  assert.equal(ehCopiaInterna("url:abc"), false);
  assert.equal(ehCopiaInterna("bibliotecario.pdf"), false);
  assert.equal(ehCopiaInterna(null), false);
  assert.equal(ehCopiaInterna(undefined), false);
  assert.equal(ehCopiaInterna(42), false);
});

test("arquivosVisiveisAoCliente: esconde as cópias internas e tira a coluna origem", () => {
  const linhas = [
    { id: "a", nome: "Foto da obra.jpg", origem: null },
    { id: "b", nome: "CND Federal.pdf", origem: "biblioteca:d1" },
    { id: "c", nome: "CAT 123.pdf", origem: "acervo:at1" },
    { id: "d", nome: "Proposta.pdf", origem: "gerado:proposta:pdf" },
    { id: "e", nome: "Sem coluna.pdf" },
  ];
  assert.deepEqual(arquivosVisiveisAoCliente(linhas), [
    { id: "a", nome: "Foto da obra.jpg" },
    { id: "d", nome: "Proposta.pdf" },
    { id: "e", nome: "Sem coluna.pdf" },
  ]);
});

test("arquivosVisiveisAoCliente: lista vazia ou nula", () => {
  assert.deepEqual(arquivosVisiveisAoCliente([]), []);
  assert.deepEqual(arquivosVisiveisAoCliente(null), []);
  assert.deepEqual(arquivosVisiveisAoCliente(undefined), []);
});
