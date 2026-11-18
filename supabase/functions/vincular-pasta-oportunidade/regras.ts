/**
 * Regras puras da vincular-pasta-oportunidade (sem Deno, sem banco): quem pode chamar e que endereço de
 * pasta é aceito. O `index.ts` só liga rede e banco.
 *
 * A função roda com service role e sem JWT (o Agente de Licitações não é um usuário do SIGO). Por isso a
 * porta é um segredo compartilhado: sem o secret `VINCULAR_PASTA_SECRET` configurado ela fica DESLIGADA
 * (503 para todos), e com ele configurado só passa quem manda o mesmo valor no cabeçalho `x-agente-secret`.
 */

/** Abaixo deste tamanho o segredo é tratado como não configurado. */
export const TAMANHO_MINIMO_SEGREDO = 32;

/** Endereço de pasta maior que isto é recusado (cabe qualquer link real do Drive/OneDrive). */
const TAMANHO_MAXIMO_URL = 2000;

export type Acesso = { ok: true } | { ok: false; status: 401 | 503; erro: string };

/** Compara dois textos sem parar no primeiro caractere diferente (não vaza o prefixo certo pelo tempo). */
export function iguaisEmTempoConstante(a: string, b: string): boolean {
  let diferenca = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diferenca |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diferenca === 0;
}

/**
 * Decide se a chamada passa.
 *  - segredo ausente ou curto → 503 (função desligada: é o estado padrão em produção);
 *  - cabeçalho ausente ou diferente → 401;
 *  - cabeçalho igual → passa.
 */
export function conferirAcesso(
  segredoConfigurado: string | null | undefined,
  segredoRecebido: string | null | undefined
): Acesso {
  const segredo = (segredoConfigurado ?? "").trim();
  if (segredo.length < TAMANHO_MINIMO_SEGREDO) {
    return { ok: false, status: 503, erro: "Função desativada" };
  }
  const recebido = segredoRecebido ?? "";
  if (!recebido || !iguaisEmTempoConstante(recebido, segredo)) {
    return { ok: false, status: 401, erro: "Não autorizado" };
  }
  return { ok: true };
}

/** O link gravado vira um endereço clicável na aba Arquivos: só `https://` bem formado entra. */
export function urlDePastaValida(url: string | null | undefined): boolean {
  const texto = (url ?? "").trim();
  if (!texto || texto.length > TAMANHO_MAXIMO_URL) return false;
  try {
    return new URL(texto).protocol === "https:";
  } catch {
    return false;
  }
}
