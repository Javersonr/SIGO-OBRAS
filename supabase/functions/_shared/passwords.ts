/**
 * Utilidades de hash de senha.
 *
 * Usamos bcryptjs (pure JS, funciona em Deno via esm.sh sem workers nem WASM).
 * Suporta verificação de hashes legados SHA-256 que vinham da plataforma anterior,
 * com rehash transparente para bcrypt no primeiro login bem-sucedido.
 */
import bcrypt from "https://esm.sh/bcryptjs@2.4.3";

/** Custo do bcrypt — 10 é o default da maioria das libs, leva ~80ms em CPU normal */
const BCRYPT_COST = 10;

/** Gera hash bcrypt para uma nova senha */
export async function hashPassword(plain: string): Promise<string> {
  return await bcrypt.hash(plain, BCRYPT_COST);
}

/**
 * Verifica uma senha contra um hash. Aceita:
 *   - bcrypt ($2a$, $2b$, $2y$)
 *   - SHA-256 hex puro (64 chars) — legado da plataforma anterior
 *
 * Retorna `{ ok, needsRehash }` — needsRehash=true indica que era SHA-256 e
 * o chamador deve regerar o hash com bcrypt e salvar.
 */
export async function verifyPassword(
  plain: string,
  hash: string
): Promise<{ ok: boolean; needsRehash: boolean }> {
  if (!hash) return { ok: false, needsRehash: false };

  // bcrypt
  if (hash.startsWith("$2")) {
    const ok = await bcrypt.compare(plain, hash);
    return { ok, needsRehash: false };
  }

  // SHA-256 hex (64 chars hex) — formato legado
  if (/^[a-f0-9]{64}$/i.test(hash)) {
    const data = new TextEncoder().encode(plain);
    const digest = await crypto.subtle.digest("SHA-256", data);
    const hex = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return { ok: hex.toLowerCase() === hash.toLowerCase(), needsRehash: true };
  }

  return { ok: false, needsRehash: false };
}

/**
 * Gera uma senha provisória aleatória: 12 caracteres, alfanuméricos sem chars
 * confusos (0/O, 1/l, etc.). Garante pelo menos 1 número e 1 maiúscula.
 */
export function generateProvisionalPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lowers = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const all = alphabet + lowers + digits;

  const pick = (set: string) => set[crypto.getRandomValues(new Uint32Array(1))[0] % set.length];

  let pwd = pick(alphabet) + pick(digits); // garante 1 maiúscula + 1 número
  for (let i = 0; i < 10; i++) pwd += pick(all);

  // Embaralha
  return pwd
    .split("")
    .sort(() => crypto.getRandomValues(new Uint32Array(1))[0] - 2147483648)
    .join("");
}
