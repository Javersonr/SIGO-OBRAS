/**
 * CORS das Edge Functions do SIGO Obras — restrito por origem (SEG 4.2).
 *
 * Origens permitidas: produção (sigoobras.com.br, com e sem www) + dev local.
 * O header Access-Control-Allow-Origin é ECOADO por requisição via withCors():
 * origem permitida recebe a si mesma; origem desconhecida não recebe o header
 * (o browser bloqueia a leitura da resposta). Chamadas server-to-server (sem
 * header Origin — bots, crons, supabase-js em Node) não passam por CORS e
 * continuam funcionando normalmente.
 *
 * Uso nas functions:
 *   Deno.serve(withCors(async (req) => { ... }));
 * O wrapper responde o preflight OPTIONS e injeta os headers em toda resposta.
 */

const ALLOWED_ORIGINS = new Set([
  "https://sigoobras.com.br",
  "https://www.sigoobras.com.br",
  // dev local (vite dev/preview)
  "http://localhost:5173",
  "http://localhost:4173",
  "http://127.0.0.1:5173",
]);

const BASE_HEADERS = {
  // Aceita os headers padrão do supabase-js + headers customizados x-* do SDK.
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-sigoobras-sdk-version, x-supabase-api-version, x-requested-with",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Max-Age": "86400",
  Vary: "Origin",
};

function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    return { ...BASE_HEADERS, "Access-Control-Allow-Origin": origin };
  }
  // Origem ausente (server-to-server) ou não permitida: sem ACAO.
  return { ...BASE_HEADERS };
}

/**
 * Envolve o handler: responde preflight e injeta CORS em TODA resposta
 * (inclusive erros lançados pelo handler, convertidos em 500 JSON).
 */
export function withCors(
  handler: (req: Request) => Response | Promise<Response>
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const cors = corsHeadersFor(req);

    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: cors });
    }

    let resp: Response;
    try {
      resp = await handler(req);
    } catch (err) {
      console.error("[withCors] handler error:", err);
      resp = new Response(JSON.stringify({ success: false, error: "Erro interno" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }

    const headers = new Headers(resp.headers);
    for (const [k, v] of Object.entries(cors)) headers.set(k, v);
    return new Response(resp.body, { status: resp.status, headers });
  };
}

// ── Compatibilidade com o código existente ───────────────────────────────────
// Os headers de resposta NÃO carregam mais Allow-Origin fixo — quem injeta a
// origem certa é o withCors(). Estes helpers seguem montando o corpo/status.

export const corsHeaders = { ...BASE_HEADERS };

/** Resposta padrão pra preflight OPTIONS (mantida por compat; o withCors já
 *  intercepta OPTIONS antes do handler). */
export const preflightResponse = () => new Response("ok", { headers: corsHeaders });

/** Helpers de resposta JSON (o withCors injeta os headers CORS por requisição) */
export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });

export const ok = (data: unknown) =>
  json({ success: true, ...(typeof data === "object" && data !== null ? data : { data }) });
export const fail = (message: string, status = 400, extra?: Record<string, unknown>) =>
  json({ success: false, error: message, ...extra }, status);
