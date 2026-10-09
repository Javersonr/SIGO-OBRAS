// node --test supabase/functions/_shared/conector/envio.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { camadaDaEmpresa } from "./camada-empresa.ts";
import { criarFakeAdmin, type ChamadaFake } from "./testes/fake-admin.ts";
import { criarLinkEnvio, ErroEnvio, lerLinkPorId, lerObjeto, registrarEnvio } from "./envio.ts";
import type { ArquivoDoLink } from "./envio-regras.ts";

const E = "00000000-0000-4000-8000-000000000001";
const OP = "00000000-0000-4000-8000-000000000010";
const OP_B = "00000000-0000-4000-8000-000000000011"; // de outra empresa
const AT = "00000000-0000-4000-8000-000000000020";
const LINK = "00000000-0000-4000-8000-000000000030";
const AUT = "00000000-0000-4000-8000-0000000000a1";
const UC = "00000000-0000-4000-8000-0000000000b1";
const AGORA = new Date("2026-10-08T12:00:00Z");
const BUCKET = "anexos-oportunidade";

const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25];
const XLSX = [0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00, 0x08, 0x00];
const HTML = [...new TextEncoder().encode("<html><body>")];

const eqDe = (c: ChamadaFake, coluna: string) =>
  c.filtros.find((f) => f.metodo === "eq" && f.args[0] === coluna)?.args[1];
const erroCom = (codigo: string) => (e: unknown) => e instanceof ErroEnvio && e.codigo === codigo;

const arq = (indice: number, nome: string, extra: Partial<ArquivoDoLink> = {}): ArquivoDoLink => ({
  indice,
  nome,
  tipo: nome.endsWith(".xlsx") ? "xlsx" : "pdf",
  categoria: null,
  pasta: null,
  caminho: `${E}/2026/10/00000000-0000-4000-8000-00000000000${indice}-${nome}`,
  ...extra,
});

/**
 * Banco e Storage falsos: `link` é a linha de mcp_link_envio; `objetos` mapeia o caminho para os
 * bytes enviados (ausente = não enviado); `consumir` diz se o UPDATE atômico do link acha a linha.
 */
function ambiente(
  opcoes: {
    link?: Record<string, unknown> | null;
    objetos?: Record<string, number[]>;
    consumir?: boolean;
    atestadoExiste?: boolean;
    devolucaoFalha?: boolean; // o UPDATE que devolve o link a pendente (usado_em = null) dá erro
  } = {}
) {
  const objetos = opcoes.objetos ?? {};
  const { admin, chamadas, storage, chamadasStorage } = criarFakeAdmin(
    (c) => {
      if (c.tabela === "oportunidade" && c.op === "select") {
        return { data: eqDe(c, "id") === OP ? { id: OP } : null };
      }
      if (c.tabela === "acervo_atestado" && c.op === "select") {
        return { data: eqDe(c, "id") === AT ? { id: AT } : null };
      }
      if (c.tabela === "acervo_atestado" && c.op === "update") {
        return { data: opcoes.atestadoExiste === false ? null : { id: AT } };
      }
      if (c.tabela === "mcp_link_envio" && c.op === "select") {
        return { data: eqDe(c, "id") === LINK ? (opcoes.link ?? null) : null };
      }
      if (c.tabela === "mcp_link_envio" && c.op === "insert") return { data: [{ id: LINK }] };
      if (c.tabela === "mcp_link_envio" && c.op === "update") {
        if (opcoes.devolucaoFalha && (c.payload as Record<string, unknown>).usado_em === null) {
          return { error: { message: "banco fora do ar" } };
        }
        const consumo = (c.payload as Record<string, unknown>).usado_em !== undefined;
        return { data: consumo && opcoes.consumir === false ? null : { id: LINK } };
      }
      if (c.tabela === "arquivo_oportunidade" && c.op === "insert") {
        return {
          data: (c.payload as { url: string }[]).map((l, i) => ({
            id: `arq-${i + 1}`,
            url: l.url,
          })),
        };
      }
      return undefined;
    },
    (c) => {
      if (c.metodo !== "list") return undefined;
      const [pasta, { search }] = c.args as [string, { search: string }];
      const bytes = objetos[`${pasta}/${search}`];
      return { data: bytes ? [{ name: search, metadata: { size: bytes.length } }] : [] };
    }
  );
  const pedidosFetch: { url: string; range: string | null }[] = [];
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    pedidosFetch.push({ url: u, range: new Headers(init?.headers).get("range") });
    const caminho = decodeURIComponent(new URL(u).pathname.split(`/sign/${BUCKET}/`)[1] ?? "");
    const atestado = decodeURIComponent(new URL(u).pathname.split("/sign/certificados/")[1] ?? "");
    const bytes = objetos[caminho] ?? objetos[atestado];
    return new Response(new Uint8Array([...(bytes ?? []), ...new Array(1000).fill(0x41)]), {
      status: 206,
    });
  }) as typeof fetch;
  return {
    db: camadaDaEmpresa(admin, E),
    admin,
    chamadas,
    storage,
    chamadasStorage,
    fetchFn,
    pedidosFetch,
  };
}

const linkDaOportunidade = (arquivos: ArquivoDoLink[], extra: Record<string, unknown> = {}) => ({
  id: LINK,
  autorizacao_id: AUT,
  usuario_custom_id: UC,
  alvo: "oportunidade",
  oportunidade_id: OP,
  atestado_id: null,
  bucket: BUCKET,
  arquivos,
  registrados: [],
  expira_em: "2026-10-08T13:00:00Z",
  usado_em: null,
  usado_por: null,
  ...extra,
});

const registrar = (
  amb: ReturnType<typeof ambiente>,
  extra: Partial<Parameters<typeof registrarEnvio>[2]> = {}
) =>
  registrarEnvio(amb.db, amb.storage, {
    linkId: LINK,
    origem: "claude",
    autorizacaoId: AUT,
    usuarioCustomId: UC,
    usuarioNome: "Usuário Teste",
    aceitarParcial: false,
    agora: AGORA,
    fetchFn: amb.fetchFn,
    ...extra,
  });

test("criarLinkEnvio: alvo de outra empresa lança alvo_nao_encontrado sem gravar nada", async () => {
  const amb = ambiente();
  await assert.rejects(
    () =>
      criarLinkEnvio(amb.db, amb.storage, {
        autorizacaoId: AUT,
        usuarioCustomId: UC,
        alvo: "oportunidade",
        alvoId: OP_B,
        arquivos: [{ nome: "Edital.pdf", categoria: "edital", pasta: null, tipo: "pdf" }],
        agora: AGORA,
      }),
    erroCom("alvo_nao_encontrado")
  );
  assert.equal(amb.chamadas.filter((c) => c.op === "insert").length, 0);
  assert.equal(amb.chamadasStorage.length, 0);
});

test("criarLinkEnvio: grava o link com os caminhos da empresa e devolve as URLs de envio", async () => {
  const amb = ambiente();
  let n = 0;
  const r = await criarLinkEnvio(amb.db, amb.storage, {
    autorizacaoId: AUT,
    usuarioCustomId: UC,
    alvo: "oportunidade",
    alvoId: OP,
    arquivos: [
      { nome: "Edital Nº 12.pdf", categoria: "edital", pasta: null, tipo: "pdf" },
      { nome: "Proposta.xlsx", categoria: null, pasta: "Envelope 01 – Proposta", tipo: "xlsx" },
    ],
    agora: AGORA,
    novoUuid: () => `00000000-0000-4000-8000-00000000000${++n}`,
  });
  const insert = amb.chamadas.find((c) => c.tabela === "mcp_link_envio" && c.op === "insert")!;
  const linha = (insert.payload as Record<string, unknown>[])[0];
  assert.equal(linha.empresa_id, E);
  assert.equal(linha.bucket, BUCKET);
  assert.equal(linha.oportunidade_id, OP);
  assert.equal(linha.atestado_id, null);
  assert.equal(linha.expira_em, "2026-10-08T14:00:00.000Z");
  assert.deepEqual(
    (linha.arquivos as ArquivoDoLink[]).map((a) => [a.indice, a.caminho]),
    [
      [1, `${E}/2026/10/00000000-0000-4000-8000-000000000001-Edital_N_12.pdf`],
      [2, `${E}/2026/10/00000000-0000-4000-8000-000000000002-Proposta.xlsx`],
    ]
  );
  assert.deepEqual(
    amb.chamadasStorage.map((c) => [c.bucket, c.metodo, c.args[0]]),
    (linha.arquivos as ArquivoDoLink[]).map((a) => [BUCKET, "createSignedUploadUrl", a.caminho])
  );
  assert.equal(r.link_id, LINK);
  assert.equal(r.pagina, `https://www.sigoobras.com.br/EnviarArquivos?link=${LINK}`);
  assert.equal(r.alvo_id, OP);
  assert.match(r.arquivos[0].upload_url, /^https:\/\/storage\.test\/object\/upload\/sign\//);
  assert.ok(r.arquivos[0].token);
});

test("registrarEnvio: link de outra empresa (ou inexistente) → nao_encontrado", async () => {
  const amb = ambiente({ link: null });
  await assert.rejects(() => registrar(amb), erroCom("nao_encontrado"));
  const select = amb.chamadas.find((c) => c.tabela === "mcp_link_envio")!;
  assert.equal(eqDe(select, "empresa_id"), E);
});

test("registrarEnvio: autorização ou usuário diferente do link → outro_usuario", async () => {
  const amb = ambiente({ link: linkDaOportunidade([arq(1, "Edital.pdf")]) });
  await assert.rejects(
    () => registrar(amb, { autorizacaoId: "00000000-0000-4000-8000-0000000000a2" }),
    erroCom("outro_usuario")
  );
  await assert.rejects(
    () =>
      registrar(amb, {
        origem: "pagina",
        autorizacaoId: null,
        usuarioCustomId: "00000000-0000-4000-8000-0000000000b2",
      }),
    erroCom("outro_usuario")
  );
});

test("registrarEnvio: link expirado e link usado", async () => {
  const expirado = ambiente({
    link: linkDaOportunidade([arq(1, "a.pdf")], { expira_em: "2026-10-08T11:59:59Z" }),
  });
  await assert.rejects(() => registrar(expirado), erroCom("link_expirado"));
  const usado = ambiente({
    link: linkDaOportunidade([arq(1, "a.pdf")], { usado_em: "2026-10-08T11:00:00Z" }),
  });
  await assert.rejects(() => registrar(usado), erroCom("link_usado"));
});

test("registrarEnvio: falta um arquivo → faltam_arquivos e o link NÃO é consumido", async () => {
  const a1 = arq(1, "Edital.pdf");
  const a2 = arq(2, "TR.pdf");
  const amb = ambiente({ link: linkDaOportunidade([a1, a2]), objetos: { [a1.caminho]: PDF } });
  await assert.rejects(
    () => registrar(amb),
    (e: unknown) =>
      e instanceof ErroEnvio &&
      e.codigo === "faltam_arquivos" &&
      /TR\.pdf \(não foi enviado\)/.test(e.message) &&
      JSON.stringify(e.detalhes).includes('"motivo":"ausente"')
  );
  assert.equal(amb.chamadas.filter((c) => c.op === "update").length, 0);
  assert.equal(amb.chamadas.filter((c) => c.op === "insert").length, 0);
});

test("registrarEnvio: parcial aceito registra os válidos e lista os recusados", async () => {
  const a1 = arq(1, "Edital.pdf", { categoria: "edital" });
  const a2 = arq(2, "TR.pdf", { categoria: "termo_referencia" });
  const amb = ambiente({ link: linkDaOportunidade([a1, a2]), objetos: { [a1.caminho]: PDF } });
  const r = await registrar(amb, { aceitarParcial: true });
  assert.deepEqual(r.recusados, [{ indice: 2, nome: "TR.pdf", motivo: "ausente" }]);
  assert.deepEqual(r.registrados, [
    {
      indice: 1,
      nome: "Edital.pdf",
      arquivo_id: "arq-1",
      ref: `${BUCKET}/${a1.caminho}`,
      tamanho: 10,
    },
  ]);
});

test("registrarEnvio: tipo errado é apagado do Storage e não é registrado", async () => {
  const a1 = arq(1, "Edital.pdf");
  const amb = ambiente({ link: linkDaOportunidade([a1]), objetos: { [a1.caminho]: HTML } });
  await assert.rejects(() => registrar(amb), erroCom("faltam_arquivos"));
  assert.deepEqual(
    amb.chamadasStorage.filter((c) => c.metodo === "remove").map((c) => c.args[0]),
    [[a1.caminho]]
  );
  await assert.rejects(
    () => registrar(amb, { aceitarParcial: true }),
    erroCom("arquivos_invalidos")
  );
  assert.equal(amb.chamadas.filter((c) => c.op === "insert").length, 0);
});

test("registrarEnvio (oportunidade): arquivos com a empresa da camada, edital_analise só com o edital, nota e registrados", async () => {
  const a1 = arq(1, "Edital.pdf", { categoria: "edital" });
  const a2 = arq(2, "Proposta.xlsx", { pasta: "Envelope 01 – Proposta" });
  const a3 = arq(3, "Anexo.pdf", { pasta: "Outros" });
  const amb = ambiente({
    link: linkDaOportunidade([a1, a2, a3]),
    objetos: { [a1.caminho]: PDF, [a2.caminho]: XLSX, [a3.caminho]: PDF },
  });
  const r = await registrar(amb);
  assert.deepEqual(r.recusados, []);
  assert.deepEqual(
    r.registrados.map((x) => [x.indice, x.arquivo_id]),
    [
      [1, "arq-1"],
      [2, "arq-2"],
      [3, "arq-3"],
    ]
  );
  // consumo atômico preso à autorização
  const consumo = amb.chamadas.find(
    (c) => c.tabela === "mcp_link_envio" && c.op === "update" && "usado_em" in (c.payload as object)
  )!;
  assert.deepEqual(consumo.payload, { usado_em: AGORA.toISOString(), usado_por: "claude" });
  assert.deepEqual(
    consumo.filtros.map((f) => [f.metodo, ...f.args]),
    [
      ["eq", "id", LINK],
      ["eq", "empresa_id", E],
      ["is", "usado_em", null],
      ["gt", "expira_em", AGORA.toISOString()],
      ["eq", "autorizacao_id", AUT],
    ]
  );
  const insert = amb.chamadas.find((c) => c.tabela === "arquivo_oportunidade")!;
  assert.deepEqual(insert.payload, [
    {
      oportunidade_id: OP,
      nome: "Edital.pdf",
      url: `${BUCKET}/${a1.caminho}`,
      tipo: "application/pdf",
      tamanho: 10,
      categoria: "edital",
      pasta: null,
      usuario_nome: "Usuário Teste",
      empresa_id: E,
    },
    {
      oportunidade_id: OP,
      nome: "Proposta.xlsx",
      url: `${BUCKET}/${a2.caminho}`,
      tipo: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      tamanho: 10,
      categoria: null,
      pasta: "Envelope 01 – Proposta",
      usuario_nome: "Usuário Teste",
      empresa_id: E,
    },
    {
      oportunidade_id: OP,
      nome: "Anexo.pdf",
      url: `${BUCKET}/${a3.caminho}`,
      tipo: "application/pdf",
      tamanho: 10,
      categoria: null,
      pasta: null,
      usuario_nome: "Usuário Teste",
      empresa_id: E,
    },
  ]);
  const rpc = amb.chamadas.find((c) => c.op === "rpc")!;
  assert.equal(rpc.tabela, "edital_analise_anexar_arquivos");
  assert.deepEqual(rpc.payload, {
    p_oportunidade_id: OP,
    p_arquivos: [{ arquivo_oportunidade_id: "arq-1", nome: "Edital.pdf", categoria: "edital" }],
    p_empresa_id: E,
  });
  const nota = amb.chamadas.find((c) => c.tabela === "oportunidade_atualizacao")!;
  assert.deepEqual(nota.payload, [
    {
      oportunidade_id: OP,
      usuario_nome: "Usuário Teste",
      tipo: "Arquivo",
      descricao: "Arquivos enviados pelo Claude: Edital.pdf, Proposta.xlsx, Anexo.pdf",
      empresa_id: E,
    },
  ]);
  const final = amb.chamadas
    .filter((c) => c.tabela === "mcp_link_envio" && c.op === "update")
    .at(-1)!;
  assert.deepEqual(Object.keys(final.payload as object), ["registrados"]);
  assert.ok(amb.pedidosFetch.every((p) => p.range === "bytes=0-7"));
});

test("registrarEnvio (atestado): grava o arquivo_ref do atestado", async () => {
  const a1: ArquivoDoLink = { ...arq(1, "CAT.pdf"), caminho: `${E}/2026/10/u-CAT.pdf` };
  const amb = ambiente({
    link: {
      ...linkDaOportunidade([a1]),
      alvo: "atestado",
      oportunidade_id: null,
      atestado_id: AT,
      bucket: "certificados",
    },
    objetos: { [a1.caminho]: PDF },
  });
  const r = await registrar(amb, { origem: "pagina", autorizacaoId: null });
  const up = amb.chamadas.find((c) => c.tabela === "acervo_atestado" && c.op === "update")!;
  assert.deepEqual(up.payload, { arquivo_ref: `certificados/${a1.caminho}` });
  assert.equal(eqDe(up, "id"), AT);
  assert.equal(eqDe(up, "empresa_id"), E);
  assert.deepEqual(r.registrados, [
    {
      indice: 1,
      nome: "CAT.pdf",
      arquivo_id: null,
      ref: `certificados/${a1.caminho}`,
      tamanho: 10,
    },
  ]);
  assert.equal(r.alvo_id, AT);
  // origem página: o consumo é preso ao usuário do link
  const consumo = amb.chamadas.find(
    (c) => c.tabela === "mcp_link_envio" && c.op === "update" && "usado_em" in (c.payload as object)
  )!;
  assert.equal(eqDe(consumo, "usuario_custom_id"), UC);
  assert.equal((consumo.payload as Record<string, unknown>).usado_por, "pagina");
});

test("registrarEnvio: corrida (o UPDATE atômico não acha a linha) → link_usado sem registrar", async () => {
  const a1 = arq(1, "Edital.pdf");
  const amb = ambiente({
    link: linkDaOportunidade([a1]),
    objetos: { [a1.caminho]: PDF },
    consumir: false,
  });
  await assert.rejects(() => registrar(amb), erroCom("link_usado"));
  assert.equal(amb.chamadas.filter((c) => c.op === "insert").length, 0);
});

test("registrarEnvio: falha ao gravar os arquivos devolve o link para pendente", async () => {
  const a1 = arq(1, "Edital.pdf");
  const amb = ambiente({ link: linkDaOportunidade([a1]), objetos: { [a1.caminho]: PDF } });
  const { admin } = amb;
  const original = admin.from;
  admin.from = (t: string) => {
    const q = original(t);
    if (t !== "arquivo_oportunidade") return q;
    q.insert = () => ({
      select: () => Promise.resolve({ data: null, error: { message: "disco cheio" } }),
    });
    return q;
  };
  await assert.rejects(() => registrar(amb), /disco cheio/);
  const updates = amb.chamadas.filter((c) => c.tabela === "mcp_link_envio" && c.op === "update");
  assert.deepEqual(
    updates.map((c) => c.payload),
    [
      { usado_em: AGORA.toISOString(), usado_por: "claude" },
      { usado_em: null, usado_por: null },
    ]
  );
});

test("registrarEnvio: se a volta do link a pendente também falhar, o erro original sai e a falha vai ao log", async () => {
  const a1 = arq(1, "Edital.pdf");
  const amb = ambiente({
    link: linkDaOportunidade([a1]),
    objetos: { [a1.caminho]: PDF },
    devolucaoFalha: true,
  });
  const { admin } = amb;
  const original = admin.from;
  admin.from = (t: string) => {
    const q = original(t);
    if (t !== "arquivo_oportunidade") return q;
    q.insert = () => ({
      select: () => Promise.resolve({ data: null, error: { message: "disco cheio" } }),
    });
    return q;
  };
  const logs: unknown[][] = [];
  const consoleError = console.error;
  console.error = (...args: unknown[]) => {
    logs.push(args);
  };
  try {
    await assert.rejects(() => registrar(amb), /disco cheio/);
  } finally {
    console.error = consoleError;
  }
  // a volta foi tentada e falhou: o link fica "usado" no banco e o log é o único rastro
  assert.deepEqual(logs, [["[conector] envio: devolver o link a pendente:", "banco fora do ar"]]);
  const updates = amb.chamadas.filter((c) => c.tabela === "mcp_link_envio" && c.op === "update");
  assert.deepEqual(
    updates.map((c) => c.payload),
    [
      { usado_em: AGORA.toISOString(), usado_por: "claude" },
      { usado_em: null, usado_por: null },
    ]
  );
});

test("lerObjeto: só os 8 primeiros bytes (Range); ausente; HTTP com erro lança", async () => {
  const caminho = `${E}/2026/10/u-a.pdf`;
  const amb = ambiente({ objetos: { [caminho]: PDF } });
  const r = await lerObjeto(amb.storage, amb.fetchFn, BUCKET, caminho);
  assert.equal(r.existe, true);
  assert.equal(r.tamanho, 10);
  assert.deepEqual([...(r.primeiros ?? [])], PDF.slice(0, 8));
  assert.deepEqual(amb.chamadasStorage[0].args, [`${E}/2026/10`, { search: "u-a.pdf", limit: 1 }]);
  assert.deepEqual(amb.chamadasStorage[1].args, [caminho, 60]);
  assert.deepEqual(await lerObjeto(amb.storage, amb.fetchFn, BUCKET, `${E}/2026/10/u-b.pdf`), {
    existe: false,
    tamanho: null,
    primeiros: null,
  });
  const falha = (async () => new Response("erro", { status: 500 })) as typeof fetch;
  await assert.rejects(() => lerObjeto(amb.storage, falha, BUCKET, caminho), /HTTP 500/);
});

test("lerLinkPorId: id que não é UUID não vai ao banco; com UUID lê sem filtro de empresa", async () => {
  const { admin, chamadas } = criarFakeAdmin((c) =>
    c.tabela === "mcp_link_envio" ? { data: { id: LINK, empresa_id: E } } : undefined
  );
  assert.equal(await lerLinkPorId(admin, "x"), null);
  assert.equal(chamadas.length, 0);
  const l = await lerLinkPorId(admin, LINK.toUpperCase());
  assert.equal(l?.empresa_id, E);
  assert.deepEqual(
    chamadas[0].filtros.map((f) => [f.metodo, ...f.args]),
    [["eq", "id", LINK]]
  );
  assert.match(String(chamadas[0].colunas), /^empresa_id, id, autorizacao_id, usuario_custom_id/);
});

test("lerObjeto: objeto vazio não pede o Range (o Storage responde 416) e sai com tamanho 0", async () => {
  const caminho = `${E}/2026/10/u-vazio.pdf`;
  const amb = ambiente({ objetos: { [caminho]: [] } });
  assert.deepEqual(await lerObjeto(amb.storage, amb.fetchFn, BUCKET, caminho), {
    existe: true,
    tamanho: 0,
    primeiros: null,
  });
  assert.equal(amb.pedidosFetch.length, 0);
  assert.deepEqual(
    amb.chamadasStorage.map((c) => c.metodo),
    ["list"]
  );
});

test("registrarEnvio: arquivo vazio vira 'está vazio' (não erro de leitura) e não é apagado", async () => {
  const a1 = arq(1, "Edital.pdf");
  const amb = ambiente({ link: linkDaOportunidade([a1]), objetos: { [a1.caminho]: [] } });
  // o Storage responde 416 a um Range sobre objeto vazio
  const storage416 = (async () => new Response("", { status: 416 })) as typeof fetch;
  await assert.rejects(
    () => registrar(amb, { fetchFn: storage416 }),
    (e: unknown) =>
      e instanceof ErroEnvio &&
      e.codigo === "faltam_arquivos" &&
      /Edital\.pdf \(está vazio/.test(e.message) &&
      JSON.stringify(e.detalhes).includes('"motivo":"vazio"')
  );
  assert.equal(amb.chamadas.filter((c) => c.op === "update" || c.op === "insert").length, 0);
  assert.equal(amb.chamadasStorage.filter((c) => c.metodo === "remove").length, 0);
});
