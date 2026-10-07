// Roda com Node 23.6+ (type stripping):
//   node --test supabase/functions/portal-funcionario/conclusao.test.ts
//
// A7 (achado Important da revisão 3 da A6): a conclusão do curso nunca decide com uma leitura que falhou. As
// funções de conclusao.ts recebem o banco por parâmetro; aqui ele é um banco de teste que devolve, por tabela, o
// que cada cenário pede (inclusive `error`, como o postgrest-js faz: ele não lança em falha de rede ou de banco).
// Dados sintéticos: ids e datas inventados.
import { test } from "node:test";
import assert from "node:assert/strict";
import { concluirSeCompleto, situacaoReal, trilhaDoCurso } from "./conclusao.ts";
import { bloqueioDaTrilhaNoCertificado, MSG_TRILHA_INDISPONIVEL } from "./regras.ts";

type Resposta = { data: unknown; error?: unknown };
type Chamada = { tabela: string; filtros: unknown[][] };

/**
 * Banco de teste: `cenario[tabela]` (leitura) e `cenario["tabela:update"]` (gravação) dão a resposta; uma lista
 * dá uma resposta por chamada, na ordem (a última se repete), para a primeira leitura falhar e a segunda não.
 */
function bancoDeTeste(cenario: Record<string, Resposta | Resposta[]>) {
  const chamadas: Chamada[] = [];
  const usadas = new Map<string, number>();
  const proxima = (chave: string): Resposta => {
    const r = cenario[chave];
    if (!Array.isArray(r)) return r ?? { data: [], error: null };
    const i = usadas.get(chave) ?? 0;
    usadas.set(chave, i + 1);
    return r[Math.min(i, r.length - 1)];
  };
  const db = {
    from(tabela: string) {
      const chamada: Chamada = { tabela, filtros: [] };
      chamadas.push(chamada);
      let chave = tabela;
      const anotar =
        (nome: string) =>
        (...args: unknown[]) => (chamada.filtros.push([nome, ...args]), consulta);
      const consulta: Record<string, unknown> = {
        select: anotar("select"),
        eq: anotar("eq"),
        in: anotar("in"),
        is: anotar("is"),
        order: anotar("order"),
        limit: anotar("limit"),
        maybeSingle: anotar("maybeSingle"),
        update: (patch: unknown) => {
          chave = `${tabela}:update`;
          chamada.filtros.push(["update", patch]);
          return consulta;
        },
        then: (resolve: (v: unknown) => unknown, rejeitar?: (e: unknown) => unknown) =>
          Promise.resolve()
            .then(() => proxima(chave))
            .then(resolve, rejeitar),
      };
      return consulta;
    },
  };
  const de = (tabela: string) => chamadas.filter((c) => c.tabela === tabela);
  const gravacoes = () =>
    chamadas.filter(
      (c) => c.tabela === "treinamento_matricula" && c.filtros.some((f) => f[0] === "update")
    );
  return { db, chamadas, de, gravacoes };
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
const MAT = { id: "m1", curso_id: "c1", status: "em_andamento" };
const FALHA = { message: "conexão com o banco caiu" };
const ok = (data: unknown): Resposta => ({ data, error: null });
const erro: Resposta = { data: null, error: FALHA };

const AULAS = ok([
  { id: "a1", ordem: 1, tipo: "video", duracao_seg: 600 },
  { id: "a2", ordem: 2, tipo: "video", duracao_seg: 600 },
]);
// a última aula às 10h de 03/10 em Brasília; a aprovação às 11h
const PROGRESSO_COMPLETO = ok([
  { aula_id: "a1", concluida: true, concluida_em: "2026-10-02T13:00:00.000Z" },
  { aula_id: "a2", concluida: true, concluida_em: "2026-10-03T13:00:00.000Z" },
]);
const PROGRESSO_PELA_METADE = ok([
  { aula_id: "a1", concluida: true, concluida_em: "2026-10-02T13:00:00.000Z" },
]);
const QUESTOES = ok([{ id: "q1" }]);
const SEM_QUESTOES = ok([]);
const APROVADA = ok([{ numero: 1, nota: 90, created_at: "2026-10-03T14:00:00.000Z" }]);
const SEM_APROVACAO = ok([]);
const CURSO = ok({ validade_meses: 24, modalidade: "ead" });

/** O cenário completo (todas as aulas e a aprovação), com o que o teste trocar. */
const cenario = (troca: Record<string, Resposta | Resposta[]> = {}) => ({
  treinamento_aula: AULAS,
  treinamento_progresso: PROGRESSO_COMPLETO,
  treinamento_questao: QUESTOES,
  treinamento_tentativa: APROVADA,
  treinamento_curso: CURSO,
  "treinamento_matricula:update": ok(null),
  ...troca,
});

/** concluirSeCompleto com a marca e a pausa da segunda leitura anotadas. */
async function concluir(troca: Record<string, Resposta | Resposta[]> = {}) {
  const banco = bancoDeTeste(cenario(troca));
  const marcas: string[] = [];
  let pausas = 0;
  const { valor, erros } = await comLog(() =>
    concluirSeCompleto(
      banco.db,
      MAT,
      EMPRESA,
      async (motivo) => void marcas.push(motivo),
      async () => void (pausas += 1)
    )
  );
  return { resultado: valor, erros, marcas, pausas, ...banco };
}

// ------------------------------------------------------------------------------------- trilhaDoCurso

test("trilhaDoCurso: aulas e progresso lidos devolvem a trilha e lida: true (só a empresa da sessão)", async () => {
  const { db, de } = bancoDeTeste(cenario());
  const trilha = await trilhaDoCurso(db, "c1", "m1", EMPRESA);
  assert.equal(trilha.lida, true);
  assert.deepEqual(
    trilha.aulas.map((a: { id: string }) => a.id),
    ["a1", "a2"]
  );
  assert.deepEqual([...trilha.feitas], ["a1", "a2"]);
  assert.ok(tem(de("treinamento_aula")[0], ["eq", "empresa_id", EMPRESA]));
  assert.ok(tem(de("treinamento_aula")[0], ["is", "deleted_at", null]));
  assert.ok(tem(de("treinamento_progresso")[0], ["eq", "matricula_id", "m1"]));
});

test("trilhaDoCurso: erro na leitura das aulas ou do progresso devolve lida: false e manda a causa ao log", async () => {
  const trocas: Record<string, Resposta>[] = [
    { treinamento_aula: erro },
    { treinamento_progresso: erro },
  ];
  for (const troca of trocas) {
    const { db } = bancoDeTeste(cenario(troca));
    const { valor: trilha, erros } = await comLog(() => trilhaDoCurso(db, "c1", "m1", EMPRESA));
    assert.equal(trilha.lida, false, JSON.stringify(troca));
    assert.equal(erros.length, 1);
    assert.match(String(erros[0][0]), /\[portal-funcionario\] trilhaDoCurso/);
    assert.ok(erros[0].includes(FALHA.message), "a causa vai ao log");
  }
});

// -------------------------------------------------------------------------------------- situacaoReal

test("situacaoReal: tudo lido e completo conclui, com o marco da aprovação", async () => {
  const { db, de } = bancoDeTeste(cenario());
  const sit = await situacaoReal(db, MAT, EMPRESA);
  assert.equal(sit.lida, true);
  assert.equal(sit.trilhaLida, true);
  assert.equal(sit.provaLida, true);
  assert.equal(sit.concluido, true);
  assert.equal(sit.marco?.toISOString(), "2026-10-03T14:00:00.000Z");
  // questões e tentativa só do curso e da empresa da sessão
  assert.ok(tem(de("treinamento_questao")[0], ["eq", "empresa_id", EMPRESA]));
  assert.ok(tem(de("treinamento_tentativa")[0], ["eq", "matricula_id", "m1"]));
  assert.ok(tem(de("treinamento_tentativa")[0], ["eq", "aprovada", true]));
});

test("situacaoReal: questões ilegíveis NÃO viram 'curso sem prova' (o achado: conclusão sem aprovação)", async () => {
  // sem a aprovação, a conta antiga dava temAvaliacao false e concluido true
  const { db } = bancoDeTeste(
    cenario({ treinamento_questao: erro, treinamento_tentativa: SEM_APROVACAO })
  );
  const { valor: sit, erros } = await comLog(() => situacaoReal(db, MAT, EMPRESA));
  assert.equal(sit.provaLida, false);
  assert.equal(sit.trilhaLida, true);
  assert.equal(sit.lida, false);
  assert.equal(sit.concluido, false);
  assert.ok(erros.some((e) => /situacaoReal: questões/.test(String(e[0]))));
});

test("situacaoReal: aprovação ilegível ou trilha ilegível também não concluem (lida: false)", async () => {
  const trocas: Record<string, Resposta>[] = [
    { treinamento_tentativa: erro },
    { treinamento_aula: erro },
    { treinamento_progresso: erro },
  ];
  for (const troca of trocas) {
    const { db } = bancoDeTeste(cenario(troca));
    const { valor: sit, erros } = await comLog(() => situacaoReal(db, MAT, EMPRESA));
    assert.equal(sit.lida, false, JSON.stringify(troca));
    assert.equal(sit.concluido, false, JSON.stringify(troca));
    assert.ok(erros.length >= 1, "a causa vai ao log");
  }
});

// ------------------------------------------------------------------------------------ concluirSeCompleto

test("concluirSeCompleto: tudo lido conclui, grava só a matrícula da empresa, com a data do último marco", async () => {
  const r = await concluir();
  assert.equal(r.resultado.concluiu, true);
  assert.equal(r.resultado.data_conclusao, "2026-10-03");
  assert.deepEqual(r.marcas, []);
  assert.equal(r.pausas, 0, "nada falhou: uma leitura só");
  const [gravacao] = r.gravacoes();
  assert.ok(
    tem(gravacao, [
      "update",
      {
        status: "concluido",
        data_conclusao: "2026-10-03",
        proxima_renovacao: "2028-10-03",
      },
    ])
  );
  assert.ok(tem(gravacao, ["eq", "id", "m1"]));
  assert.ok(tem(gravacao, ["eq", "empresa_id", EMPRESA]));
  assert.equal(r.de("treinamento_aula").length, 1);
});

test("concluirSeCompleto: questões ilegíveis na última aula não concluem e marcam 'prova_nao_lida'", async () => {
  // a última aula acabou de ser concluída; o curso tem prova e o aluno ainda não a fez
  const r = await concluir({ treinamento_questao: erro, treinamento_tentativa: SEM_APROVACAO });
  assert.equal(r.resultado.concluiu, false);
  assert.equal(r.resultado.status, "em_andamento");
  assert.equal(r.resultado.precisaAvaliacao, false);
  assert.equal(r.gravacoes().length, 0, "nenhuma conclusão gravada");
  assert.deepEqual(r.marcas, ["prova_nao_lida"]);
  // relê uma vez antes de adiar (a queda passageira se resolve aqui)
  assert.equal(r.pausas, 1);
  assert.equal(r.de("treinamento_questao").length, 2);
});

test("concluirSeCompleto: aprovação ilegível logo depois da aprovação marca 'prova_nao_lida'", async () => {
  const r = await concluir({ treinamento_tentativa: erro });
  assert.equal(r.resultado.concluiu, false);
  assert.equal(r.gravacoes().length, 0);
  assert.deepEqual(r.marcas, ["prova_nao_lida"]);
  assert.ok(r.erros.some((e) => /situacaoReal: aprovação/.test(String(e[0]))));
});

test("concluirSeCompleto: aulas ilegíveis não concluem e NÃO marcam, depois de uma segunda leitura", async () => {
  const r = await concluir({ treinamento_aula: erro });
  assert.equal(r.resultado.concluiu, false);
  assert.equal(r.gravacoes().length, 0);
  assert.deepEqual(
    r.marcas,
    [],
    "marcar às cegas deixaria a retomada concluir uma trilha incompleta"
  );
  assert.equal(r.pausas, 1);
  assert.equal(r.de("treinamento_aula").length, 2, "uma segunda leitura antes de desistir");
  assert.ok(
    r.erros.some((e) => /trilha ilegível/.test(String(e[0]))),
    "a desistência vai ao log"
  );
});

test("concluirSeCompleto: progresso ilegível também não conclui e não marca", async () => {
  const r = await concluir({ treinamento_progresso: erro });
  assert.equal(r.resultado.concluiu, false);
  assert.equal(r.gravacoes().length, 0);
  assert.deepEqual(r.marcas, []);
  assert.equal(r.de("treinamento_progresso").length, 2);
});

test("concluirSeCompleto: a queda passageira (aulas ilegíveis só na primeira leitura) conclui na segunda", async () => {
  const r = await concluir({ treinamento_aula: [erro, AULAS] });
  assert.equal(r.resultado.concluiu, true);
  assert.equal(r.resultado.data_conclusao, "2026-10-03");
  assert.deepEqual(r.marcas, []);
  assert.equal(r.gravacoes().length, 1);
});

test("concluirSeCompleto: a segunda leitura também salva a prova ilegível só na primeira (conclui, sem marca)", async () => {
  const r = await concluir({ treinamento_questao: [erro, QUESTOES] });
  assert.equal(r.resultado.concluiu, true);
  assert.deepEqual(r.marcas, []);
});

test("concluirSeCompleto: curso ilegível nas duas leituras marca 'curso_nao_lido' (como na A6)", async () => {
  const r = await concluir({ treinamento_curso: erro });
  assert.equal(r.resultado.concluiu, false);
  assert.equal(r.gravacoes().length, 0);
  assert.deepEqual(r.marcas, ["curso_nao_lido"]);
  assert.equal(r.de("treinamento_curso").length, 2);
});

test("concluirSeCompleto: trilha lida e incompleta não relê, não conclui e não marca", async () => {
  const r = await concluir({ treinamento_progresso: PROGRESSO_PELA_METADE });
  assert.equal(r.resultado.concluiu, false);
  assert.equal(r.pausas, 0);
  assert.deepEqual(r.marcas, []);
  // aulas feitas e prova pendente: é a hora da prova
  const prova = await concluir({ treinamento_tentativa: SEM_APROVACAO });
  assert.equal(prova.resultado.precisaAvaliacao, true);
  assert.deepEqual(prova.marcas, []);
});

test("concluirSeCompleto: curso sem prova (questões lidas e vazias) conclui sem aprovação, como sempre", async () => {
  const r = await concluir({
    treinamento_questao: SEM_QUESTOES,
    treinamento_tentativa: SEM_APROVACAO,
  });
  assert.equal(r.resultado.concluiu, true);
  assert.equal(r.resultado.data_conclusao, "2026-10-03");
});

test("concluirSeCompleto: a gravação que falha não diz que concluiu e marca 'gravacao_falhou'", async () => {
  const r = await concluir({ "treinamento_matricula:update": erro });
  assert.equal(r.resultado.concluiu, false);
  assert.equal(r.resultado.data_conclusao, null);
  assert.deepEqual(r.marcas, ["gravacao_falhou"]);
});

test("concluirSeCompleto: sem quem marque (certificado, retomada), a prova ilegível só não conclui", async () => {
  const banco = bancoDeTeste(cenario({ treinamento_questao: erro }));
  const { valor } = await comLog(() =>
    concluirSeCompleto(banco.db, MAT, EMPRESA, undefined, async () => {})
  );
  assert.equal(valor.concluiu, false);
  assert.equal(banco.gravacoes().length, 0);
});

// --------------------------------------------------------------------- certificado (bloqueio da trilha)

test("certificado: com a trilha ilegível o pedido é 503 (tente de novo), não 409 'Conclua o curso'", async () => {
  const trocas: Record<string, Resposta>[] = [
    { treinamento_aula: erro },
    { treinamento_progresso: erro },
    { treinamento_questao: erro },
    { treinamento_tentativa: erro },
  ];
  for (const troca of trocas) {
    const { db } = bancoDeTeste(cenario(troca));
    const { valor: sit } = await comLog(() => situacaoReal(db, MAT, EMPRESA));
    assert.deepEqual(
      bloqueioDaTrilhaNoCertificado(sit),
      { status: 503, mensagem: MSG_TRILHA_INDISPONIVEL },
      JSON.stringify(troca)
    );
  }
});

test("certificado: trilha lida e incompleta é 409; completa segue", async () => {
  const incompleta = bancoDeTeste(cenario({ treinamento_progresso: PROGRESSO_PELA_METADE }));
  assert.equal(
    bloqueioDaTrilhaNoCertificado(await situacaoReal(incompleta.db, MAT, EMPRESA))?.status,
    409
  );
  const completa = bancoDeTeste(cenario());
  assert.equal(bloqueioDaTrilhaNoCertificado(await situacaoReal(completa.db, MAT, EMPRESA)), null);
});
