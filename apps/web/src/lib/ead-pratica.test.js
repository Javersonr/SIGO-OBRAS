import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  LIMITES_DA_SESSAO,
  RESULTADOS_DA_PRATICA,
  avisoDaCargaDaSessao,
  cargasDoCursoParaGravar,
  descricaoDaSessao,
  linhaDoParticipante,
  linhaMudou,
  matriculasParaASessao,
  mesclarRascunhos,
  rotuloDaMatriculaDoCandidato,
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
    expect(r.sessoes.map((x) => x.id)).toEqual(["s1"]);
  });

  describe("a carga da prática: a soma das sessões satisfatórias tem de chegar à carga do curso (I2)", () => {
    // 8 h num dia de 9 h de relógio (a carga de uma sessão nunca passa do tempo do horário: 0143)
    const dia = (id, data, extra = {}) =>
      sessao({ id, data, carga_horas: 8, hora_fim: "17:00:00", ...extra });
    const com = (sessoes, participacoes, cargaPraticaHoras = 16) => ({
      ...entrada(sessoes, participacoes),
      cargaPraticaHoras,
    });
    const doDia = (id, extra = {}) => participacao({ sessao_id: id, ...extra });

    it("uma sessão de 8 h não libera o certificado de 16 h; as duas liberam, em ordem", () => {
      const a = dia("a", "2026-10-05");
      const b = dia("b", "2026-10-06");
      const so1 = situacaoDaPratica(com([a], [doDia("a")]));
      expect(so1.situacao).toBe("parcial");
      expect([so1.cumpridaHoras, so1.exigidaHoras]).toEqual([8, 16]);
      expect(podeEmitirSemipresencial(com([a], [doDia("a")]))).toBe(false);
      const dois = situacaoDaPratica(com([b, a], [doDia("a"), doDia("b")]));
      expect(dois.situacao).toBe("realizada");
      expect(dois.sessoes.map((x) => x.id)).toEqual(["a", "b"]);
      expect(dois.sessao.id).toBe("b");
    });
    it("uma sessão de 16 h basta, e as sessões que sobram ficam de fora", () => {
      expect(
        podeEmitirSemipresencial(
          com(
            [
              dia("a", "2026-10-05", {
                carga_horas: 16,
                hora_inicio: "06:00:00",
                hora_fim: "23:00:00",
              }),
            ],
            [doDia("a")]
          )
        )
      ).toBe(true);
      const tres = situacaoDaPratica(
        com(
          [dia("a", "2026-10-05"), dia("b", "2026-10-06"), dia("c", "2026-10-07")],
          [doDia("a"), doDia("b"), doDia("c")]
        )
      );
      expect(tres.sessoes.map((x) => x.id)).toEqual(["a", "b"]);
      expect(tres.cumpridaHoras).toBe(24);
    });
    it("ausente, insatisfatório, pendente, apagado e sessão futura não contam para a soma", () => {
      const a = dia("a", "2026-10-05");
      const b = dia("b", "2026-10-06");
      for (const segunda of [
        doDia("b", { presente: false, resultado: "pendente" }),
        doDia("b", { resultado: "insatisfatorio" }),
        doDia("b", { resultado: "pendente" }),
        doDia("b", { deleted_at: "2026-10-06T10:00:00Z" }),
      ]) {
        expect(podeEmitirSemipresencial(com([a, b], [doDia("a"), segunda]))).toBe(false);
      }
      expect(
        podeEmitirSemipresencial(com([a, dia("f", "2026-10-20")], [doDia("a"), doDia("f")]))
      ).toBe(false);
    });
    it("sem a carga do curso vale uma sessão satisfatória; frações somam em centésimos", () => {
      const a = dia("a", "2026-10-05", { carga_horas: 2 });
      for (const carga of [null, 0, "", "abc"]) {
        expect(podeEmitirSemipresencial(com([a], [doDia("a")], carga))).toBe(true);
      }
      const x = dia("x", "2026-10-05", { carga_horas: 0.1 });
      const y = dia("y", "2026-10-06", { carga_horas: "0.2" });
      expect(podeEmitirSemipresencial(com([x, y], [doDia("x"), doDia("y")], 0.3))).toBe(true);
      expect(podeEmitirSemipresencial(com([x, y], [doDia("x"), doDia("y")], 0.31))).toBe(false);
    });
    it("reprovado por último é 'insatisfatoria' mesmo com horas cumpridas; com sessão marcada, 'agendada'", () => {
      const a = dia("a", "2026-10-03");
      const b = dia("b", "2026-10-04");
      expect(
        situacaoDaPratica(com([a, b], [doDia("a"), doDia("b", { resultado: "insatisfatorio" })]))
          .situacao
      ).toBe("insatisfatoria");
      const proxima = dia("p", "2026-10-20");
      const agendada = situacaoDaPratica(
        com([a, proxima], [doDia("a"), doDia("p", { presente: false, resultado: "pendente" })])
      );
      expect(agendada.situacao).toBe("agendada");
      expect(agendada.cumpridaHoras).toBe(8);
    });
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
    // e explica que o certificado só sai quando a soma das sessões do aluno chega a essa carga
    expect(avisoDaCargaDaSessao({ carga_horas: 2 }, curso)).toMatch(/soma das sessões/);
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

describe("mesclarRascunhos (A6, T12 M6): recarregar a lista não apaga o que o RH digitou e não salvou", () => {
  const gravada = (extra = {}) => ({
    presente: false,
    resultado: "pendente",
    observacao: "",
    ...extra,
  });

  it("a linha que o RH mexeu e não salvou fica; a que ele não mexeu recebe o que veio do banco", () => {
    const antigas = { p1: gravada(), p2: gravada() };
    const novas = {
      p1: gravada(),
      p2: gravada({ presente: true, resultado: "satisfatorio" }), // outra pessoa lançou a presença do p2
    };
    const rascunhos = {
      p1: gravada({ presente: true, observacao: "chegou atrasado" }),
      p2: gravada(),
    };
    const r = mesclarRascunhos({ rascunhos, antigas, novas });
    expect(r.p1).toEqual(rascunhos.p1);
    expect(r.p2).toEqual(novas.p2);
  });

  it("participante novo entra com o que está gravado; o que saiu da sessão some", () => {
    const antigas = { p1: gravada(), p2: gravada() };
    const novas = { p1: gravada(), p3: gravada({ presente: true }) };
    const rascunhos = { p1: gravada(), p2: gravada({ presente: true }) };
    const r = mesclarRascunhos({ rascunhos, antigas, novas });
    expect(Object.keys(r).sort()).toEqual(["p1", "p3"]);
    expect(r.p3).toEqual(novas.p3);
  });

  it("depois de salvar a linha, o rascunho e o gravado coincidem: nada sobra de diferente", () => {
    const antigas = { p1: gravada() };
    const rascunho = gravada({ presente: true, resultado: "satisfatorio" });
    const novas = { p1: rascunho };
    expect(mesclarRascunhos({ rascunhos: { p1: rascunho }, antigas, novas })).toEqual(novas);
  });

  it("entradas vazias ou nulas não derrubam", () => {
    expect(mesclarRascunhos()).toEqual({});
    expect(mesclarRascunhos({ rascunhos: null, antigas: null, novas: { p1: gravada() } })).toEqual({
      p1: gravada(),
    });
  });

  it("linhaDoParticipante e linhaMudou são a comparação que a tela usa", () => {
    expect(
      linhaDoParticipante({ presente: true, resultado: "satisfatorio", observacao: "ok" })
    ).toEqual({
      presente: true,
      resultado: "satisfatorio",
      observacao: "ok",
    });
    expect(linhaDoParticipante({})).toEqual(gravada());
    expect(linhaDoParticipante(null)).toEqual(gravada());
    expect(linhaMudou(gravada(), gravada())).toBe(false);
    expect(linhaMudou(gravada(), gravada({ observacao: "x" }))).toBe(true);
    expect(linhaMudou(gravada(), gravada({ resultado: "insatisfatorio" }))).toBe(true);
  });
});

describe("rotuloDaMatriculaDoCandidato (A6, T12 N3): a matrícula certa na lista da sessão", () => {
  it("diz o dia da matrícula (em Brasília) e a situação, para separar a antiga, concluída, da de renovação", () => {
    expect(
      rotuloDaMatriculaDoCandidato({ created_at: "2026-10-06T02:30:00Z", status: "concluido" })
    ).toBe("matrícula de 05/10/2026, concluída");
    expect(
      rotuloDaMatriculaDoCandidato({ created_at: "2026-10-06T15:00:00Z", status: "em_andamento" })
    ).toBe("matrícula de 06/10/2026, em andamento");
    expect(
      rotuloDaMatriculaDoCandidato({ created_at: "2026-10-06T15:00:00Z", status: "pendente" })
    ).toBe("matrícula de 06/10/2026, pendente");
  });

  it("matrícula sem data ou com situação desconhecida não quebra a lista", () => {
    expect(rotuloDaMatriculaDoCandidato({ status: "pendente" })).toBe("matrícula pendente");
    expect(rotuloDaMatriculaDoCandidato({ created_at: "2026-10-06T15:00:00Z" })).toBe(
      "matrícula de 06/10/2026"
    );
    expect(rotuloDaMatriculaDoCandidato(null)).toBe("");
  });

  it("o diálogo mostra o rótulo ao lado do nome de cada candidato", () => {
    const dialogo = readFileSync(
      new URL("../components/seguranca/PresencaSessaoDialog.jsx", import.meta.url),
      "utf8"
    );
    expect(dialogo).toContain("rotuloDaMatriculaDoCandidato(c.matricula)");
  });
});
