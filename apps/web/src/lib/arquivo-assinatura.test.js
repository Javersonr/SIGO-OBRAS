import { describe, it, expect } from "vitest";
import {
  ehBaixavel,
  patchDoAssinado,
  podeEnviarAssinado,
  podeIniciarEnvio,
  seloDaAssinatura,
  validarArquivoAssinado,
} from "./arquivo-assinatura";

const LIMITE = 50 * 1024 * 1024;

describe("assinatura dos arquivos da oportunidade", () => {
  it("seloDaAssinatura", () => {
    expect(seloDaAssinatura({ assinatura: "pendente" })).toEqual({
      texto: "falta assinar",
      cor: "amber",
    });
    expect(seloDaAssinatura({ assinatura: "assinado" })).toEqual({
      texto: "assinado",
      cor: "green",
    });
    expect(seloDaAssinatura({ assinatura: null })).toBe(null);
    expect(seloDaAssinatura({})).toBe(null);
  });
  it("seloDaAssinatura: sem a coluna (antes da 0156), valor estranho ou sem arquivo, não aparece nada", () => {
    expect(seloDaAssinatura({ id: "a", nome: "x.pdf" })).toBe(null);
    expect(seloDaAssinatura({ assinatura: "" })).toBe(null);
    expect(seloDaAssinatura({ assinatura: "PENDENTE" })).toBe(null);
    expect(seloDaAssinatura({ assinatura: "outro" })).toBe(null);
    expect(seloDaAssinatura(null)).toBe(null);
    expect(seloDaAssinatura(undefined)).toBe(null);
  });
  it("podeEnviarAssinado: só o pendente que não é link", () => {
    expect(podeEnviarAssinado({ assinatura: "pendente", tipo: "application/pdf" })).toBe(true);
    expect(podeEnviarAssinado({ assinatura: "assinado", tipo: "application/pdf" })).toBe(false);
    expect(podeEnviarAssinado({ assinatura: "pendente", tipo: "link" })).toBe(false);
    expect(podeEnviarAssinado({ tipo: "application/pdf" })).toBe(false);
    expect(podeEnviarAssinado(null)).toBe(false);
  });
  it("podeIniciarEnvio: só quando nenhum envio está em andamento (assinandoId nulo)", () => {
    expect(podeIniciarEnvio(null)).toBe(true);
    expect(podeIniciarEnvio(undefined)).toBe(true);
    // um envio em andamento (de qualquer linha) trava o início de outro
    expect(podeIniciarEnvio("00000000-0000-4000-8000-000000000001")).toBe(false);
    expect(podeIniciarEnvio(7)).toBe(false);
    expect(podeIniciarEnvio("")).toBe(false);
  });
  it("validarArquivoAssinado: PDF, não vazio, até o limite", () => {
    expect(
      validarArquivoAssinado(
        { name: "Decl_assinado.PDF", type: "application/pdf", size: 1000 },
        LIMITE
      )
    ).toEqual({
      ok: true,
    });
    expect(validarArquivoAssinado({ name: "decl.pdf", type: "", size: 1000 }, LIMITE)).toEqual({
      ok: true,
    });
    expect(validarArquivoAssinado(null, LIMITE)).toEqual({
      ok: false,
      erro: "Escolha o PDF assinado",
    });
    expect(
      validarArquivoAssinado({ name: "decl.docx", type: "application/msword", size: 10 }, LIMITE)
    ).toEqual({
      ok: false,
      erro: "O arquivo assinado tem de ser um PDF",
    });
    expect(
      validarArquivoAssinado({ name: "decl.pdf", type: "application/pdf", size: 0 }, LIMITE)
    ).toEqual({
      ok: false,
      erro: "O arquivo está vazio",
    });
    expect(
      validarArquivoAssinado(
        { name: "decl.pdf", type: "application/pdf", size: LIMITE + 1 },
        LIMITE
      )
    ).toEqual({
      ok: false,
      erro: "O arquivo passa de 50 MB",
    });
  });
  it("validarArquivoAssinado: o tipo manda quando vem preenchido; a extensão só vale com o tipo vazio", () => {
    // nome sem extensão, mas o navegador diz que é PDF: aceita
    expect(
      validarArquivoAssinado(
        { name: "Declaracao_assinada", type: "application/pdf", size: 10 },
        LIMITE
      )
    ).toEqual({ ok: true });
    // tipo em caixa mista e com parâmetro
    expect(
      validarArquivoAssinado({ name: "d", type: "Application/PDF; x=1", size: 10 }, LIMITE)
    ).toEqual({ ok: true });
    expect(
      validarArquivoAssinado({ name: "d", type: "application/x-pdf", size: 10 }, LIMITE)
    ).toEqual({ ok: true });
    // extensão .pdf, mas o tipo diz que é imagem: recusa
    const naoPdf = { ok: false, erro: "O arquivo assinado tem de ser um PDF" };
    expect(
      validarArquivoAssinado({ name: "decl.pdf", type: "image/png", size: 10 }, LIMITE)
    ).toEqual(naoPdf);
    expect(
      validarArquivoAssinado({ name: "decl.pdf", type: "text/plain", size: 10 }, LIMITE)
    ).toEqual(naoPdf);
    // tipo vazio e sem extensão de PDF: recusa
    expect(validarArquivoAssinado({ name: "decl", type: "", size: 10 }, LIMITE)).toEqual(naoPdf);
    expect(validarArquivoAssinado({ name: "decl.pdf.exe", type: "", size: 10 }, LIMITE)).toEqual(
      naoPdf
    );
    expect(validarArquivoAssinado({ size: 10 }, LIMITE)).toEqual(naoPdf);
    // tipo ausente (undefined) conta como vazio
    expect(validarArquivoAssinado({ name: "decl.PDF", size: 10 }, LIMITE)).toEqual({ ok: true });
  });
  it("validarArquivoAssinado: tamanho que não é número positivo conta como arquivo vazio", () => {
    const vazio = { ok: false, erro: "O arquivo está vazio" };
    for (const size of ["abc", "1000", NaN, Infinity, -5, null, undefined]) {
      expect(
        validarArquivoAssinado({ name: "decl.pdf", type: "application/pdf", size }, LIMITE)
      ).toEqual(vazio);
    }
  });
  it("validarArquivoAssinado: o limite é inclusivo, e sem o 2º argumento vale o do bucket (50 MB)", () => {
    expect(
      validarArquivoAssinado({ name: "d.pdf", type: "application/pdf", size: LIMITE }, LIMITE)
    ).toEqual({ ok: true });
    expect(
      validarArquivoAssinado({ name: "d.pdf", type: "application/pdf", size: LIMITE })
    ).toEqual({ ok: true });
    expect(
      validarArquivoAssinado({ name: "d.pdf", type: "application/pdf", size: LIMITE + 1 })
    ).toEqual({ ok: false, erro: "O arquivo passa de 50 MB" });
    // outro limite: a mensagem acompanha
    expect(
      validarArquivoAssinado(
        { name: "d.pdf", type: "application/pdf", size: 6 * 1024 * 1024 },
        5 * 1024 * 1024
      )
    ).toEqual({ ok: false, erro: "O arquivo passa de 5 MB" });
  });
  it("patchDoAssinado: troca a ref e marca assinado, sem mexer em nome, pasta ou origem", () => {
    expect(patchDoAssinado("anexos-oportunidade/e/2026/10/u-decl.pdf", { size: 1234 })).toEqual({
      url: "anexos-oportunidade/e/2026/10/u-decl.pdf",
      tamanho: 1234,
      tipo: "application/pdf",
      assinatura: "assinado",
    });
  });
  it("patchDoAssinado: só as quatro chaves (nunca nome, pasta, categoria, origem nem usuário)", () => {
    const patch = patchDoAssinado("anexos-oportunidade/e/2026/10/u-decl.pdf", {
      size: 1234,
      name: "outro-nome.pdf",
      type: "application/pdf",
      pasta: "Credenciamento",
      origem: "gerado:proposta:pdf",
      categoria: "edital",
    });
    expect(Object.keys(patch).sort()).toEqual(["assinatura", "tamanho", "tipo", "url"]);
    // tamanho que não é número: grava null (o antigo era do PDF pendente), mantendo as quatro chaves
    const semTamanho = patchDoAssinado("anexos-oportunidade/e/2026/10/u-decl.pdf", {});
    expect(Object.keys(semTamanho).sort()).toEqual(["assinatura", "tamanho", "tipo", "url"]);
    expect(semTamanho.tamanho).toBe(null);
    expect(patchDoAssinado("anexos-oportunidade/e/x.pdf", { size: "12" }).tamanho).toBe(null);
  });
  it("ehBaixavel: todo arquivo com ref, menos link", () => {
    expect(ehBaixavel({ tipo: "application/pdf", url: "anexos-oportunidade/x" })).toBe(true);
    expect(ehBaixavel({ tipo: "link", url: "https://x" })).toBe(false);
    expect(ehBaixavel({ tipo: "application/pdf", url: "" })).toBe(false);
  });
  it("ehBaixavel: xlsx e docx gerados também baixam; sem url, url em branco ou sem arquivo, não", () => {
    expect(
      ehBaixavel({
        tipo: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        url: "anexos-oportunidade/e/2026/10/u-proposta.xlsx",
      })
    ).toBe(true);
    expect(ehBaixavel({ tipo: "application/pdf" })).toBe(false);
    expect(ehBaixavel({ tipo: "application/pdf", url: "   " })).toBe(false);
    expect(ehBaixavel({ tipo: "application/pdf", url: null })).toBe(false);
    expect(ehBaixavel(null)).toBe(false);
  });
});
