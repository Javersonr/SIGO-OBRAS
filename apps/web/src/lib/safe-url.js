/**
 * safeUrl — devolve a URL somente se o protocolo for seguro (http/https) ou se
 * for um caminho relativo/âncora. Bloqueia `javascript:`, `data:`, `vbscript:`
 * etc. (XSS via href / window.open com dado vindo do banco).
 *
 * Retorna "#" para URLs não-confiáveis (vira um link inerte).
 *
 * Uso:
 *   <a href={safeUrl(item.url)} target="_blank" rel="noopener noreferrer">…</a>
 *   window.open(safeUrl(url), "_blank", "noopener");
 */
export function safeUrl(url) {
  if (!url || typeof url !== "string") return "#";
  const v = url.trim();
  if (!v) return "#";

  // Caminho relativo, âncora ou protocol-relative seguro
  if (v.startsWith("/") || v.startsWith("#") || v.startsWith("./") || v.startsWith("../")) {
    return v;
  }

  try {
    const base = typeof window !== "undefined" ? window.location.origin : "https://localhost";
    const parsed = new URL(v, base);
    const ok = ["http:", "https:", "mailto:", "tel:"];
    if (ok.includes(parsed.protocol)) return v;
  } catch {
    // não parseável → inseguro
  }
  return "#";
}
