/**
 * Conector do Claude (MCP) — utilitários puros do front: endereço do
 * conector, link de instalação no claude.ai, comandos do Claude Code, destino
 * seguro depois do login e leitura do pedido OAuth da tela de autorização.
 */
import { safeParseJSON } from "./json-utils";

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

/**
 * A tela de autorização só vale com a sessão do SIGO NESTA aba: o
 * `custom_auth` do sessionStorage (id + e-mail) do MESMO usuário da sessão do
 * Supabase. A sessão do Supabase sozinha fica no localStorage e se renova
 * sozinha depois que o navegador fecha ("zumbi"): sem esta conferência, quem
 * abrisse aquele navegador emitiria uma conexão de 90 dias em nome do dono.
 */
export function sessaoCustomConfere(customAuthBruto, emailSessao) {
  const dados = safeParseJSON(customAuthBruto, null);
  if (!dados || typeof dados !== "object" || Array.isArray(dados)) return false;
  if (!dados.id || typeof dados.email !== "string" || !dados.email) return false;
  if (typeof emailSessao !== "string" || !emailSessao) return false;
  return dados.email.trim().toLowerCase() === emailSessao.trim().toLowerCase();
}

/**
 * Erro do mcp-oauth que pede login de novo: 401 com `codigo: "sessao_invalida"`
 * (ou a mensagem "Sessão inválida…"). Qualquer outro erro (pedido inválido,
 * senha provisória, serviço fora do ar) NÃO se resolve entrando de novo.
 */
export function erroDeSessao(data) {
  if (!data || typeof data !== "object") return false;
  if (data.codigo === "sessao_invalida") return true;
  return /sess[aã]o inv[aá]lida/i.test(String(data.error ?? ""));
}
