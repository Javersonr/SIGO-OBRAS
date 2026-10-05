import { describe, it, expect } from "vitest";
import { ERRO_CPF_REPRESENTANTE, prepararRepresentanteEmpresa } from "./representante-empresa";

describe("prepararRepresentanteEmpresa", () => {
  const base = {
    nome: "Sinergia",
    cnpj: "28182842000120",
    responsavel_principal: "Javerson",
    tema_cores: { primaria: "#f59e0b" },
  };

  it("CPF válido sem máscara é gravado formatado; nome e cargo sem espaços nas pontas", () => {
    const r = prepararRepresentanteEmpresa({
      ...base,
      representante_nome: "  Javerson Rodrigues ",
      representante_cargo: " Sócio-administrador ",
      representante_cpf: "52998224725",
    });
    expect(r.ok).toBe(true);
    expect(r.dados.representante_nome).toBe("Javerson Rodrigues");
    expect(r.dados.representante_cargo).toBe("Sócio-administrador");
    expect(r.dados.representante_cpf).toBe("529.982.247-25");
  });

  it("mantém as outras chaves do formulário (o Salvar manda todas)", () => {
    const r = prepararRepresentanteEmpresa({ ...base, representante_cpf: "529.982.247-25" });
    expect(r.ok).toBe(true);
    expect(r.dados.nome).toBe("Sinergia");
    expect(r.dados.cnpj).toBe("28182842000120");
    expect(r.dados.responsavel_principal).toBe("Javerson");
    expect(r.dados.tema_cores).toEqual({ primaria: "#f59e0b" });
  });

  it("não altera o objeto recebido", () => {
    const entrada = { ...base, representante_nome: " Ana ", representante_cpf: "52998224725" };
    prepararRepresentanteEmpresa(entrada);
    expect(entrada.representante_nome).toBe(" Ana ");
    expect(entrada.representante_cpf).toBe("52998224725");
  });

  it("CPF é opcional: vazio, só espaços ou ausente grava texto vazio", () => {
    for (const cpf of ["", "   ", null, undefined]) {
      const r = prepararRepresentanteEmpresa({ ...base, representante_cpf: cpf });
      expect(r.ok).toBe(true);
      expect(r.dados.representante_cpf).toBe("");
    }
  });

  it("sem os campos do representante (empresa antiga) grava os três vazios", () => {
    const r = prepararRepresentanteEmpresa(base);
    expect(r.ok).toBe(true);
    expect(r.dados.representante_nome).toBe("");
    expect(r.dados.representante_cargo).toBe("");
    expect(r.dados.representante_cpf).toBe("");
  });

  it("CPF com dígito verificador errado, incompleto ou repetido → erro", () => {
    for (const cpf of ["529.982.247-24", "529.982.247-2", "111.111.111-11", "5299822472599"]) {
      const r = prepararRepresentanteEmpresa({ ...base, representante_cpf: cpf });
      expect(r).toEqual({ ok: false, erro: ERRO_CPF_REPRESENTANTE });
    }
  });

  it("a mensagem de erro diz o que fazer", () => {
    expect(ERRO_CPF_REPRESENTANTE).toBe(
      "CPF do representante legal inválido. Corrija ou deixe em branco."
    );
  });
});
