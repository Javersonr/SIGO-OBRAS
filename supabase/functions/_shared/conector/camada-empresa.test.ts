// node --test supabase/functions/_shared/conector/camada-empresa.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  camadaDaEmpresa,
  dadosOuErro,
  ErroCamada,
  RPCS_DA_EMPRESA,
  TABELAS_DA_EMPRESA,
  TABELAS_SEM_EXCLUSAO_LOGICA,
} from "./camada-empresa.ts";
import { criarFakeAdmin } from "./testes/fake-admin.ts";

const E = "00000000-0000-4000-8000-000000000001";
const OUTRA = "00000000-0000-4000-8000-000000000002";
const OP = "00000000-0000-4000-8000-000000000010";

const filtros = (c: { filtros: { metodo: string; args: unknown[] }[] }) =>
  c.filtros.map((f) => [f.metodo, ...f.args]);

const erroCom = (codigo: string) => (e: unknown) => e instanceof ErroCamada && e.codigo === codigo;

test("camadaDaEmpresa: empresa que não é UUID lança id_invalido", () => {
  const { admin } = criarFakeAdmin();
  assert.throws(() => camadaDaEmpresa(admin, "e1"), erroCom("id_invalido"));
  assert.throws(() => camadaDaEmpresa(admin, ""), erroCom("id_invalido"));
});

test("ler: filtra pela empresa e por deleted_at; incluirExcluidos e mcp_link_envio não põem o is", async () => {
  const { admin, chamadas } = criarFakeAdmin();
  const db = camadaDaEmpresa(admin, E);
  await db.ler("oportunidade", "id, nome").eq("id", OP);
  await db.ler("oportunidade", "id", { incluirExcluidos: true });
  await db.ler("mcp_link_envio", "id");
  assert.deepEqual(filtros(chamadas[0]), [
    ["eq", "empresa_id", E],
    ["is", "deleted_at", null],
    ["eq", "id", OP],
  ]);
  assert.equal(chamadas[0].colunas, "id, nome");
  assert.deepEqual(filtros(chamadas[1]), [["eq", "empresa_id", E]]);
  assert.deepEqual(filtros(chamadas[2]), [["eq", "empresa_id", E]]);
  assert.ok(TABELAS_SEM_EXCLUSAO_LOGICA.has("mcp_link_envio"));
});

test("tabela fora da lista lança tabela_nao_permitida em todos os métodos", async () => {
  const { admin, chamadas } = criarFakeAdmin();
  const db = camadaDaEmpresa(admin, E);
  // deno-lint-ignore no-explicit-any
  const t = "usuario_custom" as any;
  assert.throws(() => db.ler(t, "id"), erroCom("tabela_nao_permitida"));
  await assert.rejects(() => db.porId(t, OP, "id"), erroCom("tabela_nao_permitida"));
  await assert.rejects(() => db.inserir(t, [{ a: 1 }]), erroCom("tabela_nao_permitida"));
  await assert.rejects(() => db.atualizar(t, OP, { a: 1 }), erroCom("tabela_nao_permitida"));
  await assert.rejects(() => db.lerTodos(t, "id"), erroCom("tabela_nao_permitida"));
  assert.equal(chamadas.length, 0);
});

test("porId: id que não é UUID devolve null sem ir ao banco; com UUID filtra por empresa e id", async () => {
  const { admin, chamadas } = criarFakeAdmin((c) =>
    c.tabela === "oportunidade" ? { data: { id: OP, nome: "Op" } } : undefined
  );
  const db = camadaDaEmpresa(admin, E);
  assert.equal(await db.porId("oportunidade", "nao-e-uuid", "id"), null);
  assert.equal(chamadas.length, 0);
  assert.deepEqual(await db.porId("oportunidade", OP.toUpperCase(), "id, nome"), {
    id: OP,
    nome: "Op",
  });
  assert.equal(chamadas[0].terminal, "maybeSingle");
  assert.deepEqual(filtros(chamadas[0]), [
    ["eq", "empresa_id", E],
    ["is", "deleted_at", null],
    ["eq", "id", OP],
  ]);
});

test("inserir: grava o empresa_id da chave e aceita o igual; divergente, id, created_at e deleted_at lançam", async () => {
  const { admin, chamadas } = criarFakeAdmin((c) =>
    c.op === "insert" ? { data: [{ id: "x1" }, { id: "x2" }] } : undefined
  );
  const db = camadaDaEmpresa(admin, E);
  const r = await db.inserir("oportunidade_atualizacao", [
    { descricao: "a" },
    { descricao: "b", empresa_id: E.toUpperCase() },
  ]);
  assert.deepEqual(r, [{ id: "x1" }, { id: "x2" }]);
  assert.equal(chamadas[0].op, "insert");
  assert.equal(chamadas[0].colunas, "id");
  assert.deepEqual(chamadas[0].payload, [
    { descricao: "a", empresa_id: E },
    { descricao: "b", empresa_id: E },
  ]);
  for (const linha of [
    { empresa_id: OUTRA },
    { id: OP },
    { created_at: "2026-01-01" },
    { deleted_at: null },
  ]) {
    await assert.rejects(
      () => db.inserir("oportunidade_atualizacao", [linha]),
      erroCom("campo_proibido")
    );
  }
  assert.equal(chamadas.length, 1);
  assert.deepEqual(await db.inserir("oportunidade_atualizacao", []), []);
  assert.equal(chamadas.length, 1);
});

test("atualizar: filtra por id, empresa e deleted_at e aplica a condição; patch proibido lança", async () => {
  const { admin, chamadas } = criarFakeAdmin((c) =>
    c.op === "update" ? { data: { id: OP } } : undefined
  );
  const db = camadaDaEmpresa(admin, E);
  const agora = "2026-10-08T12:00:00.000Z";
  const r = await db.atualizar("oportunidade", OP, { nome: "N" }, "id", (q) =>
    q.is("usado_em", null).gt("expira_em", agora)
  );
  assert.deepEqual(r, { id: OP });
  assert.deepEqual(chamadas[0].payload, { nome: "N" });
  assert.deepEqual(filtros(chamadas[0]), [
    ["eq", "id", OP],
    ["eq", "empresa_id", E],
    ["is", "deleted_at", null],
    ["is", "usado_em", null],
    ["gt", "expira_em", agora],
  ]);
  for (const patch of [{ empresa_id: E }, { id: OP }, { created_at: "x" }, { deleted_at: "x" }]) {
    await assert.rejects(() => db.atualizar("oportunidade", OP, patch), erroCom("campo_proibido"));
  }
  assert.equal(await db.atualizar("oportunidade", "x", { nome: "N" }), null);
  assert.equal(chamadas.length, 1);
});

test("atualizar: nada casou devolve null; mcp_link_envio não põe deleted_at", async () => {
  const { admin, chamadas } = criarFakeAdmin();
  const db = camadaDaEmpresa(admin, E);
  assert.equal(await db.atualizar("mcp_link_envio", OP, { usado_em: "x" }), null);
  assert.deepEqual(filtros(chamadas[0]), [
    ["eq", "id", OP],
    ["eq", "empresa_id", E],
  ]);
});

test("rpc: injeta p_empresa_id; nome fora da lista e p_empresa_id nos params lançam", async () => {
  const { admin, chamadas } = criarFakeAdmin((c) => (c.op === "rpc" ? { data: 3 } : undefined));
  const db = camadaDaEmpresa(admin, E);
  assert.equal(
    await db.rpc("edital_analise_anexar_arquivos", { p_oportunidade_id: OP, p_arquivos: [] }),
    3
  );
  assert.equal(chamadas[0].tabela, "edital_analise_anexar_arquivos");
  assert.deepEqual(chamadas[0].payload, { p_oportunidade_id: OP, p_arquivos: [], p_empresa_id: E });
  // deno-lint-ignore no-explicit-any
  await assert.rejects(() => db.rpc("apagar_tudo" as any, {}), erroCom("rpc_nao_permitida"));
  await assert.rejects(
    () => db.rpc("conector_texto_disponivel", { p_empresa_id: OUTRA }),
    erroCom("campo_proibido")
  );
  assert.equal(chamadas.length, 1);
  assert.ok(RPCS_DA_EMPRESA.includes("conector_texto_disponivel"));
});

test("lerTodos: pagina de 1000 em 1000 até vir menos e lança acima do limite", async () => {
  const linhas = (n: number, base: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `id-${base + i}` }));
  const { admin, chamadas } = criarFakeAdmin((c) => {
    const range = c.filtros.find((f) => f.metodo === "range");
    const de = Number(range?.args[0]);
    return { data: de === 0 ? linhas(1000, 0) : linhas(250, 1000) };
  });
  const db = camadaDaEmpresa(admin, E);
  const todas = await db.lerTodos("acervo_quantitativo", "id", (q) => q.eq("atestado_id", OP));
  assert.equal(todas.length, 1250);
  assert.deepEqual(
    chamadas.map((c) => filtros(c).slice(-3)),
    [
      [
        ["eq", "atestado_id", OP],
        ["order", "id"],
        ["range", 0, 999],
      ],
      [
        ["eq", "atestado_id", OP],
        ["order", "id"],
        ["range", 1000, 1999],
      ],
    ]
  );
  await assert.rejects(
    () => db.lerTodos("acervo_quantitativo", "id", undefined, 1100),
    erroCom("banco")
  );
});

test("erro do supabase vira ErroCamada('banco') com a mensagem", async () => {
  const { admin } = criarFakeAdmin(() => ({ error: { message: "timeout no pooler" } }));
  const db = camadaDaEmpresa(admin, E);
  await assert.rejects(
    () => db.porId("oportunidade", OP, "id"),
    (e: unknown) => e instanceof ErroCamada && e.codigo === "banco" && /timeout/.test(e.message)
  );
  await assert.rejects(() => db.inserir("oportunidade_atualizacao", [{ a: 1 }]), erroCom("banco"));
  await assert.rejects(() => db.rpc("conector_texto_disponivel", {}), erroCom("banco"));
  assert.throws(() => dadosOuErro({ data: null, error: { message: "x" } }), erroCom("banco"));
  assert.equal(dadosOuErro({ data: 1, error: null }), 1);
});

test("sem exclusão: a camada não tem método de apagar e o código não chama delete", () => {
  const { admin } = criarFakeAdmin();
  const db = camadaDaEmpresa(admin, E);
  assert.deepEqual(Object.keys(db).sort(), [
    "atualizar",
    "empresaId",
    "inserir",
    "ler",
    "lerTodos",
    "porId",
    "rpc",
  ]);
  const fonte = readFileSync(new URL("./camada-empresa.ts", import.meta.url), "utf8");
  assert.equal(/\.delete\(|\.remove\(/.test(fonte), false);
  assert.equal(TABELAS_DA_EMPRESA.length, 12);
});
