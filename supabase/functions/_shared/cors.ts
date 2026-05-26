/**
 * Headers CORS comuns a todas as Edge Functions do SIGO Obras.
 * Origens são restritas pela config do projeto Supabase (Allowed Origins).
 */
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
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
