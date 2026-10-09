// node --test supabase/functions/_shared/conector/recurso.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { linkOportunidade, linkPaginaEnvio, recursoDoConector, URL_SITE } from "./recurso.ts";

test("recursoDoConector: URL do mcp canônica", () => {
  assert.equal(
    recursoDoConector("https://PROJ.supabase.co/"),
    "https://proj.supabase.co/functions/v1/mcp"
  );
  assert.equal(
    recursoDoConector("https://proj.supabase.co"),
    "https://proj.supabase.co/functions/v1/mcp"
  );
});

test("recursoDoConector: URL nula, vazia ou inválida lança", () => {
  for (const v of [null, undefined, "", "não é url", "ftp://x"]) {
    assert.throws(() => recursoDoConector(v), /SUPABASE_URL inválida para o recurso do conector/);
  }
});

test("links do site: oportunidade e página de envio", () => {
  const id = "00000000-0000-4000-8000-000000000010";
  assert.equal(URL_SITE, "https://www.sigoobras.com.br");
  assert.equal(linkOportunidade(id), `https://www.sigoobras.com.br/Oportunidades?openId=${id}`);
  assert.equal(linkPaginaEnvio(id), `https://www.sigoobras.com.br/EnviarArquivos?link=${id}`);
});
