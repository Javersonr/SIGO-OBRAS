import { describe, it, expect } from "vitest";
import {
  parseDocsOrTemplate,
  TEMPLATE_DOCS_RH,
  TEMPLATE_DOCS_DEMISSIONAIS,
} from "./documentos-funcionario";

// parseDocsOrTemplate: mesma família do safeParseJSON, mas com fallback pro
// template default quando o valor é vazio/corrompido/array vazio.

describe("parseDocsOrTemplate", () => {
  const tpl = TEMPLATE_DOCS_RH;

  it("vazio/nulo cai pro template", () => {
    expect(parseDocsOrTemplate(null, tpl)).toBe(tpl);
    expect(parseDocsOrTemplate(undefined, tpl)).toBe(tpl);
    expect(parseDocsOrTemplate("", tpl)).toBe(tpl);
  });

  it("array vazio cai pro template (não sobrescreve com nada)", () => {
    expect(parseDocsOrTemplate([], tpl)).toBe(tpl);
    expect(parseDocsOrTemplate("[]", tpl)).toBe(tpl);
  });

  it("array preenchido (objeto) volta direto", () => {
    const docs = [{ nome: "ASO", anexado: true }];
    expect(parseDocsOrTemplate(docs, tpl)).toBe(docs);
  });

  it("string JSON válida vira array", () => {
    const out = parseDocsOrTemplate('[{"nome":"X","anexado":false}]', tpl);
    expect(Array.isArray(out)).toBe(true);
    expect(out[0].nome).toBe("X");
  });

  it("string corrompida cai pro template", () => {
    expect(parseDocsOrTemplate("{quebrado", tpl)).toBe(tpl);
  });

  it("objeto não-array cai pro template", () => {
    expect(parseDocsOrTemplate({ foo: 1 }, tpl)).toBe(tpl);
  });
});

describe("templates default", () => {
  it("RH tem ASO como primeiro doc obrigatório", () => {
    expect(TEMPLATE_DOCS_RH[0].nome).toMatch(/ASO/);
    expect(TEMPLATE_DOCS_RH.every((d) => d.anexado === false)).toBe(true);
  });
  it("demissionais cobrem TRCT e exame demissional", () => {
    const nomes = TEMPLATE_DOCS_DEMISSIONAIS.map((d) => d.nome).join(" | ");
    expect(nomes).toMatch(/TRCT/);
    expect(nomes).toMatch(/Demissional/i);
  });
});
