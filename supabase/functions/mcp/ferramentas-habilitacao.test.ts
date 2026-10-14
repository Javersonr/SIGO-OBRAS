// node --test supabase/functions/mcp/ferramentas-habilitacao.test.ts
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import {
  FERRAMENTAS_HABILITACAO,
  MAX_ATESTADOS_POR_CHAMADA,
  MAX_DOCUMENTOS_POR_CHAMADA,
  MENSAGEM_DA_FALHA,
} from "./ferramentas-habilitacao.ts";
import {
  LIMITE_ARQUIVO_SERVIDOR,
  PASTA_HABILITACAO,
} from "../_shared/conector/arquivo-servidor.ts";
import { linkOportunidade } from "../_shared/conector/recurso.ts";
import {
  criarBancoArquivosFake,
  imitarGravarArquivo,
  type ArquivoOportunidadeFake,
  type ChamadaFake,
  type ChamadaStorageFake,
  type RespostaFake,
} from "../_shared/conector/testes/fake-admin.ts";
import { E, montarDeps, OP, OUTRA, PDF, sc } from "./testes/deps-habilitacao.ts";
import type { DepsFerramenta } from "./registro.ts";

type ResponderStorage = (
  c: ChamadaStorageFake
) => { data?: unknown; error?: { message: string } | null } | undefined;

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
  // versões SUBSTITUÍDAS (ativo = false): o fake do banco ignora filtros e as devolve mesmo assim; a
  // ferramenta não pode copiá-las, listá-las como vencidas nem deixar que escondam o que falta
  doc("d5", "cnd_estadual", { nome: "CND estadual antiga", validade: "2026-01-01", ativo: false }),
  doc("d6", "crf_fgts", { nome: "CRF setembro", validade: "2026-12-31", ativo: false }),
];

const SESSAO_EDITAL = { extraido: { datas: { sessao: { data: "2026-11-05" } } } };

/** `licitacaoData` é a coluna oportunidade.licitacao_data (a "Sessão" da tela). */
function cenario(
  docs = BIBLIOTECA,
  analise: unknown = SESSAO_EDITAL,
  licitacaoData: unknown = null
) {
  const m = montarDeps((c: ChamadaFake) => {
    if (c.tabela === "oportunidade" && c.op === "select")
      return { data: { id: OP, edital_analise: analise, licitacao_data: licitacaoData } };
    if (c.tabela === "acervo_documento") return { data: docs };
    return undefined;
  });
  for (const d of docs) m.fake.objetos.set(d.arquivo_ref, PDF);
  return m;
}

/** O que cada falha traz: o motivo e a mensagem em português do mapa único. */
const comMensagem = <T extends { motivo: string }>(f: T) => ({
  ...f,
  mensagem: MENSAGEM_DA_FALHA[f.motivo as keyof typeof MENSAGEM_DA_FALHA],
});

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
  assert.deepEqual(
    s.falhas,
    [
      { documento_id: "d1", nome: "Doc d1", motivo: "arquivo_fora_da_empresa" },
      { documento_id: "d2", nome: "Doc d2", motivo: "nao_encontrado" },
      { documento_id: "d3", nome: "Doc d3", motivo: "tipo_nao_aceito" },
    ].map(comMensagem)
  );
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
  assert.deepEqual(
    s.falhas,
    [{ documento_id: "d2", nome: "Doc d2", motivo: "nao_encontrado" }].map(comMensagem)
  );
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
  assert.deepEqual(
    s.falhas,
    [{ documento_id: "d1", nome: "Doc d1", motivo: "mantido_assinado" }].map(comMensagem)
  );
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

// ─── Data da sessão: coluna da oportunidade, depois o edital, senão avisa ─────────────────────

const SEM_DATA =
  "A oportunidade não tem data de sessão futura: não conferi se algum documento vence antes dela.";
const edital = (data: unknown) => ({ extraido: { datas: { sessao: { data } } } });
const venceAntes = (s: Record<string, unknown>) =>
  (s.anexados as { documento_id: string; vence_antes_da_sessao: boolean }[]).map((a) => [
    a.documento_id,
    a.vence_antes_da_sessao,
  ]);
const avisosDe = (s: Record<string, unknown>) => s.avisos as string[];
const chamarHabilitacao = async (m: { deps: DepsFerramenta }, args: Record<string, unknown> = {}) =>
  sc(await ferramenta("anexar_habilitacao").executar({ oportunidade_id: OP, ...args }, m.deps));

test("anexar_habilitacao: sessão no edital em texto (jsonb legado) vale quando a coluna está vazia", async () => {
  const docs = [doc("d1", "crf_fgts", { validade: "2026-10-20" })];
  const a = await chamarHabilitacao(cenario(docs, JSON.stringify(edital("2026-10-30"))));
  assert.deepEqual(venceAntes(a), [["d1", true]]);
  assert.match(avisosDe(a)[0], /^1 documento vence antes da sessão \(30\/10\/2026\)/);
  assert.ok(!avisosDe(a).includes(SEM_DATA));
});

test("anexar_habilitacao: a coluna licitacao_data (a Sessão da tela) vale mais que a data do edital", async () => {
  // o edital diz 05/11, o usuário adiou a sessão para 20/11: a CRF que vence em 10/11 vence antes
  const docs = [doc("d1", "crf_fgts", { validade: "2026-11-10" })];
  const m = cenario(docs, edital("2026-11-05"), "2026-11-20");
  const s = await chamarHabilitacao(m);
  assert.deepEqual(venceAntes(s), [["d1", true]]);
  assert.match(avisosDe(s)[0], /^1 documento vence antes da sessão \(20\/11\/2026\)/);
  // com a data do edital (05/11) a mesma CRF não venceria antes: a decisão é da coluna
  const soEdital = await chamarHabilitacao(cenario(docs, edital("2026-11-05"), null));
  assert.deepEqual(venceAntes(soEdital), [["d1", false]]);
  // a leitura da oportunidade pede a coluna (o fake projeta as colunas do select)
  const leitura = m.fake.chamadas.find((c) => c.tabela === "oportunidade")!;
  assert.match(String(leitura.colunas), /\blicitacao_data\b/);
  assert.match(String(leitura.colunas), /\bedital_analise\b/);
});

test("anexar_habilitacao: coluna sem valor usável (vazia ou inválida) cai na data do edital", async () => {
  const docs = [doc("d1", "crf_fgts", { validade: "2026-10-20" })];
  for (const coluna of [null, "", "05/11/2026", "2026-02-30", 20261105]) {
    const s = await chamarHabilitacao(cenario(docs, edital("2026-10-30"), coluna));
    assert.deepEqual(venceAntes(s), [["d1", true]], String(coluna));
    assert.match(avisosDe(s)[0], /\(30\/10\/2026\)/);
  }
});

test("anexar_habilitacao: sem nenhuma data de sessão, avisa (uma vez) que não conferiu e não marca ninguém", async () => {
  const docs = [
    doc("d1", "crf_fgts", { validade: "2026-10-20" }),
    doc("d2", "cndt_trabalhista", { validade: "2026-10-14" }),
    doc("d3", "cartao_cnpj"),
  ];
  for (const analise of [null, {}, edital(null), edital("05/11/2026"), JSON.stringify({})]) {
    const s = await chamarHabilitacao(cenario(docs, analise, null));
    assert.deepEqual(venceAntes(s), [
      ["d1", false],
      ["d2", false],
      ["d3", false],
    ]);
    assert.deepEqual(avisosDe(s), [SEM_DATA], JSON.stringify(analise));
  }
});

test("anexar_habilitacao: sessão só no passado (edital) também avisa que não conferiu", async () => {
  const docs = [doc("d1", "crf_fgts", { validade: "2026-10-20" })];
  const s = await chamarHabilitacao(cenario(docs, edital("2026-10-01"), null));
  assert.deepEqual(venceAntes(s), [["d1", false]]);
  assert.deepEqual(avisosDe(s), [SEM_DATA]);
});

test("anexar_habilitacao: coluna no passado com edital no futuro → vale a coluna: sem data futura, avisa", async () => {
  // o usuário corrigiu a sessão para uma data que já passou: o edital (futuro) não ressuscita
  const docs = [doc("d1", "crf_fgts", { validade: "2026-10-20" })];
  const s = await chamarHabilitacao(cenario(docs, edital("2026-11-05"), "2026-10-01"));
  assert.deepEqual(venceAntes(s), [["d1", false]]);
  assert.deepEqual(avisosDe(s), [SEM_DATA]);
});

test("anexar_habilitacao: validade igual à data da sessão NÃO vence antes dela; um dia antes, vence", async () => {
  const docs = [
    doc("d1", "crf_fgts", { validade: "2026-11-05" }),
    doc("d2", "cndt_trabalhista", { validade: "2026-11-04" }),
    doc("d3", "cartao_cnpj", { validade: "2026-11-06" }),
  ];
  for (const m of [cenario(docs, edital("2026-11-05"), null), cenario(docs, null, "2026-11-05")]) {
    const s = await chamarHabilitacao(m);
    assert.deepEqual(venceAntes(s), [
      ["d1", false],
      ["d2", true],
      ["d3", false],
    ]);
    assert.match(avisosDe(s)[0], /^1 documento vence antes da sessão \(05\/11\/2026\)/);
  }
});

test("anexar_habilitacao: sem nada anexado não há o que conferir, então o aviso de data não aparece", async () => {
  const docs = [doc("d1", "crf_fgts", { validade: "2026-01-01" })];
  const s = await chamarHabilitacao(cenario(docs, null, null));
  assert.deepEqual(s.anexados, []);
  assert.ok(!avisosDe(s).includes(SEM_DATA));
});

// ─── Validade: o dia de hoje é o de Brasília ──────────────────────────────────────────────────

test("anexar_habilitacao: às 23h de 13/10 em Brasília (02h UTC de 14/10), validade 13/10 ainda está em vigor", async () => {
  const docs = [doc("d1", "crf_fgts", { validade: "2026-10-13" })];
  const m = cenario(docs, null, null);
  m.deps.agora = new Date("2026-10-14T02:00:00Z");
  const s = await chamarHabilitacao(m);
  assert.deepEqual(
    (s.anexados as { documento_id: string }[]).map((a) => a.documento_id),
    ["d1"]
  );
  assert.deepEqual(s.vencidos, []);
  // e no dia seguinte em Brasília (14/10 às 09h) a mesma certidão já venceu
  const depois = cenario(docs, null, null);
  depois.deps.agora = new Date("2026-10-14T12:00:00Z");
  const v = await chamarHabilitacao(depois);
  assert.deepEqual(v.anexados, []);
  assert.deepEqual(
    (v.vencidos as { documento_id: string }[]).map((x) => x.documento_id),
    ["d1"]
  );
});

test("anexar_habilitacao: validade igual a hoje é anexada (vence hoje, não venceu)", async () => {
  const docs = [doc("d1", "crf_fgts", { validade: "2026-10-13" })];
  const s = await chamarHabilitacao(cenario(docs, edital("2026-11-05"), null));
  assert.deepEqual(
    (s.anexados as { documento_id: string; vence_antes_da_sessao: boolean }[]).map((a) => [
      a.documento_id,
      a.vence_antes_da_sessao,
    ]),
    [["d1", true]]
  );
  assert.deepEqual(s.vencidos, []);
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
  analise: unknown = null,
  responderStorage?: ResponderStorage,
  extra?: (c: ChamadaFake) => RespostaFake | undefined
) {
  const banco = criarBancoArquivosFake({
    oportunidades: [{ id: OP, empresa_id: E, deleted_at: null }],
  });
  const imitar = imitarGravarArquivo(banco);
  const m = montarDeps(
    (c: ChamadaFake) => {
      const x = extra?.(c);
      if (x !== undefined) return x;
      const r = imitar(c);
      if (r !== undefined) return r;
      if (c.tabela === "oportunidade" && c.op === "select")
        return { data: { id: OP, edital_analise: analise } };
      if (c.tabela === "acervo_atestado") {
        const id = String(c.filtros.find((f) => f.metodo === "eq" && f.args[0] === "id")?.args[1]);
        return { data: atestados[id] ?? null };
      }
      return undefined;
    },
    {},
    responderStorage
  );
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
    [AT1, AT2, AT3].map((id) => comMensagem({ atestado_id: id, motivo: "arquivo_fora_da_empresa" }))
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
  assert.deepEqual(
    s.falhas,
    [
      { atestado_id: ids[0], motivo: "nao_encontrado" },
      { atestado_id: ids[1], motivo: "tipo_nao_aceito" },
      { atestado_id: ids[2], motivo: "vazio" },
    ].map(comMensagem)
  );
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
  assert.deepEqual(s.falhas, [{ atestado_id: AT1, motivo: "mantido_assinado" }].map(comMensagem));
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

// ─── Correção da revisão 1 ────────────────────────────────────────────────────────────────────

/** Os filtros registrados na consulta, sem a ordenação e a paginação (padrão do camada-empresa.test.ts). */
const filtrosDe = (c: ChamadaFake) =>
  c.filtros
    .filter((f) => !["order", "range", "limit"].includes(f.metodo))
    .map((f) => [f.metodo, ...f.args]);

test("anexar_habilitacao: versão substituída (ativo = false) não é copiada, não aparece como vencida nem esconde o que falta", async () => {
  // o fake do banco devolve d5 e d6 mesmo sem o filtro da consulta: quem barra é o código
  const { deps, fake, gravados } = cenario();
  const s = sc(await ferramenta("anexar_habilitacao").executar({ oportunidade_id: OP }, deps));
  assert.deepEqual(
    gravados.map((g) => g.p_origem),
    ["biblioteca:d1", "biblioteca:d3", "biblioteca:d4"]
  );
  assert.deepEqual(
    (s.vencidos as { documento_id: string }[]).map((v) => v.documento_id),
    ["d2"]
  );
  // a CND estadual só tem a versão substituída: continua faltando
  assert.ok((s.faltam as { tipo: string }[]).some((f) => f.tipo === "cnd_estadual"));
  assert.ok(
    !fake.chamadasStorage.some((c) => /d(5|6)\.pdf$/.test(String(c.args[0]))),
    "a versão substituída nem foi baixada"
  );
  assert.ok(!JSON.stringify(s).includes("CRF setembro"));
  assert.ok(!JSON.stringify(s).includes("CND estadual antiga"));

  // pedindo o tipo da versão substituída (d6, crf_fgts): só a em vigor (d1) é copiada
  const so = cenario();
  await ferramenta("anexar_habilitacao").executar(
    { oportunidade_id: OP, tipos: ["crf_fgts"] },
    so.deps
  );
  assert.deepEqual(
    so.gravados.map((g) => g.p_origem),
    ["biblioteca:d1"]
  );
});

test("anexar_habilitacao: as consultas filtram pela empresa, sem excluídos, só documentos ativos e a oportunidade pedida", async () => {
  const { deps, fake } = cenario();
  await ferramenta("anexar_habilitacao").executar({ oportunidade_id: OP }, deps);
  const op = fake.chamadas.filter((c) => c.tabela === "oportunidade");
  assert.equal(op.length, 1);
  assert.deepEqual(filtrosDe(op[0]), [
    ["eq", "empresa_id", E],
    ["is", "deleted_at", null],
    ["eq", "id", OP],
  ]);
  const biblioteca = fake.chamadas.filter((c) => c.tabela === "acervo_documento");
  assert.equal(biblioteca.length, 1);
  assert.deepEqual(filtrosDe(biblioteca[0]), [
    ["eq", "empresa_id", E],
    ["is", "deleted_at", null],
    ["eq", "ativo", true],
  ]);
});

test("anexar_acervo: as consultas filtram pela empresa, sem excluídos e pelo id (oportunidade e atestado)", async () => {
  const { deps, fake } = cenarioAcervo(null);
  await ferramenta("anexar_acervo").executar({ oportunidade_id: OP, atestado_ids: [AT1] }, deps);
  const op = fake.chamadas.filter((c) => c.tabela === "oportunidade");
  assert.equal(op.length, 1);
  assert.deepEqual(filtrosDe(op[0]), [
    ["eq", "empresa_id", E],
    ["is", "deleted_at", null],
    ["eq", "id", OP],
  ]);
  const at = fake.chamadas.filter((c) => c.tabela === "acervo_atestado");
  assert.equal(at.length, 1);
  assert.deepEqual(filtrosDe(at[0]), [
    ["eq", "empresa_id", E],
    ["is", "deleted_at", null],
    ["eq", "id", AT1],
  ]);
});

// ─── cópias antigas que ficaram na pasta do envelope ───────────────────────────────────────────

const D = (n: number) => `00000000-0000-4000-8000-0000000000d${n}`;
const UUID_MINUSCULO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const AVISO_COPIA_1 =
  "1 arquivo da biblioteca nesta oportunidade vem de versão substituída, removida ou vencida: exclua-o da pasta do envelope.";
const avisoCopias = (n: number) =>
  `${n} arquivos da biblioteca nesta oportunidade vêm de versão substituída, removida ou vencida: exclua-os da pasta do envelope.`;
const copiasDe = (s: Record<string, unknown>) =>
  s.copias_desatualizadas as { arquivo_id: string; nome: string; motivo: string }[];

/** Linha de arquivo_oportunidade que já está na pasta (copiada numa chamada anterior). */
const copia = (
  n: number,
  origem: string | null,
  extra: Partial<ArquivoOportunidadeFake> = {}
): ArquivoOportunidadeFake => ({
  id: `00000000-0000-4000-9000-0000000001${String(n).padStart(2, "0")}`,
  empresa_id: E,
  oportunidade_id: OP,
  nome: `Cópia ${n}.pdf`,
  url: `anexos-oportunidade/${E}/2026/09/u${n}-Copia.pdf`,
  tipo: "application/pdf",
  tamanho: 5,
  pasta: PASTA_HABILITACAO,
  categoria: null,
  origem,
  assinatura: null,
  usuario_nome: null,
  deleted_at: null,
  ...extra,
});

/** Responde a uma consulta de tabela aplicando eq, is, in e like como o PostgREST (order e range não mudam o resultado aqui). */
function filtrar(linhas: readonly object[], c: ChamadaFake): { data: object[] } {
  const casa = (l: object) =>
    c.filtros.every((f) => {
      const [coluna, valor] = f.args as [string, unknown];
      const v = (l as Record<string, unknown>)[coluna] ?? null;
      if (f.metodo === "eq" || f.metodo === "is") return v === valor;
      if (f.metodo === "in") return (valor as unknown[]).includes(v);
      if (f.metodo === "like") {
        const re = new RegExp(
          `^${String(valor)
            .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
            .replace(/%/g, ".*")
            .replace(/_/g, ".")}$`
        );
        return typeof v === "string" && re.test(v);
      }
      return true;
    });
  return { data: linhas.filter(casa) };
}

/**
 * Banco de verdade em memória para a biblioteca (acervo_documento) e para os arquivos da oportunidade, com os
 * filtros aplicados: a RPC troca no lugar, a linha antiga continua lá, o documento substituído (ativo = false)
 * continua na tabela. `extra` injeta respostas (falhas) antes das de sempre.
 */
function cenarioCopias(p: {
  docs: Record<string, unknown>[];
  arquivos?: ArquivoOportunidadeFake[];
  analise?: unknown;
  licitacaoData?: unknown;
  extra?: (c: ChamadaFake) => RespostaFake | undefined;
  responderStorage?: ResponderStorage;
}) {
  const banco = criarBancoArquivosFake({
    oportunidades: [{ id: OP, empresa_id: E, deleted_at: null }],
    arquivos: p.arquivos ?? [],
  });
  const imitar = imitarGravarArquivo(banco);
  const linhasDocs = p.docs.map((d) => ({ empresa_id: E, deleted_at: null, ...d }));
  const analise = "analise" in p ? p.analise : SESSAO_EDITAL;
  const m = montarDeps(
    (c: ChamadaFake) => {
      const x = p.extra?.(c);
      if (x !== undefined) return x;
      const r = imitar(c);
      if (r !== undefined) return r;
      if (c.tabela === "oportunidade" && c.op === "select")
        return {
          data: { id: OP, edital_analise: analise, licitacao_data: p.licitacaoData ?? null },
        };
      if (c.tabela === "acervo_documento") return filtrar(linhasDocs, c);
      if (c.tabela === "arquivo_oportunidade" && c.op === "select")
        return filtrar(banco.arquivos, c);
      return undefined;
    },
    {},
    p.responderStorage
  );
  for (const d of p.docs) m.fake.objetos.set(String(d.arquivo_ref), PDF);
  return { ...m, banco };
}

/** As chamadas que leem as cópias da biblioteca na pasta (as que filtram a origem com like). */
const consultasDeCopias = (fake: { chamadas: ChamadaFake[] }) =>
  fake.chamadas.filter(
    (c) => c.tabela === "arquivo_oportunidade" && c.filtros.some((f) => f.metodo === "like")
  );

test("anexar_habilitacao: certidão renovada → a cópia da versão substituída é listada e a nova, anexada; nada é apagado", async () => {
  const velha = copia(1, `biblioteca:${D(1)}`, { nome: "CRF do FGTS - CRF setembro.pdf" });
  const m = cenarioCopias({
    docs: [
      doc(D(1), "crf_fgts", { nome: "CRF setembro", validade: "2026-10-05", ativo: false }),
      doc(D(2), "crf_fgts", { nome: "CRF outubro", validade: "2026-12-31" }),
    ],
    arquivos: [velha],
  });
  const s = await chamarHabilitacao(m);
  assert.deepEqual(
    (s.anexados as { documento_id: string }[]).map((a) => a.documento_id),
    [D(2)]
  );
  assert.deepEqual(copiasDe(s), [
    { arquivo_id: velha.id, nome: "CRF do FGTS - CRF setembro.pdf", motivo: "substituido" },
  ]);
  assert.deepEqual(avisosDe(s), [AVISO_COPIA_1]);
  // o servidor não apaga: a linha velha continua viva e nada saiu do Storage
  assert.equal(velha.deleted_at, null);
  assert.equal(m.banco.arquivos.length, 2);
  assert.ok(!m.fake.chamadasStorage.some((c) => c.metodo === "remove"));

  // as consultas: os arquivos da oportunidade com origem biblioteca: e, numa só, os documentos que não estão
  // entre os ativos já lidos (a versão nova, d2, já está em memória: não é lida de novo)
  const arquivos = consultasDeCopias(m.fake);
  assert.equal(arquivos.length, 1);
  assert.deepEqual(filtrosDe(arquivos[0]), [
    ["eq", "empresa_id", E],
    ["is", "deleted_at", null],
    ["eq", "oportunidade_id", OP],
    ["like", "origem", "biblioteca:%"],
  ]);
  const porId = m.fake.chamadas.filter(
    (c) => c.tabela === "acervo_documento" && c.filtros.some((f) => f.metodo === "in")
  );
  assert.equal(porId.length, 1);
  const [empresa, excluidos, ids] = filtrosDe(porId[0]);
  assert.deepEqual(empresa, ["eq", "empresa_id", E]);
  assert.deepEqual(excluidos, ["is", "deleted_at", null]);
  assert.deepEqual(ids[2], [D(1)]);
});

test("anexar_habilitacao: cópia de documento removido da biblioteca (excluído, inexistente ou id estranho) → removido", async () => {
  const [a1, a2, a3] = [
    copia(1, `biblioteca:${D(9)}`),
    copia(2, `biblioteca:${D(8)}`),
    copia(3, "biblioteca:nao-e-uuid"),
  ];
  const m = cenarioCopias({
    docs: [
      // excluído da biblioteca (deleted_at): a camada não o devolve
      doc(D(9), "alvara", { validade: "2026-12-31", deleted_at: "2026-10-01T00:00:00Z" }),
      doc(D(2), "crf_fgts", { validade: "2026-12-31" }),
    ],
    arquivos: [a1, a2, a3],
  });
  const s = await chamarHabilitacao(m);
  assert.deepEqual(copiasDe(s), [
    { arquivo_id: a1.id, nome: "Cópia 1.pdf", motivo: "removido" },
    { arquivo_id: a2.id, nome: "Cópia 2.pdf", motivo: "removido" },
    { arquivo_id: a3.id, nome: "Cópia 3.pdf", motivo: "removido" },
  ]);
  assert.deepEqual(avisosDe(s), [avisoCopias(3)]);
  // só UUID vai para o filtro in (um id estranho faria o banco recusar a consulta inteira)
  const porId = m.fake.chamadas.filter(
    (c) => c.tabela === "acervo_documento" && c.filtros.some((f) => f.metodo === "in")
  );
  const ids = porId[0].filtros.find((f) => f.metodo === "in")!.args[1] as string[];
  assert.deepEqual([...ids].sort(), [D(8), D(9)]);
  assert.ok(ids.every((x) => UUID_MINUSCULO.test(x)));
  assert.equal(m.banco.arquivos.filter((a) => a.deleted_at !== null).length, 0);
});

test("anexar_habilitacao: cópia de documento que venceu → vencido (e ele volta em vencidos, não anexado)", async () => {
  const velha = copia(1, `biblioteca:${D(3)}`);
  const m = cenarioCopias({
    docs: [doc(D(3), "cnd_federal", { nome: "CND", validade: "2026-10-01" })],
    arquivos: [velha],
  });
  const s = await chamarHabilitacao(m);
  assert.deepEqual(s.anexados, []);
  assert.deepEqual(
    (s.vencidos as { documento_id: string }[]).map((v) => v.documento_id),
    [D(3)]
  );
  assert.deepEqual(copiasDe(s), [{ arquivo_id: velha.id, nome: "Cópia 1.pdf", motivo: "vencido" }]);
  assert.deepEqual(avisosDe(s), [
    "1 documento vencido não foi anexado: atualize em Acervo técnico → Documentos e certidões.",
    AVISO_COPIA_1,
  ]);
});

test("anexar_habilitacao: versão substituída que também venceu conta como substituído; vence hoje ainda vale", async () => {
  // d2 vence hoje: continua em vigor, é copiada de novo (troca no lugar) e não entra na lista
  const [velha, hoje] = [copia(1, `biblioteca:${D(1)}`), copia(2, `biblioteca:${D(2)}`)];
  const m = cenarioCopias({
    docs: [
      doc(D(1), "crf_fgts", { validade: "2026-01-01", ativo: false }),
      doc(D(2), "cnd_federal", { validade: "2026-10-13" }),
    ],
    arquivos: [velha, hoje],
  });
  const s = await chamarHabilitacao(m);
  assert.deepEqual(copiasDe(s), [
    { arquivo_id: velha.id, nome: "Cópia 1.pdf", motivo: "substituido" },
  ]);
});

test("anexar_habilitacao: documento que voltou a vigorar entre as duas leituras é conferido pela validade (vencido entra, válido não)", async () => {
  // d1 e d3 não estavam entre os ativos lidos primeiro, mas a leitura por id os devolve ativos
  const [c1, c3] = [copia(1, `biblioteca:${D(1)}`), copia(3, `biblioteca:${D(3)}`)];
  const m = cenarioCopias({
    docs: [],
    arquivos: [c1, c3],
    extra: (c) =>
      c.tabela === "acervo_documento" && c.filtros.some((f) => f.metodo === "in")
        ? {
            data: [
              { id: D(1), ativo: true, validade: "2026-09-01" },
              { id: D(3), ativo: true, validade: "2026-12-31" },
            ],
          }
        : undefined,
  });
  const s = await chamarHabilitacao(m);
  assert.deepEqual(copiasDe(s), [{ arquivo_id: c1.id, nome: "Cópia 1.pdf", motivo: "vencido" }]);
});

test("anexar_habilitacao: cópia de documento válido que o usuário não pediu agora fica fora da lista", async () => {
  const m = cenarioCopias({
    docs: [
      doc(D(4), "alvara", { validade: "2026-12-31" }),
      doc(D(5), "contrato_social"),
      doc(D(2), "crf_fgts", { validade: "2026-12-31" }),
    ],
    arquivos: [copia(1, `biblioteca:${D(4)}`), copia(2, `biblioteca:${D(5)}`)],
  });
  const s = await chamarHabilitacao(m, { tipos: ["crf_fgts"] });
  assert.deepEqual(
    (s.anexados as { documento_id: string }[]).map((a) => a.documento_id),
    [D(2)]
  );
  assert.deepEqual(copiasDe(s), []);
  assert.deepEqual(avisosDe(s), []);
});

test("anexar_habilitacao: arquivo de outra origem (acervo:, gerado:, declaracao:, url:, sem origem) ou na lixeira é ignorado", async () => {
  const arquivos = [
    copia(1, `acervo:${D(1)}`),
    copia(2, "gerado:proposta:pdf"),
    copia(3, null),
    copia(4, "declaracao:nao_emprega_menor:pdf"),
    copia(5, "url:0123456789abcdef"),
    copia(6, `biblioteca:${D(7)}`, { deleted_at: "2026-10-01T00:00:00Z" }),
    copia(7, "Biblioteca:maiúscula"),
  ];
  const docs = [doc(D(2), "crf_fgts", { validade: "2026-12-31" })];
  const filtrado = await chamarHabilitacao(cenarioCopias({ docs, arquivos }));
  assert.deepEqual(copiasDe(filtrado), []);
  assert.deepEqual(avisosDe(filtrado), []);
  // e se o banco devolvesse todas as linhas, mesmo sem o filtro da consulta: o código também confere a origem
  const todas = [copia(11, `acervo:${D(1)}`), copia(12, "gerado:proposta:pdf"), copia(13, null)];
  const semFiltro = await chamarHabilitacao(
    cenarioCopias({
      docs,
      arquivos: todas,
      extra: (c) =>
        c.tabela === "arquivo_oportunidade" && c.filtros.some((f) => f.metodo === "like")
          ? { data: todas }
          : undefined,
    })
  );
  assert.deepEqual(copiasDe(semFiltro), []);
});

test("anexar_habilitacao: só cópias de documentos em vigor (as de agora) → lista vazia, sem reler a biblioteca", async () => {
  const m = cenarioCopias({ docs: [doc(D(2), "crf_fgts", { validade: "2026-12-31" })] });
  const s = await chamarHabilitacao(m);
  assert.deepEqual(copiasDe(s), []);
  assert.equal(
    m.fake.chamadas.filter((c) => c.tabela === "acervo_documento").length,
    1,
    "só a leitura da biblioteca"
  );
});

test("anexar_habilitacao: falha ao conferir as cópias antigas não derruba a ferramenta: log, aviso e sem a lista", async () => {
  for (const onde of ["arquivo_oportunidade", "acervo_documento"]) {
    const log = mock.method(console, "error", () => {});
    try {
      const m = cenarioCopias({
        docs: [doc(D(2), "crf_fgts", { validade: "2026-12-31" })],
        arquivos: [copia(1, `biblioteca:${D(1)}`)],
        extra: (c) =>
          c.tabela === onde &&
          c.op === "select" &&
          c.filtros.some((f) => f.metodo === "like" || f.metodo === "in")
            ? { error: { message: "canceling statement due to statement timeout" } }
            : undefined,
      });
      const r = await ferramenta("anexar_habilitacao").executar({ oportunidade_id: OP }, m.deps);
      assert.equal(r.resultado.isError, false, onde);
      const s = sc(r);
      assert.deepEqual(
        (s.anexados as { documento_id: string }[]).map((a) => a.documento_id),
        [D(2)]
      );
      assert.ok(!("copias_desatualizadas" in s), "sem a lista (vazia diria que está tudo certo)");
      assert.deepEqual(avisosDe(s), [
        "Não consegui conferir se há arquivos antigos da biblioteca na pasta do envelope: confira à mão.",
      ]);
      // o histórico continua sendo gravado
      assert.equal(
        m.fake.chamadas.filter((c) => c.tabela === "oportunidade_atualizacao").length,
        1
      );
      const logs = log.mock.calls.map((c) => c.arguments.join(" "));
      assert.equal(logs.length, 1, onde);
      assert.match(logs[0], /anexar_habilitacao/);
    } finally {
      log.mock.restore();
    }
  }
});

test("anexar_habilitacao: mais de 100 cópias antigas → os documentos são lidos em lotes, todos conferidos", async () => {
  const n = 130;
  const arquivos = Array.from({ length: n }, (_, i) =>
    copia(i + 1, `biblioteca:00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`)
  );
  const m = cenarioCopias({ docs: [], arquivos });
  const s = await chamarHabilitacao(m);
  assert.equal(copiasDe(s).length, n);
  assert.ok(copiasDe(s).every((c) => c.motivo === "removido"));
  const lotes = m.fake.chamadas.filter(
    (c) => c.tabela === "acervo_documento" && c.filtros.some((f) => f.metodo === "in")
  );
  assert.ok(lotes.length >= 2);
  assert.ok(
    lotes.every(
      (c) => (c.filtros.find((f) => f.metodo === "in")!.args[1] as string[]).length <= 100
    )
  );
});

// ─── erro inesperado por item, mensagem de cada falha e aviso resumo ────────────────────────────

/** Texto do erro que o Deno dá quando a rede cai: traz a URL do Storage, com o caminho do arquivo. */
const ERRO_DE_REDE = (arquivo: string) =>
  `error sending request for url (https://storage.test/storage/v1/object/habilitacao/${E}/2026/10/${arquivo}.pdf)`;

test("anexar_habilitacao: erro inesperado num item (rede, banco, resposta estranha) vira erro_interno e os seguintes são copiados", async () => {
  const log = mock.method(console, "error", () => {});
  try {
    const docs = [
      doc(D(1), "cnd_federal"),
      doc(D(2), "cnd_estadual"), // o download lança por rede
      doc(D(3), "cnd_municipal"), // a RPC dá erro de banco
      doc(D(4), "crf_fgts"), // a RPC responde algo que não é o contrato
      doc(D(5), "cndt_trabalhista"),
    ];
    const m = cenarioCopias({
      docs,
      extra: (c) => {
        if (c.tabela !== "conector_gravar_arquivo") return undefined;
        const origem = (c.payload as { p_origem: string }).p_origem;
        if (origem === `biblioteca:${D(3)}`) return { error: { message: "deadlock detected" } };
        if (origem === `biblioteca:${D(4)}`) return { data: { ok: false, motivo: "estranho" } };
        return undefined;
      },
      responderStorage: (c) => {
        if (c.metodo === "download" && String(c.args[0]).endsWith(`/${D(2)}.pdf`)) {
          throw new TypeError(ERRO_DE_REDE(D(2)));
        }
        return undefined;
      },
    });
    const r = await ferramenta("anexar_habilitacao").executar({ oportunidade_id: OP }, m.deps);
    assert.equal(r.resultado.isError, false);
    const s = sc(r);
    assert.deepEqual(
      (s.anexados as { documento_id: string }[]).map((a) => a.documento_id),
      [D(1), D(5)]
    );
    assert.deepEqual(
      s.falhas,
      [D(2), D(3), D(4)].map((id) =>
        comMensagem({ documento_id: id, nome: `Doc ${id}`, motivo: "erro_interno" })
      )
    );
    // os dois copiados ficaram na pasta e o histórico foi gravado, uma vez, com os que deram certo
    assert.deepEqual(
      m.banco.arquivos.map((a) => a.origem),
      [`biblioteca:${D(1)}`, `biblioteca:${D(5)}`]
    );
    const historico = m.fake.chamadas.filter((c) => c.tabela === "oportunidade_atualizacao");
    assert.equal(historico.length, 1);
    assert.equal(
      (historico[0].payload as { descricao: string }[])[0].descricao,
      "Habilitação anexada pelo Claude: 2 documento(s) da biblioteca"
    );
    // o resumo conta os 3
    assert.ok(avisosDe(s).includes("3 documentos não puderam ser copiados: veja falhas."));
    // o log diz qual documento falhou, mas nunca a ref nem o caminho do Storage (o erro de rede os traz)
    const logs = log.mock.calls.map((c) => c.arguments.join(" "));
    assert.equal(logs.length, 3);
    for (const linha of logs) {
      assert.match(linha, /anexar_habilitacao/);
      for (const proibido of ["habilitacao/", "anexos-oportunidade/", "storage/v1", "http", E]) {
        assert.ok(!linha.includes(proibido), `${proibido} em ${linha}`);
      }
    }
    assert.ok(logs[0].includes(D(2)));
    assert.ok(logs[1].includes("deadlock detected"));
  } finally {
    log.mock.restore();
  }
});

test("anexar_acervo: erro inesperado num atestado vira erro_interno e os seguintes são copiados", async () => {
  const log = mock.method(console, "error", () => {});
  try {
    const { deps, banco, fake } = cenarioAcervoComBanco(
      { [AT1]: atestado(AT1), [AT2]: atestado(AT2), [AT3]: atestado(AT3) },
      null,
      (c) => {
        if (c.metodo === "download" && String(c.args[0]).endsWith(`/${AT1.slice(-2)}.pdf`)) {
          throw new TypeError(ERRO_DE_REDE(AT1.slice(-2)));
        }
        return undefined;
      }
    );
    const s = sc(
      await ferramenta("anexar_acervo").executar(
        { oportunidade_id: OP, atestado_ids: [AT1, AT2, AT3] },
        deps
      )
    );
    assert.deepEqual(
      (s.anexados as { atestado_id: string }[]).map((a) => a.atestado_id),
      [AT2, AT3]
    );
    assert.deepEqual(s.falhas, [comMensagem({ atestado_id: AT1, motivo: "erro_interno" })]);
    assert.equal(banco.arquivos.length, 2);
    const historico = fake.chamadas.filter((c) => c.tabela === "oportunidade_atualizacao");
    assert.equal(
      (historico[0].payload as { descricao: string }[])[0].descricao,
      "Acervo técnico anexado pelo Claude: 2 documento(s)"
    );
    const logs = log.mock.calls.map((c) => c.arguments.join(" "));
    assert.equal(logs.length, 1);
    for (const proibido of ["certificados/", "storage/v1", "http", E]) {
      assert.ok(!logs[0].includes(proibido), `${proibido} em ${logs[0]}`);
    }
  } finally {
    log.mock.restore();
  }
});

test("MENSAGEM_DA_FALHA: um texto curto em português para cada motivo possível", () => {
  assert.deepEqual(MENSAGEM_DA_FALHA, {
    arquivo_fora_da_empresa: "O arquivo deste documento não está na pasta da empresa.",
    nao_encontrado: "O arquivo deste documento não foi encontrado no armazenamento.",
    tipo_nao_aceito: "O arquivo não é PDF, JPG ou PNG.",
    grande_demais: "O arquivo passa do limite de 50 MB.",
    vazio: "O arquivo está vazio.",
    storage: "O armazenamento não respondeu ao ler ou gravar o arquivo. Tente de novo.",
    mantido_assinado:
      "Já existe uma versão assinada deste documento na oportunidade; ela foi mantida, sem troca.",
    erro_interno: "Erro inesperado ao copiar este documento. Tente de novo.",
  });
});

test("anexar_habilitacao: todo motivo de falha que a ferramenta produz traz a sua mensagem, e há um aviso-resumo", async () => {
  const docs = [
    doc(D(1), "crf_fgts", { arquivo_ref: `habilitacao/${OUTRA}/2026/10/${D(1)}.pdf` }),
    doc(D(2), "cndt_trabalhista"),
    doc(D(3), "certidao_falencia"),
    doc(D(4), "cnd_federal"),
    doc(D(5), "cnd_estadual"),
    doc(D(6), "cnd_municipal"),
    doc(D(7), "contrato_social"),
    doc(D(8), "cartao_cnpj"),
    doc(D(9), "balanco_dre"),
  ];
  const m = cenarioCopias({
    docs,
    arquivos: [arquivoAssinado(`biblioteca:${D(7)}`)],
    responderStorage: (c) => {
      const caminho = String(c.args[0]);
      if (c.metodo !== "download") return undefined;
      if (caminho.endsWith(`/${D(5)}.pdf`)) return { data: { size: LIMITE_ARQUIVO_SERVIDOR + 1 } };
      if (caminho.endsWith(`/${D(6)}.pdf`)) return { error: { message: "internal error" } };
      if (caminho.endsWith(`/${D(8)}.pdf`)) throw new TypeError(ERRO_DE_REDE(D(8)));
      return undefined;
    },
  });
  m.fake.objetos.delete(String(docs[1].arquivo_ref)); // m2: sumiu
  m.fake.objetos.set(String(docs[2].arquivo_ref), ZIP); // m3: não é PDF/JPG/PNG
  m.fake.objetos.set(String(docs[3].arquivo_ref), new Uint8Array()); // m4: vazio
  const log = mock.method(console, "error", () => {});
  try {
    const s = sc(await ferramenta("anexar_habilitacao").executar({ oportunidade_id: OP }, m.deps));
    const porId = Object.fromEntries(
      (s.falhas as { documento_id: string; motivo: string; mensagem: string }[]).map((f) => [
        f.documento_id,
        f,
      ])
    );
    assert.deepEqual(
      Object.entries(porId).map(([id, f]) => [id, f.motivo]),
      [
        [D(4), "vazio"],
        [D(5), "grande_demais"],
        [D(6), "storage"],
        [D(1), "arquivo_fora_da_empresa"],
        [D(2), "nao_encontrado"],
        [D(3), "tipo_nao_aceito"],
        [D(7), "mantido_assinado"],
        [D(8), "erro_interno"],
      ]
    );
    // todos os motivos do mapa foram produzidos, cada um com o texto do mapa (e nenhum sem texto)
    assert.deepEqual(
      Object.values(porId)
        .map((f) => f.motivo)
        .sort(),
      Object.keys(MENSAGEM_DA_FALHA).sort()
    );
    for (const f of Object.values(porId)) {
      assert.equal(f.mensagem, MENSAGEM_DA_FALHA[f.motivo as keyof typeof MENSAGEM_DA_FALHA]);
      assert.ok(f.mensagem.length > 10);
    }
    assert.deepEqual(
      (s.anexados as { documento_id: string }[]).map((a) => a.documento_id),
      [D(9)]
    );
    // o resumo conta os 7 que não puderam ser copiados; o já assinado tem aviso próprio
    assert.ok(avisosDe(s).includes("7 documentos não puderam ser copiados: veja falhas."));
    assert.ok(avisosDe(s).some((a) => /versão assinada/.test(a)));
  } finally {
    log.mock.restore();
  }
});

test("anexar_habilitacao: uma falha só → aviso-resumo no singular; sem falha, sem resumo", async () => {
  const docs = [doc("d1", "crf_fgts"), doc("d2", "cndt_trabalhista")];
  const { deps, fake } = cenario(docs);
  fake.objetos.delete(docs[1].arquivo_ref);
  const s = sc(await ferramenta("anexar_habilitacao").executar({ oportunidade_id: OP }, deps));
  assert.ok(avisosDe(s).includes("1 documento não pôde ser copiado: veja falhas."));

  const limpo = sc(
    await ferramenta("anexar_habilitacao").executar(
      { oportunidade_id: OP },
      cenario([docs[0]]).deps
    )
  );
  assert.ok(!avisosDe(limpo).some((a) => /não pude/.test(a)));
});

test("anexar_acervo: erro de banco ao ler um atestado vira erro_interno desse atestado e os outros seguem", async () => {
  const log = mock.method(console, "error", () => {});
  try {
    const { deps, banco } = cenarioAcervoComBanco(
      { [AT1]: atestado(AT1), [AT2]: atestado(AT2) },
      null,
      undefined,
      (c) =>
        c.tabela === "acervo_atestado" &&
        c.filtros.some((f) => f.metodo === "eq" && f.args[1] === AT1)
          ? { error: { message: "connection reset by peer" } }
          : undefined
    );
    const s = sc(
      await ferramenta("anexar_acervo").executar(
        { oportunidade_id: OP, atestado_ids: [AT1, AT2] },
        deps
      )
    );
    assert.deepEqual(s.falhas, [comMensagem({ atestado_id: AT1, motivo: "erro_interno" })]);
    assert.deepEqual(
      (s.anexados as { atestado_id: string }[]).map((a) => a.atestado_id),
      [AT2]
    );
    assert.equal(banco.arquivos.length, 1);
    assert.equal(log.mock.calls.length, 1);
  } finally {
    log.mock.restore();
  }
});

test("anexar_acervo: cada falha traz a mensagem do motivo", async () => {
  const ids = [AT1, AT2, AT3];
  const { deps, fake } = cenarioAcervoComBanco({
    [AT1]: atestado(AT1, { arquivo_ref: `certificados/${OUTRA}/2025/01/x.pdf` }),
    [AT2]: atestado(AT2),
    [AT3]: atestado(AT3),
  });
  fake.objetos.delete(`certificados/${E}/2025/01/${AT2.slice(-2)}.pdf`);
  fake.objetos.set(`certificados/${E}/2025/01/${AT3.slice(-2)}.pdf`, ZIP);
  const s = sc(
    await ferramenta("anexar_acervo").executar({ oportunidade_id: OP, atestado_ids: ids }, deps)
  );
  assert.deepEqual(s.falhas, [
    {
      atestado_id: AT1,
      motivo: "arquivo_fora_da_empresa",
      mensagem: "O arquivo deste documento não está na pasta da empresa.",
    },
    {
      atestado_id: AT2,
      motivo: "nao_encontrado",
      mensagem: "O arquivo deste documento não foi encontrado no armazenamento.",
    },
    {
      atestado_id: AT3,
      motivo: "tipo_nao_aceito",
      mensagem: "O arquivo não é PDF, JPG ou PNG.",
    },
  ]);
});
