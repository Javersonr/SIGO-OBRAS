import { test } from "node:test";
import assert from "node:assert/strict";
import { confirmarCiencia } from "./ciencia.ts";

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

test("erro do banco na leitura ou no UPDATE vira erro, não 404 nem sucesso", async () => {
  const leituraComErro = bancoDeTeste({ leitura: { data: null, error: { message: "falha" } } });
  assert.deepEqual(await confirmarCiencia(leituraComErro.db, pedido), { resultado: "erro" });

  const escritaComErro = bancoDeTeste({
    leitura: { data: { id: ID_CIENCIA, status: "pendente" } },
    escrita: { data: null, error: { message: "falha" } },
  });
  assert.deepEqual(await confirmarCiencia(escritaComErro.db, pedido), { resultado: "erro" });
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
