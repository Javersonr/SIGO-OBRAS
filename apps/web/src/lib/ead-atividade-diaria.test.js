import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  EVENTOS_DE_ESTUDO,
  EVENTOS_DO_RH,
  EVENTOS_FORA_DA_JANELA,
  avisoDaCobranca,
  csvDaAtividade,
  desdeDaConsulta,
  diaDeBrasilia,
  diaInicialDoPeriodo,
  ehAtividadeDoAluno,
  filtrarAtividade,
  horaDeBrasilia,
  inicioDaCobranca,
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

  it("todo evento que o portal grava está classificado como estudo ou não (evento novo sem dono faz o teste acusar)", () => {
    const ler = (caminho) =>
      readFileSync(new URL(`../../../../supabase/functions/${caminho}`, import.meta.url), "utf8");
    const index = ler("portal-funcionario/index.ts");
    const constantes = [
      "portal-funcionario/regras.ts",
      "portal-funcionario/declaracao-ambiente.ts",
      "_shared/portal-funcionario.ts",
    ]
      .map(ler)
      .join("\n");
    const gravados = new Set();
    for (const m of index.matchAll(/\bevento:\s*"([a-z_]+)"/g)) gravados.add(m[1]);
    // os que o portal grava por constante (EVENTO_PROVA_INICIADA, EVENTO_DECLARACAO_AMBIENTE, ...)
    for (const m of index.matchAll(/\bevento:\s*(EVENTO_[A-Z_]+)\b/g)) {
      const valor = new RegExp(`export const ${m[1]} = "([a-z_]+)"`).exec(constantes)?.[1];
      expect(valor, `constante ${m[1]} não encontrada`).toBeTruthy();
      gravados.add(valor);
    }
    // sem estes a leitura do código teria falhado em silêncio e o teste passaria vazio
    expect(gravados.size).toBeGreaterThanOrEqual(12);
    expect(gravados).toContain("aula_concluida");
    expect(gravados).toContain("avaliacao_iniciada");
    expect(gravados).toContain("certificado_assinado");
    expect(gravados).toContain("declaracao_ambiente");

    // o que o portal grava e NÃO é estudar: entrada e saída, declaração, certificado e dúvida
    const naoSaoEstudo = [
      "login",
      "login_falha",
      "logout",
      "troca_senha",
      "ciencia",
      "declaracao_ambiente",
      "certificado_assinado",
      "certificado_revogado",
      "duvida_enviada",
    ];
    for (const nome of gravados) {
      expect(
        EVENTOS_DE_ESTUDO.includes(nome) || naoSaoEstudo.includes(nome),
        `o portal grava "${nome}" e ele não está em EVENTOS_DE_ESTUDO nem na lista dos que não são estudo`
      ).toBe(true);
    }
    // e o contrário: um evento de estudo que o portal deixou de gravar (renomeado) não fica na lista por engano
    for (const nome of EVENTOS_DE_ESTUDO) expect(gravados, nome).toContain(nome);
    for (const nome of EVENTOS_DE_ESTUDO) expect(naoSaoEstudo, nome).not.toContain(nome);
    for (const nome of EVENTOS_DO_RH) expect(EVENTOS_DE_ESTUDO, nome).not.toContain(nome);
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

  it("conclui o curso num dia e assina o certificado no outro: o dia do certificado não é 'estudou sem declarar'", () => {
    // semipresencial (T12): o certificado só sai depois da prática, em outro dia; o portal não pede a declaração
    // em curso concluído, então o relatório não pode cobrá-la
    const linhas = montarLinhasDeAtividade({
      eventos: [
        ev("login", "2026-10-07T11:00:00Z"),
        ev("declaracao_ambiente", "2026-10-07T11:02:00Z", {
          matricula_id: "m1",
          detalhe: { versao: 1, texto_padrao: false },
        }),
        ev("avaliacao_envio", "2026-10-07T12:00:00Z", { matricula_id: "m1" }),
        ev("curso_concluido", "2026-10-07T12:00:01Z", { matricula_id: "m1" }),
        // dia seguinte: só o certificado (e uma dúvida sobre o curso já concluído)
        ev("login", "2026-10-08T14:00:00Z"),
        ev("certificado_assinado", "2026-10-08T14:05:00Z", { matricula_id: "m1" }),
        ev("duvida_enviada", "2026-10-08T14:10:00Z", { matricula_id: "m1" }),
      ],
      funcionarios: [{ id: "f1", nome_completo: "Ana Teste" }],
    });
    const dia7 = linhas.find((l) => l.dia === "2026-10-07");
    const dia8 = linhas.find((l) => l.dia === "2026-10-08");
    expect(dia7).toMatchObject({ estudou: true, semDeclaracao: 0 });
    // o dia do certificado continua na janela do aluno (houve atividade), mas sem cobrança
    expect(dia8).toMatchObject({ estudou: false, semDeclaracao: 0, eventos: 3, minutos: 10 });
    expect(textoDaDeclaracao(dia8).tom).not.toBe("falta");
    expect(filtrarAtividade(linhas, { soSemDeclaracao: true })).toEqual([]);
    expect(resumirAtividade(linhas).semDeclaracao).toBe(0);
  });

  it("estudo é só aula, apostila, prova e conclusão: declaração, certificado e dúvida não contam", () => {
    for (const nome of [
      "progresso_ajustado",
      "apostila_lida",
      "aula_concluida",
      "curso_concluido",
      "avaliacao_iniciada",
      "avaliacao_envio",
    ]) {
      const [linha] = janelasPorAlunoEDia([
        ev(nome, "2026-10-07T12:00:00Z", { matricula_id: "m1" }),
      ]);
      expect(linha, nome).toMatchObject({ estudou: true, semDeclaracao: 1 });
    }
    // (o certificado revogado nem entra na janela: é ação do RH ou do sistema, ver EVENTOS_DO_RH)
    for (const nome of ["declaracao_ambiente", "certificado_assinado", "duvida_enviada"]) {
      const [linha] = janelasPorAlunoEDia([
        ev(nome, "2026-10-07T12:00:00Z", { matricula_id: "m1" }),
      ]);
      expect(linha, nome).toMatchObject({ estudou: false, semDeclaracao: 0 });
    }
  });

  it("estudou num curso e assinou o certificado de outro no mesmo dia: só o que estudou precisa declarar", () => {
    const [linha] = janelasPorAlunoEDia([
      ev("aula_concluida", "2026-10-07T12:00:00Z", { matricula_id: "m1" }),
      ev("certificado_assinado", "2026-10-07T12:30:00Z", { matricula_id: "m2" }),
    ]);
    expect(linha).toMatchObject({ estudou: true, semDeclaracao: 1 });
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

describe("cobrança da declaração: só do dia em que ela passou a existir", () => {
  const funcionarios = [
    { id: "f1", nome_completo: "Ana Teste" },
    { id: "f2", nome_completo: "Bruno Teste" },
    { id: "f3", nome_completo: "Carla Teste" },
  ];
  // a primeira declaração da empresa foi no dia 07 (14:00 de Brasília): a cobrança começa no dia 08
  const primeiraDeclaracao = "2026-10-07T17:00:00Z";
  const estudo = (created_at, funcionario_id = "f1", matricula_id = "m1") =>
    ev("aula_concluida", created_at, { funcionario_id, matricula_id });

  it("o início da cobrança é o dia SEGUINTE ao da primeira declaração da empresa, em Brasília", () => {
    expect(inicioDaCobranca(primeiraDeclaracao)).toBe("2026-10-08");
    // 23h30 de Brasília do dia 07 (02h30 UTC do dia 08) ainda é dia 07: cobra a partir do 08
    expect(inicioDaCobranca("2026-10-08T02:30:00Z")).toBe("2026-10-08");
    // 00h10 de Brasília do dia 08 já é dia 08: cobra a partir do 09
    expect(inicioDaCobranca("2026-10-08T03:10:00Z")).toBe("2026-10-09");
    // virada de mês e de ano
    expect(inicioDaCobranca("2026-10-31T15:00:00Z")).toBe("2026-11-01");
    expect(inicioDaCobranca("2026-12-31T15:00:00Z")).toBe("2027-01-01");
  });

  it("sem declaração na empresa (ou data ilegível) não há início: null", () => {
    for (const vazio of [null, undefined, "", "ontem", {}]) {
      expect(inicioDaCobranca(vazio), String(vazio)).toBeNull();
    }
  });

  it("dias antes da primeira declaração da empresa não são cobrados", () => {
    const linhas = montarLinhasDeAtividade({
      eventos: [
        // dia 05: estudou quando a declaração nem existia
        estudo("2026-10-05T12:00:00Z"),
        // dia 07 (implantação): um aluno estudou de manhã, antes de a tela entrar no ar, e outro declarou à tarde
        estudo("2026-10-07T11:00:00Z", "f2", "m2"),
        ev("declaracao_ambiente", primeiraDeclaracao, {
          funcionario_id: "f3",
          matricula_id: "m3",
          detalhe: { versao: 1, texto_padrao: false },
        }),
        // dia 08: já vale
        estudo("2026-10-08T12:00:00Z"),
      ],
      funcionarios,
      cobrarDesde: inicioDaCobranca(primeiraDeclaracao),
    });
    const de = (dia, nome) => linhas.find((l) => l.dia === dia && l.nome === nome);
    // antes da declaração existir: estudou (é o fato), mas sem cobrança
    expect(de("2026-10-05", "Ana Teste")).toMatchObject({
      estudou: true,
      cobrada: false,
      semDeclaracao: 0,
    });
    // no dia da implantação ninguém é cobrado (não dá para saber se o aluno estudou antes ou depois do deploy)
    expect(de("2026-10-07", "Bruno Teste")).toMatchObject({
      estudou: true,
      cobrada: false,
      semDeclaracao: 0,
    });
    // quem declarou nesse dia continua aparecendo como declarou
    expect(textoDaDeclaracao(de("2026-10-07", "Carla Teste"))).toEqual({
      tom: "ok",
      texto: "Declarou (texto v1)",
    });
    // a partir do dia seguinte, estudar sem declarar é falta
    expect(de("2026-10-08", "Ana Teste")).toMatchObject({
      estudou: true,
      cobrada: true,
      semDeclaracao: 1,
    });
  });

  it("os dias não cobrados ficam de fora do resumo, do filtro 'só sem declaração' e viram texto neutro", () => {
    const linhas = montarLinhasDeAtividade({
      eventos: [estudo("2026-10-05T12:00:00Z"), estudo("2026-10-06T12:00:00Z", "f2", "m2")],
      funcionarios,
      cobrarDesde: "2026-10-08",
    });
    expect(linhas).toHaveLength(2);
    expect(resumirAtividade(linhas)).toEqual({ alunos: 2, dias: 2, semDeclaracao: 0 });
    expect(filtrarAtividade(linhas, { soSemDeclaracao: true })).toEqual([]);
    for (const l of linhas) {
      expect(textoDaDeclaracao(l)).toEqual({
        tom: "neutro",
        texto: "Antes da cobrança da declaração",
      });
    }
    // o CSV diz o mesmo e não conta curso sem declaração
    const [, primeira] = csvDaAtividade(linhas).split("\r\n");
    expect(primeira.endsWith(";Antes da cobrança da declaração;0")).toBe(true);
  });

  it("a empresa que nunca teve declaração (cobrarDesde null) não é cobrada em nenhum dia", () => {
    const [linha] = janelasPorAlunoEDia([estudo("2026-10-08T12:00:00Z")], { cobrarDesde: null });
    expect(linha).toMatchObject({ estudou: true, cobrada: false, semDeclaracao: 0 });
  });

  it("sem informar a data de corte, todo dia é cobrado (como antes da correção)", () => {
    const [linha] = janelasPorAlunoEDia([estudo("2026-10-05T12:00:00Z")]);
    expect(linha).toMatchObject({ cobrada: true, semDeclaracao: 1 });
  });

  it("data de corte ilegível não cobra: na dúvida, não acusa ninguém", () => {
    for (const ruim of ["", "ontem", "08/10/2026", 20261008]) {
      const [linha] = janelasPorAlunoEDia([estudo("2026-10-08T12:00:00Z")], { cobrarDesde: ruim });
      expect(linha, String(ruim)).toMatchObject({ cobrada: false, semDeclaracao: 0 });
    }
  });

  it("o próprio dia do corte já é cobrado", () => {
    const [linha] = janelasPorAlunoEDia([estudo("2026-10-08T12:00:00Z")], {
      cobrarDesde: "2026-10-08",
    });
    expect(linha).toMatchObject({ cobrada: true, semDeclaracao: 1 });
  });

  it("o texto só explica o dia não cobrado quando houve estudo (login sem estudo continua '—')", () => {
    const login = ev("login", "2026-10-05T12:00:00Z");
    const [semEstudo] = janelasPorAlunoEDia([login], { cobrarDesde: "2026-10-08" });
    expect(semEstudo).toMatchObject({ estudou: false, cobrada: false });
    expect(textoDaDeclaracao(semEstudo)).toEqual({ tom: "neutro", texto: "—" });
  });

  describe("o aviso do relatório", () => {
    it("sem nenhuma declaração na empresa: avisa que nada é cobrado", () => {
      const aviso = avisoDaCobranca({ inicioCobranca: null, diaInicial: "2026-10-01" });
      expect(aviso.tom).toBe("atencao");
      expect(aviso.texto).toContain("Nenhum aluno declarou ainda");
      expect(aviso.texto).toContain("nada é cobrado");
    });

    it("a cobrança começa depois do início do período: diz a data e o que acontece com os dias anteriores", () => {
      const aviso = avisoDaCobranca({ inicioCobranca: "2026-10-08", diaInicial: "2026-09-24" });
      expect(aviso.tom).toBe("neutro");
      expect(aviso.texto).toContain("08/10/2026");
      expect(aviso.texto).toContain("Antes da cobrança da declaração");
    });

    it("o período todo já é cobrado (ou não se sabe o corte): sem aviso", () => {
      expect(
        avisoDaCobranca({ inicioCobranca: "2026-10-08", diaInicial: "2026-10-08" })
      ).toBeNull();
      expect(
        avisoDaCobranca({ inicioCobranca: "2026-10-08", diaInicial: "2026-10-20" })
      ).toBeNull();
      expect(avisoDaCobranca({ inicioCobranca: undefined, diaInicial: "2026-10-01" })).toBeNull();
      expect(avisoDaCobranca({})).toBeNull();
    });
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
