// node --test supabase/functions/_shared/conector/arquivo-servidor.test.ts
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import {
  baixarObjeto,
  BUCKET_ACERVO,
  BUCKET_HABILITACAO,
  BUCKET_OPORTUNIDADE,
  caminhoDaEmpresa,
  ErroArquivo,
  extensaoDoNome,
  gravarNaOportunidade,
  LIMITE_ARQUIVO_SERVIDOR,
  MIME_ARQUIVO,
  nomeParaExibir,
  PASTA_CREDENCIAMENTO,
  PASTA_HABILITACAO,
  registrarNoHistorico,
  tipoPelosBytesServidor,
} from "./arquivo-servidor.ts";
import { camadaDaEmpresa, ErroCamada } from "./camada-empresa.ts";
import {
  criarBancoArquivosFake,
  criarFakeAdmin,
  imitarGravarArquivo,
  type ArquivoOportunidadeFake,
  type ChamadaFake,
  type ChamadaStorageFake,
} from "./testes/fake-admin.ts";

const E = "00000000-0000-4000-8000-000000000001";
const OUTRA = "00000000-0000-4000-8000-000000000002";
const OP = "00000000-0000-4000-8000-000000000010";
const ARQ = "00000000-0000-4000-8000-000000000040";
const AGORA = new Date("2026-10-13T15:00:00Z");
const PDF = new TextEncoder().encode("%PDF-1.7 conteúdo");
const PDF2 = new TextEncoder().encode("%PDF-1.7 outro conteúdo, mais longo");
const b = (...n: number[]) => new Uint8Array(n);

test("constantes", () => {
  assert.equal(BUCKET_OPORTUNIDADE, "anexos-oportunidade");
  assert.equal(BUCKET_HABILITACAO, "habilitacao");
  assert.equal(BUCKET_ACERVO, "certificados");
  assert.equal(PASTA_HABILITACAO, "Envelope 02 – Habilitação");
  assert.equal(PASTA_CREDENCIAMENTO, "Credenciamento");
  assert.equal(LIMITE_ARQUIVO_SERVIDOR, 52428800);
  assert.equal(MIME_ARQUIVO.pdf, "application/pdf");
  assert.equal(
    MIME_ARQUIVO.xlsx,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  assert.equal(
    MIME_ARQUIVO.docx,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
  assert.equal(MIME_ARQUIVO.zip, "application/zip");
  assert.equal(MIME_ARQUIVO.doc, "application/msword");
  assert.equal(MIME_ARQUIVO.xls, "application/vnd.ms-excel");
  assert.equal(MIME_ARQUIVO.jpg, "image/jpeg");
  assert.equal(MIME_ARQUIVO.png, "image/png");
});

test("extensaoDoNome e nomeParaExibir", () => {
  assert.equal(extensaoDoNome("Edital.PDF"), "pdf");
  assert.equal(extensaoDoNome("sem extensao"), "");
  assert.equal(extensaoDoNome("a.b.docx"), "docx");
  assert.equal(nomeParaExibir('CND: Federal/"2026"\n.pdf'), "CND- Federal--2026- .pdf");
  assert.equal(nomeParaExibir("  a   b  "), "a b");
  assert.equal(nomeParaExibir("x".repeat(300) + ".pdf").length, 150);
  assert.ok(nomeParaExibir("x".repeat(300) + ".pdf").endsWith(".pdf"));
});

test("tipoPelosBytesServidor: assinatura dos bytes, e a extensão só desempata", () => {
  assert.equal(tipoPelosBytesServidor(PDF, "qualquer.xlsx"), "pdf");
  const zip = b(0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0);
  assert.equal(tipoPelosBytesServidor(zip, "Planilha.xlsx"), "xlsx");
  assert.equal(tipoPelosBytesServidor(zip, "Decl.DOCX"), "docx");
  assert.equal(tipoPelosBytesServidor(zip, "anexos.zip"), "zip");
  assert.equal(tipoPelosBytesServidor(zip, "sem-extensao"), "zip");
  assert.equal(tipoPelosBytesServidor(zip, "Planilha.xls"), "zip");
  const ole = b(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
  assert.equal(tipoPelosBytesServidor(ole, "Edital.doc"), "doc");
  assert.equal(tipoPelosBytesServidor(ole, "Planilha.xls"), "xls");
  assert.equal(tipoPelosBytesServidor(ole, "Edital.DOC"), "doc");
  assert.equal(tipoPelosBytesServidor(ole, "arquivo.pdf"), null);
  assert.equal(tipoPelosBytesServidor(b(0xff, 0xd8, 0xff, 0xe0), "foto.jpg"), "jpg");
  assert.equal(
    tipoPelosBytesServidor(b(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), "x.png"),
    "png"
  );
  assert.equal(
    tipoPelosBytesServidor(new TextEncoder().encode("<!DOCTYPE html>"), "Edital.pdf"),
    null
  );
  assert.equal(tipoPelosBytesServidor(new Uint8Array(0), "x.pdf"), null);
  assert.equal(tipoPelosBytesServidor(b(0x25, 0x50, 0x44, 0x46), "curto.pdf"), null);
});

test("caminhoDaEmpresa: só a pasta da empresa, no bucket esperado", () => {
  assert.equal(
    caminhoDaEmpresa(`habilitacao/${E}/2026/10/u-cnd.pdf`, "habilitacao", E),
    `${E}/2026/10/u-cnd.pdf`
  );
  assert.equal(
    caminhoDaEmpresa(`habilitacao/${E.toUpperCase()}/a.pdf`, "habilitacao", E),
    `${E.toUpperCase()}/a.pdf`
  );
  assert.equal(caminhoDaEmpresa(`habilitacao/${OUTRA}/a.pdf`, "habilitacao", E), null);
  assert.equal(caminhoDaEmpresa(`certificados/${E}/a.pdf`, "habilitacao", E), null);
  assert.equal(caminhoDaEmpresa(`habilitacao/${E}/../${OUTRA}/a.pdf`, "habilitacao", E), null);
  assert.equal(caminhoDaEmpresa(`habilitacao/${E}/a.pdf?x=1`, "habilitacao", E), null);
  assert.equal(caminhoDaEmpresa(`habilitacao/${E}/a%2e.pdf`, "habilitacao", E), null);
  assert.equal(caminhoDaEmpresa(`habilitacao/${E}/`, "habilitacao", E), null);
  assert.equal(caminhoDaEmpresa("https://x/y", "habilitacao", E), null);
  assert.equal(caminhoDaEmpresa(null, "habilitacao", E), null);
});

test("caminhoDaEmpresa: recusa segmento '.' e '..', mas aceita '..' dentro de um nome", () => {
  assert.equal(
    caminhoDaEmpresa(`certificados/${E}/Atestado_Empresa_Ltda..pdf`, "certificados", E),
    `${E}/Atestado_Empresa_Ltda..pdf`
  );
  assert.equal(
    caminhoDaEmpresa(`certificados/${E}/2026/10/u-Atestado_Empresa_Ltda..pdf`, "certificados", E),
    `${E}/2026/10/u-Atestado_Empresa_Ltda..pdf`
  );
  assert.equal(caminhoDaEmpresa(`certificados/${E}/./a.pdf`, "certificados", E), null);
  assert.equal(caminhoDaEmpresa(`certificados/${E}/a/..`, "certificados", E), null);
  assert.equal(caminhoDaEmpresa(`certificados/${E}//a.pdf`, "certificados", E), null);
  assert.equal(caminhoDaEmpresa(`certificados/${E}/a\\b.pdf`, "certificados", E), null);
  assert.equal(caminhoDaEmpresa(`certificados/${E}/a#b.pdf`, "certificados", E), null);
  assert.equal(caminhoDaEmpresa(undefined, "certificados", E), null);
  assert.equal(caminhoDaEmpresa(42, "certificados", E), null);
  assert.equal(caminhoDaEmpresa(`certificados/${E}`, "certificados", E), null);
});

test("baixarObjeto: bytes do objeto; ausente, vazio e grande demais lançam ErroArquivo", async () => {
  const fake = criarFakeAdmin();
  fake.objetos.set(`habilitacao/${E}/a.pdf`, PDF);
  fake.objetos.set(`habilitacao/${E}/vazio.pdf`, new Uint8Array(0));
  assert.deepEqual(await baixarObjeto(fake.storage, "habilitacao", `${E}/a.pdf`), PDF);
  const codigo = async (caminho: string, limite?: number) => {
    try {
      await baixarObjeto(fake.storage, "habilitacao", caminho, limite);
      return "ok";
    } catch (e) {
      return e instanceof ErroArquivo ? e.codigo : "outro";
    }
  };
  assert.equal(await codigo(`${E}/nao-existe.pdf`), "nao_encontrado");
  assert.equal(await codigo(`${E}/vazio.pdf`), "vazio");
  assert.equal(await codigo(`${E}/a.pdf`, 5), "grande_demais");
});

test("baixarObjeto: erro do Storage que não é 'não encontrado' vira 'storage'; lê do bucket e caminho pedidos", async () => {
  const fake = criarFakeAdmin(undefined, (c) =>
    c.metodo === "download" ? { error: { message: "timeout no storage" } } : undefined
  );
  await assert.rejects(
    () => baixarObjeto(fake.storage, "certificados", `${E}/a.pdf`),
    (e: unknown) => e instanceof ErroArquivo && e.codigo === "storage" && /timeout/.test(e.message)
  );
  assert.deepEqual(fake.chamadasStorage[0], {
    bucket: "certificados",
    metodo: "download",
    args: [`${E}/a.pdf`],
  });
});

type RespostaStorage = (c: ChamadaStorageFake) => { error?: { message: string } } | undefined;

function montar(
  resposta: Record<string, unknown> | { erro: string },
  responderStorage?: RespostaStorage
) {
  const fake = criarFakeAdmin((c: ChamadaFake) => {
    if (c.tabela !== "conector_gravar_arquivo") return undefined;
    return "erro" in resposta ? { error: { message: String(resposta.erro) } } : { data: resposta };
  }, responderStorage);
  let n = 0;
  const deps = {
    db: camadaDaEmpresa(fake.admin, E),
    storage: fake.storage,
    agora: AGORA,
    novoUuid: () => `uuid${++n}`,
  };
  const pedido = {
    oportunidadeId: OP,
    origem: "biblioteca:doc1",
    nome: "CND Federal.pdf",
    bytes: PDF,
    tipo: "pdf" as const,
    pasta: PASTA_HABILITACAO,
    categoria: null,
    assinatura: null,
    usuarioNome: "Usuário Teste (via Claude)",
  };
  return { fake, deps, pedido };
}

const GRAVOU = {
  ok: true,
  arquivo_id: ARQ,
  substituiu: false,
  mantido_assinado: false,
  ref_anterior: null,
};
const removeu = (fake: { chamadasStorage: ChamadaStorageFake[] }) =>
  fake.chamadasStorage.filter((c) => c.metodo === "remove");

test("gravarNaOportunidade: envia para a pasta da empresa e grava pela RPC", async () => {
  const { fake, deps, pedido } = montar({
    ok: true,
    arquivo_id: ARQ,
    substituiu: false,
    mantido_assinado: false,
    ref_anterior: null,
  });
  const r = await gravarNaOportunidade(deps, pedido);
  const caminho = `${E}/2026/10/uuid1-CND_Federal.pdf`;
  assert.deepEqual(r, {
    arquivo_id: ARQ,
    nome: "CND Federal.pdf",
    ref: `anexos-oportunidade/${caminho}`,
    tamanho: PDF.length,
    substituiu: false,
    mantido_assinado: false,
  });
  assert.deepEqual(fake.objetos.get(`anexos-oportunidade/${caminho}`), PDF);
  const envio = fake.chamadasStorage.find((c) => c.metodo === "upload")!;
  assert.deepEqual(envio.args[2], { contentType: "application/pdf", upsert: false });
  const rpc = fake.chamadas.find((c) => c.tabela === "conector_gravar_arquivo")!;
  assert.deepEqual(rpc.payload, {
    p_oportunidade_id: OP,
    p_origem: "biblioteca:doc1",
    p_nome: "CND Federal.pdf",
    p_url: `anexos-oportunidade/${caminho}`,
    p_tipo: "application/pdf",
    p_tamanho: PDF.length,
    p_pasta: PASTA_HABILITACAO,
    p_categoria: null,
    p_assinatura: null,
    p_usuario_nome: "Usuário Teste (via Claude)",
    p_empresa_id: E,
  });
});

test("gravarNaOportunidade: o tipo do pedido vira o Content-Type do envio e o p_tipo da RPC", async () => {
  for (const tipo of Object.keys(MIME_ARQUIVO) as (keyof typeof MIME_ARQUIVO)[]) {
    const { fake, deps, pedido } = montar(GRAVOU);
    await gravarNaOportunidade(deps, { ...pedido, tipo, nome: `Arquivo.${tipo}` });
    const envio = fake.chamadasStorage.find((c) => c.metodo === "upload")!;
    assert.deepEqual(envio.args[2], { contentType: MIME_ARQUIVO[tipo], upsert: false });
    const rpc = fake.chamadas.find((c) => c.tabela === "conector_gravar_arquivo")!;
    assert.equal((rpc.payload as Record<string, unknown>).p_tipo, MIME_ARQUIVO[tipo]);
  }
});

test("gravarNaOportunidade: arquivo já assinado é mantido e o objeto novo é removido", async () => {
  const { fake, deps, pedido } = montar({
    ok: true,
    arquivo_id: ARQ,
    substituiu: false,
    mantido_assinado: true,
    ref_anterior: null,
  });
  const r = await gravarNaOportunidade(deps, pedido);
  assert.deepEqual(r, {
    arquivo_id: ARQ,
    nome: "CND Federal.pdf",
    ref: "",
    tamanho: 0,
    substituiu: false,
    mantido_assinado: true,
  });
  assert.equal(fake.objetos.size, 0);
});

test("gravarNaOportunidade: ao trocar, remove o objeto anterior se ele é da empresa", async () => {
  const anterior = `${E}/2026/09/velho-CND.pdf`;
  const { fake, deps, pedido } = montar({
    ok: true,
    arquivo_id: ARQ,
    substituiu: true,
    mantido_assinado: false,
    ref_anterior: `anexos-oportunidade/${anterior}`,
  });
  fake.objetos.set(`anexos-oportunidade/${anterior}`, PDF);
  const r = await gravarNaOportunidade(deps, pedido);
  assert.equal(r?.substituiu, true);
  assert.equal(fake.objetos.has(`anexos-oportunidade/${anterior}`), false);
  assert.equal(fake.objetos.size, 1);

  const fora = montar({
    ok: true,
    arquivo_id: ARQ,
    substituiu: true,
    mantido_assinado: false,
    ref_anterior: `anexos-oportunidade/${OUTRA}/x.pdf`,
  });
  fora.fake.objetos.set(`anexos-oportunidade/${OUTRA}/x.pdf`, PDF);
  await gravarNaOportunidade(fora.deps, fora.pedido);
  assert.equal(fora.fake.objetos.has(`anexos-oportunidade/${OUTRA}/x.pdf`), true);
});

test("gravarNaOportunidade: ref_anterior da empresa é removida do bucket da oportunidade e de mais nenhum", async () => {
  const anterior = `${E}/2026/09/velho-CND.pdf`;
  const { fake, deps, pedido } = montar({
    ...GRAVOU,
    substituiu: true,
    ref_anterior: `anexos-oportunidade/${anterior}`,
  });
  fake.objetos.set(`anexos-oportunidade/${anterior}`, PDF);
  await gravarNaOportunidade(deps, pedido);
  assert.deepEqual(
    removeu(fake).map((c) => [c.bucket, c.args[0]]),
    [[BUCKET_OPORTUNIDADE, [anterior]]]
  );
});

test("gravarNaOportunidade: ref_anterior que não é da pasta da empresa no bucket NÃO remove nada", async () => {
  // a coluna url da linha pode ser alterada por qualquer usuário da empresa pela tela:
  // só vai ao Storage o que passa por caminhoDaEmpresa(…, anexos-oportunidade, empresa)
  const outraEmpresa = `anexos-oportunidade/${OUTRA}/2026/09/x.pdf`;
  const outroBucket = `habilitacao/${E}/2026/09/x.pdf`;
  const casos: [string, unknown][] = [
    ["outra empresa", outraEmpresa],
    ["outro bucket (habilitacao)", outroBucket],
    ["outro bucket (certificados)", `certificados/${E}/x.pdf`],
    ["URL https", "https://exemplo.test/arquivo.pdf"],
    ["URL https com o bucket no caminho", `https://exemplo.test/anexos-oportunidade/${E}/x.pdf`],
    ["null", null],
    ["vazia", ""],
    ["sai da pasta com ..", `anexos-oportunidade/${E}/../${OUTRA}/x.pdf`],
    ["segmento .", `anexos-oportunidade/${E}/./x.pdf`],
    ["com %", `anexos-oportunidade/${E}/x%2e.pdf`],
    ["com barra invertida", `anexos-oportunidade/${E}\\x.pdf`],
    ["só a pasta", `anexos-oportunidade/${E}/`],
    ["sem bucket", `${E}/2026/09/x.pdf`],
  ];
  for (const [rotulo, ref] of casos) {
    const { fake, deps, pedido } = montar({ ...GRAVOU, substituiu: true, ref_anterior: ref });
    const guardados = ["anexos-oportunidade/" + OUTRA + "/2026/09/x.pdf", outroBucket];
    for (const g of guardados) fake.objetos.set(g, PDF);
    const r = await gravarNaOportunidade(deps, pedido);
    assert.equal(r?.substituiu, true, rotulo);
    assert.equal(removeu(fake).length, 0, `${rotulo}: não pode chamar remove`);
    for (const g of guardados) assert.equal(fake.objetos.has(g), true, `${rotulo}: ${g}`);
    // o arquivo novo continua lá
    assert.equal(fake.objetos.has(r!.ref), true, rotulo);
  }
});

test("gravarNaOportunidade: ref_anterior igual ao caminho novo não remove o arquivo recém-gravado", async () => {
  const caminho = `${E}/2026/10/uuid1-CND_Federal.pdf`;
  const { fake, deps, pedido } = montar({
    ...GRAVOU,
    substituiu: true,
    ref_anterior: `anexos-oportunidade/${caminho}`,
  });
  const r = await gravarNaOportunidade(deps, pedido);
  assert.equal(r?.ref, `anexos-oportunidade/${caminho}`);
  assert.equal(removeu(fake).length, 0);
  assert.deepEqual(fake.objetos.get(`anexos-oportunidade/${caminho}`), PDF);
});

test("gravarNaOportunidade: sem substituição, a ref_anterior (mesmo da empresa) é ignorada", async () => {
  const { fake, deps, pedido } = montar({
    ...GRAVOU,
    substituiu: false,
    ref_anterior: `anexos-oportunidade/${E}/2026/09/velho.pdf`,
  });
  fake.objetos.set(`anexos-oportunidade/${E}/2026/09/velho.pdf`, PDF);
  await gravarNaOportunidade(deps, pedido);
  assert.equal(removeu(fake).length, 0);
  assert.equal(fake.objetos.has(`anexos-oportunidade/${E}/2026/09/velho.pdf`), true);
});

test("gravarNaOportunidade: falha ao remover o objeto não desfaz a gravação (só log)", async () => {
  const log = mock.method(console, "error", () => {});
  try {
    const falhaNoRemove: RespostaStorage = (c) =>
      c.metodo === "remove" ? { error: { message: "storage fora do ar" } } : undefined;

    // troca: o objeto anterior fica órfão, mas a gravação vale
    const anterior = `${E}/2026/09/velho-CND.pdf`;
    const troca = montar(
      { ...GRAVOU, substituiu: true, ref_anterior: `anexos-oportunidade/${anterior}` },
      falhaNoRemove
    );
    troca.fake.objetos.set(`anexos-oportunidade/${anterior}`, PDF);
    const r = await gravarNaOportunidade(troca.deps, troca.pedido);
    assert.equal(r?.substituiu, true);
    assert.equal(r?.arquivo_id, ARQ);
    assert.equal(troca.fake.objetos.has(r!.ref), true);
    assert.equal(troca.fake.objetos.has(`anexos-oportunidade/${anterior}`), true);

    // assinado mantido: o objeto novo fica órfão, e a resposta continua "mantido"
    const mantido = montar({ ...GRAVOU, mantido_assinado: true }, falhaNoRemove);
    const m = await gravarNaOportunidade(mantido.deps, mantido.pedido);
    assert.equal(m?.mantido_assinado, true);

    // oportunidade não encontrada: continua null
    const nao = montar({ ok: false, motivo: "nao_encontrada" }, falhaNoRemove);
    assert.equal(await gravarNaOportunidade(nao.deps, nao.pedido), null);

    assert.equal(log.mock.callCount(), 3);
    assert.match(String(log.mock.calls[0].arguments.join(" ")), /storage fora do ar/);
  } finally {
    log.mock.restore();
  }
});

test("gravarNaOportunidade: oportunidade não encontrada → null, sem deixar objeto", async () => {
  const { fake, deps, pedido } = montar({ ok: false, motivo: "nao_encontrada" });
  assert.equal(await gravarNaOportunidade(deps, pedido), null);
  assert.equal(fake.objetos.size, 0);
});

test("gravarNaOportunidade: falha da RPC relança e não deixa objeto; vazio e grande demais nem enviam", async () => {
  const { fake, deps, pedido } = montar({ erro: "boom" });
  await assert.rejects(() => gravarNaOportunidade(deps, pedido), /boom/);
  assert.equal(fake.objetos.size, 0);
  const outro = montar({ ok: true, arquivo_id: ARQ });
  await assert.rejects(
    () => gravarNaOportunidade(outro.deps, { ...outro.pedido, bytes: new Uint8Array(0) }),
    ErroArquivo
  );
  assert.equal(outro.fake.chamadasStorage.length, 0);
});

test("gravarNaOportunidade: acima de 50 MB recusa antes de enviar (grande_demais)", async () => {
  const { fake, deps, pedido } = montar(GRAVOU);
  const grande = new Uint8Array(LIMITE_ARQUIVO_SERVIDOR + 1);
  await assert.rejects(
    () => gravarNaOportunidade(deps, { ...pedido, bytes: grande }),
    (e: unknown) => e instanceof ErroArquivo && e.codigo === "grande_demais"
  );
  assert.equal(fake.chamadasStorage.length, 0);
  assert.equal(fake.chamadas.length, 0);
});

test("gravarNaOportunidade: falha no envio do objeto lança 'storage' e não chama a RPC", async () => {
  const { fake, deps, pedido } = montar(GRAVOU, (c) =>
    c.metodo === "upload" ? { error: { message: "quota excedida" } } : undefined
  );
  await assert.rejects(
    () => gravarNaOportunidade(deps, pedido),
    (e: unknown) =>
      e instanceof ErroArquivo && e.codigo === "storage" && /quota excedida/.test(e.message)
  );
  assert.equal(fake.chamadas.length, 0);
  assert.equal(fake.objetos.size, 0);
});

test("gravarNaOportunidade: resposta inesperada da RPC lança e remove o objeto novo", async () => {
  for (const resposta of [{ ok: true }, { ok: false, motivo: "outro" }, { ok: false }]) {
    const { fake, deps, pedido } = montar(resposta);
    await assert.rejects(
      () => gravarNaOportunidade(deps, pedido),
      /resposta inesperada/,
      JSON.stringify(resposta)
    );
    assert.equal(fake.objetos.size, 0, JSON.stringify(resposta));
  }
});

test("gravarNaOportunidade: o uuid do caminho vem do novoUuid; sem ele, é um UUID aleatório", async () => {
  const { fake, deps, pedido } = montar(GRAVOU);
  const sem = { ...deps, novoUuid: undefined };
  const r = await gravarNaOportunidade(sem, pedido);
  assert.match(
    r!.ref,
    new RegExp(
      `^anexos-oportunidade/${E}/2026/10/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-CND_Federal\\.pdf$`
    )
  );
  assert.equal(fake.objetos.size, 1);
});

test("registrarNoHistorico: grava a linha e não lança se o banco falhar", async () => {
  const log = mock.method(console, "error", () => {});
  try {
    const fake = criarFakeAdmin((c) =>
      c.tabela === "oportunidade_atualizacao" ? { error: { message: "x" } } : undefined
    );
    await registrarNoHistorico(
      camadaDaEmpresa(fake.admin, E),
      OP,
      "Usuário (via Claude)",
      "Habilitação anexada"
    );
    const c = fake.chamadas[0];
    assert.equal(c.op, "insert");
    assert.deepEqual(c.payload, [
      {
        oportunidade_id: OP,
        usuario_nome: "Usuário (via Claude)",
        tipo: "Arquivo",
        descricao: "Habilitação anexada",
        empresa_id: E,
      },
    ]);
    assert.equal(log.mock.callCount(), 1);
  } finally {
    log.mock.restore();
  }
});

test("registrarNoHistorico: quando o banco responde, não loga nada", async () => {
  const log = mock.method(console, "error", () => {});
  try {
    const fake = criarFakeAdmin((c) => (c.op === "insert" ? { data: [{ id: "h1" }] } : undefined));
    await registrarNoHistorico(camadaDaEmpresa(fake.admin, E), OP, "U", "D");
    assert.equal(fake.chamadas.length, 1);
    assert.equal(log.mock.callCount(), 0);
  } finally {
    log.mock.restore();
  }
});

// ─── A RPC conector_gravar_arquivo imitada pelo fake (0156) ─────────────────────────────

function montarComBanco(parcial: Parameters<typeof criarBancoArquivosFake>[0] = {}) {
  const banco = criarBancoArquivosFake({
    oportunidades: [{ id: OP, empresa_id: E, deleted_at: null }],
    ...parcial,
  });
  const fake = criarFakeAdmin(imitarGravarArquivo(banco, () => AGORA.toISOString()));
  let n = 0;
  const deps = {
    db: camadaDaEmpresa(fake.admin, E),
    storage: fake.storage,
    agora: AGORA,
    novoUuid: () => `u${++n}`,
  };
  const pedido = {
    oportunidadeId: OP,
    origem: "gerado:proposta:pdf",
    nome: "Proposta.pdf",
    bytes: PDF,
    tipo: "pdf" as const,
    pasta: "Envelope 01 – Proposta",
    categoria: null,
    assinatura: "pendente" as const,
    usuarioNome: "Usuário Teste (via Claude)",
  };
  return { banco, fake, deps, pedido };
}

const linhaAlheia = (extra: Partial<ArquivoOportunidadeFake> = {}): ArquivoOportunidadeFake => ({
  id: "00000000-0000-4000-8000-0000000000f1",
  empresa_id: OUTRA,
  oportunidade_id: OP,
  nome: "Alheio.pdf",
  url: `anexos-oportunidade/${OUTRA}/2026/10/z-Alheio.pdf`,
  tipo: "application/pdf",
  tamanho: 10,
  pasta: null,
  categoria: null,
  origem: "gerado:proposta:pdf",
  assinatura: "assinado",
  usuario_nome: "Outra Pessoa",
  deleted_at: null,
  ...extra,
});

test("RPC imitada: a primeira gravação cria a linha da empresa da chave", async () => {
  const { banco, deps, pedido } = montarComBanco();
  const r = await gravarNaOportunidade(deps, pedido);
  assert.equal(banco.arquivos.length, 1);
  assert.deepEqual(banco.arquivos[0], {
    id: r!.arquivo_id,
    empresa_id: E,
    oportunidade_id: OP,
    nome: "Proposta.pdf",
    url: `anexos-oportunidade/${E}/2026/10/u1-Proposta.pdf`,
    tipo: "application/pdf",
    tamanho: PDF.length,
    pasta: "Envelope 01 – Proposta",
    categoria: null,
    origem: "gerado:proposta:pdf",
    assinatura: "pendente",
    usuario_nome: "Usuário Teste (via Claude)",
    deleted_at: null,
  });
  assert.equal(r!.substituiu, false);
  assert.equal(r!.mantido_assinado, false);
});

test("RPC imitada: a mesma origem troca o arquivo no lugar e exclui o texto por página dele", async () => {
  const { banco, fake, deps, pedido } = montarComBanco();
  const primeira = await gravarNaOportunidade(deps, pedido);
  const outro = await gravarNaOportunidade(deps, { ...pedido, origem: "gerado:cronograma:pdf" });
  const antes = "2026-10-01T00:00:00.000Z";
  banco.paginasTexto.push(
    { id: "p1", empresa_id: E, arquivo_id: primeira!.arquivo_id, deleted_at: null },
    { id: "p2", empresa_id: E, arquivo_id: primeira!.arquivo_id, deleted_at: null },
    { id: "p3", empresa_id: E, arquivo_id: primeira!.arquivo_id, deleted_at: antes },
    { id: "p4", empresa_id: E, arquivo_id: outro!.arquivo_id, deleted_at: null },
    // linha de outra empresa com o mesmo arquivo_id: a RPC filtra pela empresa
    { id: "p5", empresa_id: OUTRA, arquivo_id: primeira!.arquivo_id, deleted_at: null }
  );

  const segunda = await gravarNaOportunidade(deps, {
    ...pedido,
    nome: "Proposta v2.pdf",
    bytes: PDF2,
    assinatura: null,
  });

  assert.equal(segunda!.arquivo_id, primeira!.arquivo_id);
  assert.equal(segunda!.substituiu, true);
  assert.equal(banco.arquivos.length, 2);
  const linha = banco.arquivos.find((a) => a.id === primeira!.arquivo_id)!;
  assert.equal(linha.nome, "Proposta v2.pdf");
  assert.equal(linha.url, segunda!.ref);
  assert.equal(linha.tamanho, PDF2.length);
  assert.equal(linha.assinatura, null);
  assert.equal(linha.deleted_at, null);
  // o objeto da versão antiga saiu do Storage; o novo ficou
  assert.equal(fake.objetos.has(primeira!.ref), false);
  assert.deepEqual(fake.objetos.get(segunda!.ref), PDF2);
  // páginas de texto: só as vivas do arquivo trocado, desta empresa
  const pagina = (id: string) => banco.paginasTexto.find((p) => p.id === id)!.deleted_at;
  assert.equal(pagina("p1"), AGORA.toISOString());
  assert.equal(pagina("p2"), AGORA.toISOString());
  assert.equal(pagina("p3"), antes);
  assert.equal(pagina("p4"), null);
  assert.equal(pagina("p5"), null);
  // a outra linha da oportunidade não mudou
  assert.equal(banco.arquivos.find((a) => a.id === outro!.arquivo_id)!.url, outro!.ref);
});

test("RPC imitada: arquivo assinado é mantido; nada muda, o texto fica e o objeto novo é removido", async () => {
  const { banco, fake, deps, pedido } = montarComBanco();
  const primeira = await gravarNaOportunidade(deps, pedido);
  banco.arquivos[0].assinatura = "assinado";
  banco.paginasTexto.push({
    id: "p1",
    empresa_id: E,
    arquivo_id: primeira!.arquivo_id,
    deleted_at: null,
  });
  const antes = structuredClone(banco);

  const r = await gravarNaOportunidade(deps, { ...pedido, bytes: PDF2, nome: "Proposta v2.pdf" });

  assert.deepEqual(r, {
    arquivo_id: primeira!.arquivo_id,
    nome: "Proposta v2.pdf",
    ref: "",
    tamanho: 0,
    substituiu: false,
    mantido_assinado: true,
  });
  assert.deepEqual(banco, antes);
  assert.deepEqual(fake.objetos.get(primeira!.ref), PDF);
  assert.equal(fake.objetos.size, 1);
});

test("RPC imitada: a busca pela origem inclui a empresa (linha de outra empresa não vale)", async () => {
  // oportunidade_id não tem chave estrangeira: uma linha de OUTRA empresa pode apontar para a oportunidade
  // desta, com a mesma origem e até assinada; ela não pode trocar, travar nem "manter" a gravação de E
  const alheia = linhaAlheia();
  const { banco, deps, pedido } = montarComBanco({ arquivos: [alheia] });
  const r = await gravarNaOportunidade(deps, pedido);
  assert.equal(r!.mantido_assinado, false);
  assert.equal(r!.substituiu, false);
  assert.notEqual(r!.arquivo_id, alheia.id);
  assert.equal(banco.arquivos.length, 2);
  assert.deepEqual(banco.arquivos[0], linhaAlheia());
  assert.equal(banco.arquivos[1].empresa_id, E);
});

test("RPC imitada: linha excluída (deleted_at) não conta; outra oportunidade e outra origem também não", async () => {
  const OP2 = "00000000-0000-4000-8000-000000000011";
  const base = linhaAlheia({ empresa_id: E, assinatura: null });
  const { banco, deps, pedido } = montarComBanco({
    oportunidades: [
      { id: OP, empresa_id: E, deleted_at: null },
      { id: OP2, empresa_id: E, deleted_at: null },
    ],
    arquivos: [
      { ...base, id: "x1", deleted_at: "2026-09-01T00:00:00.000Z" },
      { ...base, id: "x2", oportunidade_id: OP2 },
      { ...base, id: "x3", origem: "gerado:cronograma:pdf" },
    ],
  });
  const r = await gravarNaOportunidade(deps, pedido);
  assert.equal(r!.substituiu, false);
  assert.equal(banco.arquivos.length, 4);
  assert.equal(banco.arquivos.filter((a) => a.id.startsWith("x")).length, 3);
  assert.equal(banco.arquivos.find((a) => a.id === "x1")!.deleted_at, "2026-09-01T00:00:00.000Z");
});

test("RPC imitada: oportunidade de outra empresa, excluída ou inexistente → null, sem linha e sem objeto", async () => {
  const casos = [
    { id: OP, empresa_id: OUTRA, deleted_at: null },
    { id: OP, empresa_id: E, deleted_at: "2026-09-01T00:00:00.000Z" },
  ];
  for (const op of casos) {
    const { banco, fake, deps, pedido } = montarComBanco({ oportunidades: [op] });
    assert.equal(await gravarNaOportunidade(deps, pedido), null);
    assert.equal(banco.arquivos.length, 0);
    assert.equal(fake.objetos.size, 0);
  }
  const sem = montarComBanco({ oportunidades: [] });
  assert.equal(await gravarNaOportunidade(sem.deps, sem.pedido), null);
  assert.equal(sem.banco.arquivos.length, 0);
  assert.equal(sem.fake.objetos.size, 0);
});

test("RPC imitada: ref_anterior adulterada na tela não faz o servidor apagar objeto alheio", async () => {
  const alvo = `anexos-oportunidade/${OUTRA}/2026/09/dado-alheio.pdf`;
  const adulterada = linhaAlheia({
    empresa_id: E,
    assinatura: null,
    url: alvo,
    origem: "gerado:proposta:pdf",
  });
  const { banco, fake, deps, pedido } = montarComBanco({ arquivos: [adulterada] });
  fake.objetos.set(alvo, PDF);
  const r = await gravarNaOportunidade(deps, pedido);
  assert.equal(r!.substituiu, true);
  assert.equal(banco.arquivos[0].url, r!.ref);
  assert.equal(fake.objetos.has(alvo), true);
  assert.equal(removeu(fake).length, 0);
});

test("RPC imitada: recusa o que a função do banco recusa (22023) e o objeto enviado é removido", async () => {
  const base = {
    p_oportunidade_id: OP,
    p_origem: "gerado:proposta:pdf",
    p_nome: "Proposta.pdf",
    p_url: `anexos-oportunidade/${E}/2026/10/u-Proposta.pdf`,
    p_tipo: "application/pdf",
    p_tamanho: 10,
    p_pasta: null,
    p_categoria: null,
    p_assinatura: null,
    p_usuario_nome: "U",
  };
  const recusas: [string, Record<string, unknown>, RegExp][] = [
    ["oportunidade nula", { p_oportunidade_id: null }, /obrigatórias/],
    ["origem só com espaço", { p_origem: " \t\n" }, /origem inválida/],
    ["origem nula", { p_origem: null }, /origem inválida/],
    ["origem com 201 caracteres", { p_origem: "o".repeat(201) }, /origem inválida/],
    ["nome só com espaço", { p_nome: "\n \t" }, /nome inválido/],
    ["url de outra empresa", { p_url: `anexos-oportunidade/${OUTRA}/a.pdf` }, /fora da pasta/],
    ["url de outro bucket", { p_url: `habilitacao/${E}/a.pdf` }, /fora da pasta/],
    ["url só com a pasta", { p_url: `anexos-oportunidade/${E}/` }, /fora da pasta/],
    ["url nula", { p_url: null }, /fora da pasta/],
    [
      "url com segmento ..",
      { p_url: `anexos-oportunidade/${E}/../${OUTRA}/a.pdf` },
      /fora da pasta/,
    ],
    ["url com segmento .", { p_url: `anexos-oportunidade/${E}/./a.pdf` }, /fora da pasta/],
    ["url terminando em ..", { p_url: `anexos-oportunidade/${E}/a/..` }, /fora da pasta/],
    ["assinatura assinado", { p_assinatura: "assinado" }, /assinatura inválida/],
    ["assinatura qualquer", { p_assinatura: "ok" }, /assinatura inválida/],
  ];
  for (const [rotulo, troca, mensagem] of recusas) {
    const { banco, deps } = montarComBanco();
    await assert.rejects(
      () => deps.db.rpc("conector_gravar_arquivo", { ...base, ...troca }),
      (e: unknown) => e instanceof ErroCamada && e.codigo === "banco" && mensagem.test(e.message),
      rotulo
    );
    assert.equal(banco.arquivos.length, 0, rotulo);
  }
  // pontos seguidos DENTRO de um nome não são segmento: passam
  const ok = montarComBanco();
  const r = await ok.deps.db.rpc<{ ok: boolean }>("conector_gravar_arquivo", {
    ...base,
    p_url: `anexos-oportunidade/${E}/2026/10/u-Empresa_Ltda..pdf`,
  });
  assert.equal(r.ok, true);
  assert.equal(ok.banco.arquivos.length, 1);

  // de ponta a ponta: nome só com espaço no pedido → a RPC recusa e o objeto enviado sai do Storage
  const fim = montarComBanco();
  await assert.rejects(
    () => gravarNaOportunidade(fim.deps, { ...fim.pedido, nome: "   " }),
    /nome inválido/
  );
  assert.equal(fim.banco.arquivos.length, 0);
  assert.equal(fim.fake.objetos.size, 0);
  assert.equal(removeu(fim.fake).length, 1);
});
