/**
 * sigoClient — cliente de backend do SIGO Obras (100% Supabase).
 *
 * Superfície (compatível com o código existente):
 *   sigo.entities.X.filter/list/get/create/update/delete  → @sigoobras/sdk
 *   sigo.functions.invoke(nome, payload)                  → Edge Functions
 *   sigo.auth.me() / .logout()                            → sessão custom
 *   sigo.integrations.Core.UploadFile / InvokeLLM         → Supabase / ia-processar
 *
 * O SDK legado (@base44/sdk) foi REMOVIDO em set/2026 — o backend Base44
 * está desativado desde a migração. Funções ainda não migradas retornam
 * erro claro em vez de falha silenciosa (antes: HTML do SPA com HTTP 200).
 */
import { createClient as createSupaClient } from "@sigoobras/sdk";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supa =
  supabaseUrl && supabaseAnonKey ? createSupaClient({ supabaseUrl, supabaseAnonKey }) : null;

if (!supa) {
  console.error("[sigoClient] VITE_SUPABASE_URL/ANON_KEY ausentes — backend indisponível");
}

// Funções migradas pra Edge Functions Supabase (camelCase → kebab-case)
const SUPABASE_FUNCTIONS_REWRITE = {
  loginCustom: "login-custom",
  alterarSenha: "alterar-senha",
  redefinirSenhaAdmin: "redefinir-senha-admin",
  trocarEmpresa: "trocar-empresa",
  // Recuperação de senha por código no WhatsApp
  recuperarSenha: "recuperar-senha",
  redefinirSenhaCodigo: "redefinir-senha-codigo",
  // Portais externos (service role, sem sessão Supabase Auth)
  portalFornecedorLogin: "portal-fornecedor-login",
  portalFornecedorCotacoes: "portal-fornecedor-cotacoes",
  portalFornecedorCotacao: "portal-fornecedor-cotacao",
  portalFornecedorResposta: "portal-fornecedor-resposta",
  portalClienteDados: "portal-cliente-dados",
  portalClienteAcao: "portal-cliente-acao",
  // Plataforma de IA + config do SaaS
  iaProcessar: "ia-processar",
  saasConfig: "saas-config",
  // Portal do Funcionário (treinamentos EAD)
  portalFuncionario: "portal-funcionario",
  // Disparo de WhatsApp pelo canal do SaaS (Evolution)
  enviarWhatsApp: "enviar-whatsapp",
};

async function invokeFn(nome, payload = {}) {
  const supaName = SUPABASE_FUNCTIONS_REWRITE[nome];
  if (!supaName) {
    // Antes caía no Base44 morto e "resolvia" com o HTML do SPA.
    const msg = `Função "${nome}" ainda não migrada do Base44 — indisponível.`;
    console.warn("[sigoClient]", msg);
    return { data: { success: false, error: msg } };
  }
  if (!supa) return { data: { success: false, error: "Backend não configurado" } };
  try {
    const data = await supa.functions.invoke(supaName, payload);
    return { data };
  } catch (err) {
    // FunctionsHttpError: err.context é a Response — o motivo real (ex.:
    // "Credenciais inválidas") está no BODY.
    let msg = err?.message || "Erro na função";
    try {
      if (err?.context && typeof err.context.json === "function") {
        const body = await err.context.json();
        msg = body?.error || body?.message || msg;
      }
    } catch {
      /* body não-JSON: mantém a mensagem genérica */
    }
    return { data: { success: false, error: msg }, error: err };
  }
}

/**
 * Stub de `.subscribe()` por entidade: o SDK antigo tinha pubsub realtime e
 * alguns componentes ainda chamam `entities.X.subscribe(cb)`. Devolvemos
 * no-op que retorna função de unsubscribe até migrarmos pra supabase.channel.
 */
const NOOP_UNSUBSCRIBE = () => {};
const SUBSCRIBE_NOOP = () => NOOP_UNSUBSCRIBE;

function wrapEntitiesWithSubscribeStub(entities) {
  return new Proxy(entities, {
    get(target, prop) {
      const entity = target[prop];
      if (!entity || typeof entity !== "object") return entity;
      if (typeof entity.subscribe === "function") return entity;
      return new Proxy(entity, {
        get(t, p) {
          if (p === "subscribe") return SUBSCRIBE_NOOP;
          return t[p];
        },
      });
    },
  });
}

// ---------------------------------------------------------------------------
// auth — sessão custom do SIGO (sessionStorage 'custom_auth', setada no login)
// ---------------------------------------------------------------------------
function lerSessaoCustom() {
  try {
    const raw = sessionStorage.getItem("custom_auth");
    if (!raw) return null;
    const dados = JSON.parse(raw);
    const usuario = dados?.usuario || dados || null;
    if (!usuario?.email) return null;
    // O código antigo (Base44) usava user.full_name — mantém o alias.
    return { ...usuario, full_name: usuario.full_name || usuario.nome_completo || usuario.email };
  } catch {
    return null;
  }
}

const auth = {
  async me() {
    const usuario = lerSessaoCustom();
    if (!usuario) throw new Error("Sem sessão ativa");
    return usuario;
  },
  async logout() {
    try {
      sessionStorage.removeItem("custom_auth");
    } catch {
      /* ok */
    }
    await encerrarSessao();
  },
};

// ---------------------------------------------------------------------------
// integrations.Core
// ---------------------------------------------------------------------------
const Core = {
  UploadFile: (...args) => {
    if (!supa) throw new Error("Backend não configurado");
    return supa.integrations.Core.UploadFile(...args);
  },
  /**
   * InvokeLLM — mesma assinatura do SDK antigo:
   *   { prompt, response_json_schema?, file_urls? } → resultado (JSON ou texto)
   * Hoje roteia pro ia-processar (OpenAI, chave global do SaaS).
   */
  InvokeLLM: async ({ prompt, response_json_schema, file_urls } = {}) => {
    const { data } = await invokeFn("iaProcessar", {
      acao: "llm",
      prompt,
      json_schema: response_json_schema,
      file_refs: file_urls,
    });
    if (data?.success === false) throw new Error(data.error || "IA indisponível");
    return data?.resultado;
  },
  SendEmail: async () => {
    throw new Error("Envio de e-mail ainda não migrado do Base44 — indisponível.");
  },
};

const integrations = { Core };

// Export único: `sigo`. Todo o frontend usa isso.
export const sigo = {
  entities: supa ? wrapEntitiesWithSubscribeStub(supa.entities) : {},
  functions: { invoke: invokeFn },
  integrations,
  auth,
};

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
 * toda requisição → habilita a RLS por empresa_id.
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
