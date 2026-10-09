/**
 * mcp — servidor MCP do SIGO Obras para o Claude (conector remoto).
 *
 * Streamable HTTP SEM ESTADO, só application/json, protocolo dual-era
 * (_shared/mcp/protocolo.ts). Autorização por chave OPACA do mcp-oauth (não é
 * JWT do Supabase) → contexto.ts; sem chave → 401 + WWW-Authenticate com
 * resource_metadata (o Claude descobre o login por aqui). Dados SEMPRE da
 * empresa da chave: as ferramentas só recebem a CamadaEmpresa (filtro explícito
 * por empresa_id, sem exclusão). Cada chamada passa pelo despacho (despacho.ts):
 * permissão → limite → campos → execução → auditoria. Deploy: --no-verify-jwt.
 */
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { consumirTentativa, ipDaRequisicao } from "../_shared/limite-tentativas.ts";
import { recursoDoConector } from "../_shared/conector/recurso.ts";
import { camadaDaEmpresa } from "../_shared/conector/camada-empresa.ts";
import { MENSAGEM_NEGACAO } from "../_shared/conector/acesso.ts";
import { ISSUER } from "../_shared/conector/oauth-regras.ts";
import { tratarPostMcp, type ServidorMcp } from "../_shared/mcp/protocolo.ts";
import { resolverChave } from "./contexto.ts";
import { despachar, LIMITE_GRAVACAO_HORA, LIMITE_LEITURA_HORA } from "./despacho.ts";
import { FERRAMENTAS, INSTRUCOES, PROMPTS } from "./ferramentas.ts";

// deno-lint-ignore no-explicit-any
type Admin = any;

const RECURSO = recursoDoConector(Deno.env.get("SUPABASE_URL"));
const URL_PRM = `${RECURSO}/.well-known/oauth-protected-resource`;
const INFO = { name: "sigo-obras", title: "SIGO Obras", version: "1.0.0" };

// Origin: ausente passa (servidor a servidor); presente, só estes (MCP exige validar)
const ORIGENS = [
  /^https:\/\/(www\.)?sigoobras\.com\.br$/,
  /^https:\/\/claude\.(ai|com)$/,
  /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/,
];
const origemOk = (o: string | null) => !o || ORIGENS.some((r) => r.test(o));

function cors(req: Request): Record<string, string> {
  const o = req.headers.get("origin");
  const h: Record<string, string> = {
    "access-control-allow-headers":
      "authorization, content-type, accept, mcp-protocol-version, mcp-method, mcp-name, mcp-session-id",
    "access-control-allow-methods": "POST, GET, OPTIONS",
    "access-control-expose-headers": "www-authenticate, retry-after",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
  if (o && origemOk(o)) h["access-control-allow-origin"] = o;
  return h;
}

function responder(
  req: Request,
  status: number,
  corpo: unknown,
  extras: Record<string, string> = {}
) {
  const tipo: Record<string, string> = corpo === null ? {} : { "content-type": "application/json" };
  return new Response(corpo === null ? null : JSON.stringify(corpo), {
    status,
    headers: { ...cors(req), ...tipo, ...extras },
  });
}

function naoAutorizado(req: Request, invalida: boolean) {
  const partes = [`resource_metadata="${URL_PRM}"`, `scope="conector"`];
  if (invalida) partes.unshift(`error="invalid_token"`);
  return responder(
    req,
    401,
    {
      error: invalida ? "invalid_token" : "unauthorized",
      error_description: "Conecte o SIGO Obras ao Claude para continuar.",
    },
    { "www-authenticate": `Bearer ${partes.join(", ")}` }
  );
}

async function auditar(admin: Admin, linha: Record<string, unknown>) {
  const { error } = await admin.from("mcp_auditoria").insert(linha);
  if (error) console.error("[mcp] auditoria:", error.message);
}

Deno.serve(async (req) => {
  try {
    return await atender(req);
  } catch (e) {
    // Exceção inesperada: 500 no formato JSON-RPC e COM CORS (sem isto o
    // runtime devolveria um 500 cru, sem CORS e fora do JSON).
    console.error("[mcp] erro inesperado:", (e as Error)?.message ?? String(e));
    return responder(req, 500, {
      jsonrpc: "2.0",
      id: null,
      error: { code: -32603, message: "Erro interno" },
    });
  }
});

async function atender(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return responder(req, 204, null);
  const caminho = new URL(req.url).pathname;
  if (req.method === "GET" && caminho.endsWith("/.well-known/oauth-protected-resource")) {
    return responder(
      req,
      200,
      {
        resource: RECURSO,
        authorization_servers: [ISSUER],
        scopes_supported: ["conector"],
        bearer_methods_supported: ["header"],
        resource_name: "SIGO Obras",
      },
      { "cache-control": "public, max-age=300" }
    );
  }
  if (req.method !== "POST")
    return responder(req, 405, { error: "method_not_allowed" }, { allow: "POST, OPTIONS" });
  if (!origemOk(req.headers.get("origin"))) {
    return responder(req, 403, {
      jsonrpc: "2.0",
      id: null,
      error: { code: -32600, message: "Origin não permitido" },
    });
  }

  const bearer = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "")?.[1] ?? "";
  if (!bearer) return naoAutorizado(req, false);

  const admin = createAdminClient();
  const ip = ipDaRequisicao(req);
  const r = await resolverChave(admin, bearer);
  if (!r.ok) {
    if (r.motivo === "chave_invalida") return naoAutorizado(req, true);
    if (r.motivo === "indisponivel") {
      // Falha passageira do banco: nunca é negação, e não vira linha em
      // mcp_auditoria (auditoria é só para acesso de fato negado).
      return responder(
        req,
        503,
        {
          error: "temporarily_unavailable",
          error_description: "SIGO indisponível no momento. Tente de novo em instantes.",
        },
        { "retry-after": "5" }
      );
    }
    if (r.empresaId) {
      await auditar(admin, {
        empresa_id: r.empresaId,
        usuario_email: r.email ?? null,
        autorizacao_id: r.autorizacaoId ?? null,
        ferramenta: "(acesso)",
        resultado: "negado",
        motivo: r.motivo,
        ip,
      });
    }
    return responder(req, 403, {
      error: "forbidden",
      error_description: MENSAGEM_NEGACAO[r.motivo],
    });
  }

  const ctx = r.ctx;
  const base = {
    empresa_id: ctx.empresa.id,
    usuario_email: ctx.usuario.email,
    autorizacao_id: ctx.autorizacaoId,
    cliente: ctx.cliente,
    ip,
  };
  const servidor: ServidorMcp = {
    info: INFO,
    instructions: INSTRUCOES,
    tools: FERRAMENTAS.map((f) => f.def),
    prompts: PROMPTS,
    chamarTool: (nome, args) =>
      despachar(nome, args, {
        ferramentas: FERRAMENTAS,
        deps: {
          ctx,
          db: camadaDaEmpresa(admin, ctx.empresa.id),
          storage: admin.storage,
          fetchFn: fetch,
          agora: new Date(),
        },
        consumirLimite: (n, leitura) =>
          consumirTentativa(
            admin,
            `mcp:${n}`,
            3600,
            [
              {
                tipo: "conta",
                valor: ctx.usuario.id,
                max: leitura ? LIMITE_LEITURA_HORA : LIMITE_GRAVACAO_HORA,
              },
            ],
            { falharFechado: true }
          ),
        auditar: (linha) => auditar(admin, { ...base, ...linha }),
      }),
  };
  const res = await tratarPostMcp(req.headers, await req.text(), servidor);
  return new Response(res.body, { status: res.status, headers: { ...cors(req), ...res.headers } });
}
