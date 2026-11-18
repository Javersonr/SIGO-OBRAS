// Roda com Node 23.6+ (type stripping):
//   node --test supabase/functions/vincular-pasta-oportunidade/regras.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TAMANHO_MINIMO_SEGREDO,
  conferirAcesso,
  iguaisEmTempoConstante,
  urlDePastaValida,
} from "./regras.ts";

const SEGREDO = "segredo-de-teste-".padEnd(TAMANHO_MINIMO_SEGREDO + 4, "x");

test("sem segredo configurado a função fica desligada (503), mesmo com cabeçalho", () => {
  for (const configurado of [undefined, null, "", "   "]) {
    const r = conferirAcesso(configurado, SEGREDO);
    assert.deepEqual(r, { ok: false, status: 503, erro: "Função desativada" });
  }
});

test("segredo curto demais conta como não configurado (503)", () => {
  const curto = "x".repeat(TAMANHO_MINIMO_SEGREDO - 1);
  const r = conferirAcesso(curto, curto);
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.status, 503);
});

test("com segredo configurado, cabeçalho ausente ou errado é 401", () => {
  for (const recebido of [undefined, null, "", "errado", SEGREDO + "a", SEGREDO.slice(1)]) {
    const r = conferirAcesso(SEGREDO, recebido);
    assert.deepEqual(r, { ok: false, status: 401, erro: "Não autorizado" });
  }
});

test("cabeçalho igual ao segredo libera", () => {
  assert.deepEqual(conferirAcesso(SEGREDO, SEGREDO), { ok: true });
  // espaços nas pontas do segredo configurado (colado com quebra de linha) não derrubam o chamador
  assert.deepEqual(conferirAcesso(`  ${SEGREDO}\n`, SEGREDO), { ok: true });
});

test("comparação em tempo constante: só textos idênticos são iguais", () => {
  assert.equal(iguaisEmTempoConstante("abc", "abc"), true);
  assert.equal(iguaisEmTempoConstante("abc", "abd"), false);
  assert.equal(iguaisEmTempoConstante("abc", "abcd"), false);
  assert.equal(iguaisEmTempoConstante("", "a"), false);
  assert.equal(iguaisEmTempoConstante("", ""), true);
});

test("pasta: só endereço https bem formado é aceito", () => {
  assert.equal(urlDePastaValida("https://drive.google.com/drive/folders/abc123"), true);
  assert.equal(urlDePastaValida("http://drive.google.com/drive/folders/abc123"), false);
  assert.equal(urlDePastaValida("javascript:alert(1)"), false);
  assert.equal(urlDePastaValida("data:text/html,<script>1</script>"), false);
  assert.equal(urlDePastaValida("drive.google.com/x"), false);
  assert.equal(urlDePastaValida(""), false);
  assert.equal(urlDePastaValida(null), false);
  assert.equal(urlDePastaValida("https://" + "a".repeat(3000)), false);
});
