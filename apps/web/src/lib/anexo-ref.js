/**
 * Helpers de anexos guardados no banco.
 *
 * Formato certo de gravar: a REFERÊNCIA estável "bucket/caminho" (o retorno
 * `ref` do UploadFile). A URL assinada (`file_url`) expira em 1h e depois o
 * Storage responde {"error":"InvalidJWT"} — por isso nunca vai para o banco.
 * Para exibir: <AnexoViewer>, <ImgStorage> ou resolveStorageUrl().
 *
 * Legado: anexos do Base44 (base44.app / media.base44.com) — a plataforma
 * antiga apagou os arquivos; não há o que abrir (só reanexar).
 */

/** Referência a gravar a partir do retorno de sigo.integrations.Core.UploadFile. */
export function refDoUpload(res) {
  if (!res) return null;
  if (res.ref) return res.ref;
  if (res.bucket && res.path) return `${res.bucket}/${res.path}`;
  return null;
}

export const ehBase44 = (ref) => /base44\.app|media\.base44\.com|base44\./i.test(String(ref || ""));

/** Caminho sem ?token=... / #... (para achar extensão e nome). */
const semQuery = (ref) => String(ref || "").split(/[?#]/)[0];

export function extensaoDoArquivo(ref) {
  const m = semQuery(ref).match(/\.([a-z0-9]{2,5})$/i);
  return m ? m[1].toLowerCase() : "";
}

/**
 * Nome legível: último segmento, decodificado, sem o prefixo de upload
 * ("<uuid>-arquivo.pdf" → "arquivo.pdf"; Base44 "<hash9>_arquivo.pdf" → "arquivo.pdf").
 */
export function nomeDoArquivo(ref, padrao = "Anexo") {
  let nome = semQuery(ref).split("/").pop() || "";
  try {
    nome = decodeURIComponent(nome);
  } catch {
    /* mantém */
  }
  nome = nome
    .replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, "")
    .replace(/^[0-9a-f]{9}_/i, "");
  return nome || padrao;
}

const EXT_IMAGEM = ["jpg", "jpeg", "jfif", "png", "gif", "webp", "avif", "bmp", "svg"];

/** Imagem exibível no navegador (HEIC não é). `tipo` = mime opcional. */
export function ehImagem(ref, tipo) {
  const ext = extensaoDoArquivo(ref);
  if (ext) return EXT_IMAGEM.includes(ext);
  return /^image\/(?!hei[cf])/i.test(String(tipo || ""));
}

export function ehPdf(ref, tipo) {
  const ext = extensaoDoArquivo(ref);
  if (ext) return ext === "pdf";
  return /pdf/i.test(String(tipo || ""));
}
