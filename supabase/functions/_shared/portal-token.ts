/**
 * portal-token — token compacto assinado (HMAC-SHA256) para usuários EXTERNOS
 * dos portais (fornecedor e cliente).
 *
 * ⚠️  IMPORTANTE: isto NÃO é um JWT do Supabase Auth. Usuários externos NÃO
 * podem receber uma sessão `authenticated` com `app_metadata.empresa_id`, pois
 * a policy `tenant_isolation` (empresa_id = current_empresa_id()) liberaria pra
 * eles TODAS as tabelas da empresa (financeiro, certificado A1, etc.). Um
 * fornecedor só pode ver as cotações dele; um cliente só a oportunidade dele.
 *
 * Por isso os portais seguem como `anon` no supabase-js e TODO acesso a dados
 * passa por Edge Functions com service role, que validam este token e devolvem
 * apenas o escopo permitido.
 *
 * Formato: `<base64url(payload JSON)>.<base64url(HMAC)>`
 * O payload inclui `exp` (epoch em segundos). Segredo em PORTAL_TOKEN_SECRET.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

function bytesToB64url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlToBytes(s: string): Uint8Array {
  let b = s.replace(/-/g, "+").replace(/_/g, "/");
  while (b.length % 4) b += "=";
  const bin = atob(b);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function getKey(): Promise<CryptoKey> {
  const secret = Deno.env.get("PORTAL_TOKEN_SECRET");
  if (!secret) {
    throw new Error("PORTAL_TOKEN_SECRET não configurado nas Edge Functions");
  }
  return await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export interface PortalTokenPayload {
  /** "fornecedor" | "cliente" */
  scope: string;
  empresa_id: string;
  /** presente quando scope = "fornecedor" */
  fornecedor_id?: string;
  /** presente quando scope = "cliente" (== projeto_id/oportunidade_id) */
  oportunidade_id?: string;
  email?: string;
  exp?: number;
  [k: string]: unknown;
}

/** Assina um payload e devolve o token compacto. TTL padrão: 12h. */
export async function signPortalToken(
  payload: PortalTokenPayload,
  ttlSeconds = 60 * 60 * 12
): Promise<string> {
  const body: PortalTokenPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const p = bytesToB64url(enc.encode(JSON.stringify(body)));
  const key = await getKey();
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(p)));
  return `${p}.${bytesToB64url(sig)}`;
}

/**
 * Verifica o token. Retorna o payload se válido e não expirado; senão null.
 * Comparação da assinatura em tempo constante.
 */
export async function verifyPortalToken(token: string): Promise<PortalTokenPayload | null> {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [p, s] = token.split(".");
  if (!p || !s) return null;

  let provided: Uint8Array;
  try {
    provided = b64urlToBytes(s);
  } catch {
    return null;
  }

  let key: CryptoKey;
  try {
    key = await getKey();
  } catch {
    return null;
  }
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(p)));

  if (provided.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ provided[i];
  if (diff !== 0) return null;

  let body: PortalTokenPayload;
  try {
    body = JSON.parse(dec.decode(b64urlToBytes(p)));
  } catch {
    return null;
  }
  if (!body.exp || body.exp < Math.floor(Date.now() / 1000)) return null;
  return body;
}
