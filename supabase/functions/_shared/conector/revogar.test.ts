// node --test supabase/functions/_shared/conector/revogar.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { revogarAutorizacao, revogarConectorDoUsuario } from "./revogar.ts";

type Chamada = { tabela: string; valores?: unknown; filtros: unknown[][] };

function fakeAdmin(
  respostas: Record<string, { data?: unknown; error?: { message: string } | null }>
) {
  const chamadas: Chamada[] = [];
  return {
    chamadas,
    from(tabela: string) {
      const reg: Chamada = { tabela, filtros: [] };
      chamadas.push(reg);
      // deno-lint-ignore no-explicit-any
      const q: any = {
        update(v: unknown) {
          reg.valores = v;
          return q;
        },
        eq(c: string, v: unknown) {
          reg.filtros.push(["eq", c, v]);
          return q;
        },
        is(c: string, v: unknown) {
          reg.filtros.push(["is", c, v]);
          return q;
        },
        in(c: string, v: unknown) {
          reg.filtros.push(["in", c, v]);
          return q;
        },
        select() {
          return q;
        },
        then(ok: (x: unknown) => unknown, falha?: (e: unknown) => unknown) {
          const r = respostas[tabela] ?? {};
          return Promise.resolve({ data: r.data ?? null, error: r.error ?? null }).then(ok, falha);
        },
      };
      return q;
    },
  };
}

test("revogarConectorDoUsuario: revoga as autorizações abertas e as chaves delas", async () => {
  const admin = fakeAdmin({ conector_autorizacao: { data: [{ id: "a1" }, { id: "a2" }] } });
  const n = await revogarConectorDoUsuario(admin, "u1", "senha_alterada");
  assert.equal(n, 2);
  const [aut, chave] = admin.chamadas;
  assert.equal(aut.tabela, "conector_autorizacao");
  assert.deepEqual(aut.filtros, [
    ["eq", "usuario_custom_id", "u1"],
    ["is", "revogado_em", null],
  ]);
  assert.equal((aut.valores as { revogado_motivo: string }).revogado_motivo, "senha_alterada");
  assert.equal(chave.tabela, "conector_chave");
  assert.deepEqual(chave.filtros, [
    ["in", "autorizacao_id", ["a1", "a2"]],
    ["is", "revogada_em", null],
  ]);
});

test("revogarConectorDoUsuario: sem autorização aberta não mexe nas chaves", async () => {
  const admin = fakeAdmin({ conector_autorizacao: { data: [] } });
  assert.equal(await revogarConectorDoUsuario(admin, "u1", "x"), 0);
  assert.equal(admin.chamadas.length, 1);
});

test("revogarConectorDoUsuario: erro do banco propaga", async () => {
  const admin = fakeAdmin({ conector_autorizacao: { error: { message: "falhou" } } });
  await assert.rejects(() => revogarConectorDoUsuario(admin, "u1", "x"), /falhou/);
});

test("revogarAutorizacao: marca a autorização e todas as chaves dela", async () => {
  const admin = fakeAdmin({});
  await revogarAutorizacao(admin, "a9", "usuario");
  assert.deepEqual(
    admin.chamadas.map((c) => [c.tabela, c.filtros]),
    [
      [
        "conector_autorizacao",
        [
          ["eq", "id", "a9"],
          ["is", "revogado_em", null],
        ],
      ],
      [
        "conector_chave",
        [
          ["eq", "autorizacao_id", "a9"],
          ["is", "revogada_em", null],
        ],
      ],
    ]
  );
});
