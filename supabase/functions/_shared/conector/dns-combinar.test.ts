// node --test supabase/functions/_shared/conector/dns-combinar.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { combinarConsultasDns, type ConsultaDns } from "./dns-combinar.ts";

const ok = (...enderecos: string[]): ConsultaDns => ({ situacao: "ok", enderecos });
const naoExiste: ConsultaDns = { situacao: "nao_existe" };
const falhou: ConsultaDns = { situacao: "falhou" };

test("A e AAAA responderam: vale a soma dos dois", () => {
  assert.deepEqual(combinarConsultasDns(ok("200.160.2.3"), ok("2001:db8::1")), [
    "200.160.2.3",
    "2001:db8::1",
  ]);
  assert.deepEqual(combinarConsultasDns(ok("200.160.2.3", "200.160.2.4"), ok()), [
    "200.160.2.3",
    "200.160.2.4",
  ]);
});

test("'nome não existe' em um tipo e resposta no outro: vale o que respondeu (host só IPv4 ou só IPv6)", () => {
  assert.deepEqual(combinarConsultasDns(ok("200.160.2.3"), naoExiste), ["200.160.2.3"]);
  assert.deepEqual(combinarConsultasDns(naoExiste, ok("2001:db8::1")), ["2001:db8::1"]);
});

test("o nome não existe em nenhum dos dois tipos: lista vazia (quem chama recusa)", () => {
  assert.deepEqual(combinarConsultasDns(naoExiste, naoExiste), []);
  assert.deepEqual(combinarConsultasDns(ok(), ok()), []);
});

test("uma das consultas falhou por erro: a lista toda é vazia, mesmo com a outra respondendo", () => {
  // o caso da revisão: A falha e AAAA responde → só os IPv6 seriam conferidos e a conexão iria pelo
  // IPv4 que ninguém conferiu
  assert.deepEqual(combinarConsultasDns(falhou, ok("2001:db8::1")), []);
  assert.deepEqual(combinarConsultasDns(ok("200.160.2.3"), falhou), []);
  assert.deepEqual(combinarConsultasDns(falhou, naoExiste), []);
  assert.deepEqual(combinarConsultasDns(naoExiste, falhou), []);
  assert.deepEqual(combinarConsultasDns(falhou, falhou), []);
});

test("o resultado é uma lista nova: mexer nela não altera as respostas", () => {
  const a = ok("200.160.2.3");
  const r = combinarConsultasDns(a, naoExiste);
  r.push("10.0.0.1");
  assert.deepEqual(a, ok("200.160.2.3"));
});
