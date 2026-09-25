/**
 * Segredos do conector do Claude (client_id, códigos, chaves opacas) e PKCE.
 * Puro (Web Crypto): roda no Deno (Edge Function) e no Node (node --test).
 * O banco guarda só hashSegredo(); o segredo em claro sai uma única vez.
 */

export const PREFIXO = {
  cliente: "sigo_c_",
  codigo: "sigo_ac_",
  acesso: "sigo_at_",
  renovacao: "sigo_rt_",
  manual: "sigo_pk_",
} as const;

export function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Segredo aleatório (padrão 256 bits) com prefixo legível. */
export function gerarSegredo(prefixo: string, bytes = 32): string {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return `${prefixo}${base64url(b)}`;
}

/** SHA-256 em hex — é o que vai para o banco. */
export async function hashSegredo(segredo: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(segredo));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** RFC 7636 §4.1: 43–128 caracteres [A-Z a-z 0-9 - . _ ~]. */
export function verifierValido(v: unknown): boolean {
  return typeof v === "string" && /^[A-Za-z0-9\-._~]{43,128}$/.test(v);
}

/** S256 = base64url(SHA-256) → exatamente 43 caracteres. */
export function challengeValido(c: unknown): boolean {
  return typeof c === "string" && /^[A-Za-z0-9_-]{43}$/.test(c);
}

export async function pkceS256Confere(verifier: string, challenge: string): Promise<boolean> {
  if (!verifierValido(verifier) || !challengeValido(challenge)) return false;
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(d)) === challenge;
}
