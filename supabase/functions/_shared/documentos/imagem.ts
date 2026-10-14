/**
 * Formato e dimensões de uma imagem PNG ou JPEG, lidos do cabeçalho (para o logo nos documentos), e a
 * conferência do arquivo INTEIRO (`conferirImagem`): o cabeçalho sozinho não prova que a imagem abre. Puro.
 */
import { crc32 } from "./zip-store.ts";

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

// ─── conferência do arquivo inteiro ──────────────────────────────────────────────────────────────

export type ConferenciaImagem =
  | { ok: true }
  /** `motivo`: frase curta e fixa (só o nome de bloco PNG de 4 letras entra nela), própria para o log. */
  | { ok: false; motivo: string };

const recusa = (motivo: string): ConferenciaImagem => ({ ok: false, motivo });

/** Canais por pixel de cada tipo de cor do PNG: 0 cinza, 2 RGB, 3 paleta, 4 cinza + alfa, 6 RGBA. */
const CANAIS_PNG: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
/** Profundidades (bits por amostra) que a especificação do PNG permite em cada tipo de cor. */
const PROFUNDIDADES_PNG: Record<number, number[]> = {
  0: [1, 2, 4, 8, 16],
  2: [8, 16],
  3: [1, 2, 4, 8],
  4: [8, 16],
  6: [8, 16],
};
/** Acima disso nem se confere: descompactar a imagem seria trabalho demais para um logo (4000 x 4000). */
const PIXELS_MAXIMOS_CONFERIDOS = 16_000_000;

const ehLetra = (b: number) => (b >= 0x41 && b <= 0x5a) || (b >= 0x61 && b <= 0x7a);

/**
 * Descompacta o fluxo zlib do PNG sem guardar o resultado: confere que sai EXATAMENTE `linhas × (1 + bytes
 * da linha)` bytes (a imagem inteira, nem a menos nem a mais) e que o primeiro byte de cada linha é um
 * filtro que existe (0 a 4). Para ao passar do esperado (bomba de descompressão). Devolve o motivo da
 * recusa ou null.
 */
async function conferirFluxoPng(
  fluxo: Uint8Array,
  bytesPorLinhaComFiltro: number,
  linhas: number
): Promise<string | null> {
  const esperado = bytesPorLinhaComFiltro * linhas;
  let n = 0;
  try {
    const entrada = new ReadableStream({
      start(c) {
        c.enqueue(fluxo);
        c.close();
      },
    });
    const leitor = entrada.pipeThrough(new DecompressionStream("deflate")).getReader();
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      if (value.length > esperado - n) {
        await leitor.cancel().catch(() => {});
        return "PNG com mais dados de imagem do que o cabeçalho promete";
      }
      // posições (no fluxo descompactado) dos bytes de filtro que caem neste pedaço
      for (
        let i = Math.ceil(n / bytesPorLinhaComFiltro) * bytesPorLinhaComFiltro - n;
        i < value.length;
        i += bytesPorLinhaComFiltro
      ) {
        if (value[i] > 4) {
          await leitor.cancel().catch(() => {});
          return "PNG com byte de filtro inválido numa linha";
        }
      }
      n += value.length;
    }
  } catch {
    return "PNG com os dados da imagem corrompidos (fluxo zlib inválido)";
  }
  return n === esperado
    ? null
    : "PNG com dados de imagem incompletos (menos bytes do que o cabeçalho promete)";
}

async function conferirPng(bytes: Uint8Array, img: ImagemLida): Promise<ConferenciaImagem> {
  if (img.largura * img.altura > PIXELS_MAXIMOS_CONFERIDOS) {
    return recusa("PNG grande demais para conferir");
  }
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = ASSINATURA_PNG.length;
  let ihdr: { tipoCor: number; profundidade: number; largura: number; altura: number } | null =
    null;
  let entradasDaPaleta = -1;
  const idat: Uint8Array[] = [];
  let tamanhoIdat = 0;
  let fimDoIend = false;
  while (pos < bytes.length) {
    if (fimDoIend) return recusa("PNG com dados depois do bloco IEND");
    if (pos + 12 > bytes.length) return recusa("PNG cortado no meio de um bloco");
    const tamanho = v.getUint32(pos);
    const proximo = pos + 12 + tamanho;
    if (proximo > bytes.length) return recusa("PNG cortado no meio de um bloco");
    if (![4, 5, 6, 7].every((k) => ehLetra(bytes[pos + k]))) {
      return recusa("PNG com um bloco de nome inválido");
    }
    const tipo = String.fromCharCode(...bytes.subarray(pos + 4, pos + 8));
    if (crc32(bytes.subarray(pos + 4, pos + 8 + tamanho)) !== v.getUint32(pos + 8 + tamanho)) {
      return recusa(`PNG com o bloco ${tipo} corrompido (CRC)`);
    }
    const dados = bytes.subarray(pos + 8, pos + 8 + tamanho);
    if (!ihdr && tipo !== "IHDR") return recusa("PNG sem o bloco IHDR no começo");
    switch (tipo) {
      case "IHDR": {
        if (ihdr) return recusa("PNG com dois blocos IHDR");
        const [tipoCor, profundidade, compressao, filtro, entrelacado] = [
          dados[9],
          dados[8],
          dados[10],
          dados[11],
          dados[12],
        ];
        if (
          tamanho !== 13 ||
          !PROFUNDIDADES_PNG[tipoCor]?.includes(profundidade) ||
          compressao !== 0 ||
          filtro !== 0 ||
          (entrelacado !== 0 && entrelacado !== 1)
        ) {
          return recusa("PNG com IHDR inválido (tipo de cor, profundidade ou método)");
        }
        if (entrelacado === 1) {
          // o jsPDF só desentrelaça a imagem com alfa; nas outras ele copia os dados e o PDF fica ilegível
          return recusa("PNG entrelaçado (Adam7) não é aceito");
        }
        ihdr = {
          tipoCor,
          profundidade,
          largura: v.getUint32(pos + 8),
          altura: v.getUint32(pos + 12),
        };
        break;
      }
      case "acTL":
        // PNG animado: o jsPDF desvia os dados do primeiro quadro e a imagem sai vazia
        return recusa("PNG animado (APNG) não é aceito");
      case "PLTE":
        if (idat.length > 0) return recusa("PNG com o bloco PLTE depois dos dados da imagem");
        if (tamanho === 0 || tamanho % 3 !== 0 || tamanho / 3 > 1 << ihdr!.profundidade) {
          return recusa("PNG com bloco PLTE de tamanho inválido");
        }
        entradasDaPaleta = tamanho / 3;
        break;
      case "tRNS":
        if (ihdr!.tipoCor === 3) {
          if (entradasDaPaleta < 0) return recusa("PNG com o bloco tRNS antes da paleta (PLTE)");
          if (tamanho > entradasDaPaleta) {
            return recusa("PNG com mais entradas de transparência (tRNS) do que cores na paleta");
          }
          if (ihdr!.profundidade < 8) {
            // o jsPDF só trata bem uma cor 100% transparente (as outras opacas); alfa parcial em paleta de
            // 1 a 4 bits ele calcula como se cada pixel ocupasse 1 byte, e a transparência sai errada
            const alfas = Array.from({ length: entradasDaPaleta }, (_, i) => dados[i] ?? 255);
            const transparentes = alfas.filter((a) => a === 0).length;
            const opacas = alfas.filter((a) => a === 255).length;
            const simples =
              (transparentes === 0 && opacas === alfas.length) ||
              (transparentes === 1 && opacas === alfas.length - 1);
            if (!simples) {
              return recusa(
                "PNG de paleta com menos de 8 bits e transparência parcial não é aceito"
              );
            }
          }
        }
        break;
      case "IDAT":
        if (ihdr!.tipoCor === 3 && entradasDaPaleta < 0) {
          return recusa("PNG de paleta sem o bloco PLTE");
        }
        idat.push(dados);
        tamanhoIdat += dados.length;
        break;
      case "IEND":
        if (tamanho !== 0) return recusa("PNG com bloco IEND de tamanho inválido");
        fimDoIend = true;
        break;
    }
    pos = proximo;
  }
  if (!fimDoIend) return recusa("PNG sem o bloco IEND no fim (arquivo cortado)");
  if (idat.length === 0 || ihdr === null) return recusa("PNG sem dados de imagem (bloco IDAT)");
  if (ihdr.tipoCor === 3 && entradasDaPaleta < 0) return recusa("PNG de paleta sem o bloco PLTE");

  const fluxo = new Uint8Array(tamanhoIdat);
  let ate = 0;
  for (const parte of idat) {
    fluxo.set(parte, ate);
    ate += parte.length;
  }
  const bytesPorLinha = Math.ceil(
    (ihdr.largura * ihdr.profundidade * CANAIS_PNG[ihdr.tipoCor]) / 8
  );
  const problema = await conferirFluxoPng(fluxo, 1 + bytesPorLinha, ihdr.altura);
  return problema ? recusa(problema) : { ok: true };
}

/**
 * JPEG termina com o marcador EOI (FF D9). Só bytes 0x00 de preenchimento são tolerados depois dele (alguns
 * programas e transferências os acrescentam); qualquer outra coisa depois do EOI, ou a falta dele, é arquivo
 * cortado ou adulterado.
 */
function conferirJpeg(bytes: Uint8Array): ConferenciaImagem {
  let fim = bytes.length;
  while (fim > 2 && bytes[fim - 1] === 0x00) fim--;
  if (bytes[fim - 2] !== 0xff || bytes[fim - 1] !== 0xd9) {
    return recusa("JPEG sem o marcador final EOI (arquivo cortado)");
  }
  return { ok: true };
}

/**
 * Confere o arquivo INTEIRO de uma imagem que `lerImagem` já reconheceu. PNG: todos os blocos com CRC certo,
 * IHDR válido no começo, ao menos um IDAT e o IEND no fim (sem nada depois), os dados da imagem
 * descompactam em exatamente o tamanho que o cabeçalho promete (cada linha com um filtro válido), e fora o
 * que o jsPDF 2.5.2 não decodifica direito (entrelaçado, animado, paleta sem PLTE ou com alfa parcial em 1 a
 * 4 bits). Os 16 bits (cinza, RGB e com alfa) o jsPDF decodifica: passam. JPEG: ver `conferirJpeg`.
 * Assíncrona porque a descompactação usa o `DecompressionStream` do runtime (Deno e Node).
 */
export async function conferirImagem(
  bytes: Uint8Array,
  img: ImagemLida
): Promise<ConferenciaImagem> {
  return img.formato === "PNG" ? await conferirPng(bytes, img) : conferirJpeg(bytes);
}
