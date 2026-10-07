import { describe, it, expect } from "vitest";
import {
  MODALIDADES,
  emiteCertificado,
  modalidadeDoCurso,
  motivoSemCertificado,
  pendenciasParaEmitir,
  pendenciasParaPublicar,
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
// o que impede PUBLICAR e MATRICULAR
const pendencias = (dados) => pendenciasParaPublicar(requisitosDoCurso(dados)).map((r) => r.codigo);
// o que impede EMITIR o certificado
const pendenciasDeEmissao = (dados) =>
  pendenciasParaEmitir(requisitosDoCurso(dados)).map((r) => r.codigo);
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
    // semipresencial (e valor desconhecido) travam publicar, matricular e emitir, como a T8 deixou
    for (const modalidade of ["semipresencial", "inventada"]) {
      expect(pendencias({ curso: { ...curso, modalidade }, aulas, questoes })).toContain(
        "MODALIDADE"
      );
      expect(pendenciasDeEmissao({ curso: { ...curso, modalidade }, aulas, questoes })).toContain(
        "MODALIDADE"
      );
    }
    // EAD (marcado ou ausente) emite, mesmo com NR-35 no nome ou no código
    for (const modalidade of [undefined, "ead"]) {
      const dados = {
        curso: { ...curso, nome: "NR-35", codigo: "NR-35", modalidade },
        aulas,
        questoes,
      };
      expect(pendencias(dados)).toEqual([]);
      expect(pendenciasDeEmissao(dados)).toEqual([]);
    }
  });
  it("D3: curso de apoio publica e aceita matrícula; só a EMISSÃO do certificado é bloqueada", () => {
    const apoio = { curso: { ...curso, nome: "NR-35", modalidade: "apoio" }, aulas, questoes };
    // publicar e matricular: a modalidade não pesa (curso completo não tem pendência nenhuma)
    expect(pendencias(apoio)).toEqual([]);
    // emitir: nunca
    expect(pendenciasDeEmissao(apoio)).toEqual(["MODALIDADE"]);
    const requisito = requisitosDoCurso(apoio).find((r) => r.codigo === "MODALIDADE");
    expect(requisito).toMatchObject({ ok: false, bloqueia: false, bloqueiaEmissao: true });
    // os outros requisitos do curso continuam valendo para o apoio (a D3 só trata da modalidade)
    expect(pendencias({ ...apoio, curso: { ...apoio.curso, instrutor_nome: "" } })).toEqual([
      "INSTRUTOR",
    ]);
  });
  it("só os requisitos 'bloqueia' travam a emissão; os de revisão (TUTOR etc.) nunca travam", () => {
    for (const r of requisitosDoCurso({ curso, aulas, questoes })) {
      expect(typeof r.bloqueiaEmissao).toBe("boolean");
      expect(r.bloqueiaEmissao).toBe(r.bloqueia);
    }
    expect(pendenciasDeEmissao({})).toEqual(pendencias({}));
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

describe("requisito TUTOR (T21, D4): só avisa, e só com um WhatsApp que o servidor aceita", () => {
  // número fictício (o repositório é público)
  const tutor = (valores) =>
    requisitosDoCurso({ curso: { ...curso, ...valores }, aulas, questoes }).find(
      (r) => r.codigo === "TUTOR"
    );
  it("sem telefone, ou com telefone que não dá para enviar, o aviso aparece", () => {
    for (const tutor_telefone of [undefined, null, "", "   ", "abc", "99999", "(11) 9999-000"]) {
      expect(tutor({ tutor_telefone }).ok, String(tutor_telefone)).toBe(false);
    }
    expect(tutor({}).texto).toMatch(/WhatsApp do tutor/);
  });
  it("com telefone válido (com ou sem máscara) o aviso some", () => {
    for (const tutor_telefone of [
      "(11) 99999-0000",
      "11999990000",
      "5511999990000",
      "(11) 3333-0000",
    ]) {
      expect(tutor({ tutor_telefone }).ok, tutor_telefone).toBe(true);
    }
  });
  it("nome e atendimento do tutor são opcionais: sozinhos não tiram o aviso", () => {
    expect(tutor({ tutor_nome: "Tutor teste", tutor_atendimento: "dias úteis" }).ok).toBe(false);
  });
  it("tutor nunca trava publicar, matricular nem emitir (é só aviso)", () => {
    expect(tutor({}).bloqueia).toBe(false);
    expect(tutor({}).bloqueiaEmissao).toBe(false);
    expect(pendencias({ curso, aulas, questoes })).toEqual([]);
    expect(pendenciasDeEmissao({ curso, aulas, questoes })).toEqual([]);
  });
});
