/**
 * mcp — servidor MCP do SIGO Obras para o Claude (conector remoto).
 *
 * Streamable HTTP SEM ESTADO, só application/json, protocolo dual-era
 * (_shared/mcp/protocolo.ts). Autorização por chave OPACA do mcp-oauth (não é
 * JWT do Supabase) → contexto.ts; sem chave → 401 + WWW-Authenticate com
 * resource_metadata (o Claude descobre o login por aqui). Dados SEMPRE da
 * empresa da chave (service role + filtro explícito). Deploy: --no-verify-jwt.
 */
import { createAdminClient } from "../_shared/supabase-admin.ts";
import {
  consumirTentativa,
  ipDaRequisicao,
  MSG_MUITAS_TENTATIVAS,
} from "../_shared/limite-tentativas.ts";
import { recursoCanonico } from "../_shared/conector/redirect.ts";
import { MENSAGEM_NEGACAO } from "../_shared/conector/acesso.ts";
import { ISSUER } from "../_shared/conector/oauth-regras.ts";
import { tratarPostMcp, type ServidorMcp } from "../_shared/mcp/protocolo.ts";
import { resolverChave } from "./contexto.ts";
import { executarFerramenta, FERRAMENTAS, INSTRUCOES, resultadoJson } from "./ferramentas.ts";

// deno-lint-ignore no-explicit-any
type Admin = any;

const RECURSO = recursoCanonico(`${Deno.env.get("SUPABASE_URL") ?? ""}/functions/v1/mcp`) as string;
const URL_PRM = `${RECURSO}/.well-known/oauth-protected-resource`;
const INFO = { name: "sigo-obras", title: "SIGO Obras", version: "1.0.0" };

// Origin: ausente passa (servidor a servidor); presente, só estes (MCP exige validar)
const ORIGENS = [
  /^https:\/\/(www\.)?sigoobras\.com\.br$/,
  /^https:\/\/claude\.(ai|com)$/,
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
];
const origemOk = (o: string | null) => !o || ORIGENS.some((r) => r.test(o));

function cors(req: Request): Record<string, string> {
  const o = req.headers.get("origin");
  const h: Record<string, string> = {
    "access-control-allow-headers":
      "authorization, content-type, accept, mcp-protocol-version, mcp-method, mcp-name, mcp-session-id",
    "access-control-allow-methods": "POST, GET, OPTIONS",
    "access-control-expose-headers": "www-authenticate",
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
    tools: FERRAMENTAS,
    prompts: [],
    chamarTool: async (nome, args) => {
      const leitura = FERRAMENTAS.find((t) => t.name === nome)?.annotations.readOnlyHint === true;
      const lim = await consumirTentativa(
        admin,
        `mcp:${nome}`,
        3600,
        [{ tipo: "conta", valor: ctx.usuario.id, max: leitura ? 300 : 60 }],
        { falharFechado: true }
      );
      if (!lim.permitido) {
        await auditar(admin, { ...base, ferramenta: nome, resultado: "negado", motivo: "limite" });
        return resultadoJson({ erro: MSG_MUITAS_TENTATIVAS }, true);
      }
      try {
        const res = await executarFerramenta(nome, args, ctx);
        await auditar(admin, { ...base, ferramenta: nome, resultado: res.isError ? "erro" : "ok" });
        return res;
      } catch (e) {
        console.error("[mcp] ferramenta", nome, (e as Error)?.message);
        await auditar(admin, { ...base, ferramenta: nome, resultado: "erro", motivo: "excecao" });
        return resultadoJson(
          { erro: "Erro interno ao executar a ferramenta. Tente de novo." },
          true
        );
      }
    },
  };
  const res = await tratarPostMcp(req.headers, await req.text(), servidor);
  return new Response(res.body, { status: res.status, headers: { ...cors(req), ...res.headers } });
});
