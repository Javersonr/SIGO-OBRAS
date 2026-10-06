import { describe, it, expect } from "vitest";
import {
  MODALIDADES,
  emiteCertificado,
  modalidadeDoCurso,
  motivoSemCertificado,
  requisitosDoCurso,
  tempoObrigatorioSeg,
} from "./ead-requisitos";
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
  it("exclui as aulas apagadas do tempo obrigatório", () => {
    expect(tempoObrigatorioSeg([{ duracao_seg: 3600, deleted_at: "2026-10-01" }])).toBe(0);
  });
  it("a modalidade do curso decide se emite certificado; o nome NR-35 não decide mais", () => {
    for (const modalidade of ["apoio", "semipresencial"]) {
      expect(pendencias({ curso: { ...curso, modalidade }, aulas, questoes })).toContain(
        "MODALIDADE"
      );
    }
    // EAD (marcado ou ausente) emite, mesmo com NR-35 no nome ou no código
    for (const modalidade of [undefined, "ead"]) {
      expect(
        pendencias({
          curso: { ...curso, nome: "NR-35", codigo: "NR-35", modalidade },
          aulas,
          questoes,
        })
      ).toEqual([]);
    }
    expect(
      pendencias({ curso: { ...curso, nome: "NR-35", modalidade: "apoio" }, aulas, questoes })
    ).toEqual(["MODALIDADE"]);
  });
  it("o requisito de modalidade explica o motivo de cada uma", () => {
    const texto = (modalidade) =>
      requisitosDoCurso({ curso: { ...curso, modalidade }, aulas, questoes }).find(
        (r) => r.codigo === "MODALIDADE"
      ).texto;
    expect(texto("apoio")).toBe(motivoSemCertificado("apoio"));
    expect(texto("apoio")).toMatch(/não emite certificado/);
    expect(texto("semipresencial")).toMatch(/prática presencial/);
  });
  it("modalidadeDoCurso: ausente ou vazia vale EAD; emiteCertificado só para EAD", () => {
    expect(modalidadeDoCurso({})).toBe("ead");
    expect(modalidadeDoCurso({ modalidade: "" })).toBe("ead");
    expect(modalidadeDoCurso({ modalidade: "apoio" })).toBe("apoio");
    expect(emiteCertificado("ead")).toBe(true);
    expect(emiteCertificado("apoio")).toBe(false);
    expect(emiteCertificado("semipresencial")).toBe(false);
    expect(MODALIDADES).toEqual(["ead", "semipresencial", "apoio"]);
  });
});
