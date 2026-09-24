/**
 * Base dos links que SAEM do sistema (WhatsApp/e-mail: recibo, cotação,
 * portal do funcionário, validação de certificado).
 *
 * Não usa o endereço em que o usuário está: quem entra por
 * "sigoobras.com.br" (sem www) geraria links para o domínio sem certificado
 * válido e o destinatário veria "Não seguro". Em produção o link sai sempre
 * pelo endereço canônico com www; em dev/preview, pela origem atual.
 */
const CANONICO = "https://www.sigoobras.com.br";

export function origemPublica() {
  if (typeof window === "undefined") return CANONICO;
  const host = window.location.hostname;
  if (host === "sigoobras.com.br" || host === "www.sigoobras.com.br") return CANONICO;
  return window.location.origin;
}

/** urlPublica("/ReciboPagamento?t=...") → "https://www.sigoobras.com.br/ReciboPagamento?t=..." */
export const urlPublica = (caminho = "/") =>
  `${origemPublica()}${caminho.startsWith("/") ? "" : "/"}${caminho}`;
