/**
 * Imagens sintéticas para os testes do logo: PNG e JPEG com a estrutura de verdade (blocos com CRC, dados
 * comprimidos com zlib), e variações quebradas de propósito. Só roda no Node (usa node:zlib); o nome não
 * termina em .test.ts, então o node --test não o executa como teste.
 */
import zlib from "node:zlib";

const ASSINATURA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CANAIS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/** Um bloco PNG (tamanho, tipo, dados e CRC). `crcErrado` troca o CRC por um valor que não confere. */
export function blocoPng(tipo: string, dados: Uint8Array, crcErrado = false): Buffer {
  const t = Buffer.from(tipo, "ascii");
  const corpo = Buffer.from(dados);
  const tamanho = Buffer.alloc(4);
  tamanho.writeUInt32BE(corpo.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(((zlib.crc32(Buffer.concat([t, corpo])) >>> 0) ^ (crcErrado ? 1 : 0)) >>> 0);
  return Buffer.concat([tamanho, t, corpo, crc]);
}

export interface OpcoesPng {
  largura: number;
  altura: number;
  /** 0 cinza, 2 RGB, 3 paleta, 4 cinza com alfa, 6 RGBA. Padrão 2. */
  tipoCor?: 0 | 2 | 3 | 4 | 6;
  /** Bits por amostra. Padrão 8. */
  profundidade?: 1 | 2 | 4 | 8 | 16;
  /** Só marca o IHDR como entrelaçado (os dados continuam em ordem normal): serve ao teste da recusa. */
  entrelacado?: boolean;
  /** Entradas da paleta (tipoCor 3). Padrão: 2^profundidade entradas. */
  entradasPaleta?: number;
  /** Bloco PLTE para tipoCor diferente de 3 e a falta dele no tipoCor 3. */
  semPaleta?: boolean;
  /** Conteúdo do bloco tRNS. */
  trns?: number[];
  /** Bytes do IDAT no lugar dos pixels sintéticos (zlib pronto ou lixo). */
  idat?: Uint8Array;
  /** Dados (já descomprimidos, com os bytes de filtro) no lugar dos pixels sintéticos. */
  dadosBrutos?: Uint8Array;
  /** Parte o IDAT em vários blocos IDAT seguidos. */
  idatEmPartes?: number;
  semIdat?: boolean;
  semIend?: boolean;
  /** Troca o CRC deste bloco por um que não confere. */
  crcErradoEm?: "IHDR" | "PLTE" | "IDAT" | "IEND";
  /** Bytes depois do IEND. */
  depoisDoIend?: Uint8Array;
  /** Bloco extra entre o IHDR e o IDAT (ex.: "acTL" para o PNG animado). */
  blocoExtra?: { tipo: string; dados: Uint8Array };
  /** Valores do IHDR para os campos de método (compressão, filtro). */
  metodoCompressao?: number;
  metodoFiltro?: number;
}

/** Os dados de pixel sintéticos (sem entrelaçamento): cada linha começa com o byte de filtro 0. */
export function pixelsSinteticos(
  largura: number,
  altura: number,
  tipoCor: number,
  profundidade: number
): Buffer {
  const bytesPorLinha = Math.ceil((largura * profundidade * CANAIS[tipoCor]) / 8);
  const bruto = Buffer.alloc((1 + bytesPorLinha) * altura);
  for (let y = 0; y < altura; y++) {
    const base = y * (1 + bytesPorLinha);
    bruto[base] = 0;
    for (let i = 0; i < bytesPorLinha; i++) bruto[base + 1 + i] = (i * 7 + y * 13 + 0x40) & 0xff;
  }
  return bruto;
}

/** PNG com a estrutura completa; as opções quebram uma parte de cada vez. */
export function construirPng(o: OpcoesPng): Uint8Array {
  const tipoCor = o.tipoCor ?? 2;
  const profundidade = o.profundidade ?? 8;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(o.largura, 0);
  ihdr.writeUInt32BE(o.altura, 4);
  ihdr[8] = profundidade;
  ihdr[9] = tipoCor;
  ihdr[10] = o.metodoCompressao ?? 0;
  ihdr[11] = o.metodoFiltro ?? 0;
  ihdr[12] = o.entrelacado ? 1 : 0;
  const partes: Buffer[] = [ASSINATURA_PNG, blocoPng("IHDR", ihdr, o.crcErradoEm === "IHDR")];
  if (o.blocoExtra) partes.push(blocoPng(o.blocoExtra.tipo, o.blocoExtra.dados));
  if (tipoCor === 3 && !o.semPaleta) {
    const entradas = o.entradasPaleta ?? 1 << profundidade;
    const paleta = Buffer.alloc(entradas * 3);
    for (let i = 0; i < paleta.length; i++) paleta[i] = (i * 37) & 0xff;
    partes.push(blocoPng("PLTE", paleta, o.crcErradoEm === "PLTE"));
  }
  if (o.trns) partes.push(blocoPng("tRNS", Uint8Array.from(o.trns)));
  if (!o.semIdat) {
    const comprimido =
      o.idat ??
      zlib.deflateSync(
        o.dadosBrutos ?? pixelsSinteticos(o.largura, o.altura, tipoCor, profundidade)
      );
    const n = Math.max(1, o.idatEmPartes ?? 1);
    const tamanhoParte = Math.ceil(comprimido.length / n);
    for (let i = 0; i < n; i++) {
      const pedaco = comprimido.subarray(i * tamanhoParte, (i + 1) * tamanhoParte);
      partes.push(blocoPng("IDAT", pedaco, o.crcErradoEm === "IDAT" && i === 0));
    }
  }
  if (!o.semIend) partes.push(blocoPng("IEND", new Uint8Array(0), o.crcErradoEm === "IEND"));
  if (o.depoisDoIend) partes.push(Buffer.from(o.depoisDoIend));
  return new Uint8Array(Buffer.concat(partes));
}

/**
 * JPEG com SOI, APP0, SOF0 (altura e largura pedidas), SOS, alguns bytes de varredura e, por padrão, o EOI.
 * Não é uma foto decodificável (nenhum teste decodifica JPEG: o jsPDF só embute os bytes e o Word abre o que
 * o usuário mandar), mas tem a ordem de marcadores de um arquivo baseline completo.
 */
export function jpegSintetico(
  largura: number,
  altura: number,
  o: { semEoi?: boolean; depois?: number[]; sof?: number } = {}
): Uint8Array {
  const cabecalho = [
    0xff,
    0xd8,
    0xff,
    0xe0,
    0x00,
    0x10,
    0x4a,
    0x46,
    0x49,
    0x46,
    0x00,
    0x01,
    0x01,
    0x00,
    0x00,
    0x01,
    0x00,
    0x01,
    0x00,
    0x00,
    0xff,
    o.sof ?? 0xc0,
    0x00,
    0x11,
    0x08,
    altura >> 8,
    altura & 255,
    largura >> 8,
    largura & 255,
    0x03,
    0x01,
    0x22,
    0x00,
    0x02,
    0x11,
    0x01,
    0x03,
    0x11,
    0x01,
  ];
  const varredura = [0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x11, 0x22, 0x33];
  return Uint8Array.from([
    ...cabecalho,
    ...varredura,
    ...(o.semEoi ? [] : [0xff, 0xd9]),
    ...(o.depois ?? []),
  ]);
}
