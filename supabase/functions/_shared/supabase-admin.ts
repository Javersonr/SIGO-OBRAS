/**
 * Helper pra criar cliente Supabase com SERVICE_ROLE_KEY dentro de Edge Functions.
 * SERVICE_ROLE bypassa RLS — usar com cautela e nunca expor para o frontend.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export function createAdminClient() {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!url || !key) {
    throw new Error("Variáveis SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias");
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
