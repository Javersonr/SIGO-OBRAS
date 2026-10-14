// node --test supabase/functions/_shared/documentos/declaracao-pdf.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { jsPDF } from "jspdf";
import { gerarPdfDeclaracao } from "./declaracao-pdf.ts";
import { bytesDoPdf } from "./proposta-export.ts";
import { DADOS, PNG_1X1 } from "./testes/amostras.ts";

// deno-lint-ignore no-explicit-any
const paginas = (doc: unknown) => (doc as any).getNumberOfPages();

test("PDF da declaração: retrato A4, uma página, com e sem logo", () => {
  const doc = gerarPdfDeclaracao(DADOS, { jsPDF });
  const bytes = bytesDoPdf(doc);
  assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
  assert.equal(paginas(doc), 1);
  // deno-lint-ignore no-explicit-any
  const pagina = (doc as any).internal.pageSize;
  assert.ok(pagina.getHeight() > pagina.getWidth());
  const comLogo = gerarPdfDeclaracao(
    DADOS,
    { jsPDF },
    { formato: "PNG", largura: 200, altura: 100, bytes: PNG_1X1 }
  );
  assert.ok(bytesDoPdf(comLogo).length > bytes.length);
});

test("PDF da declaração: texto de 20 mil caracteres quebra em várias páginas", () => {
  const frase =
    "A empresa declara, sob as penas da lei, que cumpre o exigido no edital e nos seus anexos. ";
  const longo = { ...DADOS, paragrafos: [frase.repeat(120), frase.repeat(100)] };
  const doc = gerarPdfDeclaracao(longo, { jsPDF });
  assert.ok(paginas(doc) >= 3);
  assert.equal(new TextDecoder().decode(bytesDoPdf(doc).slice(0, 5)), "%PDF-");
});

test("PDF da declaração: logo ilegível não derruba o documento", () => {
  const doc = gerarPdfDeclaracao(
    DADOS,
    { jsPDF },
    { formato: "PNG", largura: 10, altura: 10, bytes: new Uint8Array([1, 2, 3]) }
  );
  assert.equal(paginas(doc), 1);
});
