// Roda com Node 23.6+ (type stripping):
//   node --test supabase/functions/portal-funcionario/prova.test.ts
//
// A7, revisão 1 (achado Important): a prova nunca é aberta nem corrigida com uma leitura que falhou. O
// `prepararProva` (prova.ts) recebe o banco por parâmetro; aqui ele é um banco de teste que devolve, por tabela, o
// que cada cenário pede (inclusive `error`, como o postgrest-js faz: ele não lança em falha de rede ou de banco).
// O dano que a revisão apontou: com só a leitura do curso falhando no envio, `curso` virava null e a prova era
// corrigida com a nota mínima padrão (70), sem limite de tentativas e sem intervalo; a tentativa aprovada é
// imutável (0135) e a conclusão decide a partir dela. Dados sintéticos: ids e datas inventados.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MSG_PROVA_INDISPONIVEL, prepararProva } from "./prova.ts";
import { MSG_TRILHA_INDISPONIVEL } from "./regras.ts";

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
        is: anotar("is"),
        order: anotar("order"),
        limit: anotar("limit"),
        maybeSingle: anotar("maybeSingle"),
        insert: anotar("insert"),
        update: anotar("update"),
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
    chamadas.filter((c) => c.filtros.some((f) => f[0] === "insert" || f[0] === "update"));
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

const EMPRESA = "empresa-1";
const MAT = { id: "m1", curso_id: "c1", avaliacao_aprovada: false, tentativas_extras: 0 };
const FALHA = { message: "conexão com o banco caiu" };
const ok = (data: unknown): Resposta => ({ data, error: null });
const erro: Resposta = { data: null, error: FALHA };

// 14h (UTC) de 07/10/2026 = 11h em Brasília
const AGORA = Date.parse("2026-10-07T14:00:00.000Z");

const AULAS = ok([
  { id: "a1", ordem: 1, tipo: "video", duracao_seg: 600 },
  { id: "a2", ordem: 2, tipo: "video", duracao_seg: 600 },
]);
const PROGRESSO_COMPLETO = ok([
  { aula_id: "a1", concluida: true, concluida_em: "2026-10-02T13:00:00.000Z" },
  { aula_id: "a2", concluida: true, concluida_em: "2026-10-03T13:00:00.000Z" },
]);
const PROGRESSO_PELA_METADE = ok([
  { aula_id: "a1", concluida: true, concluida_em: "2026-10-02T13:00:00.000Z" },
]);
const QUESTOES = ok([
  { id: "q1", ordem: 1, pergunta: "P1", opcoes: ["a", "b"], correta: 0, comentario: null },
  { id: "q2", ordem: 2, pergunta: "P2", opcoes: ["a", "b"], correta: 1, comentario: null },
]);
const CURSO = ok({ nota_minima: 80, max_tentativas: 2, intervalo_tentativa_min: 60 });
const SEM_TENTATIVAS = ok([]);
const SEM_LIBERACAO = ok([]);

/** O cenário completo (todas as aulas feitas, prova com 2 questões, nenhuma tentativa), com o que o teste trocar. */
const cenario = (troca: Record<string, Resposta | Resposta[]> = {}) => ({
  treinamento_aula: AULAS,
  treinamento_progresso: PROGRESSO_COMPLETO,
  treinamento_questao: QUESTOES,
  treinamento_curso: CURSO,
  treinamento_tentativa: SEM_TENTATIVAS,
  treinamento_evento: SEM_LIBERACAO,
  ...troca,
});

async function preparar(
  troca: Record<string, Resposta | Resposta[]> = {},
  { comGabarito = false, mat = MAT } = {}
) {
  const banco = bancoDeTeste(cenario(troca));
  const { valor, erros } = await comLog(() =>
    prepararProva(banco.db, mat, EMPRESA, comGabarito, AGORA)
  );
  return { preparo: valor, erros, ...banco };
}

// ---------------------------------------------------------------------------------------- o caminho feliz

test("prepararProva: tudo lido e liberado devolve as questões, o curso e as tentativas (só a empresa da sessão)", async () => {
  const { preparo, de, erros } = await preparar();
  assert.equal(preparo.falha, null);
  if (preparo.falha !== null) return;
  assert.deepEqual(
    preparo.questoes.map((q: { id: string }) => q.id),
    ["q1", "q2"]
  );
  assert.equal(preparo.curso.nota_minima, 80);
  assert.equal(preparo.usadas, 0);
  assert.equal(preparo.max, 2);
  assert.deepEqual(erros, []);
  // questões, curso e liberações são da empresa da sessão; a liberação é só a do RH desta matrícula
  assert.ok(tem(de("treinamento_questao")[0], ["eq", "empresa_id", EMPRESA]));
  assert.ok(tem(de("treinamento_questao")[0], ["is", "deleted_at", null]));
  assert.ok(tem(de("treinamento_curso")[0], ["eq", "empresa_id", EMPRESA]));
  assert.ok(tem(de("treinamento_tentativa")[0], ["eq", "matricula_id", "m1"]));
  assert.ok(tem(de("treinamento_evento")[0], ["eq", "empresa_id", EMPRESA]));
  assert.ok(tem(de("treinamento_evento")[0], ["eq", "evento", "tentativa_liberada"]));
});

test("prepararProva: abrir a prova nunca lê o gabarito; só a correção carrega `correta` e `comentario`", async () => {
  const sem = await preparar({}, { comGabarito: false });
  const com = await preparar({}, { comGabarito: true });
  const colunas = (de: (t: string) => Chamada[]) =>
    String(de("treinamento_questao")[0].filtros.find((f) => f[0] === "select")?.[1]);
  assert.doesNotMatch(colunas(sem.de), /correta|comentario/);
  assert.match(colunas(com.de), /correta/);
  assert.match(colunas(com.de), /comentario/);
});

test("prepararProva: tentativas extras da matrícula somam ao limite do curso", async () => {
  const { preparo } = await preparar(
    {
      treinamento_tentativa: ok([
        { numero: 2, aprovada: false, created_at: "2026-10-05T10:00:00Z" },
        { numero: 1, aprovada: false, created_at: "2026-10-04T10:00:00Z" },
      ]),
    },
    { mat: { ...MAT, tentativas_extras: 1 } }
  );
  assert.equal(preparo.falha, null);
  if (preparo.falha !== null) return;
  assert.equal(preparo.usadas, 2);
  assert.equal(preparo.max, 3);
});

// ------------------------------------------------------------------------- as recusas que já existiam

test("prepararProva: matrícula já aprovada é 409 e não lê nada", async () => {
  const { preparo, chamadas } = await preparar({}, { mat: { ...MAT, avaliacao_aprovada: true } });
  assert.deepEqual(preparo, {
    falha: { mensagem: "Você já foi aprovado nesta avaliação", status: 409 },
  });
  assert.equal(chamadas.length, 0);
});

test("prepararProva: aula por concluir é 409 (trilha lida e incompleta)", async () => {
  const { preparo, de } = await preparar({ treinamento_progresso: PROGRESSO_PELA_METADE });
  assert.deepEqual(preparo, {
    falha: { mensagem: "Conclua todas as aulas antes da avaliação", status: 409 },
  });
  assert.equal(de("treinamento_questao").length, 0);
});

test("prepararProva: trilha ilegível (aulas ou progresso) é 503 e nem chega às questões", async () => {
  for (const tabela of ["treinamento_aula", "treinamento_progresso"]) {
    // a lista de aulas vazia liberaria a prova ("todas as aulas de uma lista vazia")
    const { preparo, de } = await preparar({ [tabela]: erro });
    assert.deepEqual(
      preparo,
      { falha: { mensagem: MSG_TRILHA_INDISPONIVEL, status: 503 } },
      tabela
    );
    assert.equal(de("treinamento_questao").length, 0, tabela);
  }
});

test("prepararProva: curso sem questões (lidas) é 400", async () => {
  const { preparo } = await preparar({ treinamento_questao: ok([]) });
  assert.deepEqual(preparo, { falha: { mensagem: "Este curso não tem avaliação", status: 400 } });
});

test("prepararProva: tentativas esgotadas é 403 LIMITE_TENTATIVAS", async () => {
  const { preparo } = await preparar({
    treinamento_tentativa: ok([
      { numero: 2, aprovada: false, created_at: "2026-10-05T10:00:00Z" },
      { numero: 1, aprovada: false, created_at: "2026-10-04T10:00:00Z" },
    ]),
  });
  assert.deepEqual(preparo, {
    falha: {
      mensagem: "Você usou todas as tentativas. Procure o RH para liberar uma nova.",
      status: 403,
      extra: { codigo: "LIMITE_TENTATIVAS" },
    },
  });
});

test("prepararProva: intervalo correndo é 429 AGUARDAR, com a hora de Brasília e a liberação em ISO", async () => {
  // reprovou às 13h30 UTC e o intervalo é de 60 min: libera às 14h30 UTC (11h30 em Brasília); agora são 14h UTC
  const { preparo } = await preparar({
    treinamento_tentativa: ok([
      { numero: 1, aprovada: false, created_at: "2026-10-07T13:30:00.000Z" },
    ]),
  });
  assert.deepEqual(preparo, {
    falha: {
      mensagem: "Nova tentativa liberada às 11:30. Revise as aulas enquanto isso.",
      status: 429,
      extra: { codigo: "AGUARDAR", liberada_em: "2026-10-07T14:30:00.000Z" },
    },
  });
});

test("prepararProva: liberação do RH depois da última tentativa dispensa o intervalo", async () => {
  const { preparo } = await preparar({
    treinamento_tentativa: ok([
      { numero: 1, aprovada: false, created_at: "2026-10-07T13:30:00.000Z" },
    ]),
    treinamento_evento: ok([{ created_at: "2026-10-07T13:45:00.000Z" }]),
  });
  assert.equal(preparo.falha, null);
});

// ---------------------------------------------- o achado: leitura que falhou não decide a prova (Important)

const LEITURAS = [
  { tabela: "treinamento_questao", nome: "questões" },
  { tabela: "treinamento_curso", nome: "curso" },
  { tabela: "treinamento_tentativa", nome: "tentativas" },
  { tabela: "treinamento_evento", nome: "liberações" },
];

test("prepararProva: cada uma das quatro leituras com erro é 503 e a prova não é preparada (nem aberta nem corrigida)", async () => {
  for (const comGabarito of [false, true]) {
    for (const { tabela, nome } of LEITURAS) {
      const { preparo } = await preparar({ [tabela]: erro }, { comGabarito });
      const rotulo = `${nome} (${comGabarito ? "envio" : "abertura"})`;
      assert.deepEqual(
        preparo,
        { falha: { mensagem: MSG_PROVA_INDISPONIVEL, status: 503 } },
        rotulo
      );
      // sem questões nem curso na resposta, o index.ts não tem com o que corrigir
      assert.equal("questoes" in preparo, false, rotulo);
      assert.equal("curso" in preparo, false, rotulo);
    }
  }
});

test("prepararProva: só o curso ilegível no envio NÃO corrige com a nota mínima padrão (curso de 80% e aluno com 75%)", async () => {
  // o cenário do achado: das quatro leituras só a do curso falha
  const { preparo, escritas } = await preparar({ treinamento_curso: erro }, { comGabarito: true });
  assert.notEqual(preparo.falha, null);
  assert.equal(preparo.falha?.status, 503);
  // a preparação não grava nada: a tentativa (imutável, 0135) só nasce depois de uma preparação sem falha
  assert.equal(escritas().length, 0);
});

test("prepararProva: leitura que falha manda a causa ao log, uma linha por leitura", async () => {
  const { erros } = await preparar({ treinamento_curso: erro, treinamento_evento: erro });
  assert.equal(erros.length, 2);
  for (const e of erros) {
    assert.match(String(e[0]), /\[portal-funcionario\] prepararProva/);
    assert.ok(e.includes(FALHA.message), "a causa vai ao log");
  }
  assert.ok(erros.some((e) => /curso/.test(String(e[0]))));
  assert.ok(erros.some((e) => /liberações/.test(String(e[0]))));
});

test("prepararProva: questões ilegíveis são 503, não 'Este curso não tem avaliação'", async () => {
  const { preparo } = await preparar({ treinamento_questao: erro });
  assert.equal(preparo.falha?.status, 503);
  assert.notEqual(preparo.falha?.mensagem, "Este curso não tem avaliação");
});

test("prepararProva: tentativas anteriores ilegíveis não viram '0 usadas' nem liberam o intervalo", async () => {
  // o último erro-tipo do achado: sem ler as tentativas, um reprovado com intervalo correndo passaria direto
  const { preparo } = await preparar({ treinamento_tentativa: erro });
  assert.equal(preparo.falha?.status, 503);
  assert.equal(preparo.falha?.extra, undefined);
});

test("prepararProva: erro de leitura vem antes de qualquer regra da prova (esgotada, intervalo, sem questões)", async () => {
  // questões vazias E curso ilegível: o 503 é o que o aluno vê, não o 400
  const { preparo } = await preparar({ treinamento_questao: ok([]), treinamento_curso: erro });
  assert.equal(preparo.falha?.status, 503);
});
