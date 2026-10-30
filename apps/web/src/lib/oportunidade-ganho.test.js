import { describe, it, expect } from "vitest";
import { arquivaAoMudarPara, descricaoArquivadaAoGanhar } from "./oportunidade-ganho";

describe("arquivaAoMudarPara", () => {
  it("arquiva quando o novo status é do tipo ganho", () => {
    expect(arquivaAoMudarPara({ tipo: "ganho", nome: "Ganho" })).toBe(true);
  });

  it("não arquiva nos outros status (a perda arquiva pela própria ação)", () => {
    expect(arquivaAoMudarPara({ tipo: "perdido", nome: "Perdido" })).toBe(false);
    expect(arquivaAoMudarPara({ tipo: "aberto", nome: "Em análise" })).toBe(false);
    expect(arquivaAoMudarPara({ nome: "Ganho" })).toBe(false);
    expect(arquivaAoMudarPara(null)).toBe(false);
    expect(arquivaAoMudarPara(undefined)).toBe(false);
  });
});

describe("descricaoArquivadaAoGanhar", () => {
  it("cita a obra criada em Projetos", () => {
    expect(descricaoArquivadaAoGanhar("PM Exemplo - GO")).toBe(
      'Oportunidade ganha: obra "PM Exemplo - GO" em Projetos e oportunidade arquivada'
    );
  });

  it("sem nome de obra, não deixa aspas vazias", () => {
    expect(descricaoArquivadaAoGanhar("")).toBe(
      "Oportunidade ganha: obra criada em Projetos e oportunidade arquivada"
    );
    expect(descricaoArquivadaAoGanhar(null)).toBe(
      "Oportunidade ganha: obra criada em Projetos e oportunidade arquivada"
    );
  });
});
