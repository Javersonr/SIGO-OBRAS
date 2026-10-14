import { describe, it, expect } from "vitest";
import {
  chaveDoTitulo,
  MODELOS_PADRAO,
  modelosDaEmpresa,
  validarModelo,
} from "./declaracoes-modelos";

describe("modelos de declaração (tela)", () => {
  it("chaveDoTitulo: minúsculas, sem acento, até 40", () => {
    expect(chaveDoTitulo("Declaração de Visita Técnica")).toBe("declaracao_de_visita_tecnica");
    expect(chaveDoTitulo("  !!  ")).toBe("");
    expect(chaveDoTitulo("a".repeat(80)).length).toBe(40);
  });
  it("validarModelo: título, texto e chave única entre os modelos próprios", () => {
    expect(
      validarModelo({ chave: "me_epp", titulo: "ME/EPP", texto: "Texto {empresa}" }, [])
    ).toEqual({
      ok: true,
      erros: [],
      dados: { chave: "me_epp", titulo: "ME/EPP", texto: "Texto {empresa}", ativo: true },
    });
    expect(validarModelo({ chave: "", titulo: " ", texto: "" }, []).erros).toEqual([
      "Informe o título do modelo",
      "Escreva o texto da declaração",
    ]);
    expect(validarModelo({ chave: "nova", titulo: "Nova", texto: "x" }, ["nova"]).erros).toEqual([
      "Já existe um modelo com este título",
    ]);
    expect(
      validarModelo({ chave: "x1", titulo: "X", texto: "{porte} {empresa}" }, []).erros
    ).toEqual(["Variável desconhecida no texto: {porte}"]);
  });
  it("validarModelo: a chave calculada do título segue o CHECK do banco (letra inicial, 2 a 60)", () => {
    const aviso = "O título deve começar com uma letra e ter ao menos 2 caracteres";
    expect(validarModelo({ chave: "", titulo: "1ª visita", texto: "x" }, []).erros).toEqual([
      aviso,
    ]);
    expect(validarModelo({ chave: "", titulo: "X", texto: "x" }, []).erros).toEqual([aviso]);
    expect(validarModelo({ chave: "", titulo: "!!!", texto: "x" }, []).erros).toEqual([
      "Use letras no título",
    ]);
    const ok = validarModelo({ chave: "", titulo: "Visita técnica", texto: "x" }, []);
    expect(ok.ok).toBe(true);
    expect(ok.dados.chave).toBe("visita_tecnica");
  });
  it("modelosDaEmpresa devolve os seis padrão sem linhas", () => {
    expect(modelosDaEmpresa([])).toEqual(MODELOS_PADRAO.map((m) => ({ ...m })));
  });
});
