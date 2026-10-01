import { describe, it, expect } from "vitest";
import { modelosDeTreinamento, dadosCursoDoModelo, modelosSemCurso } from "./treinamento-catalogo";

describe("cadastro central de treinamentos", () => {
  it("não oferece cópias de função, excluídos ou inativos como modelos", () => {
    expect(
      modelosDeTreinamento([
        { id: "modelo" },
        { id: "copia", funcao_id: "funcao" },
        { id: "inativo", ativo: false },
        { id: "excluido", deleted_at: "data" },
        { id: "vinculado", modelo_treinamento_id: "modelo" },
      ]).map((t) => t.id)
    ).toEqual(["modelo"]);
  });
  it("mantém a identidade mesmo com nomes iguais e não sobrescreve aulas nem avaliação", () => {
    const modelo = {
      id: "modelo-b",
      nome: "Curso",
      codigo: "B",
      carga_horaria: 20,
      validade_meses: 0,
    };
    expect(dadosCursoDoModelo(modelo)).toMatchObject({
      modelo_treinamento_id: "modelo-b",
      carga_horaria_horas: 20,
      validade_meses: 0,
    });
    expect(dadosCursoDoModelo(modelo)).not.toHaveProperty("ativo");
    expect(dadosCursoDoModelo(modelo)).not.toHaveProperty("nota_minima");
  });
  it("oferece modelos ainda sem curso por vínculo, sem deduzir por nome", () => {
    expect(
      modelosSemCurso(
        [
          { id: "a", nome: "Curso" },
          { id: "b", nome: "Curso" },
        ],
        [{ modelo_treinamento_id: "a" }]
      ).map((t) => t.id)
    ).toEqual(["b"]);
  });
});
