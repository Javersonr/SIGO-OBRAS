import { describe, it, expect } from "vitest";
import { requisitosDoCurso, tempoObrigatorioSeg } from "./ead-requisitos";
const curso = {
  nome: "Curso teste",
  carga_horaria_horas: 1,
  instrutor_nome: "Instrutor teste",
  responsavel_tecnico_nome: "RT teste",
};
const aulas = [{ tipo: "texto", conteudo_texto: "Texto teste", duracao_seg: 3600 }];
const questoes = Array.from({ length: 5 }, () => ({}));
const pendencias = (dados) =>
  requisitosDoCurso(dados)
    .filter((r) => r.bloqueia && !r.ok)
    .map((r) => r.codigo);
describe("requisitos dos cursos", () => {
  it("permite uma hora de conteúdo com uma hora de carga", () =>
    expect(pendencias({ curso, aulas, questoes })).toEqual([]));
  it("bloqueia carga de quarenta horas com duas horas de conteúdo", () =>
    expect(
      pendencias({
        curso: { ...curso, carga_horaria_horas: 40 },
        aulas: [{ ...aulas[0], duracao_seg: 7200 }],
        questoes,
      })
    ).toContain("LASTRO"));
  it("bloqueia curso vazio, sem duração, quatro questões ou sem instrutor", () => {
    expect(pendencias({})).toContain("AULAS");
    expect(pendencias({ curso, aulas: [{ ...aulas[0], duracao_seg: 0 }], questoes })).toContain(
      "CONTEUDO"
    );
    expect(pendencias({ curso, aulas, questoes: questoes.slice(1) })).toContain("QUESTOES");
    expect(pendencias({ curso: { ...curso, instrutor_nome: "" }, aulas, questoes })).toContain(
      "INSTRUTOR"
    );
  });
  it("exclui aulas apagadas e impede emissão de apoio e NR-35", () => {
    expect(tempoObrigatorioSeg([{ duracao_seg: 3600, deleted_at: "2026-10-01" }])).toBe(0);
    expect(pendencias({ curso: { ...curso, modalidade: "apoio" }, aulas, questoes })).toContain(
      "MODALIDADE"
    );
    expect(pendencias({ curso: { ...curso, nome: "NR-35" }, aulas, questoes })).toContain(
      "MODALIDADE"
    );
  });
});
