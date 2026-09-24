import { refDoStorage, resolveStorageUrl } from "@/api/sigoClient";
import { ehBase44 } from "@/lib/anexo-ref";

/**
 * Download de anexo gravado como ref "bucket/caminho" (ou URL legada / link
 * externo).
 *
 * URL assinada do nosso Storage + &download=<nome> faz o Storage responder
 * como anexo: dá para navegar na MESMA aba (o navegador baixa e a página
 * fica) — sem nova aba, que o bloqueador de pop-up barraria depois do await.
 */

/** Baixa a partir de URL já pronta (assinada do Storage ou link externo). */
export function baixarUrlPronta(url, nome = "") {
  if (!url) return false;
  if (!refDoStorage(url)) {
    // link externo (OneDrive, Drive, site): abre em outra aba
    window.open(url, "_blank", "noopener");
    return true;
  }
  const a = document.createElement("a");
  a.href = `${url}${url.includes("?") ? "&" : "?"}download=${encodeURIComponent(nome)}`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  return true;
}

/**
 * Assina a ref com a sessão do usuário e baixa.
 * @returns {Promise<boolean>} false = nada para baixar (Base44 apagado, sumiu
 *   do Storage) — quem chamou avisa o usuário.
 */
export async function baixarAnexo(ref, nome = "") {
  if (!ref || ehBase44(ref)) return false;
  // link externo: abre já, antes de qualquer await (senão o pop-up é barrado)
  if (/^https?:/i.test(ref) && !refDoStorage(ref)) return baixarUrlPronta(ref, nome);
  return baixarUrlPronta(await resolveStorageUrl(ref), nome);
}
