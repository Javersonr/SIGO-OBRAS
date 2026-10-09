// node --test supabase/functions/_shared/conector/sessao.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { autenticadoEmSeg, payloadDoJwt, sessaoAnteriorATrocaDeSenha } from "./sessao.ts";

const b64url = (o: unknown) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(o))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
/** JWT sintético: header.payload.assinatura (a assinatura não é conferida aqui). */
const jwt = (payload: unknown) =>
  `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url(payload)}.assinatura`;

const TROCA = "2026-10-08T12:00:00.900Z"; // os 900 ms caem no floor
const TROCA_SEG = Math.floor(new Date(TROCA).getTime() / 1000);

test("payloadDoJwt: lê o payload em base64url (com acento) e recusa malformado", () => {
  assert.deepEqual(payloadDoJwt(jwt({ email: "joão@exemplo.test" })), {
    email: "joão@exemplo.test",
  });
  assert.equal(payloadDoJwt("so.duas"), null);
  assert.equal(payloadDoJwt("a.!!!.c"), null);
  assert.equal(payloadDoJwt(`a.${b64url([1, 2])}.c`), null);
  assert.equal(payloadDoJwt(""), null);
});

test("autenticadoEmSeg: maior timestamp do amr, com 1 e com 2 entradas", () => {
  assert.equal(autenticadoEmSeg(jwt({ amr: [{ method: "password", timestamp: 100 }] })), 100);
  assert.equal(
    autenticadoEmSeg(
      jwt({
        amr: [
          { method: "password", timestamp: 100 },
          { method: "otp", timestamp: 250 },
        ],
      })
    ),
    250
  );
  assert.equal(autenticadoEmSeg(jwt({ sub: "x" })), null);
  assert.equal(autenticadoEmSeg(jwt({ amr: [{ method: "password" }] })), null);
});

test("sessaoAnteriorATrocaDeSenha: 1 s antes recusa; segundo igual não recusa", () => {
  const antes = jwt({ amr: [{ method: "password", timestamp: TROCA_SEG - 1 }] });
  const igual = jwt({ amr: [{ method: "password", timestamp: TROCA_SEG }] });
  const depois = jwt({ amr: [{ method: "otp", timestamp: TROCA_SEG + 60 }] });
  assert.equal(sessaoAnteriorATrocaDeSenha(antes, TROCA), true);
  assert.equal(sessaoAnteriorATrocaDeSenha(igual, TROCA), false);
  assert.equal(sessaoAnteriorATrocaDeSenha(depois, TROCA), false);
});

test("sessaoAnteriorATrocaDeSenha: sem amr, sem data ou JWT malformado → false", () => {
  const antigo = jwt({ amr: [{ method: "password", timestamp: 1 }] });
  assert.equal(sessaoAnteriorATrocaDeSenha(jwt({ sub: "x" }), TROCA), false);
  assert.equal(sessaoAnteriorATrocaDeSenha(antigo, null), false);
  assert.equal(sessaoAnteriorATrocaDeSenha(antigo, undefined), false);
  assert.equal(sessaoAnteriorATrocaDeSenha(antigo, "não é data"), false);
  assert.equal(sessaoAnteriorATrocaDeSenha("lixo", TROCA), false);
});
