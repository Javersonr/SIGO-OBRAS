/**
 * @sigoobras/sdk — wrapper compatível com @base44/sdk falando com Supabase.
 *
 * Uso típico em apps/web/src/api/base44Client.js:
 *
 *   import { createClient } from '@sigoobras/sdk'
 *   export const base44 = createClient({
 *     supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
 *     supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
 *   })
 */

import { createSupabase } from "./client.js";
import { createEntitiesProxy } from "./entities.js";
import { createAuth } from "./auth.js";
import { createFunctions } from "./functions.js";
import { createIntegrations } from "./integrations.js";

/**
 * Cria o cliente compatível com @base44/sdk.
 *
 * @param {Object} opts
 * @param {string} opts.supabaseUrl       - URL do projeto (https://*.supabase.co)
 * @param {string} opts.supabaseAnonKey   - chave anon (pública, segura no frontend)
 * @param {Object} [opts.options]         - opções extras do supabase-js
 * @returns {Object} client com {entities, auth, functions, integrations, _supabase}
 */
export function createClient(opts) {
  const supabase = createSupabase(opts);

  return {
    // API compatível Base44
    entities: createEntitiesProxy(supabase),
    auth: createAuth(supabase),
    functions: createFunctions(supabase),
    integrations: createIntegrations(supabase),

    // Acesso direto ao supabase-js (escape hatch — use apenas se necessário)
    _supabase: supabase,
  };
}

// Re-export para casos avançados
export { createSupabase } from "./client.js";
export { entityToTable, tableToEntity } from "./name-mapper.js";
