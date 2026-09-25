/**
 * Endereços de retorno (redirect_uri) aceitos pelo servidor de autorização do
 * conector e o identificador canônico do recurso (URL do MCP). Puro.
 *
 * Só o Claude oficial (claude.ai / claude.com) e programas no próprio
 * computador (loopback — Claude Code, porta variável: RFC 8252 §7.3).
 * Qualquer outro endereço é recusado já no registro (sem "app falso do SIGO").
 */

export type TipoRedirect = "claude" | "loopback";

const CLAUDE = new Set([
  "https://claude.ai/api/mcp/auth_callback",
  "https://claude.com/api/mcp/auth_callback",
]);
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

function url(uri: string): URL | null {
  try {
    return new URL(uri);
  } catch {
    return null;
  }
}

export function classificarRedirect(uri: unknown): TipoRedirect | null {
  if (typeof uri !== "string" || uri.length > 300) return null;
  if (CLAUDE.has(uri)) return "claude";
  const u = url(uri);
  if (!u || u.protocol !== "http:" || !LOOPBACK.has(u.hostname)) return null;
  if (u.pathname !== "/callback" || u.search || u.hash || u.username || u.password) return null;
  return "loopback";
}

const semPorta = (uri: string) => {
  const u = new URL(uri);
  return `${u.protocol}//${u.hostname}${u.pathname}`;
};

/** O redirect pedido bate com um registrado? (loopback ignora a porta) */
export function redirectConfere(registrados: string[], pedido: unknown): boolean {
  const tipo = classificarRedirect(pedido);
  if (!tipo) return false;
  const p = pedido as string;
  if (tipo === "claude") return registrados.includes(p);
  return registrados.some(
    (r) => classificarRedirect(r) === "loopback" && semPorta(r) === semPorta(p)
  );
}

/** URL canônica do recurso: esquema/host em minúsculas, sem porta padrão, sem barra final, sem fragmento/query. */
export function recursoCanonico(uri: unknown): string | null {
  if (typeof uri !== "string") return null;
  const u = url(uri);
  if (!u) return null;
  if (u.protocol !== "https:" && !(u.protocol === "http:" && LOOPBACK.has(u.hostname))) return null;
  const caminho = u.pathname.replace(/\/+$/, "");
  return `${u.protocol}//${u.host}${caminho}`;
}

/** Rótulo do destino para a tela de autorização. */
export function destinoDoRedirect(uri: string): string {
  const t = classificarRedirect(uri);
  if (t === "claude") return new URL(uri).hostname;
  if (t === "loopback") return "Programa neste computador";
  return "desconhecido";
}
