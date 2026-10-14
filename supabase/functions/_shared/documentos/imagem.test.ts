// node --test supabase/functions/_shared/documentos/imagem.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { conferirImagem, lerImagem } from "./imagem.ts";
import { PNG_1X1 } from "./testes/amostras.ts";
import {
  blocoPng,
  construirPng,
  jpegSintetico,
  pixelsSinteticos,
  type OpcoesPng,
} from "./testes/imagens.ts";

/** JPEG mínimo só com os cabeçalhos: SOI, APP0 e SOF0 (altura 30, largura 120). */
const JPEG_CABECALHO = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
  0x00, 0x01, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x1e, 0x00, 0x78, 0x03, 0x01, 0x22,
  0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
]);

test("lerImagem: PNG pelo IHDR, JPEG pelo SOF, o resto null", () => {
  assert.deepEqual(lerImagem(PNG_1X1), { formato: "PNG", largura: 1, altura: 1 });
  assert.deepEqual(lerImagem(JPEG_CABECALHO), { formato: "JPEG", largura: 120, altura: 30 });
  assert.equal(
    lerImagem(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>")),
    null
  );
  assert.equal(lerImagem(new Uint8Array([0x89, 0x50, 0x4e])), null);
  assert.equal(lerImagem(new Uint8Array(0)), null);
  assert.equal(lerImagem(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x02])), null);
});

const ASSINATURA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** O PNG de 1 x 1 com largura e altura trocadas no IHDR (bytes 16 a 19 e 20 a 23). */
function pngComDimensoes(largura: number, altura: number): Uint8Array {
  const png = PNG_1X1.slice();
  const v = new DataView(png.buffer);
  v.setUint32(16, largura);
  v.setUint32(20, altura);
  return png;
}

test("lerImagem: PNG só vale com o IHDR logo depois da assinatura", () => {
  // assinatura de PNG seguida de lixo (24 bytes ou mais): não é um PNG
  assert.equal(lerImagem(Uint8Array.from([...ASSINATURA_PNG, ...new Array(40).fill(0x41)])), null);
  // IHDR no lugar errado
  const deslocado = PNG_1X1.slice();
  deslocado.set([0x49, 0x48, 0x44, 0x53], 12);
  assert.equal(lerImagem(deslocado), null);
  assert.deepEqual(lerImagem(PNG_1X1), { formato: "PNG", largura: 1, altura: 1 });
});

test("lerImagem: dimensões de 1 a 20000 px em cada lado, senão null (PNG e JPEG)", () => {
  assert.deepEqual(lerImagem(pngComDimensoes(20000, 20000)), {
    formato: "PNG",
    largura: 20000,
    altura: 20000,
  });
  for (const [largura, altura] of [
    [0, 1],
    [1, 0],
    [20001, 1],
    [1, 20001],
    [4294967295, 1],
    [1, 4294967295],
  ]) {
    assert.equal(lerImagem(pngComDimensoes(largura, altura)), null, `${largura} x ${altura}`);
  }
  const jpeg = (altura: number, largura: number) => {
    const bytes = JPEG_CABECALHO.slice();
    const v = new DataView(bytes.buffer);
    v.setUint16(25, altura);
    v.setUint16(27, largura);
    return bytes;
  };
  assert.deepEqual(lerImagem(jpeg(30, 120)), { formato: "JPEG", largura: 120, altura: 30 });
  assert.deepEqual(lerImagem(jpeg(20000, 20000)), {
    formato: "JPEG",
    largura: 20000,
    altura: 20000,
  });
  for (const [altura, largura] of [
    [0, 120],
    [30, 0],
    [20001, 120],
    [30, 20001],
    [65535, 65535],
  ]) {
    assert.equal(lerImagem(jpeg(altura, largura)), null, `${largura} x ${altura}`);
  }
});

test("lerImagem: JPEG com 0xFF de preenchimento antes do marcador (permitido pelo formato)", () => {
  const comEnchimento = (quantos: number) =>
    Uint8Array.from([
      ...JPEG_CABECALHO.slice(0, 20),
      ...new Array(quantos).fill(0xff),
      ...JPEG_CABECALHO.slice(20),
    ]);
  for (const quantos of [1, 2, 7]) {
    assert.deepEqual(
      lerImagem(comEnchimento(quantos)),
      { formato: "JPEG", largura: 120, altura: 30 },
      `${quantos} bytes de preenchimento`
    );
  }
  // o preenchimento também pode vir antes do APP0, logo depois do SOI
  assert.deepEqual(
    lerImagem(Uint8Array.from([0xff, 0xd8, 0xff, 0xff, ...JPEG_CABECALHO.slice(2)])),
    { formato: "JPEG", largura: 120, altura: 30 }
  );
});

test("lerImagem: JPEG sem SOF, truncado ou com segmento de tamanho menor que 2 é null", () => {
  const app0 = JPEG_CABECALHO.slice(0, 20);
  // só o APP0, fim do arquivo: nenhum SOF
  assert.equal(lerImagem(app0), null);
  // APP0 e EOI (0xFFD9) antes de qualquer SOF
  assert.equal(lerImagem(Uint8Array.from([...app0, 0xff, 0xd9, 0, 0, 0, 0, 0, 0, 0, 0])), null);
  // segmento com tamanho 1 e com tamanho 0 (menor que os 2 bytes do próprio campo)
  for (const tamanho of [0, 1]) {
    assert.equal(
      lerImagem(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, tamanho, ...new Array(30).fill(0)])),
      null,
      `tamanho ${tamanho}`
    );
  }
  // arquivo que acaba em preenchimento: null, e não uma exceção do DataView
  for (const fim of [[0xff], [0xff, 0xff], [0xff, 0xff, 0xff, 0xff, 0xff], [0xff, 0xe0, 0x00]]) {
    assert.equal(lerImagem(Uint8Array.from([0xff, 0xd8, ...fim])), null, `fim ${fim.length}`);
  }
  // SOF cortado antes da largura: null, e não uma exceção do DataView
  for (let corte = 21; corte < 29; corte++) {
    assert.equal(lerImagem(JPEG_CABECALHO.slice(0, corte)), null, `cortado em ${corte}`);
  }
  assert.deepEqual(lerImagem(JPEG_CABECALHO.slice(0, 29)), {
    formato: "JPEG",
    largura: 120,
    altura: 30,
  });
});

// ─── conferirImagem: o arquivo inteiro, não só o cabeçalho ───────────────────────────────────────

/** `conferirImagem` com as dimensões lidas de uma imagem de referência (para conferir também arquivos cortados). */
async function conferir(bytes: Uint8Array, referencia: Uint8Array = bytes) {
  const img = lerImagem(referencia);
  assert.ok(img, "a imagem de referência do teste tem de passar por lerImagem");
  return conferirImagem(bytes, img);
}

async function assertRecusa(
  bytes: Uint8Array,
  trecho: RegExp,
  nome: string,
  referencia?: Uint8Array
) {
  const r = await conferir(bytes, referencia);
  assert.equal(r.ok, false, `${nome}: devia recusar`);
  if (!r.ok) assert.match(r.motivo, trecho, nome);
}

const PNGS_BONS: [string, OpcoesPng][] = [
  ["RGB 8 bits", { largura: 13, altura: 7 }],
  ["RGBA 8 bits", { largura: 13, altura: 7, tipoCor: 6 }],
  ["RGB 16 bits", { largura: 13, altura: 7, tipoCor: 2, profundidade: 16 }],
  ["RGBA 16 bits", { largura: 13, altura: 7, tipoCor: 6, profundidade: 16 }],
  ["cinza 1 bit", { largura: 13, altura: 7, tipoCor: 0, profundidade: 1 }],
  ["cinza 8 bits", { largura: 13, altura: 7, tipoCor: 0, profundidade: 8 }],
  ["cinza 16 bits", { largura: 13, altura: 7, tipoCor: 0, profundidade: 16 }],
  ["cinza com alfa 8 bits", { largura: 13, altura: 7, tipoCor: 4, profundidade: 8 }],
  ["cinza com alfa 16 bits", { largura: 13, altura: 7, tipoCor: 4, profundidade: 16 }],
  ["paleta 1 bit", { largura: 13, altura: 7, tipoCor: 3, profundidade: 1 }],
  ["paleta 2 bits", { largura: 13, altura: 7, tipoCor: 3, profundidade: 2 }],
  ["paleta 4 bits", { largura: 13, altura: 7, tipoCor: 3, profundidade: 4 }],
  ["paleta 8 bits", { largura: 13, altura: 7, tipoCor: 3, profundidade: 8 }],
  [
    "paleta 8 bits com transparência parcial",
    { largura: 13, altura: 7, tipoCor: 3, profundidade: 8, trns: [0, 128, 200, 255] },
  ],
  [
    "paleta 4 bits com uma cor transparente",
    { largura: 13, altura: 7, tipoCor: 3, profundidade: 4, trns: [0] },
  ],
  [
    "paleta 4 bits com tRNS todo opaco",
    { largura: 13, altura: 7, tipoCor: 3, profundidade: 4, trns: [255, 255] },
  ],
  ["IDAT em três blocos seguidos", { largura: 40, altura: 40, idatEmPartes: 3 }],
  [
    "bloco auxiliar (tEXt) antes dos dados",
    {
      largura: 13,
      altura: 7,
      blocoExtra: { tipo: "tEXt", dados: Buffer.from("Software\0teste") },
    },
  ],
];

test("conferirImagem: PNG íntegro passa em todos os tipos de cor e profundidades (o jsPDF 2.5.2 decodifica todos)", async () => {
  for (const [nome, opcoes] of PNGS_BONS) {
    const r = await conferir(construirPng(opcoes));
    assert.deepEqual(r, { ok: true }, nome);
  }
  // o PNG de 1 x 1 de amostra, de verdade (gerado por outra ferramenta)
  assert.deepEqual(await conferir(PNG_1X1), { ok: true });
});

test("conferirImagem: PNG cortado em qualquer ponto (no meio de bloco, sem IEND) é recusado", async () => {
  const inteiro = construirPng({ largura: 30, altura: 20 });
  const cortes = [
    24,
    25,
    29,
    33,
    40,
    inteiro.length - 40,
    inteiro.length - 13,
    inteiro.length - 12,
    inteiro.length - 1,
  ];
  for (const corte of cortes) {
    await assertRecusa(inteiro.slice(0, corte), /cortado|IEND/, `cortado em ${corte}`, inteiro);
  }
  // sem o IEND, mas com o resto íntegro
  await assertRecusa(construirPng({ largura: 30, altura: 20, semIend: true }), /IEND/, "sem IEND");
});

test("conferirImagem: CRC errado em qualquer bloco é recusado", async () => {
  for (const bloco of ["IHDR", "IDAT", "IEND"] as const) {
    await assertRecusa(
      construirPng({ largura: 13, altura: 7, crcErradoEm: bloco }),
      new RegExp(`${bloco}.*CRC|CRC.*${bloco}`),
      `CRC errado em ${bloco}`
    );
  }
  await assertRecusa(
    construirPng({ largura: 13, altura: 7, tipoCor: 3, profundidade: 4, crcErradoEm: "PLTE" }),
    /PLTE.*CRC|CRC.*PLTE/,
    "CRC errado em PLTE"
  );
  // um bit trocado no meio dos dados comprimidos, com o CRC do arquivo original
  const bom = construirPng({ largura: 30, altura: 20 });
  const adulterado = bom.slice();
  adulterado[adulterado.length - 30] ^= 0x10;
  await assertRecusa(adulterado, /CRC/, "bit trocado no IDAT");
});

test("conferirImagem: sem IDAT, ou com bytes depois do IEND, é recusado", async () => {
  await assertRecusa(construirPng({ largura: 13, altura: 7, semIdat: true }), /IDAT/, "sem IDAT");
  for (const depois of [[0], [0, 0, 0, 0], [1, 2, 3]]) {
    await assertRecusa(
      construirPng({ largura: 13, altura: 7, depoisDoIend: Uint8Array.from(depois) }),
      /depois do .*IEND/,
      `${depois.length} byte(s) depois do IEND`
    );
  }
});

test("conferirImagem: IDAT lixo com CRC certo (o jsPDF embute sem decodificar e o PDF fica com a imagem quebrada)", async () => {
  const lixo = Buffer.from("isto nao e um fluxo zlib, mas o CRC do bloco confere 0123456789");
  for (const tipoCor of [0, 2, 3, 4, 6] as const) {
    await assertRecusa(
      construirPng({ largura: 16, altura: 16, tipoCor, profundidade: 8, idat: lixo }),
      /zlib|dados da imagem/,
      `IDAT lixo, tipo ${tipoCor}`
    );
  }
});

test("conferirImagem: dados da imagem com tamanho diferente do que o cabeçalho promete são recusados", async () => {
  const pixels = pixelsSinteticos(16, 16, 2, 8);
  // faltam linhas
  await assertRecusa(
    construirPng({ largura: 16, altura: 16, dadosBrutos: pixels.subarray(0, pixels.length / 2) }),
    /menos|incompleto|tamanho/,
    "metade das linhas"
  );
  // sobram bytes
  await assertRecusa(
    construirPng({
      largura: 16,
      altura: 16,
      dadosBrutos: Buffer.concat([pixels, Buffer.alloc(30)]),
    }),
    /mais|tamanho/,
    "bytes a mais"
  );
  // o cabeçalho diz 16 bits, mas os dados têm o tamanho de 8 bits (as linhas não caem onde o cabeçalho
  // espera: ou falta dado ou o "byte de filtro" esperado é um pixel qualquer)
  await assertRecusa(
    construirPng({ largura: 16, altura: 16, tipoCor: 2, profundidade: 16, dadosBrutos: pixels }),
    /menos|incompleto|tamanho|filtro/,
    "16 bits declarados com dados de 8 bits"
  );
  // byte de filtro que não existe (o PNG só tem os filtros 0 a 4)
  const filtroInvalido = Buffer.from(pixels);
  filtroInvalido[(1 + 16 * 3) * 5] = 9;
  await assertRecusa(
    construirPng({ largura: 16, altura: 16, dadosBrutos: filtroInvalido }),
    /filtro/,
    "filtro 9"
  );
});

test("conferirImagem: bomba de descompressão (poucos KB que viram dezenas de MB) é recusada sem alocar o resultado", async () => {
  const bomba = zlib.deflateSync(Buffer.alloc(40 * 1024 * 1024));
  assert.ok(bomba.length < 100 * 1024);
  const t0 = performance.now();
  await assertRecusa(
    construirPng({ largura: 10, altura: 10, idat: bomba }),
    /mais|tamanho/,
    "bomba"
  );
  assert.ok(performance.now() - t0 < 5000);
});

/**
 * Descompressor de mentira que se comporta como o do Deno: entrega a saída INTEIRA de cada pedaço de entrada de
 * uma vez (`saidaPorEntrada` bytes), sem fatiar em 16 KB como o do Node, e conta o que recebeu e se foi cancelado.
 */
function descompressorQueDevolveTudoDeUmaVez(saidaPorEntrada: number) {
  const contagem = { entrada: 0, fatias: 0, maiorFatia: 0, cancelado: false };
  const transformador: Transformer<Uint8Array, Uint8Array> & { cancel?: () => void } = {
    transform(pedaco, controle) {
      contagem.entrada += pedaco.length;
      contagem.fatias++;
      contagem.maiorFatia = Math.max(contagem.maiorFatia, pedaco.length);
      controle.enqueue(new Uint8Array(saidaPorEntrada));
    },
    cancel() {
      contagem.cancelado = true;
    },
  };
  const ts = new TransformStream<Uint8Array, Uint8Array>(transformador);
  return { contagem, criarDescompressor: () => ts };
}

const FATIA = 16 * 1024;

test("conferirImagem: o fluxo entra no descompressor em fatias de 16 KB e a bomba para na primeira saída grande (no Deno a saída de um pedaço vem inteira)", async () => {
  // IDAT de 200 KB que o descompressor de mentira "expande" em 2 MB a cada pedaço recebido; o PNG de 10 x 10
  // espera 310 bytes: a recusa tem de vir logo, depois de no máximo uma fatia a mais do que o necessário
  const png = construirPng({ largura: 10, altura: 10, idat: new Uint8Array(200 * 1024) });
  const falso = descompressorQueDevolveTudoDeUmaVez(2 * 1024 * 1024);
  const img = lerImagem(png)!;
  const r = await conferirImagem(png, img, { criarDescompressor: falso.criarDescompressor });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.motivo, /mais dados/);
  assert.ok(falso.contagem.maiorFatia <= FATIA, `entrou um pedaço de ${falso.contagem.maiorFatia}`);
  // o necessário para chegar à recusa é uma fatia; o canal pode já ter a seguinte na fila
  assert.ok(falso.contagem.entrada <= 2 * FATIA, `entraram ${falso.contagem.entrada} bytes`);
  assert.ok(falso.contagem.cancelado, "a leitura devia ter sido cancelada");
});

test("conferirImagem: se o runtime não leva o cancelamento da leitura até a escrita, nenhuma fatia nova entra depois da recusa", async () => {
  // o par de fluxos não está ligado: cancelar o lado da leitura não fecha o da escrita (o pior caso de um runtime
  // que não propaga o cancelamento); só o `parar` da conferência impede que o resto do IDAT continue entrando
  const contagem = { entrada: 0 };
  let saida!: ReadableStreamDefaultController<Uint8Array>;
  const readable = new ReadableStream<Uint8Array>({
    start(c) {
      saida = c;
    },
  });
  const writable = new WritableStream<Uint8Array>({
    write(pedaco) {
      contagem.entrada += pedaco.length;
      try {
        saida.enqueue(new Uint8Array(2 * 1024 * 1024));
      } catch {
        // a leitura já foi cancelada
      }
    },
  });
  const png = construirPng({ largura: 10, altura: 10, idat: new Uint8Array(400 * 1024) });
  const r = await conferirImagem(png, lerImagem(png)!, {
    criarDescompressor: () => ({ readable, writable }),
  });
  assert.equal(r.ok, false);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(contagem.entrada <= 2 * FATIA, `entraram ${contagem.entrada} bytes`);
});

test("conferirImagem: um IDAT de várias fatias de 16 KB (ruído, quase incompressível) passa íntegro e conta certo", async () => {
  const largura = 160;
  const altura = 120;
  const bytesPorLinha = 1 + largura * 4;
  const bruto = Buffer.alloc(bytesPorLinha * altura);
  const ruido = crypto.randomBytes(bruto.length);
  for (let y = 0; y < altura; y++) {
    bruto[y * bytesPorLinha] = y % 5; // um filtro válido por linha
    ruido.copy(bruto, y * bytesPorLinha + 1, y * bytesPorLinha + 1, (y + 1) * bytesPorLinha);
  }
  const png = construirPng({ largura, altura, tipoCor: 6, dadosBrutos: bruto });
  assert.ok(
    png.length > 3 * FATIA,
    `o PNG de teste tem ${png.length} bytes: precisa de várias fatias`
  );
  assert.deepEqual(await conferir(png), { ok: true });
  // e a falta de uma linha inteira ainda é pega, também com várias fatias
  const incompleto = construirPng({
    largura,
    altura,
    tipoCor: 6,
    dadosBrutos: bruto.subarray(0, bruto.length - bytesPorLinha),
  });
  await assertRecusa(incompleto, /menos|incompleto/, "falta uma linha");
});

test("conferirImagem: mais de 10000 blocos no PNG é recusado (10000 ainda passa)", async () => {
  // IHDR + n IDAT + IEND: 9998 IDAT = 10000 blocos; 9999 IDAT = 10001
  await assertRecusa(
    construirPng({ largura: 40, altura: 40, idatEmPartes: 9999 }),
    /blocos/,
    "10001 blocos"
  );
  await assertRecusa(
    construirPng({ largura: 40, altura: 40, idatEmPartes: 20000 }),
    /blocos/,
    "20002 blocos"
  );
  assert.deepEqual(
    await conferir(construirPng({ largura: 40, altura: 40, idatEmPartes: 9998 })),
    { ok: true },
    "10000 blocos"
  );
});

test("conferirImagem: combinação de tipo de cor e profundidade que o PNG não define, ou método desconhecido", async () => {
  for (const [tipoCor, profundidade] of [
    [2, 4],
    [2, 1],
    [3, 16],
    [4, 4],
    [6, 2],
    [6, 1],
  ] as const) {
    await assertRecusa(
      construirPng({ largura: 8, altura: 8, tipoCor, profundidade }),
      /IHDR/,
      `tipo ${tipoCor} com ${profundidade} bits`
    );
  }
  await assertRecusa(
    construirPng({ largura: 8, altura: 8, metodoCompressao: 1 }),
    /IHDR/,
    "compressão 1"
  );
  await assertRecusa(construirPng({ largura: 8, altura: 8, metodoFiltro: 1 }), /IHDR/, "filtro 1");
});

test("conferirImagem: o que o jsPDF 2.5.2 não decodifica direito: entrelaçado, animado, paleta sem PLTE ou com alfa em poucos bits", async () => {
  for (const tipoCor of [0, 2, 3, 4, 6] as const) {
    await assertRecusa(
      construirPng({ largura: 13, altura: 7, tipoCor, profundidade: 8, entrelacado: true }),
      /entrelaç/,
      `entrelaçado, tipo ${tipoCor}`
    );
  }
  await assertRecusa(
    construirPng({
      largura: 13,
      altura: 7,
      blocoExtra: { tipo: "acTL", dados: new Uint8Array(8) },
    }),
    /animad/,
    "APNG"
  );
  await assertRecusa(
    construirPng({ largura: 13, altura: 7, tipoCor: 3, profundidade: 8, semPaleta: true }),
    /paleta|PLTE/,
    "paleta sem PLTE"
  );
  // paleta de 1 a 4 bits com transparência parcial: o jsPDF calcula o alfa como se cada pixel fosse 1 byte
  for (const profundidade of [1, 2, 4] as const) {
    await assertRecusa(
      construirPng({ largura: 13, altura: 7, tipoCor: 3, profundidade, trns: [0, 128] }),
      /transparência|alfa/,
      `paleta ${profundidade} bits com alfa parcial`
    );
  }
  // mais entradas de transparência do que cores na paleta (o jsPDF lança)
  await assertRecusa(
    construirPng({ largura: 13, altura: 7, tipoCor: 3, profundidade: 1, trns: [0, 128, 255] }),
    /tRNS|transparência/,
    "tRNS maior que a paleta"
  );
  // PLTE com tamanho que não é múltiplo de 3 (logo depois do IHDR, antes do IDAT)
  const b = construirPng({ largura: 13, altura: 7, tipoCor: 3, profundidade: 4, semPaleta: true });
  const comPaletaTorta = Buffer.concat([
    Buffer.from(b.subarray(0, 33)),
    blocoPng("PLTE", new Uint8Array(10)),
    Buffer.from(b.subarray(33)),
  ]);
  await assertRecusa(new Uint8Array(comPaletaTorta), /PLTE|paleta/, "PLTE de 10 bytes");
});

test("conferirImagem: imagem grande demais para conferir não é lida (nem aloca): 20000 x 20000", async () => {
  await assertRecusa(
    construirPng({ largura: 20000, altura: 20000, idat: new Uint8Array(20) }),
    /grande demais/,
    "20000 x 20000"
  );
});

test("conferirImagem: JPEG termina com o marcador EOI (FF D9); só zeros de preenchimento depois dele", async () => {
  assert.deepEqual(await conferir(jpegSintetico(120, 30)), { ok: true });
  for (const zeros of [1, 2, 16]) {
    assert.deepEqual(
      await conferir(jpegSintetico(120, 30, { depois: new Array(zeros).fill(0) })),
      { ok: true },
      `${zeros} zero(s) de preenchimento depois do EOI`
    );
  }
  await assertRecusa(jpegSintetico(120, 30, { semEoi: true }), /EOI|final/, "sem EOI");
  await assertRecusa(
    jpegSintetico(120, 30, { semEoi: true, depois: [0, 0, 0] }),
    /EOI|final/,
    "sem EOI, só zeros no fim"
  );
  await assertRecusa(
    jpegSintetico(120, 30, { depois: [1, 2, 3] }),
    /EOI|final/,
    "lixo depois do EOI"
  );
  await assertRecusa(
    jpegSintetico(120, 30, { depois: [0xff, 0xd8] }),
    /EOI|final/,
    "outro SOI depois do EOI"
  );
  // cortado no meio da varredura
  const inteiro = jpegSintetico(120, 30);
  for (const corte of [inteiro.length - 3, inteiro.length - 1, 45]) {
    await assertRecusa(inteiro.slice(0, corte), /EOI|final/, `JPEG cortado em ${corte}`, inteiro);
  }
});
