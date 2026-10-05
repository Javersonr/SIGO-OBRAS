import { describe, it, expect } from "vitest";
import { reordenarAulas, matriculasNovas } from "./ead-gestao";

const aula = (id, ordem) => ({ id, ordem });

describe("reordenarAulas", () => {
  it("troca duas aulas vizinhas e só grava as duas que mudaram", () => {
    const r = reordenarAulas([aula("a", 1), aula("b", 2), aula("c", 3)], "b", -1);
    expect(r.ids).toEqual(["b", "a", "c"]);
    expect(r.mudancas).toEqual([
      { id: "b", ordem: 1 },
      { id: "a", ordem: 2 },
    ]);
  });

  it("desce a aula uma posição", () => {
    const r = reordenarAulas([aula("a", 1), aula("b", 2), aula("c", 3)], "b", 1);
    expect(r.ids).toEqual(["a", "c", "b"]);
    expect(r.mudancas).toEqual([
      { id: "c", ordem: 2 },
      { id: "b", ordem: 3 },
    ]);
  });

  it("renumera 1..n quando a lista tem buracos (aula removida antes)", () => {
    const r = reordenarAulas([aula("a", 1), aula("b", 4), aula("c", 9)], "c", -1);
    expect(r.ids).toEqual(["a", "c", "b"]);
    expect(r.mudancas).toEqual([
      { id: "c", ordem: 2 },
      { id: "b", ordem: 3 },
    ]);
  });

  it("desfaz empate de ordem: aulas com a mesma ordem ficam 1..n", () => {
    const r = reordenarAulas([aula("a", 2), aula("b", 2), aula("c", 2)], "c", -1);
    expect(r.ids).toEqual(["a", "c", "b"]);
    // "c" já tem ordem 2, a posição nova: não precisa gravar
    expect(r.mudancas).toEqual([
      { id: "a", ordem: 1 },
      { id: "b", ordem: 3 },
    ]);
  });

  it("trata ordem vazia ou texto como diferente da posição", () => {
    const r = reordenarAulas([aula("a", null), aula("b", "2")], "b", -1);
    expect(r.ids).toEqual(["b", "a"]);
    expect(r.mudancas).toEqual([
      { id: "b", ordem: 1 },
      { id: "a", ordem: 2 },
    ]);
  });

  it("não move a primeira para cima nem a última para baixo", () => {
    const lista = [aula("a", 1), aula("b", 2)];
    expect(reordenarAulas(lista, "a", -1)).toBeNull();
    expect(reordenarAulas(lista, "b", 1)).toBeNull();
  });

  it("recusa aula inexistente, sentido inválido e lista inválida", () => {
    const lista = [aula("a", 1), aula("b", 2)];
    expect(reordenarAulas(lista, "x", 1)).toBeNull();
    expect(reordenarAulas(lista, "a", 0)).toBeNull();
    expect(reordenarAulas(lista, "a", 2)).toBeNull();
    expect(reordenarAulas(lista, "a", 0.5)).toBeNull();
    expect(reordenarAulas(null, "a", 1)).toBeNull();
    expect(reordenarAulas([], "a", 1)).toBeNull();
  });

  it("não altera a lista recebida", () => {
    const lista = [aula("a", 1), aula("b", 2)];
    reordenarAulas(lista, "b", -1);
    expect(lista).toEqual([aula("a", 1), aula("b", 2)]);
  });
});

describe("matriculasNovas", () => {
  const base = { empresaId: "emp", cursoId: "c1" };

  it("monta as matrículas pendentes, todas com o mesmo conjunto de chaves", () => {
    const r = matriculasNovas({ ...base, matriculas: [], funcionarioIds: ["f1", "f2"] });
    expect(r.novas).toEqual([
      { empresa_id: "emp", curso_id: "c1", funcionario_id: "f1", status: "pendente" },
      { empresa_id: "emp", curso_id: "c1", funcionario_id: "f2", status: "pendente" },
    ]);
    expect(r.ignorados).toBe(0);
    expect(new Set(r.novas.map((n) => Object.keys(n).join())).size).toBe(1);
  });

  it("ignora quem já está matriculado no curso e ainda não concluiu", () => {
    const matriculas = [
      { curso_id: "c1", funcionario_id: "f1", status: "pendente" },
      { curso_id: "c1", funcionario_id: "f2", status: "em_andamento" },
    ];
    const r = matriculasNovas({ ...base, matriculas, funcionarioIds: ["f1", "f2", "f3"] });
    expect(r.novas.map((n) => n.funcionario_id)).toEqual(["f3"]);
    expect(r.ignorados).toBe(2);
  });

  it("deixa rematricular quem já concluiu o curso (renovação)", () => {
    const matriculas = [{ curso_id: "c1", funcionario_id: "f1", status: "concluido" }];
    const r = matriculasNovas({ ...base, matriculas, funcionarioIds: ["f1"] });
    expect(r.novas.map((n) => n.funcionario_id)).toEqual(["f1"]);
    expect(r.ignorados).toBe(0);
  });

  it("matrícula em outro curso não conta", () => {
    const matriculas = [{ curso_id: "c2", funcionario_id: "f1", status: "pendente" }];
    const r = matriculasNovas({ ...base, matriculas, funcionarioIds: ["f1"] });
    expect(r.novas).toHaveLength(1);
  });

  it("não repete o funcionário selecionado duas vezes", () => {
    const r = matriculasNovas({ ...base, matriculas: [], funcionarioIds: ["f1", "f1", "f2"] });
    expect(r.novas.map((n) => n.funcionario_id)).toEqual(["f1", "f2"]);
    expect(r.ignorados).toBe(0);
  });

  it("tolera entradas vazias", () => {
    expect(matriculasNovas({ ...base, matriculas: null, funcionarioIds: null })).toEqual({
      novas: [],
      ignorados: 0,
    });
  });
});
