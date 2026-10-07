import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LIMITE_HISTORICO_CIENCIAS, confirmarCiencia, listarCienciasDoAluno } from "./ciencia.ts";

type Chamada = { operacao: string; tabela: string; filtros: unknown[][]; dados?: unknown };

/**
 * Cliente de teste no formato do supabase-js: guarda cada consulta (tabela, filtros, dados) e
 * devolve o que o cenário mandar para a leitura (maybeSingle) e para o UPDATE (select("id")).
 */
function bancoDeTeste(cenario: {
  leitura?: { data: unknown; error?: unknown };
  escrita?: { data: unknown; error?: unknown };
}) {
  const chamadas: Chamada[] = [];
  const db = {
    from(tabela: string) {
      const chamada: Chamada = { operacao: "select", tabela, filtros: [] };
      chamadas.push(chamada);
      const consulta = {
        select(colunas?: string) {
          chamada.filtros.push(["select", colunas]);
          return consulta;
        },
        update(dados: unknown) {
          chamada.operacao = "update";
          chamada.dados = dados;
          return consulta;
        },
        eq(campo: string, valor: unknown) {
          chamada.filtros.push(["eq", campo, valor]);
          return consulta;
        },
        is(campo: string, valor: unknown) {
          chamada.filtros.push(["is", campo, valor]);
          return consulta;
        },
        maybeSingle() {
          return Promise.resolve(cenario.leitura ?? { data: null, error: null });
        },
        // o UPDATE termina no await do próprio construtor (select("id") devolve a consulta)
        then(resolve: (valor: unknown) => unknown, rejeitar?: (erro: unknown) => unknown) {
          return Promise.resolve(cenario.escrita ?? { data: [], error: null }).then(
            resolve,
            rejeitar
          );
        },
      };
      return consulta;
    },
  };
  return { db, chamadas };
}

const ID_CIENCIA = "00000000-0000-4000-8000-000000000001";
const evidencia = {
  metodo: "portal_funcionario_login",
  usuario: "aluno-teste",
  confirmado_em: "2026-10-05T12:00:00.000Z",
  ip: "203.0.113.7",
};
const pedido = {
  cienciaId: ID_CIENCIA,
  funcionarioId: "func-teste",
  empresaId: "empresa-teste",
  evidencia,
};

test("confirma uma entrega pendente e grava a evidência", async () => {
  const { db, chamadas } = bancoDeTeste({
    leitura: { data: { id: ID_CIENCIA, status: "pendente" } },
    escrita: { data: [{ id: ID_CIENCIA }] },
  });
  const r = await confirmarCiencia(db, pedido);
  assert.deepEqual(r, { resultado: "confirmada" });
  const escrita = chamadas.find((c) => c.operacao === "update");
  assert.deepEqual(escrita?.dados, {
    status: "confirmada",
    confirmada_em: evidencia.confirmado_em,
    evidencia,
  });
});

test("o UPDATE só vale para entrega pendente, da empresa e do funcionário da sessão", async () => {
  const { db, chamadas } = bancoDeTeste({
    leitura: { data: { id: ID_CIENCIA, status: "pendente" } },
    escrita: { data: [{ id: ID_CIENCIA }] },
  });
  await confirmarCiencia(db, pedido);
  const escrita = chamadas.find((c) => c.operacao === "update");
  assert.equal(escrita?.tabela, "entrega_ciencia");
  for (const filtro of [
    ["eq", "id", ID_CIENCIA],
    ["eq", "empresa_id", "empresa-teste"],
    ["eq", "funcionario_id", "func-teste"],
    ["eq", "status", "pendente"],
    ["is", "deleted_at", null],
    ["select", "id"],
  ])
    assert.ok(
      escrita?.filtros.some((f) => JSON.stringify(f) === JSON.stringify(filtro)),
      `falta o filtro ${JSON.stringify(filtro)}`
    );
});

test("a leitura filtra empresa, funcionário e exclusão", async () => {
  const { db, chamadas } = bancoDeTeste({ leitura: { data: null } });
  await confirmarCiencia(db, pedido);
  const leitura = chamadas.find((c) => c.operacao === "select");
  for (const filtro of [
    ["eq", "id", ID_CIENCIA],
    ["eq", "empresa_id", "empresa-teste"],
    ["eq", "funcionario_id", "func-teste"],
    ["is", "deleted_at", null],
  ])
    assert.ok(
      leitura?.filtros.some((f) => JSON.stringify(f) === JSON.stringify(filtro)),
      `falta o filtro ${JSON.stringify(filtro)}`
    );
});

test("entrega que já estava confirmada na leitura não é regravada", async () => {
  const { db, chamadas } = bancoDeTeste({
    leitura: { data: { id: ID_CIENCIA, status: "confirmada" } },
  });
  const r = await confirmarCiencia(db, pedido);
  assert.deepEqual(r, { resultado: "ja_confirmada" });
  assert.equal(chamadas.filter((c) => c.operacao === "update").length, 0);
});

test("segunda aba: o UPDATE não atinge nenhuma linha e responde como já confirmada", async () => {
  // a leitura ainda viu "pendente", mas outra aba confirmou antes do UPDATE
  const { db } = bancoDeTeste({
    leitura: { data: { id: ID_CIENCIA, status: "pendente" } },
    escrita: { data: [] },
  });
  assert.deepEqual(await confirmarCiencia(db, pedido), { resultado: "ja_confirmada" });
});

test("UPDATE sem retorno (data nulo) também conta como já confirmada", async () => {
  const { db } = bancoDeTeste({
    leitura: { data: { id: ID_CIENCIA, status: "pendente" } },
    escrita: { data: null },
  });
  assert.deepEqual(await confirmarCiencia(db, pedido), { resultado: "ja_confirmada" });
});

test("registro inexistente, de outra empresa ou excluído: não encontrado e sem UPDATE", async () => {
  const { db, chamadas } = bancoDeTeste({ leitura: { data: null } });
  assert.deepEqual(await confirmarCiencia(db, pedido), { resultado: "nao_encontrada" });
  assert.equal(chamadas.filter((c) => c.operacao === "update").length, 0);
});

test("erro do banco na leitura ou no UPDATE vira erro, não 404 nem sucesso", async (t) => {
  t.mock.method(console, "error", () => {});
  const leituraComErro = bancoDeTeste({ leitura: { data: null, error: { message: "falha" } } });
  assert.deepEqual(await confirmarCiencia(leituraComErro.db, pedido), { resultado: "erro" });

  const escritaComErro = bancoDeTeste({
    leitura: { data: { id: ID_CIENCIA, status: "pendente" } },
    escrita: { data: null, error: { message: "falha" } },
  });
  assert.deepEqual(await confirmarCiencia(escritaComErro.db, pedido), { resultado: "erro" });
});

// T7: o erro do banco não pode sumir sem rastro (o 500 genérico sozinho não diz a causa nos logs)
test("erro do banco na leitura deixa rastro no log, com a etapa e o motivo", async (t) => {
  const erro = t.mock.method(console, "error", () => {});
  const { db } = bancoDeTeste({
    leitura: { data: null, error: { message: "permission denied for table x", code: "42501" } },
  });
  assert.deepEqual(await confirmarCiencia(db, pedido), { resultado: "erro" });
  assert.equal(erro.mock.callCount(), 1);
  const texto = erro.mock.calls[0].arguments.join(" ");
  assert.match(texto, /ciência/);
  assert.match(texto, /leitura/);
  assert.match(texto, /permission denied for table x/);
  assert.match(texto, /42501/);
});

test("erro do banco no UPDATE deixa rastro no log, com a etapa e o motivo", async (t) => {
  const erro = t.mock.method(console, "error", () => {});
  const { db } = bancoDeTeste({
    leitura: { data: { id: ID_CIENCIA, status: "pendente" } },
    escrita: { data: null, error: { message: "trigger recusou", code: "42501" } },
  });
  assert.deepEqual(await confirmarCiencia(db, pedido), { resultado: "erro" });
  assert.equal(erro.mock.callCount(), 1);
  const texto = erro.mock.calls[0].arguments.join(" ");
  assert.match(texto, /ciência/);
  assert.match(texto, /confirma/);
  assert.match(texto, /trigger recusou/);
});

test("o rastro do erro não leva a evidência (IP, dispositivo, usuário) para o log", async (t) => {
  const erro = t.mock.method(console, "error", () => {});
  const { db } = bancoDeTeste({
    leitura: { data: { id: ID_CIENCIA, status: "pendente" } },
    escrita: { data: null, error: { message: "falha" } },
  });
  await confirmarCiencia(db, pedido);
  const texto = erro.mock.calls.map((c) => c.arguments.join(" ")).join(" ");
  assert.equal(texto.includes(evidencia.ip), false);
  assert.equal(texto.includes(evidencia.usuario), false);
});

test("sem erro (confirmada, já confirmada ou não encontrada) nada vai para o log de erro", async (t) => {
  const erro = t.mock.method(console, "error", () => {});
  const confirmada = bancoDeTeste({
    leitura: { data: { id: ID_CIENCIA, status: "pendente" } },
    escrita: { data: [{ id: ID_CIENCIA }] },
  });
  await confirmarCiencia(confirmada.db, pedido);
  await confirmarCiencia(bancoDeTeste({ leitura: { data: null } }).db, pedido);
  await confirmarCiencia(
    bancoDeTeste({ leitura: { data: { id: ID_CIENCIA, status: "confirmada" } } }).db,
    pedido
  );
  assert.equal(erro.mock.callCount(), 0);
});

test("id que não é UUID (ou nem é texto) é não encontrado, sem consultar o banco", async () => {
  for (const cienciaId of ["abc", "", "1; drop table x", null, undefined, 7, { id: "x" }]) {
    const { db, chamadas } = bancoDeTeste({
      leitura: { data: null, error: { message: "invalid input syntax for type uuid" } },
    });
    const r = await confirmarCiencia(db, { ...pedido, cienciaId: cienciaId as unknown as string });
    assert.deepEqual(r, { resultado: "nao_encontrada" });
    assert.equal(chamadas.length, 0);
  }
});

// T7: o smoke em SQL (roda o Javerson, em transação com rollback) precisa conferir o que diz e
// escolher o funcionário pelo mesmo critério que o comentário e o portal usam.
test("smoke da ciência: confere itens ao corrigir a pendente e escolhe funcionário ATIVO (como o comentário diz)", () => {
  const sql = readFileSync(
    new URL("../../../tools/smoke-ead-ciencia.sql", import.meta.url),
    "utf8"
  ).replace(/\r\n/g, "\n");
  // passo 4: o UPDATE grava tipo, descricao E itens, e a conferência lê os três
  assert.match(
    sql,
    /set tipo = 'Ferramenta', descricao = [^\n]+, itens = '\[\{"nome":"capacete"\}\]'::jsonb/
  );
  const passo4 = sql.slice(sql.indexOf("-- 4. pendente"), sql.indexOf("-- 5. confirmar direto"));
  assert.match(passo4, /v_linha\.itens is distinct from '\[\{"nome":"capacete"\}\]'::jsonb/);
  // passo 1: o filtro tem o mesmo critério do portal (funcionarioPodeEntrar: ativo !== false e sem deleted_at)
  const passo1 = sql.slice(
    sql.indexOf("-- 1. empresa e funcionário de teste"),
    sql.indexOf("-- ---")
  );
  assert.match(passo1, /f\.deleted_at is null/);
  assert.match(passo1, /f\.ativo is not false/);
  // sem UUID fixo no arquivo (repositório público)
  assert.equal(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(sql), false);
});

// ----------------------------------------------- lista que o portal mostra (dados.ciencias)

type LinhaDeCiencia = {
  id: string;
  funcionario_id: string;
  empresa_id: string;
  status: string;
  created_at: string;
  deleted_at: string | null;
};

/**
 * Banco de teste que APLICA os filtros, a ordem e o limite sobre linhas de verdade: assim o teste
 * enxerga o que a consulta realmente devolveria (um `.limit(30)` que corta pendentes aparece aqui).
 */
function bancoComLinhas(linhas: LinhaDeCiencia[], erroNaConsultaDe?: string) {
  const consultas: { eqs: Record<string, unknown>; limite: number | null; ordem: unknown }[] = [];
  const db = {
    from(tabela: string) {
      assert.equal(tabela, "entrega_ciencia");
      const eqs: Record<string, unknown> = {};
      const nulos: string[] = [];
      let limite: number | null = null;
      let ordem: { campo: string; ascending: boolean } | null = null;
      const consulta = {
        select() {
          return consulta;
        },
        eq(campo: string, valor: unknown) {
          eqs[campo] = valor;
          return consulta;
        },
        is(campo: string, valor: unknown) {
          assert.equal(valor, null);
          nulos.push(campo);
          return consulta;
        },
        order(campo: string, opcoes?: { ascending?: boolean }) {
          ordem = { campo, ascending: opcoes?.ascending !== false };
          return consulta;
        },
        limit(n: number) {
          limite = n;
          return consulta;
        },
        then(resolve: (valor: unknown) => unknown, rejeitar?: (erro: unknown) => unknown) {
          consultas.push({ eqs, limite, ordem });
          if (erroNaConsultaDe && eqs.status === erroNaConsultaDe) {
            return Promise.resolve({ data: null, error: { message: "banco fora do ar" } }).then(
              resolve,
              rejeitar
            );
          }
          let r = linhas.filter(
            (l) =>
              Object.entries(eqs).every(([c, v]) => (l as Record<string, unknown>)[c] === v) &&
              nulos.every((c) => (l as Record<string, unknown>)[c] === null)
          );
          if (ordem) {
            const { campo, ascending } = ordem;
            r = [...r].sort((a, b) => {
              const x = String((a as Record<string, unknown>)[campo]);
              const y = String((b as Record<string, unknown>)[campo]);
              return ascending ? x.localeCompare(y) : y.localeCompare(x);
            });
          }
          if (limite !== null) r = r.slice(0, limite);
          return Promise.resolve({ data: r, error: null }).then(resolve, rejeitar);
        },
      };
      return consulta;
    },
  };
  return { db, consultas };
}

const dia = (n: number) => `2026-09-${String((n % 28) + 1).padStart(2, "0")}T12:00:00.000Z`;
const linha = (
  id: string,
  status: string,
  n: number,
  extra: Partial<LinhaDeCiencia> = {}
): LinhaDeCiencia => ({
  id,
  funcionario_id: "func-teste",
  empresa_id: "empresa-teste",
  status,
  created_at: `2026-0${(n % 9) + 1}-10T12:00:00.000Z`,
  deleted_at: null,
  ...extra,
});

test("as pendentes NUNCA somem pelo limite do histórico: a mais antiga de 40 entregas ainda vem", async () => {
  // a pendente é a MAIS ANTIGA de todas; depois dela há 45 confirmadas e mais 4 pendentes recentes
  const linhas: LinhaDeCiencia[] = [
    linha("pendente-antiga", "pendente", 0, { created_at: "2025-01-01T00:00:00.000Z" }),
    ...Array.from({ length: 45 }, (_, i) =>
      linha(`conf-${i}`, "confirmada", i, {
        created_at: `2026-03-${String((i % 28) + 1).padStart(2, "0")}T12:00:00.000Z`,
      })
    ),
    ...Array.from({ length: 4 }, (_, i) =>
      linha(`pend-${i}`, "pendente", i, {
        created_at: `2026-09-${String(i + 1).padStart(2, "0")}T12:00:00.000Z`,
      })
    ),
  ];
  const { db } = bancoComLinhas(linhas);
  const r = await listarCienciasDoAluno(db, {
    funcionarioId: "func-teste",
    empresaId: "empresa-teste",
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const pendentes = r.ciencias.filter((c) => c.status === "pendente");
  assert.equal(pendentes.length, 5, "as 5 pendentes vêm, a mais antiga inclusive");
  assert.ok(pendentes.some((c) => c.id === "pendente-antiga"));
  // o histórico confirmado tem o limite, e vem das mais recentes
  const confirmadas = r.ciencias.filter((c) => c.status === "confirmada");
  assert.equal(confirmadas.length, LIMITE_HISTORICO_CIENCIAS);
  assert.equal(LIMITE_HISTORICO_CIENCIAS, 30);
});

test("a consulta das pendentes não tem limite; a das confirmadas tem; as duas filtram empresa e funcionário", async () => {
  const { db, consultas } = bancoComLinhas([
    linha("a", "pendente", 1),
    linha("b", "confirmada", 2),
  ]);
  await listarCienciasDoAluno(db, { funcionarioId: "func-teste", empresaId: "empresa-teste" });
  assert.equal(consultas.length, 2);
  const pendentes = consultas.find((c) => c.eqs.status === "pendente");
  const confirmadas = consultas.find((c) => c.eqs.status === "confirmada");
  assert.ok(pendentes && confirmadas);
  assert.equal(pendentes.limite, null, "pendente nunca é cortada");
  assert.equal(confirmadas.limite, LIMITE_HISTORICO_CIENCIAS);
  for (const c of consultas) {
    assert.equal(c.eqs.funcionario_id, "func-teste");
    assert.equal(c.eqs.empresa_id, "empresa-teste");
  }
});

test("outro funcionário, outra empresa e entrega apagada nunca entram na lista", async () => {
  const { db } = bancoComLinhas([
    linha("minha", "pendente", 1),
    linha("de-outro", "pendente", 2, { funcionario_id: "outro" }),
    linha("de-outra-empresa", "confirmada", 3, { empresa_id: "outra" }),
    linha("apagada", "pendente", 4, { deleted_at: "2026-09-01T00:00:00.000Z" }),
  ]);
  const r = await listarCienciasDoAluno(db, {
    funcionarioId: "func-teste",
    empresaId: "empresa-teste",
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(
    r.ciencias.map((c) => c.id),
    ["minha"]
  );
});

test("a lista sai com as pendentes primeiro e depois as confirmadas, cada grupo da mais nova para a mais antiga", async () => {
  const { db } = bancoComLinhas([
    linha("c-velha", "confirmada", 1, { created_at: "2026-01-01T00:00:00.000Z" }),
    linha("p-velha", "pendente", 1, { created_at: "2026-02-01T00:00:00.000Z" }),
    linha("c-nova", "confirmada", 1, { created_at: "2026-08-01T00:00:00.000Z" }),
    linha("p-nova", "pendente", 1, { created_at: "2026-09-01T00:00:00.000Z" }),
  ]);
  const r = await listarCienciasDoAluno(db, {
    funcionarioId: "func-teste",
    empresaId: "empresa-teste",
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(
    r.ciencias.map((c) => c.id),
    ["p-nova", "p-velha", "c-nova", "c-velha"]
  );
});

test("erro em qualquer das duas leituras: não devolve lista pela metade, avisa e deixa a causa no log", async () => {
  const original = console.error;
  const logs: unknown[][] = [];
  console.error = (...args: unknown[]) => logs.push(args);
  try {
    for (const quebra of ["pendente", "confirmada"]) {
      const { db } = bancoComLinhas(
        [linha("a", "pendente", 1), linha("b", "confirmada", 2)],
        quebra
      );
      const r = await listarCienciasDoAluno(db, {
        funcionarioId: "func-teste",
        empresaId: "empresa-teste",
      });
      assert.deepEqual(r, { ok: false });
    }
  } finally {
    console.error = original;
  }
  assert.equal(logs.length, 2);
  assert.match(String(logs[0].join(" ")), /banco fora do ar/);
  assert.match(String(logs[0].join(" ")), /ciências/);
});

test("index.ts: a ação dados lista as ciências por listarCienciasDoAluno (sem .limit(30) direto na consulta)", () => {
  const codigo = readFileSync(new URL("./index.ts", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.match(codigo, /listarCienciasDoAluno\(supabase,/);
  // a consulta de entrega_ciencia do index.ts não pode voltar a cortar pendente
  assert.equal(codigo.includes('.from("entrega_ciencia")'), false);
  // falha de leitura (A6): a lista de cursos segue e `ciencias` vai null, para o portal avisar; nada de 503
  // (o 503 derrubava os cursos por causa de uma falha só da tabela de entregas)
  const uso = codigo.indexOf("listarCienciasDoAluno(supabase,");
  assert.doesNotMatch(codigo.slice(uso, uso + 500), /fail\([^)]*503\)/);
  assert.match(
    codigo,
    /ciencias:\s*listaDeCiencias\.ok\s*\?\s*listaDeCiencias\.ciencias\s*:\s*null/
  );
});
