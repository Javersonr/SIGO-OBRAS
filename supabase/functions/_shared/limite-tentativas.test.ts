// Roda com Node 23.6+ (type stripping):  node --test supabase/functions/_shared/limite-tentativas.test.ts
// ou com Deno:                           deno test supabase/functions/_shared/limite-tentativas.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chaveLimite,
  consumirTentativa,
  ipDaRequisicao,
  liberarTentativas,
  normalizarIp,
} from "./limite-tentativas.ts";

const req = (headers: Record<string, string>) =>
  new Request("https://x.supabase.co/functions/v1/f", { method: "POST", headers });

test("IP: vale a entrada mais à direita do X-Forwarded-For (a da esquerda é forjável)", () => {
  assert.equal(ipDaRequisicao(req({ "x-forwarded-for": "9.9.9.9, 200.1.2.3" })), "200.1.2.3");
  assert.equal(ipDaRequisicao(req({ "x-forwarded-for": "200.1.2.3" })), "200.1.2.3");
  assert.equal(ipDaRequisicao(req({ "x-forwarded-for": " 1.1.1.1 ,  " })), "1.1.1.1");
});

test("IP: cai para x-real-ip e ignora cf-connecting-ip (header do cliente no *.supabase.co)", () => {
  assert.equal(ipDaRequisicao(req({ "x-real-ip": "200.1.2.3" })), "200.1.2.3");
  assert.equal(ipDaRequisicao(req({ "cf-connecting-ip": "9.9.9.9" })), null);
  assert.equal(ipDaRequisicao(req({})), null);
});

test("normalizarIp: IPv4 com porta e IPv4 mapeado em IPv6", () => {
  assert.equal(normalizarIp("200.1.2.3:443"), "200.1.2.3");
  assert.equal(normalizarIp("::ffff:200.1.2.3"), "200.1.2.3");
});

test("normalizarIp: IPv6 vira o prefixo /64 (girar o sufixo não escapa do limite)", () => {
  const a = normalizarIp("2804:14c:5b80:8f00:1111:2222:3333:4444");
  const b = normalizarIp("2804:14c:5b80:8f00::abcd");
  assert.equal(a, "2804:14c:5b80:8f00::/64");
  assert.equal(b, a);
  assert.equal(normalizarIp("[2804:0014:5b80:0000::1]:8080"), "2804:14:5b80:0::/64");
  assert.equal(normalizarIp("::1"), "0:0:0:0::/64");
  assert.equal(normalizarIp("fe80::1%eth0"), "fe80:0:0:0::/64");
});

test("chaveLimite: SHA-256 hex, sem o valor em claro, insensível a caixa/espaços", async () => {
  const k = await chaveLimite("login", "conta", " Fulano@Empresa.com ");
  assert.match(k, /^[a-f0-9]{64}$/);
  assert.ok(!k.includes("fulano"));
  assert.equal(k, await chaveLimite("login", "conta", "fulano@empresa.com"));
  assert.notEqual(k, await chaveLimite("recuperar", "conta", "fulano@empresa.com"));
  assert.notEqual(k, await chaveLimite("login", "ip", "fulano@empresa.com"));
});

function fakeAdmin(resposta: { data?: unknown; error?: { message: string } | null }) {
  const chamadas: { fn: string; args: Record<string, unknown> }[] = [];
  return {
    chamadas,
    rpc: async (fn: string, args: Record<string, unknown>) => {
      chamadas.push({ fn, args });
      return { data: resposta.data ?? null, error: resposta.error ?? null };
    },
  };
}

test("consumirTentativa: manda as chaves na ordem (ip, conta) e respeita o veredito", async () => {
  const admin = fakeAdmin({ data: false });
  const r = await consumirTentativa(admin, "login", 900, [
    { tipo: "ip", valor: "200.1.2.3", max: 30 },
    { tipo: "conta", valor: "a@b.com", max: 8 },
  ]);
  assert.equal(r.permitido, false);
  assert.equal(admin.chamadas[0].fn, "auth_rate_limit_consumir");
  assert.deepEqual(admin.chamadas[0].args.p_limites, [30, 8]);
  assert.deepEqual(admin.chamadas[0].args.p_chaves, [r.chaves.ip, r.chaves.conta]);
  assert.equal(admin.chamadas[0].args.p_janela_seg, 900);
});

test("consumirTentativa: sem IP limita só a conta; sem nada não chama o banco", async () => {
  const admin = fakeAdmin({ data: true });
  const r = await consumirTentativa(admin, "login", 900, [
    { tipo: "ip", valor: null, max: 30 },
    { tipo: "conta", valor: "a@b.com", max: 8 },
  ]);
  assert.equal(r.permitido, true);
  assert.equal(r.chaves.ip, undefined);
  assert.deepEqual(admin.chamadas[0].args.p_limites, [8]);

  const vazio = fakeAdmin({ data: false });
  assert.equal((await consumirTentativa(vazio, "x", 60, [])).permitido, true);
  assert.equal(vazio.chamadas.length, 0);
});

test("consumirTentativa: limitador com erro não tranca o login", async () => {
  const admin = fakeAdmin({ error: { message: "function does not exist" } });
  const erroOriginal = console.error;
  console.error = () => {};
  try {
    const r = await consumirTentativa(admin, "login", 900, [
      { tipo: "conta", valor: "a@b.com", max: 8 },
    ]);
    assert.equal(r.permitido, true);
  } finally {
    console.error = erroOriginal;
  }
});

test("liberarTentativas: devolve a do IP e zera a da conta", async () => {
  const admin = fakeAdmin({});
  await liberarTentativas(admin, { permitido: true, chaves: { ip: "k-ip", conta: "k-conta" } });
  assert.deepEqual(admin.chamadas[0], {
    fn: "auth_rate_limit_liberar",
    args: { p_devolver: ["k-ip"], p_zerar: ["k-conta"] },
  });
  const nada = fakeAdmin({});
  await liberarTentativas(nada, { permitido: true, chaves: {} });
  assert.equal(nada.chamadas.length, 0);
});
