/**
 * ZIP sem compressão (método 0, "store"): o bastante para montar um .docx sem biblioteca.
 * Data fixa no cabeçalho: a mesma entrada dá sempre os mesmos bytes. Puro.
 */
const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(dados: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < dados.length; i++) c = TABELA_CRC[(c ^ dados[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** 01/01/2026 00:00 no formato DOS. */
const HORA_DOS = 0;
const DATA_DOS = ((2026 - 1980) << 9) | (1 << 5) | 1;

export function zipSemCompressao(arquivos: { nome: string; dados: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const partes: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let deslocamento = 0;
  for (const a of arquivos) {
    const nome = enc.encode(a.nome);
    const crc = crc32(a.dados);
    const local = new Uint8Array(30 + nome.length);
    const v = new DataView(local.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true); // versão mínima para extrair
    v.setUint16(6, 0x0800, true); // nomes em UTF-8
    v.setUint16(8, 0, true); // sem compressão
    v.setUint16(10, HORA_DOS, true);
    v.setUint16(12, DATA_DOS, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, a.dados.length, true);
    v.setUint32(22, a.dados.length, true);
    v.setUint16(26, nome.length, true);
    v.setUint16(28, 0, true);
    local.set(nome, 30);
    partes.push(local, a.dados);

    const c = new Uint8Array(46 + nome.length);
    const cv = new DataView(c.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, HORA_DOS, true);
    cv.setUint16(14, DATA_DOS, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, a.dados.length, true);
    cv.setUint32(24, a.dados.length, true);
    cv.setUint16(28, nome.length, true);
    cv.setUint32(42, deslocamento, true);
    c.set(nome, 46);
    central.push(c);
    deslocamento += local.length + a.dados.length;
  }
  const tamanhoCentral = central.reduce((s, c) => s + c.length, 0);
  const fim = new Uint8Array(22);
  const fv = new DataView(fim.buffer);
  fv.setUint32(0, 0x06054b50, true);
  fv.setUint16(8, arquivos.length, true);
  fv.setUint16(10, arquivos.length, true);
  fv.setUint32(12, tamanhoCentral, true);
  fv.setUint32(16, deslocamento, true);
  const tudo = new Uint8Array(deslocamento + tamanhoCentral + 22);
  let pos = 0;
  for (const p of [...partes, ...central, fim]) {
    tudo.set(p, pos);
    pos += p.length;
  }
  return tudo;
}
