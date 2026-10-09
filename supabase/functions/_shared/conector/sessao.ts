/**
 * Sessão da SPA anterior à troca de senha (FINAL "amr" do Plano 1). Puro.
 *
 * As ações da tela do conector (aprovar, gerar chave manual, página de envio) aceitam a sessão do
 * Supabase. Um JWT emitido ANTES da última troca de senha (`usuario_custom.senha_alterada_em`,
 * migração 0124) não pode mais criar conexões: a revogação de sessões do Auth continua sendo a
 * defesa principal, e esta conferência cobre a janela em que um JWT antigo ainda é aceito.
 *
 * O instante da autenticação vem do `amr` do JWT (lista de {method, timestamp} em segundos).
 * Sem `amr` (ou sem data de troca), não recusa.
 */

function base64urlParaTexto(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function payloadDoJwt(jwt: string): Record<string, unknown> | null {
  if (typeof jwt !== "string") return null;
  const partes = jwt.split(".");
  if (partes.length !== 3 || !partes[1]) return null;
  try {
    const p = JSON.parse(base64urlParaTexto(partes[1]));
    return p && typeof p === "object" && !Array.isArray(p) ? p : null;
  } catch {
    return null;
  }
}

/** Maior amr[].timestamp (segundos), ou null. */
export function autenticadoEmSeg(jwt: string): number | null {
  const amr = payloadDoJwt(jwt)?.amr;
  if (!Array.isArray(amr)) return null;
  const ts = amr
    .map((x) => (x && typeof x === "object" ? (x as Record<string, unknown>).timestamp : null))
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  return ts.length ? Math.max(...ts) : null;
}

/** true quando amr < floor(senhaAlteradaEm / 1000); sem amr ou sem data → false. */
export function sessaoAnteriorATrocaDeSenha(
  jwt: string,
  senhaAlteradaEm: string | null | undefined
): boolean {
  if (!senhaAlteradaEm) return false;
  const troca = new Date(senhaAlteradaEm).getTime();
  if (!Number.isFinite(troca)) return false;
  const autenticado = autenticadoEmSeg(jwt);
  if (autenticado === null) return false;
  return autenticado < Math.floor(troca / 1000);
}
