import { describe, it, expect } from "vitest";
import {
  OPCOES_MODALIDADE,
  avisoDaModalidade,
  explicacaoDaModalidade,
  rotuloDaModalidade,
} from "./ead-modalidade";
import { MODALIDADES } from "./ead-requisitos";

describe("opções de modalidade da tela do curso", () => {
  it("oferece as três modalidades do banco, EAD primeiro", () => {
    expect(OPCOES_MODALIDADE.map((o) => o.valor)).toEqual(MODALIDADES);
    expect(OPCOES_MODALIDADE[0].valor).toBe("ead");
  });
  it("cada opção tem rótulo e explicação curta", () => {
    for (const o of OPCOES_MODALIDADE) {
      expect(o.rotulo.length).toBeGreaterThan(2);
      expect(o.explicacao.length).toBeGreaterThan(20);
    }
  });
  it("explica o que cada modalidade faz com o certificado", () => {
    expect(explicacaoDaModalidade("ead")).toMatch(/emite certificado/i);
    expect(explicacaoDaModalidade("semipresencial")).toMatch(/prática presencial/i);
    expect(explicacaoDaModalidade("apoio")).toMatch(/não emite certificado/i);
  });
  it("modalidade ausente vale EAD; desconhecida aparece como está", () => {
    expect(rotuloDaModalidade(undefined)).toBe(rotuloDaModalidade("ead"));
    expect(rotuloDaModalidade("")).toBe(rotuloDaModalidade("ead"));
    expect(rotuloDaModalidade("outra")).toBe("outra");
    expect(explicacaoDaModalidade("outra")).toBe("");
  });
});

describe("aviso de NR-35 marcada como EAD", () => {
  it("avisa quando o nome ou o código tem NR-35 e a modalidade é EAD (ou não foi marcada)", () => {
    for (const curso of [
      { nome: "NR-35 Trabalho em Altura" },
      { nome: "Altura", codigo: "NR35" },
      { nome: "nr 35 reciclagem (8h)", modalidade: "ead" },
    ]) {
      expect(avisoDaModalidade(curso)).toMatch(/NR-35/);
      expect(avisoDaModalidade(curso)).toMatch(/presencial/i);
    }
  });
  it("não avisa para apoio ou semipresencial, nem para outros cursos", () => {
    expect(avisoDaModalidade({ nome: "NR-35", modalidade: "apoio" })).toBeNull();
    expect(avisoDaModalidade({ nome: "NR-35", modalidade: "semipresencial" })).toBeNull();
    expect(avisoDaModalidade({ nome: "NR-10 Básico" })).toBeNull();
    expect(avisoDaModalidade({ nome: "NR-350" })).toBeNull();
    expect(avisoDaModalidade({})).toBeNull();
    expect(avisoDaModalidade(null)).toBeNull();
  });
});
