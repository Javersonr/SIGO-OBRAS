/**
 * app-params — lê parâmetros de configuração do app
 *
 * Ordem de precedência por parâmetro:
 *   1. ?param=... na URL (e persiste em localStorage)
 *   2. localStorage previamente setado
 *   3. defaultValue (vindo de VITE_LEGACY_* nas env vars)
 *
 * Esses params alimentam o cliente legado (sigoClient.js) enquanto a
 * migração para Supabase não termina. Quando todo o backend tiver migrado
 * (Phase 8), esse arquivo é removido junto com o cliente legado.
 */
const isNode = typeof window === "undefined";
const windowObj = isNode ? { localStorage: new Map() } : window;
const storage = windowObj.localStorage;

const toSnakeCase = (str) => str.replace(/([A-Z])/g, "_$1").toLowerCase();

const STORAGE_PREFIX = "sigo_legacy_";

const getAppParamValue = (paramName, { defaultValue = undefined, removeFromUrl = false } = {}) => {
  if (isNode) return defaultValue;

  const storageKey = `${STORAGE_PREFIX}${toSnakeCase(paramName)}`;
  const urlParams = new URLSearchParams(window.location.search);
  const searchParam = urlParams.get(paramName);

  if (removeFromUrl) {
    urlParams.delete(paramName);
    const newUrl =
      `${window.location.pathname}` +
      (urlParams.toString() ? `?${urlParams.toString()}` : "") +
      window.location.hash;
    window.history.replaceState({}, document.title, newUrl);
  }

  if (searchParam) {
    storage.setItem(storageKey, searchParam);
    return searchParam;
  }
  if (defaultValue) {
    storage.setItem(storageKey, defaultValue);
    return defaultValue;
  }
  return storage.getItem(storageKey) || null;
};

const getAppParams = () => {
  if (getAppParamValue("clear_access_token") === "true") {
    storage.removeItem(`${STORAGE_PREFIX}access_token`);
    storage.removeItem("token");
  }
  return {
    appId: getAppParamValue("app_id", {
      defaultValue: import.meta.env.VITE_LEGACY_APP_ID,
    }),
    token: getAppParamValue("access_token", { removeFromUrl: true }),
    fromUrl: getAppParamValue("from_url", {
      defaultValue: typeof window !== "undefined" ? window.location.href : "",
    }),
    functionsVersion: getAppParamValue("functions_version", {
      defaultValue: import.meta.env.VITE_LEGACY_FUNCTIONS_VERSION,
    }),
    appBaseUrl: getAppParamValue("app_base_url", {
      defaultValue: import.meta.env.VITE_LEGACY_APP_BASE_URL,
    }),
  };
};

export const appParams = { ...getAppParams() };
