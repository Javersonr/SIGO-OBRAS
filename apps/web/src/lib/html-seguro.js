import { safeUrl } from "./safe-url";

/**
 * Helpers para HTML montado em string (relatórios de impressão com
 * `window.open("")` + `document.write`). Todo dado vindo do banco que entra
 * numa template string de HTML passa por `escaparHtml`; toda URL que entra em
 * atributo (`src`, `href`) passa por `urlSegura`.
 */

const MAPA_ESCAPE = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escapa `& < > " '`. null/undefined viram "". Números e booleanos viram texto. */
export function escaparHtml(valor) {
  if (valor === null || valor === undefined) return "";
  return String(valor).replace(/[&<>"']/g, (c) => MAPA_ESCAPE[c]);
}

// data: só de imagem raster (svg pode carregar script)
const DATA_IMAGEM = /^data:image\/(png|jpe?g|gif|webp|bmp)[;,]/;

/**
 * Devolve a URL se for http(s), mailto, tel, blob, data: de imagem raster ou
 * caminho relativo; caso contrário devolve "". Espaços, caracteres de controle
 * e maiúsculas no esquema são ignorados na checagem.
 * Para `href`/`window.open` em JSX use `safeUrl` (de `./safe-url`), que devolve "#".
 */
export function urlSegura(url) {
  if (typeof url !== "string") return "";
  const v = url.trim();
  if (!v) return "";
  // eslint-disable-next-line no-control-regex
  const normalizada = v.replace(/[\u0000- ]/g, "").toLowerCase();
  if (normalizada.startsWith("blob:")) return v;
  if (DATA_IMAGEM.test(normalizada)) return v;
  const r = safeUrl(v);
  return r === "#" ? "" : r;
}
