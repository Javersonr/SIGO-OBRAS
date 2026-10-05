import { describe, it, expect } from "vitest";
import {
  PREFIXO_POSICAO,
  PREFIXO_PROVA,
  numerarAulas,
  proximaAulaPendente,
  aulaSeguinte,
  progressoDoCurso,
  ordenarMatriculas,
  agruparMatriculas,
  ehRenovacao,
  cursoDespublicado,
  posicaoParaRetomar,
  guardarPosicao,
  lerPosicao,
  respostasValidas,
  resumoRespostas,
  textoSairDaProva,
  guardarRascunhoProva,
  lerRascunhoProva,
  limparRascunhoProva,
  limparRascunhosPortal,
  MAX_ESPERA_MS,
  MSG_SEM_CONEXAO,
  MSG_SERVICO_INDISPONIVEL,
  msAteLiberar,
  msTemporizadorProva,
  provaAguardando,
  mensagemDeFalha,
  urlDoProjetoPedagogico,
  abrirProjetoPedagogico,
} from "./portal-curso";

/** Storage de mentira: guarda em memória e deixa ver o que foi gravado. */
function criarStorage(inicial = {}) {
  const dados = new Map(Object.entries(inicial));
  return {
    dados,
    get length() {
      return dados.size;
    },
    key: (i) => [...dados.keys()][i] ?? null,
    getItem: (k) => (dados.has(k) ? dados.get(k) : null),
    setItem: (k, v) => dados.set(k, String(v)),
    removeItem: (k) => dados.delete(k),
  };
}

const storageQuebrado = {
  get length() {
    throw new Error("sem storage");
  },
  key() {
    throw new Error("sem storage");
  },
  getItem() {
    throw new Error("sem storage");
  },
  setItem() {
    throw new Error("cota cheia");
  },
  removeItem() {
    throw new Error("sem storage");
  },
};

const aula = (id, extra = {}) => ({ id, ordem: 1, concluida: false, liberada: false, ...extra });

describe("numerarAulas", () => {
  it("numera pela posição na lista (1, 2, 3...), ignorando a coluna ordem", () => {
    const lista = [
      aula("a", { ordem: 0, titulo: "Guia do curso" }),
      aula("b", { ordem: 1 }),
      aula("c", { ordem: 7 }),
    ];
    const numeradas = numerarAulas(lista);
    expect(numeradas.map((a) => a.numero)).toEqual([1, 2, 3]);
    expect(numeradas[0].titulo).toBe("Guia do curso");
    expect(numeradas.map((a) => a.id)).toEqual(["a", "b", "c"]);
  });

  it("não altera a lista de entrada e mantém a ordem recebida", () => {
    const lista = [aula("x", { ordem: 9 }), aula("y", { ordem: 2 })];
    const numeradas = numerarAulas(lista);
    expect(lista[0].numero).toBeUndefined();
    expect(numeradas.map((a) => a.id)).toEqual(["x", "y"]);
  });

  it("aceita lista vazia, nula ou que não é lista", () => {
    expect(numerarAulas([])).toEqual([]);
    expect(numerarAulas(null)).toEqual([]);
    expect(numerarAulas(undefined)).toEqual([]);
    expect(numerarAulas("aulas")).toEqual([]);
  });
});

describe("proximaAulaPendente", () => {
  it("é a primeira aula não concluída que já está liberada", () => {
    const lista = [
      aula("a", { concluida: true, liberada: true }),
      aula("b", { concluida: true, liberada: true }),
      aula("c", { liberada: true }),
      aula("d"),
    ];
    expect(proximaAulaPendente(lista).id).toBe("c");
  });

  it("curso novo: a primeira aula", () => {
    expect(proximaAulaPendente([aula("a", { liberada: true }), aula("b")]).id).toBe("a");
  });

  it("tudo concluído, lista vazia ou entrada inválida: null", () => {
    expect(
      proximaAulaPendente([
        aula("a", { concluida: true, liberada: true }),
        aula("b", { concluida: true, liberada: true }),
      ])
    ).toBeNull();
    expect(proximaAulaPendente([])).toBeNull();
    expect(proximaAulaPendente(null)).toBeNull();
    expect(proximaAulaPendente(undefined)).toBeNull();
  });

  it("a primeira pendente ainda bloqueada (dado inconsistente) não vira beco sem saída: null", () => {
    expect(proximaAulaPendente([aula("a"), aula("b")])).toBeNull();
  });

  it("ignora itens nulos no meio da lista", () => {
    expect(proximaAulaPendente([null, aula("a", { liberada: true })]).id).toBe("a");
  });
});

describe("aulaSeguinte (botão Próxima aula)", () => {
  const lista = [
    aula("a", { concluida: true, liberada: true }),
    aula("b", { concluida: true, liberada: true }),
    aula("c", { liberada: true }),
    aula("d"),
  ];

  it("é a aula logo depois da informada, quando já está liberada", () => {
    expect(aulaSeguinte(lista, "a").id).toBe("b");
    expect(aulaSeguinte(lista, "b").id).toBe("c");
  });

  it("revendo uma aula antiga, segue a ordem (não pula para a pendente)", () => {
    expect(aulaSeguinte(lista, "a").id).not.toBe(proximaAulaPendente(lista).id);
  });

  it("a seguinte ainda bloqueada, a última aula e id desconhecido: null", () => {
    expect(aulaSeguinte(lista, "c")).toBeNull();
    expect(aulaSeguinte(lista, "d")).toBeNull();
    expect(aulaSeguinte(lista, "nao-existe")).toBeNull();
  });

  it("entrada inválida: null", () => {
    expect(aulaSeguinte(null, "a")).toBeNull();
    expect(aulaSeguinte([], "a")).toBeNull();
    expect(aulaSeguinte(lista, undefined)).toBeNull();
  });
});

describe("progressoDoCurso", () => {
  it("conta aulas e percentual (para baixo)", () => {
    const lista = [aula("a", { concluida: true }), aula("b", { concluida: true }), aula("c")];
    expect(progressoDoCurso(lista)).toEqual({
      total: 3,
      feitas: 2,
      percentual: 66,
      semAulas: false,
    });
  });

  it("curso sem aulas é sinalizado (não divide por zero)", () => {
    expect(progressoDoCurso([])).toEqual({ total: 0, feitas: 0, percentual: 0, semAulas: true });
    expect(progressoDoCurso(null)).toEqual({ total: 0, feitas: 0, percentual: 0, semAulas: true });
  });

  it("tudo feito = 100", () => {
    expect(progressoDoCurso([aula("a", { concluida: true })]).percentual).toBe(100);
  });
});

const item = (id, status, extra = {}, curso = {}) => ({
  matricula: { id, status, curso_id: `curso-${id}`, ...extra },
  curso: { id: `curso-${id}`, nome: `Curso ${id}`, ...curso },
});

describe("ordenarMatriculas", () => {
  it("em andamento primeiro, depois pendentes, e por último os concluídos", () => {
    const itens = [
      item("conc", "concluido", { data_conclusao: "2026-03-01" }),
      item("pend", "pendente", { created_at: "2026-01-01T10:00:00Z" }),
      item("and", "em_andamento", { created_at: "2026-02-01T10:00:00Z" }),
    ];
    expect(ordenarMatriculas(itens).map((i) => i.matricula.id)).toEqual(["and", "pend", "conc"]);
  });

  it("concluídos: o mais recente primeiro (por data de conclusão)", () => {
    const itens = [
      item("velho", "concluido", { data_conclusao: "2025-01-10" }),
      item("novo", "concluido", { data_conclusao: "2026-09-30" }),
      item("meio", "concluido", { data_conclusao: "2026-02-15" }),
    ];
    expect(ordenarMatriculas(itens).map((i) => i.matricula.id)).toEqual(["novo", "meio", "velho"]);
  });

  it("concluído sem data vai para o fim dos concluídos", () => {
    const itens = [
      item("sem", "concluido", {}),
      item("com", "concluido", { data_conclusao: "2024-05-05" }),
    ];
    expect(ordenarMatriculas(itens).map((i) => i.matricula.id)).toEqual(["com", "sem"]);
  });

  it("não concluídos: atribuição mais antiga primeiro, depois o nome (NR-6 antes de NR-10)", () => {
    const itens = [
      item("b", "pendente", { created_at: "2026-05-02T00:00:00Z" }, { nome: "NR-6" }),
      item("a", "pendente", { created_at: "2026-05-01T00:00:00Z" }, { nome: "NR-35" }),
      item("c", "pendente", { created_at: "2026-05-02T00:00:00Z" }, { nome: "NR-10" }),
    ];
    expect(ordenarMatriculas(itens).map((i) => i.matricula.id)).toEqual(["a", "b", "c"]);
  });

  it("não muda a lista de entrada e aceita entrada inválida", () => {
    const itens = [item("conc", "concluido"), item("and", "em_andamento")];
    const copia = [...itens];
    ordenarMatriculas(itens);
    expect(itens).toEqual(copia);
    expect(ordenarMatriculas(null)).toEqual([]);
    expect(ordenarMatriculas(undefined)).toEqual([]);
  });

  it("renovação: a nova (pendente) vem antes da antiga (concluída), nunca as duas iguais na ordem de chegada", () => {
    const antiga = item("1", "concluido", { curso_id: "nr10", data_conclusao: "2024-06-01" });
    const nova = item("2", "pendente", { curso_id: "nr10", created_at: "2026-09-01T00:00:00Z" });
    expect(ordenarMatriculas([antiga, nova]).map((i) => i.matricula.id)).toEqual(["2", "1"]);
    expect(ordenarMatriculas([nova, antiga]).map((i) => i.matricula.id)).toEqual(["2", "1"]);
  });

  it("status desconhecido fica entre os não concluídos, depois dos pendentes", () => {
    const itens = [item("x", "qualquer"), item("p", "pendente"), item("c", "concluido")];
    expect(ordenarMatriculas(itens).map((i) => i.matricula.id)).toEqual(["p", "x", "c"]);
  });
});

describe("agruparMatriculas", () => {
  it("separa em andamento e concluídos, cada um já ordenado", () => {
    const itens = [
      item("c1", "concluido", { data_conclusao: "2025-01-01" }),
      item("p", "pendente"),
      item("c2", "concluido", { data_conclusao: "2026-01-01" }),
      item("a", "em_andamento"),
    ];
    const { andamento, concluidos } = agruparMatriculas(itens);
    expect(andamento.map((i) => i.matricula.id)).toEqual(["a", "p"]);
    expect(concluidos.map((i) => i.matricula.id)).toEqual(["c2", "c1"]);
  });

  it("sem matrículas: dois grupos vazios", () => {
    expect(agruparMatriculas([])).toEqual({ andamento: [], concluidos: [] });
    expect(agruparMatriculas(null)).toEqual({ andamento: [], concluidos: [] });
  });
});

describe("ehRenovacao", () => {
  it("matrícula não concluída de curso que o aluno já concluiu é renovação", () => {
    const antiga = item("1", "concluido", { curso_id: "nr10" });
    const nova = item("2", "pendente", { curso_id: "nr10" });
    const outra = item("3", "pendente", { curso_id: "nr35" });
    expect(ehRenovacao(nova, [antiga, nova, outra])).toBe(true);
    expect(ehRenovacao(outra, [antiga, nova, outra])).toBe(false);
  });

  it("a concluída nunca é renovação, mesmo havendo outra do mesmo curso", () => {
    const antiga = item("1", "concluido", { curso_id: "nr10" });
    const nova = item("2", "pendente", { curso_id: "nr10" });
    expect(ehRenovacao(antiga, [antiga, nova])).toBe(false);
  });

  it("entrada inválida: false", () => {
    expect(ehRenovacao(null, [])).toBe(false);
    expect(ehRenovacao(item("1", "pendente"), null)).toBe(false);
  });
});

describe("cursoDespublicado", () => {
  it("só ativo === false é despublicado (campo ausente = curso publicado)", () => {
    expect(cursoDespublicado({ ativo: false })).toBe(true);
    expect(cursoDespublicado({ ativo: true })).toBe(false);
    expect(cursoDespublicado({})).toBe(false);
    expect(cursoDespublicado(null)).toBe(false);
    expect(cursoDespublicado(undefined)).toBe(false);
  });
});

describe("posicaoParaRetomar", () => {
  it("usa a posição guardada no aparelho quando existe", () => {
    expect(posicaoParaRetomar({ salva: 125.7, segundosAssistidos: 300, duracao: 600 })).toBe(125);
  });

  it("sem posição guardada, usa o tempo já contado pelo servidor", () => {
    expect(posicaoParaRetomar({ salva: null, segundosAssistidos: 300, duracao: 600 })).toBe(300);
    expect(posicaoParaRetomar({ segundosAssistidos: 42, duracao: 600 })).toBe(42);
  });

  it("aula concluída recomeça do início (o aluno está revendo)", () => {
    expect(
      posicaoParaRetomar({ salva: 200, segundosAssistidos: 600, duracao: 600, concluida: true })
    ).toBe(0);
  });

  it("começo e fim do vídeo não retomam: abaixo de 5 s ou nos últimos 5 s volta ao início", () => {
    expect(posicaoParaRetomar({ salva: 4.9, duracao: 600 })).toBe(0);
    expect(posicaoParaRetomar({ salva: 5, duracao: 600 })).toBe(5);
    expect(posicaoParaRetomar({ salva: 594, duracao: 600 })).toBe(594);
    expect(posicaoParaRetomar({ salva: 595, duracao: 600 })).toBe(0);
    expect(posicaoParaRetomar({ salva: 700, duracao: 600 })).toBe(0);
  });

  it("posição guardada 0 (recomeçou) vale: não cai no tempo contado", () => {
    expect(posicaoParaRetomar({ salva: 0, segundosAssistidos: 300, duracao: 600 })).toBe(0);
  });

  it("sem duração válida ainda retoma pelo que se sabe (YouTube ou cadastro incompleto)", () => {
    expect(posicaoParaRetomar({ salva: 90, duracao: null })).toBe(90);
    expect(posicaoParaRetomar({ salva: 90, duracao: 0 })).toBe(90);
  });

  it("valores inválidos viram 0", () => {
    for (const ruim of [NaN, -3, "abc", Infinity, {}, []]) {
      expect(posicaoParaRetomar({ salva: ruim, segundosAssistidos: ruim, duracao: 600 })).toBe(0);
    }
    expect(posicaoParaRetomar({})).toBe(0);
    expect(posicaoParaRetomar()).toBe(0);
  });
});

describe("posição do vídeo no navegador", () => {
  it("guarda e lê por matrícula e aula", () => {
    const st = criarStorage();
    guardarPosicao(st, "m1", "a1", 83.4);
    expect(lerPosicao(st, "m1", "a1")).toBe(83);
    expect(lerPosicao(st, "m1", "a2")).toBeNull();
    expect(lerPosicao(st, "m2", "a1")).toBeNull();
    expect([...st.dados.keys()][0].startsWith(PREFIXO_POSICAO)).toBe(true);
  });

  it("ignora posição inválida (não sobrescreve) e guarda 0 como recomeço", () => {
    const st = criarStorage();
    guardarPosicao(st, "m1", "a1", 50);
    guardarPosicao(st, "m1", "a1", NaN);
    expect(lerPosicao(st, "m1", "a1")).toBe(50);
    guardarPosicao(st, "m1", "a1", 0);
    expect(lerPosicao(st, "m1", "a1")).toBe(0);
  });

  it("valor corrompido no storage vira null", () => {
    const st = criarStorage({ [`${PREFIXO_POSICAO}m1:a1`]: "lixo" });
    expect(lerPosicao(st, "m1", "a1")).toBeNull();
  });

  it("sem storage ou storage que falha: não lança", () => {
    expect(() => guardarPosicao(null, "m", "a", 10)).not.toThrow();
    expect(() => guardarPosicao(storageQuebrado, "m", "a", 10)).not.toThrow();
    expect(lerPosicao(null, "m", "a")).toBeNull();
    expect(lerPosicao(storageQuebrado, "m", "a")).toBeNull();
  });
});

const questoes = [
  { id: "q1", opcoes: ["a", "b", "c", "d"] },
  { id: "q2", opcoes: ["a", "b", "c"] },
  { id: "q3", opcoes: ["a", "b"] },
];

describe("resumoRespostas", () => {
  it("conta respondidas e aponta a primeira sem resposta (índice 0 conta como resposta)", () => {
    expect(resumoRespostas(questoes, { q1: 0, q3: 1 })).toEqual({
      total: 3,
      respondidas: 2,
      faltam: 1,
      primeiraSemResposta: 1,
      completa: false,
    });
  });

  it("prova completa", () => {
    const r = resumoRespostas(questoes, { q1: 3, q2: 0, q3: 1 });
    expect(r.completa).toBe(true);
    expect(r.primeiraSemResposta).toBe(-1);
    expect(r.faltam).toBe(0);
  });

  it("nenhuma resposta: primeira é a questão 0", () => {
    const r = resumoRespostas(questoes, {});
    expect(r.respondidas).toBe(0);
    expect(r.primeiraSemResposta).toBe(0);
    expect(r.completa).toBe(false);
  });

  it("resposta de questão que não está na prova não conta", () => {
    expect(resumoRespostas(questoes, { q1: 0, fantasma: 2 }).respondidas).toBe(1);
  });

  it("prova sem questões nunca é completa (não há o que enviar)", () => {
    expect(resumoRespostas([], {})).toEqual({
      total: 0,
      respondidas: 0,
      faltam: 0,
      primeiraSemResposta: -1,
      completa: false,
    });
    expect(resumoRespostas(null, null).total).toBe(0);
  });
});

describe("textoSairDaProva (aviso ao voltar às aulas no meio da prova)", () => {
  it("aluno: diz quantas respondeu e que as respostas ficam no aparelho", () => {
    const texto = textoSairDaProva({ respondidas: 3, total: 10 });
    expect(texto).toContain("respondeu 3 de 10 questões");
    expect(texto).toContain("ficam guardadas neste aparelho");
    expect(texto).toContain("só vale depois de enviada");
  });

  it("prévia: nada é guardado, então o texto NÃO promete guardar", () => {
    const texto = textoSairDaProva({ respondidas: 2, total: 5, previa: true });
    expect(texto).toContain("respondeu 2 de 5 questões");
    expect(texto).toMatch(/nada é guardado/);
    expect(texto).toMatch(/se perdem/);
    expect(texto).not.toMatch(/ficam guardadas|voltam quando/);
  });
});

describe("respostasValidas", () => {
  it("mantém só resposta de questão existente e alternativa que existe", () => {
    expect(respostasValidas(questoes, { q1: 3, q2: 3, q3: 0, fantasma: 1, q4: 0 })).toEqual({
      q1: 3,
      q3: 0,
    });
  });

  it("recusa tipo errado, negativo e decimal", () => {
    expect(respostasValidas(questoes, { q1: "1", q2: -1, q3: 0.5 })).toEqual({});
    expect(respostasValidas(questoes, null)).toEqual({});
    expect(respostasValidas(null, { q1: 0 })).toEqual({});
  });
});

describe("rascunho da prova no navegador", () => {
  it("guarda e recupera só as respostas ainda válidas", () => {
    const st = criarStorage();
    guardarRascunhoProva(st, "m1", 2, { q1: 1, q2: 2, q3: 0 });
    expect(lerRascunhoProva(st, "m1", 2, questoes)).toEqual({ q1: 1, q2: 2, q3: 0 });
    // a prova mudou: q2 ficou com 2 alternativas e q3 sumiu
    const mudou = [
      { id: "q1", opcoes: ["a", "b"] },
      { id: "q2", opcoes: ["a", "b"] },
    ];
    expect(lerRascunhoProva(st, "m1", 2, mudou)).toEqual({ q1: 1 });
  });

  it("é por matrícula e por tentativa: o rascunho da tentativa anterior não volta", () => {
    const st = criarStorage();
    guardarRascunhoProva(st, "m1", 1, { q1: 1 });
    expect(lerRascunhoProva(st, "m1", 2, questoes)).toEqual({});
    expect(lerRascunhoProva(st, "m2", 1, questoes)).toEqual({});
    expect(lerRascunhoProva(st, "m1", 1, questoes)).toEqual({ q1: 1 });
  });

  it("rascunho vazio apaga o que havia", () => {
    const st = criarStorage();
    guardarRascunhoProva(st, "m1", 1, { q1: 1 });
    guardarRascunhoProva(st, "m1", 1, {});
    expect(st.dados.size).toBe(0);
  });

  it("limparRascunhoProva remove só o da matrícula e tentativa", () => {
    const st = criarStorage();
    guardarRascunhoProva(st, "m1", 1, { q1: 1 });
    guardarRascunhoProva(st, "m1", 2, { q1: 0 });
    limparRascunhoProva(st, "m1", 1);
    expect(lerRascunhoProva(st, "m1", 1, questoes)).toEqual({});
    expect(lerRascunhoProva(st, "m1", 2, questoes)).toEqual({ q1: 0 });
  });

  it("conteúdo corrompido ou com formato errado vira {}", () => {
    const st = criarStorage({
      [`${PREFIXO_PROVA}m1:1`]: "{não é json",
      [`${PREFIXO_PROVA}m1:2`]: JSON.stringify([1, 2, 3]),
      [`${PREFIXO_PROVA}m1:3`]: JSON.stringify({ respostas: "x" }),
    });
    expect(lerRascunhoProva(st, "m1", 1, questoes)).toEqual({});
    expect(lerRascunhoProva(st, "m1", 2, questoes)).toEqual({});
    expect(lerRascunhoProva(st, "m1", 3, questoes)).toEqual({});
  });

  it("sem storage ou storage que falha: não lança", () => {
    expect(() => guardarRascunhoProva(null, "m", 1, { q1: 0 })).not.toThrow();
    expect(() => guardarRascunhoProva(storageQuebrado, "m", 1, { q1: 0 })).not.toThrow();
    expect(() => limparRascunhoProva(storageQuebrado, "m", 1)).not.toThrow();
    expect(lerRascunhoProva(storageQuebrado, "m", 1, questoes)).toEqual({});
    expect(lerRascunhoProva(null, "m", 1, questoes)).toEqual({});
  });
});

describe("limparRascunhosPortal (ao sair do portal)", () => {
  it("remove posições e rascunhos de prova e deixa o resto do storage", () => {
    const st = criarStorage({ sigo_portal_funcionario: "sessao", outra: "1" });
    guardarPosicao(st, "m1", "a1", 50);
    guardarRascunhoProva(st, "m1", 1, { q1: 1 });
    limparRascunhosPortal(st);
    expect([...st.dados.keys()].sort()).toEqual(["outra", "sigo_portal_funcionario"]);
  });

  it("sem storage ou storage que falha: não lança", () => {
    expect(() => limparRascunhosPortal(null)).not.toThrow();
    expect(() => limparRascunhosPortal(storageQuebrado)).not.toThrow();
  });
});

describe("msAteLiberar e provaAguardando (temporizador da nova tentativa)", () => {
  const agora = Date.parse("2026-10-05T12:00:00Z");

  it("faltando tempo: milissegundos até o horário", () => {
    expect(msAteLiberar("2026-10-05T12:00:30Z", agora)).toBe(30000);
    expect(provaAguardando("2026-10-05T12:00:30Z", agora)).toBe(true);
  });

  it("no horário exato ou depois: liberada", () => {
    expect(msAteLiberar("2026-10-05T12:00:00Z", agora)).toBe(0);
    expect(msAteLiberar("2026-10-05T11:59:00Z", agora)).toBe(0);
    expect(provaAguardando("2026-10-05T12:00:00Z", agora)).toBe(false);
    expect(provaAguardando("2026-10-05T11:00:00Z", agora)).toBe(false);
  });

  it("sem horário ou inválido: não há espera", () => {
    for (const ruim of [null, undefined, "", "ontem", NaN]) {
      expect(msAteLiberar(ruim, agora)).toBe(0);
      expect(provaAguardando(ruim, agora)).toBe(false);
    }
  });

  it("espera muito longa é limitada ao máximo do setTimeout (o temporizador rearma depois)", () => {
    const longe = new Date(agora + 90 * 24 * 3600 * 1000).toISOString();
    expect(msAteLiberar(longe, agora)).toBe(2147483647);
    expect(provaAguardando(longe, agora)).toBe(true);
  });
});

describe("msTemporizadorProva (o setTimeout que reabilita a prova)", () => {
  const agora = Date.parse("2026-10-05T12:00:00Z");
  const em = (ms) => new Date(agora + ms).toISOString();

  it("faltando tempo: a espera mais uma folga curta, para o relógio do servidor já ter passado", () => {
    expect(msTemporizadorProva(em(30000), agora)).toBe(30300);
    expect(msTemporizadorProva(em(30000), agora, 1000)).toBe(31000);
  });

  it("sem espera (horário passado, ausente ou inválido): 0, nenhum temporizador", () => {
    for (const ruim of [em(0), em(-60000), null, undefined, "", "ontem"]) {
      expect(msTemporizadorProva(ruim, agora)).toBe(0);
    }
  });

  it("nunca passa do máximo do setTimeout: acima disso o navegador dispara na hora e a tela entra em laço", () => {
    // o intervalo entre tentativas é digitado pelo RH; 90 dias em minutos é um valor possível no campo
    for (const dias of [24.8, 25, 90, 36500]) {
      const espera = msTemporizadorProva(em(dias * 24 * 3600 * 1000), agora);
      expect(espera).toBeGreaterThan(0);
      expect(espera).toBeLessThanOrEqual(MAX_ESPERA_MS);
    }
    // bem na beirada: a folga não empurra para além do máximo
    expect(msTemporizadorProva(em(MAX_ESPERA_MS), agora)).toBe(MAX_ESPERA_MS);
    expect(msTemporizadorProva(em(MAX_ESPERA_MS - 100), agora)).toBe(MAX_ESPERA_MS);
    expect(msTemporizadorProva(em(MAX_ESPERA_MS - 1000), agora)).toBe(MAX_ESPERA_MS - 700);
  });
});

describe("urlDoProjetoPedagogico (link renovado do projeto pedagógico)", () => {
  const dados = (url, matriculaId = "m1") => ({
    cursos: [
      { matricula: { id: "outra" }, curso: { projeto_pedagogico_url: "https://outro.test/a.pdf" } },
      { matricula: { id: matriculaId }, curso: { projeto_pedagogico_url: url } },
    ],
  });

  it("devolve a URL do curso da matrícula, não a de outro curso", () => {
    expect(urlDoProjetoPedagogico(dados("https://sig.test/projeto.pdf?t=1"), "m1")).toBe(
      "https://sig.test/projeto.pdf?t=1"
    );
  });

  it("sem dados (a busca falhou), matrícula ausente ou sem projeto: null", () => {
    expect(urlDoProjetoPedagogico(null, "m1")).toBeNull();
    expect(urlDoProjetoPedagogico(undefined, "m1")).toBeNull();
    expect(urlDoProjetoPedagogico({}, "m1")).toBeNull();
    expect(urlDoProjetoPedagogico(dados("https://sig.test/p.pdf"), "nao-existe")).toBeNull();
    for (const sem of [null, undefined, ""]) {
      expect(urlDoProjetoPedagogico(dados(sem), "m1")).toBeNull();
    }
  });

  it("link que não é http(s) não abre (nada de about:blank nem javascript:)", () => {
    for (const ruim of ["about:blank", "javascript:alert(1)", "/relativo.pdf", "   "]) {
      expect(urlDoProjetoPedagogico(dados(ruim), "m1")).toBeNull();
    }
  });
});

describe("abrirProjetoPedagogico (botão do cabeçalho do curso)", () => {
  const URL_ANTIGA = "https://sig.test/projeto.pdf?token=antigo";
  const URL_NOVA = "https://sig.test/projeto.pdf?token=novo";
  const dadosCom = (url) => ({
    cursos: [{ matricula: { id: "m1" }, curso: { projeto_pedagogico_url: url } }],
  });

  /** `window` de mentira: registra as aberturas e devolve uma aba de mentira (ou null = pop-up bloqueado). */
  function ambiente({ bloqueada = false } = {}) {
    const aberturas = [];
    const aba = { closed: false, opener: "janela-do-portal", location: { href: "" } };
    aba.close = () => {
      aba.closed = true;
    };
    const janela = {
      open: (...args) => {
        aberturas.push(args);
        return bloqueada ? null : aba;
      },
    };
    return { janela, aba, aberturas };
  }

  const base = { urlAtual: URL_ANTIGA, matriculaId: "m1" };

  it("link ainda válido: abre direto, na hora, sem buscar os dados", async () => {
    const { janela, aberturas } = ambiente();
    let buscou = 0;
    const r = await abrirProjetoPedagogico({
      ...base,
      janela,
      vencida: false,
      recarregar: async () => {
        buscou += 1;
        return null;
      },
    });
    expect(r).toBe("aberto");
    expect(aberturas).toEqual([[URL_ANTIGA, "_blank", "noopener"]]);
    expect(buscou).toBe(0);
  });

  it("link válido mas que não é http(s): não abre nada", async () => {
    const { janela, aberturas } = ambiente();
    for (const ruim of [null, "", "about:blank", "javascript:alert(1)"]) {
      const r = await abrirProjetoPedagogico({
        ...base,
        urlAtual: ruim,
        janela,
        vencida: false,
        recarregar: async () => null,
      });
      expect(r).toBe("sem_link");
    }
    expect(aberturas).toHaveLength(0);
  });

  it("link possivelmente vencido: a aba abre JÁ no clique (antes da busca) e vai ao link renovado", async () => {
    const { janela, aba, aberturas } = ambiente();
    let chamadas = 0;
    const promessa = abrirProjetoPedagogico({
      ...base,
      janela,
      vencida: true,
      recarregar: async () => {
        chamadas += 1;
        return dadosCom(URL_NOVA);
      },
    });
    // síncrono, como no clique: a aba em branco já abriu e os dados já estão sendo buscados
    expect(aberturas).toEqual([["", "_blank"]]);
    expect(chamadas).toBe(1);
    expect(aba.opener).toBeNull(); // a aba em branco não fica ligada ao portal
    expect(aba.location.href).toBe(""); // ainda esperando o link novo
    expect(await promessa).toBe("aberto");
    expect(aba.location.href).toBe(URL_NOVA); // nunca o link velho
    expect(aba.closed).toBe(false);
  });

  it("não conseguiu renovar (sem rede ou sem link no curso): fecha a aba vazia e avisa", async () => {
    for (const recarregar of [
      async () => null, // a busca falhou
      async () => dadosCom(null), // o curso não tem mais projeto
      async () => {
        throw new Error("falha inesperada");
      },
    ]) {
      const { janela, aba } = ambiente();
      const r = await abrirProjetoPedagogico({ ...base, janela, vencida: true, recarregar });
      expect(r).toBe("sem_link");
      expect(aba.closed).toBe(true); // nada de aba em branco esquecida nem de link morto
      expect(aba.location.href).toBe("");
    }
  });

  it("pop-up bloqueado: renova mesmo assim e pede para tocar de novo (link já novo)", async () => {
    const { janela } = ambiente({ bloqueada: true });
    const r = await abrirProjetoPedagogico({
      ...base,
      janela,
      vencida: true,
      recarregar: async () => dadosCom(URL_NOVA),
    });
    expect(r).toBe("renovado");
  });

  it("o aluno fechou a aba enquanto esperava: renovado, sem mexer na aba fechada", async () => {
    const { janela, aba } = ambiente();
    const r = await abrirProjetoPedagogico({
      ...base,
      janela,
      vencida: true,
      recarregar: async () => {
        aba.closed = true;
        return dadosCom(URL_NOVA);
      },
    });
    expect(r).toBe("renovado");
    expect(aba.location.href).toBe("");
  });

  it("avisa o início e o fim da busca (o botão mostra andamento), mesmo quando ela falha", async () => {
    for (const recarregar of [
      async () => dadosCom(URL_NOVA),
      async () => {
        throw new Error("x");
      },
    ]) {
      const { janela } = ambiente();
      const marcas = [];
      await abrirProjetoPedagogico({
        ...base,
        janela,
        vencida: true,
        recarregar,
        aoComecarBusca: () => marcas.push("comecou"),
        aoTerminarBusca: () => marcas.push("terminou"),
      });
      expect(marcas).toEqual(["comecou", "terminou"]);
    }
  });

  it("a aba que não aceita mexer no opener (navegador restrito) não impede de abrir", async () => {
    const aba = { closed: false, location: { href: "" }, close() {} };
    Object.defineProperty(aba, "opener", {
      get: () => "x",
      set: () => {
        throw new Error("opener somente leitura");
      },
    });
    const janela = { open: () => aba };
    const r = await abrirProjetoPedagogico({
      ...base,
      janela,
      vencida: true,
      recarregar: async () => dadosCom(URL_NOVA),
    });
    expect(r).toBe("aberto");
    expect(aba.location.href).toBe(URL_NOVA);
  });
});

describe("mensagemDeFalha (erro de rede em português)", () => {
  it("falha de conexão do supabase-js ou do navegador vira texto para o aluno", () => {
    for (const msg of [
      "Failed to send a request to the Edge Function",
      "Relay Error invoking the Edge Function",
      "Failed to fetch",
      "NetworkError when attempting to fetch resource.",
      "Load failed",
      "The network connection was lost.",
      "The Internet connection appears to be offline.",
      "signal timed out",
      "The operation was aborted.",
    ]) {
      const texto = mensagemDeFalha(new Error(msg));
      expect(texto).toBe(MSG_SEM_CONEXAO);
      expect(texto).toMatch(/conex/i);
      expect(texto).not.toMatch(/edge function|fetch/i);
    }
  });

  it("erro da plataforma em inglês (função com erro HTTP, 5xx, função fora do ar) vira texto em português", () => {
    for (const msg of [
      "Edge Function returned a non-2xx status code",
      "Internal Server Error",
      "502 Bad Gateway",
      "Service Unavailable",
      "Gateway Timeout",
      "Requested function was not found",
      "BOOT_ERROR",
      "WORKER_LIMIT",
      "Unexpected token '<', \"<!doctype \"... is not valid JSON",
    ]) {
      const texto = mensagemDeFalha(new Error(msg));
      expect(texto).toBe(MSG_SERVICO_INDISPONIVEL);
      expect(texto).toMatch(/indispon/i);
      expect(texto).toMatch(/avise o RH/i);
      expect(texto).not.toMatch(/edge function|non-2xx|gateway|server error|json/i);
    }
  });

  it("o texto em português do servidor que fala de erro ou função passa como veio", () => {
    for (const msg of [
      "Função indisponível no momento",
      "Erro ao carregar o curso",
      "Aula não pertence ao curso",
    ]) {
      expect(mensagemDeFalha(new Error(msg))).toBe(msg);
    }
  });

  it("mensagem que o servidor mandou em português passa como veio", () => {
    expect(mensagemDeFalha(new Error("Cadastro inativo"))).toBe("Cadastro inativo");
    expect(mensagemDeFalha({ message: "Aula não pertence ao curso" })).toBe(
      "Aula não pertence ao curso"
    );
  });

  it("sem mensagem: texto padrão", () => {
    for (const vazio of [null, undefined, {}, new Error(""), "x".repeat(0)]) {
      expect(mensagemDeFalha(vazio)).toMatch(/tente de novo/i);
    }
  });
});
