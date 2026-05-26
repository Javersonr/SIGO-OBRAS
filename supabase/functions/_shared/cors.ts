/**
 * Headers CORS comuns a todas as Edge Functions do SIGO Obras.
 * Origens são restritas pela config do projeto Supabase (Allowed Origins).
 */
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  // Aceita os headers padrão do supabase-js + qualquer header customizado
  // x-* do SDK do SIGO (e qualquer futura adição). Mantém os headers padrão
  // listados explicitamente pro caso do browser não interpretar wildcard.
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-sigoobras-sdk-version, x-supabase-api-version, x-requested-with",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

/** Resposta padrão pra preflight OPTIONS */
export const preflightResponse = () => new Response("ok", { headers: corsHeaders });

/** Helpers de resposta com headers CORS já aplicados */
export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });

export const ok = (data: unknown) =>
  json({ success: true, ...(typeof data === "object" && data !== null ? data : { data }) });
export const fail = (message: string, status = 400, extra?: Record<string, unknown>) =>
  json({ success: false, error: message, ...extra }, status);
