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
  trocarEmpresa: "trocar-empresa",
  // Portais externos (Etapa 3b) — service role, sem sessão Supabase Auth
  portalFornecedorLogin: "portal-fornecedor-login",
  portalFornecedorCotacoes: "portal-fornecedor-cotacoes",
  portalFornecedorCotacao: "portal-fornecedor-cotacao",
  portalFornecedorResposta: "portal-fornecedor-resposta",
  portalClienteDados: "portal-cliente-dados",
  portalClienteAcao: "portal-cliente-acao",
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

// integrations.Core.UploadFile: MIGRA do storage legado (Base44, desativado)
// para o Supabase Storage. Era a causa de "null value in column url of
// transacao_anexo" e do "Alguns arquivos não puderam ser enviados (sem URL)".
//
// ⚠️ ARMADILHA: o `integrations` do @base44/sdk é um Proxy que REGENERA
// `Core` e cada endpoint (`UploadFile`...) a CADA acesso. Logo
// `legacy.integrations.Core.UploadFile = fn` NÃO persiste — o handler continuava
// chamando o UploadFile legado, que com serverUrl="" faz POST relativo e cai no
// fallback SPA (index.html, HTTP 200) → resolve sem erro e SEM bucket/path → o
// anexo ficava "sem URL". Por isso instalamos um `integrations` ESTÁVEL (via
// defineProperty, sobrepondo o Proxy) com Core.UploadFile roteado pro Supabase
// e todo o resto (Core.SendEmail/InvokeLLM, custom, installable) delegando ao
// Proxy legado original.
if (supa?.integrations?.Core?.UploadFile) {
  const legacyIntegrations = legacy.integrations; // Proxy regenerável do @base44/sdk
  const routedUpload = (...args) => supa.integrations.Core.UploadFile(...args);

  const stableCore = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "UploadFile") return routedUpload;
        return legacyIntegrations?.Core?.[prop]; // SendEmail/InvokeLLM/etc → legado
      },
    }
  );

  const stableIntegrations = new Proxy(
    {},
    {
      get(_t, pkg) {
        if (pkg === "Core") return stableCore;
        return legacyIntegrations?.[pkg]; // custom/installable → legado
      },
    }
  );

  Object.defineProperty(legacy, "integrations", {
    value: stableIntegrations,
    writable: true,
    configurable: true,
  });
}

// Export único: `sigo`. Todo o frontend usa isso agora.
export const sigo = legacy;

// Acesso direto ao supabase-js se precisar (escape hatch)
export const supabase = supa?._supabase ?? null;

/**
 * resolveStorageUrl — transforma uma referência de arquivo numa URL acessível.
 *
 * Buckets do Supabase são privados, então a URL de acesso é ASSINADA e expira.
 * Em vez de guardar a URL assinada (que morre em 1h) no banco, guardamos a
 * REFERÊNCIA estável "bucket/caminho/arquivo.ext" e geramos uma URL assinada
 * fresca toda vez que o anexo vai ser aberto.
 *
 * Compatível com o legado: se `ref` já for uma URL pronta (http/data/blob),
 * devolve como está (anexos antigos / links externos).
 *
 * @param {string} ref  "bucket/path" OU uma URL completa
 * @param {number} expiresIn  validade da URL assinada em segundos (default 1h)
 * @returns {Promise<string|null>}
 */
export async function resolveStorageUrl(ref, expiresIn = 3600) {
  if (!ref || typeof ref !== "string") return null;
  if (/^(https?:|data:|blob:)/i.test(ref)) return ref; // já é URL pronta
  if (!supabase) return null;
  const slash = ref.indexOf("/");
  if (slash < 1) return null;
  const bucket = ref.slice(0, slash);
  const path = ref.slice(slash + 1);
  try {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
    if (error) {
      console.warn("[resolveStorageUrl] falhou:", error.message);
      return null;
    }
    return data?.signedUrl ?? null;
  } catch (e) {
    console.warn("[resolveStorageUrl] exceção:", e?.message);
    return null;
  }
}

/**
 * Aplica a sessão do Supabase Auth retornada pelo login/troca de empresa.
 * A partir daí o supabase-js anexa o JWT do usuário (role authenticated) em
 * toda requisição → habilita a RLS por empresa_id (quando ligada na Etapa 3).
 *
 * Best-effort: se não vier sessão (ex.: fornecedor, ou ponte Auth indisponível)
 * ou der erro, não lança — o app segue funcionando como antes (anon).
 *
 * @param {{access_token?: string, refresh_token?: string}|null} session
 * @returns {Promise<boolean>} true se a sessão foi aplicada
 */
export async function aplicarSessao(session) {
  if (!supabase || !session?.access_token || !session?.refresh_token) return false;
  try {
    const { error } = await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
    if (error) {
      console.warn("[sigoClient] aplicarSessao falhou (segue como anon):", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[sigoClient] aplicarSessao exceção (segue como anon):", e?.message);
    return false;
  }
}

/**
 * Encerra a sessão do Supabase Auth (logout). `scope: "local"` limpa só este
 * dispositivo/aba — não revoga as outras sessões do usuário. Best-effort.
 */
export async function encerrarSessao() {
  if (!supabase) return;
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch (e) {
    console.warn("[sigoClient] encerrarSessao falhou (não-fatal):", e?.message);
  }
}
