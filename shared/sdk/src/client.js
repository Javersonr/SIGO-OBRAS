/**
 * Cria e configura o Supabase client subjacente.
 */

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * @param {Object} opts
 * @param {string} opts.supabaseUrl
 * @param {string} opts.supabaseAnonKey
 * @param {Object} [opts.options] — opções extras pro createClient do supabase-js
 */
export function createSupabase({ supabaseUrl, supabaseAnonKey, options = {} } = {}) {
  if (!supabaseUrl) throw new Error("createSupabase: supabaseUrl obrigatório");
  if (!supabaseAnonKey) throw new Error("createSupabase: supabaseAnonKey obrigatório");

  return createSupabaseClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
    },
    db: {
      schema: "public",
    },
    global: {
      headers: {
        "x-sigoobras-sdk-version": "0.1.0",
      },
    },
    ...options,
  });
}
