// node --test supabase/functions/_shared/documentos/zip-store.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { crc32, zipSemCompressao } from "./zip-store.ts";

const enc = new TextEncoder();

test("crc32: o valor de referência de '123456789'", () => {
  assert.equal(crc32(enc.encode("123456789")), 0xcbf43926);
  assert.equal(crc32(new Uint8Array(0)), 0);
});

test("zipSemCompressao: abre no jszip com o CRC conferido e devolve os mesmos bytes", async () => {
  const z = zipSemCompressao([
    { nome: "[Content_Types].xml", dados: enc.encode("<a>ção</a>") },
    { nome: "word/document.xml", dados: enc.encode("<w>Declaração</w>") },
    { nome: "vazio.bin", dados: new Uint8Array(0) },
  ]);
  assert.deepEqual([...z.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  const lido = await JSZip.loadAsync(z, { checkCRC32: true });
  assert.deepEqual(Object.keys(lido.files), [
    "[Content_Types].xml",
    "word/document.xml",
    "vazio.bin",
  ]);
  assert.equal(await lido.file("word/document.xml")!.async("string"), "<w>Declaração</w>");
  assert.deepEqual(
    zipSemCompressao([{ nome: "a", dados: enc.encode("x") }]),
    zipSemCompressao([{ nome: "a", dados: enc.encode("x") }])
  );
});
