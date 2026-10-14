// node --test supabase/functions/mcp/ferramentas-habilitacao.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FERRAMENTAS_HABILITACAO,
  MAX_ATESTADOS_POR_CHAMADA,
  MAX_DOCUMENTOS_POR_CHAMADA,
  sessaoFutura,
} from "./ferramentas-habilitacao.ts";
import { PASTA_HABILITACAO } from "../_shared/conector/arquivo-servidor.ts";
import { linkOportunidade } from "../_shared/conector/recurso.ts";
import {
  criarBancoArquivosFake,
  imitarGravarArquivo,
  type ArquivoOportunidadeFake,
  type ChamadaFake,
} from "../_shared/conector/testes/fake-admin.ts";
import { E, montarDeps, OP, OUTRA, PDF, sc } from "./testes/deps-habilitacao.ts";

const ferramenta = (nome: string) => FERRAMENTAS_HABILITACAO.find((f) => f.def.name === nome)!;
const AT1 = "00000000-0000-4000-8000-000000000051";
const AT2 = "00000000-0000-4000-8000-000000000052";
const AT3 = "00000000-0000-4000-8000-000000000053";

const doc = (id: string, tipo: string, extra: Record<string, unknown> = {}) => ({
  id,
  tipo,
  nome: `Doc ${id}`,
  arquivo_ref: `habilitacao/${E}/2026/10/${id}.pdf`,
  numero: null,
  validade: null,
  ativo: true,
  ...extra,
});

const BIBLIOTECA = [
  doc("d1", "crf_fgts", { nome: "CRF outubro", validade: "2026-10-28" }),
  doc("d2", "cnd_federal", { nome: "CND", validade: "2026-10-01" }),
  doc("d3", "contrato_social", { nome: "Consolidado" }),
  doc("d4", "balanco_dre", { nome: "Balanço 2025" }),
];

function cenario(
  docs = BIBLIOTECA,
  analise: unknown = { extraido: { datas: { sessao: { data: "2026-11-05" } } } }
) {
  const m = montarDeps((c: ChamadaFake) => {
    if (c.tabela === "oportunidade" && c.op === "select")
      return { data: { id: OP, edital_analise: analise } };
    if (c.tabela === "acervo_documento") return { data: docs };
    return undefined;
  });
  for (const d of docs) m.fake.objetos.set(d.arquivo_ref, PDF);
  return m;
}

test("defs: nomes, obrigatórios e anotações", () => {
  assert.deepEqual(
    FERRAMENTAS_HABILITACAO.slice(0, 2).map((f) => [
      f.def.name,
      f.def.inputSchema.required,
      f.def.annotations.readOnlyHint,
      f.def.annotations.idempotentHint,
      f.def.annotations.openWorldHint,
    ]),
    [
      ["anexar_habilitacao", ["oportunidade_id"], false, true, false],
      ["anexar_acervo", ["oportunidade_id"], false, true, false],
    ]
  );
});

test("anexar_habilitacao: copia os válidos para o Envelope 02, lista vencidos e o que falta", async () => {
  const { deps, fake, gravados } = cenario();
  const r = await ferramenta("anexar_habilitacao").executar({ oportunidade_id: OP }, deps);
  assert.equal(r.resultado.isError, false);
  const s = sc(r);
  assert.equal(s.pasta, "Envelope 02 – Habilitação");
  assert.deepEqual(
    (s.anexados as Record<string, unknown>[]).map((a) => [
      a.documento_id,
      a.nome,
      a.vence_antes_da_sessao,
    ]),
    [
      ["d1", "CRF do FGTS - CRF outubro.pdf", true],
      ["d3", "Contrato social e alterações - Consolidado.pdf", false],
      ["d4", "Balanço patrimonial e DRE - Balanço 2025.pdf", false],
    ]
  );
  assert.deepEqual(s.vencidos, [
    {
      documento_id: "d2",
      tipo: "cnd_federal",
      rotulo: "CND Federal (Receita/PGFN)",
      nome: "CND",
      validade: "2026-10-01",
    },
  ]);
  // essenciais sem nenhum documento ativo (cnd_federal tem um, vencido: aparece só em "vencidos")
  assert.deepEqual(
    (s.faltam as { tipo: string }[]).map((f) => f.tipo),
    ["cnd_estadual", "cnd_municipal", "cndt_trabalhista", "certidao_falencia", "cartao_cnpj"]
  );
  assert.deepEqual(s.falhas, []);
  // dois avisos, na ordem do passo 8 do brief: o do vencimento antes da sessão (d1) e o do vencido (d2).
  // O brief esperava length 1 aqui (o teste esquecia o aviso dos vencidos, que o passo 8 manda dar).
  assert.equal((s.avisos as string[]).length, 2);
  assert.match((s.avisos as string[])[0], /vence antes da sessão \(05\/11\/2026\)/);
  assert.equal(
    (s.avisos as string[])[1],
    "1 documento vencido não foi anexado: atualize em Acervo técnico → Documentos e certidões."
  );
  assert.equal(r.alvo, OP);
  // gravação: origem pela biblioteca, pasta do envelope, sem assinatura, na pasta da empresa
  assert.deepEqual(
    gravados.map((g) => [g.p_origem, g.p_pasta, g.p_assinatura, g.p_tipo]),
    [
      ["biblioteca:d1", "Envelope 02 – Habilitação", null, "application/pdf"],
      ["biblioteca:d3", "Envelope 02 – Habilitação", null, "application/pdf"],
      ["biblioteca:d4", "Envelope 02 – Habilitação", null, "application/pdf"],
    ]
  );
  assert.ok(gravados.every((g) => String(g.p_url).startsWith(`anexos-oportunidade/${E}/2026/10/`)));
  assert.equal(gravados[0].p_usuario_nome, "Usuário Teste (via Claude)");
  // o vencido não foi nem baixado
  assert.ok(
    !fake.chamadasStorage.some(
      (c) => c.metodo === "download" && String(c.args[0]).includes("d2.pdf")
    )
  );
  // uma linha no histórico
  const historico = fake.chamadas.filter((c) => c.tabela === "oportunidade_atualizacao");
  assert.equal(historico.length, 1);
});

test("anexar_habilitacao: tipos filtra, e 'faltam' passa a ser dos tipos pedidos", async () => {
  const { deps, gravados } = cenario();
  const r = await ferramenta("anexar_habilitacao").executar(
    { oportunidade_id: OP, tipos: ["crf_fgts", "alvara", "crf_fgts"] },
    deps
  );
  const s = sc(r);
  assert.deepEqual(
    gravados.map((g) => g.p_origem),
    ["biblioteca:d1"]
  );
  assert.deepEqual(s.faltam, [{ tipo: "alvara", rotulo: "Alvará de funcionamento" }]);
  assert.deepEqual(s.vencidos, []);
});

test("anexar_habilitacao: tipo fora da lista → validacao, nada lido", async () => {
  const { deps, fake } = cenario();
  const r = await ferramenta("anexar_habilitacao").executar(
    { oportunidade_id: OP, tipos: ["certidao_x"] },
    deps
  );
  assert.equal(r.resultado.isError, true);
  assert.equal(sc(r).motivo, "validacao");
  assert.ok(Array.isArray(sc(r).tipos_validos));
  assert.equal(fake.chamadas.filter((c) => c.tabela === "acervo_documento").length, 0);
});

test("anexar_habilitacao: arquivo fora da pasta da empresa, ausente ou de outro tipo vira falha", async () => {
  const docs = [
    doc("d1", "crf_fgts", { arquivo_ref: `habilitacao/${OUTRA}/x.pdf` }),
    doc("d2", "cndt_trabalhista", { arquivo_ref: `habilitacao/${E}/2026/10/sumiu.pdf` }),
    doc("d3", "cartao_cnpj"),
  ];
  const { deps, fake, gravados } = cenario(docs);
  fake.objetos.delete(`habilitacao/${E}/2026/10/sumiu.pdf`);
  fake.objetos.set(docs[2].arquivo_ref, new TextEncoder().encode("<html>login</html>"));
  const s = sc(await ferramenta("anexar_habilitacao").executar({ oportunidade_id: OP }, deps));
  assert.deepEqual(s.falhas, [
    { documento_id: "d1", nome: "Doc d1", motivo: "arquivo_fora_da_empresa" },
    { documento_id: "d2", nome: "Doc d2", motivo: "nao_encontrado" },
    { documento_id: "d3", nome: "Doc d3", motivo: "tipo_nao_aceito" },
  ]);
  assert.equal(gravados.length, 0);
  assert.ok(
    !fake.chamadasStorage.some(
      (c) =>
        c.metodo === "download" && c.bucket === "habilitacao" && String(c.args[0]).startsWith(OUTRA)
    )
  );
});

test("anexar_habilitacao: mais de 60 documentos válidos → muitos_documentos, nada copiado", async () => {
  const docs = Array.from({ length: MAX_DOCUMENTOS_POR_CHAMADA + 1 }, (_, i) =>
    doc(`d${i}`, "balanco_dre")
  );
  const { deps, gravados } = cenario(docs);
  const r = await ferramenta("anexar_habilitacao").executar({ oportunidade_id: OP }, deps);
  assert.equal(sc(r).motivo, "muitos_documentos");
  assert.equal(sc(r).total, 61);
  assert.equal(gravados.length, 0);
});

test("anexar_habilitacao: oportunidade de outra empresa → nao_encontrado", async () => {
  const { deps } = montarDeps(() => ({ data: null }));
  const r = await ferramenta("anexar_habilitacao").executar({ oportunidade_id: OP }, deps);
  assert.deepEqual(sc(r), {
    erro: "Oportunidade não encontrada nesta empresa.",
    motivo: "nao_encontrado",
  });
});

function cenarioAcervo(analise: unknown) {
  const atestados: Record<string, Record<string, unknown>> = {
    [AT1]: {
      id: AT1,
      tipo: "cat",
      numero: "3239747/2025",
      contratante: "Prefeitura A",
      arquivo_ref: `certificados/${E}/2025/01/cat1.pdf`,
    },
    [AT2]: {
      id: AT2,
      tipo: "atestado",
      numero: null,
      contratante: "Prefeitura B",
      arquivo_ref: null,
    },
  };
  const m = montarDeps((c: ChamadaFake) => {
    if (c.tabela === "oportunidade" && c.op === "select")
      return { data: { id: OP, edital_analise: analise } };
    if (c.tabela === "acervo_atestado") {
      const id = String(c.filtros.find((f) => f.metodo === "eq" && f.args[0] === "id")?.args[1]);
      return { data: atestados[id] ?? null };
    }
    return undefined;
  });
  m.fake.objetos.set(`certificados/${E}/2025/01/cat1.pdf`, PDF);
  return m;
}

test("anexar_acervo: padrão = cats_anexar do Atende?; sem PDF e não encontrado saem à parte", async () => {
  const { deps, gravados } = cenarioAcervo({
    atende: { cats_anexar: [{ id: AT1, motivo: "x" }, { id: AT2 }, { id: AT3 }] },
  });
  const s = sc(await ferramenta("anexar_acervo").executar({ oportunidade_id: OP }, deps));
  assert.deepEqual(s.anexados, [
    {
      atestado_id: AT1,
      numero: "3239747/2025",
      nome: "CAT 3239747-2025.pdf",
      arquivo_id: "arq-1",
      substituiu: false,
    },
  ]);
  assert.deepEqual(s.sem_pdf, [{ atestado_id: AT2, numero: null }]);
  assert.deepEqual(s.nao_encontrados, [AT3]);
  assert.deepEqual(
    gravados.map((g) => [g.p_origem, g.p_pasta]),
    [[`acervo:${AT1}`, "Envelope 02 – Habilitação"]]
  );
});

test("anexar_acervo: atestado_ids explícitos; sem nenhum e sem Atende? → sem_cats", async () => {
  const comIds = cenarioAcervo(null);
  const s = sc(
    await ferramenta("anexar_acervo").executar(
      { oportunidade_id: OP, atestado_ids: [AT1, AT1] },
      comIds.deps
    )
  );
  assert.equal((s.anexados as unknown[]).length, 1);
  const semNada = cenarioAcervo({ atende: { cats_anexar: [] } });
  const r = await ferramenta("anexar_acervo").executar({ oportunidade_id: OP }, semNada.deps);
  assert.equal(r.resultado.isError, true);
  assert.equal(sc(r).motivo, "sem_cats");
  const invalido = cenarioAcervo(null);
  const r2 = await ferramenta("anexar_acervo").executar(
    { oportunidade_id: OP, atestado_ids: ["nao-e-uuid"] },
    invalido.deps
  );
  assert.equal(sc(r2).motivo, "validacao");
});

// ─── Além do brief ──────────────────────────────────────────────────────────────────────────

const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x08, 0x00]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

/** Biblioteca + banco de arquivos em memória: a RPC troca no lugar e mantém o assinado, como a 0156. */
function cenarioComBanco(docs: Record<string, unknown>[], analise: unknown = null, existe = true) {
  const banco = criarBancoArquivosFake({
    oportunidades: existe ? [{ id: OP, empresa_id: E, deleted_at: null }] : [],
  });
  const imitar = imitarGravarArquivo(banco);
  const m = montarDeps((c: ChamadaFake) => {
    const r = imitar(c);
    if (r !== undefined) return r;
    if (c.tabela === "oportunidade" && c.op === "select")
      return { data: { id: OP, edital_analise: analise } };
    if (c.tabela === "acervo_documento") return { data: docs };
    return undefined;
  });
  for (const d of docs) m.fake.objetos.set(String(d.arquivo_ref), PDF);
  return { ...m, banco };
}

const objetosDaOportunidade = (fake: { objetos: Map<string, Uint8Array> }) =>
  [...fake.objetos.keys()].filter((k) => k.startsWith("anexos-oportunidade/"));

const arquivoAssinado = (origem: string): ArquivoOportunidadeFake => ({
  id: "00000000-0000-4000-9000-0000000000aa",
  empresa_id: E,
  oportunidade_id: OP,
  nome: "Arquivo assinado.pdf",
  url: `anexos-oportunidade/${E}/2026/09/u0-Arquivo_assinado.pdf`,
  tipo: "application/pdf",
  tamanho: 5,
  pasta: PASTA_HABILITACAO,
  categoria: null,
  origem,
  assinatura: "assinado",
  usuario_nome: null,
  deleted_at: null,
});

test("schemas: additionalProperties false, tipos (até 20, enum) e atestado_ids (até 40)", () => {
  // deno-lint-ignore no-explicit-any
  type Esquema = { additionalProperties: boolean; properties: Record<string, any> };
  const [hab, acervo] = FERRAMENTAS_HABILITACAO.slice(0, 2).map(
    (f) => f.def.inputSchema as Esquema
  );
  for (const s of [hab, acervo]) {
    assert.equal(s.additionalProperties, false);
    assert.equal(s.properties.oportunidade_id.type, "string");
  }
  assert.equal(hab.properties.tipos.type, "array");
  assert.equal(hab.properties.tipos.maxItems, 20);
  assert.equal(hab.properties.tipos.items.type, "string");
  assert.ok(hab.properties.tipos.items.enum.includes("crf_fgts"));
  assert.equal(hab.properties.tipos.items.enum.length, 18);
  assert.equal(acervo.properties.atestado_ids.type, "array");
  assert.equal(acervo.properties.atestado_ids.maxItems, MAX_ATESTADOS_POR_CHAMADA);
  assert.equal(MAX_ATESTADOS_POR_CHAMADA, 40);
  assert.equal(MAX_DOCUMENTOS_POR_CHAMADA, 60);
});

test("anexar_habilitacao: tipo repetido no pedido conta uma vez só, na ordem do pedido", async () => {
  const { deps, gravados } = cenario();
  const s = sc(
    await ferramenta("anexar_habilitacao").executar(
      { oportunidade_id: OP, tipos: ["procuracao", "alvara", "procuracao", "crf_fgts", "alvara"] },
      deps
    )
  );
  assert.deepEqual(s.faltam, [
    { tipo: "procuracao", rotulo: "Procuração" },
    { tipo: "alvara", rotulo: "Alvará de funcionamento" },
  ]);
  assert.deepEqual(
    gravados.map((g) => g.p_origem),
    ["biblioteca:d1"]
  );
});

test("anexar_habilitacao: entrada inválida (tipos mal formados, vazios ou demais) → validacao antes de ler", async () => {
  for (const tipos of [
    "crf_fgts",
    [],
    [1],
    ["crf_fgts", "../outro"],
    Array.from({ length: 21 }, () => "crf_fgts"),
  ]) {
    const { deps, fake, gravados } = cenario();
    const r = await ferramenta("anexar_habilitacao").executar({ oportunidade_id: OP, tipos }, deps);
    assert.equal(r.resultado.isError, true, JSON.stringify(tipos));
    assert.equal(sc(r).motivo, "validacao");
    assert.ok((sc(r).erros as string[]).length >= 1);
    assert.equal(fake.chamadas.length, 0);
    assert.equal(fake.chamadasStorage.length, 0);
    assert.equal(gravados.length, 0);
  }
});

test("anexar_habilitacao: id da oportunidade que não é UUID → nao_encontrado, nada lido", async () => {
  const { deps, fake } = cenario();
  const r = await ferramenta("anexar_habilitacao").executar({ oportunidade_id: "x" }, deps);
  assert.equal(sc(r).motivo, "nao_encontrado");
  assert.equal(fake.chamadas.length, 0);
});

test("anexar_habilitacao: ref de outra empresa, de outro bucket ou com .. → falha amigável, nada lido do Storage", async () => {
  const docs = [
    doc("d1", "crf_fgts", { arquivo_ref: `habilitacao/${OUTRA}/2026/10/d1.pdf` }),
    doc("d2", "cndt_trabalhista", { arquivo_ref: `certificados/${E}/2026/10/d2.pdf` }),
    doc("d3", "cartao_cnpj", { arquivo_ref: `habilitacao/${E}/../${OUTRA}/d3.pdf` }),
    doc("d4", "alvara", { arquivo_ref: `anexos-oportunidade/${E}/2026/10/d4.pdf` }),
    doc("d5", "outro", { arquivo_ref: "" }),
  ];
  const { deps, fake, gravados } = cenario(docs);
  const s = sc(await ferramenta("anexar_habilitacao").executar({ oportunidade_id: OP }, deps));
  assert.deepEqual(
    (s.falhas as { documento_id: string; motivo: string }[]).map((f) => [f.documento_id, f.motivo]),
    ["d1", "d2", "d3", "d4", "d5"].map((id) => [id, "arquivo_fora_da_empresa"])
  );
  assert.deepEqual(s.anexados, []);
  assert.equal(fake.chamadasStorage.length, 0);
  assert.equal(gravados.length, 0);
  // sem nada anexado, não há linha no histórico
  assert.equal(fake.chamadas.filter((c) => c.tabela === "oportunidade_atualizacao").length, 0);
});

test("anexar_habilitacao: ZIP com nome .pdf, arquivo vazio e arquivo sumido viram falha; JPG e PNG são aceitos", async () => {
  const docs = [
    doc("d1", "crf_fgts"),
    doc("d2", "cndt_trabalhista"),
    doc("d3", "certidao_falencia"),
    doc("d4", "balanco_dre"),
    doc("d5", "alvara"),
  ];
  const { deps, fake, gravados } = cenario(docs);
  fake.objetos.set(docs[0].arquivo_ref, ZIP);
  fake.objetos.set(docs[1].arquivo_ref, new Uint8Array());
  fake.objetos.delete(docs[2].arquivo_ref);
  fake.objetos.set(docs[3].arquivo_ref, PNG);
  fake.objetos.set(docs[4].arquivo_ref, JPG);
  const s = sc(await ferramenta("anexar_habilitacao").executar({ oportunidade_id: OP }, deps));
  assert.deepEqual(
    (s.falhas as { documento_id: string; motivo: string }[]).map((f) => [f.documento_id, f.motivo]),
    [
      ["d1", "tipo_nao_aceito"],
      ["d2", "vazio"],
      ["d3", "nao_encontrado"],
    ]
  );
  // balanco_dre vem antes de alvara na lista de tipos
  assert.deepEqual(
    (s.anexados as { documento_id: string; nome: string }[]).map((a) => [a.documento_id, a.nome]),
    [
      ["d4", "Balanço patrimonial e DRE - Doc d4.png"],
      ["d5", "Alvará de funcionamento - Doc d5.jpg"],
    ]
  );
  assert.deepEqual(
    gravados.map((g) => g.p_tipo),
    ["image/png", "image/jpeg"]
  );
});

test("anexar_habilitacao: um documento que falha não impede os outros", async () => {
  const docs = [doc("d1", "crf_fgts"), doc("d2", "cndt_trabalhista"), doc("d3", "cartao_cnpj")];
  const { deps, fake, gravados } = cenario(docs);
  fake.objetos.delete(docs[1].arquivo_ref);
  const s = sc(await ferramenta("anexar_habilitacao").executar({ oportunidade_id: OP }, deps));
  assert.deepEqual(
    (s.anexados as { documento_id: string }[]).map((a) => a.documento_id),
    ["d1", "d3"]
  );
  assert.deepEqual(s.falhas, [{ documento_id: "d2", nome: "Doc d2", motivo: "nao_encontrado" }]);
  assert.equal(gravados.length, 2);
  const historico = fake.chamadas.filter((c) => c.tabela === "oportunidade_atualizacao");
  assert.equal(historico.length, 1);
  assert.equal(
    (historico[0].payload as { descricao: string }[])[0].descricao,
    "Habilitação anexada pelo Claude: 2 documento(s) da biblioteca"
  );
});

test("anexar_habilitacao: 60 documentos válidos passam e vencido não conta no limite; 61 válidos não leem nada", async () => {
  const sessenta = Array.from({ length: MAX_DOCUMENTOS_POR_CHAMADA }, (_, i) =>
    doc(`d${i}`, "balanco_dre")
  );
  const ok = cenario([...sessenta, doc("v1", "alvara", { validade: "2026-01-01" })]);
  const s = sc(await ferramenta("anexar_habilitacao").executar({ oportunidade_id: OP }, ok.deps));
  assert.equal((s.anexados as unknown[]).length, 60);
  assert.equal((s.vencidos as unknown[]).length, 1);
  assert.equal(ok.gravados.length, 60);

  const demais = cenario([...sessenta, doc("d60", "balanco_dre")]);
  const r = await ferramenta("anexar_habilitacao").executar({ oportunidade_id: OP }, demais.deps);
  assert.equal(r.resultado.isError, true);
  assert.deepEqual(
    [sc(r).motivo, sc(r).total, sc(r).limite],
    ["muitos_documentos", 61, MAX_DOCUMENTOS_POR_CHAMADA]
  );
  assert.equal(demais.fake.chamadasStorage.length, 0);
  assert.equal(demais.gravados.length, 0);
});

test("anexar_habilitacao: nome que ficaria vazio usa o rótulo do tipo, e a gravação é aceita", async () => {
  const docs = [
    doc("d1", "outro", { nome: "  ​ " }),
    doc("d2", "cnd_federal", { nome: "‮" }),
    doc("d3", "contrato_social", { nome: null }),
  ];
  const { deps, gravados } = cenario(docs);
  const s = sc(await ferramenta("anexar_habilitacao").executar({ oportunidade_id: OP }, deps));
  assert.deepEqual(s.falhas, []);
  assert.deepEqual(
    (s.anexados as { documento_id: string; nome: string }[]).map((a) => [a.documento_id, a.nome]),
    [
      ["d2", "CND Federal (Receita-PGFN).pdf"],
      ["d3", "Contrato social e alterações.pdf"],
      ["d1", "Outro.pdf"],
    ]
  );
  assert.equal(gravados.length, 3);
});

test("anexar_habilitacao: documento do tipo 'outro' usa só o nome; nome com barra e caracteres proibidos é saneado", async () => {
  const docs = [doc("d1", "outro", { nome: 'Atestado: A/B "teste"' })];
  const { deps } = cenario(docs);
  const s = sc(await ferramenta("anexar_habilitacao").executar({ oportunidade_id: OP }, deps));
  assert.deepEqual(
    (s.anexados as { nome: string }[]).map((a) => a.nome),
    ["Atestado- A-B -teste-.pdf"]
  );
});

test("anexar_habilitacao: repetir a chamada troca no lugar (um objeto só no Storage, versão anterior removida)", async () => {
  const docs = [doc("d1", "crf_fgts", { validade: "2026-12-31" })];
  const { deps, fake, banco } = cenarioComBanco(docs);
  const f = ferramenta("anexar_habilitacao");
  const primeira = sc(await f.executar({ oportunidade_id: OP }, deps)).anexados as Record<
    string,
    unknown
  >[];
  const refPrimeira = banco.arquivos[0].url;
  assert.equal(primeira[0].substituiu, false);
  assert.deepEqual(objetosDaOportunidade(fake), [refPrimeira]);

  const segunda = sc(await f.executar({ oportunidade_id: OP }, deps)).anexados as Record<
    string,
    unknown
  >[];
  assert.equal(segunda[0].substituiu, true);
  assert.equal(segunda[0].arquivo_id, primeira[0].arquivo_id);
  assert.equal(banco.arquivos.length, 1);
  const objetos = objetosDaOportunidade(fake);
  assert.equal(objetos.length, 1);
  assert.notEqual(objetos[0], refPrimeira);
  assert.equal(objetos[0], banco.arquivos[0].url);
});

test("anexar_habilitacao: arquivo já assinado é mantido e não é dado como anexado", async () => {
  const docs = [doc("d1", "crf_fgts"), doc("d2", "cndt_trabalhista")];
  const { deps, fake, banco } = cenarioComBanco(docs);
  const assinado = arquivoAssinado("biblioteca:d1");
  banco.arquivos.push(assinado);
  const r = await ferramenta("anexar_habilitacao").executar({ oportunidade_id: OP }, deps);
  assert.equal(r.resultado.isError, false);
  const s = sc(r);
  assert.deepEqual(
    (s.anexados as { documento_id: string }[]).map((a) => a.documento_id),
    ["d2"]
  );
  assert.deepEqual(s.falhas, [{ documento_id: "d1", nome: "Doc d1", motivo: "mantido_assinado" }]);
  assert.ok((s.avisos as string[]).some((a) => /assinad/.test(a)));
  // nada trocou e o objeto novo enviado para o d1 foi removido
  assert.equal(assinado.url, `anexos-oportunidade/${E}/2026/09/u0-Arquivo_assinado.pdf`);
  assert.equal(objetosDaOportunidade(fake).length, 1);
  assert.equal(banco.arquivos.length, 2);
});

test("anexar_habilitacao: oportunidade some entre a leitura e a gravação → nao_encontrado, sem objeto órfão", async () => {
  const { deps, fake } = cenarioComBanco([doc("d1", "crf_fgts")], null, false);
  const r = await ferramenta("anexar_habilitacao").executar({ oportunidade_id: OP }, deps);
  assert.equal(r.resultado.isError, true);
  assert.equal(sc(r).motivo, "nao_encontrado");
  assert.equal(objetosDaOportunidade(fake).length, 0);
});

test("anexar_habilitacao: sessão no edital em texto (jsonb legado) e sessão já passada", async () => {
  const docs = [doc("d1", "crf_fgts", { validade: "2026-10-20" })];
  const comoTexto = cenario(
    docs,
    JSON.stringify({ extraido: { datas: { sessao: { data: "2026-10-30" } } } })
  );
  const a = sc(
    await ferramenta("anexar_habilitacao").executar({ oportunidade_id: OP }, comoTexto.deps)
  );
  assert.equal((a.anexados as { vence_antes_da_sessao: boolean }[])[0].vence_antes_da_sessao, true);
  assert.match((a.avisos as string[])[0], /^1 documento vence antes da sessão \(30\/10\/2026\)/);

  const passada = cenario(docs, { extraido: { datas: { sessao: { data: "2026-10-01" } } } });
  const b = sc(
    await ferramenta("anexar_habilitacao").executar({ oportunidade_id: OP }, passada.deps)
  );
  assert.equal(
    (b.anexados as { vence_antes_da_sessao: boolean }[])[0].vence_antes_da_sessao,
    false
  );
  assert.deepEqual(b.avisos, []);

  const semEdital = cenario(docs, null);
  const c = sc(
    await ferramenta("anexar_habilitacao").executar({ oportunidade_id: OP }, semEdital.deps)
  );
  assert.equal(
    (c.anexados as { vence_antes_da_sessao: boolean }[])[0].vence_antes_da_sessao,
    false
  );
});

test("sessaoFutura: só data real e depois de hoje", () => {
  const com = (data: unknown) => ({ extraido: { datas: { sessao: { data } } } });
  assert.equal(sessaoFutura(com("2026-11-05"), "2026-10-13"), "2026-11-05");
  assert.equal(sessaoFutura(com("2026-10-13"), "2026-10-13"), null);
  assert.equal(sessaoFutura(com("2026-10-01"), "2026-10-13"), null);
  assert.equal(sessaoFutura(com("05/11/2026"), "2026-10-13"), null);
  assert.equal(sessaoFutura(com(null), "2026-10-13"), null);
  assert.equal(sessaoFutura({}, "2026-10-13"), null);
  assert.equal(sessaoFutura(null, "2026-10-13"), null);
});

test("anexar_habilitacao: vencidos em plural saem num aviso só", async () => {
  const docs = [
    doc("d1", "crf_fgts", { validade: "2026-01-01" }),
    doc("d2", "cndt_trabalhista", { validade: "2026-02-01" }),
    doc("d3", "cartao_cnpj"),
  ];
  const { deps, fake } = cenario(docs);
  const s = sc(await ferramenta("anexar_habilitacao").executar({ oportunidade_id: OP }, deps));
  assert.deepEqual(
    (s.vencidos as { documento_id: string }[]).map((v) => v.documento_id),
    ["d1", "d2"]
  );
  assert.equal((s.avisos as string[]).length, 1);
  assert.match((s.avisos as string[])[0], /^2 documentos vencidos não foram anexados/);
  assert.equal(fake.chamadasStorage.filter((c) => c.metodo === "download").length, 1);
});

/** Atestados para o acervo: cada um com o arquivo no bucket certificados (se tiver ref). */
function cenarioAcervoComBanco(
  atestados: Record<string, Record<string, unknown>>,
  analise: unknown = null
) {
  const banco = criarBancoArquivosFake({
    oportunidades: [{ id: OP, empresa_id: E, deleted_at: null }],
  });
  const imitar = imitarGravarArquivo(banco);
  const m = montarDeps((c: ChamadaFake) => {
    const r = imitar(c);
    if (r !== undefined) return r;
    if (c.tabela === "oportunidade" && c.op === "select")
      return { data: { id: OP, edital_analise: analise } };
    if (c.tabela === "acervo_atestado") {
      const id = String(c.filtros.find((f) => f.metodo === "eq" && f.args[0] === "id")?.args[1]);
      return { data: atestados[id] ?? null };
    }
    return undefined;
  });
  for (const a of Object.values(atestados)) {
    if (typeof a.arquivo_ref === "string") m.fake.objetos.set(a.arquivo_ref, PDF);
  }
  return { ...m, banco };
}

const atestado = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  tipo: "cat",
  numero: `${id.slice(-2)}/2025`,
  contratante: "Prefeitura Teste",
  arquivo_ref: `certificados/${E}/2025/01/${id.slice(-2)}.pdf`,
  ...extra,
});

test("anexar_acervo: ref de outra empresa, de outro bucket ou com .. → falha amigável, nada lido do Storage", async () => {
  const { deps, fake, gravados } = cenarioAcervoComBanco({
    [AT1]: atestado(AT1, { arquivo_ref: `certificados/${OUTRA}/2025/01/x.pdf` }),
    [AT2]: atestado(AT2, { arquivo_ref: `habilitacao/${E}/2025/01/x.pdf` }),
    [AT3]: atestado(AT3, { arquivo_ref: `certificados/${E}/../${OUTRA}/x.pdf` }),
  });
  const s = sc(
    await ferramenta("anexar_acervo").executar(
      { oportunidade_id: OP, atestado_ids: [AT1, AT2, AT3] },
      deps
    )
  );
  assert.deepEqual(
    s.falhas,
    [AT1, AT2, AT3].map((id) => ({ atestado_id: id, motivo: "arquivo_fora_da_empresa" }))
  );
  assert.deepEqual(s.anexados, []);
  assert.equal(fake.chamadasStorage.length, 0);
  assert.equal(gravados.length, 0);
  assert.equal(fake.chamadas.filter((c) => c.tabela === "oportunidade_atualizacao").length, 0);
});

test("anexar_acervo: arquivo sumido, ZIP, vazio e ref em branco; JPG e PNG são aceitos; os demais continuam", async () => {
  const ids = Array.from({ length: 7 }, (_, i) => `00000000-0000-4000-8000-0000000000${60 + i}`);
  const mapa = Object.fromEntries(
    ids.map((id, i) => [
      id,
      atestado(id, {
        tipo: ["cat", "atestado", "cao", "cat_profissional", "cat", "cat", "cat"][i],
        ...(i === 6 ? { arquivo_ref: "   " } : {}),
      }),
    ])
  );
  const { deps, fake, banco } = cenarioAcervoComBanco(mapa);
  fake.objetos.delete(String(mapa[ids[0]].arquivo_ref));
  fake.objetos.set(String(mapa[ids[1]].arquivo_ref), ZIP);
  fake.objetos.set(String(mapa[ids[2]].arquivo_ref), new Uint8Array());
  fake.objetos.set(String(mapa[ids[3]].arquivo_ref), PNG);
  fake.objetos.set(String(mapa[ids[4]].arquivo_ref), JPG);
  const s = sc(
    await ferramenta("anexar_acervo").executar({ oportunidade_id: OP, atestado_ids: ids }, deps)
  );
  assert.deepEqual(s.falhas, [
    { atestado_id: ids[0], motivo: "nao_encontrado" },
    { atestado_id: ids[1], motivo: "tipo_nao_aceito" },
    { atestado_id: ids[2], motivo: "vazio" },
  ]);
  assert.deepEqual(
    (s.anexados as { nome: string }[]).map((a) => a.nome),
    ["CAT profissional 63-2025.png", "CAT 64-2025.jpg", "CAT 65-2025.pdf"]
  );
  assert.deepEqual(s.sem_pdf, [{ atestado_id: ids[6], numero: "66/2025" }]);
  assert.equal(banco.arquivos.length, 3);
  const historico = fake.chamadas.filter((c) => c.tabela === "oportunidade_atualizacao");
  assert.equal(
    (historico[0].payload as { descricao: string }[])[0].descricao,
    "Acervo técnico anexado pelo Claude: 3 documento(s)"
  );
});

test("anexar_acervo: nome sem número usa o contratante, depois o começo do id; tipo desconhecido vira Atestado", async () => {
  const { deps } = cenarioAcervoComBanco({
    [AT1]: atestado(AT1, { numero: "  ", contratante: "Prefeitura B" }),
    [AT2]: atestado(AT2, { numero: null, contratante: null, tipo: "cao" }),
    [AT3]: atestado(AT3, { tipo: "outra_coisa", numero: "9" }),
  });
  const s = sc(
    await ferramenta("anexar_acervo").executar(
      { oportunidade_id: OP, atestado_ids: [AT1, AT2, AT3] },
      deps
    )
  );
  assert.deepEqual(
    (s.anexados as { nome: string }[]).map((a) => a.nome),
    ["CAT Prefeitura B.pdf", "CAO 00000000.pdf", "Atestado 9.pdf"]
  );
});

test("anexar_acervo: repetir a chamada troca no lugar, sem duplicar nem deixar objeto órfão", async () => {
  const { deps, fake, banco } = cenarioAcervoComBanco({ [AT1]: atestado(AT1) });
  const f = ferramenta("anexar_acervo");
  const a = sc(await f.executar({ oportunidade_id: OP, atestado_ids: [AT1] }, deps));
  const b = sc(await f.executar({ oportunidade_id: OP, atestado_ids: [AT1] }, deps));
  const [x] = a.anexados as Record<string, unknown>[];
  const [y] = b.anexados as Record<string, unknown>[];
  assert.deepEqual([x.substituiu, y.substituiu], [false, true]);
  assert.equal(x.arquivo_id, y.arquivo_id);
  assert.equal(banco.arquivos.length, 1);
  assert.deepEqual(objetosDaOportunidade(fake), [banco.arquivos[0].url]);
});

test("anexar_acervo: arquivo já assinado é mantido e não é dado como anexado", async () => {
  const { deps, fake, banco } = cenarioAcervoComBanco({
    [AT1]: atestado(AT1),
    [AT2]: atestado(AT2),
  });
  banco.arquivos.push(arquivoAssinado(`acervo:${AT1}`));
  const s = sc(
    await ferramenta("anexar_acervo").executar(
      { oportunidade_id: OP, atestado_ids: [AT1, AT2] },
      deps
    )
  );
  assert.deepEqual(
    (s.anexados as { atestado_id: string }[]).map((a) => a.atestado_id),
    [AT2]
  );
  assert.deepEqual(s.falhas, [{ atestado_id: AT1, motivo: "mantido_assinado" }]);
  assert.equal(objetosDaOportunidade(fake).length, 1);
});

test("anexar_acervo: entrada inválida (ids ruins, vazios ou mais de 40) → validacao antes de ler", async () => {
  const quarentaE1 = Array.from(
    { length: MAX_ATESTADOS_POR_CHAMADA + 1 },
    (_, i) => `00000000-0000-4000-8000-0000000001${String(i).padStart(2, "0")}`
  );
  for (const atestado_ids of ["x", [], [7], [AT1, "nao-e-uuid"], quarentaE1]) {
    const { deps, fake, gravados } = cenarioAcervoComBanco({ [AT1]: atestado(AT1) });
    const r = await ferramenta("anexar_acervo").executar(
      { oportunidade_id: OP, atestado_ids },
      deps
    );
    assert.equal(r.resultado.isError, true, JSON.stringify(atestado_ids).slice(0, 40));
    assert.equal(sc(r).motivo, "validacao");
    assert.ok((sc(r).erros as string[]).length >= 1);
    assert.equal(fake.chamadas.length, 0);
    assert.equal(fake.chamadasStorage.length, 0);
    assert.equal(gravados.length, 0);
  }
});

test("anexar_acervo: 40 atestados cabem; mais de 40 CATs no Atende? → validacao sem ler atestado nem Storage", async () => {
  const ids = Array.from(
    { length: MAX_ATESTADOS_POR_CHAMADA + 1 },
    (_, i) => `00000000-0000-4000-8000-0000000002${String(i).padStart(2, "0")}`
  );
  const cabem = cenarioAcervoComBanco({});
  const s = sc(
    await ferramenta("anexar_acervo").executar(
      { oportunidade_id: OP, atestado_ids: ids.slice(0, MAX_ATESTADOS_POR_CHAMADA) },
      cabem.deps
    )
  );
  assert.equal((s.nao_encontrados as string[]).length, 40);

  const demais = cenarioAcervoComBanco({}, { atende: { cats_anexar: ids.map((id) => ({ id })) } });
  const r = await ferramenta("anexar_acervo").executar({ oportunidade_id: OP }, demais.deps);
  assert.equal(r.resultado.isError, true);
  assert.equal(sc(r).motivo, "validacao");
  assert.equal(demais.fake.chamadas.filter((c) => c.tabela === "acervo_atestado").length, 0);
  assert.equal(demais.fake.chamadasStorage.length, 0);
});

test("anexar_acervo: cats_anexar repetido ou sem UUID válido é ignorado; id inválido da oportunidade → nao_encontrado", async () => {
  const { deps, gravados } = cenarioAcervoComBanco(
    { [AT1]: atestado(AT1) },
    { atende: { cats_anexar: [{ id: AT1 }, { id: AT1.toUpperCase() }, { id: "x" }, {}, null] } }
  );
  const s = sc(await ferramenta("anexar_acervo").executar({ oportunidade_id: OP }, deps));
  assert.equal((s.anexados as unknown[]).length, 1);
  assert.equal(gravados.length, 1);

  const r = await ferramenta("anexar_acervo").executar({ oportunidade_id: "x" }, deps);
  assert.equal(sc(r).motivo, "nao_encontrado");
});

test("anexar_acervo: oportunidade de outra empresa → nao_encontrado", async () => {
  const { deps } = montarDeps(() => ({ data: null }));
  const r = await ferramenta("anexar_acervo").executar(
    { oportunidade_id: OP, atestado_ids: [AT1] },
    deps
  );
  assert.deepEqual(sc(r), {
    erro: "Oportunidade não encontrada nesta empresa.",
    motivo: "nao_encontrado",
  });
});

test("a saída nunca traz ref de Storage, URL assinada nem caminho (só o link da oportunidade)", async () => {
  const docs = [
    doc("d1", "crf_fgts"),
    doc("d2", "cndt_trabalhista", { arquivo_ref: `habilitacao/${OUTRA}/x.pdf` }),
    doc("d3", "cartao_cnpj"),
    doc("d4", "alvara", { validade: "2026-01-01" }),
  ];
  const hab = cenarioComBanco(docs);
  hab.fake.objetos.set(docs[2].arquivo_ref, ZIP);
  const acervo = cenarioAcervoComBanco({
    [AT1]: atestado(AT1),
    [AT2]: atestado(AT2, { arquivo_ref: null }),
    [AT3]: atestado(AT3, { arquivo_ref: `certificados/${OUTRA}/x.pdf` }),
  });
  const saidas = [
    await ferramenta("anexar_habilitacao").executar({ oportunidade_id: OP }, hab.deps),
    await ferramenta("anexar_acervo").executar(
      { oportunidade_id: OP, atestado_ids: [AT1, AT2, AT3] },
      acervo.deps
    ),
  ];
  for (const r of saidas) {
    assert.equal(r.resultado.isError, false);
    const { link, ...resto } = sc(r);
    assert.equal(link, linkOportunidade(OP));
    // o texto devolvido ao Claude é o mesmo objeto
    assert.deepEqual(JSON.parse(r.resultado.content[0].text as string), sc(r));
    const json = JSON.stringify(resto);
    for (const proibido of [
      "anexos-oportunidade/",
      "habilitacao/",
      "certificados/",
      "http",
      OUTRA,
    ]) {
      assert.ok(!json.includes(proibido), `${proibido} em ${json}`);
    }
    assert.ok(!/\/20\d\d\/\d\d\//.test(json), json);
  }
});
