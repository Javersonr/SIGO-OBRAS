// Roda com Node 23.6+ (type stripping):
//   node --test supabase/functions/portal-funcionario/questionario.test.ts
//
// Questionário do módulo (A2, spec 2026-10-14 §4.2). `prepararQuestionario` recebe o banco por parâmetro; aqui ele é
// um banco de teste que devolve, por tabela, o que cada cenário pede (inclusive `error`, como o postgrest-js faz: ele
// não lança em falha de rede ou de banco). O sorteio, a validação do envio e a correção são os da prova (regras.ts);
// o teste confere que valem com as questões da AULA, a nota mínima do módulo e sem tempo mínimo. Dados sintéticos:
// ids, textos e datas inventados.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aulaDaAtividade,
  MSG_QUESTIONARIO_INDISPONIVEL,
  MSG_QUESTIONARIO_VAZIO,
  mensagemDoEnvio,
  NOTA_MINIMA_MODULO_PADRAO,
  notaMinimaDoModulo,
  prepararQuestionario,
  respostaDoQuestionario,
  revisaoDoQuestionario,
} from "./questionario.ts";
import {
  corrigirProva,
  detalheDaProvaIniciada,
  inicioDaProva,
  MSG_TRILHA_INDISPONIVEL,
  sortearProva,
  validarEnvio,
} from "./regras.ts";

type Resposta = { data: unknown; error?: unknown };
type Chamada = { tabela: string; filtros: unknown[][] };

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
// 14h (UTC) de 14/10/2026 = 11h em Brasília
const AGORA = Date.parse("2026-10-14T14:00:00.000Z");

const OPCOES = ["Alternativa A", "Alternativa B", "Alternativa C", "Alternativa D"];
/** As 8 questões do questionário, com gabarito: a certa da questão i é a de índice i % 4. */
const QUESTOES = Array.from({ length: 8 }, (_, i) => ({
  id: `00000000-0000-4000-8000-0000000000${21 + i}`,
  ordem: i + 1,
  pergunta: `Pergunta sintética ${i + 1}`,
  opcoes: OPCOES,
  correta: i % 4,
  comentario: `Comentário sintético ${i + 1}`,
}));

const AULAS = ok([
  { id: AULA_VIDEO, ordem: 1, tipo: "video", duracao_seg: 600 },
  { id: AULA_QUEST, ordem: 2, tipo: "questionario", duracao_seg: 900 },
  { id: AULA_CASO, ordem: 3, tipo: "caso", duracao_seg: 600 },
]);
const feita = (aulaId: string, hora: string) => ({
  aula_id: aulaId,
  concluida: true,
  concluida_em: `2026-10-14T${hora}:00.000Z`,
});
const SO_O_VIDEO = ok([feita(AULA_VIDEO, "12:00")]);
const VIDEO_E_QUESTIONARIO = ok([feita(AULA_VIDEO, "12:00"), feita(AULA_QUEST, "13:00")]);

/** O cenário padrão: vídeo feito, questionário liberado com 8 questões, curso com 80, nenhuma tentativa. */
const cenario = (troca: Record<string, Resposta | Resposta[]> = {}) => ({
  treinamento_aula: AULAS,
  treinamento_progresso: SO_O_VIDEO,
  treinamento_questao: ok(QUESTOES),
  treinamento_curso: ok({ nota_minima_modulo: 80 }),
  treinamento_questionario_tentativa: ok([]),
  ...troca,
});

async function preparar(
  troca: Record<string, Resposta | Resposta[]> = {},
  { comGabarito = false, aulaId = AULA_QUEST }: { comGabarito?: boolean; aulaId?: string } = {}
) {
  const banco = bancoDeTeste(cenario(troca));
  const { valor, erros } = await comLog(() =>
    prepararQuestionario(banco.db, MAT, aulaId, EMPRESA, comGabarito)
  );
  return { preparo: valor, erros, ...banco };
}

/** Marca a certa em todas, menos nas `erros` primeiras (nelas, a alternativa seguinte). */
const marcar = (erros: number) =>
  QUESTOES.map((q, i) => ({
    questao_id: q.id,
    resposta: i < erros ? (q.correta + 1) % 4 : q.correta,
  }));

// ------------------------------------------------------------------------------- nota mínima do módulo

test("notaMinimaDoModulo: a do curso (inteiro de 0 a 100); ausente ou inválida vale 80", () => {
  assert.equal(NOTA_MINIMA_MODULO_PADRAO, 80);
  for (const n of [0, 70, 80, 100]) assert.equal(notaMinimaDoModulo({ nota_minima_modulo: n }), n);
  assert.equal(notaMinimaDoModulo({ nota_minima_modulo: "90" }), 90);
  for (const v of [null, undefined, -1, 101, 79.5, "abc", "", Number.NaN, {}]) {
    assert.equal(notaMinimaDoModulo({ nota_minima_modulo: v }), 80, String(v));
  }
  assert.equal(notaMinimaDoModulo(null), 80);
  assert.equal(notaMinimaDoModulo({}), 80);
});

// ------------------------------------------------------------------------------- preparo (banco injetado)

test("prepararQuestionario: aula liberada do tipo certo devolve as questões DA AULA, o curso e as tentativas (só a empresa da sessão)", async () => {
  const { preparo, de, erros, escritas } = await preparar();
  assert.equal(preparo.falha, null);
  if (preparo.falha !== null) return;
  assert.equal(preparo.aula.id, AULA_QUEST);
  assert.equal(preparo.questoes.length, 8);
  assert.equal(preparo.curso.nota_minima_modulo, 80);
  assert.equal(preparo.usadas, 0);
  assert.equal(preparo.concluida, false);
  assert.equal(preparo.melhorNota, null);
  assert.deepEqual(erros, []);
  const q = de("treinamento_questao")[0];
  for (const filtro of [
    ["eq", "aula_id", AULA_QUEST],
    ["eq", "curso_id", CURSO_ID],
    ["eq", "empresa_id", EMPRESA],
    ["is", "deleted_at", null],
  ]) {
    assert.ok(tem(q, filtro), JSON.stringify(filtro));
  }
  assert.ok(tem(de("treinamento_curso")[0], ["eq", "empresa_id", EMPRESA]));
  const t = de("treinamento_questionario_tentativa")[0];
  assert.ok(tem(t, ["eq", "matricula_id", MAT.id]));
  assert.ok(tem(t, ["eq", "aula_id", AULA_QUEST]));
  assert.ok(tem(t, ["eq", "empresa_id", EMPRESA]));
  // preparar não grava nada
  assert.equal(escritas().length, 0);
});

test("prepararQuestionario: abrir nunca lê o gabarito; só a correção carrega `correta` e `comentario`", async () => {
  const sem = await preparar({}, { comGabarito: false });
  const com = await preparar({}, { comGabarito: true });
  const colunas = (de: (t: string) => Chamada[]) =>
    String(de("treinamento_questao")[0].filtros.find((f) => f[0] === "select")?.[1]);
  assert.doesNotMatch(colunas(sem.de), /correta|comentario/);
  assert.match(colunas(com.de), /correta/);
  assert.match(colunas(com.de), /comentario/);
});

test("prepararQuestionario: a tentativa é numerada por matrícula e aula; a melhor nota é a maior", async () => {
  const { preparo } = await preparar({
    treinamento_questionario_tentativa: ok([
      { numero: 2, nota: "75", aprovada: false },
      { numero: 1, nota: 50, aprovada: false },
    ]),
  });
  assert.equal(preparo.falha, null);
  if (preparo.falha !== null) return;
  // a próxima é a 3 desta aula (a leitura é só desta aula nesta matrícula: ver o primeiro teste)
  assert.equal(preparo.usadas, 2);
  assert.equal(preparo.melhorNota, 75);
  assert.equal(preparo.concluida, false);
});

test("prepararQuestionario: cada leitura com erro (questões, curso, tentativas) é 503 e nada é preparado", async () => {
  const leituras: [string, string][] = [
    ["treinamento_questao", "questões"],
    ["treinamento_curso", "curso"],
    ["treinamento_questionario_tentativa", "tentativas"],
  ];
  for (const comGabarito of [false, true]) {
    for (const [tabela, nome] of leituras) {
      const { preparo, erros, escritas } = await preparar({ [tabela]: erro }, { comGabarito });
      assert.deepEqual(
        preparo,
        { falha: { mensagem: MSG_QUESTIONARIO_INDISPONIVEL, status: 503 } },
        tabela
      );
      assert.equal(erros.length, 1, tabela);
      assert.match(String(erros[0][0]), new RegExp(`prepararQuestionario: ${nome}`));
      assert.ok(erros[0].includes(FALHA.message), "a causa vai ao log");
      assert.equal(escritas().length, 0);
    }
  }
});

test("prepararQuestionario: trilha ilegível (aulas ou progresso) é 503 e nem chega às questões", async () => {
  for (const tabela of ["treinamento_aula", "treinamento_progresso"]) {
    const { preparo, de } = await preparar({ [tabela]: erro });
    assert.deepEqual(
      preparo,
      { falha: { mensagem: MSG_TRILHA_INDISPONIVEL, status: 503 } },
      tabela
    );
    assert.equal(de("treinamento_questao").length, 0, tabela);
  }
});

test("prepararQuestionario: aula de outro tipo ou de fora do curso é 400, sem ler as questões", async () => {
  const casos: [string, string][] = [
    [AULA_VIDEO, "Esta aula não é um questionário"],
    [AULA_CASO, "Esta aula não é um questionário"],
    [AULA_DE_OUTRO_CURSO, "Aula não pertence ao curso"],
  ];
  for (const [aulaId, mensagem] of casos) {
    const { preparo, de } = await preparar({}, { aulaId });
    assert.deepEqual(preparo, { falha: { mensagem, status: 400 } }, aulaId);
    assert.equal(de("treinamento_questao").length, 0, aulaId);
  }
});

test("prepararQuestionario: com a aula anterior por concluir é 409 AULA_BLOQUEADA", async () => {
  const { preparo, de } = await preparar({ treinamento_progresso: ok([]) });
  assert.deepEqual(preparo, {
    falha: {
      mensagem: "Conclua a aula anterior primeiro",
      status: 409,
      extra: { codigo: "AULA_BLOQUEADA" },
    },
  });
  assert.equal(de("treinamento_questao").length, 0);
});

test("prepararQuestionario: questionário sem questões é 409 QUESTIONARIO_VAZIO (avise o RH)", async () => {
  const { preparo } = await preparar({ treinamento_questao: ok([]) });
  assert.deepEqual(preparo, {
    falha: {
      mensagem: MSG_QUESTIONARIO_VAZIO,
      status: 409,
      extra: { codigo: "QUESTIONARIO_VAZIO" },
    },
  });
  assert.equal(MSG_QUESTIONARIO_VAZIO, "Este questionário ainda não tem questões — avise o RH");
});

test("prepararQuestionario: aula concluída devolve concluida: true com a melhor nota (mesmo se o RH apagou as questões)", async () => {
  const tentativas = ok([
    { numero: 2, nota: 88, aprovada: true },
    { numero: 1, nota: 63, aprovada: false },
  ]);
  for (const questoes of [ok(QUESTOES), ok([])]) {
    const { preparo } = await preparar({
      treinamento_progresso: VIDEO_E_QUESTIONARIO,
      treinamento_questionario_tentativa: tentativas,
      treinamento_questao: questoes,
    });
    assert.equal(preparo.falha, null);
    if (preparo.falha !== null) return;
    assert.equal(preparo.concluida, true);
    assert.equal(preparo.melhorNota, 88);
    assert.equal(preparo.usadas, 2);
  }
});

test("aulaDaAtividade: serve também ao caso (tipo, liberação e concluída)", async () => {
  const banco = bancoDeTeste(cenario({ treinamento_progresso: VIDEO_E_QUESTIONARIO }));
  const caso = await aulaDaAtividade(banco.db, MAT, AULA_CASO, EMPRESA, "caso");
  assert.equal(caso.falha, null);
  if (caso.falha !== null) return;
  assert.equal(caso.aula.id, AULA_CASO);
  assert.equal(caso.concluida, false);
  assert.deepEqual(await aulaDaAtividade(banco.db, MAT, AULA_QUEST, EMPRESA, "caso"), {
    falha: { mensagem: "Esta aula não é um caso", status: 400 },
  });
  assert.deepEqual(await aulaDaAtividade(banco.db, MAT, undefined, EMPRESA, "caso"), {
    falha: { mensagem: "Aula não pertence ao curso", status: 400 },
  });
});

// ---------------------------------------------------------------- correção com as regras da prova (A2)

test("questionário: abrir sorteia, o envio confere o sorteio gravado (sem tempo mínimo) e 7 de 8 aprova com 80", async () => {
  const abrir = await preparar({}, { comGabarito: false });
  if (abrir.preparo.falha !== null) return assert.fail("a abertura não foi preparada");
  const numero = abrir.preparo.usadas + 1;
  const prova = sortearProva(abrir.preparo.questoes, (n) => n - 1);
  // o que o index.ts grava em `questionario_iniciado`: o mesmo formato do `avaliacao_iniciada`
  const detalhe = detalheDaProvaIniciada({
    tentativa: numero,
    agora: AGORA,
    prova,
    tempoMinimoPorQuestaoSeg: 0,
  });
  assert.equal(detalhe.tempo_minimo_seg, 0);
  const enviar = await preparar({}, { comGabarito: true });
  if (enviar.preparo.falha !== null) return assert.fail("o envio não foi preparado");
  const { questoes, curso } = enviar.preparo;
  // enviado no mesmo instante da abertura: sem tempo mínimo, passa
  const envio = validarEnvio({
    questoes,
    respostas: marcar(1),
    inicio: inicioDaProva({ detalhe }),
    numero,
    agora: AGORA,
    tempoMinimoPorQuestaoSeg: 0,
  });
  assert.equal(envio.ok, true);
  if (!envio.ok) return;
  const c = corrigirProva({
    questoes,
    respostas: envio.respostas,
    notaMinima: notaMinimaDoModulo(curso),
  });
  assert.equal(c.acertos, 7);
  assert.equal(c.nota, 88);
  assert.equal(c.aprovada, true);
});

test("questionário: com a mínima 80, 7 de 8 aprova (88) e 6 de 8 não (75); a correção comentada vai nos dois (A2)", () => {
  const notaMinima = notaMinimaDoModulo({ nota_minima_modulo: 80 });
  const casos: [number, number, boolean][] = [
    [1, 88, true],
    [2, 75, false],
  ];
  for (const [erros, nota, aprovada] of casos) {
    const c = corrigirProva({ questoes: QUESTOES, respostas: marcar(erros), notaMinima });
    assert.equal(c.nota, nota);
    assert.equal(c.aprovada, aprovada);
    const r = respostaDoQuestionario({
      aprovada: c.aprovada,
      nota: c.nota,
      acertos: c.acertos,
      total: c.total,
      notaMinima,
      tentativa: 3,
      cursoConcluido: false,
      revisao: revisaoDoQuestionario(QUESTOES, c.acertou),
    });
    assert.equal(r.resultado, aprovada ? "satisfatorio" : "insatisfatorio");
    assert.equal(r.aprovada, aprovada);
    assert.equal(r.aula_concluida, aprovada);
    assert.equal(r.nota, nota);
    assert.equal(r.acertos, 8 - erros);
    assert.equal(r.total, 8);
    assert.equal(r.nota_minima, 80);
    assert.equal(r.tentativa, 3);
    // é estudo: quem não atingiu a nota também vê a alternativa certa e o comentário de cada questão
    assert.equal(r.revisao.length, 8);
    assert.deepEqual(r.revisao[0], {
      questao_id: QUESTOES[0].id,
      acertou: false,
      resposta_correta: OPCOES[QUESTOES[0].correta],
      comentario: "Comentário sintético 1",
    });
    assert.equal(r.revisao[7].acertou, true);
  }
});

test("respostaDoQuestionario: curso_concluido só com a aprovação (o reprovado nunca conclui nada)", () => {
  const base = { nota: 75, acertos: 6, total: 8, notaMinima: 80, tentativa: 1, revisao: [] };
  assert.equal(
    respostaDoQuestionario({ ...base, aprovada: false, cursoConcluido: true }).curso_concluido,
    false
  );
  assert.equal(
    respostaDoQuestionario({ ...base, aprovada: true, cursoConcluido: true }).curso_concluido,
    true
  );
  assert.equal(
    respostaDoQuestionario({ ...base, aprovada: true, cursoConcluido: false }).curso_concluido,
    false
  );
});

test("revisaoDoQuestionario: alternativa certa pelo índice (lista ou texto JSON do legado); sem comentário vai null", () => {
  const revisao = revisaoDoQuestionario(
    [
      { id: "q1", opcoes: JSON.stringify(["Sim", "Não"]), correta: 1 },
      { id: "q2", opcoes: ["Sim", "Não"], correta: 5, comentario: "Veja o módulo 2" },
      { id: "q3", opcoes: "quebrado", correta: 0, comentario: 7 },
    ],
    (q) => q.id === "q1"
  );
  assert.deepEqual(revisao, [
    { questao_id: "q1", acertou: true, resposta_correta: "Não", comentario: null },
    { questao_id: "q2", acertou: false, resposta_correta: null, comentario: "Veja o módulo 2" },
    { questao_id: "q3", acertou: false, resposta_correta: null, comentario: null },
  ]);
});

test("mensagemDoEnvio: as recusas do envio falam em questionário, nunca em prova", () => {
  const duas = QUESTOES.slice(0, 2);
  const detalhe = detalheDaProvaIniciada({
    tentativa: 1,
    agora: AGORA,
    prova: sortearProva(duas, () => 0),
    tempoMinimoPorQuestaoSeg: 0,
  });
  const recusas = [
    validarEnvio({ questoes: duas, respostas: [], inicio: null, numero: 1, agora: AGORA }),
    validarEnvio({
      questoes: QUESTOES.slice(0, 3),
      respostas: [],
      inicio: inicioDaProva({ detalhe }),
      numero: 1,
      agora: AGORA,
    }),
    validarEnvio({
      questoes: duas,
      respostas: [],
      inicio: inicioDaProva({ detalhe }),
      numero: 1,
      agora: AGORA,
      tempoMinimoPorQuestaoSeg: 0,
    }),
  ];
  assert.deepEqual(
    recusas.map((r) => (r.ok ? "ok" : r.codigo)),
    ["PROVA_NAO_INICIADA", "PROVA_ALTERADA", "RESPOSTAS_INCOMPLETAS"]
  );
  for (const r of recusas) {
    if (r.ok) continue;
    assert.doesNotMatch(mensagemDoEnvio(r.codigo, r.mensagem), /prova/i, r.codigo);
  }
  assert.match(mensagemDoEnvio("PROVA_NAO_INICIADA", "x"), /questionário/);
  assert.match(mensagemDoEnvio("PROVA_ALTERADA", "x"), /questionário/);
  // o que não fala em prova passa como veio; código desconhecido (ou de Object.prototype) também
  assert.equal(mensagemDoEnvio("OUTRO", "Mensagem padrão"), "Mensagem padrão");
  assert.equal(mensagemDoEnvio("constructor", "Mensagem padrão"), "Mensagem padrão");
});
