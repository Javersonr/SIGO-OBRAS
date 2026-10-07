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

const LIMITE_LOGO_MS = 15000;

/**
 * Como `logoParaPdf`, mas a partir de uma URL JÁ ASSINADA: o portal do funcionário não tem sessão da
 * empresa (`resolveStorageUrl` não serve), então o servidor assina o logo e entrega a URL em
 * `empresa_logo_url`. Mesmo resultado (`{ dataUrl, w, h }`), então o PDF do aluno sai igual ao do RH.
 * Devolve null (PDF sem logo) se a URL não for http(s), a resposta der erro, o arquivo não for uma
 * imagem ou a rede passar de `limiteMs`: o logo é enfeite e nunca impede o certificado.
 */
export async function logoParaPdfDeUrl(url, { limiteMs = LIMITE_LOGO_MS } = {}) {
  if (typeof url !== "string" || !/^https?:\/\//i.test(url.trim())) return null;
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), limiteMs);
  try {
    const resposta = await fetch(url.trim(), { signal: controle.signal });
    if (!resposta.ok) return null;
    const blob = await resposta.blob();
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
  } finally {
    clearTimeout(timer);
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
