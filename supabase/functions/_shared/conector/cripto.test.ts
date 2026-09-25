// Roda com Node 23.6+ (type stripping): node --test supabase/functions/_shared/conector/cripto.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  base64url,
  challengeValido,
  gerarSegredo,
  hashSegredo,
  pkceS256Confere,
  PREFIXO,
  verifierValido,
} from "./cripto.ts";

test("gerarSegredo: prefixo + 256 bits em base64url, sempre diferente", () => {
  const a = gerarSegredo(PREFIXO.acesso);
  const b = gerarSegredo(PREFIXO.acesso);
  assert.match(a, /^sigo_at_[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a, b);
  assert.match(gerarSegredo(PREFIXO.cliente, 16), /^sigo_c_[A-Za-z0-9_-]{22}$/);
});

test("hashSegredo: SHA-256 hex determinístico", async () => {
  const h = await hashSegredo("abc");
  assert.equal(h, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(await hashSegredo("abc"), h);
});

test("base64url: sem + / =", () => {
  assert.equal(base64url(new Uint8Array([251, 255, 191])), "-_-_");
});

test("PKCE S256: exemplo da RFC 7636 confere", async () => {
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
  assert.equal(await pkceS256Confere(verifier, challenge), true);
  assert.equal(await pkceS256Confere(verifier + "x", challenge), false);
});

test("PKCE: verifier e challenge fora do formato são recusados", async () => {
  assert.equal(verifierValido("curto"), false);
  assert.equal(verifierValido("a".repeat(129)), false);
  assert.equal(verifierValido("a".repeat(43)), true);
  assert.equal(challengeValido("x".repeat(42)), false);
  assert.equal(challengeValido("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"), true);
  assert.equal(
    await pkceS256Confere("a".repeat(10), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"),
    false
  );
});
