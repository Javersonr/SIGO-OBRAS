// node --test supabase/functions/_shared/conector/dns-combinar.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { combinarConsultasDns, interpretarRespostaDoh, type ConsultaDns } from "./dns-combinar.ts";

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

// ─── interpretarRespostaDoh: o JSON do DNS-over-HTTPS (dns.google/resolve) ────────────────────────

test("DoH: Status 0 com Answer: vale a lista do tipo pedido (a cadeia de CNAME fica de fora)", () => {
  const corpo = {
    Status: 0,
    Answer: [
      { name: "www.exemplo.test.", type: 5, data: "exemplo.test." },
      { name: "exemplo.test.", type: 1, data: "200.160.2.3" },
      { name: "exemplo.test.", type: 1, data: "200.160.2.4" },
      { name: "exemplo.test.", type: 28, data: "2001:db8::1" },
    ],
  };
  assert.deepEqual(interpretarRespostaDoh(corpo, "A"), ok("200.160.2.3", "200.160.2.4"));
  assert.deepEqual(interpretarRespostaDoh(corpo, "AAAA"), ok("2001:db8::1"));
});

test("DoH: Status 0 sem Answer (o nome existe, mas não tem esse tipo de registro) é resposta vazia, não falha", () => {
  assert.deepEqual(interpretarRespostaDoh({ Status: 0 }, "AAAA"), ok());
  assert.deepEqual(interpretarRespostaDoh({ Status: 0, Answer: [] }, "A"), ok());
  assert.deepEqual(interpretarRespostaDoh({ Status: 0, Answer: null }, "A"), ok());
  // só CNAME, nenhum endereço do tipo
  assert.deepEqual(
    interpretarRespostaDoh({ Status: 0, Answer: [{ type: 5, data: "x.test." }] }, "A"),
    ok()
  );
});

test("DoH: Status 3 (NXDOMAIN) é 'não existe', mesmo que o corpo traga um Answer perdido", () => {
  assert.deepEqual(interpretarRespostaDoh({ Status: 3 }, "A"), naoExiste);
  assert.deepEqual(
    interpretarRespostaDoh({ Status: 3, Answer: [{ type: 1, data: "10.0.0.1" }] }, "A"),
    naoExiste
  );
});

test("DoH: qualquer outro Status (SERVFAIL, REFUSED...) é falha: o lado fica sem conferir", () => {
  for (const status of [1, 2, 4, 5, 9, 16]) {
    assert.deepEqual(
      interpretarRespostaDoh({ Status: status, Answer: [{ type: 1, data: "200.160.2.3" }] }, "A"),
      falhou,
      `Status ${status}`
    );
  }
});

test("DoH: corpo que não é a resposta esperada (sem Status, Status de outro tipo, Answer torta, não é objeto) é falha", () => {
  const ruins: unknown[] = [
    null,
    undefined,
    "texto",
    42,
    [],
    {},
    { Answer: [{ type: 1, data: "200.160.2.3" }] },
    { Status: "0" },
    { Status: null },
    { Status: 0.5 },
    { Status: 0, Answer: "200.160.2.3" },
    { Status: 0, Answer: { type: 1, data: "200.160.2.3" } },
  ];
  for (const corpo of ruins) {
    assert.deepEqual(interpretarRespostaDoh(corpo, "A"), falhou, JSON.stringify(corpo));
  }
});

test("DoH: no Answer, registro sem 'data' em texto é ignorado; o que sobra não vira lixo", () => {
  const corpo = {
    Status: 0,
    Answer: [{ type: 1 }, { type: 1, data: 7 }, null, "x", { type: 1, data: "200.160.2.3" }],
  };
  assert.deepEqual(interpretarRespostaDoh(corpo, "A"), ok("200.160.2.3"));
});

test("DoH + combinar: NXDOMAIN em um tipo e resposta no outro vale; SERVFAIL em um anula tudo", () => {
  const a = interpretarRespostaDoh({ Status: 0, Answer: [{ type: 1, data: "200.160.2.3" }] }, "A");
  assert.deepEqual(combinarConsultasDns(a, interpretarRespostaDoh({ Status: 3 }, "AAAA")), [
    "200.160.2.3",
  ]);
  assert.deepEqual(combinarConsultasDns(a, interpretarRespostaDoh({ Status: 2 }, "AAAA")), []);
});
