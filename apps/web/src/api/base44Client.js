/**
 * base44Client — cliente unificado de backend (estado intermediário)
 *
 * Estratégia (até Phase 4 do roadmap):
 *   - `base44.entities.*`           → SUPABASE via @sigoobras/sdk
 *   - `base44.functions.invoke(*)`  → SUPABASE Edge Functions p/ as funções
 *                                     migradas (SUPABASE_FUNCTIONS_REWRITE),
 *                                     Base44 legado pras outras
 *   - `base44.asServiceRole.*`      → Base44 legado (a usar com cautela)
 *   - `base44.integrations.Core.*`  → Base44 legado por enquanto
 *   - `base44.auth.*`               → Base44 legado por enquanto
 *
 * Quando todo o frontend estiver usando @sigoobras/sdk diretamente, este
 * arquivo deixa de existir.
 */
import { createClient as createBase44Client } from "@base44/sdk";
import { createClient as createSigoClient } from "@sigoobras/sdk";
import { appParams } from "@/lib/app-params";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// --- Cliente Supabase via wrapper @sigoobras/sdk -----------------------------
// Provê entities/auth/functions/integrations compatíveis com a API Base44,
// mas falando com Supabase.
const sigo =
  supabaseUrl && supabaseAnonKey ? createSigoClient({ supabaseUrl, supabaseAnonKey }) : null;

// --- Cliente legado (Base44) -------------------------------------------------
// Mantido só pra superfícies ainda NÃO migradas (asServiceRole, integrations
// avançadas) e como fallback de functions que não estão em
// SUPABASE_FUNCTIONS_REWRITE.
const { appId, token, functionsVersion, appBaseUrl } = appParams;
const legacy = createBase44Client({
  appId,
  token,
  functionsVersion,
  serverUrl: "",
  requiresAuth: false,
  appBaseUrl,
});

// ---------------------------------------------------------------------------
// Funções já migradas pra Edge Functions Supabase (camelCase → kebab-case)
// ---------------------------------------------------------------------------
const SUPABASE_FUNCTIONS_REWRITE = {
  loginCustom: "login-custom",
  alterarSenha: "alterar-senha",
  redefinirSenhaAdmin: "redefinir-senha-admin",
};

/**
 * Intercept funções: roteia as migradas pra Supabase, resto vai pro Base44.
 * Mantém a shape `{ data, error }` esperada pelo frontend.
 */
const originalInvoke = legacy.functions.invoke.bind(legacy.functions);
legacy.functions.invoke = async function patchedInvoke(name, payload = {}) {
  const supabaseName = SUPABASE_FUNCTIONS_REWRITE[name];
  if (supabaseName && sigo) {
    try {
      const data = await sigo.functions.invoke(supabaseName, payload);
      return { data };
    } catch (err) {
      const msg = err?.context?.error || err?.message || "Erro na função";
      return { data: { success: false, error: msg }, error: err };
    }
  }
  return originalInvoke(name, payload);
};

// ---------------------------------------------------------------------------
// Substituição completa do `base44.entities` pelo do @sigoobras/sdk.
// Se o sigo client não foi criado (env var faltando), cai pro legado.
// ---------------------------------------------------------------------------
if (sigo) {
  // Object.defineProperty pra sobrescrever sem mexer no resto do objeto
  Object.defineProperty(legacy, "entities", {
    value: sigo.entities,
    writable: true,
    configurable: true,
  });
}

export const base44 = legacy;
export { sigo as supabase };
