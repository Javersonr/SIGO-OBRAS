/**
 * sigoClient — cliente unificado de backend SIGO Obras
 *
 * Exporta `sigo` com a mesma superfície de API do cliente legado:
 *   sigo.entities.X.filter/list/get/create/update/delete
 *   sigo.functions.invoke(name, payload)
 *   sigo.auth.me() / .logout()
 *   sigo.integrations.Core.UploadFile / SendEmail / InvokeLLM
 *   sigo.asServiceRole.* (escape hatch — use com cautela)
 *
 * Camadas (estado intermediário até Phase 8 do roadmap):
 *   - entities      → Supabase via @sigoobras/sdk
 *   - functions     → Supabase Edge Functions p/ as migradas (REWRITE map);
 *                     legado p/ as não migradas
 *   - auth          → legado por enquanto
 *   - integrations  → legado por enquanto
 *   - asServiceRole → legado (sem equivalente no novo backend)
 */
import { createClient as createLegacyClient } from "@base44/sdk";
import { createClient as createSupaClient } from "@sigoobras/sdk";
import { appParams } from "@/lib/app-params";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Cliente Supabase (entities + functions migradas)
const supa =
  supabaseUrl && supabaseAnonKey ? createSupaClient({ supabaseUrl, supabaseAnonKey }) : null;

// Cliente legado (asServiceRole + integrations + functions não migradas)
const { appId, token, functionsVersion, appBaseUrl } = appParams;
const legacy = createLegacyClient({
  appId,
  token,
  functionsVersion,
  serverUrl: "",
  requiresAuth: false,
  appBaseUrl,
});

// Funções já migradas pra Edge Functions Supabase (camelCase → kebab-case)
const SUPABASE_FUNCTIONS_REWRITE = {
  loginCustom: "login-custom",
  alterarSenha: "alterar-senha",
  redefinirSenhaAdmin: "redefinir-senha-admin",
};

// Patch functions.invoke pra rotear as migradas
const legacyInvoke = legacy.functions.invoke.bind(legacy.functions);
legacy.functions.invoke = async function patchedInvoke(name, payload = {}) {
  const supaName = SUPABASE_FUNCTIONS_REWRITE[name];
  if (supaName && supa) {
    try {
      const data = await supa.functions.invoke(supaName, payload);
      return { data };
    } catch (err) {
      const msg = err?.context?.error || err?.message || "Erro na função";
      return { data: { success: false, error: msg }, error: err };
    }
  }
  return legacyInvoke(name, payload);
};

/**
 * Stub de `.subscribe()` por entidade.
 *
 * O SDK base44 antigo tinha pubsub realtime via `entities.X.subscribe(cb)`.
 * O novo backend (Supabase) ainda não expõe isso pelo wrapper, e há lugares
 * no frontend (NotificationsPanel, SolicitarEntregaFerramentas) que chamam
 * `subscribe` e quebravam a árvore de render inteira (tela branca) com
 * "TypeError: entities.X.subscribe is not a function".
 *
 * Aqui devolvemos um no-op que retorna função de unsubscribe — preserva a
 * API esperada sem fazer realtime de verdade. Quando migrarmos para
 * supabase.channel(...), trocamos por implementação real.
 */
const NOOP_UNSUBSCRIBE = () => {};
const SUBSCRIBE_NOOP = () => NOOP_UNSUBSCRIBE;

function wrapEntitiesWithSubscribeStub(entities) {
  return new Proxy(entities, {
    get(target, prop) {
      const entity = target[prop];
      if (!entity || typeof entity !== "object") return entity;
      // Já tem subscribe? Não mexe.
      if (typeof entity.subscribe === "function") return entity;
      // Cria wrapper só pra essa entidade adicionando subscribe no-op.
      return new Proxy(entity, {
        get(t, p) {
          if (p === "subscribe") return SUBSCRIBE_NOOP;
          return t[p];
        },
      });
    },
  });
}

// Substitui entities inteiramente pelo Supabase via @sigoobras/sdk
if (supa) {
  Object.defineProperty(legacy, "entities", {
    value: wrapEntitiesWithSubscribeStub(supa.entities),
    writable: true,
    configurable: true,
  });
}

// Export único: `sigo`. Todo o frontend usa isso agora.
export const sigo = legacy;

// Acesso direto ao supabase-js se precisar (escape hatch)
export const supabase = supa?._supabase ?? null;
