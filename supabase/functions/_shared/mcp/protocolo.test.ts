// node --test supabase/functions/_shared/mcp/protocolo.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { ERRO, tratarPostMcp, VERSOES_SUPORTADAS, type ServidorMcp } from "./protocolo.ts";

const chamadas: { nome: string; args: Record<string, unknown> }[] = [];
const srv: ServidorMcp = {
  info: { name: "sigo-obras", title: "SIGO Obras", version: "1.0.0" },
  instructions: "instruções",
  tools: [
    {
      name: "empresa_atual",
      title: "Empresa atual",
      description: "d",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    {
      name: "explode",
      title: "Explode",
      description: "d",
      inputSchema: { type: "object" },
      annotations: { readOnlyHint: true },
    },
  ],
  prompts: [
    {
      name: "analisar_edital",
      title: "Analisar edital",
      description: "p",
      arguments: [{ name: "empresa", description: "e", required: true }],
      montar: (a) => `Analise para ${a.empresa}`,
    },
  ],
  chamarTool: async (nome, args) => {
    chamadas.push({ nome, args });
    if (nome === "explode") throw new Error("boom");
    return { content: [{ type: "text", text: "{}" }], structuredContent: { ok: true } };
  },
};

const h = (o: Record<string, string> = {}) => new Headers(o);
const req = (method: string, params: Record<string, unknown> = {}, id: unknown = 1) =>
  JSON.stringify({ jsonrpc: "2.0", id, method, params });
const corpo = (r: { body: string | null }) => JSON.parse(r.body as string);
const MODERNO = { _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28" } };

test("legado: initialize negocia a versão", async () => {
  const a = corpo(
    await tratarPostMcp(h(), req("initialize", { protocolVersion: "2025-06-18" }), srv)
  );
  assert.equal(a.result.protocolVersion, "2025-06-18");
  assert.equal(a.result.serverInfo.name, "sigo-obras");
  assert.equal(a.result.instructions, "instruções");
  assert.deepEqual(a.result.capabilities, {
    tools: { listChanged: false },
    prompts: { listChanged: false },
  });
  const b = corpo(
    await tratarPostMcp(h(), req("initialize", { protocolVersion: "2026-07-28" }), srv)
  );
  assert.equal(b.result.protocolVersion, "2025-11-25");
});

test("notificação e resposta do cliente → 202 sem corpo", async () => {
  const n = await tratarPostMcp(
    h(),
    JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    srv
  );
  assert.deepEqual([n.status, n.body], [202, null]);
  const r = await tratarPostMcp(h(), JSON.stringify({ jsonrpc: "2.0", id: 9, result: {} }), srv);
  assert.equal(r.status, 202);
});

test("erros de formato: parse, batch, jsonrpc", async () => {
  const p = await tratarPostMcp(h(), "{", srv);
  assert.equal(p.status, 400);
  assert.equal(corpo(p).error.code, ERRO.PARSE);
  const b = await tratarPostMcp(h(), "[]", srv);
  assert.equal(corpo(b).error.code, ERRO.REQUISICAO);
  const j = await tratarPostMcp(h(), JSON.stringify({ id: 1, method: "ping" }), srv);
  assert.equal(corpo(j).error.code, ERRO.REQUISICAO);
});

test("legado: ping, tools/list com anotações e título", async () => {
  assert.deepEqual(corpo(await tratarPostMcp(h(), req("ping"), srv)).result, {});
  const l = corpo(
    await tratarPostMcp(h({ "mcp-protocol-version": "2025-11-25" }), req("tools/list"), srv)
  );
  assert.equal(l.result.tools[0].name, "empresa_atual");
  assert.equal(l.result.tools[0].annotations.title, "Empresa atual");
  assert.equal(l.result.tools[0].annotations.readOnlyHint, true);
});

test("legado: header 2026-07-28 é tolerado; versão estranha → 400", async () => {
  const ok = await tratarPostMcp(
    h({ "mcp-protocol-version": "2026-07-28" }),
    req("tools/list"),
    srv
  );
  assert.equal(ok.status, 200);
  const ruim = await tratarPostMcp(
    h({ "mcp-protocol-version": "1999-01-01" }),
    req("tools/list"),
    srv
  );
  assert.equal(ruim.status, 400);
});

test("legado: tools/call chama a ferramenta; desconhecida/args inválidos → -32602; exceção → isError", async () => {
  chamadas.length = 0;
  const r = corpo(
    await tratarPostMcp(h(), req("tools/call", { name: "empresa_atual", arguments: { a: 1 } }), srv)
  );
  assert.deepEqual(r.result.structuredContent, { ok: true });
  assert.deepEqual(chamadas, [{ nome: "empresa_atual", args: { a: 1 } }]);
  const d = corpo(await tratarPostMcp(h(), req("tools/call", { name: "apagar_tudo" }), srv));
  assert.equal(d.error.code, ERRO.PARAMS);
  const a = corpo(
    await tratarPostMcp(h(), req("tools/call", { name: "empresa_atual", arguments: [1] }), srv)
  );
  assert.equal(a.error.code, ERRO.PARAMS);
  const x = corpo(await tratarPostMcp(h(), req("tools/call", { name: "explode" }), srv));
  assert.equal(x.result.isError, true);
  assert.ok(!JSON.stringify(x).includes("boom"));
});

test("legado: método desconhecido → 200 com -32601 (inclusive server/discover sem envelope)", async () => {
  const r = await tratarPostMcp(h(), req("server/discover"), srv);
  assert.equal(r.status, 200);
  assert.equal(corpo(r).error.code, ERRO.METODO);
});

test("prompts: list e get; argumento obrigatório faltando → -32602", async () => {
  const l = corpo(await tratarPostMcp(h(), req("prompts/list"), srv));
  assert.equal(l.result.prompts[0].name, "analisar_edital");
  const g = corpo(
    await tratarPostMcp(
      h(),
      req("prompts/get", { name: "analisar_edital", arguments: { empresa: "Sinergia" } }),
      srv
    )
  );
  assert.equal(g.result.messages[0].content.text, "Analise para Sinergia");
  const f = corpo(
    await tratarPostMcp(h(), req("prompts/get", { name: "analisar_edital", arguments: {} }), srv)
  );
  assert.equal(f.error.code, ERRO.PARAMS);
});

test("moderno: server/discover", async () => {
  const r = corpo(
    await tratarPostMcp(
      h({ "mcp-protocol-version": "2026-07-28", "mcp-method": "server/discover" }),
      req("server/discover", MODERNO),
      srv
    )
  );
  assert.equal(r.result.resultType, "complete");
  assert.deepEqual(r.result.supportedVersions, VERSOES_SUPORTADAS);
  assert.equal(r.result.instructions, "instruções");
  assert.equal(typeof r.result.ttlMs, "number");
  assert.equal(r.result._meta["io.modelcontextprotocol/serverInfo"].name, "sigo-obras");
});

test("moderno: tools/list e tools/call com resultType e cache", async () => {
  const l = corpo(
    await tratarPostMcp(h({ "mcp-method": "tools/list" }), req("tools/list", MODERNO), srv)
  );
  assert.equal(l.result.resultType, "complete");
  assert.equal(l.result.cacheScope, "public");
  assert.equal(l.result.tools.length, 2);
  const c = corpo(
    await tratarPostMcp(
      h({ "mcp-method": "tools/call", "mcp-name": "=?base64?ZW1wcmVzYV9hdHVhbA==?=" }),
      req("tools/call", { ...MODERNO, name: "empresa_atual" }),
      srv
    )
  );
  assert.equal(c.result.resultType, "complete");
});

test("moderno: versão não suportada, header divergente e método desconhecido", async () => {
  const v = await tratarPostMcp(
    h(),
    req("tools/list", { _meta: { "io.modelcontextprotocol/protocolVersion": "2027-01-01" } }),
    srv
  );
  assert.equal(v.status, 400);
  assert.equal(corpo(v).error.code, ERRO.VERSAO);
  assert.deepEqual(corpo(v).error.data.supported, VERSOES_SUPORTADAS);
  const m = await tratarPostMcp(h({ "mcp-method": "tools/call" }), req("tools/list", MODERNO), srv);
  assert.equal(m.status, 400);
  assert.equal(corpo(m).error.code, ERRO.CABECALHO);
  const n = await tratarPostMcp(
    h({ "mcp-name": "outro" }),
    req("tools/call", { ...MODERNO, name: "empresa_atual" }),
    srv
  );
  assert.equal(corpo(n).error.code, ERRO.CABECALHO);
  const d = await tratarPostMcp(h(), req("resources/list", MODERNO), srv);
  assert.equal(d.status, 404);
  assert.equal(corpo(d).error.code, ERRO.METODO);
});
