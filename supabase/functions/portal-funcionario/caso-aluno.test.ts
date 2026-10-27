// Roda com Node 23.6+ (type stripping):
//   node --test supabase/functions/portal-funcionario/caso-aluno.test.ts
//
// Caso com decisões (A3, spec 2026-10-14 §4.3): a leitura do caso com o banco injetado (`prepararCaso`) e as
// respostas das três ações, sobre a regra do roteiro de caso.ts. O roteiro de teste é sintético e ramificado como os
// rascunhos (a escolha insegura leva a uma etapa de recuperação, que volta à decisão). Nada de material real.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  conclusaoDoCaso,
  escolhaNoCaso,
  EVENTO_CASO_ESCOLHA,
  EVENTO_CASO_REINICIADO,
  MSG_CASO_INDISPONIVEL,
  prepararCaso,
  recusaDoCaso,
  respostaDaAbertura,
  respostaDoCasoConcluido,
  situacaoDoCaso,
} from "./caso-aluno.ts";
import { MSG_TRILHA_INDISPONIVEL } from "./regras.ts";

type Resposta = { data: unknown; error?: unknown };
type Chamada = { tabela: string; filtros: unknown[][] };
type Evento = { evento: string; detalhe: unknown };

/** Banco de teste: `cenario[tabela]` dá a resposta da leitura (uma lista dá uma resposta por chamada). */
function bancoDeTeste(cenario: Record<string, Resposta | Resposta[]>) {
  const chamadas: Chamada[] = [];
  const usadas = new Map<string, number>();
  const proxima = (tabela: string): Resposta => {
    const r = cenario[tabela];
    if (!Array.isArray(r)) return r ?? { data: [], error: null };
    const i = usadas.get(tabela) ?? 0;
    usadas.set(tabela, i + 1);
    return r[Math.min(i, r.length - 1)];
  };
  const db = {
    from(tabela: string) {
      const chamada: Chamada = { tabela, filtros: [] };
      chamadas.push(chamada);
      const anotar =
        (nome: string) =>
        (...args: unknown[]) => (chamada.filtros.push([nome, ...args]), consulta);
      const consulta: Record<string, unknown> = {
        select: anotar("select"),
        eq: anotar("eq"),
        in: anotar("in"),
        is: anotar("is"),
        not: anotar("not"),
        order: anotar("order"),
        limit: anotar("limit"),
        maybeSingle: anotar("maybeSingle"),
        insert: anotar("insert"),
        update: anotar("update"),
        upsert: anotar("upsert"),
        then: (resolve: (v: unknown) => unknown, rejeitar?: (e: unknown) => unknown) =>
          Promise.resolve()
            .then(() => proxima(tabela))
            .then(resolve, rejeitar),
      };
      return consulta;
    },
  };
  const de = (tabela: string) => chamadas.filter((c) => c.tabela === tabela);
  const escritas = () =>
    chamadas.filter((c) =>
      c.filtros.some((f) => ["insert", "update", "upsert"].includes(String(f[0])))
    );
  return { db, chamadas, de, escritas };
}

const tem = (c: Chamada | undefined, filtro: unknown[]) =>
  !!c?.filtros.some((f) => JSON.stringify(f) === JSON.stringify(filtro));

/** Roda `fn` com o console.error capturado (as causas que a função manda ao log). */
async function comLog<T>(fn: () => Promise<T>): Promise<{ valor: T; erros: unknown[][] }> {
  const original = console.error;
  const erros: unknown[][] = [];
  console.error = (...a: unknown[]) => void erros.push(a);
  try {
    return { valor: await fn(), erros };
  } finally {
    console.error = original;
  }
}

const EMPRESA = "00000000-0000-4000-8000-000000000001";
const CURSO_ID = "00000000-0000-4000-8000-000000000002";
const MAT = {
  id: "00000000-0000-4000-8000-000000000003",
  curso_id: CURSO_ID,
  status: "em_andamento",
};
const AULA_VIDEO = "00000000-0000-4000-8000-000000000010";
const AULA_QUEST = "00000000-0000-4000-8000-000000000011";
const AULA_CASO = "00000000-0000-4000-8000-000000000012";
const AULA_DE_OUTRO_CURSO = "00000000-0000-4000-8000-000000000019";
const FALHA = { message: "conexão com o banco caiu" };
const ok = (data: unknown): Resposta => ({ data, error: null });
const erro: Resposta = { data: null, error: FALHA };

/** Caso ramificado: a insegura de e1 leva à recuperação r1, que volta a e1; a segura de e2 encerra. */
const ROTEIRO = {
  contexto: "Contexto sintético do caso.",
  etapas: [
    {
      id: "e1",
      pergunta: "Pergunta 1?",
      opcoes: [
        { texto: "Segura 1", comentario: "Certo 1", segura: true, proxima: "e2" },
        { texto: "Insegura 1", comentario: "Errado 1", segura: false, proxima: "r1" },
      ],
    },
    {
      id: "r1",
      pergunta: "Recuperação?",
      opcoes: [
        { texto: "Volta", comentario: "Volte à decisão", segura: true, proxima: "e1" },
        { texto: "Insiste", comentario: "Ainda errado", segura: false, proxima: "r1" },
      ],
    },
    {
      id: "e2",
      pergunta: "Pergunta 2?",
      opcoes: [
        { texto: "Segura 2", comentario: "Certo 2", segura: true, proxima: null },
        { texto: "Insegura 2", comentario: "Errado 2", segura: false, proxima: "e2" },
      ],
    },
  ],
  reflexao: "Reflexão sintética.",
};
/** O roteiro depois que o RH o trocou: outra etapa inicial (o caminho gravado no antigo não confere). */
const ROTEIRO_NOVO = {
  contexto: "Contexto novo.",
  etapas: [
    {
      id: "n1",
      pergunta: "Pergunta nova?",
      opcoes: [
        { texto: "Segura nova", comentario: "Certo novo", segura: true, proxima: null },
        { texto: "Insegura nova", comentario: "Errado novo", segura: false, proxima: "n1" },
      ],
    },
  ],
  reflexao: "Reflexão nova.",
};

const primeiro = () => 0;
const escolhaGravada = (rodada: number, etapa: string, opcao: number, passagem = 1): Evento => ({
  evento: EVENTO_CASO_ESCOLHA,
  detalhe: { rodada, etapa, opcao, segura: true, proxima: null, passagem },
});

const AULAS = ok([
  { id: AULA_VIDEO, ordem: 1, tipo: "video", duracao_seg: 600 },
  { id: AULA_QUEST, ordem: 2, tipo: "questionario", duracao_seg: 900 },
  { id: AULA_CASO, ordem: 3, tipo: "caso", duracao_seg: 600 },
]);
const feita = (aulaId: string) => ({
  aula_id: aulaId,
  concluida: true,
  concluida_em: "2026-10-14T13:00:00.000Z",
});
const ATE_O_CASO = ok([feita(AULA_VIDEO), feita(AULA_QUEST)]);

const cenario = (troca: Record<string, Resposta | Resposta[]> = {}) => ({
  treinamento_aula: AULAS,
  treinamento_progresso: ATE_O_CASO,
  treinamento_caso: ok({ conteudo: ROTEIRO }),
  treinamento_evento: ok([]),
  ...troca,
});

async function preparar(
  troca: Record<string, Resposta | Resposta[]> = {},
  aulaId: string = AULA_CASO
) {
  const banco = bancoDeTeste(cenario(troca));
  const { valor, erros } = await comLog(() => prepararCaso(banco.db, MAT, aulaId, EMPRESA));
  return { preparo: valor, erros, ...banco };
}

/** A situação de um roteiro que tem de ser aceito (o teste falha se a regra o recusar). */
function situacao(conteudo: unknown, eventos: Evento[]) {
  const s = situacaoDoCaso(conteudo, eventos);
  if (s.recusa) return assert.fail(`roteiro recusado: ${s.recusa.mensagem}`);
  return s;
}

// ------------------------------------------------------------------------------ leitura (banco injetado)

test("prepararCaso: aula do tipo caso e liberada, com o roteiro e a trilha desta matrícula (empresa da sessão, ordem de gravação)", async () => {
  const eventos = [escolhaGravada(1, "e1", 1)];
  const { preparo, de, erros, escritas } = await preparar({ treinamento_evento: ok(eventos) });
  assert.equal(preparo.falha, null);
  if (preparo.falha !== null) return;
  assert.equal(preparo.aula.id, AULA_CASO);
  assert.equal(preparo.concluida, false);
  assert.deepEqual(preparo.conteudo, ROTEIRO);
  assert.deepEqual(preparo.eventos, eventos);
  assert.deepEqual(erros, []);
  const roteiro = de("treinamento_caso")[0];
  for (const filtro of [
    ["eq", "aula_id", AULA_CASO],
    ["eq", "curso_id", CURSO_ID],
    ["eq", "empresa_id", EMPRESA],
    ["is", "deleted_at", null],
  ]) {
    assert.ok(tem(roteiro, filtro), JSON.stringify(filtro));
  }
  const trilha = de("treinamento_evento")[0];
  for (const filtro of [
    ["eq", "matricula_id", MAT.id],
    ["eq", "aula_id", AULA_CASO],
    ["eq", "empresa_id", EMPRESA],
    ["in", "evento", ["caso_escolha", "caso_reiniciado"]],
    ["order", "id", { ascending: true }],
  ]) {
    assert.ok(tem(trilha, filtro), JSON.stringify(filtro));
  }
  assert.equal(escritas().length, 0);
});

test("prepararCaso: sem roteiro gravado volta conteudo null, e a situação dele é CASO_INVALIDO", async () => {
  const { preparo } = await preparar({ treinamento_caso: ok(null) });
  assert.equal(preparo.falha, null);
  if (preparo.falha !== null) return;
  assert.equal(preparo.conteudo, null);
  assert.equal(situacaoDoCaso(preparo.conteudo, []).recusa?.extra?.codigo, "CASO_INVALIDO");
});

test("prepararCaso: roteiro ou trilha ilegíveis são 503 (com a causa no log); trilha do curso ilegível também", async () => {
  for (const [tabela, nome] of [
    ["treinamento_caso", "roteiro"],
    ["treinamento_evento", "trilha"],
  ]) {
    const { preparo, erros } = await preparar({ [tabela]: erro });
    assert.deepEqual(preparo, { falha: { mensagem: MSG_CASO_INDISPONIVEL, status: 503 } }, tabela);
    assert.equal(erros.length, 1, tabela);
    assert.match(String(erros[0][0]), new RegExp(`prepararCaso: ${nome}`));
    assert.ok(erros[0].includes(FALHA.message), "a causa vai ao log");
  }
  for (const tabela of ["treinamento_aula", "treinamento_progresso"]) {
    const { preparo, de } = await preparar({ [tabela]: erro });
    assert.deepEqual(
      preparo,
      { falha: { mensagem: MSG_TRILHA_INDISPONIVEL, status: 503 } },
      tabela
    );
    assert.equal(de("treinamento_caso").length, 0, tabela);
  }
});

test("prepararCaso: aula de outro tipo ou de fora do curso é 400; bloqueada é 409 AULA_BLOQUEADA; nada é lido do roteiro", async () => {
  const quest = await preparar({}, AULA_QUEST);
  assert.deepEqual(quest.preparo, { falha: { mensagem: "Esta aula não é um caso", status: 400 } });
  const fora = await preparar({}, AULA_DE_OUTRO_CURSO);
  assert.deepEqual(fora.preparo, {
    falha: { mensagem: "Aula não pertence ao curso", status: 400 },
  });
  const bloqueada = await preparar({ treinamento_progresso: ok([feita(AULA_VIDEO)]) });
  assert.deepEqual(bloqueada.preparo, {
    falha: {
      mensagem: "Conclua a aula anterior primeiro",
      status: 409,
      extra: { codigo: "AULA_BLOQUEADA" },
    },
  });
  for (const r of [quest, fora, bloqueada]) assert.equal(r.de("treinamento_caso").length, 0);
});

test("prepararCaso: aula concluída volta concluida: true", async () => {
  const { preparo } = await preparar({
    treinamento_progresso: ok([feita(AULA_VIDEO), feita(AULA_QUEST), feita(AULA_CASO)]),
  });
  assert.equal(preparo.falha, null);
  if (preparo.falha !== null) return;
  assert.equal(preparo.concluida, true);
});

// ------------------------------------------------------------------------------ situação refeita da trilha

test("situacaoDoCaso: roteiro inválido (ou ausente) é 409 CASO_INVALIDO, sem rodada nem reinício", () => {
  for (const conteudo of [{ contexto: "", etapas: [], reflexao: "" }, null, "texto"]) {
    const s = situacaoDoCaso(conteudo, []);
    assert.deepEqual(s, {
      recusa: {
        mensagem: "Este caso está com problema — avise o RH",
        status: 409,
        extra: { codigo: "CASO_INVALIDO" },
      },
    });
  }
});

test("situacaoDoCaso: sem escolhas, a rodada 1 começa na primeira etapa (sem reinício)", () => {
  const s = situacao(ROTEIRO, []);
  assert.equal(s.rodada, 1);
  assert.deepEqual(s.escolhas, []);
  assert.equal(s.reiniciar, null);
  assert.equal(s.estado.etapaAtual, "e1");
  assert.equal(s.estado.fim, false);
  assert.equal(s.estado.passagens.e1, 1);
  assert.equal(s.estado.ultimo, null);
});

test("situacaoDoCaso: roteiro alterado depois das escolhas recomeça a rodada (caso_alterado); a rodada nova passa a valer", () => {
  const antigas = [escolhaGravada(1, "e1", 0)];
  const s = situacao(ROTEIRO_NOVO, antigas);
  assert.deepEqual(s.reiniciar, { rodada: 2, motivo: "caso_alterado" });
  assert.equal(s.rodada, 2);
  assert.deepEqual(s.escolhas, []);
  assert.equal(s.estado.etapaAtual, "n1");
  // depois de gravar o reinício e uma escolha da rodada 2, a rodada 1 fica para trás
  const depois = situacao(ROTEIRO_NOVO, [
    ...antigas,
    { evento: EVENTO_CASO_REINICIADO, detalhe: { rodada: 2, motivo: "caso_alterado" } },
    escolhaGravada(2, "n1", 1),
  ]);
  assert.equal(depois.reiniciar, null);
  assert.equal(depois.rodada, 2);
  assert.deepEqual(depois.escolhas, [{ etapa: "n1", opcao: 1 }]);
  assert.equal(depois.estado.etapaAtual, "n1");
  assert.equal(depois.estado.passagens.n1, 2);
});

// ------------------------------------------------------------------------------ duplo clique (revisão da Task 9)

test("situacaoDoCaso: a mesma escolha gravada duas vezes (duplo clique) vale uma só: sem reinício falso, na etapa a que a 1ª levou", () => {
  const s = situacao(ROTEIRO, [escolhaGravada(1, "e1", 0, 1), escolhaGravada(1, "e1", 0, 1)]);
  assert.equal(s.reiniciar, null);
  assert.equal(s.rodada, 1);
  assert.deepEqual(s.escolhas, [{ etapa: "e1", opcao: 0 }]);
  assert.equal(s.estado.etapaAtual, "e2");
  assert.equal(s.estado.passagens.e2, 1);
});

test("situacaoDoCaso: a escolha FINAL duplicada não reinicia a rodada: concluir passa e conta um clique para ela", () => {
  const s = situacao(ROTEIRO, [
    escolhaGravada(1, "e1", 0, 1),
    escolhaGravada(1, "e2", 0, 1),
    escolhaGravada(1, "e2", 0, 1),
  ]);
  assert.equal(s.reiniciar, null);
  assert.equal(s.estado.fim, true);
  const conclusao = conclusaoDoCaso(s);
  if (conclusao.recusa) return assert.fail(conclusao.recusa.mensagem);
  assert.deepEqual(conclusao.eventoExtra, {
    evento: "caso_concluido",
    detalhe: { rodada: 1, escolhas: 2 },
  });
});

test("situacaoDoCaso: duas opções DIFERENTES na mesma (rodada, etapa, passagem): vale a primeira gravada", () => {
  // e1 opção 1 (insegura) leva a r1; a opção 0 (segura), gravada depois por outra aba, é descartada
  const s = situacao(ROTEIRO, [escolhaGravada(1, "e1", 1, 1), escolhaGravada(1, "e1", 0, 1)]);
  assert.equal(s.reiniciar, null);
  assert.deepEqual(s.escolhas, [{ etapa: "e1", opcao: 1 }]);
  assert.equal(s.estado.etapaAtual, "r1");
  assert.deepEqual(s.estado.ultimo, { comentario: "Errado 1", segura: false });
});

test("situacaoDoCaso: o laço legítimo (a mesma opção insegura duas vezes seguidas, passagens 1 e 2) conta as duas", () => {
  const s = situacao(ROTEIRO, [
    escolhaGravada(1, "e1", 1, 1),
    escolhaGravada(1, "r1", 1, 1),
    escolhaGravada(1, "r1", 1, 2),
  ]);
  assert.equal(s.reiniciar, null);
  assert.deepEqual(s.escolhas, [
    { etapa: "e1", opcao: 1 },
    { etapa: "r1", opcao: 1 },
    { etapa: "r1", opcao: 1 },
  ]);
  assert.equal(s.estado.etapaAtual, "r1");
  assert.equal(s.estado.passagens.r1, 3);
});

test("situacaoDoCaso: o duplicado também é descartado com o detalhe em texto JSON; rodadas diferentes não se confundem", () => {
  const comoTexto = (e: Evento): Evento => ({ ...e, detalhe: JSON.stringify(e.detalhe) });
  const s = situacao(ROTEIRO, [
    comoTexto(escolhaGravada(1, "e1", 0, 1)),
    escolhaGravada(1, "e1", 0, 1),
  ]);
  assert.equal(s.reiniciar, null);
  assert.equal(s.estado.etapaAtual, "e2");
  // a mesma (etapa, passagem) em outra rodada é outra escolha: o reinício marca a rodada 2 e as da 2 valem
  const depois = situacao(ROTEIRO_NOVO, [
    escolhaGravada(1, "n1", 1, 1),
    { evento: EVENTO_CASO_REINICIADO, detalhe: { rodada: 2, motivo: "caso_alterado" } },
    escolhaGravada(2, "n1", 1, 1),
  ]);
  assert.equal(depois.rodada, 2);
  assert.equal(depois.reiniciar, null);
  assert.deepEqual(depois.escolhas, [{ etapa: "n1", opcao: 1 }]);
});

// ------------------------------------------------------------------------------ respostas ao aluno

test("respostaDaAbertura: a etapa vai só com a pergunta e o texto das opções (índice original); no fim, a reflexão", () => {
  const r = respostaDaAbertura(ROTEIRO, situacao(ROTEIRO, []).estado, primeiro);
  assert.equal(r.situacao, "etapa");
  if (r.situacao !== "etapa") return;
  assert.equal(r.contexto, ROTEIRO.contexto);
  assert.equal(r.passagem, 1);
  assert.equal(r.ultimo, null);
  assert.equal(r.etapa.id, "e1");
  assert.equal(r.etapa.pergunta, "Pergunta 1?");
  assert.deepEqual(r.etapa.opcoes.map((o) => o.indice).sort(), [0, 1]);
  for (const o of r.etapa.opcoes) assert.equal(o.texto, ROTEIRO.etapas[0].opcoes[o.indice].texto);
  // nada do que decide o caso sai antes do clique (as chaves entre aspas: o texto da opção "Insegura 1" contém
  // "segura" e não é vazamento)
  const json = JSON.stringify(r);
  for (const segredo of [
    '"segura"',
    '"comentario"',
    '"proxima"',
    "Certo 1",
    "Errado 1",
    ROTEIRO.reflexao,
  ]) {
    assert.equal(json.includes(segredo), false, segredo);
  }
  const fim = situacao(ROTEIRO, [escolhaGravada(1, "e1", 0), escolhaGravada(1, "e2", 0)]);
  assert.deepEqual(respostaDaAbertura(ROTEIRO, fim.estado, primeiro), {
    situacao: "fim",
    contexto: ROTEIRO.contexto,
    reflexao: ROTEIRO.reflexao,
    ultimo: { comentario: "Certo 2", segura: true },
  });
});

test("respostaDoCasoConcluido: o contexto e a reflexão (texto vazio se o roteiro sumiu)", () => {
  assert.deepEqual(respostaDoCasoConcluido(ROTEIRO), {
    situacao: "concluido",
    contexto: ROTEIRO.contexto,
    reflexao: ROTEIRO.reflexao,
  });
  assert.deepEqual(respostaDoCasoConcluido(null), {
    situacao: "concluido",
    contexto: "",
    reflexao: "",
  });
});

test("escolhaNoCaso: o detalhe do C2 para a trilha e a resposta com o comentário e a próxima etapa (sem segredos dela)", () => {
  const e = escolhaNoCaso(ROTEIRO, situacao(ROTEIRO, []), "e1", 1, primeiro);
  if (e.recusa) return assert.fail(e.recusa.mensagem);
  assert.deepEqual(e.detalhe, {
    rodada: 1,
    etapa: "e1",
    opcao: 1,
    segura: false,
    proxima: "r1",
    passagem: 1,
  });
  assert.equal(e.resposta.comentario, "Errado 1");
  assert.equal(e.resposta.segura, false);
  assert.equal(e.resposta.passagem, 1);
  assert.equal(e.resposta.fim, false);
  assert.equal(e.resposta.reflexao, null);
  assert.equal(e.resposta.etapa?.id, "r1");
  const json = JSON.stringify(e.resposta.etapa);
  for (const segredo of ['"segura"', '"comentario"', '"proxima"']) {
    assert.equal(json.includes(segredo), false, segredo);
  }
});

test("escolhaNoCaso: etapa que não é a atual é 409 com o estado; opção inválida 400; caso no fim 409 encerrado", () => {
  // o aluno já está em e2 e a página velha manda e1
  const emE2 = situacao(ROTEIRO, [escolhaGravada(1, "e1", 0)]);
  const fora = escolhaNoCaso(ROTEIRO, emE2, "e1", 0, primeiro);
  assert.equal(fora.recusa?.status, 409);
  assert.equal(fora.recusa?.extra?.codigo, "CASO_FORA_DE_ORDEM");
  const estado = fora.recusa?.extra?.estado as { situacao: string; etapa: { id: string } };
  assert.equal(estado.situacao, "etapa");
  assert.equal(estado.etapa.id, "e2");
  for (const opcao of [7, -1, null]) {
    const r = escolhaNoCaso(ROTEIRO, emE2, "e2", opcao, primeiro);
    assert.equal(r.recusa?.status, 400, String(opcao));
    assert.equal(r.recusa?.extra?.codigo, "OPCAO_INVALIDA", String(opcao));
  }
  const noFim = situacao(ROTEIRO, [escolhaGravada(1, "e1", 0), escolhaGravada(1, "e2", 0)]);
  const encerrado = escolhaNoCaso(ROTEIRO, noFim, "e2", 0, primeiro);
  assert.equal(encerrado.recusa?.status, 409);
  assert.equal(encerrado.recusa?.extra?.codigo, "CASO_ENCERRADO");
});

test("fluxo: a insegura leva à recuperação, que volta à decisão; a segura final encerra e só então o caso conclui", () => {
  const eventos: Evento[] = [];
  /** Uma escolha como o index.ts faz: refaz a situação pela trilha, confere pela regra e grava o detalhe. */
  const escolher = (etapa: string, opcao: number) => {
    const escolha = escolhaNoCaso(ROTEIRO, situacao(ROTEIRO, eventos), etapa, opcao, primeiro);
    if (!escolha.recusa) eventos.push({ evento: EVENTO_CASO_ESCOLHA, detalhe: escolha.detalhe });
    return escolha;
  };
  const errou = escolher("e1", 1);
  if (errou.recusa) return assert.fail(errou.recusa.mensagem);
  assert.equal(errou.resposta.etapa?.id, "r1");
  const voltou = escolher("r1", 0);
  if (voltou.recusa) return assert.fail(voltou.recusa.mensagem);
  assert.equal(voltou.resposta.etapa?.id, "e1");
  // de volta à decisão: a segunda passagem por e1, com o último comentário para a tela retomar
  const retomada = respostaDaAbertura(ROTEIRO, situacao(ROTEIRO, eventos).estado, primeiro);
  if (retomada.situacao !== "etapa") return assert.fail("esperava a etapa e1");
  assert.equal(retomada.etapa.id, "e1");
  assert.equal(retomada.passagem, 2);
  assert.deepEqual(retomada.ultimo, { comentario: "Volte à decisão", segura: true });
  const acertou = escolher("e1", 0);
  if (acertou.recusa) return assert.fail(acertou.recusa.mensagem);
  assert.deepEqual(acertou.detalhe, {
    rodada: 1,
    etapa: "e1",
    opcao: 0,
    segura: true,
    proxima: "e2",
    passagem: 2,
  });
  // ainda não chegou ao fim: concluir é recusado
  assert.equal(
    conclusaoDoCaso(situacao(ROTEIRO, eventos)).recusa?.extra?.codigo,
    "CASO_INCOMPLETO"
  );
  const fim = escolher("e2", 0);
  if (fim.recusa) return assert.fail(fim.recusa.mensagem);
  assert.equal(fim.resposta.fim, true);
  assert.equal(fim.resposta.etapa, null);
  assert.equal(fim.resposta.reflexao, ROTEIRO.reflexao);
  // depois do fim: nova escolha é recusada e concluir passa, com as 4 escolhas da rodada
  assert.equal(escolher("e2", 0).recusa?.extra?.codigo, "CASO_ENCERRADO");
  const conclusao = conclusaoDoCaso(situacao(ROTEIRO, eventos));
  if (conclusao.recusa) return assert.fail(conclusao.recusa.mensagem);
  assert.deepEqual(conclusao.eventoExtra, {
    evento: "caso_concluido",
    detalhe: { rodada: 1, escolhas: 4 },
  });
});

test("recusaDoCaso: status e textos das recusas do caso (C5)", () => {
  assert.deepEqual(recusaDoCaso("CASO_INVALIDO"), {
    mensagem: "Este caso está com problema — avise o RH",
    status: 409,
    extra: { codigo: "CASO_INVALIDO" },
  });
  assert.deepEqual(recusaDoCaso("CASO_INCOMPLETO"), {
    mensagem: "Chegue ao fim do caso para concluir",
    status: 409,
    extra: { codigo: "CASO_INCOMPLETO" },
  });
  assert.equal(recusaDoCaso("OPCAO_INVALIDA").status, 400);
  assert.equal(recusaDoCaso("CASO_ENCERRADO").status, 409);
  assert.deepEqual(recusaDoCaso("CASO_FORA_DE_ORDEM", { estado: { situacao: "fim" } }).extra, {
    codigo: "CASO_FORA_DE_ORDEM",
    estado: { situacao: "fim" },
  });
});
