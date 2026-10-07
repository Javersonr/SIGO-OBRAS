import { describe, it, expect } from "vitest";
import { marcaDoProjeto } from "./ead-projeto-marca";
import {
  MODALIDADES,
  TEXTO_PDF_DO_PROJETO_DESATUALIZADO,
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

describe("requisito PROJETO (T25): só avisa, e só some com o PDF do projeto E a validação do RT, com o PDF em dia", () => {
  const projeto = (valores) =>
    requisitosDoCurso({ curso: { ...curso, ...valores }, aulas, questoes }).find(
      (r) => r.codigo === "PROJETO"
    );
  const PDF = "treinamentos/empresa/2026/10/projeto.pdf";
  // o projeto validado e o PDF gerado depois dele: a marca gravada com o PDF é a dos campos de hoje
  const validado = {
    objetivo_geral: "Objetivo de teste",
    projeto_validado_em: "2026-10-01",
    projeto_validado_por: "RT Teste",
    proxima_revisao: "2028-10-01",
  };
  const comPdfEmDia = (valores) => ({
    ...valores,
    projeto_pedagogico_ref: PDF,
    projeto_pdf_marca: marcaDoProjeto(valores),
  });
  it("sem nada, só com o PDF ou só com a validação, o aviso aparece", () => {
    expect(projeto({}).ok).toBe(false);
    expect(projeto({ projeto_pedagogico_ref: PDF }).ok).toBe(false);
    expect(projeto({ projeto_validado_em: "2026-10-01" }).ok).toBe(false);
    expect(projeto({ projeto_pedagogico_ref: "", projeto_validado_em: "2026-10-01" }).ok).toBe(
      false
    );
    // PDF gerado em dia, mas sem validação
    expect(projeto(comPdfEmDia({ objetivo_geral: "Objetivo de teste" })).ok).toBe(false);
  });
  it("com o PDF em dia com o projeto e a data da validação, o aviso some", () => {
    expect(projeto(comPdfEmDia(validado)).ok).toBe(true);
  });
  it("PDF gerado ANTES da validação deixa o PROJETO pendente, e o texto manda gerar de novo", () => {
    // o RH gera o PDF para o RT ler (ele diz "ainda não foi validado") e depois só registra a validação
    const semValidacao = { objetivo_geral: "Objetivo de teste" };
    const pdfAnterior = { ...comPdfEmDia(semValidacao), ...validado };
    expect(projeto(pdfAnterior).ok).toBe(false);
    expect(projeto(pdfAnterior).texto).toBe(TEXTO_PDF_DO_PROJETO_DESATUALIZADO);
    expect(projeto(pdfAnterior).texto).toMatch(/desatualizado/);
    // gerar o PDF de novo (marca nova) resolve
    expect(projeto({ ...pdfAnterior, projeto_pdf_marca: marcaDoProjeto(pdfAnterior) }).ok).toBe(
      true
    );
  });
  it("texto mudado depois de gerar o PDF validado também deixa pendente", () => {
    const pdf = comPdfEmDia(validado);
    expect(projeto({ ...pdf, publico_alvo: "Público acrescentado depois do PDF" }).ok).toBe(false);
    expect(projeto({ ...pdf, projeto_validado_em: "2026-10-02" }).ok).toBe(false);
    expect(projeto({ ...pdf, proxima_revisao: "2029-10-01" }).ok).toBe(false);
  });
  it("PDF sem marca (anexado antes desta regra) fica pendente", () => {
    expect(projeto({ ...validado, projeto_pedagogico_ref: PDF }).ok).toBe(false);
    expect(projeto({ ...validado, projeto_pedagogico_ref: PDF, projeto_pdf_marca: "" }).ok).toBe(
      false
    );
  });
  it("o texto manda gerar o PDF e registrar a validação", () => {
    expect(projeto({}).texto).toMatch(/projeto pedagógico/i);
    expect(projeto({}).texto).toMatch(/validação/i);
    // sem validação o texto é o de sempre, mesmo com PDF antigo
    expect(projeto({ projeto_pedagogico_ref: PDF }).texto).toBe(projeto({}).texto);
  });
  it("é só aviso: nunca trava publicar, matricular nem emitir (vira bloqueio só por decisão do Javerson)", () => {
    expect(projeto({}).bloqueia).toBe(false);
    expect(projeto({}).bloqueiaEmissao).toBe(false);
    expect(pendencias({ curso, aulas, questoes })).toEqual([]);
    expect(pendenciasDeEmissao({ curso, aulas, questoes })).toEqual([]);
  });
});
