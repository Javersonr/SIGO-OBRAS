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

test("docx: U+FFFE e U+FFFF (inválidos em XML 1.0, o Word recusa o arquivo) saem do texto", async () => {
  const z = await JSZip.loadAsync(
    gerarDocxDeclaracao({ ...DADOS, paragrafos: ["a\uFFFEb\uFFFFc"] })
  );
  assert.ok((await z.file("word/document.xml")!.async("string")).includes(">abc<"));
});

/** Caracteres que o XML 1.0 admite: \t, \n, \r, U+0020-U+D7FF, U+E000-U+FFFD e os astrais. */
const FORA_DO_XML_1_0 = /[^\t\n\r\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/u;
const REMOVIDOS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\uFFFE\uFFFF]/g;

test("docx: texto hostil não deixa caractere inválido no XML nem escapa do escape", async () => {
  const hostil =
    "A\u0000B\u0001C\u0008D\u000bE\u000cF\u001fG\uFFFEH\uFFFFI\uD800J\uDFFFK " +
    "</w:t></w:r></w:p><w:p> &amp; &lt; ]]> <![CDATA[x]]> \"aspas\" 'apóstrofo' \u{1F600}";
  const documentoXml = async (paragrafos: string[]) => {
    const z = await JSZip.loadAsync(gerarDocxDeclaracao({ ...DADOS, paragrafos }), {
      checkCRC32: true,
    });
    return z.file("word/document.xml")!.async("string");
  };
  const base = await documentoXml(["um", "dois", "três"]);
  const doc = await documentoXml([hostil, hostil, hostil]);
  const contar = (xml: string, padrao: RegExp) => xml.match(padrao)?.length ?? 0;

  // a estrutura é a mesma de um documento com texto comum: nada do texto virou marcação
  for (const padrao of [/<w:p>/g, /<w:r>/g, /<w:t /g, /<\/w:t>/g, /<\/w:p>/g, /<w:/g, /<\//g]) {
    assert.equal(contar(doc, padrao), contar(base, padrao), String(padrao));
  }
  // nenhum caractere fora do conjunto válido do XML 1.0
  assert.doesNotMatch(doc, FORA_DO_XML_1_0);
  // fora das tags, nenhum < ou > solto e todo & abre uma entidade
  const soTexto = doc.replace(/<[^<>]*>/g, "");
  assert.doesNotMatch(soTexto, /[<>]/);
  assert.doesNotMatch(soTexto, /&(?!(?:amp|lt|gt|quot);)/);
  // o texto volta igual depois de desfeito o escape; só os caracteres inválidos foram tirados
  // (o par solto de surrogates vira U+FFFD na codificação em UTF-8, que o XML admite)
  const esperado = hostil.replace(REMOVIDOS, "").toWellFormed();
  const trechos = [...doc.matchAll(/<w:t xml:space="preserve">([^<]*)<\/w:t>/g)].map((m) =>
    m[1]
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
  );
  assert.equal(trechos.filter((t) => t === esperado).length, 3);
});

test("docx: o conjunto de caracteres válidos do XML 1.0 não perde nenhum caractere legítimo", async () => {
  const legitimo =
    "Tab\tLF\nCR\rEspaço \u007f\u0085\u00a0 \u00e7\u00e3 \uD7FF\uE000\uFFFD \u{1F600}";
  const z = await JSZip.loadAsync(gerarDocxDeclaracao({ ...DADOS, paragrafos: [legitimo] }));
  const doc = await z.file("word/document.xml")!.async("string");
  assert.doesNotMatch(doc, FORA_DO_XML_1_0);
  assert.ok(doc.includes(`>${legitimo}<`));
});
