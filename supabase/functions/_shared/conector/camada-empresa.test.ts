// node --test supabase/functions/_shared/conector/camada-empresa.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  camadaDaEmpresa,
  dadosOuErro,
  ErroCamada,
  RPCS_DA_EMPRESA,
  storageDaEmpresa,
  TABELAS_DA_EMPRESA,
  TABELAS_SEM_EXCLUSAO_LOGICA,
  type StorageConector,
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
    "empresa",
    "empresaId",
    "inserir",
    "ler",
    "lerTodos",
    "porId",
    "rpc",
  ]);
  const fonte = readFileSync(new URL("./camada-empresa.ts", import.meta.url), "utf8");
  assert.equal(/\.delete\(/.test(fonte), false);
  // a única remoção de objeto do arquivo é a que storageDaEmpresa repassa depois de conferir a pasta da
  // empresa (antes do embrulho, "nenhum .remove(" era a garantia; agora é "exatamente um, dentro dele")
  const remocoes = [...fonte.matchAll(/\.remove\(/g)].map((m) => m.index ?? -1);
  assert.equal(remocoes.length, 1);
  assert.ok(remocoes[0] > fonte.indexOf("export function storageDaEmpresa"));
  assert.equal(TABELAS_DA_EMPRESA.length, 14);
});

test("empresa(): lê só a linha da própria empresa da chave", async () => {
  const fake = criarFakeAdmin((c) =>
    c.tabela === "empresa"
      ? { data: { id: E, nome: "Empresa Teste", cnpj: "11222333000181", segredo: "x" } }
      : undefined
  );
  const db = camadaDaEmpresa(fake.admin, E);
  assert.deepEqual(await db.empresa("id, nome"), { id: E, nome: "Empresa Teste" });
  const c = fake.chamadas[0];
  assert.equal(c.tabela, "empresa");
  assert.equal(c.terminal, "maybeSingle");
  assert.deepEqual(
    c.filtros.map((f) => [f.metodo, f.args[0], f.args[1]]),
    [
      ["eq", "id", E],
      ["is", "deleted_at", null],
    ]
  );
});

test("empresa(): a empresa sumiu → null; erro do banco → ErroCamada('banco'); só leitura", async () => {
  const sumiu = criarFakeAdmin();
  assert.equal(await camadaDaEmpresa(sumiu.admin, E).empresa("id"), null);
  assert.equal(sumiu.chamadas.length, 1);
  assert.equal(sumiu.chamadas[0].op, "select");

  const falha = criarFakeAdmin(() => ({ error: { message: "timeout no pooler" } }));
  await assert.rejects(() => camadaDaEmpresa(falha.admin, E).empresa("id"), erroCom("banco"));

  // a tabela empresa não entrou na lista: continua sem ler, inserir nem atualizar pelos métodos genéricos
  const db = camadaDaEmpresa(criarFakeAdmin().admin, E);
  // deno-lint-ignore no-explicit-any
  const t = "empresa" as any;
  assert.throws(() => db.ler(t, "id"), /Tabela fora da camada/);
  assert.equal(TABELAS_DA_EMPRESA.includes(t), false);
});

test("lista fechada: modelo_declaracao e conector_gravar_arquivo entram; o resto continua fora", async () => {
  const fake = criarFakeAdmin(() => undefined);
  const db = camadaDaEmpresa(fake.admin, E);
  await db.lerTodos("modelo_declaracao", "chave");
  await db.rpc("conector_gravar_arquivo", { p_oportunidade_id: E });
  assert.equal(fake.chamadas.at(-1)?.tabela, "conector_gravar_arquivo");
  assert.deepEqual((fake.chamadas.at(-1)?.payload as Record<string, unknown>).p_empresa_id, E);
  // deno-lint-ignore no-explicit-any
  assert.throws(() => db.ler("empresa" as any, "id"), /Tabela fora da camada/);
  assert.ok(TABELAS_DA_EMPRESA.includes("modelo_declaracao"));
  assert.ok(RPCS_DA_EMPRESA.includes("conector_gravar_arquivo"));
});

test("conector_gravar_arquivo: o p_empresa_id é o da chave; o do chamador nunca chega ao banco", async () => {
  const fake = criarFakeAdmin((c) => (c.op === "rpc" ? { data: { ok: true } } : undefined));
  const db = camadaDaEmpresa(fake.admin, E);
  const params = { p_oportunidade_id: OP, p_origem: "gerado:proposta:pdf" };
  assert.deepEqual(await db.rpc("conector_gravar_arquivo", params), { ok: true });
  assert.deepEqual(fake.chamadas[0].payload, { ...params, p_empresa_id: E });
  // o chamador tenta passar a empresa de outro (maiúscula ou não): recusado antes do banco
  for (const alheia of [OUTRA, OUTRA.toUpperCase(), E.toUpperCase(), null]) {
    await assert.rejects(
      () => db.rpc("conector_gravar_arquivo", { ...params, p_empresa_id: alheia }),
      erroCom("campo_proibido")
    );
  }
  assert.equal(fake.chamadas.length, 1);
});

test("modelo_declaracao: leitura e escrita presas à empresa da chave", async () => {
  const fake = criarFakeAdmin((c) => (c.op === "insert" ? { data: [{ id: "m1" }] } : undefined));
  const db = camadaDaEmpresa(fake.admin, E);
  await db.lerTodos("modelo_declaracao", "chave, titulo");
  assert.deepEqual(
    fake.chamadas[0].filtros.slice(0, 2).map((f) => [f.metodo, f.args[0], f.args[1]]),
    [
      ["eq", "empresa_id", E],
      ["is", "deleted_at", null],
    ]
  );
  await db.inserir("modelo_declaracao", [{ chave: "minha", titulo: "T", texto: "x" }]);
  assert.equal((fake.chamadas[1].payload as { empresa_id: string }[])[0].empresa_id, E);
  await assert.rejects(
    () => db.inserir("modelo_declaracao", [{ chave: "minha", empresa_id: OUTRA }]),
    erroCom("campo_proibido")
  );
});

// ─── storageDaEmpresa: o Storage confinado à pasta da empresa, por construção ─────────────

const PASTA = `${E}/2026/10`;
const BOM = `${PASTA}/u1-CND.pdf`;
// UUID com letras: em maiúsculas ele muda de verdade (o E dos outros testes só tem dígitos)
const EA = "0000000a-0000-4000-8000-00000000000b";
const OPCOES_UPLOAD = { contentType: "application/pdf", upsert: false };
const proibido = (e: unknown) => e instanceof ErroCamada && e.codigo === "campo_proibido";

type Balde = ReturnType<StorageConector["from"]>;
/** Os métodos que recebem um CAMINHO de objeto (o `list` recebe uma pasta e tem a tabela dele). */
const COM_CAMINHO: [string, (s: Balde, caminho: string) => Promise<unknown>][] = [
  ["createSignedUploadUrl", (s, c) => s.createSignedUploadUrl(c)],
  ["createSignedUrl", (s, c) => s.createSignedUrl(c, 60)],
  ["download", (s, c) => s.download(c)],
  ["upload", (s, c) => s.upload(c, new Uint8Array([1]), OPCOES_UPLOAD)],
  ["remove", (s, c) => s.remove([c])],
];

const CAMINHOS_RUINS: [string, unknown][] = [
  ["outra empresa", `${OUTRA}/2026/10/a.pdf`],
  ["outra empresa só com a pasta", `${OUTRA}/a.pdf`],
  ["sem a pasta da empresa", "2026/10/a.pdf"],
  ["empresa com um caractere a mais", `${E}0/a.pdf`],
  ["empresa depois de outro segmento", `outro/${E}/a.pdf`],
  ["barra inicial", `/${E}/a.pdf`],
  ["barra final", `${E}/2026/`],
  ["segmento vazio", `${E}//a.pdf`],
  ["segmento .", `${E}/./a.pdf`],
  ["segmento ..", `${E}/../${OUTRA}/a.pdf`],
  ["termina em ..", `${E}/a/..`],
  ["%2e", `${E}/%2e%2e/${OUTRA}/a.pdf`],
  ["% dentro do nome", `${E}/a%2e.pdf`],
  ["barra invertida", `${E}\\..\\${OUTRA}\\a.pdf`],
  ["barra invertida no nome", `${E}/a\\b.pdf`],
  ["?", `${E}/a.pdf?x=1`],
  ["#", `${E}/a#b.pdf`],
  ["só a empresa", E],
  ["a empresa e a barra", `${E}/`],
  ["vazio", ""],
  ["null", null],
  ["undefined", undefined],
  ["número", 42],
  ["objeto", { toString: () => BOM }],
];

test("storageDaEmpresa: caminho da empresa chega ao Storage original com os mesmos argumentos", async () => {
  for (const bucket of ["anexos-oportunidade", "habilitacao", "certificados", "qualquer-outro"]) {
    const fake = criarFakeAdmin();
    fake.objetos.set(`${bucket}/${BOM}`, new Uint8Array([1, 2, 3]));
    const s = storageDaEmpresa(fake.storage, E).from(bucket);
    const corpo = new Uint8Array([9, 8]);
    const novo = `${PASTA}/novo.pdf`;

    const assinadaUp = await s.createSignedUploadUrl(BOM);
    const assinada = await s.createSignedUrl(BOM, 60);
    await s.list(PASTA, { search: "u1-CND.pdf", limit: 1 });
    const baixado = await s.download(BOM);
    const enviado = await s.upload(novo, corpo, OPCOES_UPLOAD);
    const removido = await s.remove([BOM, novo]);

    assert.deepEqual(fake.chamadasStorage, [
      { bucket, metodo: "createSignedUploadUrl", args: [BOM] },
      { bucket, metodo: "createSignedUrl", args: [BOM, 60] },
      { bucket, metodo: "list", args: [PASTA, { search: "u1-CND.pdf", limit: 1 }] },
      { bucket, metodo: "download", args: [BOM] },
      { bucket, metodo: "upload", args: [novo, corpo, OPCOES_UPLOAD] },
      { bucket, metodo: "remove", args: [[BOM, novo]] },
    ]);
    // devolve o que o original devolveu
    assert.equal(assinadaUp.data?.path, BOM);
    assert.match(assinada.data?.signedUrl ?? "", new RegExp(`/${bucket}/`));
    assert.equal(baixado.data?.size, 3);
    assert.deepEqual(enviado, { data: { path: novo }, error: null });
    assert.equal(removido.error, null);
    assert.equal(fake.objetos.size, 0);
  }
});

test("storageDaEmpresa: caminho fora da pasta da empresa lança campo_proibido e o original NÃO é chamado", async () => {
  const fake = criarFakeAdmin();
  const s = storageDaEmpresa(fake.storage, E).from("certificados");
  for (const [metodo, chamar] of COM_CAMINHO) {
    for (const [rotulo, caminho] of CAMINHOS_RUINS) {
      await assert.rejects(
        () => chamar(s, caminho as string),
        (e: unknown) => {
          assert.ok(proibido(e), `${metodo} / ${rotulo}`);
          return true;
        },
        `${metodo} / ${rotulo}`
      );
    }
  }
  assert.deepEqual(fake.chamadasStorage, []);
});

test("storageDaEmpresa: a mensagem do erro traz o bucket e nunca o caminho nem a empresa alheia", async () => {
  const fake = criarFakeAdmin();
  const s = storageDaEmpresa(fake.storage, E).from("certificados");
  const alheio = `${OUTRA}/2026/10/segredo-balanco.pdf`;
  const chamadas: [string, () => Promise<unknown>][] = [
    ...COM_CAMINHO.map(([m, chamar]): [string, () => Promise<unknown>] => [
      m,
      () => chamar(s, alheio),
    ]),
    ["list", () => s.list(`${OUTRA}/2026/10`, { search: "x", limit: 1 })],
  ];
  for (const [metodo, chamar] of chamadas) {
    await assert.rejects(chamar, (e: unknown) => {
      assert.ok(proibido(e), metodo);
      const msg = (e as Error).message;
      assert.match(msg, /certificados/, metodo);
      for (const trecho of [OUTRA, "segredo", "balanco", ".pdf", "2026"]) {
        assert.equal(msg.includes(trecho), false, `${metodo}: "${trecho}" na mensagem`);
      }
      return true;
    });
  }
});

test("storageDaEmpresa: a recusa é promessa rejeitada (nunca exceção síncrona)", async () => {
  const fake = criarFakeAdmin();
  const s = storageDaEmpresa(fake.storage, E).from("b");
  const ruim = `${OUTRA}/a.pdf`;
  const chamadas: (() => Promise<unknown>)[] = [
    ...COM_CAMINHO.map(
      ([, chamar]) =>
        () =>
          chamar(s, ruim)
    ),
    () => s.list(OUTRA, { search: "", limit: 1 }),
  ];
  for (const chamar of chamadas) {
    let p: Promise<unknown> | undefined;
    assert.doesNotThrow(() => {
      p = chamar();
    });
    await assert.rejects(p as Promise<unknown>, proibido);
  }
});

test("storageDaEmpresa: list aceita a pasta da empresa (só ela ou uma subpasta) e recusa o resto", async () => {
  const fake = criarFakeAdmin();
  const s = storageDaEmpresa(fake.storage, E).from("anexos-oportunidade");
  const opcoes = { search: "u1", limit: 1 };
  for (const pasta of [E, `${E}/2026`, `${E}/2026/10`, `${E}/a`]) {
    await s.list(pasta, opcoes);
  }
  assert.deepEqual(
    fake.chamadasStorage.map((c) => c.args[0]),
    [E, `${E}/2026`, `${E}/2026/10`, `${E}/a`]
  );

  const antes = fake.chamadasStorage.length;
  const ruins: unknown[] = [
    "",
    OUTRA,
    `${OUTRA}/2026`,
    `${E}0`,
    `${E}/`,
    `${E}//x`,
    `${E}/.`,
    `${E}/..`,
    `${E}/../${OUTRA}`,
    `${E}/%2e`,
    `${E}\\x`,
    `${E}?x=1`,
    `${E}#x`,
    `/${E}`,
    `x/${E}`,
    null,
    undefined,
    7,
  ];
  for (const pasta of ruins) {
    await assert.rejects(() => s.list(pasta as string, opcoes), proibido, String(pasta));
  }
  assert.equal(fake.chamadasStorage.length, antes);
});

test("storageDaEmpresa: remove com um item bom e um ruim lança sem remover nenhum; lista vazia e não-lista", async () => {
  const fake = criarFakeAdmin();
  const alheio = `${OUTRA}/2026/10/x.pdf`;
  fake.objetos.set(`b/${BOM}`, new Uint8Array([1]));
  fake.objetos.set(`b/${alheio}`, new Uint8Array([2]));
  const s = storageDaEmpresa(fake.storage, E).from("b");

  await assert.rejects(() => s.remove([BOM, alheio]), proibido);
  await assert.rejects(() => s.remove([alheio, BOM]), proibido);
  await assert.rejects(() => s.remove([BOM, BOM, `${E}/../${OUTRA}/x.pdf`]), proibido);
  assert.deepEqual(fake.chamadasStorage, []);
  assert.equal(fake.objetos.size, 2);

  // o que não é lista de caminhos não vai ao Storage
  await assert.rejects(() => s.remove(BOM as unknown as string[]), proibido);
  await assert.rejects(() => s.remove(null as unknown as string[]), proibido);
  await assert.rejects(() => s.remove([BOM, 5 as unknown as string]), proibido);
  assert.deepEqual(fake.chamadasStorage, []);

  // lista vazia: não há caminho a conferir nem objeto a apagar
  await s.remove([]);
  assert.deepEqual(fake.chamadasStorage, [{ bucket: "b", metodo: "remove", args: [[]] }]);
  assert.equal(fake.objetos.size, 2);

  // só com caminhos da empresa: apaga
  await s.remove([BOM]);
  assert.equal(fake.objetos.has(`b/${BOM}`), false);
  assert.equal(fake.objetos.has(`b/${alheio}`), true);
});

test("storageDaEmpresa: a empresa é comparada sem diferenciar maiúsculas, nos dois sentidos", async () => {
  assert.notEqual(EA, EA.toUpperCase()); // o UUID tem letras: o teste vale
  for (const [daChave, noCaminho] of [
    [EA, EA.toUpperCase()],
    [EA.toUpperCase(), EA],
    [EA, EA],
  ]) {
    const fake = criarFakeAdmin();
    const s = storageDaEmpresa(fake.storage, daChave).from("b");
    const caminho = `${noCaminho}/2026/10/a.pdf`;
    for (const [metodo, chamar] of COM_CAMINHO) {
      await chamar(s, caminho);
      assert.equal(fake.chamadasStorage.at(-1)?.metodo, metodo);
    }
    await s.list(noCaminho, { search: "", limit: 1 });
    assert.equal(fake.chamadasStorage.length, COM_CAMINHO.length + 1);
    // a empresa do outro lado continua barrada
    await assert.rejects(() => s.download(`${OUTRA}/a.pdf`), proibido);
  }
});

test("storageDaEmpresa: empresa da chave que não é UUID lança id_invalido", () => {
  const { storage } = criarFakeAdmin();
  assert.throws(() => storageDaEmpresa(storage, "e1"), erroCom("id_invalido"));
  assert.throws(() => storageDaEmpresa(storage, ""), erroCom("id_invalido"));
  assert.throws(
    () => storageDaEmpresa(storage, undefined as unknown as string),
    erroCom("id_invalido")
  );
});

test("storageDaEmpresa: expõe só os métodos do StorageConector e chama o original como método", async () => {
  // os mesmos métodos do Storage de hoje, e nenhum a mais: o que o supabase-js tem além disso
  // (copy, move, getPublicUrl…) não passa pelo embrulho
  const fake = criarFakeAdmin();
  assert.deepEqual(
    Object.keys(storageDaEmpresa(fake.storage, E).from("b")).sort(),
    Object.keys(fake.storage.from("b")).sort()
  );
  assert.deepEqual(Object.keys(storageDaEmpresa(fake.storage, E)), ["from"]);

  // um Storage no estilo do supabase-js: classe com `this` e métodos além dos declarados
  class BaldeReal {
    chamadas: string[] = [];
    async download(caminho: string) {
      this.chamadas.push(`download ${caminho}`);
      return { data: new Blob(["x"]), error: null };
    }
    async copy() {
      return { data: null, error: null };
    }
    getPublicUrl() {
      return { data: { publicUrl: "https://publica.test/x" } };
    }
    createSignedUploadUrl() {}
    createSignedUrl() {}
    list() {}
    remove() {}
    upload() {}
  }
  const balde = new BaldeReal();
  const real = { from: () => balde } as unknown as StorageConector;
  const s = storageDaEmpresa(real, E).from("b");
  assert.equal("copy" in s, false);
  assert.equal("getPublicUrl" in s, false);
  const r = await s.download(BOM);
  assert.equal(r.data?.size, 1);
  assert.deepEqual(balde.chamadas, [`download ${BOM}`]);
});

test("mcp/index.ts entrega às ferramentas o Storage já confinado (e nenhum outro)", () => {
  // o index.ts usa Deno.* e não roda no Node: a ligação é conferida no fonte
  const fonte = readFileSync(new URL("../../mcp/index.ts", import.meta.url), "utf8");
  assert.match(fonte, /storage:\s*storageDaEmpresa\(admin\.storage,\s*ctx\.empresa\.id\)/);
  assert.equal((fonte.match(/admin\.storage/g) ?? []).length, 1);
  assert.match(
    fonte,
    /import \{[^}]*storageDaEmpresa[^}]*\} from "\.\.\/_shared\/conector\/camada-empresa\.ts"/
  );
});
