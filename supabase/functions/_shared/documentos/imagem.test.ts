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
