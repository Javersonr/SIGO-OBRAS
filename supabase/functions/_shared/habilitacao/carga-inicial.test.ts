// node --test supabase/functions/_shared/habilitacao/carga-inicial.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { comandosDeEnvio, lerInventario, planejarCarga, sqlDaCarga } from "./carga-inicial.ts";

const E = "00000000-0000-4000-8000-000000000001";
const EU = "ABCDEF00-0000-4000-8000-00000000000A"; // maiúsculas: o plano tem de pôr em minúsculas
const CSV =
  "\uFEFFsubpasta;arquivo;tipo;emissao;validade;tamanho_kb\r\n" +
  ".;12- CR FGTS - 28-09-2026.pdf;crf_fgts;2026-09-28;;82\r\n" +
  "Balanço Patrimonial\\2025;Balanço 2025.PDF;balanco_dre;;;900\r\n" +
  ".;Certidão da Junta.pdf;certidao_junta;2026-10-01;;40\r\n" +
  ".;Planilha.xlsx;outro;;;10\r\n" +
  ".;Sem tipo.pdf;inventado;;;10\r\n" +
  ".;Foto doc.JPG;documento_representante;;2035-03-24;300\r\n";

test("lerInventario: BOM, CRLF, vazio → null", () => {
  const r = lerInventario(CSV);
  assert.deepEqual(r.erros, []);
  assert.equal(r.linhas.length, 6);
  assert.deepEqual(r.linhas[0], {
    subpasta: ".",
    arquivo: "12- CR FGTS - 28-09-2026.pdf",
    tipo: "crf_fgts",
    emissao: "2026-09-28",
    validade: null,
  });
  assert.deepEqual(lerInventario("a;b\n1;2").erros, [
    "Cabeçalho inesperado: use subpasta;arquivo;tipo;emissao;validade",
  ]);
});

test("planejarCarga: caminho na pasta da empresa, nome sem extensão, tipo e arquivo conferidos", () => {
  let n = 0;
  const { itens, ignorados } = planejarCarga(lerInventario(CSV).linhas, {
    empresaId: E,
    pastaBase: "D:/Docs/Habilitação",
    anoMes: "2026/10",
    novoUuid: () => `uuid${++n}`,
  });
  assert.deepEqual(ignorados, [
    { arquivo: "Planilha.xlsx", motivo: "extensão não aceita (use pdf, jpg ou png)" },
    { arquivo: "Sem tipo.pdf", motivo: "tipo fora da lista: inventado" },
  ]);
  assert.deepEqual(
    itens.map((i) => [i.nome, i.tipo, i.caminhoStorage, i.mime]),
    [
      [
        "12- CR FGTS - 28-09-2026",
        "crf_fgts",
        `${E}/2026/10/uuid1-12-_CR_FGTS_-_28-09-2026.pdf`,
        "application/pdf",
      ],
      ["Balanço 2025", "balanco_dre", `${E}/2026/10/uuid2-Balanco_2025.PDF`, "application/pdf"],
      [
        "Certidão da Junta",
        "certidao_junta",
        `${E}/2026/10/uuid3-Certidao_da_Junta.pdf`,
        "application/pdf",
      ],
      ["Foto doc", "documento_representante", `${E}/2026/10/uuid4-Foto_doc.JPG`, "image/jpeg"],
    ]
  );
  assert.equal(itens[0].ref, `habilitacao/${itens[0].caminhoStorage}`);
  assert.equal(itens[0].caminhoLocal, "D:/Docs/Habilitação/12- CR FGTS - 28-09-2026.pdf");
  assert.equal(
    itens[1].caminhoLocal,
    "D:/Docs/Habilitação/Balanço Patrimonial/2025/Balanço 2025.PDF"
  );
});

test("sqlDaCarga: bloco com guardas, aspas escapadas e sem repetir pela ref", () => {
  const { itens } = planejarCarga(
    [
      {
        subpasta: ".",
        arquivo: "Procuração d'Ávila.pdf",
        tipo: "procuracao",
        emissao: null,
        validade: "2026-12-31",
      },
    ],
    { empresaId: E, pastaBase: "D:/x", anoMes: "2026/10", novoUuid: () => "u1" }
  );
  const sql = sqlDaCarga(itens, E);
  assert.match(sql, /^begin;/);
  assert.match(sql, /commit;\s*$/);
  assert.ok(sql.includes("if not exists (select 1 from public.empresa where id = v_empresa"));
  assert.ok(sql.includes("'Procuração d''Ávila'"));
  assert.ok(
    sql.includes("where not exists (select 1 from public.acervo_documento d where d.arquivo_ref =")
  );
  assert.ok(sql.includes("select count(*) into v_sem_arquivo"));
  assert.ok(sql.includes("date '2026-12-31'"));
});

test("comandosDeEnvio: um comando por arquivo, com aspas", () => {
  const { itens } = planejarCarga(lerInventario(CSV).linhas, {
    empresaId: E,
    pastaBase: "D:/Docs",
    anoMes: "2026/10",
    novoUuid: () => "u",
  });
  const cmds = comandosDeEnvio(itens);
  assert.equal(cmds.length, 4);
  assert.equal(
    cmds[0],
    `npx supabase@2.118.0 storage cp "D:/Docs/12- CR FGTS - 28-09-2026.pdf" "ss:///habilitacao/${E}/2026/10/u-12-_CR_FGTS_-_28-09-2026.pdf" --experimental --linked --content-type application/pdf`
  );
});

// ---- Casos extras (além do brief): bordas que, em produção, derrubariam a carga inteira ----

test("lerInventario: número da linha no arquivo, campos faltando, datas reais e aspas", () => {
  const r = lerInventario(
    "subpasta;arquivo;tipo;emissao;validade\n" +
      "\n" +
      ".;so-dois-campos.pdf\n" +
      ".;sem tipo.pdf;;;\n" +
      ".;data ruim.pdf;crf_fgts;2026-02-30;\n" +
      ".;data ruim 2.pdf;crf_fgts;;28/09/2026\n" +
      '".";"Entre aspas.pdf";"cnd_federal";"2026-01-15";""\n' +
      ";Sem pasta.pdf;alvara;;\n"
  );
  assert.deepEqual(r.erros, [
    "Linha 3: faltam campos",
    "Linha 4: faltam campos",
    "Linha 5: data inválida",
    "Linha 6: data inválida",
  ]);
  assert.deepEqual(r.linhas, [
    {
      subpasta: ".",
      arquivo: "Entre aspas.pdf",
      tipo: "cnd_federal",
      emissao: "2026-01-15",
      validade: null,
    },
    { subpasta: ".", arquivo: "Sem pasta.pdf", tipo: "alvara", emissao: null, validade: null },
  ]);
  assert.deepEqual(lerInventario("").erros, [
    "Cabeçalho inesperado: use subpasta;arquivo;tipo;emissao;validade",
  ]);
  assert.equal(lerInventario("subpasta;arquivo;tipo;emissao;validade\n").linhas.length, 0);
});

test("planejarCarga: só gasta uuid com o que entra; nome limitado ao CHECK da tabela; casos recusados", () => {
  let n = 0;
  const longo = "a".repeat(250);
  const { itens, ignorados } = planejarCarga(
    [
      { subpasta: ".", arquivo: "ruim.xlsx", tipo: "outro", emissao: null, validade: null },
      { subpasta: ".", arquivo: `${longo}.pdf`, tipo: "outro", emissao: null, validade: null },
      { subpasta: ".", arquivo: " .pdf", tipo: "outro", emissao: null, validade: null },
      {
        subpasta: ".",
        arquivo: "Trocadas.pdf",
        tipo: "crf_fgts",
        emissao: "2026-10-01",
        validade: "2026-09-01",
      },
      { subpasta: "a\\..\\b", arquivo: "Fuga.pdf", tipo: "outro", emissao: null, validade: null },
      { subpasta: "", arquivo: "Sem pasta.PNG", tipo: "outro", emissao: null, validade: null },
      { subpasta: "x/", arquivo: "x.constructor", tipo: "outro", emissao: null, validade: null },
    ],
    {
      empresaId: EU,
      pastaBase: "D:\\Docs\\",
      anoMes: "2026/10",
      novoUuid: () => `u${++n}`,
    }
  );
  assert.deepEqual(ignorados, [
    { arquivo: "ruim.xlsx", motivo: "extensão não aceita (use pdf, jpg ou png)" },
    { arquivo: " .pdf", motivo: "nome do arquivo vazio" },
    { arquivo: "Trocadas.pdf", motivo: "validade anterior à emissão" },
    { arquivo: "Fuga.pdf", motivo: "subpasta fora da pasta base" },
    { arquivo: "x.constructor", motivo: "extensão não aceita (use pdf, jpg ou png)" },
  ]);
  assert.equal(n, 2);
  assert.equal(itens.length, 2);
  assert.equal(itens[0].nome.length, 200);
  // o CHECK de arquivo_ref compara com empresa_id::text (minúsculas)
  assert.ok(itens[0].caminhoStorage.startsWith(`${EU.toLowerCase()}/2026/10/u1-`));
  assert.ok(itens[0].ref.startsWith(`habilitacao/${EU.toLowerCase()}/`));
  assert.equal(itens[1].caminhoLocal, "D:/Docs/Sem pasta.PNG");
  assert.equal(itens[1].mime, "image/png");
});

test("sqlDaCarga: nulos de data tipados na 1ª linha, vírgulas certas e etiqueta sem colisão", () => {
  const { itens } = planejarCarga(
    [
      { subpasta: ".", arquivo: "A.pdf", tipo: "cartao_cnpj", emissao: null, validade: null },
      {
        subpasta: ".",
        arquivo: "B $carga$ x.pdf",
        tipo: "alvara",
        emissao: "2026-01-02",
        validade: "2027-01-02",
      },
      { subpasta: ".", arquivo: "C.png", tipo: "outro", emissao: "2026-03-04", validade: null },
    ],
    { empresaId: E, pastaBase: "D:/x", anoMes: "2026/10", novoUuid: () => "u" }
  );
  const sql = sqlDaCarga(itens, E);
  const valores = sql.split("\n").filter((l) => /^\s+\('/.test(l));
  assert.equal(valores.length, 3);
  assert.ok(valores[0].endsWith(", null::date, null::date),"));
  assert.ok(valores[1].includes("'B $carga$ x'"));
  assert.ok(valores[1].endsWith(", date '2026-01-02', date '2027-01-02'),"));
  assert.ok(valores[2].endsWith(", date '2026-03-04', null)"));
  assert.ok(sql.startsWith("begin;\ndo $carga_$\n"), "o nome tem $carga$: troca a etiqueta");
  assert.ok(sql.includes("\n$carga_$;\ncommit;"));
  assert.ok(sql.includes(`v_empresa uuid := '${E}';`));
  assert.throws(() => sqlDaCarga(itens, "x'; drop table t; --"), /empresa/i);
});

test("sqlDaCarga: lista vazia só avisa e não grava nada", () => {
  const sql = sqlDaCarga([], E);
  assert.match(sql, /^begin;/);
  assert.match(sql, /commit;\s*$/);
  assert.ok(sql.includes("raise notice"));
  assert.ok(!sql.includes("insert into"));
  assert.ok(!sql.includes("values"));
});

test("comandosDeEnvio: $, crase e aspas do caminho local não são interpretados pelo bash", () => {
  const { itens } = planejarCarga(
    [{ subpasta: "R$ 5", arquivo: "a`b$c.pdf", tipo: "outro", emissao: null, validade: null }],
    { empresaId: E, pastaBase: "D:/Docs", anoMes: "2026/10", novoUuid: () => "u" }
  );
  const [cmd] = comandosDeEnvio(itens);
  assert.ok(cmd.includes('"D:/Docs/R\\$ 5/a\\`b\\$c.pdf"'));
  assert.ok(cmd.includes(`"ss:///habilitacao/${E}/2026/10/u-a_b_c.pdf"`));
  assert.deepEqual(comandosDeEnvio([]), []);
});
