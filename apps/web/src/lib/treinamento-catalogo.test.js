import { describe, it, expect } from "vitest";
import {
  modelosDeTreinamento,
  dadosCursoDoModelo,
  modelosSemCurso,
  faltaModeloCentral,
} from "./treinamento-catalogo";

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
  describe("vínculo com o cadastro central ao salvar o curso (C4)", () => {
    const legado = { id: "c1", nome: "Curso antigo", modelo_treinamento_id: null };
    it("curso novo exige o vínculo", () => {
      expect(faltaModeloCentral({ nome: "Novo", rascunho: "r1" }, null)).toBe(true);
      expect(faltaModeloCentral({ nome: "Novo", modelo_treinamento_id: null }, undefined)).toBe(
        true
      );
    });
    it("curso novo com o vínculo escolhido passa", () => {
      expect(faltaModeloCentral({ modelo_treinamento_id: "m1" }, null)).toBe(false);
    });
    it("curso antigo, gravado sem vínculo, pode ser salvo sem ele", () => {
      expect(faltaModeloCentral({ ...legado }, legado)).toBe(false);
      expect(faltaModeloCentral({ ...legado, nome: "Nome corrigido" }, legado)).toBe(false);
      // sem a chave (curso lido de antes da 0131)
      expect(faltaModeloCentral({ id: "c2", nome: "x" }, { id: "c2", nome: "x" })).toBe(false);
    });
    it("curso antigo que escolhe um treinamento também passa", () => {
      expect(faltaModeloCentral({ ...legado, modelo_treinamento_id: "m1" }, legado)).toBe(false);
    });
    it("curso já ligado ao cadastro central não pode ser desligado ao salvar", () => {
      const ligado = { id: "c3", modelo_treinamento_id: "m1" };
      expect(faltaModeloCentral({ ...ligado, modelo_treinamento_id: null }, ligado)).toBe(true);
      expect(faltaModeloCentral({ ...ligado }, ligado)).toBe(false);
    });
    it("dados de um curso que não é o gravado não liberam o salvamento sem vínculo", () => {
      // sem registro gravado (null), mesmo com id no formulário, o vínculo é exigido
      expect(faltaModeloCentral({ id: "c9", modelo_treinamento_id: null }, null)).toBe(true);
    });
  });
});
