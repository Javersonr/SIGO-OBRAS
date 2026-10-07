import { describe, it, expect } from "vitest";
import {
  modelosDeTreinamento,
  dadosCursoDoModelo,
  modelosSemCurso,
  faltaModeloCentral,
  TEXTO_CURSO_SEM_VINCULO,
  mostrarAvisoDeCursoSemVinculo,
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

describe("aviso do curso sem vínculo com o cadastro central (C4)", () => {
  it("o texto vale para qualquer curso sem vínculo, não só para os criados antes do cadastro central", () => {
    expect(TEXTO_CURSO_SEM_VINCULO).not.toMatch(/criado antes/i);
    expect(TEXTO_CURSO_SEM_VINCULO).toMatch(/sem (o )?vínculo|não está vinculado/i);
    expect(TEXTO_CURSO_SEM_VINCULO).toMatch(/editáveis/);
  });
  it("aparece para curso gravado sem vínculo, seja qual for a origem (tela ou tools/ead-sync-cursos.py)", () => {
    const semVinculo = { id: "c1", modelo_treinamento_id: null };
    expect(mostrarAvisoDeCursoSemVinculo(semVinculo, semVinculo)).toBe(true);
    // curso criado depois do cadastro central, por fora da tela: mesmo caso
    const sincronizado = { id: "c2", nome: "Curso importado", created_at: "2026-10-01T00:00:00Z" };
    expect(mostrarAvisoDeCursoSemVinculo(sincronizado, sincronizado)).toBe(true);
  });
  it("não aparece para curso novo (sem id), vinculado, ou com vínculo escolhido no formulário", () => {
    expect(mostrarAvisoDeCursoSemVinculo({ nome: "Novo" }, null)).toBe(false);
    expect(
      mostrarAvisoDeCursoSemVinculo({ id: "c3", modelo_treinamento_id: "m1" }, { id: "c3" })
    ).toBe(false);
    // o RH acabou de escolher o treinamento do cadastro central: some o aviso
    expect(
      mostrarAvisoDeCursoSemVinculo({ id: "c4", modelo_treinamento_id: "m1" }, { id: "c4" })
    ).toBe(false);
    // ligado no banco, mesmo que o formulário tenha soltado o vínculo (salvar é barrado por faltaModeloCentral)
    expect(
      mostrarAvisoDeCursoSemVinculo(
        { id: "c5", modelo_treinamento_id: null },
        { id: "c5", modelo_treinamento_id: "m1" }
      )
    ).toBe(false);
    expect(mostrarAvisoDeCursoSemVinculo(null, null)).toBe(false);
  });
  it("o aviso e a regra de salvar dizem a mesma coisa (A6): sem o curso na lista carregada, nenhum dos dois libera", () => {
    // curso com id que não está na lista carregada (gravado ausente): salvar exige o vínculo,
    // então o aviso não pode dizer que "pode ser salvo sem o vínculo"
    const form = { id: "c6", modelo_treinamento_id: null };
    expect(faltaModeloCentral(form, undefined)).toBe(true);
    expect(mostrarAvisoDeCursoSemVinculo(form, undefined)).toBe(false);
    expect(mostrarAvisoDeCursoSemVinculo(form, null)).toBe(false);
    // curso gravado sem vínculo: salvar liberado e o aviso aparece
    const gravado = { id: "c6", modelo_treinamento_id: null };
    expect(faltaModeloCentral(form, gravado)).toBe(false);
    expect(mostrarAvisoDeCursoSemVinculo(form, gravado)).toBe(true);
    // para qualquer combinação: o aviso só aparece quando salvar sem vínculo está liberado
    for (const f of [
      null,
      {},
      { id: "x" },
      { id: "x", modelo_treinamento_id: "m" },
      { nome: "N" },
    ]) {
      for (const g of [undefined, null, {}, { id: "x" }, { id: "x", modelo_treinamento_id: "m" }]) {
        if (mostrarAvisoDeCursoSemVinculo(f, g)) expect(faltaModeloCentral(f, g)).toBe(false);
      }
    }
  });
});
