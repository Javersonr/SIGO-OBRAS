/** Formato e dimensões de uma imagem PNG ou JPEG, lidos do cabeçalho (para o logo nos documentos). Puro. */
export interface ImagemLida {
  formato: "PNG" | "JPEG";
  largura: number;
  altura: number;
}

const ASSINATURA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function lerImagem(bytes: Uint8Array): ImagemLida | null {
  if (!bytes || bytes.length < 4) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length >= 24 && ASSINATURA_PNG.every((b, i) => bytes[i] === b)) {
    const largura = v.getUint32(16);
    const altura = v.getUint32(20);
    return largura > 0 && altura > 0 ? { formato: "PNG", largura, altura } : null;
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    // segue os segmentos até o SOF (C0 a CF, menos C4, C8 e CC): altura e largura em 2 bytes
    let pos = 2;
    while (pos + 9 < bytes.length) {
      if (bytes[pos] !== 0xff) return null;
      const marcador = bytes[pos + 1];
      const tamanho = v.getUint16(pos + 2);
      if (tamanho < 2) return null;
      const sof = marcador >= 0xc0 && marcador <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marcador);
      if (sof) {
        const altura = v.getUint16(pos + 5);
        const largura = v.getUint16(pos + 7);
        return largura > 0 && altura > 0 ? { formato: "JPEG", largura, altura } : null;
      }
      pos += 2 + tamanho;
    }
  }
  return null;
}
