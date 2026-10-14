// node --test supabase/functions/_shared/documentos/imagem.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { lerImagem } from "./imagem.ts";
import { PNG_1X1 } from "./testes/amostras.ts";

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
