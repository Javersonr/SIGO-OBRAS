import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  EVENTOS_DO_RH,
  EVENTOS_FORA_DA_JANELA,
  csvDaAtividade,
  desdeDaConsulta,
  diaDeBrasilia,
  diaInicialDoPeriodo,
  ehAtividadeDoAluno,
  filtrarAtividade,
  horaDeBrasilia,
  janelasPorAlunoEDia,
  montarLinhasDeAtividade,
  resumirAtividade,
  textoDaDeclaracao,
  textoDaJanela,
} from "./ead-atividade-diaria";

/**
 * Janela de atividade por aluno e dia (T35; NR-1, Anexo II, 4.4): o primeiro e o último evento de SERVIDOR de cada
 * aluno em cada dia de Brasília, e se ele declarou o ambiente e o horário antes de estudar. Só dados fictícios.
 */
const ev = (evento, created_at, extra = {}) => ({
  evento,
  created_at,
  origem: "servidor",
  funcionario_id: "f1",
  matricula_id: null,
  detalhe: null,
  ...extra,
});

describe("datas de Brasília", () => {
  it("o dia muda à meia-noite de Brasília (03:00 UTC), não à do UTC", () => {
    expect(diaDeBrasilia("2026-10-07T02:59:59Z")).toBe("2026-10-06");
    expect(diaDeBrasilia("2026-10-07T03:00:00Z")).toBe("2026-10-07");
    expect(diaDeBrasilia("2026-10-08T02:59:59Z")).toBe("2026-10-07");
    expect(diaDeBrasilia("2026-10-07T12:00:00.123456+00:00")).toBe("2026-10-07");
    expect(diaDeBrasilia("ontem")).toBeNull();
    expect(diaDeBrasilia(null)).toBeNull();
  });

  it("a hora é a de Brasília", () => {
    expect(horaDeBrasilia("2026-10-07T11:03:00Z")).toBe("08:03");
    expect(horaDeBrasilia("2026-10-07T03:00:00Z")).toBe("00:00");
    expect(horaDeBrasilia("x")).toBe("");
  });

  it("o período de N dias termina hoje: 7 dias a partir de 07/10 começa em 01/10", () => {
    expect(diaInicialDoPeriodo(7, "2026-10-07")).toBe("2026-10-01");
    expect(diaInicialDoPeriodo(1, "2026-10-07")).toBe("2026-10-07");
    expect(diaInicialDoPeriodo(30, "2026-03-05")).toBe("2026-02-04");
  });

  it("a consulta começa 24 h antes da meia-noite UTC do dia inicial (cobre o fuso; a tela corta depois)", () => {
    expect(desdeDaConsulta("2026-10-01")).toBe("2026-09-30T00:00:00.000Z");
  });
});

describe("quais eventos contam para a janela do aluno", () => {
  it("só os de SERVIDOR e que são do aluno: sem o navegador, o RH e a senha errada", () => {
    expect(ehAtividadeDoAluno(ev("login", "2026-10-07T12:00:00Z"))).toBe(true);
    expect(ehAtividadeDoAluno(ev("aula_concluida", "2026-10-07T12:00:00Z"))).toBe(true);
    expect(ehAtividadeDoAluno(ev("declaracao_ambiente", "2026-10-07T12:00:00Z"))).toBe(true);
    // o navegador relata, o servidor só carimba: não é "evento de servidor"
    expect(ehAtividadeDoAluno(ev("play", "2026-10-07T12:00:00Z", { origem: "navegador" }))).toBe(
      false
    );
    // sem origem (linha de antes da migração 0135) também não se afirma
    expect(ehAtividadeDoAluno(ev("login", "2026-10-07T12:00:00Z", { origem: undefined }))).toBe(
      false
    );
    // ações do RH sobre o aluno não são atividade dele
    for (const rh of EVENTOS_DO_RH) {
      expect(ehAtividadeDoAluno(ev(rh, "2026-10-07T12:00:00Z")), rh).toBe(false);
    }
    // senha errada pode ser de outra pessoa
    expect(ehAtividadeDoAluno(ev("login_falha", "2026-10-07T12:00:00Z"))).toBe(false);
    expect(ehAtividadeDoAluno(null)).toBe(false);
  });

  it("a lista de eventos do RH é a que as funções do RH realmente gravam (se mudar lá, muda aqui)", () => {
    const acesso = readFileSync(
      new URL("../../../../supabase/functions/funcionario-acesso/index.ts", import.meta.url),
      "utf8"
    );
    const compartilhado = readFileSync(
      new URL("../../../../supabase/functions/_shared/portal-funcionario.ts", import.meta.url),
      "utf8"
    );
    const gravados = new Set();
    for (const m of acesso.matchAll(/\bevento\(([^)]*)\)/g)) {
      for (const s of m[1].matchAll(/"([a-z_]+)"/g)) gravados.add(s[1]);
    }
    // os que a função grava por constante (EVENTO_TENTATIVA_LIBERADA, EVENTO_CERTIFICADO_REVOGADO)
    for (const m of acesso.matchAll(/\bevento:\s*(EVENTO_[A-Z_]+)\b/g)) {
      const valor = new RegExp(`export const ${m[1]} = "([a-z_]+)"`).exec(compartilhado)?.[1];
      if (valor) gravados.add(valor);
    }
    // sem estes a leitura do código teria falhado em silêncio e o teste passaria vazio
    expect(gravados.size).toBeGreaterThanOrEqual(6);
    expect(gravados).toContain("tentativa_liberada");
    expect(gravados).toContain("certificado_revogado");
    for (const nome of gravados) expect(EVENTOS_DO_RH, nome).toContain(nome);
    expect(EVENTOS_FORA_DA_JANELA).toContain("login_falha");
  });
});

describe("janelasPorAlunoEDia", () => {
  it("o primeiro e o último evento de servidor de cada aluno em cada dia de Brasília", () => {
    const linhas = janelasPorAlunoEDia([
      ev("login", "2026-10-07T11:00:00Z"), // 08:00
      ev("aula_concluida", "2026-10-07T13:30:00Z", { matricula_id: "m1" }), // 10:30
      ev("logout", "2026-10-07T14:45:00Z"), // 11:45
      // outro dia
      ev("login", "2026-10-08T17:00:00Z"), // 14:00 do dia 08
      // outro aluno, no mesmo dia
      ev("login", "2026-10-07T12:00:00Z", { funcionario_id: "f2" }),
    ]);
    expect(linhas).toHaveLength(3);
    const f1dia7 = linhas.find((l) => l.funcionarioId === "f1" && l.dia === "2026-10-07");
    expect(f1dia7).toMatchObject({
      primeiroEm: "2026-10-07T11:00:00Z",
      ultimoEm: "2026-10-07T14:45:00Z",
      minutos: 225,
      eventos: 3,
    });
    const f1dia8 = linhas.find((l) => l.funcionarioId === "f1" && l.dia === "2026-10-08");
    expect(f1dia8).toMatchObject({ minutos: 0, eventos: 1 });
  });

  it("independe da ordem em que os eventos chegam", () => {
    const eventos = [
      ev("logout", "2026-10-07T14:45:00Z"),
      ev("login", "2026-10-07T11:00:00Z"),
      ev("aula_concluida", "2026-10-07T13:30:00Z", { matricula_id: "m1" }),
    ];
    const [linha] = janelasPorAlunoEDia(eventos);
    expect(linha.primeiroEm).toBe("2026-10-07T11:00:00Z");
    expect(linha.ultimoEm).toBe("2026-10-07T14:45:00Z");
  });

  it("evento do navegador, do RH, senha errada e data ilegível não entram na janela", () => {
    const linhas = janelasPorAlunoEDia([
      ev("login", "2026-10-07T11:00:00Z"),
      ev("play", "2026-10-07T20:00:00Z", { origem: "navegador" }),
      ev("tentativa_liberada", "2026-10-07T22:00:00Z", { matricula_id: "m1" }),
      ev("login_falha", "2026-10-07T23:00:00Z"),
      ev("aula_concluida", "ontem", { matricula_id: "m1" }),
    ]);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ eventos: 1, minutos: 0, ultimoEm: "2026-10-07T11:00:00Z" });
  });

  it("23h59 e 00:00 de Brasília são dias diferentes", () => {
    const linhas = janelasPorAlunoEDia([
      ev("login", "2026-10-07T02:59:59Z"),
      ev("logout", "2026-10-07T03:00:00Z"),
    ]);
    expect(linhas.map((l) => l.dia).sort()).toEqual(["2026-10-06", "2026-10-07"]);
  });

  it("`desde` corta os dias de antes do período (a consulta traz 24 h a mais por causa do fuso)", () => {
    const linhas = janelasPorAlunoEDia(
      [ev("login", "2026-09-30T20:00:00Z"), ev("login", "2026-10-01T12:00:00Z")],
      { desde: "2026-10-01" }
    );
    expect(linhas.map((l) => l.dia)).toEqual(["2026-10-01"]);
  });

  it("declarou: guarda a versão, se foi o texto padrão e a hora de cada declaração do dia", () => {
    const [linha] = janelasPorAlunoEDia([
      ev("login", "2026-10-07T11:00:00Z"),
      ev("declaracao_ambiente", "2026-10-07T11:05:00Z", {
        matricula_id: "m1",
        detalhe: { versao: 2, texto_padrao: false },
      }),
      ev("aula_concluida", "2026-10-07T12:00:00Z", { matricula_id: "m1" }),
    ]);
    expect(linha.declaracoes).toEqual([
      { matriculaId: "m1", versao: 2, textoPadrao: false, em: "2026-10-07T11:05:00Z" },
    ]);
    expect(linha.estudou).toBe(true);
    expect(linha.semDeclaracao).toBe(0);
  });

  it("estudou sem declarar: conta quantos cursos ficaram sem declaração no dia", () => {
    const [linha] = janelasPorAlunoEDia([
      ev("login", "2026-10-07T11:00:00Z"),
      ev("aula_concluida", "2026-10-07T12:00:00Z", { matricula_id: "m1" }),
      ev("avaliacao_iniciada", "2026-10-07T12:30:00Z", { matricula_id: "m2" }),
      ev("declaracao_ambiente", "2026-10-07T11:50:00Z", {
        matricula_id: "m2",
        detalhe: { versao: 0, texto_padrao: true },
      }),
    ]);
    expect(linha.estudou).toBe(true);
    expect(linha.semDeclaracao).toBe(1); // m1 estudou e não declarou; m2 declarou
    expect(linha.declaracoes[0].textoPadrao).toBe(true);
  });

  it("só entrar no portal, trocar a senha ou dar ciência de entrega não é estudar (não pede declaração)", () => {
    const [linha] = janelasPorAlunoEDia([
      ev("login", "2026-10-07T11:00:00Z"),
      ev("troca_senha", "2026-10-07T11:01:00Z"),
      ev("ciencia", "2026-10-07T11:02:00Z"),
      ev("logout", "2026-10-07T11:03:00Z"),
    ]);
    expect(linha.estudou).toBe(false);
    expect(linha.semDeclaracao).toBe(0);
    expect(linha.declaracoes).toEqual([]);
  });

  it("entradas inválidas não derrubam a tela", () => {
    expect(janelasPorAlunoEDia(null)).toEqual([]);
    expect(janelasPorAlunoEDia(undefined)).toEqual([]);
    expect(janelasPorAlunoEDia([null, undefined, 3, {}])).toEqual([]);
    expect(
      janelasPorAlunoEDia([ev("login", "2026-10-07T11:00:00Z", { funcionario_id: null })])
    ).toEqual([]);
  });
});

describe("montarLinhasDeAtividade", () => {
  const eventos = [
    ev("login", "2026-10-07T11:00:00Z", { funcionario_id: "f2" }),
    ev("aula_concluida", "2026-10-07T12:00:00Z", { funcionario_id: "f2", matricula_id: "m2" }),
    ev("login", "2026-10-07T11:00:00Z", { funcionario_id: "f1" }),
    ev("login", "2026-10-08T11:00:00Z", { funcionario_id: "f1" }),
    ev("login", "2026-10-08T11:00:00Z", { funcionario_id: "f9" }),
  ];
  const funcionarios = [
    { id: "f1", nome_completo: "Ana Teste" },
    { id: "f2", nome_completo: "Bruno Teste" },
  ];

  it("dá o nome a cada linha e ordena do dia mais novo para o mais antigo, e por nome no mesmo dia", () => {
    const linhas = montarLinhasDeAtividade({ eventos, funcionarios });
    expect(linhas.map((l) => `${l.dia} ${l.nome}`)).toEqual([
      "2026-10-08 (funcionário removido)",
      "2026-10-08 Ana Teste",
      "2026-10-07 Ana Teste",
      "2026-10-07 Bruno Teste",
    ]);
  });

  it("o nome do funcionário inativo ou apagado ainda aparece (a lista é a de todos)", () => {
    const [primeira] = montarLinhasDeAtividade({
      eventos: [ev("login", "2026-10-07T11:00:00Z", { funcionario_id: "f3" })],
      funcionarios: [{ id: "f3", nome_completo: "Carla Teste", ativo: false }],
    });
    expect(primeira.nome).toBe("Carla Teste");
  });
});

describe("textos da tela", () => {
  const base = {
    primeiroEm: "2026-10-07T11:03:00Z",
    ultimoEm: "2026-10-07T14:47:00Z",
    minutos: 224,
    eventos: 4,
    estudou: true,
    declaracoes: [],
    semDeclaracao: 0,
  };

  it("a janela: início, fim e duração em horas e minutos de Brasília", () => {
    expect(textoDaJanela(base)).toBe("08:03 às 11:47 (3h44)");
    expect(textoDaJanela({ ...base, minutos: 45, ultimoEm: "2026-10-07T11:48:00Z" })).toBe(
      "08:03 às 08:48 (45 min)"
    );
    expect(textoDaJanela({ ...base, minutos: 0, ultimoEm: base.primeiroEm })).toBe(
      "08:03 (um evento)"
    );
    expect(textoDaJanela({ ...base, minutos: 120, ultimoEm: "2026-10-07T13:03:00Z" })).toBe(
      "08:03 às 10:03 (2h00)"
    );
  });

  it("a declaração: declarou (com a versão), texto padrão, falta em N cursos, ou nada a declarar", () => {
    const decl = (extra) => ({
      matriculaId: "m1",
      versao: 2,
      textoPadrao: false,
      em: base.primeiroEm,
      ...extra,
    });
    expect(textoDaDeclaracao({ ...base, declaracoes: [decl()] })).toEqual({
      tom: "ok",
      texto: "Declarou (texto v2)",
    });
    expect(
      textoDaDeclaracao({ ...base, declaracoes: [decl({ versao: 0, textoPadrao: true })] })
    ).toEqual({
      tom: "atencao",
      texto: "Declarou (texto padrão, sem aprovação do RT)",
    });
    expect(
      textoDaDeclaracao({ ...base, declaracoes: [decl(), decl({ matriculaId: "m2" })] }).texto
    ).toBe("Declarou em 2 cursos (texto v2)");
    expect(textoDaDeclaracao({ ...base, semDeclaracao: 1 })).toEqual({
      tom: "falta",
      texto: "Estudou sem declarar (1 curso)",
    });
    expect(textoDaDeclaracao({ ...base, semDeclaracao: 3 }).texto).toBe(
      "Estudou sem declarar (3 cursos)"
    );
    // declarou em um e estudou em outro sem declarar: a falta é o que importa
    expect(textoDaDeclaracao({ ...base, declaracoes: [decl()], semDeclaracao: 1 }).tom).toBe(
      "falta"
    );
    expect(textoDaDeclaracao({ ...base, estudou: false })).toEqual({ tom: "neutro", texto: "—" });
  });
});

describe("filtros, resumo e CSV", () => {
  const linhas = montarLinhasDeAtividade({
    eventos: [
      ev("login", "2026-10-07T11:00:00Z", { funcionario_id: "f1" }),
      ev("aula_concluida", "2026-10-07T12:00:00Z", { funcionario_id: "f1", matricula_id: "m1" }),
      ev("login", "2026-10-07T11:00:00Z", { funcionario_id: "f2" }),
      ev("declaracao_ambiente", "2026-10-07T11:10:00Z", {
        funcionario_id: "f2",
        matricula_id: "m2",
        detalhe: { versao: 1, texto_padrao: false },
      }),
      ev("aula_concluida", "2026-10-07T12:10:00Z", { funcionario_id: "f2", matricula_id: "m2" }),
    ],
    funcionarios: [
      { id: "f1", nome_completo: "Ana Teste" },
      { id: "f2", nome_completo: "João Teste" },
    ],
  });

  it("busca por nome (sem acento nem maiúscula) e 'só sem declaração'", () => {
    expect(filtrarAtividade(linhas, { busca: "joao" }).map((l) => l.nome)).toEqual(["João Teste"]);
    expect(filtrarAtividade(linhas, { soSemDeclaracao: true }).map((l) => l.nome)).toEqual([
      "Ana Teste",
    ]);
    expect(filtrarAtividade(linhas, {})).toHaveLength(2);
    expect(filtrarAtividade(null, {})).toEqual([]);
  });

  it("o resumo: alunos, dias com atividade e dias que estudaram sem declarar", () => {
    expect(resumirAtividade(linhas)).toEqual({ alunos: 2, dias: 2, semDeclaracao: 1 });
    expect(resumirAtividade([])).toEqual({ alunos: 0, dias: 0, semDeclaracao: 0 });
  });

  it("o CSV tem cabeçalho, uma linha por aluno e dia, datas e horas de Brasília e CRLF", () => {
    const csv = csvDaAtividade(linhas);
    const partes = csv.split("\r\n");
    expect(partes[0]).toBe(
      "Aluno;Dia;Primeiro evento;Último evento;Janela (min);Eventos de servidor;Declaração;Cursos sem declaração"
    );
    expect(partes).toHaveLength(3);
    expect(partes[1]).toBe(
      "Ana Teste;07/10/2026;08:00;09:00;60;2;Estudou sem declarar (1 curso);1"
    );
    expect(partes[2]).toBe("João Teste;07/10/2026;08:00;09:10;70;3;Declarou (texto v1);0");
  });

  it("o CSV protege o nome que começaria uma fórmula no Excel", () => {
    const [linha] = montarLinhasDeAtividade({
      eventos: [ev("login", "2026-10-07T11:00:00Z", { funcionario_id: "f1" })],
      funcionarios: [{ id: "f1", nome_completo: "=SOMA(A1)" }],
    });
    expect(csvDaAtividade([linha]).split("\r\n")[1].startsWith("'=SOMA(A1);")).toBe(true);
  });
});
