/** Formato e dimensões de uma imagem PNG ou JPEG, lidos do cabeçalho (para o logo nos documentos). Puro. */
export interface ImagemLida {
  formato: "PNG" | "JPEG";
  largura: number;
  altura: number;
}

const ASSINATURA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** "IHDR": o primeiro bloco de todo PNG, logo depois da assinatura (bytes 12 a 15). */
const IHDR = [0x49, 0x48, 0x44, 0x52];
/** Lado máximo aceito (px): um logo maior que isso é arquivo errado, não papel timbrado. */
const LADO_MAXIMO = 20000;

const ladoValido = (n: number) => n >= 1 && n <= LADO_MAXIMO;

export function lerImagem(bytes: Uint8Array): ImagemLida | null {
  if (!bytes || bytes.length < 4) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length >= 24 && ASSINATURA_PNG.every((b, i) => bytes[i] === b)) {
    if (!IHDR.every((b, i) => bytes[12 + i] === b)) return null;
    const largura = v.getUint32(16);
    const altura = v.getUint32(20);
    return ladoValido(largura) && ladoValido(altura) ? { formato: "PNG", largura, altura } : null;
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    // segue os segmentos até o SOF (C0 a CF, menos C4, C8 e CC): altura e largura em 2 bytes
    let pos = 2;
    while (pos + 3 < bytes.length) {
      if (bytes[pos] !== 0xff) return null;
      // 0xFF de preenchimento antes do marcador é permitido: pula até o último
      while (bytes[pos + 1] === 0xff) pos++;
      if (pos + 3 >= bytes.length) return null;
      const marcador = bytes[pos + 1];
      // antes do SOF só há segmentos com tamanho; 0x00, 0x01, RSTn, SOI, EOI e SOS não servem
      if (marcador <= 0x01 || (marcador >= 0xd0 && marcador <= 0xda)) return null;
      const tamanho = v.getUint16(pos + 2);
      if (tamanho < 2) return null;
      const sof = marcador >= 0xc0 && marcador <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marcador);
      if (sof) {
        if (pos + 9 > bytes.length) return null;
        const altura = v.getUint16(pos + 5);
        const largura = v.getUint16(pos + 7);
        return ladoValido(largura) && ladoValido(altura)
          ? { formato: "JPEG", largura, altura }
          : null;
      }
      pos += 2 + tamanho;
    }
  }
  return null;
}
