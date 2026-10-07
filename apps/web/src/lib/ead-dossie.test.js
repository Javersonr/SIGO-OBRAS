import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import {
  BOM,
  nomeSeguroDeArquivo,
  nomeDoZip,
  cpfFormatado,
  eventosDoCurso,
  csvDasMatriculas,
  csvDaTrilha,
  csvDasTentativas,
  certificadosDoDossie,
  nomeDoCertificadoNoZip,
  textoLeiaMe,
  montarDossie,
  certificadoDaFicha,
  avisoDoDossie,
  textoDoAndamento,
} from "./ead-dossie";

// Dados sintéticos: nenhum nome, CPF, IP ou identificador real.
const EMPRESA = { nome: "Empresa Teste Ltda", cnpj: "00.000.000/0001-00" };
const CURSO = {
  id: "c1",
  nome: "Curso de Teste",
  codigo: "NRT",
  modalidade: "ead",
  ativo: true,
  carga_horaria_horas: 8,
  validade_meses: 24,
  nota_minima: 70,
  max_tentativas: 3,
  intervalo_tentativa_min: 30,
  responsavel_tecnico_nome: "RT Teste",
  responsavel_tecnico_registro: "REG 000",
  instrutor_nome: "Instrutor Teste",
  instrutor_qualificacao: "Qualificação Teste",
  projeto_pedagogico_ref: "treinamentos/empresa/projeto.pdf",
  conteudo_programatico: "Item um\nItem dois",
};
const AULAS = [
  { id: "a1", curso_id: "c1", ordem: 1, titulo: "Aula A", tipo: "video", duracao_seg: 600 },
  { id: "a2", curso_id: "c1", ordem: 2, titulo: "Aula B", tipo: "pdf", duracao_seg: 300 },
  {
    id: "a3",
    curso_id: "c1",
    ordem: 3,
    titulo: "Aula Velha",
    tipo: "video",
    deleted_at: "2026-09-20T10:00:00Z",
  },
];
const FUNCS = [
  {
    id: "f1",
    nome_completo: "Beatriz Teste",
    cpf: "12345678909",
    funcao_nome: "Eletricista",
    ativo: true,
  },
  {
    id: "f2",
    nome_completo: "Ana Teste",
    cpf: "000.000.000-00",
    funcao_nome: "Ajudante",
    ativo: false,
  },
];
const MATS = [
  {
    id: "m1",
    curso_id: "c1",
    funcionario_id: "f1",
    status: "concluido",
    created_at: "2026-09-01T15:00:00Z",
    iniciado_em: "2026-09-02T12:00:00Z",
    data_conclusao: "2026-09-10",
    proxima_renovacao: "2028-09-10",
    nota_avaliacao: 90,
    avaliacao_aprovada: true,
    tentativas_extras: 1,
  },
  {
    id: "m2",
    curso_id: "c1",
    funcionario_id: "f2",
    status: "em_andamento",
    created_at: "2026-09-03T15:00:00Z",
    tentativas_extras: 0,
  },
  {
    id: "m3",
    curso_id: "c1",
    funcionario_id: "f2",
    status: "pendente",
    created_at: "2026-08-03T15:00:00Z",
    deleted_at: "2026-08-10T15:00:00Z",
  },
];
const CERT_M1 = {
  id: "k1",
  curso_id: "c1",
  matricula_id: "m1",
  funcionario_id: "f1",
  codigo: "ABC-123",
  hash_sha256: "h",
  emitido_em: "2026-09-10T16:00:00Z",
  dados: { aluno: { nome: "Beatriz Teste" } },
  revogado_em: null,
};
const PROG = [
  { matricula_id: "m1", aula_id: "a1", segundos_assistidos: 600, concluida: true },
  { matricula_id: "m1", aula_id: "a2", segundos_assistidos: 330, concluida: true },
  // aula removida: não entra em "aulas concluídas", mas o tempo conta
  { matricula_id: "m1", aula_id: "a3", segundos_assistidos: 60, concluida: true },
  { matricula_id: "m2", aula_id: "a1", segundos_assistidos: 100, concluida: false },
];
const TENT = [
  {
    id: "t1",
    matricula_id: "m1",
    funcionario_id: "f1",
    curso_id: "c1",
    numero: 1,
    nota: 90,
    acertos: 1,
    total: 2,
    aprovada: true,
    ip: "203.0.113.7",
    dispositivo: "Navegador de Teste",
    created_at: "2026-09-10T15:30:00Z",
    prova: [
      { questao_id: "q1", pergunta: "Primeira?", opcoes: ["a1", "a2", "a3"], correta: 2 },
      { questao_id: "q2", pergunta: "Segunda?", opcoes: ["b1", "b2"], correta: 0 },
    ],
    respostas: [
      {
        questao_id: "q1",
        resposta: 2,
        acertou: true,
        posicao_exibida: 2,
        ordem_opcoes_exibida: [2, 0, 1],
      },
      {
        questao_id: "q2",
        resposta: 1,
        acertou: false,
        posicao_exibida: 1,
        ordem_opcoes_exibida: [1, 0],
      },
    ],
  },
  {
    id: "t2",
    matricula_id: "m2",
    funcionario_id: "f2",
    curso_id: "c1",
    numero: 1,
    nota: 40,
    acertos: 0,
    total: 0,
    aprovada: false,
    created_at: "2026-09-11T15:30:00Z",
    prova: null,
    respostas: null,
  },
];
const EV = (id, extra) => ({
  id,
  funcionario_id: "f1",
  matricula_id: "m1",
  curso_id: "c1",
  aula_id: null,
  evento: "login",
  detalhe: null,
  ip: "203.0.113.7",
  dispositivo: "Navegador de Teste",
  origem: "servidor",
  created_at: "2026-09-02T11:00:00Z",
  ...extra,
});
const EVENTOS = [
  EV(3, {
    evento: "aula_concluida",
    aula_id: "a1",
    detalhe: { segundos: 600 },
    created_at: "2026-09-02T12:30:00Z",
  }),
  EV(1, { matricula_id: null, curso_id: null, evento: "login" }),
  EV(2, { evento: "play", aula_id: "a2", origem: "navegador", created_at: "2026-09-02T12:00:00Z" }),
  // evento de OUTRO curso do mesmo funcionário: fora do dossiê
  EV(4, { matricula_id: "m9", curso_id: "c9", evento: "abrir_curso" }),
  // acesso ao portal de quem não está neste curso: fora do dossiê
  EV(5, { funcionario_id: "f7", matricula_id: null, curso_id: null, evento: "login" }),
  // o mesmo evento lido duas vezes (as duas consultas se sobrepõem): vale uma só
  EV(2, { evento: "play", aula_id: "a2", origem: "navegador", created_at: "2026-09-02T12:00:00Z" }),
];

const linhasDe = (csv) => csv.split("\r\n");
const celulas = (linha) => linha.split(";");

describe("nomes de arquivo", () => {
  it("mantém letras e números (com acento) e troca o resto por _", () => {
    expect(nomeSeguroDeArquivo("João da Silva - NR-10 (básico)")).toBe(
      "João_da_Silva_NR_10_básico"
    );
  });

  it("não deixa caminho nem ponto escapar para fora da pasta do ZIP", () => {
    expect(nomeSeguroDeArquivo("../../etc/passwd")).toBe("etc_passwd");
    expect(nomeSeguroDeArquivo("..")).toBe("arquivo");
    expect(nomeSeguroDeArquivo("a\\b/c:d*e?f")).toBe("a_b_c_d_e_f");
  });

  it("usa o padrão quando não sobra nada e corta nomes muito longos", () => {
    expect(nomeSeguroDeArquivo("", "curso")).toBe("curso");
    expect(nomeSeguroDeArquivo(null)).toBe("arquivo");
    expect(nomeSeguroDeArquivo("x".repeat(200)).length).toBe(60);
    expect(nomeSeguroDeArquivo("x".repeat(200), "p", 20).length).toBe(20);
  });

  it("o ZIP leva o código do curso e o dia de Brasília", () => {
    // 01:30 UTC de 07/10 ainda é 06/10 em Brasília
    expect(nomeDoZip(CURSO, "2026-10-07T01:30:00Z")).toBe("dossie_ead_NRT_2026-10-06.zip");
    expect(nomeDoZip({ nome: "Curso sem código" }, "2026-10-06T15:00:00Z")).toBe(
      "dossie_ead_Curso_sem_código_2026-10-06.zip"
    );
  });

  it("CPF sai formatado quando tem 11 dígitos e como veio nos outros casos", () => {
    expect(cpfFormatado("12345678909")).toBe("123.456.789-09");
    expect(cpfFormatado("123.456.789-09")).toBe("123.456.789-09");
    expect(cpfFormatado("123")).toBe("123");
    expect(cpfFormatado(null)).toBe("");
  });
});

describe("eventosDoCurso: o que entra na trilha do dossiê", () => {
  const eventos = eventosDoCurso({ eventos: EVENTOS, matriculas: MATS });

  it("fica com os eventos das matrículas do curso e os acessos ao portal de quem as tem", () => {
    expect(eventos.map((e) => e.id)).toEqual([1, 2, 3]);
  });

  it("deixa de fora o evento de outra matrícula e o acesso de quem não é do curso", () => {
    expect(eventos.some((e) => e.id === 4 || e.id === 5)).toBe(false);
  });

  it("lê uma vez o evento que as duas consultas trouxeram", () => {
    expect(eventos.filter((e) => e.id === 2)).toHaveLength(1);
  });

  it("ordena por hora do servidor e, no empate, pelo id", () => {
    const empate = eventosDoCurso({
      eventos: [
        EV(20, { created_at: "2026-09-02T10:00:00Z" }),
        EV(10, { created_at: "2026-09-02T10:00:00Z" }),
      ],
      matriculas: MATS,
    });
    expect(empate.map((e) => e.id)).toEqual([10, 20]);
  });

  it("aceita entrada vazia ou fora do formato sem lançar", () => {
    expect(eventosDoCurso({})).toEqual([]);
    expect(eventosDoCurso({ eventos: null, matriculas: null })).toEqual([]);
  });
});

describe("csvDaTrilha", () => {
  const eventos = eventosDoCurso({ eventos: EVENTOS, matriculas: MATS });
  const csv = csvDaTrilha({ eventos, matriculas: MATS, funcionarios: FUNCS, aulas: AULAS });
  const linhas = linhasDe(csv);

  it("tem cabeçalho e uma linha por evento, separados por ; e CRLF", () => {
    expect(linhas).toHaveLength(1 + 3);
    expect(celulas(linhas[0])).toEqual([
      "Data e hora (Brasília)",
      "Data e hora (UTC)",
      "Funcionário",
      "CPF",
      "Escopo",
      "Evento (código)",
      "Descrição",
      "Aula",
      "Detalhe",
      "Detalhe (JSON)",
      "IP",
      "Dispositivo",
      "Origem",
      "Matrícula",
    ]);
  });

  it("traz hora de Brasília e UTC, quem, escopo, evento e descrição em português", () => {
    const [, login, play, concluida] = linhas.map(celulas);
    expect(login[0]).toContain("02/09/2026");
    expect(login[0]).toBe("02/09/2026 08:00:00"); // 11:00 UTC = 08:00 em Brasília, sem vírgula
    expect(login[1]).toBe("2026-09-02T11:00:00.000Z");
    expect(login.slice(2, 7)).toEqual([
      "Beatriz Teste",
      "123.456.789-09",
      "Acesso ao portal",
      "login",
      "Entrou no portal",
    ]);
    expect(play[4]).toBe("Matrícula do curso");
    expect(play[7]).toBe("2. Aula B");
    expect(concluida[8]).toBe("10min 0s assistidos");
    expect(concluida[9]).toBe('"{""segundos"":600}"');
  });

  it("marca a origem do evento e o IP, e deixa vazia a origem que o banco não informou", () => {
    const [, login, play] = linhas.map(celulas);
    expect(play[12]).toBe("navegador");
    expect(login[12]).toBe("servidor");
    expect(login[10]).toBe("203.0.113.7");
    const semOrigem = csvDaTrilha({
      eventos: [EV(1, { origem: undefined })],
      matriculas: MATS,
      funcionarios: FUNCS,
      aulas: AULAS,
    });
    expect(celulas(linhasDe(semOrigem)[1])[12]).toBe("");
  });

  it("aula removida aparece pelo título e avisa que foi removida", () => {
    const csv2 = csvDaTrilha({
      eventos: [EV(1, { aula_id: "a3" })],
      matriculas: MATS,
      funcionarios: FUNCS,
      aulas: AULAS,
    });
    expect(celulas(linhasDe(csv2)[1])[7]).toBe("Aula Velha (aula removida)");
  });

  it("texto que o Excel leria como fórmula ganha apóstrofo", () => {
    const csv2 = csvDaTrilha({
      eventos: [EV(1, { dispositivo: "=HYPERLINK(1)" })],
      matriculas: MATS,
      funcionarios: FUNCS,
      aulas: AULAS,
    });
    expect(celulas(linhasDe(csv2)[1])[11]).toBe("'=HYPERLINK(1)");
  });

  it("sem eventos sai só o cabeçalho", () => {
    expect(
      linhasDe(csvDaTrilha({ eventos: [], matriculas: MATS, funcionarios: FUNCS, aulas: AULAS }))
    ).toHaveLength(1);
  });
});

describe("csvDasMatriculas", () => {
  const csv = csvDasMatriculas({
    matriculas: MATS,
    curso: CURSO,
    funcionarios: FUNCS,
    aulas: AULAS,
    progresso: PROG,
    tentativas: TENT,
    certificados: [CERT_M1],
  });
  const linhas = linhasDe(csv).map(celulas);
  const cab = linhas[0];
  const col = (linha, titulo) => linha[cab.indexOf(titulo)];

  it("tem uma linha por matrícula, inclusive a removida, em ordem de nome", () => {
    expect(linhas).toHaveLength(1 + 3);
    expect(linhas.slice(1).map((l) => col(l, "Funcionário"))).toEqual([
      "Ana Teste (inativo)",
      "Ana Teste (inativo)",
      "Beatriz Teste",
    ]);
  });

  it("a matrícula removida leva a data da remoção; as outras ficam vazias", () => {
    const removida = linhas.find((l) => col(l, "ID da matrícula") === "m3");
    expect(col(removida, "Matrícula removida em")).toBe("10/08/2026");
    const viva = linhas.find((l) => col(l, "ID da matrícula") === "m2");
    expect(col(viva, "Matrícula removida em")).toBe("");
  });

  it("conta só as aulas que ainda existem e soma todo o tempo assistido", () => {
    const l = linhas.find((x) => col(x, "ID da matrícula") === "m1");
    expect(col(l, "Aulas concluídas")).toBe("2");
    expect(col(l, "Total de aulas")).toBe("2");
    expect(col(l, "Tempo assistido")).toBe("16min 30s");
  });

  it("dados da conclusão, nota, tentativas e certificado", () => {
    const l = linhas.find((x) => col(x, "ID da matrícula") === "m1");
    expect(col(l, "CPF")).toBe("123.456.789-09");
    expect(col(l, "Função")).toBe("Eletricista");
    expect(col(l, "Status")).toBe("Concluído");
    expect(col(l, "Matriculado em")).toBe("01/09/2026");
    expect(col(l, "Concluído em")).toBe("10/09/2026");
    expect(col(l, "Renovar até")).toBe("10/09/2028");
    expect(col(l, "Nota (%)")).toBe("90");
    expect(col(l, "Aprovado")).toBe("Sim");
    expect(col(l, "Tentativas feitas")).toBe("1");
    expect(col(l, "Tentativas extras liberadas")).toBe("1");
    expect(col(l, "Certificado (código)")).toBe("ABC-123");
    expect(col(l, "Situação do certificado")).toBe("Emitido");
    expect(col(l, "Emitido em (Brasília)")).toContain("10/09/2026");
  });

  it("tipo do treinamento da matrícula (T23): o texto e o motivo do eventual; sem a coluna, vazio", () => {
    const csvTipo = csvDasMatriculas({
      matriculas: [
        { ...MATS[0], tipo: "periodico", motivo_eventual: null },
        { ...MATS[1], tipo: "eventual", motivo_eventual: "Mudança de equipamento" },
        MATS[2],
      ],
      curso: CURSO,
      funcionarios: FUNCS,
      aulas: AULAS,
      progresso: PROG,
      tentativas: TENT,
      certificados: [CERT_M1],
    });
    const l = linhasDe(csvTipo).map(celulas);
    const porId = (id) => l.slice(1).find((x) => x[l[0].indexOf("ID da matrícula")] === id);
    const tipo = (id) => porId(id)[l[0].indexOf("Tipo de treinamento")];
    expect(tipo("m1")).toBe("Periódico");
    expect(tipo("m2")).toBe("Eventual: Mudança de equipamento");
    expect(tipo("m3")).toBe("");
  });

  it("sem nota na matrícula usa a da última tentativa; sem nenhuma, deixa vazio", () => {
    const m2 = linhas.find((x) => col(x, "ID da matrícula") === "m2");
    expect(col(m2, "Nota (%)")).toBe("40");
    expect(col(m2, "Aprovado")).toBe("");
    const m3 = linhas.find((x) => col(x, "ID da matrícula") === "m3");
    expect(col(m3, "Nota (%)")).toBe("");
    expect(col(m3, "Tentativas feitas")).toBe("0");
  });

  it("certificado revogado mostra a data e o motivo; curso de apoio não emite", () => {
    const revogado = {
      ...CERT_M1,
      revogado_em: "2026-09-15T12:00:00Z",
      motivo_revogacao: "Dado errado",
    };
    const csv2 = csvDasMatriculas({
      matriculas: [MATS[0]],
      curso: CURSO,
      funcionarios: FUNCS,
      aulas: AULAS,
      progresso: [],
      tentativas: [],
      certificados: [revogado],
    });
    const [c, l] = linhasDe(csv2).map(celulas);
    expect(l[c.indexOf("Situação do certificado")]).toBe("Revogado");
    expect(l[c.indexOf("Revogado em (Brasília)")]).toContain("15/09/2026");
    expect(l[c.indexOf("Motivo da revogação")]).toBe("Dado errado");

    const apoio = csvDasMatriculas({
      // a data de renovação ficou gravada de antes da D3: o apoio não a mostra
      matriculas: [{ ...MATS[1], proxima_renovacao: "2028-01-01" }],
      curso: { ...CURSO, modalidade: "apoio" },
      funcionarios: FUNCS,
      aulas: AULAS,
      progresso: [],
      tentativas: [],
      certificados: [],
    });
    const [c2, l2] = linhasDe(apoio).map(celulas);
    expect(l2[c2.indexOf("Situação do certificado")]).toBe("Não emite certificado");
    expect(l2[c2.indexOf("Renovar até")]).toBe("");
  });

  it("funcionário que não está no cadastro aparece como —, sem derrubar o arquivo", () => {
    const csv2 = csvDasMatriculas({
      matriculas: [{ ...MATS[1], funcionario_id: "fantasma" }],
      curso: CURSO,
      funcionarios: [],
      aulas: AULAS,
      progresso: [],
      tentativas: [],
      certificados: [],
    });
    expect(celulas(linhasDe(csv2)[1])[0]).toBe("—");
  });
});

describe("csvDasTentativas", () => {
  const csv = csvDasTentativas({ tentativas: TENT, matriculas: MATS, funcionarios: FUNCS });
  const linhas = linhasDe(csv).map(celulas);
  const cab = linhas[0];
  const col = (linha, titulo) => linha[cab.indexOf(titulo)];

  it("gera uma linha por questão respondida, na ordem em que o aluno viu a prova", () => {
    // t2 (Ana) vem antes por ordem de nome; t1 (Beatriz) tem 2 questões
    expect(linhas).toHaveLength(1 + 1 + 2);
    const beatriz = linhas.filter((l) => col(l, "Funcionário") === "Beatriz Teste");
    expect(beatriz.map((l) => [col(l, "Posição na prova"), col(l, "Pergunta")])).toEqual([
      ["1", "Segunda?"],
      ["2", "Primeira?"],
    ]);
  });

  it("mostra a alternativa marcada, a correta e o resultado, com a letra que o aluno viu", () => {
    const beatriz = linhas.filter((l) => col(l, "Funcionário") === "Beatriz Teste");
    const [segunda, primeira] = beatriz;
    // q2: alternativas exibidas [b2, b1]; marcou b2 (B vira A), a certa é b1 (B)
    expect(col(segunda, "Alternativa marcada")).toBe("A) b2");
    expect(col(segunda, "Alternativa correta")).toBe("B) b1");
    expect(col(segunda, "Resultado da questão")).toBe("Errou");
    // q1: exibidas [a3, a1, a2]; marcou a3 (A), certa a3
    expect(col(primeira, "Alternativa marcada")).toBe("A) a3");
    expect(col(primeira, "Alternativa correta")).toBe("A) a3");
    expect(col(primeira, "Resultado da questão")).toBe("Acertou");
    expect(col(primeira, "Ordem das alternativas")).toBe("Como o aluno viu");
  });

  it("repete na linha os dados da tentativa: nota, acertos, aprovação, IP e hora", () => {
    const l = linhas.find((x) => col(x, "Funcionário") === "Beatriz Teste");
    expect(col(l, "CPF")).toBe("123.456.789-09");
    expect(col(l, "Tentativa")).toBe("1");
    expect(col(l, "Nota (%)")).toBe("90");
    expect(col(l, "Acertos")).toBe("1");
    expect(col(l, "Total de questões")).toBe("2");
    expect(col(l, "Resultado")).toBe("Aprovado");
    expect(col(l, "IP")).toBe("203.0.113.7");
    expect(col(l, "Data e hora (Brasília)")).toContain("10/09/2026");
    expect(col(l, "Data e hora (UTC)")).toBe("2026-09-10T15:30:00.000Z");
  });

  it("tentativa sem a prova gravada não some: sai uma linha só com o resultado", () => {
    const l = linhas.find((x) => col(x, "Funcionário") === "Ana Teste (inativo)");
    expect(col(l, "Resultado")).toBe("Reprovado");
    expect(col(l, "Pergunta")).toBe("");
    expect(col(l, "Resultado da questão")).toBe("Prova não gravada nesta tentativa");
  });

  it("sem alternativa marcada aparece 'sem resposta'", () => {
    const t = {
      ...TENT[0],
      respostas: [{ questao_id: "q1", resposta: null, acertou: false, posicao_exibida: 1 }],
    };
    const csv2 = csvDasTentativas({ tentativas: [t], matriculas: MATS, funcionarios: FUNCS });
    const l = linhasDe(csv2).map(celulas);
    const q1 = l.find((x) => x[l[0].indexOf("Pergunta")] === "Primeira?");
    expect(q1[l[0].indexOf("Alternativa marcada")]).toBe("(sem resposta)");
    expect(q1[l[0].indexOf("Resultado da questão")]).toBe("Sem resposta");
    expect(q1[l[0].indexOf("Ordem das alternativas")]).toBe("Ordem do cadastro (não registrada)");
  });

  it("sem tentativas sai só o cabeçalho", () => {
    expect(
      linhasDe(csvDasTentativas({ tentativas: [], matriculas: MATS, funcionarios: FUNCS }))
    ).toHaveLength(1);
  });
});

describe("certificadosDoDossie", () => {
  const outroCurso = { ...CERT_M1, id: "k9", curso_id: "c9", codigo: "ZZZ-999" };
  const revogado = {
    ...CERT_M1,
    id: "k2",
    matricula_id: "m2",
    funcionario_id: "f2",
    codigo: "DEF-456",
    revogado_em: "2026-09-12T12:00:00Z",
  };

  it("leva os certificados do curso, em ordem de nome, e ignora os de outro curso", () => {
    const r = certificadosDoDossie({
      curso: CURSO,
      certificados: [CERT_M1, outroCurso, revogado],
      funcionarios: FUNCS,
    });
    expect(r.omitidos).toBe(false);
    expect(r.certificados.map((c) => c.codigo)).toEqual(["DEF-456", "ABC-123"]);
  });

  it("curso de apoio não leva certificado, mesmo que haja um gravado", () => {
    const r = certificadosDoDossie({
      curso: { ...CURSO, modalidade: "apoio" },
      certificados: [CERT_M1],
      funcionarios: FUNCS,
    });
    expect(r.omitidos).toBe(true);
    expect(r.certificados).toEqual([]);
  });

  it("nome do arquivo no ZIP: aluno, código, e REVOGADO quando é o caso; nunca repete", () => {
    const usados = new Set();
    expect(nomeDoCertificadoNoZip(CERT_M1, usados)).toBe("Certificado_Beatriz_Teste_ABC_123.pdf");
    expect(nomeDoCertificadoNoZip(revogado, usados)).toBe(
      "Certificado_Beatriz_Teste_DEF_456_REVOGADO.pdf"
    );
    // o mesmo nome pedido de novo ganha número
    expect(nomeDoCertificadoNoZip(CERT_M1, usados)).toBe("Certificado_Beatriz_Teste_ABC_123_2.pdf");
  });

  it("sem o nome do aluno no certificado usa o código", () => {
    expect(nomeDoCertificadoNoZip({ codigo: "X1", dados: {} }, new Set())).toBe(
      "Certificado_X1.pdf"
    );
  });
});

describe("textoLeiaMe", () => {
  const texto = textoLeiaMe({
    empresa: EMPRESA,
    curso: CURSO,
    aulas: AULAS,
    geradoEm: "2026-10-06T15:00:00Z",
    geradoPor: "rh@teste.invalid",
    arquivos: [{ caminho: "matriculas.csv", descricao: "3 matrículas" }],
    avisos: ["Aviso de teste."],
  });

  it("identifica a empresa, o curso, quem gerou e quando", () => {
    expect(texto).toContain("Empresa Teste Ltda");
    expect(texto).toContain("Curso de Teste");
    expect(texto).toContain("NRT");
    expect(texto).toContain("rh@teste.invalid");
    expect(texto).toContain("06/10/2026");
    expect(texto).toContain("RT Teste");
    expect(texto).toContain("Instrutor Teste");
  });

  it("lista as aulas que existem e não a removida", () => {
    expect(texto).toContain("1. Aula A");
    expect(texto).toContain("2. Aula B");
    expect(texto).not.toContain("Aula Velha");
  });

  it("lista os arquivos e os avisos", () => {
    expect(texto).toContain("matriculas.csv");
    expect(texto).toContain("3 matrículas");
    expect(texto).toContain("Aviso de teste.");
  });

  it("explica a origem dos eventos e o fuso dos horários", () => {
    expect(texto).toContain("navegador");
    expect(texto).toContain("Brasília");
  });

  it("usa quebra de linha do Windows", () => {
    expect(texto).toContain("\r\n");
    expect(texto.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("sem avisos diz que não houve", () => {
    const sem = textoLeiaMe({
      empresa: EMPRESA,
      curso: CURSO,
      aulas: [],
      geradoEm: "2026-10-06T15:00:00Z",
      arquivos: [],
      avisos: [],
    });
    expect(sem).toContain("Nenhum aviso");
  });
});

// ---------------------------------------------------------------------------------------------
// montarDossie: junta tudo num ZIP de verdade (JSZip roda no Node)

const PDF = new Uint8Array([37, 80, 68, 70]); // "%PDF"
const entrada = (extra = {}) => ({
  empresa: EMPRESA,
  curso: CURSO,
  aulas: AULAS,
  matriculas: MATS,
  funcionarios: FUNCS,
  progresso: PROG,
  eventos: EVENTOS,
  tentativas: TENT,
  certificados: [CERT_M1],
  geradoEm: "2026-10-06T15:00:00Z",
  geradoPor: "rh@teste.invalid",
  ...extra,
});
const deps = (extra = {}) => ({
  criarZip: () => new JSZip(),
  tipoDeSaida: "uint8array",
  lerProjeto: async () => PDF,
  gerarCertificado: async () => PDF,
  ...extra,
});
const abrir = async (conteudo) => JSZip.loadAsync(conteudo);
const nomes = (zip) =>
  Object.keys(zip.files)
    .filter((n) => !zip.files[n].dir)
    .sort();

describe("montarDossie", () => {
  it("monta o ZIP com leia-me, projeto, as 3 planilhas e o certificado, numa pasta só", async () => {
    const r = await montarDossie(entrada(), deps());
    expect(r.nomeArquivo).toBe("dossie_ead_NRT_2026-10-06.zip");
    const zip = await abrir(r.conteudo);
    const raiz = "dossie_ead_NRT_2026-10-06";
    expect(nomes(zip)).toEqual([
      `${raiz}/LEIA-ME.txt`,
      `${raiz}/certificados/Certificado_Beatriz_Teste_ABC_123.pdf`,
      `${raiz}/matriculas.csv`,
      `${raiz}/projeto-pedagogico.pdf`,
      `${raiz}/tentativas.csv`,
      `${raiz}/trilha.csv`,
    ]);
    expect(r.resumo.projeto).toBe("incluido");
    expect(r.resumo.matriculas).toBe(3);
    expect(r.resumo.removidas).toBe(1);
    expect(r.resumo.eventos).toBe(3);
    expect(r.resumo.tentativas).toBe(2);
    expect(r.resumo.certificados).toEqual({
      total: 1,
      incluidos: 1,
      falharam: [],
      omitidos: false,
    });
    expect(r.resumo.avisos).toEqual([]);
  });

  it("os CSVs começam com BOM (o Excel acerta os acentos) e as planilhas batem com as funções", async () => {
    const r = await montarDossie(entrada(), deps());
    const zip = await abrir(r.conteudo);
    const raiz = "dossie_ead_NRT_2026-10-06";
    const trilha = await zip.file(`${raiz}/trilha.csv`).async("string");
    expect(trilha.startsWith(BOM)).toBe(true);
    const eventos = eventosDoCurso({ eventos: EVENTOS, matriculas: MATS });
    expect(trilha).toBe(
      BOM + csvDaTrilha({ eventos, matriculas: MATS, funcionarios: FUNCS, aulas: AULAS })
    );
    const matriculas = await zip.file(`${raiz}/matriculas.csv`).async("string");
    expect(matriculas).toContain("Beatriz Teste");
    expect(matriculas).toContain("Ana Teste (inativo)");
    const leiame = await zip.file(`${raiz}/LEIA-ME.txt`).async("string");
    expect(leiame).toContain("Curso de Teste");
  });

  it("entrega ao gerador de certificado o registro do banco, um por vez", async () => {
    const dois = {
      ...CERT_M1,
      id: "k2",
      matricula_id: "m2",
      funcionario_id: "f2",
      codigo: "DEF-456",
    };
    const recebidos = [];
    let simultaneos = 0;
    let maximo = 0;
    const r = await montarDossie(
      entrada({ certificados: [CERT_M1, dois] }),
      deps({
        gerarCertificado: async (cert) => {
          simultaneos += 1;
          maximo = Math.max(maximo, simultaneos);
          await new Promise((ok) => setTimeout(ok, 1));
          recebidos.push(cert.codigo);
          simultaneos -= 1;
          return PDF;
        },
      })
    );
    expect(recebidos.sort()).toEqual(["ABC-123", "DEF-456"]);
    expect(maximo).toBe(1);
    expect(r.resumo.certificados.incluidos).toBe(2);
  });

  it("o PDF do projeto leva a extensão do arquivo anexado", async () => {
    const r = await montarDossie(
      entrada({ curso: { ...CURSO, projeto_pedagogico_ref: "treinamentos/e/projeto.docx" } }),
      deps()
    );
    const zip = await abrir(r.conteudo);
    expect(nomes(zip)).toContain("dossie_ead_NRT_2026-10-06/projeto-pedagogico.docx");
  });

  it("curso sem projeto anexado: gera o dossiê e avisa, sem chamar o leitor", async () => {
    let chamou = false;
    const r = await montarDossie(
      entrada({ curso: { ...CURSO, projeto_pedagogico_ref: null } }),
      deps({
        lerProjeto: async () => {
          chamou = true;
          return PDF;
        },
      })
    );
    expect(chamou).toBe(false);
    expect(r.resumo.projeto).toBe("sem_projeto");
    expect(r.resumo.avisos.join(" ")).toMatch(/projeto pedagógico/i);
    const zip = await abrir(r.conteudo);
    expect(nomes(zip).some((n) => n.includes("projeto-pedagogico"))).toBe(false);
    const leiame = await zip.file("dossie_ead_NRT_2026-10-06/LEIA-ME.txt").async("string");
    expect(leiame).toMatch(/não está anexado/i);
  });

  it("projeto de um sistema antigo (Base44) é arquivo perdido: avisa e não tenta baixar", async () => {
    let chamou = false;
    const r = await montarDossie(
      entrada({ curso: { ...CURSO, projeto_pedagogico_ref: "https://x.base44.app/projeto.pdf" } }),
      deps({
        lerProjeto: async () => {
          chamou = true;
          return PDF;
        },
      })
    );
    expect(chamou).toBe(false);
    expect(r.resumo.projeto).toBe("sem_projeto");
    expect(r.resumo.avisos.join(" ")).toMatch(/sistema antigo/i);
  });

  it("o projeto não baixou: o dossiê sai assim mesmo, com o aviso e sem o arquivo", async () => {
    const r = await montarDossie(
      entrada(),
      deps({
        lerProjeto: async () => {
          throw new Error("rede");
        },
      })
    );
    expect(r.resumo.projeto).toBe("falhou");
    expect(r.resumo.avisos.join(" ")).toMatch(/não pôde ser baixado/i);
    const zip = await abrir(r.conteudo);
    expect(nomes(zip).some((n) => n.includes("projeto-pedagogico"))).toBe(false);
  });

  it("o projeto que não baixou deixa a CAUSA no console (404, tempo esgotado, arquivo vazio), não só o aviso (A6)", async () => {
    const original = console.error;
    const logs = [];
    console.error = (...args) => logs.push(args.map(String).join(" "));
    try {
      for (const causa of ["HTTP 404", "tempo esgotado (60 s)"]) {
        const r = await montarDossie(
          entrada(),
          deps({
            lerProjeto: async () => {
              throw new Error(causa);
            },
          })
        );
        expect(r.resumo.projeto).toBe("falhou");
      }
      await montarDossie(entrada(), deps({ lerProjeto: async () => new Uint8Array(0) }));
    } finally {
      console.error = original;
    }
    expect(logs).toHaveLength(3);
    expect(logs[0]).toMatch(/projeto pedag/i);
    expect(logs[0]).toContain("HTTP 404");
    expect(logs[1]).toContain("tempo esgotado");
    expect(logs[2]).toContain("arquivo vazio");
    // o log não leva a referência do arquivo (o caminho tem o id da empresa)
    for (const l of logs) expect(l).not.toContain("treinamentos/");
  });

  it("projeto que volta vazio não entra como arquivo de zero byte: vira aviso", async () => {
    for (const vazio of [null, new Uint8Array(0)]) {
      const r = await montarDossie(entrada(), deps({ lerProjeto: async () => vazio }));
      expect(r.resumo.projeto).toBe("falhou");
      const zip = await abrir(r.conteudo);
      expect(nomes(zip).some((n) => n.includes("projeto-pedagogico"))).toBe(false);
    }
  });

  it("PDF de certificado que volta vazio conta como falha, não como arquivo vazio no pacote", async () => {
    for (const vazio of [null, new Uint8Array(0)]) {
      const r = await montarDossie(entrada(), deps({ gerarCertificado: async () => vazio }));
      expect(r.resumo.certificados.incluidos).toBe(0);
      expect(r.resumo.certificados.falharam.map((f) => f.codigo)).toEqual(["ABC-123"]);
      const zip = await abrir(r.conteudo);
      expect(nomes(zip).some((n) => n.includes("/certificados/"))).toBe(false);
    }
  });

  it("um certificado que falha não derruba o pacote: os outros entram e o que falhou é listado", async () => {
    const dois = {
      ...CERT_M1,
      id: "k2",
      matricula_id: "m2",
      funcionario_id: "f2",
      codigo: "DEF-456",
    };
    const r = await montarDossie(
      entrada({ certificados: [CERT_M1, dois] }),
      deps({
        gerarCertificado: async (cert) => {
          if (cert.codigo === "DEF-456") throw new Error("QR não ficou pronto");
          return PDF;
        },
      })
    );
    expect(r.resumo.certificados.incluidos).toBe(1);
    expect(r.resumo.certificados.falharam).toEqual([
      { codigo: "DEF-456", motivo: "QR não ficou pronto" },
    ]);
    const zip = await abrir(r.conteudo);
    expect(nomes(zip).filter((n) => n.includes("/certificados/"))).toHaveLength(1);
    const leiame = await zip.file("dossie_ead_NRT_2026-10-06/LEIA-ME.txt").async("string");
    expect(leiame).toContain("DEF-456");
    expect(r.resumo.avisos.join(" ")).toContain("DEF-456");
  });

  it("certificado que sai com ressalva entra no pacote e a ressalva vira aviso", async () => {
    const r = await montarDossie(
      entrada(),
      deps({
        gerarCertificado: async () => ({
          arquivo: PDF,
          aviso: "sem a imagem da assinatura do instrutor",
        }),
      })
    );
    expect(r.resumo.certificados.incluidos).toBe(1);
    expect(r.resumo.certificados.falharam).toEqual([]);
    expect(r.resumo.avisos).toEqual([
      "Certificados que saíram incompletos no pacote: ABC-123 (sem a imagem da assinatura do instrutor).",
    ]);
    const zip = await abrir(r.conteudo);
    expect(nomes(zip).filter((n) => n.includes("/certificados/"))).toHaveLength(1);
  });

  it("curso de apoio: sem pasta de certificados, sem chamar o gerador, com a explicação", async () => {
    let chamou = false;
    const r = await montarDossie(
      entrada({ curso: { ...CURSO, modalidade: "apoio" } }),
      deps({
        gerarCertificado: async () => {
          chamou = true;
          return PDF;
        },
      })
    );
    expect(chamou).toBe(false);
    expect(r.resumo.certificados).toEqual({ total: 0, incluidos: 0, falharam: [], omitidos: true });
    const zip = await abrir(r.conteudo);
    expect(nomes(zip).some((n) => n.includes("certificados/"))).toBe(false);
    const leiame = await zip.file("dossie_ead_NRT_2026-10-06/LEIA-ME.txt").async("string");
    expect(leiame).toMatch(/apoio/i);
    expect(leiame).toMatch(/não emite certificado/i);
    // não é falha: a explicação do apoio não vira aviso de erro
    expect(r.resumo.avisos).toEqual([]);
  });

  it("curso sem nenhum certificado emitido diz isso no leia-me e não cria a pasta", async () => {
    const r = await montarDossie(entrada({ certificados: [] }), deps());
    const zip = await abrir(r.conteudo);
    expect(nomes(zip).some((n) => n.includes("certificados/"))).toBe(false);
    const leiame = await zip.file("dossie_ead_NRT_2026-10-06/LEIA-ME.txt").async("string");
    expect(leiame).toMatch(/nenhum certificado/i);
  });

  it("leitura incompleta da trilha ou das tentativas vira aviso, nunca silêncio", async () => {
    const r = await montarDossie(entrada({ leituraIncompleta: ["trilha", "tentativas"] }), deps());
    const texto = r.resumo.avisos.join(" ");
    expect(texto).toMatch(/trilha/i);
    expect(texto).toMatch(/tentativas/i);
    const zip = await abrir(r.conteudo);
    const leiame = await zip.file("dossie_ead_NRT_2026-10-06/LEIA-ME.txt").async("string");
    expect(leiame).toMatch(/incompleta/i);
  });

  it("avisa o andamento: arquivos, cada certificado e, por fim, a compactação", async () => {
    const passos = [];
    await montarDossie(entrada(), deps({ aoProgredir: (p) => passos.push(p) }));
    expect(passos[0]).toMatchObject({ etapa: "arquivos" });
    expect(passos.filter((p) => p.etapa === "certificados").at(-1)).toMatchObject({
      feitos: 1,
      total: 1,
    });
    expect(passos.at(-1)).toMatchObject({ etapa: "compactando" });
  });

  it("um erro do avisar andamento não derruba a montagem", async () => {
    const r = await montarDossie(
      entrada(),
      deps({
        aoProgredir: () => {
          throw new Error("tela fechada");
        },
      })
    );
    expect(r.resumo.certificados.incluidos).toBe(1);
  });

  it("exige a fábrica de ZIP", async () => {
    await expect(montarDossie(entrada(), { lerProjeto: async () => PDF })).rejects.toThrow();
  });
});

describe("certificadoDaFicha: o certificado de cada curso na Ficha do funcionário", () => {
  const m = MATS[0];

  it("devolve o certificado da matrícula", () => {
    expect(certificadoDaFicha({ curso: CURSO, matricula: m, certificados: [CERT_M1] })).toEqual({
      certificado: CERT_M1,
      revogado: false,
    });
  });

  it("certificado revogado continua baixável, marcado como revogado", () => {
    const revogado = { ...CERT_M1, revogado_em: "2026-09-15T12:00:00Z" };
    expect(certificadoDaFicha({ curso: CURSO, matricula: m, certificados: [revogado] })).toEqual({
      certificado: revogado,
      revogado: true,
    });
  });

  it("curso de apoio não mostra certificado, mesmo com um gravado", () => {
    expect(
      certificadoDaFicha({
        curso: { ...CURSO, modalidade: "apoio" },
        matricula: m,
        certificados: [CERT_M1],
      })
    ).toBeNull();
  });

  it("matrícula sem certificado, ou certificado de outra matrícula, não mostra nada", () => {
    expect(
      certificadoDaFicha({ curso: CURSO, matricula: MATS[1], certificados: [CERT_M1] })
    ).toBeNull();
    expect(certificadoDaFicha({ curso: CURSO, matricula: m, certificados: [] })).toBeNull();
    expect(certificadoDaFicha({ curso: CURSO, matricula: m })).toBeNull();
  });

  it("curso removido (sem a linha do curso) ainda mostra o certificado emitido", () => {
    expect(certificadoDaFicha({ curso: undefined, matricula: m, certificados: [CERT_M1] })).toEqual(
      {
        certificado: CERT_M1,
        revogado: false,
      }
    );
  });
});

describe("avisoDoDossie: o toast depois de exportar", () => {
  it("tudo certo: sucesso com as contagens", () => {
    const a = avisoDoDossie({
      matriculas: 3,
      eventos: 10,
      tentativas: 2,
      certificados: { total: 1, incluidos: 1, falharam: [], omitidos: false },
      avisos: [],
    });
    expect(a.tipo).toBe("success");
    expect(a.texto).toContain("3 matrícula");
    expect(a.texto).toContain("1 certificado");
  });

  it("com avisos: alerta que diz o que faltou no pacote", () => {
    const a = avisoDoDossie({
      matriculas: 3,
      eventos: 10,
      tentativas: 2,
      certificados: {
        total: 2,
        incluidos: 1,
        falharam: [{ codigo: "X", motivo: "m" }],
        omitidos: false,
      },
      avisos: ["O certificado X não está no pacote."],
    });
    expect(a.tipo).toBe("warning");
    expect(a.texto).toContain("O certificado X não está no pacote.");
    expect(a.texto).toMatch(/LEIA-ME/);
  });
});

describe("textoDoAndamento: o que o botão diz enquanto exporta", () => {
  it("um texto por etapa, com o contador dos certificados", () => {
    expect(textoDoAndamento({ etapa: "lendo" })).toBe("Lendo os dados...");
    expect(textoDoAndamento({ etapa: "arquivos" })).toBe("Montando os arquivos...");
    expect(textoDoAndamento({ etapa: "certificados", feitos: 3, total: 12 })).toBe(
      "Certificados 3/12..."
    );
    expect(textoDoAndamento({ etapa: "compactando" })).toBe("Compactando...");
  });

  it("etapa desconhecida ou vazia não deixa o botão sem texto", () => {
    expect(textoDoAndamento({ etapa: "?" })).toBe("Exportando...");
    expect(textoDoAndamento(undefined)).toBe("Exportando...");
  });
});
