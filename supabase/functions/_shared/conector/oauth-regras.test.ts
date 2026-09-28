// node --test supabase/functions/_shared/conector/oauth-regras.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decidirRenovacao,
  DURACAO,
  erroOAuth,
  ISSUER,
  lerFormUnico,
  montarRedirectErro,
  montarRedirectSucesso,
  nomeDoApp,
  respostaRegistro,
  validarPedidoAutorizacao,
  validarRegistro,
} from "./oauth-regras.ts";

const RECURSO = "https://fpy.supabase.co/functions/v1/mcp";
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

test("validarRegistro: aceita o Claude e loopback, tolera campos extras", () => {
  const r = validarRegistro({
    client_name: "Claude",
    redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
    grant_types: ["authorization_code", "refresh_token"],
    token_endpoint_auth_method: "client_secret_post",
    application_type: "web",
  });
  assert.equal(r.ok, true);
  if (r.ok)
    assert.deepEqual(r.cliente, {
      nome: "Claude",
      redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
      tipo: "claude",
    });
  const l = validarRegistro({ redirect_uris: ["http://localhost:9/callback"] });
  assert.equal(l.ok && l.cliente.nome, "Programa neste computador");
});

test("validarRegistro: recusa redirect estranho, mistura e metadados errados", () => {
  assert.deepEqual(validarRegistro({ redirect_uris: ["https://evil.example/cb"] }).ok, false);
  const r = validarRegistro({ redirect_uris: ["https://evil.example/cb"] });
  assert.equal(!r.ok && r.erro, "invalid_redirect_uri");
  const mix = validarRegistro({
    redirect_uris: ["https://claude.ai/api/mcp/auth_callback", "http://localhost/callback"],
  });
  assert.equal(!mix.ok && mix.erro, "invalid_redirect_uri");
  const gt = validarRegistro({
    redirect_uris: ["http://localhost/callback"],
    grant_types: ["client_credentials"],
  });
  assert.equal(!gt.ok && gt.erro, "invalid_client_metadata");
  assert.equal(validarRegistro(null).ok, false);
  assert.equal(validarRegistro({ redirect_uris: [] }).ok, false);
});

test("validarRegistro: nome sem caracteres de controle e com no máximo 100", () => {
  const r = validarRegistro({
    client_name: "A\u0000B" + "x".repeat(200),
    redirect_uris: ["http://localhost/callback"],
  });
  assert.equal(r.ok && r.cliente.nome.length, 100);
  assert.equal(r.ok && r.cliente.nome.startsWith("AB"), true);
});

test("respostaRegistro: registra como cliente público", () => {
  const res = respostaRegistro(
    "sigo_c_x",
    { nome: "Claude", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"], tipo: "claude" },
    1790000000
  );
  assert.equal(res.client_id, "sigo_c_x");
  assert.equal(res.token_endpoint_auth_method, "none");
  assert.deepEqual(res.grant_types, ["authorization_code", "refresh_token"]);
});

test("lerFormUnico: form-urlencoded; parâmetro repetido → null", () => {
  assert.deepEqual(lerFormUnico("grant_type=authorization_code&code=a%2Bb"), {
    grant_type: "authorization_code",
    code: "a+b",
  });
  assert.equal(lerFormUnico("code=1&code=2"), null);
});

test("validarPedidoAutorizacao: exige code + S256 + redirect permitido + recurso certo", () => {
  const ok = validarPedidoAutorizacao(
    {
      response_type: "code",
      client_id: "sigo_c_x",
      redirect_uri: "http://localhost:5/callback",
      code_challenge: CHALLENGE,
      code_challenge_method: "S256",
      state: "abc",
      resource: RECURSO + "/",
    },
    RECURSO
  );
  assert.deepEqual(ok, {
    ok: true,
    pedido: {
      client_id: "sigo_c_x",
      redirect_uri: "http://localhost:5/callback",
      code_challenge: CHALLENGE,
      state: "abc",
    },
  });
  const base = {
    response_type: "code",
    client_id: "c",
    redirect_uri: "http://localhost/callback",
    code_challenge: CHALLENGE,
    code_challenge_method: "S256",
  };
  assert.equal(
    validarPedidoAutorizacao({ ...base, code_challenge_method: "plain" }, RECURSO).ok,
    false
  );
  assert.equal(validarPedidoAutorizacao({ ...base, response_type: "token" }, RECURSO).ok, false);
  assert.equal(
    validarPedidoAutorizacao({ ...base, redirect_uri: "https://evil.example/cb" }, RECURSO).ok,
    false
  );
  assert.equal(
    validarPedidoAutorizacao({ ...base, resource: "https://outro.example/mcp" }, RECURSO).ok,
    false
  );
  assert.equal(validarPedidoAutorizacao(base, RECURSO).ok, true); // resource ausente é aceito
});

test("redirects: code/state/iss e erro", () => {
  const s = new URL(
    montarRedirectSucesso("http://localhost:5/callback", "sigo_ac_1", "st", ISSUER)
  );
  assert.equal(s.searchParams.get("code"), "sigo_ac_1");
  assert.equal(s.searchParams.get("state"), "st");
  assert.equal(s.searchParams.get("iss"), ISSUER);
  const e = new URL(
    montarRedirectErro(
      "https://claude.ai/api/mcp/auth_callback",
      "access_denied",
      undefined,
      ISSUER
    )
  );
  assert.equal(e.searchParams.get("error"), "access_denied");
  assert.equal(e.searchParams.has("state"), false);
});

test("erroOAuth: formato RFC 6749", () => {
  assert.deepEqual(erroOAuth("invalid_grant"), { error: "invalid_grant" });
  assert.deepEqual(erroOAuth("invalid_request", "x"), {
    error: "invalid_request",
    error_description: "x",
  });
});

test("decidirRenovacao: ok, expirada, revogada, reuso (tolerado/revogar), limite de 90 dias", () => {
  const agora = new Date("2026-10-01T12:00:00Z");
  const base = {
    expira_em: "2026-10-20T00:00:00Z",
    substituida_em: null,
    revogada_em: null,
    inicio_autorizacao: "2026-09-25T00:00:00Z",
  };
  assert.equal(decidirRenovacao(base, agora), "ok");
  assert.equal(decidirRenovacao({ ...base, expira_em: "2026-10-01T11:59:59Z" }, agora), "invalida");
  assert.equal(
    decidirRenovacao({ ...base, revogada_em: "2026-09-30T00:00:00Z" }, agora),
    "invalida"
  );
  assert.equal(
    decidirRenovacao(
      { ...base, substituida_em: new Date(agora.getTime() - 10_000).toISOString() },
      agora
    ),
    "reuso_tolerado"
  );
  assert.equal(
    decidirRenovacao(
      {
        ...base,
        substituida_em: new Date(agora.getTime() - DURACAO.gracaRotacaoMs - 1).toISOString(),
      },
      agora
    ),
    "reuso_revogar"
  );
  assert.equal(
    decidirRenovacao({ ...base, inicio_autorizacao: "2026-06-01T00:00:00Z" }, agora),
    "invalida"
  );
});

test("nomeDoApp: claude é sempre 'Claude' (o client_name do DCR nunca aparece)", () => {
  assert.equal(nomeDoApp("oauth", "claude"), "Claude");
  assert.equal(nomeDoApp("oauth", "loopback"), "Programa neste computador");
  assert.equal(nomeDoApp("manual", null), "Chave do Claude Code");
  // cliente apagado (cliente_id → null) ou tipo desconhecido
  assert.equal(nomeDoApp("oauth", null), "Claude");
  assert.equal(nomeDoApp("oauth", undefined), "Claude");
});
