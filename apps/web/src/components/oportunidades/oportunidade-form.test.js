import { describe, expect, it } from "vitest";
import {
  nomeDaCopia,
  parseValorEstimado,
  preservarAtende,
  valorEstimadoParaForm,
} from "./oportunidade-form";

describe("parseValorEstimado", () => {
  it("número passa direto", () => {
    expect(parseValorEstimado(1234.5)).toBe(1234.5);
    expect(parseValorEstimado(1234.56)).toBe(1234.56);
    expect(parseValorEstimado(1000)).toBe(1000);
    expect(parseValorEstimado(0.5)).toBe(0.5);
    expect(parseValorEstimado(Number.NaN)).toBe(0);
  });

  it("string SEM vírgula: ponto é decimal (não multiplica por 10/100)", () => {
    expect(parseValorEstimado("1234.5")).toBe(1234.5);
    expect(parseValorEstimado("1234.56")).toBe(1234.56);
    expect(parseValorEstimado("1000")).toBe(1000);
  });

  it("string COM vírgula: pt-BR", () => {
    expect(parseValorEstimado("0,5")).toBe(0.5);
    expect(parseValorEstimado("1.234,56")).toBe(1234.56);
    expect(parseValorEstimado("R$ 1.234,56")).toBe(1234.56);
    expect(parseValorEstimado("1234,5")).toBe(1234.5);
  });

  it("vazio ou ilegível vira 0", () => {
    expect(parseValorEstimado("")).toBe(0);
    expect(parseValorEstimado(null)).toBe(0);
    expect(parseValorEstimado(undefined)).toBe(0);
    expect(parseValorEstimado("abc")).toBe(0);
  });
});

describe("valorEstimadoParaForm", () => {
  it("devolve número (ou '' sem valor)", () => {
    expect(valorEstimadoParaForm(1234.5)).toBe(1234.5);
    expect(valorEstimadoParaForm("1234.56")).toBe(1234.56);
    expect(valorEstimadoParaForm("1.234,56")).toBe(1234.56);
    expect(valorEstimadoParaForm(0)).toBe(0);
    expect(valorEstimadoParaForm(null)).toBe("");
    expect(valorEstimadoParaForm(undefined)).toBe("");
    expect(valorEstimadoParaForm("  ")).toBe("");
  });
});

describe("nomeDaCopia", () => {
  it("prefixa 'Cópia de'", () => {
    expect(nomeDaCopia({ nome: "Iluminação LED" })).toBe("Cópia de Iluminação LED");
    expect(nomeDaCopia({ titulo: "Legado" })).toBe("Cópia de Legado");
    expect(nomeDaCopia({})).toBe("Cópia de oportunidade");
  });
});

describe("preservarAtende", () => {
  const base = { versao: 1, extraido: {}, analisado_em: "2026-09-24T10:00:00Z", atende: null };
  const conferida = { ...base, atende: { veredito: "atende" } };

  it("mantém a análise conferida quando a leitura é a mesma sem o atende", () => {
    expect(preservarAtende(conferida, base)).toBe(conferida);
    expect(preservarAtende(JSON.stringify(conferida), base)).toBe(JSON.stringify(conferida));
  });

  it("usa a lida quando ela já tem o atende ou é outra leitura", () => {
    const nova = { ...base, atende: { veredito: "nao_atende" } };
    expect(preservarAtende(conferida, nova)).toBe(nova);
    const outraLeitura = { ...base, analisado_em: "2026-09-25T10:00:00Z" };
    expect(preservarAtende(conferida, outraLeitura)).toBe(outraLeitura);
    expect(preservarAtende(null, base)).toBe(base);
    expect(preservarAtende(base, conferida)).toBe(conferida);
  });
});
