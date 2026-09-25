// node --test supabase/functions/_shared/conector/redirect.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classificarRedirect,
  destinoDoRedirect,
  recursoCanonico,
  redirectConfere,
} from "./redirect.ts";

test("classificarRedirect: só os callbacks do Claude e loopback /callback", () => {
  assert.equal(classificarRedirect("https://claude.ai/api/mcp/auth_callback"), "claude");
  assert.equal(classificarRedirect("https://claude.com/api/mcp/auth_callback"), "claude");
  assert.equal(classificarRedirect("http://localhost:53682/callback"), "loopback");
  assert.equal(classificarRedirect("http://127.0.0.1/callback"), "loopback");
  assert.equal(classificarRedirect("http://[::1]:9000/callback"), "loopback");
  assert.equal(classificarRedirect("https://evil.example/api/mcp/auth_callback"), null);
  assert.equal(classificarRedirect("https://claude.ai/api/mcp/auth_callback?x=1"), null);
  assert.equal(classificarRedirect("http://localhost:1/outra"), null);
  assert.equal(classificarRedirect("https://localhost/callback"), null);
  assert.equal(classificarRedirect("http://localhost.evil.com/callback"), null);
  assert.equal(classificarRedirect("http://user:pw@localhost/callback"), null);
  assert.equal(classificarRedirect(42), null);
});

test("redirectConfere: loopback ignora a porta; Claude é exato", () => {
  const loop = ["http://localhost:1111/callback"];
  assert.equal(redirectConfere(loop, "http://localhost:2222/callback"), true);
  assert.equal(redirectConfere(loop, "http://127.0.0.1:2222/callback"), false);
  const web = ["https://claude.ai/api/mcp/auth_callback"];
  assert.equal(redirectConfere(web, "https://claude.ai/api/mcp/auth_callback"), true);
  assert.equal(redirectConfere(web, "https://claude.com/api/mcp/auth_callback"), false);
  assert.equal(redirectConfere(web, "https://evil.example/cb"), false);
});

test("recursoCanonico: minúsculas, sem barra final, sem fragmento", () => {
  assert.equal(
    recursoCanonico("https://FPY.supabase.co/functions/v1/mcp/"),
    "https://fpy.supabase.co/functions/v1/mcp"
  );
  assert.equal(
    recursoCanonico("https://fpy.supabase.co:443/functions/v1/mcp#x"),
    "https://fpy.supabase.co/functions/v1/mcp"
  );
  assert.equal(recursoCanonico("ftp://x/y"), null);
  assert.equal(recursoCanonico("não é url"), null);
});

test("destinoDoRedirect: rótulo para a tela", () => {
  assert.equal(destinoDoRedirect("https://claude.ai/api/mcp/auth_callback"), "claude.ai");
  assert.equal(destinoDoRedirect("http://localhost:5/callback"), "Programa neste computador");
});
