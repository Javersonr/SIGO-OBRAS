/**
 * base44Client — cliente unificado de backend
 *
 * ESTADO ATUAL (migração em andamento):
 *   - A maioria dos `base44.entities.*` e `base44.functions.invoke(...)`
 *     ainda vai pro backend legado via @base44/sdk
 *   - As funções de auth migradas para Supabase Edge Functions são
 *     interceptadas em SUPABASE_FUNCTIONS_REWRITE e roteadas direto pro Supabase
 *
 * No final da Fase 3 do roadmap, todo esse arquivo será substituído por
 * `@sigoobras/sdk` e este arquivo deixa de existir.
 */
import { createClient as createBase44Client } from "@base44/sdk";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { appParams } from "@/lib/app-params";

const { appId, token, functionsVersion, appBaseUrl } = appParams;

// --- Cliente legado (Base44) -------------------------------------------------
const legacyClient = createBase44Client({
  appId,
  token,
  functionsVersion,
  serverUrl: "",
  requiresAuth: false,
  appBaseUrl,
});

// --- Cliente Supabase (Edge Functions + Storage + DB) ------------------------
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase =
  supabaseUrl && supabaseAnonKey
    ? createSupabaseClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

/**
 * Funções já portadas para Supabase Edge Functions.
 * Mapeia o nome legado (camelCase) → nome Supabase (kebab-case).
 *
 * Quando uma function é portada, basta adicionar a entrada aqui — nenhum
 * outro arquivo do frontend precisa mudar.
 */
const SUPABASE_FUNCTIONS_REWRITE = {
  loginCustom: "login-custom",
  alterarSenha: "alterar-senha",
  redefinirSenhaAdmin: "redefinir-senha-admin",
};

/**
 * Intercepta `legacy.functions.invoke(name, payload)`:
 *   - se `name` está em SUPABASE_FUNCTIONS_REWRITE, vai pra Supabase Edge Function
 *   - caso contrário, encaminha pro SDK legado (Base44)
 *
 * Mantém a shape de resposta `{ data, error }` esperada pelo frontend.
 */
const originalInvoke = legacyClient.functions.invoke.bind(legacyClient.functions);

legacyClient.functions.invoke = async function patchedInvoke(name, payload = {}) {
  const supabaseName = SUPABASE_FUNCTIONS_REWRITE[name];
  if (supabaseName && supabase) {
    const { data, error } = await supabase.functions.invoke(supabaseName, {
      body: payload,
    });
    if (error) {
      // Normaliza o erro pro formato esperado pelo frontend
      const msg = error.context?.error || error.message || "Erro na função";
      return { data: { success: false, error: msg }, error };
    }
    return { data };
  }
  return originalInvoke(name, payload);
};

export const base44 = legacyClient;
export { supabase };
