import { describe, it, expect } from "vitest";
import * as modulo from "./apostila-pdf";
import {
  fimDaApostilaAlcancado,
  urlApostilaValida,
  leituraPodeContar,
  medidasDaPagina,
  mensagemFalhaPdf,
} from "./apostila-pdf";

describe("a apostila é desenhada pelo pdf.js em todas as telas (A5)", () => {
  it("não existe mais a escolha entre iframe e pdf.js pela consulta de mídia", () => {
    expect("apostilaNaPagina" in modulo).toBe(false);
    expect("MEDIA_APOSTILA_NA_PAGINA" in modulo).toBe(false);
  });
});

describe("urlApostilaValida", () => {
  it("aceita http e https", () => {
    expect(urlApostilaValida("https://exemplo.test/storage/apostila.pdf?token=abc")).toBe(true);
    expect(urlApostilaValida("  http://exemplo.test/a.pdf ")).toBe(true);
  });

  it("recusa nulo, vazio, about:blank e esquemas perigosos", () => {
    for (const ruim of [null, undefined, "", "   ", 42, {}, "about:blank", "#"]) {
      expect(urlApostilaValida(ruim)).toBe(false);
    }
    expect(urlApostilaValida("javascript:alert(1)")).toBe(false);
    expect(urlApostilaValida("data:application/pdf;base64,AAAA")).toBe(false);
    expect(urlApostilaValida("/caminho/relativo.pdf")).toBe(false);
  });
});

describe("leituraPodeContar", () => {
  const pdf = { tipo: "pdf", arquivo_url: "https://exemplo.test/a.pdf" };

  it("PDF sem URL nunca conta, em qualquer estado", () => {
    for (const estado of ["carregando", "pronto", "erro"]) {
      expect(leituraPodeContar({ tipo: "pdf", arquivo_url: null }, estado)).toBe(false);
      expect(leituraPodeContar({ tipo: "pdf", arquivo_url: "about:blank" }, estado)).toBe(false);
    }
  });

  it("PDF com URL só conta com a apostila aberta na tela", () => {
    expect(leituraPodeContar(pdf, "pronto")).toBe(true);
    expect(leituraPodeContar(pdf, "carregando")).toBe(false);
    expect(leituraPodeContar(pdf, "erro")).toBe(false);
    expect(leituraPodeContar(pdf, undefined)).toBe(false);
  });

  it("texto, tarefa, questionário e caso contam sempre; vídeo conta pelo player, não por aqui", () => {
    expect(leituraPodeContar({ tipo: "texto", conteudo_texto: "oi" }, "carregando")).toBe(true);
    for (const tipo of ["tarefa", "questionario", "caso"]) {
      expect(leituraPodeContar({ tipo }, "carregando")).toBe(true);
    }
    expect(leituraPodeContar({ tipo: "video" }, "pronto")).toBe(false);
    expect(leituraPodeContar(null, "pronto")).toBe(false);
  });
});

describe("fimDaApostilaAlcancado", () => {
  it("vale com o documento aberto, a largura medida e o marcador do fim à vista", () => {
    expect(fimDaApostilaAlcancado({ total: 12, largura: 700, visivel: true })).toBe(true);
    expect(fimDaApostilaAlcancado({ total: 1, largura: 320, visivel: true })).toBe(true);
  });

  it("marcador fora da área de leitura: ainda não chegou ao fim", () => {
    expect(fimDaApostilaAlcancado({ total: 12, largura: 700, visivel: false })).toBe(false);
  });

  it("antes de abrir o documento ou de medir a largura não vale (as páginas ainda não têm altura)", () => {
    for (const p of [
      { total: null, largura: 700, visivel: true },
      { total: 0, largura: 700, visivel: true },
      { total: 12, largura: 0, visivel: true },
      { total: 12, largura: NaN, visivel: true },
      {},
    ]) {
      expect(fimDaApostilaAlcancado(p)).toBe(false);
    }
    expect(fimDaApostilaAlcancado()).toBe(false);
  });
});

describe("medidasDaPagina", () => {
  // página A4 em pontos
  const a4 = { paginaLargura: 595, paginaAltura: 842 };

  it("ajusta a página à largura disponível (celular de 360 px, tela 3x)", () => {
    const m = medidasDaPagina({ ...a4, larguraDisponivel: 360, dpr: 3 });
    expect(m.cssLargura).toBe(360);
    expect(m.cssAltura).toBe(Math.round((360 * 842) / 595));
    // densidade limitada a 2x: o canvas tem 720 px de largura, não 1080
    expect(m.pixelLargura).toBe(720);
    expect(m.escala).toBeCloseTo(720 / 595, 5);
  });

  it("usa a densidade real até 2x e nunca abaixo de 1x", () => {
    expect(medidasDaPagina({ ...a4, larguraDisponivel: 400, dpr: 1.5 }).pixelLargura).toBe(600);
    expect(medidasDaPagina({ ...a4, larguraDisponivel: 400, dpr: 0 }).pixelLargura).toBe(400);
    expect(medidasDaPagina({ ...a4, larguraDisponivel: 400 }).pixelLargura).toBe(400);
  });

  it("reduz o canvas quando passa do limite de pixels (memória do iPhone)", () => {
    const m = medidasDaPagina({
      ...a4,
      larguraDisponivel: 1000,
      dpr: 2,
      maxPixels: 1_000_000,
    });
    expect(m.pixelLargura * m.pixelAltura).toBeLessThanOrEqual(1_000_000);
    // o tamanho na tela continua o mesmo; só diminui a resolução
    expect(m.cssLargura).toBe(1000);
    expect(m.escala).toBeCloseTo(m.pixelLargura / 595, 5);
  });

  it("mantém a proporção da página", () => {
    const m = medidasDaPagina({ paginaLargura: 842, paginaAltura: 595, larguraDisponivel: 500 });
    expect(m.cssAltura).toBe(Math.round((500 * 595) / 842));
  });

  it("entradas inválidas não geram tamanho zero nem NaN", () => {
    for (const ruim of [
      { paginaLargura: 0, paginaAltura: 842, larguraDisponivel: 300 },
      { paginaLargura: 595, paginaAltura: 842, larguraDisponivel: 0 },
      { paginaLargura: NaN, paginaAltura: NaN, larguraDisponivel: NaN },
    ]) {
      const m = medidasDaPagina(ruim);
      for (const v of Object.values(m)) {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThan(0);
      }
    }
  });
});

describe("mensagemFalhaPdf", () => {
  it("orienta cada tipo de falha em português", () => {
    expect(mensagemFalhaPdf({ name: "PasswordException" })).toMatch(/senha/);
    expect(mensagemFalhaPdf({ name: "InvalidPDFException" })).toMatch(/RH/);
    expect(mensagemFalhaPdf({ name: "MissingPDFException" })).toMatch(/RH/);
  });

  it("link recusado (expirou) pede para tentar de novo", () => {
    for (const status of [400, 401, 403]) {
      expect(mensagemFalhaPdf({ name: "UnexpectedResponseException", status })).toMatch(
        /link.*expir/i
      );
    }
  });

  it("falha de rede ou desconhecida sugere conferir a internet", () => {
    expect(mensagemFalhaPdf(new Error("Failed to fetch"))).toMatch(/internet/);
    expect(mensagemFalhaPdf(null)).toMatch(/internet/);
  });
});
