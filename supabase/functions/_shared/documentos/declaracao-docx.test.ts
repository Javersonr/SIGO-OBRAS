// node --test supabase/functions/_shared/documentos/declaracao-docx.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { gerarDocxDeclaracao } from "./declaracao-docx.ts";
import { DADOS, PNG_1X1 } from "./testes/amostras.ts";

test("docx sem logo: três partes, texto escapado e o bloco de assinatura", async () => {
  const z = await JSZip.loadAsync(gerarDocxDeclaracao(DADOS), { checkCRC32: true });
  assert.deepEqual(Object.keys(z.files), [
    "[Content_Types].xml",
    "_rels/.rels",
    "word/document.xml",
  ]);
  const doc = await z.file("word/document.xml")!.async("string");
  assert.ok(doc.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'));
  assert.ok(doc.includes("Empresa Teste Construções &amp; Serviços Ltda"));
  assert.ok(doc.includes("DECLARAÇÃO DE QUE NÃO EMPREGA MENOR"));
  assert.ok(doc.includes("Iluminação pública &lt;LED&gt;"));
  assert.ok(doc.includes("Cidade/MG, 13 de outubro de 2026."));
  assert.ok(doc.includes("CPF: 529.982.247-25"));
  assert.ok(doc.indexOf("Fulana de Tal") > doc.indexOf("________"));
  assert.ok(!doc.includes("<w:drawing>"));
  const tipos = await z.file("[Content_Types].xml")!.async("string");
  assert.ok(tipos.includes("wordprocessingml.document.main+xml"));
});

test("docx com logo: imagem em word/media, relação e extensão no content types", async () => {
  const z = await JSZip.loadAsync(
    gerarDocxDeclaracao(DADOS, { formato: "PNG", largura: 200, altura: 100, bytes: PNG_1X1 }),
    {
      checkCRC32: true,
    }
  );
  assert.deepEqual(Object.keys(z.files), [
    "[Content_Types].xml",
    "_rels/.rels",
    "word/document.xml",
    "word/_rels/document.xml.rels",
    "word/media/logo.png",
  ]);
  const doc = await z.file("word/document.xml")!.async("string");
  // 200 x 100 px cabe em 50 x 18 mm pela altura: 36 mm x 18 mm = 1296000 x 648000 EMU
  assert.ok(doc.includes('<wp:extent cx="1296000" cy="648000"/>'));
  assert.ok((await z.file("[Content_Types].xml")!.async("string")).includes('Extension="png"'));
  assert.deepEqual(await z.file("word/media/logo.png")!.async("uint8array"), PNG_1X1);
});

test("docx: caractere de controle no texto não quebra o XML", async () => {
  const z = await JSZip.loadAsync(
    gerarDocxDeclaracao({ ...DADOS, paragrafos: ["a\u0001b\u000bc"] })
  );
  assert.ok((await z.file("word/document.xml")!.async("string")).includes(">abc<"));
});
