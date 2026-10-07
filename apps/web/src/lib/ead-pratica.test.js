import { describe, it, expect } from "vitest";
import {
  LIMITES_DA_SESSAO,
  RESULTADOS_DA_PRATICA,
  avisoDaCargaDaSessao,
  cargasDoCursoParaGravar,
  descricaoDaSessao,
  matriculasParaASessao,
  participanteParaGravar,
  podeEmitirSemipresencial,
  resumoDaSessao,
  rotuloDoResultado,
  sessaoEmBranco,
  sessaoNoFuturo,
  situacaoDaPratica,
  validarArquivoDaLista,
  validarSessao,
} from "./ead-pratica";

// Dados sintéticos (o repositório é público): nomes, locais e ids de mentira.
const HOJE = "2026-10-07";
const CURSO = "curso-semi";
const sessao = (extra = {}) => ({
  id: "s1",
  curso_id: CURSO,
  data: "2026-10-05",
  hora_inicio: "08:00:00",
  hora_fim: "12:00:00",
  carga_horas: 4,
  local: "Pátio de treinamento de teste",
  instrutor_nome: "Instrutor de Teste",
  deleted_at: null,
  ...extra,
});
const participacao = (extra = {}) => ({
  sessao_id: "s1",
  matricula_id: "m1",
  presente: true,
  resultado: "satisfatorio",
  deleted_at: null,
  ...extra,
});

describe("podeEmitirSemipresencial (T12): a regra do servidor, espelhada", () => {
  const entrada = (sessoes, participacoes) => ({
    matriculaId: "m1",
    cursoId: CURSO,
    sessoes,
    participacoes,
    hoje: HOJE,
  });
  it("presente e satisfatório numa sessão viva do curso, já realizada, emite", () => {
    expect(podeEmitirSemipresencial(entrada([sessao()], [participacao()]))).toBe(true);
  });
  it("ausente, pendente, insatisfatório, sessão apagada, futura ou de outro curso não emitem", () => {
    for (const [sessoes, participacoes] of [
      [[sessao()], []],
      [[sessao()], [participacao({ presente: false })]],
      [[sessao()], [participacao({ resultado: "pendente" })]],
      [[sessao()], [participacao({ resultado: "insatisfatorio" })]],
      [[sessao({ deleted_at: "2026-10-06T00:00:00Z" })], [participacao()]],
      [[sessao()], [participacao({ deleted_at: "2026-10-06T00:00:00Z" })]],
      [[sessao({ data: "2026-10-08" })], [participacao()]],
      [[sessao({ curso_id: "outro" })], [participacao()]],
    ]) {
      expect(podeEmitirSemipresencial(entrada(sessoes, participacoes))).toBe(false);
    }
  });
  it("situacaoDaPratica devolve a sessão que valeu", () => {
    const r = situacaoDaPratica(entrada([sessao()], [participacao()]));
    expect(r.situacao).toBe("realizada");
    expect(r.sessao.id).toBe("s1");
  });
});

describe("validarSessao: o formulário da sessão prática", () => {
  const form = (extra = {}) => ({
    data: "2026-10-05",
    hora_inicio: "08:00",
    hora_fim: "12:00",
    carga_horas: "4",
    local: "  Pátio de treinamento de teste  ",
    instrutor_nome: " Instrutor de Teste ",
    instrutor_qualificacao: "",
    observacoes: "",
    ...extra,
  });
  it("aceita a sessão completa e devolve o que vai para o banco (aparado, carga em número)", () => {
    const r = validarSessao(form());
    expect(r.ok).toBe(true);
    expect(r.dados).toEqual({
      data: "2026-10-05",
      hora_inicio: "08:00",
      hora_fim: "12:00",
      carga_horas: 4,
      local: "Pátio de treinamento de teste",
      instrutor_nome: "Instrutor de Teste",
      instrutor_qualificacao: null,
      observacoes: null,
    });
    expect(validarSessao(form({ carga_horas: "3,5" })).dados.carga_horas).toBe(3.5);
  });
  it("exige data, horário de início e de fim, carga, local e instrutor", () => {
    expect(validarSessao(form({ data: "" })).erro).toMatch(/data/i);
    expect(validarSessao(form({ data: "05/10/2026" })).erro).toMatch(/data/i);
    expect(validarSessao(form({ hora_inicio: "" })).erro).toMatch(/horário/i);
    expect(validarSessao(form({ hora_fim: "25:00" })).erro).toMatch(/horário/i);
    expect(validarSessao(form({ carga_horas: "" })).erro).toMatch(/carga/i);
    expect(validarSessao(form({ carga_horas: "0" })).erro).toMatch(/carga/i);
    expect(validarSessao(form({ local: "  " })).erro).toMatch(/local/i);
    expect(validarSessao(form({ instrutor_nome: "" })).erro).toMatch(/instrutor/i);
  });
  it("o fim vem depois do início, e a carga cabe no horário", () => {
    expect(validarSessao(form({ hora_inicio: "12:00", hora_fim: "08:00" })).erro).toMatch(
      /termina/i
    );
    expect(validarSessao(form({ hora_inicio: "08:00", hora_fim: "08:00" })).erro).toMatch(
      /termina/i
    );
    // 08:00 às 12:00 são 4 h: carga de 5 h não cabe; 4 h e 3,5 h (com intervalo) cabem
    expect(validarSessao(form({ carga_horas: "5" })).erro).toMatch(/cabe/i);
    expect(validarSessao(form({ carga_horas: "4" })).ok).toBe(true);
    expect(validarSessao(form({ carga_horas: "3.5" })).ok).toBe(true);
  });
  it("respeita os limites de tamanho (o local cabe na linha do certificado)", () => {
    expect(LIMITES_DA_SESSAO.local).toBe(120);
    expect(validarSessao(form({ local: "x".repeat(121) })).erro).toMatch(/local/i);
    expect(validarSessao(form({ local: "x".repeat(120) })).ok).toBe(true);
    expect(validarSessao(form({ local: "ab" })).erro).toMatch(/local/i);
    expect(validarSessao(form({ instrutor_nome: "x".repeat(121) })).erro).toMatch(/instrutor/i);
    expect(validarSessao(form({ instrutor_qualificacao: "x".repeat(201) })).erro).toMatch(
      /qualificação/i
    );
    expect(validarSessao(form({ observacoes: "x".repeat(1001) })).erro).toMatch(/observações/i);
  });
});

describe("sessão em branco, aviso de carga e descrição", () => {
  const curso = {
    id: CURSO,
    carga_pratica_horas: 4,
    instrutor_nome: "Instrutor de Teste",
    instrutor_qualificacao: "Eng. de Teste",
  };
  it("a sessão nova já vem com hoje, a carga prática e o instrutor do curso", () => {
    expect(sessaoEmBranco(curso, HOJE)).toEqual({
      data: HOJE,
      hora_inicio: "",
      hora_fim: "",
      carga_horas: "4",
      local: "",
      instrutor_nome: "Instrutor de Teste",
      instrutor_qualificacao: "Eng. de Teste",
      observacoes: "",
    });
    expect(sessaoEmBranco({}, HOJE).carga_horas).toBe("");
  });
  it("avisa quando a carga da sessão é menor que a carga prática do curso", () => {
    expect(avisoDaCargaDaSessao({ carga_horas: 2 }, curso)).toMatch(/2 h.*4 h/);
    expect(avisoDaCargaDaSessao({ carga_horas: 4 }, curso)).toBeNull();
    expect(avisoDaCargaDaSessao({ carga_horas: 6 }, curso)).toBeNull();
    expect(avisoDaCargaDaSessao({ carga_horas: 2 }, {})).toBeNull();
  });
  it("descreve a sessão numa linha (dia, horário, carga e local)", () => {
    expect(descricaoDaSessao(sessao())).toBe(
      "05/10/2026 · 08:00 às 12:00 · 4 h · Pátio de treinamento de teste"
    );
    expect(descricaoDaSessao(sessao({ hora_inicio: null, hora_fim: null }))).toBe(
      "05/10/2026 · 4 h · Pátio de treinamento de teste"
    );
  });
  it("sessão marcada para depois de hoje ainda não recebe presença", () => {
    expect(sessaoNoFuturo(sessao({ data: "2026-10-08" }), HOJE)).toBe(true);
    expect(sessaoNoFuturo(sessao({ data: HOJE }), HOJE)).toBe(false);
    expect(sessaoNoFuturo(sessao(), HOJE)).toBe(false);
  });
});

describe("participantes da sessão", () => {
  const funcionarios = new Map([
    ["f1", { id: "f1", nome_completo: "Bruno Teste", ativo: true }],
    ["f2", { id: "f2", nome_completo: "Ana Teste", ativo: true }],
    ["f3", { id: "f3", nome_completo: "Carlos Inativo", ativo: false }],
    ["f4", { id: "f4", nome_completo: "Dora Excluída", deleted_at: "2026-09-01" }],
  ]);
  const matriculas = [
    { id: "m1", curso_id: CURSO, funcionario_id: "f1" },
    { id: "m2", curso_id: CURSO, funcionario_id: "f2" },
    { id: "m3", curso_id: CURSO, funcionario_id: "f3" },
    { id: "m4", curso_id: CURSO, funcionario_id: "f4" },
    { id: "m5", curso_id: "outro", funcionario_id: "f1" },
    { id: "m6", curso_id: CURSO, funcionario_id: "f2", deleted_at: "2026-09-01" },
  ];
  it("lista as matrículas vivas do curso, de funcionário ativo, que ainda não estão na sessão", () => {
    const r = matriculasParaASessao({
      cursoId: CURSO,
      matriculas,
      participantes: [participacao({ matricula_id: "m1" })],
      funcionarios,
    });
    expect(r.map((x) => x.matricula.id)).toEqual(["m2"]);
    expect(r[0].funcionario.nome_completo).toBe("Ana Teste");
    // participante apagado volta a poder ser incluído; a lista sai em ordem de nome
    const todos = matriculasParaASessao({
      cursoId: CURSO,
      matriculas,
      participantes: [participacao({ matricula_id: "m1", deleted_at: "2026-10-06" })],
      funcionarios,
    });
    expect(todos.map((x) => x.matricula.id)).toEqual(["m2", "m1"]);
  });
  it("resumo: participantes, presentes e resultados", () => {
    expect(
      resumoDaSessao([
        participacao(),
        participacao({ matricula_id: "m2", resultado: "insatisfatorio" }),
        participacao({ matricula_id: "m3", presente: false, resultado: "pendente" }),
        participacao({ matricula_id: "m4", deleted_at: "2026-10-06" }),
      ])
    ).toEqual({ total: 3, presentes: 2, satisfatorios: 1, insatisfatorios: 1, pendentes: 1 });
  });
  it("participanteParaGravar: satisfatório exige presença; a observação tem limite", () => {
    expect(participanteParaGravar({ presente: true, resultado: "satisfatorio" })).toEqual({
      ok: true,
      dados: { presente: true, resultado: "satisfatorio", observacao: null },
    });
    expect(participanteParaGravar({ presente: false, resultado: "satisfatorio" }).erro).toMatch(
      /presente/i
    );
    expect(participanteParaGravar({ presente: false, resultado: "insatisfatorio" }).ok).toBe(true);
    expect(participanteParaGravar({ presente: true, resultado: "outro" }).erro).toMatch(
      /resultado/i
    );
    expect(
      participanteParaGravar({ presente: true, resultado: "pendente", observacao: " ok " }).dados
        .observacao
    ).toBe("ok");
    expect(
      participanteParaGravar({ presente: true, resultado: "pendente", observacao: "x".repeat(301) })
        .erro
    ).toMatch(/observação/i);
  });
  it("rótulos dos resultados", () => {
    expect(RESULTADOS_DA_PRATICA.map((r) => r.valor)).toEqual([
      "pendente",
      "satisfatorio",
      "insatisfatorio",
    ]);
    expect(rotuloDoResultado("satisfatorio")).toBe("Satisfatório");
    expect(rotuloDoResultado("insatisfatorio")).toBe("Insatisfatório");
    expect(rotuloDoResultado("pendente")).toBe("Pendente");
    expect(rotuloDoResultado(undefined)).toBe("Pendente");
  });
});

describe("cargas do curso semipresencial para gravar (T12)", () => {
  it("só o semipresencial grava a carga teórica e a prática (texto do formulário vira número)", () => {
    expect(
      cargasDoCursoParaGravar({
        modalidade: "semipresencial",
        carga_teorica_horas: "8",
        carga_pratica_horas: "32,5",
      })
    ).toEqual({ carga_teorica_horas: 8, carga_pratica_horas: 32.5 });
  });
  it("vazio, zero ou inválido vira null (o banco recusa zero)", () => {
    expect(
      cargasDoCursoParaGravar({
        modalidade: "semipresencial",
        carga_teorica_horas: "",
        carga_pratica_horas: "0",
      })
    ).toEqual({ carga_teorica_horas: null, carga_pratica_horas: null });
  });
  it("EAD e apoio limpam as cargas que o curso gravado tinha; sem nada gravado, não mandam as colunas", () => {
    const gravado = { carga_teorica_horas: 8, carga_pratica_horas: 32 };
    expect(
      cargasDoCursoParaGravar(
        { modalidade: "ead", carga_teorica_horas: 8, carga_pratica_horas: 32 },
        gravado
      )
    ).toEqual({ carga_teorica_horas: null, carga_pratica_horas: null });
    expect(
      cargasDoCursoParaGravar(
        { modalidade: "apoio" },
        { carga_teorica_horas: null, carga_pratica_horas: 4 }
      )
    ).toEqual({ carga_teorica_horas: null, carga_pratica_horas: null });
    // curso que nunca teve (ou lido antes da migração 0143, sem as colunas): salvar não toca nelas
    expect(cargasDoCursoParaGravar({ carga_teorica_horas: 8 })).toEqual({});
    expect(
      cargasDoCursoParaGravar({ modalidade: "ead" }, { nome: "Curso sem as colunas" })
    ).toEqual({});
    expect(
      cargasDoCursoParaGravar(
        { modalidade: "ead" },
        { carga_teorica_horas: null, carga_pratica_horas: null }
      )
    ).toEqual({});
  });
});

describe("lista de presença assinada (arquivo)", () => {
  it("aceita PDF, PNG e JPEG até 15 MB", () => {
    for (const type of ["application/pdf", "image/png", "image/jpeg"]) {
      expect(validarArquivoDaLista({ type, size: 1024 }).ok).toBe(true);
    }
    expect(validarArquivoDaLista({ type: "application/pdf", size: 16 * 1024 * 1024 }).erro).toMatch(
      /15 MB/
    );
    expect(validarArquivoDaLista({ type: "image/heic", size: 1024 }).erro).toMatch(/PDF/);
    expect(validarArquivoDaLista(null).ok).toBe(false);
  });
});
