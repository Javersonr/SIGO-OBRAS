/**
 * Protocolo MCP do conector do SIGO — Streamable HTTP SEM ESTADO, respostas
 * só em application/json, feito à mão e "dual-era":
 *   • moderna 2026-07-28: envelope params._meta["io.modelcontextprotocol/protocolVersion"],
 *     server/discover, sem initialize/ping, resultType/ttlMs/cacheScope;
 *   • legada 2025-11-25 / 2025-06-18: initialize + notifications/initialized + ping.
 * O claude.ai já fala 2026-07-28 e manda esse header até em requisições
 * legadas — por isso a tolerância no header. Puro: Deno e Node (node --test).
 */

export const VERSAO_MODERNA = "2026-07-28";
export const VERSOES_LEGADAS = ["2025-11-25", "2025-06-18"];
export const VERSOES_SUPORTADAS = [VERSAO_MODERNA, ...VERSOES_LEGADAS];
const HEADERS_TOLERADOS = new Set([...VERSOES_SUPORTADAS, "2025-03-26"]);
const META_VERSAO = "io.modelcontextprotocol/protocolVersion";
const META_SERVIDOR = "io.modelcontextprotocol/serverInfo";
const TTL_MS = 300_000;

export const ERRO = {
  PARSE: -32700,
  REQUISICAO: -32600,
  METODO: -32601,
  PARAMS: -32602,
  INTERNO: -32603,
  CABECALHO: -32020,
  VERSAO: -32022,
} as const;

export interface ToolDef {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: {
    readOnlyHint: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
}

export interface PromptDef {
  name: string;
  title: string;
  description: string;
  arguments?: { name: string; description: string; required?: boolean }[];
  montar(args: Record<string, string>): string;
}

export interface ResultadoTool {
  content: { type: "text"; text: string }[];
  structuredContent?: unknown;
  isError?: boolean;
}

export interface ServidorMcp {
  info: { name: string; title: string; version: string };
  instructions: string;
  tools: ToolDef[];
  prompts: PromptDef[];
  chamarTool(nome: string, args: Record<string, unknown>): Promise<ResultadoTool>;
}

export interface RespostaHttp {
  status: number;
  headers: Record<string, string>;
  body: string | null;
}

type Id = string | number | null;
type Obj = Record<string, unknown>;

const JSON_CT = { "content-type": "application/json" };
const resposta = (status: number, obj: unknown): RespostaHttp => ({
  status,
  headers: JSON_CT,
  body: JSON.stringify(obj),
});
const erro = (status: number, id: Id, code: number, message: string, data?: unknown) =>
  resposta(status, {
    jsonrpc: "2.0",
    id,
    error: data === undefined ? { code, message } : { code, message, data },
  });
const sucesso = (id: Id, result: unknown) => resposta(200, { jsonrpc: "2.0", id, result });
const ACEITO: RespostaHttp = { status: 202, headers: {}, body: null };

function decodificarNome(v: string): string {
  const m = /^=\?base64\?(.*)\?=$/.exec(v);
  if (!m) return v;
  try {
    return new TextDecoder().decode(Uint8Array.from(atob(m[1]), (c) => c.charCodeAt(0)));
  } catch {
    return v;
  }
}

const listarTools = (srv: ServidorMcp) =>
  srv.tools.map(({ name, title, description, inputSchema, annotations }) => ({
    name,
    title,
    description,
    inputSchema,
    annotations: { title, ...annotations },
  }));

const listarPrompts = (srv: ServidorMcp) =>
  srv.prompts.map(({ name, title, description, arguments: a }) => ({
    name,
    title,
    description,
    arguments: a ?? [],
  }));

type Execucao = { ok: true; result: Obj } | { ok: false; code: number; message: string };

async function executarMetodo(metodo: string, params: Obj, srv: ServidorMcp): Promise<Execucao> {
  if (metodo === "tools/list") return { ok: true, result: { tools: listarTools(srv) } };
  if (metodo === "prompts/list") return { ok: true, result: { prompts: listarPrompts(srv) } };
  if (metodo === "tools/call") {
    const nome = params.name;
    if (typeof nome !== "string" || !srv.tools.some((t) => t.name === nome)) {
      return { ok: false, code: ERRO.PARAMS, message: `Unknown tool: ${String(nome)}` };
    }
    const args = params.arguments ?? {};
    if (typeof args !== "object" || args === null || Array.isArray(args)) {
      return { ok: false, code: ERRO.PARAMS, message: "arguments deve ser um objeto" };
    }
    let r: ResultadoTool;
    try {
      r = await srv.chamarTool(nome, args as Obj);
    } catch {
      r = {
        content: [{ type: "text", text: "Erro interno ao executar a ferramenta." }],
        isError: true,
      };
    }
    return { ok: true, result: { ...r } };
  }
  if (metodo === "prompts/get") {
    const p = srv.prompts.find((x) => x.name === params.name);
    if (!p)
      return { ok: false, code: ERRO.PARAMS, message: `Unknown prompt: ${String(params.name)}` };
    const args = (
      params.arguments && typeof params.arguments === "object" ? params.arguments : {}
    ) as Obj;
    const faltando = (p.arguments ?? []).filter(
      (a) => a.required && typeof args[a.name] !== "string"
    );
    if (faltando.length) {
      return {
        ok: false,
        code: ERRO.PARAMS,
        message: `Argumento obrigatório: ${faltando.map((a) => a.name).join(", ")}`,
      };
    }
    const texto = Object.fromEntries(
      Object.entries(args).filter(([, v]) => typeof v === "string")
    ) as Record<string, string>;
    return {
      ok: true,
      result: {
        description: p.description,
        messages: [{ role: "user", content: { type: "text", text: p.montar(texto) } }],
      },
    };
  }
  return { ok: false, code: ERRO.METODO, message: `Method not found: ${metodo}` };
}

export async function tratarPostMcp(
  headers: Headers,
  corpoTexto: string,
  srv: ServidorMcp
): Promise<RespostaHttp> {
  let msg: unknown;
  try {
    msg = JSON.parse(corpoTexto);
  } catch {
    return erro(400, null, ERRO.PARSE, "Parse error");
  }
  if (Array.isArray(msg)) return erro(400, null, ERRO.REQUISICAO, "Batch não suportado");
  if (!msg || typeof msg !== "object") return erro(400, null, ERRO.REQUISICAO, "Invalid Request");
  const m = msg as Obj;
  if (m.jsonrpc !== "2.0") return erro(400, null, ERRO.REQUISICAO, "Invalid Request");
  if (typeof m.method !== "string") return ACEITO; // resposta do cliente
  const temId = typeof m.id === "string" || typeof m.id === "number";
  if (!temId) return ACEITO; // notificação
  const id = m.id as string | number;
  const metodo = m.method;
  const params = (
    m.params && typeof m.params === "object" && !Array.isArray(m.params) ? m.params : {}
  ) as Obj;
  const meta = (params._meta && typeof params._meta === "object" ? params._meta : {}) as Obj;
  const versaoMeta = meta[META_VERSAO];
  const cabVersao = headers.get("mcp-protocol-version");

  if (typeof versaoMeta === "string") {
    // ── Era moderna (2026-07-28)
    if (versaoMeta !== VERSAO_MODERNA) {
      return erro(400, id, ERRO.VERSAO, "Unsupported protocol version", {
        supported: VERSOES_SUPORTADAS,
        requested: versaoMeta,
      });
    }
    if (cabVersao && cabVersao !== versaoMeta) {
      return erro(400, id, ERRO.CABECALHO, "Header mismatch: MCP-Protocol-Version");
    }
    const cabMetodo = headers.get("mcp-method");
    if (cabMetodo && cabMetodo !== metodo)
      return erro(400, id, ERRO.CABECALHO, "Header mismatch: Mcp-Method");
    const cabNome = headers.get("mcp-name");
    if (cabNome && typeof params.name === "string" && decodificarNome(cabNome) !== params.name) {
      return erro(400, id, ERRO.CABECALHO, "Header mismatch: Mcp-Name");
    }
    const _meta = { [META_SERVIDOR]: srv.info };
    if (metodo === "server/discover") {
      return sucesso(id, {
        resultType: "complete",
        supportedVersions: VERSOES_SUPORTADAS,
        capabilities: { tools: {}, prompts: {} },
        instructions: srv.instructions,
        ttlMs: TTL_MS,
        cacheScope: "public",
        _meta,
      });
    }
    const r = await executarMetodo(metodo, params, srv);
    if (!r.ok) return erro(r.code === ERRO.METODO ? 404 : 200, id, r.code, r.message);
    const cache = metodo.endsWith("/list") ? { ttlMs: TTL_MS, cacheScope: "public" } : {};
    return sucesso(id, { resultType: "complete", ...r.result, ...cache, _meta });
  }

  // ── Era legada (2025-11-25 / 2025-06-18)
  if (metodo === "initialize") {
    const pedida = params.protocolVersion;
    const versao =
      typeof pedida === "string" && VERSOES_LEGADAS.includes(pedida) ? pedida : VERSOES_LEGADAS[0];
    return sucesso(id, {
      protocolVersion: versao,
      capabilities: { tools: { listChanged: false }, prompts: { listChanged: false } },
      serverInfo: srv.info,
      instructions: srv.instructions,
    });
  }
  if (cabVersao && !HEADERS_TOLERADOS.has(cabVersao)) {
    return erro(400, id, ERRO.REQUISICAO, `Unsupported MCP-Protocol-Version: ${cabVersao}`);
  }
  if (metodo === "ping") return sucesso(id, {});
  const r = await executarMetodo(metodo, params, srv);
  if (!r.ok) return erro(200, id, r.code, r.message);
  return sucesso(id, r.result);
}
