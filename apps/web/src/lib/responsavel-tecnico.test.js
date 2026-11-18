import { describe, it, expect } from "vitest";
import {
  ERRO_CPF_RESPONSAVEL_TECNICO,
  LACUNA,
  prepararResponsavelTecnico,
  responsavelTecnicoParaDocumento,
} from "./responsavel-tecnico";

const rtCompleto = {
  responsavel_tecnico_nome: "Maria Exemplo da Silva",
  responsavel_tecnico_titulo: "Engenheira Eletricista",
  responsavel_tecnico_conselho: "CREA-SP",
  responsavel_tecnico_registro: "000000/D",
  responsavel_tecnico_cpf: "52998224725",
};

describe("prepararResponsavelTecnico", () => {
  const base = { nome: "Empresa Teste", cnpj: "11222333000181", tema_cores: { primaria: "#000" } };

  it("apara os textos e grava o CPF formatado", () => {
    const r = prepararResponsavelTecnico({
      ...base,
      responsavel_tecnico_nome: "  Maria Exemplo da Silva ",
      responsavel_tecnico_titulo: " Engenheira Eletricista ",
      responsavel_tecnico_conselho: " CREA-SP ",
      responsavel_tecnico_registro: " 000000/D ",
      responsavel_tecnico_cpf: "52998224725",
    });
    expect(r.ok).toBe(true);
    expect(r.dados.responsavel_tecnico_nome).toBe("Maria Exemplo da Silva");
    expect(r.dados.responsavel_tecnico_titulo).toBe("Engenheira Eletricista");
    expect(r.dados.responsavel_tecnico_conselho).toBe("CREA-SP");
    expect(r.dados.responsavel_tecnico_registro).toBe("000000/D");
    expect(r.dados.responsavel_tecnico_cpf).toBe("529.982.247-25");
  });

  it("mantém as outras chaves do formulário e não altera o objeto recebido", () => {
    const entrada = { ...base, responsavel_tecnico_nome: " Ana ", representante_nome: "Outro" };
    const r = prepararResponsavelTecnico(entrada);
    expect(r.ok).toBe(true);
    expect(r.dados.nome).toBe("Empresa Teste");
    expect(r.dados.representante_nome).toBe("Outro");
    expect(r.dados.tema_cores).toEqual({ primaria: "#000" });
    expect(entrada.responsavel_tecnico_nome).toBe(" Ana ");
  });

  it("tudo é opcional: empresa sem os campos grava os cinco vazios", () => {
    const r = prepararResponsavelTecnico(base);
    expect(r.ok).toBe(true);
    for (const campo of ["nome", "titulo", "conselho", "registro", "cpf"]) {
      expect(r.dados[`responsavel_tecnico_${campo}`]).toBe("");
    }
  });

  it("CPF informado com dígito verificador errado → erro", () => {
    for (const cpf of ["529.982.247-24", "111.111.111-11", "5299822472"]) {
      const r = prepararResponsavelTecnico({ ...base, responsavel_tecnico_cpf: cpf });
      expect(r).toEqual({ ok: false, erro: ERRO_CPF_RESPONSAVEL_TECNICO });
    }
  });
});

describe("responsavelTecnicoParaDocumento", () => {
  it("devolve os dados cadastrados, com o CPF formatado", () => {
    expect(responsavelTecnicoParaDocumento(rtCompleto)).toEqual({
      nome: "Maria Exemplo da Silva",
      titulo: "Engenheira Eletricista",
      conselho: "CREA-SP",
      registro: "000000/D",
      cpf: "529.982.247-25",
      completo: true,
      faltando: [],
    });
  });

  it("empresa sem cadastro: cada campo vira uma linha para preencher à mão", () => {
    for (const empresa of [undefined, null, {}]) {
      const rt = responsavelTecnicoParaDocumento(empresa);
      expect(rt.nome).toBe(LACUNA);
      expect(rt.titulo).toBe(LACUNA);
      expect(rt.registro).toBe(LACUNA);
      expect(rt.cpf).toBe(LACUNA);
      expect(rt.completo).toBe(false);
      expect(rt.faltando).toEqual(["nome", "título", "registro", "CPF"]);
    }
  });

  it("conselho em branco sai como CREA (o padrão dos documentos de NR-10 e NR-35)", () => {
    const rt = responsavelTecnicoParaDocumento({ ...rtCompleto, responsavel_tecnico_conselho: "" });
    expect(rt.conselho).toBe("CREA");
    expect(rt.completo).toBe(true);
  });

  it("cadastro parcial: diz o que falta e não inventa nada", () => {
    const rt = responsavelTecnicoParaDocumento({
      responsavel_tecnico_nome: "Maria Exemplo da Silva",
      responsavel_tecnico_registro: "000000/D",
    });
    expect(rt.nome).toBe("Maria Exemplo da Silva");
    expect(rt.registro).toBe("000000/D");
    expect(rt.titulo).toBe(LACUNA);
    expect(rt.cpf).toBe(LACUNA);
    expect(rt.completo).toBe(false);
    expect(rt.faltando).toEqual(["título", "CPF"]);
  });

  it("nunca devolve o nome de uma pessoa fixa do código", () => {
    const tudo = JSON.stringify(responsavelTecnicoParaDocumento({}));
    expect(tudo).not.toMatch(/[A-Za-zÀ-ú]{3,} [A-Za-zÀ-ú]{3,} da Silva/);
    expect(tudo).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/);
  });
});
