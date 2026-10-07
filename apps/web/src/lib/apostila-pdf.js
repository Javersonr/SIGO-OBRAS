/**
 * Apostila em PDF no Portal do Funcionário (T11) — regras puras, sem DOM.
 *
 * A apostila é a 1ª aula dos cursos e bloqueia as demais. No computador ela
 * aparece num <iframe>; no celular o navegador costuma não mostrar PDF em
 * iframe (Chrome Android, WebView e Safari mostram só a 1ª página ou nada),
 * então o portal desenha as páginas com o pdf.js, dentro da própria tela.
 * Quem usa: components/portal-funcionario/ApostilaPdf.jsx e CursoPortal.jsx.
 */

/**
 * Mesma consulta que o SIGO usa em components/shared/AnexoViewer.jsx
 * (`pdfSemIframe`): tela estreita OU toque como ponteiro principal.
 */
export const MEDIA_APOSTILA_NA_PAGINA = "(max-width: 640px), (pointer: coarse)";

/** true = desenhar o PDF na página (pdf.js); false = manter o iframe. */
export function apostilaNaPagina(matchMedia) {
  if (typeof matchMedia !== "function") return false;
  try {
    return !!matchMedia(MEDIA_APOSTILA_NA_PAGINA)?.matches;
  } catch {
    return false;
  }
}

/**
 * A URL da apostila é assinada pelo servidor e sempre absoluta (http/https).
 * Nula, vazia, "about:blank", relativa ou de outro esquema = apostila
 * indisponível (o portal não pode abrir nada nem contar tempo de leitura).
 */
export function urlApostilaValida(url) {
  if (typeof url !== "string") return false;
  const v = url.trim();
  if (!v) return false;
  try {
    const { protocol } = new URL(v);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * O tempo de leitura só corre com o conteúdo de fato na tela:
 * - texto: sempre (está na própria página);
 * - PDF: com URL válida E a apostila já aberta (`estadoPdf === "pronto"`);
 *   com a URL nula ou com o quadro em branco/carregando/falha, o contador fica
 *   parado (antes ele corria com o iframe em about:blank);
 * - vídeo: quem conta é o player (play/pausa), não esta regra.
 *
 * @param {{tipo?: string, arquivo_url?: string|null}|null} aula
 * @param {"carregando"|"pronto"|"erro"|undefined} estadoPdf
 */
export function leituraPodeContar(aula, estadoPdf) {
  if (!aula) return false;
  if (aula.tipo === "texto") return true;
  if (aula.tipo === "pdf") return urlApostilaValida(aula.arquivo_url) && estadoPdf === "pronto";
  return false;
}

// densidade de pixels: 2x já deixa o texto nítido e 3x só gasta memória
const DPR_MAX = 2;
// limite de pixels por página (iOS Safari derruba a aba com canvas demais: o teto do
// sistema é ~16,7 milhões por canvas e ~256 MB no total)
const MAX_PIXELS_PADRAO = 4_000_000;

const positivo = (n, padrao) => (Number.isFinite(n) && n > 0 ? n : padrao);

/**
 * Medidas de uma página desenhada na largura da tela.
 *
 * @param {{paginaLargura:number, paginaAltura:number, larguraDisponivel:number, dpr?:number, maxPixels?:number}} p
 *   `paginaLargura`/`paginaAltura`: tamanho da página em pontos do PDF (viewport de escala 1).
 * @returns {{cssLargura:number, cssAltura:number, pixelLargura:number, pixelAltura:number, escala:number}}
 *   `escala` é a do viewport do pdf.js; o canvas tem `pixel*` e é mostrado em `css*`.
 */
export function medidasDaPagina({
  paginaLargura,
  paginaAltura,
  larguraDisponivel,
  dpr = 1,
  maxPixels = MAX_PIXELS_PADRAO,
}) {
  const pl = positivo(paginaLargura, 595); // A4 em pontos, se a página vier sem medida
  const pa = positivo(paginaAltura, 842);
  const cssLargura = Math.max(1, Math.floor(positivo(larguraDisponivel, 1)));
  const cssAltura = Math.max(1, Math.round((cssLargura * pa) / pl));

  const densidade = Math.min(Math.max(positivo(dpr, 1), 1), DPR_MAX);
  let pixelLargura = Math.max(1, Math.round(cssLargura * densidade));
  let pixelAltura = Math.max(1, Math.round(cssAltura * densidade));
  const teto = positivo(maxPixels, MAX_PIXELS_PADRAO);
  if (pixelLargura * pixelAltura > teto) {
    const fator = Math.sqrt(teto / (pixelLargura * pixelAltura));
    pixelLargura = Math.max(1, Math.floor(pixelLargura * fator));
    pixelAltura = Math.max(1, Math.floor(pixelAltura * fator));
  }
  return { cssLargura, cssAltura, pixelLargura, pixelAltura, escala: pixelLargura / pl };
}

/** Mensagem para o aluno quando o pdf.js não consegue abrir a apostila. */
export function mensagemFalhaPdf(erro) {
  switch (erro?.name) {
    case "PasswordException":
      return "A apostila está protegida por senha. Avise o RH.";
    case "InvalidPDFException":
      return "O arquivo da apostila está corrompido. Avise o RH.";
    case "MissingPDFException":
      return "A apostila não foi encontrada. Avise o RH.";
    case "UnexpectedResponseException":
      if ([400, 401, 403].includes(erro.status)) {
        return "O link da apostila expirou. Toque em tentar de novo.";
      }
      break;
    default:
  }
  return "Não foi possível abrir a apostila. Confira a internet e tente de novo.";
}
