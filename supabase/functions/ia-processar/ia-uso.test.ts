// Roda com Node 23.6+ (type stripping):  node --test supabase/functions/ia-processar/ia-uso.test.ts
// ou com Deno:                           deno test supabase/functions/ia-processar/ia-uso.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COTA_EDITAL_PADRAO,
  contabilizar,
  ehAcaoEdital,
  inicioDoDiaBR,
  lerCota,
  novoMedidor,
  registrarUso,
  verificarCotaEdital,
} from "./ia-uso.ts";

/** cliente falso: registra filtros/inserts e devolve o que o teste mandar */
function clienteFalso(opts: {
  cota?: string | null;
  usadas?: number;
  erroContagem?: string;
  erroInsert?: string;
  lanca?: boolean;
}) {
  const chamadas: { tabela: string; ops: [string, unknown[]][] }[] = [];
  const inserts: unknown[] = [];
  const from = (tabela: string) => {
    if (opts.lanca) throw new Error("rede caiu");
    const reg = { tabela, ops: [] as [string, unknown[]][] };
    chamadas.push(reg);
    // deno-lint-ignore no-explicit-any
    const q: any = {};
    for (const op of ["select", "eq", "is", "in", "gte"]) {
      q[op] = (...a: unknown[]) => {
        reg.ops.push([op, a]);
        return q;
      };
    }
    q.maybeSingle = () =>
      Promise.resolve({ data: opts.cota === undefined ? null : { valor: opts.cota }, error: null });
    q.insert = (row: unknown) => {
      inserts.push(row);
      return Promise.resolve({ error: opts.erroInsert ? { message: opts.erroInsert } : null });
    };
    // contagem (head: true) é "thenable"
    q.then = (ok: (v: unknown) => unknown) =>
      Promise.resolve(
        opts.erroContagem
          ? { count: null, error: { message: opts.erroContagem } }
          : { count: opts.usadas ?? 0, error: null }
      ).then(ok);
    return q;
  };
  return { cliente: { from }, chamadas, inserts };
}

const usuario = { email: "a@b.com", is_super_admin: false, empresa_id: "emp-1" };

test("ehAcaoEdital só para as 3 ações de edital", () => {
  assert.equal(ehAcaoEdital("edital_atende"), true);
  assert.equal(ehAcaoEdital("edital_xyz"), false);
  assert.equal(ehAcaoEdital("llm"), false);
});

test("contabilizar soma tokens/modelos e ignora 'sem chave'", () => {
  const m = novoMedidor();
  contabilizar(m, {
    ok: true,
    modelo: "gpt-4o-mini",
    usage: { input_tokens: 100, output_tokens: 10 },
  });
  contabilizar(m, { ok: false, motivo: "timeout", modelo: "gpt-4o" });
  contabilizar(m, { ok: true, modelo: "gpt-4o", usage: { input_tokens: 50, output_tokens: 5 } });
  contabilizar(m, { ok: false, motivo: "config" });
  assert.deepEqual(m, {
    chamadas: 3,
    tokens_entrada: 150,
    tokens_saida: 15,
    modelos: ["gpt-4o-mini", "gpt-4o"],
  });
  contabilizar(undefined, { ok: true }); // sem medidor: não quebra
});

test("inicioDoDiaBR usa o dia de Brasília", () => {
  // 02:00 UTC de 25/09 = 23:00 de 24/09 em Brasília
  assert.equal(inicioDoDiaBR(new Date("2026-09-25T02:00:00Z")), "2026-09-24T00:00:00-03:00");
  assert.equal(inicioDoDiaBR(new Date("2026-09-25T03:00:00Z")), "2026-09-25T00:00:00-03:00");
});

test("lerCota: inteiro ≥ 1, senão o padrão", () => {
  assert.equal(lerCota("50"), 50);
  assert.equal(lerCota(" 1000 "), 1000);
  assert.equal(lerCota("0"), COTA_EDITAL_PADRAO);
  assert.equal(lerCota("abc"), COTA_EDITAL_PADRAO);
  assert.equal(lerCota(null), COTA_EDITAL_PADRAO);
  assert.equal(lerCota("2.5"), COTA_EDITAL_PADRAO);
});

test("cota: abaixo libera, chegou recusa, super admin isento, erro libera", async () => {
  const agora = new Date("2026-09-24T15:00:00Z");
  let f = clienteFalso({ usadas: 399 });
  assert.equal(await verificarCotaEdital(f.cliente, usuario, agora), null);
  // filtro por empresa, só ações edital_* e só de hoje
  const cont = f.chamadas.find((c) => c.tabela === "ia_uso")!;
  assert.deepEqual(
    cont.ops.find(([o]) => o === "eq"),
    ["eq", ["empresa_id", "emp-1"]]
  );
  assert.deepEqual(
    cont.ops.find(([o]) => o === "gte"),
    ["gte", ["criado_em", "2026-09-24T00:00:00-03:00"]]
  );

  f = clienteFalso({ usadas: 400 });
  assert.deepEqual(await verificarCotaEdital(f.cliente, usuario, agora), {
    cota: 400,
    usadas: 400,
  });
  f = clienteFalso({ usadas: 10, cota: "10" });
  assert.deepEqual(await verificarCotaEdital(f.cliente, usuario, agora), { cota: 10, usadas: 10 });
  f = clienteFalso({ usadas: 10_000 });
  assert.equal(
    await verificarCotaEdital(f.cliente, { ...usuario, is_super_admin: true }, agora),
    null
  );
  assert.equal(f.chamadas.length, 0);
  f = clienteFalso({ erroContagem: 'relation "public.ia_uso" does not exist' });
  assert.equal(await verificarCotaEdital(f.cliente, usuario, agora), null);
  f = clienteFalso({ lanca: true });
  assert.equal(await verificarCotaEdital(f.cliente, usuario, agora), null);
  // sem empresa: conta as do próprio usuário
  f = clienteFalso({ usadas: 0 });
  await verificarCotaEdital(f.cliente, { ...usuario, empresa_id: null }, agora);
  const semEmp = f.chamadas.find((c) => c.tabela === "ia_uso")!;
  assert.deepEqual(
    semEmp.ops.find(([o]) => o === "is"),
    ["is", ["empresa_id", null]]
  );
  assert.deepEqual(
    semEmp.ops.find(([o]) => o === "eq"),
    ["eq", ["usuario_email", "a@b.com"]]
  );
});

test("registrarUso: grava a soma; sem chamada não grava; erro não propaga", async () => {
  const m = novoMedidor();
  let f = clienteFalso({});
  await registrarUso(f.cliente, usuario, "edital_atende", m);
  assert.equal(f.inserts.length, 0);

  contabilizar(m, { ok: true, modelo: "gpt-4o", usage: { input_tokens: 7, output_tokens: 3 } });
  await registrarUso(f.cliente, usuario, "edital_atende", m);
  assert.deepEqual(f.inserts, [
    {
      empresa_id: "emp-1",
      usuario_email: "a@b.com",
      acao: "edital_atende",
      modelo: "gpt-4o",
      tokens_entrada: 7,
      tokens_saida: 3,
    },
  ]);
  f = clienteFalso({ erroInsert: "permission denied" });
  await registrarUso(f.cliente, usuario, "edital_atende", m); // só loga
  f = clienteFalso({ lanca: true });
  await registrarUso(f.cliente, usuario, "edital_atende", m); // só loga
});
