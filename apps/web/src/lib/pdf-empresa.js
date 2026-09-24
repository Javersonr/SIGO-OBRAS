/**
 * Helpers de PDF com identidade da empresa (logo no topo).
 * Usado pelos documentos do RH (Formulário de Registro, Autorização de
 * Exames, Listas de Presença...).
 */
import { resolveStorageUrl } from "@/api/sigoClient";

/** Carrega a logomarca da empresa como dataURL + dimensões (pra jsPDF). */
export async function logoParaPdf(empresa) {
  try {
    if (!empresa?.logo_url) return null;
    const url = await resolveStorageUrl(empresa.logo_url);
    if (!url) return null;
    const blob = await (await fetch(url)).blob();
    const dataUrl = await new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = rej;
      fr.readAsDataURL(blob);
    });
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = dataUrl;
    });
    return { dataUrl, w: img.naturalWidth, h: img.naturalHeight };
  } catch {
    return null;
  }
}

/** Desenha a logo no topo e devolve o Y onde o conteúdo pode começar. */
export function desenharLogo(doc, logo, yBase = 12) {
  if (!logo) return yBase;
  const alturaMm = 16;
  const larguraMm = Math.min(60, (logo.w / logo.h) * alturaMm);
  try {
    doc.addImage(logo.dataUrl, "PNG", 15, yBase, larguraMm, alturaMm);
    return yBase + alturaMm + 4;
  } catch {
    return yBase;
  }
}
