// node --test supabase/functions/_shared/conector/arquivo-servidor.test.ts
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  TIPOS_DOCUMENTO_BIBLIOTECA,
  TIPOS_EDITAL,
  tipoPelosBytesServidor,
} from "./arquivo-servidor.ts";
import { camadaDaEmpresa, ErroCamada, storageDaEmpresa } from "./camada-empresa.ts";
import {
  criarBancoArquivosFake,
  criarFakeAdmin,
  imitarGravarArquivo,
  PARAMETROS_GRAVAR_ARQUIVO,
  type ArquivoOportunidadeFake,
  type ChamadaFake,
  type ChamadaStorageFake,
  type RespostaFake,
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
  responderStorage?: RespostaStorage,
  outros?: (c: ChamadaFake) => RespostaFake | undefined // as demais consultas (tabelas), se o teste quiser
) {
  const fake = criarFakeAdmin((c: ChamadaFake) => {
    if (c.tabela !== "conector_gravar_arquivo") return outros?.(c);
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

  // de ponta a ponta: a RPC recusa e o objeto enviado sai do Storage. O gatilho aqui era o nome só com
  // espaço; ele agora é recusado ANTES do envio (testes "nome sem caractere visível"), então a recusa
  // que sobra para a RPC é a de uma assinatura que o pedido tipado não deixa passar, mas o banco confere
  const fim = montarComBanco();
  await assert.rejects(
    () => gravarNaOportunidade(fim.deps, { ...fim.pedido, assinatura: "assinado" as "pendente" }),
    /assinatura inválida/
  );
  assert.equal(fim.banco.arquivos.length, 0);
  assert.equal(fim.fake.objetos.size, 0);
  assert.equal(removeu(fim.fake).length, 1);
});

// ═══ Correção da revisão 1 ═══════════════════════════════════════════════════════════════

// ─── nomeParaExibir: invisíveis, par substituto e nome vazio ────────────────────────────

// sempre escapes \u… (o caractere cru no fonte é invisível e some na revisão)
const INVISIVEIS = [
  "\u200B",
  "\u200C",
  "\u200D",
  "\u200E",
  "\u200F",
  "\u202A",
  "\u202B",
  "\u202C",
  "\u202D",
  "\u202E",
  "\u2060",
  "\u2066",
  "\u2067",
  "\u2068",
  "\u2069",
  "\uFEFF",
];

test("nomeParaExibir: remove os caracteres de formato invisíveis e bidi (sem deixar espaço no lugar)", () => {
  for (const c of INVISIVEIS) {
    const cod = c.codePointAt(0)!.toString(16).toUpperCase();
    assert.equal(nomeParaExibir(`CND${c}Federal.pdf`), "CNDFederal.pdf", `U+${cod}`);
    assert.equal(nomeParaExibir(`${c}CND Federal.pdf${c}`), "CND Federal.pdf", `U+${cod}`);
  }
  // o truque do RLO: o nome mostrado não pode esconder a extensão de verdade
  assert.equal(nomeParaExibir("fatura\u202Efdp.exe"), "faturafdp.exe");
  // espaço comum continua, e os espaços que o \s já cobre continuam virando um só
  assert.equal(nomeParaExibir("CND\u200B  \u200BFederal"), "CND Federal");
  assert.equal(nomeParaExibir("CND\u00A0Federal"), "CND Federal");
});

test("arquivo-servidor.ts não tem caractere de formato invisível cru no fonte, só escapes", () => {
  const fonte = readFileSync(new URL("./arquivo-servidor.ts", import.meta.url), "utf8");
  assert.equal(/[\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/.test(fonte), false);
  assert.match(fonte, /\\u200B-\\u200F/i);
  assert.match(fonte, /\\u202A-\\u202E/i);
});

/** Texto sem par substituto (surrogate) solto: o que String.prototype.isWellFormed diz no Node novo. */
function bemFormada(texto: string): boolean {
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const d = texto.charCodeAt(i + 1);
      if (!(d >= 0xdc00 && d <= 0xdfff)) return false;
      i++;
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      return false;
    }
  }
  return true;
}

test("nomeParaExibir: o corte nos 150 caracteres não parte um par substituto", () => {
  const emoji = "\u{1F600}";
  assert.equal(bemFormada(emoji), true);
  assert.equal(bemFormada(emoji.slice(0, 1)), false); // o auxiliar enxerga o par partido
  // sem extensão: o corte em 150 cairia no meio do 75º emoji se o nome começasse com 1 caractere
  const semExt = nomeParaExibir(`a${emoji.repeat(300)}`);
  assert.ok(bemFormada(semExt), "sem extensão");
  assert.ok(semExt.length <= 150);
  assert.equal(semExt.length, 149);
  // com extensão: o corte vai a 146 (150 − ".pdf") e cairia no meio de um par
  const comExt = nomeParaExibir(`a${emoji.repeat(300)}.pdf`);
  assert.ok(bemFormada(comExt), "com extensão");
  assert.ok(comExt.endsWith(".pdf"));
  assert.equal(comExt.length, 149);
  // corte que cai entre pares: não perde nada além do necessário
  const par = nomeParaExibir(`${emoji.repeat(300)}.pdf`);
  assert.ok(bemFormada(par));
  assert.equal(par.length, 150);
  // nome curto e com par substituto: intacto
  assert.equal(nomeParaExibir(`Certidão ${emoji}.pdf`), `Certidão ${emoji}.pdf`);
  // caractere comum continua sendo cortado em exatamente 150
  assert.equal(nomeParaExibir("x".repeat(400)).length, 150);
});

test("nomeParaExibir: nome que fica vazio vira 'arquivo' (mais a extensão, se sobrou)", () => {
  for (const vazio of ["", "   ", "\n\t", "\u200B\u200B", "\u202E\uFEFF \u2060", null, undefined]) {
    assert.equal(nomeParaExibir(vazio as string), "arquivo", JSON.stringify(vazio));
  }
  assert.equal(nomeParaExibir("\u200B.pdf"), "arquivo.pdf");
  assert.equal(nomeParaExibir(" \n.PDF "), "arquivo.pdf");
  assert.equal(nomeParaExibir(".xlsx"), "arquivo.xlsx");
  // o que tem algo visível não é tocado
  assert.equal(nomeParaExibir(".gitignore"), ".gitignore");
  assert.equal(nomeParaExibir("CND"), "CND");
  assert.equal(nomeParaExibir("///"), "---");
  assert.equal(nomeParaExibir("-.pdf"), "-.pdf");
});

// ─── tipoPelosBytesServidor com a lista de tipos permitidos ─────────────────────────────

test("tipoPelosBytesServidor: 3º parâmetro restringe os tipos; sem ele, igual a antes", () => {
  const zip = b(0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0);
  const jpg = b(0xff, 0xd8, 0xff, 0xe0);
  const png = b(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  const ole = b(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
  const html = new TextEncoder().encode("<!DOCTYPE html>");

  assert.equal(tipoPelosBytesServidor(PDF, "a.pdf", ["pdf"]), "pdf");
  assert.equal(tipoPelosBytesServidor(PDF, "a.pdf", ["jpg", "png"]), null);
  assert.equal(tipoPelosBytesServidor(PDF, "a.pdf", []), null); // lista informada e vazia: nada vale
  assert.equal(tipoPelosBytesServidor(zip, "Decl.docx", ["docx"]), "docx");
  assert.equal(tipoPelosBytesServidor(zip, "Decl.docx", ["zip"]), null); // detectado docx, não zip
  assert.equal(tipoPelosBytesServidor(zip, "x.zip", ["docx", "xlsx"]), null);
  assert.equal(tipoPelosBytesServidor(ole, "x.doc", ["doc", "xls"]), "doc");
  assert.equal(tipoPelosBytesServidor(ole, "x.doc", ["pdf"]), null);
  // o que os bytes não identificam continua null, com ou sem a lista
  assert.equal(tipoPelosBytesServidor(html, "Edital.pdf", ["pdf"]), null);
  assert.equal(tipoPelosBytesServidor(new Uint8Array(0), "x.pdf", ["pdf"]), null);

  // sem o parâmetro (ou undefined), o comportamento é o de sempre
  for (const [bytes, nome, esperado] of [
    [PDF, "a.pdf", "pdf"],
    [zip, "Planilha.xlsx", "xlsx"],
    [zip, "sem-extensao", "zip"],
    [ole, "x.xls", "xls"],
    [jpg, "foto.jpg", "jpg"],
    [png, "x.png", "png"],
    [html, "Edital.pdf", null],
  ] as const) {
    assert.equal(tipoPelosBytesServidor(bytes, nome), esperado, nome);
    assert.equal(tipoPelosBytesServidor(bytes, nome, undefined), esperado, nome);
  }

  // as duas listas das próximas tasks
  assert.deepEqual([...TIPOS_DOCUMENTO_BIBLIOTECA], ["pdf", "jpg", "png"]);
  assert.deepEqual([...TIPOS_EDITAL], ["pdf", "docx", "doc", "xlsx", "xls", "zip"]);
  assert.equal(tipoPelosBytesServidor(jpg, "foto.jpg", TIPOS_DOCUMENTO_BIBLIOTECA), "jpg");
  assert.equal(tipoPelosBytesServidor(png, "x.png", TIPOS_DOCUMENTO_BIBLIOTECA), "png");
  assert.equal(tipoPelosBytesServidor(zip, "x.docx", TIPOS_DOCUMENTO_BIBLIOTECA), null);
  assert.equal(tipoPelosBytesServidor(zip, "x.zip", TIPOS_DOCUMENTO_BIBLIOTECA), null);
  assert.equal(tipoPelosBytesServidor(jpg, "foto.jpg", TIPOS_EDITAL), null);
  assert.equal(tipoPelosBytesServidor(zip, "x.docx", TIPOS_EDITAL), "docx");
  assert.equal(tipoPelosBytesServidor(zip, "x.zip", TIPOS_EDITAL), "zip");
  assert.equal(tipoPelosBytesServidor(ole, "x.xls", TIPOS_EDITAL), "xls");
  // as listas não mudam por baixo de quem importa
  assert.ok(Object.isFrozen(TIPOS_DOCUMENTO_BIBLIOTECA));
  assert.ok(Object.isFrozen(TIPOS_EDITAL));
});

// ─── caminhoDaEmpresa e storageDaEmpresa dizem o mesmo ──────────────────────────────────

test("caminhoDaEmpresa e storageDaEmpresa concordam sobre o que é da pasta da empresa (maiúsculas incluídas)", async () => {
  const EA = "0000000a-0000-4000-8000-00000000000b"; // com letras: a caixa muda de verdade
  assert.notEqual(EA, EA.toUpperCase());
  const fake = criarFakeAdmin();
  const s = storageDaEmpresa(fake.storage, EA).from("b");
  const casos = [
    `${EA}/a.pdf`,
    `${EA.toUpperCase()}/a.pdf`,
    `${EA}/2026/10/u-a.pdf`,
    `${EA}/Empresa_Ltda..pdf`,
    `${OUTRA}/a.pdf`,
    `${EA}0/a.pdf`,
    `x/${EA}/a.pdf`,
    `${EA}/../${OUTRA}/a.pdf`,
    `${EA}/./a.pdf`,
    `${EA}//a.pdf`,
    `${EA}/a/..`,
    `${EA}/a%2e.pdf`,
    `${EA}/a?x=1`,
    `${EA}/a#x`,
    `${EA}\\a.pdf`,
    `${EA}/`,
    EA,
    `/${EA}/a.pdf`,
    "",
  ];
  for (const c of casos) {
    const pelaRef = caminhoDaEmpresa(`b/${c}`, "b", EA) !== null;
    let peloStorage = true;
    try {
      await s.download(c);
    } catch {
      peloStorage = false;
    }
    assert.equal(peloStorage, pelaRef, JSON.stringify(c));
  }
  // e a regra de maiúsculas funciona de verdade nos dois
  assert.equal(
    caminhoDaEmpresa(`b/${EA.toUpperCase()}/a.pdf`, "b", EA),
    `${EA.toUpperCase()}/a.pdf`
  );
  assert.equal(caminhoDaEmpresa(`b/${EA}/a.pdf`, "b", EA.toUpperCase()), `${EA}/a.pdf`);
});

// ─── gravarNaOportunidade: valida nome e origem ANTES de enviar ─────────────────────────

test("gravarNaOportunidade: nome sem caractere visível lança antes de enviar qualquer byte", async () => {
  for (const nome of [
    "",
    "   ",
    "\n\t ",
    "\u200B",
    "\u202E\uFEFF",
    " \u2060 ",
    null,
    undefined,
    7,
  ]) {
    const { fake, deps, pedido } = montar(GRAVOU);
    await assert.rejects(
      () => gravarNaOportunidade(deps, { ...pedido, nome: nome as string }),
      /nome inválido/,
      JSON.stringify(nome)
    );
    assert.equal(fake.chamadasStorage.length, 0, JSON.stringify(nome));
    assert.equal(fake.chamadas.length, 0, JSON.stringify(nome));
    assert.equal(fake.objetos.size, 0, JSON.stringify(nome));
  }
});

test("gravarNaOportunidade: origem vazia, só com espaço, acima de 200 ou que não é texto lança antes de enviar", async () => {
  for (const origem of ["", "  ", "\t\n", "o".repeat(201), "o".repeat(1000), null, undefined, 42]) {
    const { fake, deps, pedido } = montar(GRAVOU);
    await assert.rejects(
      () => gravarNaOportunidade(deps, { ...pedido, origem: origem as string }),
      /origem inválida/,
      JSON.stringify(origem)?.slice(0, 20)
    );
    assert.equal(fake.chamadasStorage.length, 0);
    assert.equal(fake.chamadas.length, 0);
    assert.equal(fake.objetos.size, 0);
  }
});

test("gravarNaOportunidade: com 200 caracteres a origem passa, e o nome gravado é o que o chamador passou", async () => {
  const origem = "o".repeat(200);
  const nome = "  CND\u200B  Federal.pdf ";
  const { fake, deps, pedido } = montar(GRAVOU);
  const r = await gravarNaOportunidade(deps, { ...pedido, origem, nome });
  assert.equal(r?.nome, nome); // só valida, não transforma
  const rpc = fake.chamadas.find((c) => c.tabela === "conector_gravar_arquivo")!;
  assert.equal((rpc.payload as Record<string, unknown>).p_nome, nome);
  assert.equal((rpc.payload as Record<string, unknown>).p_origem, origem);
  assert.equal(fake.objetos.size, 1);
});

// ─── gravarNaOportunidade: a versão anterior só sai se nenhuma outra linha usa a ref ────

const ANTERIOR = `${E}/2026/09/velho-CND.pdf`;
const REF_ANTERIOR = `anexos-oportunidade/${ANTERIOR}`;
const TROCOU = { ...GRAVOU, substituiu: true, ref_anterior: REF_ANTERIOR };
const consultasDeUso = (fake: { chamadas: ChamadaFake[] }) =>
  fake.chamadas.filter((c) => c.tabela === "arquivo_oportunidade");

test("gravarNaOportunidade: ref anterior em uso por OUTRA linha viva da empresa → o objeto NÃO é removido", async () => {
  const { fake, deps, pedido } = montar(TROCOU, undefined, (c) =>
    c.tabela === "arquivo_oportunidade" ? { data: [{ id: "outra-linha" }] } : undefined
  );
  fake.objetos.set(REF_ANTERIOR, PDF);
  const r = await gravarNaOportunidade(deps, pedido);
  assert.equal(r?.substituiu, true);
  assert.equal(removeu(fake).length, 0);
  assert.equal(fake.objetos.has(REF_ANTERIOR), true);
  assert.equal(fake.objetos.has(r!.ref), true);
  // a pergunta é feita pela camada: empresa, não excluída, mesma url
  const [consulta] = consultasDeUso(fake);
  assert.equal(consulta.op, "select");
  assert.equal(consulta.colunas, "id");
  assert.deepEqual(
    consulta.filtros.map((f) => [f.metodo, ...f.args]),
    [
      ["eq", "empresa_id", E],
      ["is", "deleted_at", null],
      ["eq", "url", REF_ANTERIOR],
      ["limit", 1],
    ]
  );
});

test("gravarNaOportunidade: ref anterior sem outra linha usando → o objeto é removido (e a pergunta é uma só)", async () => {
  const { fake, deps, pedido } = montar(TROCOU, undefined, (c) =>
    c.tabela === "arquivo_oportunidade" ? { data: [] } : undefined
  );
  fake.objetos.set(REF_ANTERIOR, PDF);
  const r = await gravarNaOportunidade(deps, pedido);
  assert.equal(r?.substituiu, true);
  assert.deepEqual(
    removeu(fake).map((c) => [c.bucket, c.args[0]]),
    [[BUCKET_OPORTUNIDADE, [ANTERIOR]]]
  );
  assert.equal(fake.objetos.has(REF_ANTERIOR), false);
  assert.equal(consultasDeUso(fake).length, 1);
});

test("gravarNaOportunidade: falha ao perguntar quem usa a ref (erro ou exceção) → não remove, só log, e a gravação vale", async () => {
  const log = mock.method(console, "error", () => {});
  try {
    const falhas: [string, (c: ChamadaFake) => RespostaFake | undefined][] = [
      ["erro", () => ({ error: { message: "timeout no banco" } })],
      [
        "exceção",
        () => {
          throw new Error("timeout no banco");
        },
      ],
    ];
    for (const [rotulo, falha] of falhas) {
      log.mock.resetCalls();
      const { fake, deps, pedido } = montar(TROCOU, undefined, (c) =>
        c.tabela === "arquivo_oportunidade" ? falha(c) : undefined
      );
      fake.objetos.set(REF_ANTERIOR, PDF);
      const r = await gravarNaOportunidade(deps, pedido);
      assert.equal(r?.substituiu, true, rotulo);
      assert.equal(r?.arquivo_id, ARQ, rotulo);
      assert.equal(removeu(fake).length, 0, rotulo);
      assert.equal(fake.objetos.has(REF_ANTERIOR), true, rotulo);
      assert.equal(log.mock.callCount(), 1, rotulo);
      assert.match(String(log.mock.calls[0].arguments.join(" ")), /timeout no banco/, rotulo);
    }
  } finally {
    log.mock.restore();
  }
});

test("gravarNaOportunidade: ref anterior inválida ou sem troca nem chega a perguntar ao banco", async () => {
  const casos: Record<string, unknown>[] = [
    { ...GRAVOU, substituiu: true, ref_anterior: `anexos-oportunidade/${OUTRA}/x.pdf` },
    { ...GRAVOU, substituiu: true, ref_anterior: null },
    { ...GRAVOU, substituiu: false, ref_anterior: REF_ANTERIOR },
    { ...GRAVOU, mantido_assinado: true, ref_anterior: REF_ANTERIOR },
  ];
  for (const resposta of casos) {
    const { fake, deps, pedido } = montar(resposta);
    await gravarNaOportunidade(deps, pedido);
    assert.equal(consultasDeUso(fake).length, 0, JSON.stringify(resposta));
  }
});

// ─── gravarNaOportunidade: remover que LANÇA (e não só que devolve erro) ────────────────

test("gravarNaOportunidade: um remove que lança não vira erro da gravação nem mascara o erro da RPC", async () => {
  const log = mock.method(console, "error", () => {});
  try {
    const lancaNoRemove: RespostaStorage = (c) => {
      if (c.metodo === "remove") throw new Error("rede caiu no remove");
      return undefined;
    };
    const apenasUmLog = () => {
      assert.equal(log.mock.callCount(), 1);
      assert.match(String(log.mock.calls[0].arguments.join(" ")), /rede caiu no remove/);
      log.mock.resetCalls();
    };

    // o erro original da RPC é o que sai (e a falha do remove vai ao log)
    const rpc = montar({ erro: "boom" }, lancaNoRemove);
    await assert.rejects(
      () => gravarNaOportunidade(rpc.deps, rpc.pedido),
      (e: unknown) =>
        e instanceof ErroCamada && /boom/.test(e.message) && !/rede caiu/.test(e.message)
    );
    apenasUmLog();

    // resposta inesperada da RPC: o erro é o da resposta
    const inesperada = montar({ ok: false, motivo: "outro" }, lancaNoRemove);
    await assert.rejects(
      () => gravarNaOportunidade(inesperada.deps, inesperada.pedido),
      /resposta inesperada/
    );
    apenasUmLog();

    // oportunidade não encontrada continua null
    const nao = montar({ ok: false, motivo: "nao_encontrada" }, lancaNoRemove);
    assert.equal(await gravarNaOportunidade(nao.deps, nao.pedido), null);
    apenasUmLog();

    // assinado mantido: a gravação (a resposta "mantido") vale
    const mantido = montar({ ...GRAVOU, mantido_assinado: true }, lancaNoRemove);
    const m = await gravarNaOportunidade(mantido.deps, mantido.pedido);
    assert.equal(m?.mantido_assinado, true);
    apenasUmLog();

    // troca: o objeto anterior fica órfão, mas a gravação vale
    const troca = montar(TROCOU, lancaNoRemove);
    troca.fake.objetos.set(REF_ANTERIOR, PDF);
    const t = await gravarNaOportunidade(troca.deps, troca.pedido);
    assert.equal(t?.substituiu, true);
    assert.equal(t?.arquivo_id, ARQ);
    assert.equal(troca.fake.objetos.has(t!.ref), true);
    apenasUmLog();
  } finally {
    log.mock.restore();
  }
});

// ─── gravarNaOportunidade: colisão de caminho, 50 MB exatos e limite de baixarObjeto ────

test("gravarNaOportunidade: caminho que já existe (upsert false) lança 'storage', preserva o objeto e não chama a RPC", async () => {
  const { fake, deps, pedido } = montar(GRAVOU);
  const existente = `anexos-oportunidade/${E}/2026/10/uuid1-CND_Federal.pdf`; // o que o uuid1 geraria
  fake.objetos.set(existente, PDF2);
  await assert.rejects(
    () => gravarNaOportunidade(deps, pedido),
    (e: unknown) =>
      e instanceof ErroArquivo && e.codigo === "storage" && /already exists/.test(e.message)
  );
  // o objeto que já estava lá segue intacto e nada foi apagado
  assert.deepEqual(fake.objetos.get(existente), PDF2);
  assert.equal(fake.objetos.size, 1);
  assert.equal(removeu(fake).length, 0);
  assert.equal(fake.chamadas.length, 0); // a RPC nem foi chamada
  const envio = fake.chamadasStorage.find((c) => c.metodo === "upload")!;
  assert.deepEqual(envio.args[2], { contentType: "application/pdf", upsert: false });
});

test("gravarNaOportunidade: exatamente 52428800 bytes (50 MB) é aceito", async () => {
  const { fake, deps, pedido } = montar(GRAVOU);
  const justo = new Uint8Array(LIMITE_ARQUIVO_SERVIDOR);
  const r = await gravarNaOportunidade(deps, { ...pedido, bytes: justo });
  assert.equal(r?.tamanho, 52428800);
  assert.equal(fake.objetos.get(r!.ref)?.length, 52428800);
  const rpc = fake.chamadas.find((c) => c.tabela === "conector_gravar_arquivo")!;
  assert.equal((rpc.payload as Record<string, unknown>).p_tamanho, 52428800);
});

test("baixarObjeto: o limite é inclusivo (igual passa; um a mais lança grande_demais)", async () => {
  const grande = (e: unknown) => e instanceof ErroArquivo && e.codigo === "grande_demais";
  const fake = criarFakeAdmin();
  fake.objetos.set(`habilitacao/${E}/cinco.pdf`, new Uint8Array(5));
  fake.objetos.set(`habilitacao/${E}/seis.pdf`, new Uint8Array(6));
  const lido = await baixarObjeto(fake.storage, "habilitacao", `${E}/cinco.pdf`, 5);
  assert.equal(lido.length, 5);
  await assert.rejects(() => baixarObjeto(fake.storage, "habilitacao", `${E}/seis.pdf`, 5), grande);

  // o limite padrão é o de 50 MB: o arquivo de exatamente 50 MB passa, e com um byte a menos de limite não
  fake.objetos.set(`habilitacao/${E}/justo.pdf`, new Uint8Array(LIMITE_ARQUIVO_SERVIDOR));
  const justo = await baixarObjeto(fake.storage, "habilitacao", `${E}/justo.pdf`);
  assert.equal(justo.length, 52428800);
  await assert.rejects(
    () => baixarObjeto(fake.storage, "habilitacao", `${E}/justo.pdf`, LIMITE_ARQUIVO_SERVIDOR - 1),
    grande
  );

  // 50 MB + 1: recusa pelo tamanho, sem ler o conteúdo
  const grandeDemais = criarFakeAdmin(undefined, (c) =>
    c.metodo === "download"
      ? {
          data: {
            size: LIMITE_ARQUIVO_SERVIDOR + 1,
            arrayBuffer: async () => {
              throw new Error("não devia ler");
            },
          },
        }
      : undefined
  );
  await assert.rejects(
    () => baixarObjeto(grandeDemais.storage, "habilitacao", `${E}/enorme.pdf`),
    grande
  );
});

// ─── A RPC imitada confere o CONJUNTO de parâmetros (PostgREST: PGRST202) ───────────────

const PARAMS_COMPLETOS = {
  p_empresa_id: E,
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

test("RPC imitada: os 11 parâmetros da função SQL, exatamente; a mais, a menos ou com nome errado → PGRST202", async () => {
  assert.deepEqual([...PARAMETROS_GRAVAR_ARQUIVO].sort(), Object.keys(PARAMS_COMPLETOS).sort());
  assert.equal(PARAMETROS_GRAVAR_ARQUIVO.length, 11);

  const banco = criarBancoArquivosFake({
    oportunidades: [{ id: OP, empresa_id: E, deleted_at: null }],
  });
  const fake = criarFakeAdmin(imitarGravarArquivo(banco));
  const chamar = (params: Record<string, unknown>) =>
    fake.admin.rpc("conector_gravar_arquivo", params);

  // os 11: passa
  const ok = await chamar(PARAMS_COMPLETOS);
  assert.equal(ok.error, null);
  assert.equal(ok.data.ok, true);
  assert.equal(banco.arquivos.length, 1);

  const semUm = (nome: string) => {
    const { [nome]: _fora, ...resto } = PARAMS_COMPLETOS as Record<string, unknown>;
    return resto;
  };
  const casos: [string, Record<string, unknown>][] = [
    ["um a mais", { ...PARAMS_COMPLETOS, p_extra: 1 }],
    ["um a mais (do front)", { ...PARAMS_COMPLETOS, p_pasta_id: "x" }],
    ["sem p_empresa_id", semUm("p_empresa_id")],
    ["sem p_pasta", semUm("p_pasta")],
    ["sem p_usuario_nome", semUm("p_usuario_nome")],
    ["sem p_assinatura", semUm("p_assinatura")],
    ["nome errado (p_usuario)", { ...semUm("p_usuario_nome"), p_usuario: "U" }],
    ["nome errado (sem o prefixo p_)", { ...semUm("p_url"), url: "x" }],
    ["nome com outra caixa", { ...semUm("p_nome"), P_NOME: "x" }],
    ["vazio", {}],
  ];
  for (const [rotulo, params] of casos) {
    const antes: number = banco.arquivos.length;
    const r = await chamar(params);
    assert.equal(r.data, null, rotulo);
    assert.equal(r.error?.code, "PGRST202", rotulo);
    assert.match(
      r.error?.message,
      /Could not find the function public\.conector_gravar_arquivo\(/,
      rotulo
    );
    assert.equal(banco.arquivos.length, antes, rotulo); // nada gravado
  }

  // pela camada (que injeta o p_empresa_id): a mais e a menos viram ErroCamada('banco') com a mensagem do banco
  const db = camadaDaEmpresa(fake.admin, E);
  const { p_empresa_id: _e, ...dez } = PARAMS_COMPLETOS;
  await assert.rejects(
    () => db.rpc("conector_gravar_arquivo", { ...dez, p_extra: 1 }),
    (e: unknown) =>
      e instanceof ErroCamada &&
      e.codigo === "banco" &&
      /Could not find the function/.test(e.message)
  );
  const { p_pasta: _p, ...nove } = dez;
  await assert.rejects(
    () => db.rpc("conector_gravar_arquivo", nove),
    (e: unknown) =>
      e instanceof ErroCamada &&
      e.codigo === "banco" &&
      /Could not find the function/.test(e.message)
  );
  assert.equal((await db.rpc<{ ok: boolean }>("conector_gravar_arquivo", dez)).ok, true);
});

// ─── A migração 0156 e o fake não derivam em silêncio ───────────────────────────────────

test("migração 0156: a função SQL ainda tem o que o fake da RPC imita", () => {
  const sql = readFileSync(
    new URL("../../../migrations/0156_documentos_gerados.sql", import.meta.url),
    "utf8"
  ).replaceAll("\r\n", "\n");
  const inicio = sql.indexOf("create or replace function public.conector_gravar_arquivo(");
  assert.ok(inicio >= 0, "a função não está mais na 0156");
  const fim = sql.indexOf("\n$$;", inicio);
  assert.ok(fim > inicio);
  const funcao = sql.slice(inicio, fim);
  const f = funcao.replace(/\s+/g, " ");

  // os 11 nomes de parâmetro (a assinatura vai até "returns jsonb"), os mesmos que o fake exige
  const assinatura = funcao.slice(0, funcao.indexOf("returns jsonb"));
  const nomes = [...assinatura.matchAll(/^\s+(p_[a-z_]+)\s+[a-z]+/gm)].map((m) => m[1]);
  assert.equal(nomes.length, 11);
  assert.deepEqual([...nomes].sort(), [...PARAMETROS_GRAVAR_ARQUIVO].sort());

  // o que a imitação reproduz: recusas (22023), pasta da empresa, segmento "." ou "..", assinatura
  assert.match(f, /chamador_eh_servidor\(\)/);
  assert.ok(f.includes("anexos-oportunidade/"));
  assert.ok(f.includes("(^|/)\\.{1,2}(/|$)"), "regex de segmento . e ..");
  assert.ok(f.includes("p_origem !~ '\\S'") && f.includes("char_length(p_origem) > 200"));
  assert.ok(f.includes("p_nome !~ '\\S'"));
  assert.ok(f.includes("p_assinatura <> 'pendente'"));
  assert.ok(f.includes("using errcode = '22023'"));
  // a trava, a chave de busca (com a empresa) e o que acontece com o assinado e com o texto por página
  assert.equal((f.match(/for update/gi) ?? []).length, 2);
  assert.ok(
    f.includes("o.id = p_oportunidade_id and o.empresa_id = p_empresa_id and o.deleted_at is null")
  );
  assert.ok(f.includes("a.empresa_id = p_empresa_id"));
  assert.ok(f.includes("a.oportunidade_id = p_oportunidade_id"));
  assert.ok(f.includes("a.origem = p_origem"));
  assert.ok(f.includes("a.deleted_at is null"));
  assert.ok(f.includes("v_atual.assinatura = 'assinado'"));
  assert.ok(f.includes("update public.arquivo_texto_pagina set deleted_at = now()"));
  assert.ok(
    f.includes("where empresa_id = p_empresa_id and arquivo_id = v_atual.id and deleted_at is null")
  );
  // as chaves da resposta
  for (const chave of [
    "'ok'",
    "'motivo'",
    "'nao_encontrada'",
    "'arquivo_id'",
    "'substituiu'",
    "'mantido_assinado'",
    "'ref_anterior'",
  ]) {
    assert.ok(f.includes(chave), chave);
  }
  // o índice único que faz a mesma origem ser a mesma linha
  assert.match(
    sql.replace(/\s+/g, " "),
    /create unique index if not exists arquivo_oportunidade_origem_uidx on public\.arquivo_oportunidade \(empresa_id, oportunidade_id, origem\) where origem is not null and deleted_at is null/
  );
});
