/**
 * Conector do Claude (MCP) — utilitários puros do front: endereço do
 * conector, link de instalação no claude.ai, comandos do Claude Code, destino
 * seguro depois do login e leitura do pedido OAuth da tela de autorização.
 */

export const NOME_CONECTOR = "SIGO Obras";

export function urlConector(supabaseUrl) {
  const base = String(supabaseUrl || "").replace(/\/+$/, "");
  return base ? `${base}/functions/v1/mcp` : "";
}

/** Link oficial que abre o "adicionar conector" do claude.ai já preenchido. */
export function linkInstalacaoClaude(urlMcp, { admin = false } = {}) {
  const caminho = admin ? "admin-settings/connectors" : "customize/connectors";
  return (
    `https://claude.ai/${caminho}?modal=add-custom-connector` +
    `&connectorName=${encodeURIComponent(NOME_CONECTOR)}` +
    `&connectorUrl=${encodeURIComponent(urlMcp)}`
  );
}

export function comandoClaudeCode(urlMcp, chave) {
  return `claude mcp add --transport http sigo-obras ${urlMcp} --header "Authorization: Bearer ${chave}"`;
}

export function comandoClaudeCodeOAuth(urlMcp) {
  return `claude mcp add --transport http --scope user sigo-obras ${urlMcp}`;
}

/** Destino interno para depois do login (?voltar=). Nada de //dominio-externo. */
export function destinoSeguro(v) {
  if (typeof v !== "string" || v.length > 2000) return null;
  if (!v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\")) return null;
  if (/[\u0000-\u001f]/.test(v)) return null;
  return v;
}

const PARAMS = [
  "response_type",
  "client_id",
  "redirect_uri",
  "code_challenge",
  "code_challenge_method",
  "state",
  "scope",
  "resource",
];
const OBRIGATORIOS = [
  "response_type",
  "client_id",
  "redirect_uri",
  "code_challenge",
  "code_challenge_method",
];

export function lerPedidoAutorizacao(search) {
  const p = new URLSearchParams(search);
  const pedido = {};
  for (const k of PARAMS) {
    const v = p.get(k);
    if (v != null) pedido[k] = v;
  }
  return { pedido, faltando: OBRIGATORIOS.filter((k) => !pedido[k]) };
}
