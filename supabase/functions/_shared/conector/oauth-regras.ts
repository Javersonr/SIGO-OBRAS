/**
 * Regras do servidor de autorização OAuth 2.1 do conector do Claude. Puro.
 * RFC 6749 (erros/token), 7591 (DCR), 7636 (PKCE), 8707 (resource),
 * 9207 (iss no redirect). O Claude é cliente PÚBLICO (sem secret).
 */
import { challengeValido } from "./cripto.ts";
import { classificarRedirect, recursoCanonico, type TipoRedirect } from "./redirect.ts";

export const ISSUER = "https://www.sigoobras.com.br";
export const ESCOPO = "conector";

const MIN = 60_000;
const DIA = 86_400_000;
export const DURACAO = {
  codigoMs: 5 * MIN,
  acessoMs: 60 * MIN,
  renovacaoOciosaMs: 30 * DIA,
  renovacaoMaximaMs: 90 * DIA,
  manualMs: 90 * DIA,
  gracaRotacaoMs: 30_000,
} as const;

export type ErroOAuth =
  | "invalid_request"
  | "invalid_grant"
  | "invalid_client"
  | "unsupported_grant_type"
  | "invalid_target"
  | "invalid_redirect_uri"
  | "invalid_client_metadata"
  | "access_denied"
  | "server_error";

export function erroOAuth(error: ErroOAuth, descricao?: string) {
  return descricao ? { error, error_description: descricao } : { error };
}

export interface ClienteRegistrado {
  nome: string;
  redirect_uris: string[];
  tipo: TipoRedirect;
}

export function validarRegistro(
  corpo: unknown
):
  | { ok: true; cliente: ClienteRegistrado }
  | { ok: false; erro: "invalid_redirect_uri" | "invalid_client_metadata"; descricao: string } {
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) {
    return {
      ok: false,
      erro: "invalid_client_metadata",
      descricao: "Corpo deve ser um objeto JSON",
    };
  }
  const c = corpo as Record<string, unknown>;
  const uris = c.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || uris.length > 5) {
    return { ok: false, erro: "invalid_redirect_uri", descricao: "Informe de 1 a 5 redirect_uris" };
  }
  const tipos = uris.map(classificarRedirect);
  if (tipos.some((t) => t === null)) {
    return {
      ok: false,
      erro: "invalid_redirect_uri",
      descricao: "Endereço de retorno não permitido",
    };
  }
  const tipo = tipos[0] as TipoRedirect;
  if (tipos.some((t) => t !== tipo)) {
    return {
      ok: false,
      erro: "invalid_redirect_uri",
      descricao: "Não misture endereços do Claude e locais",
    };
  }
  const gt = c.grant_types;
  if (gt !== undefined && (!Array.isArray(gt) || !gt.includes("authorization_code"))) {
    return {
      ok: false,
      erro: "invalid_client_metadata",
      descricao: "grant_types precisa incluir authorization_code",
    };
  }
  const rt = c.response_types;
  if (rt !== undefined && (!Array.isArray(rt) || !rt.includes("code"))) {
    return {
      ok: false,
      erro: "invalid_client_metadata",
      descricao: "response_types precisa incluir code",
    };
  }
  const bruto =
    typeof c.client_name === "string"
      ? c.client_name
          .replace(/[\u0000-\u001f\u007f]/g, "")
          .trim()
          .slice(0, 100)
      : "";
  const nome = bruto || (tipo === "claude" ? "Claude" : "Programa neste computador");
  return { ok: true, cliente: { nome, redirect_uris: uris as string[], tipo } };
}

/**
 * Nome do app mostrado na tela de autorização, em "Apps conectados" e na
 * auditoria. NUNCA usa o client_name do DCR (registro aberto: qualquer um
 * poderia escrever "Claude — Suporte SIGO: clique em Permitir…").
 */
export function nomeDoApp(
  tipoAutorizacao: string | null | undefined,
  tipoCliente: string | null | undefined
): string {
  if (tipoAutorizacao === "manual") return "Chave do Claude Code";
  if (tipoCliente === "loopback") return "Programa neste computador";
  return "Claude";
}

/** 201 do DCR: devolve o que ficou registrado (sempre cliente público). */
export function respostaRegistro(clientId: string, c: ClienteRegistrado, agoraSeg: number) {
  return {
    client_id: clientId,
    client_id_issued_at: agoraSeg,
    client_name: c.nome,
    redirect_uris: c.redirect_uris,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    scope: ESCOPO,
  };
}

/** application/x-www-form-urlencoded; parâmetro repetido é inválido (RFC 6749 §3.1). */
export function lerFormUnico(texto: string): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(texto)) {
    if (k in out) return null;
    out[k] = v;
  }
  return out;
}

export interface PedidoAutorizacao {
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  state?: string;
}

export function validarPedidoAutorizacao(
  p: Record<string, unknown>,
  recursoEsperado: string
): { ok: true; pedido: PedidoAutorizacao } | { ok: false; descricao: string } {
  if (p.response_type !== "code") return { ok: false, descricao: "response_type deve ser code" };
  if (typeof p.client_id !== "string" || !p.client_id)
    return { ok: false, descricao: "client_id ausente" };
  if (typeof p.redirect_uri !== "string" || !classificarRedirect(p.redirect_uri)) {
    return { ok: false, descricao: "redirect_uri inválido" };
  }
  if (p.code_challenge_method !== "S256" || !challengeValido(p.code_challenge)) {
    return { ok: false, descricao: "PKCE S256 obrigatório" };
  }
  const temRecurso = p.resource !== undefined && p.resource !== null && p.resource !== "";
  if (temRecurso && recursoCanonico(p.resource) !== recursoEsperado) {
    return { ok: false, descricao: "resource não é o conector do SIGO" };
  }
  if (
    p.state !== undefined &&
    p.state !== null &&
    (typeof p.state !== "string" || p.state.length > 1000)
  ) {
    return { ok: false, descricao: "state inválido" };
  }
  return {
    ok: true,
    pedido: {
      client_id: p.client_id,
      redirect_uri: p.redirect_uri,
      code_challenge: p.code_challenge as string,
      state: typeof p.state === "string" && p.state ? p.state : undefined,
    },
  };
}

function comParametros(base: string, params: Record<string, string | undefined>): string {
  const u = new URL(base);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) u.searchParams.set(k, v);
  return u.toString();
}

export function montarRedirectSucesso(
  redirectUri: string,
  codigo: string,
  state: string | undefined,
  issuer: string
): string {
  return comParametros(redirectUri, { code: codigo, state, iss: issuer });
}

export function montarRedirectErro(
  redirectUri: string,
  erro: ErroOAuth,
  state: string | undefined,
  issuer: string
): string {
  return comParametros(redirectUri, { error: erro, state, iss: issuer });
}

export type DecisaoRenovacao = "ok" | "invalida" | "reuso_tolerado" | "reuso_revogar";

/**
 * Renovação rotativa com detecção de reuso: chave já substituída usada de novo
 * → dentro de 30 s é corrida entre renovações (só recusa); depois disso é
 * sinal de roubo (revoga a autorização inteira).
 */
export function decidirRenovacao(
  ch: {
    expira_em: string;
    substituida_em: string | null;
    revogada_em: string | null;
    inicio_autorizacao: string;
  },
  agora: Date
): DecisaoRenovacao {
  const t = agora.getTime();
  if (ch.revogada_em) return "invalida";
  if (ch.substituida_em) {
    return t - new Date(ch.substituida_em).getTime() <= DURACAO.gracaRotacaoMs
      ? "reuso_tolerado"
      : "reuso_revogar";
  }
  if (new Date(ch.expira_em).getTime() <= t) return "invalida";
  if (new Date(ch.inicio_autorizacao).getTime() + DURACAO.renovacaoMaximaMs <= t) return "invalida";
  return "ok";
}

/** Essência do Content-Type (RFC 9110 §8.3.1): "Application/JSON; charset=utf-8" → "application/json". */
export function mimeEssencia(contentType: string | null | undefined): string {
  return String(contentType ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
}

/**
 * Teto global do registro aberto (DCR): acima de tantos clientes NUNCA usados nas últimas 24 h, o
 * /register responde 503. Barra o enchimento da tabela por registro em massa; a limpeza diária
 * (conector_limpeza, 0148) apaga os clientes sem uso.
 */
export const TETO_CLIENTES_SEM_USO_24H = 2000;

export function registroAberto(qtdClientesSemUso24h: number): boolean {
  return Number.isFinite(qtdClientesSemUso24h) && qtdClientesSemUso24h < TETO_CLIENTES_SEM_USO_24H;
}

/** `state` do OAuth: ausente, vazio ou texto de até 1000 caracteres. */
export function stateValido(s: unknown): boolean {
  return s === undefined || s === null || s === "" || (typeof s === "string" && s.length <= 1000);
}

/**
 * /revoke (RFC 7009): client_id ausente → aceita (revogar só exige possuir a chave, e o Claude nem
 * sempre manda); presente → tem de ser o da autorização.
 */
export function revogacaoPermitida(
  clientIdPedido: string | undefined,
  clientIdDaAutorizacao: string | null
): boolean {
  if (clientIdPedido === undefined) return true;
  return clientIdDaAutorizacao !== null && clientIdPedido === clientIdDaAutorizacao;
}
