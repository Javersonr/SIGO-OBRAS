import { describe, it, expect } from "vitest";
import {
  diaEmBrasilia,
  somarDias,
  prazoDaMatricula,
  nomeDoFuncionario,
  rotuloDoStatus,
  montarLinhas,
  filtrarLinhas,
  ordenarLinhas,
  resumirLinhas,
  csvDasLinhas,
  COLUNAS_DO_CSV,
  FILTROS_VAZIOS,
} from "./ead-matriculas";
import { selecionarVencimentos } from "./ead-vencimentos";

// Dados sintéticos (nenhum nome, CPF ou id real). "Hoje" fixo: 2026-10-06.
const HOJE = "2026-10-06";

const func = (id, extra = {}) => ({
  id,
  nome_completo: `Funcionario ${id}`,
  ativo: true,
  funcao_nome: "Eletricista",
  ...extra,
});
const curso = (id, extra = {}) => ({ id, nome: `Curso ${id}`, ativo: true, ...extra });
const mat = (id, funcionario_id, curso_id, extra = {}) => ({
  id,
  funcionario_id,
  curso_id,
  status: "pendente",
  created_at: "2026-09-01T12:00:00Z",
  ...extra,
});
const concluida = (id, funcionario_id, curso_id, extra = {}) =>
  mat(id, funcionario_id, curso_id, {
    status: "concluido",
    data_conclusao: "2026-09-10",
    proxima_renovacao: "2026-12-01",
    nota_avaliacao: 90,
    avaliacao_aprovada: true,
    ...extra,
  });
const aula = (id, curso_id) => ({ id, curso_id });
const prog = (matricula_id, aula_id, concluida = true) => ({ matricula_id, aula_id, concluida });
const tent = (matricula_id, numero, nota = 50, extra = {}) => ({
  matricula_id,
  numero,
  nota,
  aprovada: false,
  created_at: `2026-09-0${numero}T12:00:00Z`,
  ...extra,
});

const montar = (dados = {}) =>
  montarLinhas({
    matriculas: [],
    cursos: [],
    funcionarios: [],
    aulas: [],
    progresso: [],
    tentativas: [],
    certificados: [],
    hoje: HOJE,
    ...dados,
  });

describe("diaEmBrasilia", () => {
  it("usa o dia de Brasília, não o de UTC", () => {
    // 2026-09-01T02:00Z = 2026-08-31 23:00 em Brasília
    expect(diaEmBrasilia("2026-09-01T02:00:00Z")).toBe("2026-08-31");
    expect(diaEmBrasilia("2026-09-01T15:00:00Z")).toBe("2026-09-01");
  });

  it("devolve null para valor ausente ou ilegível", () => {
    expect(diaEmBrasilia(null)).toBeNull();
    expect(diaEmBrasilia("")).toBeNull();
    expect(diaEmBrasilia("não é data")).toBeNull();
  });
});

describe("somarDias", () => {
  it("soma dias de calendário, virando o mês e o ano", () => {
    expect(somarDias("2026-10-06", 30)).toBe("2026-11-05");
    expect(somarDias("2026-12-20", 15)).toBe("2027-01-04");
    expect(somarDias("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("devolve null quando a data não vale", () => {
    expect(somarDias("2026-02-30", 1)).toBeNull();
    expect(somarDias(null, 1)).toBeNull();
  });
});

describe("prazoDaMatricula", () => {
  const m = mat("m1", "f1", "c1"); // matriculada em 2026-09-01

  it("sem prazo no curso e sem prazo padrão = sem prazo (o comportamento de antes)", () => {
    expect(prazoDaMatricula({ matricula: m, curso: curso("c1"), hoje: HOJE })).toBeNull();
    expect(
      prazoDaMatricula({ matricula: m, curso: curso("c1"), prazoPadraoDias: null, hoje: HOJE })
    ).toBeNull();
    expect(
      prazoDaMatricula({ matricula: m, curso: curso("c1"), prazoPadraoDias: 0, hoje: HOJE })
    ).toBeNull();
  });

  it("prazo padrão: data da matrícula mais os dias; passou do limite = atrasada", () => {
    const p = prazoDaMatricula({
      matricula: m,
      curso: curso("c1"),
      prazoPadraoDias: 30,
      hoje: HOJE,
    });
    expect(p).toEqual({
      dias: 30,
      limite: "2026-10-01",
      origem: "padrao",
      atrasada: true,
      diasDeAtraso: 5,
    });
  });

  it("no dia do limite ainda não está atrasada", () => {
    const p = prazoDaMatricula({
      matricula: m,
      curso: curso("c1"),
      prazoPadraoDias: 35, // 2026-09-01 + 35 = 2026-10-06
      hoje: HOJE,
    });
    expect(p.limite).toBe("2026-10-06");
    expect(p.atrasada).toBe(false);
    expect(p.diasDeAtraso).toBe(0);
  });

  it("o prazo do curso (prazo_conclusao_dias, da T25) vale mais que o padrão da tela", () => {
    const p = prazoDaMatricula({
      matricula: m,
      curso: curso("c1", { prazo_conclusao_dias: 60 }),
      prazoPadraoDias: 10,
      hoje: HOJE,
    });
    expect(p.origem).toBe("curso");
    expect(p.limite).toBe("2026-10-31");
    expect(p.atrasada).toBe(false);
  });

  it("o prazo do curso vale mesmo sem o padrão da tela", () => {
    const p = prazoDaMatricula({
      matricula: m,
      curso: curso("c1", { prazo_conclusao_dias: 20 }),
      hoje: HOJE,
    });
    expect(p.origem).toBe("curso");
    expect(p.atrasada).toBe(true);
  });

  it("valor que não é um número inteiro positivo de dias é ignorado", () => {
    for (const ruim of [0, -3, 1.5, "abc", NaN, null, undefined]) {
      expect(
        prazoDaMatricula({
          matricula: m,
          curso: curso("c1", { prazo_conclusao_dias: ruim }),
          prazoPadraoDias: ruim,
          hoje: HOJE,
        })
      ).toBeNull();
    }
    // ruim no curso, bom no padrão: cai no padrão
    const p = prazoDaMatricula({
      matricula: m,
      curso: curso("c1", { prazo_conclusao_dias: 0 }),
      prazoPadraoDias: 30,
      hoje: HOJE,
    });
    expect(p.origem).toBe("padrao");
  });

  it("matrícula concluída não tem prazo", () => {
    expect(
      prazoDaMatricula({
        matricula: concluida("m2", "f1", "c1"),
        curso: curso("c1"),
        prazoPadraoDias: 30,
        hoje: HOJE,
      })
    ).toBeNull();
  });

  it("conta a partir do dia de Brasília em que a matrícula foi criada", () => {
    const tarde = mat("m3", "f1", "c1", { created_at: "2026-09-01T02:00:00Z" }); // 31/08 em Brasília
    const p = prazoDaMatricula({
      matricula: tarde,
      curso: curso("c1"),
      prazoPadraoDias: 30,
      hoje: HOJE,
    });
    expect(p.limite).toBe("2026-09-30");
  });

  it("sem data de matrícula não há como calcular", () => {
    expect(
      prazoDaMatricula({
        matricula: mat("m4", "f1", "c1", { created_at: null }),
        curso: curso("c1"),
        prazoPadraoDias: 30,
        hoje: HOJE,
      })
    ).toBeNull();
  });
});

describe("nomeDoFuncionario", () => {
  it("funcionário ativo: o nome", () => {
    expect(nomeDoFuncionario(func("f1", { nome_completo: "Ana Souza" }))).toBe("Ana Souza");
  });

  it("ex-funcionário: o nome com (inativo)", () => {
    expect(nomeDoFuncionario(func("f1", { nome_completo: "Ana Souza", ativo: false }))).toBe(
      "Ana Souza (inativo)"
    );
  });

  it("excluído do cadastro também é inativo", () => {
    expect(
      nomeDoFuncionario(
        func("f1", { nome_completo: "Ana Souza", deleted_at: "2026-09-30T00:00:00Z" })
      )
    ).toBe("Ana Souza (inativo)");
  });

  it("sem cadastro nenhum: travessão", () => {
    expect(nomeDoFuncionario(undefined)).toBe("—");
    expect(nomeDoFuncionario(null)).toBe("—");
  });
});

describe("rotuloDoStatus", () => {
  it("troca o texto técnico por texto de tela", () => {
    expect(rotuloDoStatus("pendente")).toBe("Pendente");
    expect(rotuloDoStatus("em_andamento")).toBe("Em andamento");
    expect(rotuloDoStatus("concluido")).toBe("Concluído");
    expect(rotuloDoStatus("outro_valor")).toBe("outro_valor");
    expect(rotuloDoStatus(undefined)).toBe("—");
  });
});

describe("montarLinhas: andamento da matrícula", () => {
  it("conta as aulas concluídas e o total do curso", () => {
    const [l] = montar({
      matriculas: [mat("m1", "f1", "c1", { status: "em_andamento" })],
      cursos: [curso("c1")],
      funcionarios: [func("f1")],
      aulas: [aula("a1", "c1"), aula("a2", "c1"), aula("a3", "c1"), aula("a9", "c2")],
      progresso: [prog("m1", "a1"), prog("m1", "a2", false), prog("m2", "a3")],
    });
    expect(l.aulasFeitas).toBe(1);
    expect(l.aulasTotal).toBe(3);
    expect(l.percentual).toBe(33);
  });

  it("progresso de aula que já não existe no curso não conta", () => {
    const [l] = montar({
      matriculas: [mat("m1", "f1", "c1", { status: "em_andamento" })],
      cursos: [curso("c1")],
      funcionarios: [func("f1")],
      aulas: [aula("a1", "c1")],
      progresso: [prog("m1", "a1"), prog("m1", "a-removida")],
    });
    expect(l.aulasFeitas).toBe(1);
    expect(l.aulasTotal).toBe(1);
    expect(l.percentual).toBe(100);
  });

  it("andamento ainda não carregado: aulas feitas, percentual e tentativas ficam nulos, não zero", () => {
    const [l] = montar({
      matriculas: [mat("m1", "f1", "c1", { status: "em_andamento" })],
      cursos: [curso("c1")],
      funcionarios: [func("f1")],
      aulas: [aula("a1", "c1"), aula("a2", "c1")],
      andamentoCarregado: false,
    });
    expect(l.aulasTotal).toBe(2);
    expect(l.aulasFeitas).toBeNull();
    expect(l.percentual).toBeNull();
    expect(l.tentativas).toBeNull();
  });

  it('andamento não carregado vira campo em branco no CSV (nunca "0")', () => {
    const linhas = montar({
      matriculas: [mat("m1", "f1", "c1", { status: "em_andamento" })],
      cursos: [curso("c1")],
      funcionarios: [func("f1")],
      aulas: [aula("a1", "c1")],
      andamentoCarregado: false,
    });
    const [, linha] = csvDasLinhas(linhas).split("\r\n");
    const titulos = COLUNAS_DO_CSV.map((c) => c.titulo);
    const campos = linha.split(";");
    expect(campos[titulos.indexOf("Aulas concluídas")]).toBe("");
    expect(campos[titulos.indexOf("Progresso (%)")]).toBe("");
    expect(campos[titulos.indexOf("Tentativas")]).toBe("");
    expect(campos[titulos.indexOf("Total de aulas")]).toBe("1");
  });

  it("curso sem aulas: 0 de 0 e percentual nulo", () => {
    const [l] = montar({
      matriculas: [mat("m1", "f1", "c1")],
      cursos: [curso("c1")],
      funcionarios: [func("f1")],
    });
    expect(l.aulasTotal).toBe(0);
    expect(l.percentual).toBeNull();
  });

  it("nota vem da matrícula; sem ela, da última tentativa; sem nenhuma, nula", () => {
    const base = {
      cursos: [curso("c1")],
      funcionarios: [func("f1")],
    };
    const [a] = montar({
      ...base,
      matriculas: [concluida("m1", "f1", "c1", { nota_avaliacao: "85.5" })],
    });
    expect(a.nota).toBe(85.5);
    expect(a.aprovada).toBe(true);

    const [b] = montar({
      ...base,
      matriculas: [mat("m1", "f1", "c1", { status: "em_andamento" })],
      tentativas: [tent("m1", 1, 40), tent("m1", 2, 60)],
    });
    expect(b.nota).toBe(60);

    const [c] = montar({ ...base, matriculas: [mat("m1", "f1", "c1")] });
    expect(c.nota).toBeNull();
    expect(c.aprovada).toBeNull();
  });

  it("tentativas: quantas já fez e o máximo (limite do curso mais as extras liberadas)", () => {
    const [l] = montar({
      matriculas: [mat("m1", "f1", "c1", { status: "em_andamento", tentativas_extras: 1 })],
      cursos: [curso("c1", { max_tentativas: 3 })],
      funcionarios: [func("f1")],
      tentativas: [tent("m1", 1), tent("m1", 2), tent("m2", 1)],
    });
    expect(l.tentativas).toBe(2);
    expect(l.tentativasMax).toBe(4);
  });

  it("curso sem limite de tentativas: máximo nulo", () => {
    const [l] = montar({
      matriculas: [mat("m1", "f1", "c1")],
      cursos: [curso("c1", { max_tentativas: 0 })],
      funcionarios: [func("f1")],
    });
    expect(l.tentativasMax).toBeNull();
    expect(l.tentativas).toBe(0);
  });
});

describe("montarLinhas: nomes e situação", () => {
  it("ex-funcionário aparece com o nome e (inativo), não como travessão", () => {
    const [l] = montar({
      matriculas: [concluida("m1", "f1", "c1")],
      cursos: [curso("c1")],
      funcionarios: [func("f1", { nome_completo: "Ana Souza", ativo: false })],
    });
    expect(l.funcionarioNome).toBe("Ana Souza (inativo)");
    expect(l.inativo).toBe(true);
    expect(l.podeRenovar).toBe(false);
    expect(l.faixa).toBeNull();
  });

  it("funcionário sem cadastro: travessão", () => {
    const [l] = montar({
      matriculas: [mat("m1", "f-sumiu", "c1")],
      cursos: [curso("c1")],
    });
    expect(l.funcionarioNome).toBe("—");
    expect(l.inativo).toBe(true);
  });

  it("curso removido: diz isso em vez de travessão", () => {
    const [l] = montar({
      matriculas: [mat("m1", "f1", "c-removido")],
      funcionarios: [func("f1")],
    });
    expect(l.cursoNome).toBe("(curso removido)");
    expect(l.curso).toBeUndefined();
  });

  it("matrícula excluída não vira linha", () => {
    const linhas = montar({
      matriculas: [mat("m1", "f1", "c1", { deleted_at: "2026-09-02T00:00:00Z" })],
      cursos: [curso("c1")],
      funcionarios: [func("f1")],
    });
    expect(linhas).toEqual([]);
  });

  it("função e data da matrícula (dia de Brasília)", () => {
    const [l] = montar({
      matriculas: [mat("m1", "f1", "c1", { created_at: "2026-09-01T02:00:00Z" })],
      cursos: [curso("c1")],
      funcionarios: [func("f1", { funcao_nome: "Encarregado" })],
    });
    expect(l.funcaoNome).toBe("Encarregado");
    expect(l.matriculadoEm).toBe("2026-08-31");
  });
});

describe("montarLinhas: certificado e curso de apoio", () => {
  it("certificado emitido, revogado e curso de apoio (não emite)", () => {
    const linhas = montar({
      matriculas: [
        concluida("m1", "f1", "c1"),
        concluida("m2", "f2", "c1"),
        concluida("m3", "f3", "c-apoio", { proxima_renovacao: "2026-12-01" }),
        mat("m4", "f4", "c1"),
      ],
      cursos: [curso("c1"), curso("c-apoio", { modalidade: "apoio" })],
      funcionarios: [func("f1"), func("f2"), func("f3"), func("f4")],
      certificados: [
        { matricula_id: "m1", codigo: "ABC-1" },
        { matricula_id: "m2", codigo: "ABC-2", revogado_em: "2026-10-01T00:00:00Z" },
      ],
    });
    const por = Object.fromEntries(linhas.map((l) => [l.id, l]));
    expect(por.m1.certificadoSituacao).toBe("emitido");
    expect(por.m1.certificadoCodigo).toBe("ABC-1");
    expect(por.m2.certificadoSituacao).toBe("revogado");
    expect(por.m3.certificadoSituacao).toBe("nao_emite");
    expect(por.m3.apoio).toBe(true);
    expect(por.m4.certificadoSituacao).toBe("sem");
  });

  it("curso de apoio não renova: some a data de renovação e o botão", () => {
    const [l] = montar({
      matriculas: [concluida("m1", "f1", "c-apoio", { proxima_renovacao: "2026-12-01" })],
      cursos: [curso("c-apoio", { modalidade: "apoio" })],
      funcionarios: [func("f1")],
    });
    expect(l.renovacao).toBeNull();
    expect(l.podeRenovar).toBe(false);
    expect(l.faixa).toBeNull();
  });
});

describe("montarLinhas: vencimento e renovação", () => {
  it("vencida, a vencer e sem validade", () => {
    const linhas = montar({
      matriculas: [
        concluida("m1", "f1", "c1", { proxima_renovacao: "2026-10-01" }), // venceu há 5 dias
        concluida("m2", "f2", "c1", { proxima_renovacao: "2026-10-26" }), // 20 dias
        concluida("m3", "f3", "c1", { proxima_renovacao: "2027-06-01" }), // além de 90 dias
        concluida("m4", "f4", "c1", { proxima_renovacao: null }), // sem validade
      ],
      cursos: [curso("c1")],
      funcionarios: [func("f1"), func("f2"), func("f3"), func("f4")],
    });
    const por = Object.fromEntries(linhas.map((l) => [l.id, l]));
    expect(por.m1.faixa).toBe("vencido");
    expect(por.m1.dias).toBe(-5);
    expect(por.m2.faixa).toBe("ate30");
    expect(por.m3.faixa).toBeNull();
    expect(por.m3.dias).toBeGreaterThan(90);
    expect(por.m4.faixa).toBeNull();
    expect(por.m4.dias).toBeNull();
  });

  it("matrícula antiga substituída por outra concluída mais nova deixa de ser vencimento e de renovar", () => {
    const linhas = montar({
      matriculas: [
        concluida("antiga", "f1", "c1", {
          proxima_renovacao: "2026-09-01",
          created_at: "2024-09-01T12:00:00Z",
        }),
        concluida("nova", "f1", "c1", {
          proxima_renovacao: "2028-09-01",
          created_at: "2026-09-02T12:00:00Z",
        }),
      ],
      cursos: [curso("c1")],
      funcionarios: [func("f1")],
    });
    const por = Object.fromEntries(linhas.map((l) => [l.id, l]));
    expect(por.antiga.vigente).toBe(false);
    expect(por.antiga.faixa).toBeNull();
    expect(por.antiga.podeRenovar).toBe(false);
    expect(por.antiga.substituida).toBe(true);
    expect(por.nova.substituida).toBe(false);
    expect(por.nova.vigente).toBe(true);
    expect(por.nova.podeRenovar).toBe(true);
  });

  it("com outra matrícula aberta no mesmo curso, a renovação já está em andamento", () => {
    const linhas = montar({
      matriculas: [
        concluida("velha", "f1", "c1", { proxima_renovacao: "2026-10-01" }),
        mat("aberta", "f1", "c1", { created_at: "2026-10-02T12:00:00Z" }),
      ],
      cursos: [curso("c1")],
      funcionarios: [func("f1")],
    });
    const por = Object.fromEntries(linhas.map((l) => [l.id, l]));
    expect(por.velha.renovacaoEmAndamento).toBe(true);
    expect(por.velha.podeRenovar).toBe(false);
    expect(por.aberta.podeRenovar).toBe(false); // não está concluída
  });

  it("matrícula em outro curso não conta como renovação", () => {
    const linhas = montar({
      matriculas: [concluida("m1", "f1", "c1"), mat("m2", "f1", "c2")],
      cursos: [curso("c1"), curso("c2")],
      funcionarios: [func("f1")],
    });
    const l = linhas.find((x) => x.id === "m1");
    expect(l.renovacaoEmAndamento).toBe(false);
    expect(l.podeRenovar).toBe(true);
  });

  it("concluída de curso comum, de funcionário ativo, sem renovação aberta: pode renovar", () => {
    const [l] = montar({
      matriculas: [concluida("m1", "f1", "c1")],
      cursos: [curso("c1")],
      funcionarios: [func("f1")],
    });
    expect(l.podeRenovar).toBe(true);
  });

  it("certificado revogado também pode ser refeito (nova matrícula)", () => {
    const [l] = montar({
      matriculas: [concluida("m1", "f1", "c1")],
      cursos: [curso("c1")],
      funcionarios: [func("f1")],
      certificados: [{ matricula_id: "m1", codigo: "X", revogado_em: "2026-10-01T00:00:00Z" }],
    });
    expect(l.podeRenovar).toBe(true);
  });

  it("matrícula não concluída não renova", () => {
    const [l] = montar({
      matriculas: [mat("m1", "f1", "c1", { status: "em_andamento" })],
      cursos: [curso("c1")],
      funcionarios: [func("f1")],
    });
    expect(l.podeRenovar).toBe(false);
  });

  it("as linhas com faixa são exatamente os itens do painel Vencimentos", () => {
    const dados = {
      matriculas: [
        concluida("a", "f1", "c1", { proxima_renovacao: "2026-10-01" }),
        concluida("b", "f2", "c1", { proxima_renovacao: "2026-11-20" }),
        concluida("c", "f3", "c1", { proxima_renovacao: "2027-08-01" }),
        concluida("d", "f4", "c1", { proxima_renovacao: "2026-10-20" }), // inativo
        concluida("e", "f1", "c2", { proxima_renovacao: "2026-10-30" }), // revogado
        concluida("f", "f2", "c-apoio", { proxima_renovacao: "2026-10-10" }),
        concluida("g", "f5", "c1", {
          proxima_renovacao: "2026-10-10",
          created_at: "2025-01-01T00:00:00Z",
        }),
        concluida("h", "f5", "c1", {
          proxima_renovacao: "2028-10-10",
          created_at: "2026-09-01T00:00:00Z",
        }),
      ],
      cursos: [curso("c1"), curso("c2"), curso("c-apoio", { modalidade: "apoio" })],
      funcionarios: [func("f1"), func("f2"), func("f3"), func("f4", { ativo: false }), func("f5")],
      certificados: [{ matricula_id: "e", codigo: "R", revogado_em: "2026-10-02T00:00:00Z" }],
    };
    const doPainel = selecionarVencimentos({ ...dados, hoje: HOJE }).itens.map(
      (i) => i.matricula.id
    );
    const daTabela = montar(dados)
      .filter((l) => l.faixa)
      .map((l) => l.id);
    expect(daTabela.sort()).toEqual(doPainel.sort());
    expect(daTabela.sort()).toEqual(["a", "b"]);
  });
});

describe("montarLinhas: prazo e atraso", () => {
  it("sem prazo configurado ninguém está atrasado (o comportamento de antes)", () => {
    const [l] = montar({
      matriculas: [mat("m1", "f1", "c1", { created_at: "2025-01-01T12:00:00Z" })],
      cursos: [curso("c1")],
      funcionarios: [func("f1")],
    });
    expect(l.prazo).toBeNull();
    expect(l.atrasada).toBe(false);
  });

  it("com prazo padrão, matrícula aberta além do limite fica atrasada", () => {
    const linhas = montar({
      matriculas: [
        mat("m1", "f1", "c1", { created_at: "2026-08-01T12:00:00Z", status: "em_andamento" }),
        mat("m2", "f2", "c1", { created_at: "2026-10-01T12:00:00Z" }),
        concluida("m3", "f3", "c1", { created_at: "2026-01-01T12:00:00Z" }),
      ],
      cursos: [curso("c1")],
      funcionarios: [func("f1"), func("f2"), func("f3")],
      prazoPadraoDias: 30,
    });
    const por = Object.fromEntries(linhas.map((l) => [l.id, l]));
    expect(por.m1.atrasada).toBe(true);
    expect(por.m1.prazo.limite).toBe("2026-08-31");
    expect(por.m2.atrasada).toBe(false);
    expect(por.m3.atrasada).toBe(false);
    expect(por.m3.prazo).toBeNull();
  });

  it("ex-funcionário nunca conta como atrasado (não há quem cobrar), mas o prazo continua visível", () => {
    const [l] = montar({
      matriculas: [mat("m1", "f1", "c1", { created_at: "2026-01-01T12:00:00Z" })],
      cursos: [curso("c1")],
      funcionarios: [func("f1", { ativo: false })],
      prazoPadraoDias: 30,
    });
    expect(l.prazo.atrasada).toBe(true);
    expect(l.atrasada).toBe(false);
  });
});

describe("filtrarLinhas", () => {
  const linhas = montar({
    matriculas: [
      mat("m1", "f1", "c1", { created_at: "2026-08-01T12:00:00Z" }),
      mat("m2", "f2", "c2", { status: "em_andamento" }),
      concluida("m3", "f3", "c1", { proxima_renovacao: "2026-10-01" }),
      concluida("m4", "f4", "c2", { proxima_renovacao: "2026-10-20" }),
      concluida("m5", "f5", "c1", { proxima_renovacao: "2026-12-10" }),
      concluida("m6", "f6", "c2", { proxima_renovacao: "2027-01-10" }),
      concluida("m7", "f7", "c1", { proxima_renovacao: "2026-10-02" }),
      mat("m8", "f7", "c1", { created_at: "2026-10-03T12:00:00Z" }),
    ],
    cursos: [
      curso("c1", { nome: "NR-10 Básico" }),
      curso("c2", { nome: "NR-35 Altura", codigo: "TTRP-35" }),
    ],
    funcionarios: [
      func("f1", { nome_completo: "José Ângelo", funcao_nome: "Eletricista" }),
      func("f2", { nome_completo: "Maria Silva", funcao_nome: "Encarregado" }),
      func("f3", { nome_completo: "Pedro Lima" }),
      func("f4", { nome_completo: "Carla Dias" }),
      func("f5", { nome_completo: "Rui Costa" }),
      func("f6", { nome_completo: "Sônia Reis" }),
      func("f7", { nome_completo: "Tiago Melo" }),
    ],
    certificados: [{ matricula_id: "m3", codigo: "CERT-XYZ" }],
    prazoPadraoDias: 30,
  });
  const ids = (r) => r.map((l) => l.id).sort();

  it("sem filtro devolve tudo", () => {
    expect(filtrarLinhas(linhas, FILTROS_VAZIOS)).toHaveLength(linhas.length);
    expect(filtrarLinhas(linhas, undefined)).toHaveLength(linhas.length);
  });

  it("busca sem acento e sem diferenciar maiúsculas, por funcionário", () => {
    expect(ids(filtrarLinhas(linhas, { ...FILTROS_VAZIOS, busca: "jose angelo" }))).toEqual(["m1"]);
    expect(ids(filtrarLinhas(linhas, { ...FILTROS_VAZIOS, busca: "SONIA" }))).toEqual(["m6"]);
  });

  it("busca também no curso, na função e no código do certificado", () => {
    expect(ids(filtrarLinhas(linhas, { ...FILTROS_VAZIOS, busca: "altura" }))).toEqual([
      "m2",
      "m4",
      "m6",
    ]);
    expect(ids(filtrarLinhas(linhas, { ...FILTROS_VAZIOS, busca: "encarregado" }))).toEqual(["m2"]);
    expect(ids(filtrarLinhas(linhas, { ...FILTROS_VAZIOS, busca: "cert-xyz" }))).toEqual(["m3"]);
  });

  it("vários termos: todos precisam aparecer", () => {
    expect(ids(filtrarLinhas(linhas, { ...FILTROS_VAZIOS, busca: "maria altura" }))).toEqual([
      "m2",
    ]);
    expect(ids(filtrarLinhas(linhas, { ...FILTROS_VAZIOS, busca: "maria nr-10" }))).toEqual([]);
  });

  it("por curso", () => {
    expect(ids(filtrarLinhas(linhas, { ...FILTROS_VAZIOS, cursoId: "c2" }))).toEqual([
      "m2",
      "m4",
      "m6",
    ]);
  });

  it("por status, incluindo atrasadas", () => {
    expect(ids(filtrarLinhas(linhas, { ...FILTROS_VAZIOS, status: "pendente" }))).toEqual([
      "m1",
      "m8",
    ]);
    expect(ids(filtrarLinhas(linhas, { ...FILTROS_VAZIOS, status: "em_andamento" }))).toEqual([
      "m2",
    ]);
    expect(ids(filtrarLinhas(linhas, { ...FILTROS_VAZIOS, status: "concluido" }))).toEqual([
      "m3",
      "m4",
      "m5",
      "m6",
      "m7",
    ]);
    // m1 (01/08 + 30 dias = 31/08) está atrasada; m2 foi criada em 01/09 (limite 01/10): também
    expect(ids(filtrarLinhas(linhas, { ...FILTROS_VAZIOS, status: "atrasada" }))).toEqual([
      "m1",
      "m2",
    ]);
  });

  it("por vencimento", () => {
    expect(ids(filtrarLinhas(linhas, { ...FILTROS_VAZIOS, vencimento: "vencido" }))).toEqual([
      "m3",
      "m7",
    ]);
    expect(ids(filtrarLinhas(linhas, { ...FILTROS_VAZIOS, vencimento: "ate30" }))).toEqual(["m4"]);
    expect(ids(filtrarLinhas(linhas, { ...FILTROS_VAZIOS, vencimento: "ate60" }))).toEqual([]);
    expect(ids(filtrarLinhas(linhas, { ...FILTROS_VAZIOS, vencimento: "ate90" }))).toEqual(["m5"]);
  });

  it("sem nova matrícula: vencida ou a vencer em 90 dias e sem outra matrícula aberta no curso", () => {
    // m7 venceu em 02/10, mas m8 (aberta) já é a renovação dele; m6 está além de 90 dias
    expect(ids(filtrarLinhas(linhas, { ...FILTROS_VAZIOS, vencimento: "sem_renovacao" }))).toEqual([
      "m3",
      "m4",
      "m5",
    ]);
  });

  it("combina filtros (todos precisam valer)", () => {
    const r = filtrarLinhas(linhas, {
      ...FILTROS_VAZIOS,
      cursoId: "c1",
      status: "concluido",
      busca: "pedro",
    });
    expect(ids(r)).toEqual(["m3"]);
  });
});

describe("ordenarLinhas", () => {
  const linhas = montar({
    matriculas: [
      concluida("m1", "f1", "c1", { nota_avaliacao: 80, created_at: "2026-09-03T12:00:00Z" }),
      mat("m2", "f2", "c1", { created_at: "2026-09-01T12:00:00Z" }),
      concluida("m3", "f3", "c1", { nota_avaliacao: 95, created_at: "2026-09-02T12:00:00Z" }),
    ],
    cursos: [curso("c1")],
    funcionarios: [
      func("f1", { nome_completo: "Bruno" }),
      func("f2", { nome_completo: "Ágata" }),
      func("f3", { nome_completo: "Carla" }),
    ],
  });
  const ids = (r) => r.map((l) => l.id);

  it("por nome, com acento na ordem certa, crescente e decrescente", () => {
    expect(ids(ordenarLinhas(linhas, { campo: "funcionario", direcao: "asc" }))).toEqual([
      "m2",
      "m1",
      "m3",
    ]);
    expect(ids(ordenarLinhas(linhas, { campo: "funcionario", direcao: "desc" }))).toEqual([
      "m3",
      "m1",
      "m2",
    ]);
  });

  it("por número, deixando os vazios sempre no fim (nas duas direções)", () => {
    expect(ids(ordenarLinhas(linhas, { campo: "nota", direcao: "desc" }))).toEqual([
      "m3",
      "m1",
      "m2",
    ]);
    expect(ids(ordenarLinhas(linhas, { campo: "nota", direcao: "asc" }))).toEqual([
      "m1",
      "m3",
      "m2",
    ]);
  });

  it("por data de matrícula", () => {
    expect(ids(ordenarLinhas(linhas, { campo: "matriculadoEm", direcao: "desc" }))).toEqual([
      "m1",
      "m3",
      "m2",
    ]);
  });

  it("por status segue a ordem do curso: pendente, em andamento, concluído", () => {
    expect(ids(ordenarLinhas(linhas, { campo: "status", direcao: "asc" }))[0]).toBe("m2");
  });

  it("não altera a lista original e campo desconhecido mantém a ordem", () => {
    const copia = [...linhas];
    ordenarLinhas(linhas, { campo: "funcionario", direcao: "asc" });
    expect(linhas).toEqual(copia);
    expect(ids(ordenarLinhas(linhas, { campo: "naoExiste", direcao: "asc" }))).toEqual(ids(linhas));
    expect(ids(ordenarLinhas(linhas, undefined))).toEqual(ids(linhas));
  });

  it("empate desempata por nome e depois por curso, sem mudar a cada chamada", () => {
    const iguais = montar({
      matriculas: [mat("m1", "f1", "c2"), mat("m2", "f1", "c1"), mat("m3", "f2", "c1")],
      cursos: [curso("c1", { nome: "A" }), curso("c2", { nome: "B" })],
      funcionarios: [func("f1", { nome_completo: "Zé" }), func("f2", { nome_completo: "Ana" })],
    });
    const r = ordenarLinhas(iguais, { campo: "status", direcao: "asc" });
    expect(ids(r)).toEqual(["m3", "m2", "m1"]);
  });
});

describe("resumirLinhas", () => {
  it("conta por status e as atrasadas", () => {
    const linhas = montar({
      matriculas: [
        mat("m1", "f1", "c1", { created_at: "2026-01-01T12:00:00Z" }),
        mat("m2", "f2", "c1", { status: "em_andamento", created_at: "2026-01-01T12:00:00Z" }),
        concluida("m3", "f3", "c1"),
      ],
      cursos: [curso("c1")],
      funcionarios: [func("f1"), func("f2"), func("f3")],
      prazoPadraoDias: 30,
    });
    expect(resumirLinhas(linhas)).toEqual({
      total: 3,
      pendente: 1,
      em_andamento: 1,
      concluido: 1,
      atrasadas: 2,
    });
  });

  it("lista vazia", () => {
    expect(resumirLinhas([])).toEqual({
      total: 0,
      pendente: 0,
      em_andamento: 0,
      concluido: 0,
      atrasadas: 0,
    });
  });
});

describe("csvDasLinhas", () => {
  const dados = {
    matriculas: [
      concluida("m1", "f1", "c1", {
        created_at: "2026-09-01T12:00:00Z",
        data_conclusao: "2026-09-10",
        proxima_renovacao: "2026-12-01",
        nota_avaliacao: 87.5,
      }),
      mat("m2", "f2", "c1", { status: "em_andamento", created_at: "2026-09-05T12:00:00Z" }),
    ],
    cursos: [curso("c1", { nome: "NR-10 Básico", codigo: "NR10", max_tentativas: 3 })],
    funcionarios: [
      func("f1", { nome_completo: "Ana Souza", funcao_nome: "Eletricista" }),
      func("f2", { nome_completo: "Beto; Lima", ativo: false, funcao_nome: "Auxiliar" }),
    ],
    aulas: [aula("a1", "c1"), aula("a2", "c1")],
    progresso: [prog("m1", "a1"), prog("m1", "a2"), prog("m2", "a1")],
    tentativas: [tent("m1", 1, 87.5, { aprovada: true })],
    certificados: [{ matricula_id: "m1", codigo: "ABC-123" }],
    prazoPadraoDias: 30,
  };
  const linhas = ordenarLinhas(montar(dados), { campo: "funcionario", direcao: "asc" });

  it("começa pelo cabeçalho, separa por ponto e vírgula e usa CRLF", () => {
    const csv = csvDasLinhas(linhas);
    const linhasDoTexto = csv.split("\r\n");
    expect(linhasDoTexto[0]).toBe(COLUNAS_DO_CSV.map((c) => c.titulo).join(";"));
    expect(linhasDoTexto).toHaveLength(3);
  });

  it("escreve datas em dd/mm/aaaa, nota com vírgula e as aulas x de y", () => {
    const [, ana] = csvDasLinhas(linhas).split("\r\n");
    const campos = ana.split(";");
    const titulos = COLUNAS_DO_CSV.map((c) => c.titulo);
    const campo = (titulo) => campos[titulos.indexOf(titulo)];
    expect(campo("Funcionário")).toBe("Ana Souza");
    expect(campo("Curso")).toBe("NR-10 Básico");
    expect(campo("Status")).toBe("Concluído");
    expect(campo("Aulas concluídas")).toBe("2");
    expect(campo("Total de aulas")).toBe("2");
    expect(campo("Nota")).toBe("87,5");
    expect(campo("Tentativas")).toBe("1");
    expect(campo("Matriculado em")).toBe("01/09/2026");
    expect(campo("Concluído em")).toBe("10/09/2026");
    expect(campo("Renovar até")).toBe("01/12/2026");
    expect(campo("Certificado")).toBe("ABC-123");
  });

  it("campo com ponto e vírgula vai entre aspas e o ex-funcionário leva (inativo)", () => {
    const [, , beto] = csvDasLinhas(linhas).split("\r\n");
    expect(beto.startsWith('"Beto; Lima (inativo)";')).toBe(true);
  });

  it("aspas dentro do campo são dobradas", () => {
    const csv = csvDasLinhas(
      montar({
        ...dados,
        funcionarios: [func("f1", { nome_completo: 'Ana "Nina" Souza' }), func("f2")],
      })
    );
    expect(csv).toContain('"Ana ""Nina"" Souza"');
  });

  it("texto que o Excel leria como fórmula ganha um apóstrofo na frente", () => {
    const csv = csvDasLinhas(
      montar({
        ...dados,
        cursos: [curso("c1", { nome: "=HYPERLINK(1)" })],
        funcionarios: [
          func("f1", { nome_completo: "+55 Fulano" }),
          func("f2", { nome_completo: "@x" }),
        ],
      })
    );
    expect(csv).toContain("'=HYPERLINK(1)");
    expect(csv).toContain("'+55 Fulano");
    expect(csv).toContain("'@x");
    expect(csv).not.toMatch(/(^|;|\r\n)[=+@]/);
  });

  it("lista vazia: só o cabeçalho", () => {
    expect(csvDasLinhas([]).split("\r\n")).toHaveLength(1);
  });

  it("curso sem nota nem tentativa deixa os campos em branco, não 'null'", () => {
    const csv = csvDasLinhas(
      montar({
        matriculas: [mat("m1", "f1", "c1")],
        cursos: [curso("c1")],
        funcionarios: [func("f1")],
      })
    );
    expect(csv).not.toMatch(/null|undefined|NaN/);
  });
});

describe("tipo do treinamento na tabela e no CSV (T23)", () => {
  const linhasComTipo = () =>
    montar({
      matriculas: [
        mat("m1", "f1", "c1", { tipo: "inicial", motivo_eventual: null }),
        mat("m2", "f2", "c1", { tipo: "periodico", motivo_eventual: null }),
        mat("m3", "f3", "c1", { tipo: "eventual", motivo_eventual: "Mudança de procedimento" }),
        // matrícula lida antes da migração 0142 (sem a coluna)
        mat("m4", "f4", "c1"),
      ],
      cursos: [curso("c1")],
      funcionarios: [func("f1"), func("f2"), func("f3"), func("f4")],
    });
  const porId = (linhas, id) => linhas.find((l) => l.id === id);

  it("cada linha traz o texto do tipo (o motivo no eventual); sem a coluna, em branco", () => {
    const linhas = linhasComTipo();
    expect(porId(linhas, "m1").tipoTexto).toBe("Inicial");
    expect(porId(linhas, "m2").tipoTexto).toBe("Periódico");
    expect(porId(linhas, "m3").tipoTexto).toBe("Eventual: Mudança de procedimento");
    expect(porId(linhas, "m4").tipoTexto).toBe("");
  });

  it("o CSV tem a coluna 'Tipo de treinamento' logo depois da modalidade", () => {
    const titulos = COLUNAS_DO_CSV.map((c) => c.titulo);
    expect(titulos.indexOf("Tipo de treinamento")).toBe(titulos.indexOf("Modalidade") + 1);
    const [, ...corpo] = csvDasLinhas(
      ordenarLinhas(linhasComTipo(), { campo: "funcionario", direcao: "asc" })
    ).split("\r\n");
    const coluna = titulos.indexOf("Tipo de treinamento");
    expect(corpo.map((l) => l.split(";")[coluna])).toEqual([
      "Inicial",
      "Periódico",
      "Eventual: Mudança de procedimento",
      "",
    ]);
  });
});
