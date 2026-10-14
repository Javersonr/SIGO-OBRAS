// node --test supabase/functions/mcp/ferramentas-habilitacao.test.ts
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import {
  FERRAMENTAS_HABILITACAO,
  INSTRUCOES_HABILITACAO,
  MAX_ATESTADOS_POR_CHAMADA,
  MAX_DOCUMENTOS_POR_CHAMADA,
  MENSAGEM_DA_FALHA,
  PROMPTS_HABILITACAO,
} from "./ferramentas-habilitacao.ts";
import { NOMES_FERRAMENTAS } from "../_shared/conector/permissoes-ferramentas.ts";
import { CHAVES_MODELO_PADRAO, VARIAVEIS_DECLARACAO } from "../_shared/documentos/declaracoes.ts";
import {
  LIMITE_ARQUIVO_SERVIDOR,
  MIME_ARQUIVO,
  PASTA_HABILITACAO,
} from "../_shared/conector/arquivo-servidor.ts";
import { CATEGORIAS_EDITAL } from "../_shared/conector/envio-regras.ts";
import { linkOportunidade } from "../_shared/conector/recurso.ts";
import { sanearEdital } from "../_shared/edital/edital-regras.ts";
import { origemDaUrl } from "../_shared/conector/url-segura.ts";
import {
  criarBancoArquivosFake,
  imitarGravarArquivo,
  type ArquivoOportunidadeFake,
  type ChamadaFake,
  type ChamadaStorageFake,
  type PaginaTextoFake,
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

// ─── anexar_edital_por_url (Task C4) ──────────────────────────────────────────────────────────

const URL_EDITAL = "https://portal.exemplo.gov.br/editais/009.pdf";
const OLE = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00, 0x00]);
const dnsPublico = async () => ["200.160.2.3"];
const ARGS_URL = { oportunidade_id: OP, url: URL_EDITAL, nome: "Edital.pdf", categoria: "edital" };
const anexarUrl = (deps: DepsFerramenta, args: Record<string, unknown> = {}) =>
  ferramenta("anexar_edital_por_url").executar({ ...ARGS_URL, ...args }, deps);

const AVISO_JA_ANEXADO = "O edital deste link já estava anexado e não mudou.";
const AVISO_TROCADO_PDF =
  'O edital mudou e foi trocado no lugar: clique de novo em "Preparar para o Claude" nesse arquivo antes de ler.';
const PROXIMO_PASSO_PDF =
  'Para o Claude ler este PDF depois pelo SIGO, o usuário clica em "Preparar para o Claude" na aba Arquivos.';

/** fetch de mentira por endereço (o módulo pede o endereço normalizado); registra o que foi pedido. */
function fetchDe(rotas: Record<string, () => Response>) {
  const pedidos: string[] = [];
  const fetchFn = (async (u: string | URL | Request) => {
    pedidos.push(String(u));
    return (rotas[String(u)] ?? (() => new Response("x", { status: 404 })))();
  }) as typeof fetch;
  return { fetchFn, pedidos };
}

function cenarioUrl(
  rotas: Record<string, () => Response>,
  dns: (h: string) => Promise<string[]> = dnsPublico
) {
  const f = fetchDe(rotas);
  const m = montarDeps(
    (c: ChamadaFake) => {
      if (c.tabela === "oportunidade" && c.op === "select") return { data: { id: OP } };
      if (c.tabela === "edital_analise_anexar_arquivos") return { data: 1 };
      return undefined;
    },
    { fetchFn: f.fetchFn, resolverDns: dns }
  );
  return { ...m, pedidos: f.pedidos };
}

/** Banco de arquivos em memória: a RPC troca no lugar (e apaga o texto por página), o assinado fica. */
function cenarioUrlComBanco(
  rotas: Record<string, () => Response>,
  opcoes: {
    arquivos?: ArquivoOportunidadeFake[];
    paginas?: PaginaTextoFake[];
    extra?: (c: ChamadaFake) => RespostaFake | undefined;
    responderStorage?: ResponderStorage;
  } = {}
) {
  const banco = criarBancoArquivosFake({
    oportunidades: [{ id: OP, empresa_id: E, deleted_at: null }],
    arquivos: opcoes.arquivos ?? [],
    paginasTexto: opcoes.paginas ?? [],
  });
  const imitar = imitarGravarArquivo(banco);
  const f = fetchDe(rotas);
  const m = montarDeps(
    (c: ChamadaFake) => {
      const x = opcoes.extra?.(c);
      if (x !== undefined) return x;
      const r = imitar(c);
      if (r !== undefined) return r;
      if (c.tabela === "oportunidade" && c.op === "select") return { data: { id: OP } };
      if (c.tabela === "arquivo_oportunidade" && c.op === "select")
        return filtrar(banco.arquivos, c);
      if (c.tabela === "edital_analise_anexar_arquivos") return { data: 1 };
      return undefined;
    },
    { fetchFn: f.fetchFn, resolverDns: dnsPublico },
    opcoes.responderStorage
  );
  return { ...m, banco, pedidos: f.pedidos };
}

const historicoDe = (fake: { chamadas: ChamadaFake[] }) =>
  fake.chamadas.filter((c) => c.tabela === "oportunidade_atualizacao" && c.op === "insert");
const ligacoesDe = (fake: { chamadas: ChamadaFake[] }) =>
  fake.chamadas.filter((c) => c.tabela === "edital_analise_anexar_arquivos");
const downloadsDaOportunidade = (fake: { chamadasStorage: ChamadaStorageFake[] }) =>
  fake.chamadasStorage.filter((c) => c.metodo === "download" && c.bucket === "anexos-oportunidade");
const avisosDaUrl = (s: Record<string, unknown>) => s.avisos as string[];

/** Uma linha de arquivo_oportunidade do edital baixado por este link, já com o objeto no Storage. */
async function arquivoDoEdital(
  fake: { objetos: Map<string, Uint8Array> },
  bytes: Uint8Array,
  extra: Partial<ArquivoOportunidadeFake> = {}
): Promise<ArquivoOportunidadeFake> {
  const url = `anexos-oportunidade/${E}/2026/09/u1-Edital.pdf`;
  fake.objetos.set(url, bytes);
  return {
    id: "00000000-0000-4000-9000-0000000000e1",
    empresa_id: E,
    oportunidade_id: OP,
    nome: "Edital.pdf",
    url,
    tipo: "application/pdf",
    tamanho: bytes.length,
    pasta: null,
    categoria: "edital",
    origem: await origemDaUrl(URL_EDITAL),
    assinatura: null,
    usuario_nome: null,
    deleted_at: null,
    ...extra,
  };
}

test("anexar_edital_por_url: def com openWorldHint true, terceira ferramenta da lista", () => {
  assert.equal(FERRAMENTAS_HABILITACAO[2], ferramenta("anexar_edital_por_url"));
  const def = ferramenta("anexar_edital_por_url").def;
  assert.deepEqual(def.inputSchema.required, ["oportunidade_id", "url", "nome", "categoria"]);
  assert.deepEqual(
    [
      def.annotations.readOnlyHint,
      def.annotations.destructiveHint,
      def.annotations.idempotentHint,
      def.annotations.openWorldHint,
    ],
    [false, false, true, true]
  );
});

test("anexar_edital_por_url: schema fechado, limites de url e nome e categorias do edital", () => {
  // deno-lint-ignore no-explicit-any
  const s = ferramenta("anexar_edital_por_url").def.inputSchema as any;
  assert.equal(s.additionalProperties, false);
  assert.deepEqual(Object.keys(s.properties).sort(), [
    "categoria",
    "nome",
    "oportunidade_id",
    "url",
  ]);
  assert.equal(s.properties.url.type, "string");
  assert.equal(s.properties.url.maxLength, 2000);
  assert.equal(s.properties.nome.type, "string");
  assert.equal(s.properties.nome.maxLength, 200);
  assert.deepEqual(s.properties.categoria.enum, [...CATEGORIAS_EDITAL]);
  assert.match(String(ferramenta("anexar_edital_por_url").def.description), /50 MB/);
});

test("anexar_edital_por_url: baixa o PDF, grava em Edital e liga à análise", async () => {
  const { deps, fake, gravados } = cenarioUrl({
    "https://portal.exemplo.gov.br/baixar?id=9": () =>
      new Response(null, { status: 302, headers: { location: "/editais/009.pdf" } }),
    [URL_EDITAL]: () =>
      new Response(PDF, { headers: { "content-type": "application/octet-stream" } }),
  });
  const r = await ferramenta("anexar_edital_por_url").executar(
    {
      oportunidade_id: OP,
      url: "https://portal.exemplo.gov.br/baixar?id=9",
      nome: "Edital CE 009.pdf",
      categoria: "edital",
    },
    deps
  );
  assert.equal(r.resultado.isError, false);
  const s = sc(r);
  assert.deepEqual(
    [
      s.arquivo_id,
      s.nome,
      s.tipo,
      s.tamanho,
      s.categoria,
      s.substituiu,
      s.baixado_de,
      s.redirecionamentos,
    ],
    ["arq-1", "Edital CE 009.pdf", "pdf", PDF.length, "edital", false, "portal.exemplo.gov.br", 1]
  );
  assert.equal(s.ja_estava_anexado, false);
  assert.deepEqual(s.avisos, []);
  assert.equal(s.proximo_passo, PROXIMO_PASSO_PDF);
  assert.equal(s.link, linkOportunidade(OP));
  assert.equal(r.alvo, OP);
  assert.equal(gravados.length, 1);
  assert.match(String(gravados[0].p_origem), /^url:[0-9a-f]{16}$/);
  assert.deepEqual(
    [gravados[0].p_pasta, gravados[0].p_categoria, gravados[0].p_assinatura, gravados[0].p_tipo],
    [null, "edital", null, "application/pdf"]
  );
  const anexou = fake.chamadas.find((c) => c.tabela === "edital_analise_anexar_arquivos")!;
  assert.deepEqual(anexou.payload, {
    p_oportunidade_id: OP,
    p_arquivos: [
      { arquivo_oportunidade_id: "arq-1", nome: "Edital CE 009.pdf", categoria: "edital" },
    ],
    p_empresa_id: E,
  });
  // histórico: uma linha, com o nome do arquivo
  const historico = historicoDe(fake);
  assert.equal(historico.length, 1);
  assert.deepEqual(
    (historico[0].payload as Record<string, unknown>[]).map((l) => [
      l.tipo,
      l.descricao,
      l.usuario_nome,
    ]),
    [
      [
        "Arquivo",
        "Edital baixado pelo link pelo Claude: Edital CE 009.pdf",
        "Usuário Teste (via Claude)",
      ],
    ]
  );
});

test("anexar_edital_por_url: página HTML no lugar do PDF e extensão que não bate → tipo_nao_aceito", async () => {
  const html = cenarioUrl({
    [URL_EDITAL]: () =>
      new Response("<html>Faça login</html>", { headers: { "content-type": "text/html" } }),
  });
  const r1 = await ferramenta("anexar_edital_por_url").executar(
    { oportunidade_id: OP, url: URL_EDITAL, nome: "Edital.pdf", categoria: "edital" },
    html.deps
  );
  assert.equal(sc(r1).motivo, "tipo_nao_aceito");
  assert.equal(html.gravados.length, 0);
  assert.equal(html.fake.objetos.size, 0);
  const zip = cenarioUrl({ [URL_EDITAL]: () => new Response(ZIP) });
  const r2 = await ferramenta("anexar_edital_por_url").executar(
    { oportunidade_id: OP, url: URL_EDITAL, nome: "Edital.pdf", categoria: "edital" },
    zip.deps
  );
  assert.equal(sc(r2).motivo, "tipo_nao_aceito");
  const ok = cenarioUrl({ [URL_EDITAL]: () => new Response(ZIP) });
  const r3 = await ferramenta("anexar_edital_por_url").executar(
    { oportunidade_id: OP, url: URL_EDITAL, nome: "Anexos.zip", categoria: "anexo_edital" },
    ok.deps
  );
  assert.equal(sc(r3).tipo, "zip");
  assert.equal(ok.gravados[0].p_tipo, "application/zip");
});

test("anexar_edital_por_url: validação da entrada e travas da URL", async () => {
  const rotas = { [URL_EDITAL]: () => new Response(PDF) };
  const motivo = async (args: Record<string, unknown>, dns?: (h: string) => Promise<string[]>) =>
    sc(
      await ferramenta("anexar_edital_por_url").executar(
        { oportunidade_id: OP, url: URL_EDITAL, nome: "Edital.pdf", categoria: "edital", ...args },
        cenarioUrl(rotas, dns).deps
      )
    ).motivo;
  assert.equal(await motivo({ nome: "virus.exe" }), "validacao");
  assert.equal(await motivo({ nome: "" }), "validacao");
  assert.equal(await motivo({ categoria: "proposta" }), "validacao");
  assert.equal(await motivo({ url: "http://portal.exemplo.gov.br/x.pdf" }), "url_invalida");
  assert.equal(await motivo({ url: "https://127.0.0.1/x.pdf" }), "url_invalida");
  assert.equal(await motivo({}, async () => ["10.0.0.3"]), "destino_bloqueado");
  assert.equal(await motivo({ url: "https://portal.exemplo.gov.br/outro.pdf" }), "http");
});

test("anexar_edital_por_url: sem resolvedor de DNS a ferramenta não baixa", async () => {
  const { deps } = montarDeps((c: ChamadaFake) =>
    c.tabela === "oportunidade" ? { data: { id: OP } } : undefined
  );
  const r = await ferramenta("anexar_edital_por_url").executar(
    { oportunidade_id: OP, url: URL_EDITAL, nome: "Edital.pdf", categoria: "edital" },
    deps
  );
  assert.equal(sc(r).motivo, "indisponivel");
});

test("anexar_edital_por_url: URL, nome e categoria ruins nunca chegam ao fetch; endereço interno em todas as formas", async () => {
  const m = cenarioUrl({ [URL_EDITAL]: () => new Response(PDF) });
  const motivo = async (args: Record<string, unknown>) => sc(await anexarUrl(m.deps, args)).motivo;
  for (const url of [
    "https://2130706433/x.pdf",
    "https://0x7f.1/x.pdf",
    "https://127.1/x.pdf",
    "https://0177.0.0.1/x.pdf",
    "https://[::1]/x.pdf",
    "https://[::ffff:127.0.0.1]/x.pdf",
    "https://localhost/x.pdf",
    "https://169.254.169.254/latest/meta-data",
    "https://user:senha@portal.exemplo.gov.br/x.pdf",
    "https://portal.exemplo.gov.br:8443/x.pdf",
    "ftp://portal.exemplo.gov.br/x.pdf",
    "file:///etc/passwd",
    "nao e url",
    `https://portal.exemplo.gov.br/${"a".repeat(2000)}`,
    "",
    123,
    null,
  ]) {
    assert.equal(await motivo({ url }), "url_invalida", String(url).slice(0, 50));
  }
  for (const nome of [
    "Edital",
    "Edital.exe",
    "Edital.pdf.exe",
    "Edital.html",
    "x.png",
    "​",
    7,
    null,
  ]) {
    assert.equal(await motivo({ nome }), "validacao", String(nome));
  }
  for (const categoria of ["proposta", "Edital", "", null, 3, ["edital"]]) {
    assert.equal(await motivo({ categoria }), "validacao", String(categoria));
  }
  assert.deepEqual(m.pedidos, [], "nada disso chegou ao fetch");
  assert.equal(m.gravados.length, 0);
  // a validação aponta o erro e a oportunidade (alvo da auditoria)
  const r = await anexarUrl(m.deps, { nome: "Edital.exe" });
  assert.equal(r.alvo, OP);
  assert.match(String(sc(r).erro), /\.pdf, \.zip, \.doc, \.docx, \.xls ou \.xlsx/);
});

test("anexar_edital_por_url: oportunidade de outra empresa, inexistente ou id que não é UUID → nao_encontrado, sem baixar", async () => {
  const f = fetchDe({ [URL_EDITAL]: () => new Response(PDF) });
  const { deps, gravados } = montarDeps(
    (c: ChamadaFake) => (c.tabela === "oportunidade" ? { data: null } : undefined),
    { fetchFn: f.fetchFn, resolverDns: dnsPublico }
  );
  const r1 = await anexarUrl(deps);
  assert.equal(r1.resultado.isError, true);
  assert.deepEqual(sc(r1), {
    erro: "Oportunidade não encontrada nesta empresa.",
    motivo: "nao_encontrado",
  });
  const r2 = await anexarUrl(deps, { oportunidade_id: "nao-e-uuid" });
  assert.equal(sc(r2).motivo, "nao_encontrado");
  assert.deepEqual(f.pedidos, []);
  assert.equal(gravados.length, 0);
});

test("anexar_edital_por_url: cada categoria do edital vai para a RPC, sem pasta (cai em Edital)", async () => {
  for (const categoria of CATEGORIAS_EDITAL) {
    const { deps, gravados } = cenarioUrl({ [URL_EDITAL]: () => new Response(PDF) });
    const s = sc(await anexarUrl(deps, { categoria }));
    assert.equal(s.categoria, categoria);
    assert.deepEqual([gravados[0].p_categoria, gravados[0].p_pasta], [categoria, null]);
  }
});

test("anexar_edital_por_url: PDF, ZIP, Word e Excel aceitos pelos bytes; o próximo passo só existe para PDF", async () => {
  const casos: [string, Uint8Array, string][] = [
    ["Edital.pdf", PDF, "pdf"],
    ["Anexos.zip", ZIP, "zip"],
    ["Edital.docx", ZIP, "docx"],
    ["Planilha.xlsx", ZIP, "xlsx"],
    ["Edital antigo.doc", OLE, "doc"],
    ["Planilha antiga.xls", OLE, "xls"],
    ["EDITAL.PDF", PDF, "pdf"],
  ];
  for (const [nome, bytes, tipo] of casos) {
    const { deps, gravados } = cenarioUrl({ [URL_EDITAL]: () => new Response(bytes as BodyInit) });
    const r = await anexarUrl(deps, { nome });
    assert.equal(r.resultado.isError, false, nome);
    const s = sc(r);
    assert.equal(s.tipo, tipo, nome);
    assert.equal(s.nome, nome);
    assert.equal(gravados[0].p_tipo, MIME_ARQUIVO[tipo as keyof typeof MIME_ARQUIVO], nome);
    assert.equal(s.proximo_passo, tipo === "pdf" ? PROXIMO_PASSO_PDF : null, nome);
  }
  // o que os bytes dizem manda, não o nome
  const recusas: [string, Uint8Array][] = [
    ["Edital.pdf", ZIP],
    ["Edital.pdf", OLE],
    ["Edital.pdf", new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46])],
    ["Edital.pdf", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    ["Edital.zip", PDF],
    ["Planilha.xlsx", OLE],
    ["Planilha.xls", ZIP],
    ["Edital.doc", ZIP],
    ["Edital.docx", PDF],
    ["Edital.pdf", new TextEncoder().encode("MZ executável")],
  ];
  for (const [nome, bytes] of recusas) {
    const { deps, gravados, fake } = cenarioUrl({
      [URL_EDITAL]: () => new Response(bytes as BodyInit),
    });
    const r = await anexarUrl(deps, { nome });
    assert.equal(sc(r).motivo, "tipo_nao_aceito", `${nome}`);
    assert.equal(gravados.length, 0);
    assert.equal(fake.objetos.size, 0);
  }
});

test("anexar_edital_por_url: nome que ficaria sem base usa edital.<tipo>", async () => {
  for (const nome of [".pdf", "...pdf", "---.pdf", " .pdf", "​.pdf"]) {
    const { deps, gravados } = cenarioUrl({ [URL_EDITAL]: () => new Response(PDF) });
    const r = await anexarUrl(deps, { nome });
    assert.equal(r.resultado.isError, false, JSON.stringify(nome));
    assert.equal(sc(r).nome, "edital.pdf", JSON.stringify(nome));
    assert.equal(gravados[0].p_nome, "edital.pdf");
  }
  // nome com letra ou número na base fica como veio (saneado como todo nome de arquivo)
  const { deps, gravados } = cenarioUrl({ [URL_EDITAL]: () => new Response(PDF) });
  const s = sc(await anexarUrl(deps, { nome: "  (1)/Edital: CE 009?.pdf " }));
  assert.equal(s.nome, "(1)-Edital- CE 009-.pdf");
  assert.equal(gravados[0].p_nome, "(1)-Edital- CE 009-.pdf");
});

test("anexar_edital_por_url: o mesmo link com o mesmo arquivo não troca nada e o texto preparado continua valendo", async () => {
  const m = cenarioUrlComBanco({ [URL_EDITAL]: () => new Response(PDF) });
  const primeira = sc(await anexarUrl(m.deps));
  assert.equal(primeira.substituiu, false);
  assert.equal(primeira.ja_estava_anexado, false);
  const arquivoId = String(primeira.arquivo_id);
  m.banco.paginasTexto.push({ id: "p1", empresa_id: E, arquivo_id: arquivoId, deleted_at: null });
  const refAntes = m.banco.arquivos[0].url;
  const rpcsAntes = m.gravados.length;
  const uploadsAntes = m.fake.chamadasStorage.filter((c) => c.metodo === "upload").length;

  const r = await anexarUrl(m.deps);
  assert.equal(r.resultado.isError, false);
  const s = sc(r);
  assert.equal(s.arquivo_id, arquivoId);
  assert.equal(s.substituiu, false);
  assert.equal(s.ja_estava_anexado, true);
  assert.deepEqual(avisosDaUrl(s), [AVISO_JA_ANEXADO]);
  assert.deepEqual(
    [s.nome, s.tipo, s.tamanho, s.categoria, s.baixado_de, s.redirecionamentos],
    ["Edital.pdf", "pdf", PDF.length, "edital", "portal.exemplo.gov.br", 0]
  );
  assert.equal(s.link, linkOportunidade(OP));
  assert.equal(r.alvo, OP);
  // nada foi gravado: nem RPC, nem objeto novo, nem histórico, nem ligação à análise; o texto ficou
  assert.equal(m.gravados.length, rpcsAntes);
  assert.equal(m.fake.chamadasStorage.filter((c) => c.metodo === "upload").length, uploadsAntes);
  assert.equal(m.banco.arquivos.length, 1);
  assert.equal(m.banco.arquivos[0].url, refAntes);
  assert.deepEqual(objetosDaOportunidade(m.fake), [refAntes]);
  assert.equal(m.banco.paginasTexto[0].deleted_at, null);
  assert.equal(historicoDe(m.fake).length, 1);
  assert.equal(ligacoesDe(m.fake).length, 1);
  // o objeto atual foi lido uma vez, para comparar
  assert.equal(downloadsDaOportunidade(m.fake).length, 1);
});

test("anexar_edital_por_url: tamanho igual e bytes diferentes → troca no lugar, avisa e o texto antigo some", async () => {
  const velho = new TextEncoder().encode("%PDF-1.7 edital A");
  const novo = new TextEncoder().encode("%PDF-1.7 edital B");
  assert.equal(velho.length, novo.length);
  let atual = velho;
  const m = cenarioUrlComBanco({ [URL_EDITAL]: () => new Response(atual) });
  const primeira = sc(await anexarUrl(m.deps));
  const arquivoId = String(primeira.arquivo_id);
  m.banco.paginasTexto.push({ id: "p1", empresa_id: E, arquivo_id: arquivoId, deleted_at: null });
  const refAntes = m.banco.arquivos[0].url;
  atual = novo;

  const r = await anexarUrl(m.deps);
  assert.equal(r.resultado.isError, false);
  const s = sc(r);
  assert.equal(s.arquivo_id, arquivoId);
  assert.equal(s.substituiu, true);
  assert.equal(s.ja_estava_anexado, false);
  assert.deepEqual(avisosDaUrl(s), [AVISO_TROCADO_PDF]);
  assert.equal(s.proximo_passo, PROXIMO_PASSO_PDF);
  assert.equal(m.banco.arquivos.length, 1);
  assert.notEqual(m.banco.arquivos[0].url, refAntes);
  // um objeto só no Storage, com os bytes novos; o antigo foi removido
  const objetos = objetosDaOportunidade(m.fake);
  assert.deepEqual(objetos, [m.banco.arquivos[0].url]);
  assert.deepEqual(m.fake.objetos.get(objetos[0]), novo);
  // o texto por página do arquivo antigo foi excluído pelo banco: precisa preparar de novo
  assert.notEqual(m.banco.paginasTexto[0].deleted_at, null);
  // mudou de verdade: vai para o histórico; arquivo trocado não é ligado de novo à análise
  assert.equal(historicoDe(m.fake).length, 2);
  assert.equal(ligacoesDe(m.fake).length, 1);
});

test("anexar_edital_por_url: tamanho diferente → troca, sem baixar o objeto atual para comparar", async () => {
  let atual = PDF;
  const m = cenarioUrlComBanco({ [URL_EDITAL]: () => new Response(atual) });
  await anexarUrl(m.deps);
  assert.equal(downloadsDaOportunidade(m.fake).length, 0);
  atual = new TextEncoder().encode("%PDF-1.7 edital com um texto bem maior que o primeiro");
  const s = sc(await anexarUrl(m.deps));
  assert.equal(s.substituiu, true);
  assert.deepEqual(avisosDaUrl(s), [AVISO_TROCADO_PDF]);
  assert.equal(downloadsDaOportunidade(m.fake).length, 0, "tamanho já diferente: nem lê o atual");
  assert.equal(m.banco.arquivos.length, 1);
});

test("anexar_edital_por_url: trocado e não PDF → aviso curto, sem mandar clicar num botão que não existe", async () => {
  const velho = new Uint8Array([...ZIP, 1]);
  const novo = new Uint8Array([...ZIP, 2]);
  let atual = velho;
  const m = cenarioUrlComBanco({ [URL_EDITAL]: () => new Response(atual) });
  await anexarUrl(m.deps, { nome: "Anexos.zip" });
  atual = novo;
  const s = sc(await anexarUrl(m.deps, { nome: "Anexos.zip" }));
  assert.equal(s.substituiu, true);
  assert.equal(s.proximo_passo, null);
  assert.deepEqual(avisosDaUrl(s), ["O edital mudou e foi trocado no lugar."]);
});

test("anexar_edital_por_url: a conferência filtra pela empresa, só linhas vivas, a oportunidade e a origem do link", async () => {
  const m = cenarioUrlComBanco({ [URL_EDITAL]: () => new Response(PDF) });
  await anexarUrl(m.deps);
  const leituras = m.fake.chamadas.filter(
    (c) => c.tabela === "arquivo_oportunidade" && c.op === "select"
  );
  assert.equal(leituras.length, 1);
  assert.deepEqual(filtrosDe(leituras[0]), [
    ["eq", "empresa_id", E],
    ["is", "deleted_at", null],
    ["eq", "oportunidade_id", OP],
    ["eq", "origem", await origemDaUrl(URL_EDITAL)],
  ]);
  // o link com espaços em volta é o mesmo link (mesma origem)
  const outra = cenarioUrlComBanco({ [URL_EDITAL]: () => new Response(PDF) });
  await anexarUrl(outra.deps);
  const s = sc(await anexarUrl(outra.deps, { url: `  ${URL_EDITAL}  ` }));
  assert.equal(s.ja_estava_anexado, true);
  assert.equal(outra.banco.arquivos.length, 1);
});

test("anexar_edital_por_url: outro nome ou categoria para o mesmo arquivo idêntico: nada muda e o aviso diz o que está gravado", async () => {
  const m = cenarioUrlComBanco({ [URL_EDITAL]: () => new Response(PDF) });
  await anexarUrl(m.deps, { nome: "Edital 009.pdf", categoria: "edital" });
  const s = sc(await anexarUrl(m.deps, { nome: "Termo.pdf", categoria: "termo_referencia" }));
  assert.equal(s.ja_estava_anexado, true);
  assert.deepEqual([s.nome, s.categoria], ["Edital 009.pdf", "edital"]);
  assert.deepEqual(avisosDaUrl(s), [
    AVISO_JA_ANEXADO,
    'Nome e categoria não foram alterados: o arquivo já estava anexado como "Edital 009.pdf" (categoria edital).',
  ]);
  assert.equal(m.banco.arquivos[0].nome, "Edital 009.pdf");
  assert.equal(m.banco.arquivos[0].categoria, "edital");
});

test("anexar_edital_por_url: falha ao conferir o arquivo que já estava lá → segue e grava (log sem ref nem URL)", async () => {
  const origem = await origemDaUrl(URL_EDITAL);
  const log = mock.method(console, "error", () => {});
  try {
    // 1) o Storage não devolve o objeto atual
    const a = cenarioUrlComBanco(
      { [URL_EDITAL]: () => new Response(PDF) },
      {
        responderStorage: (c) =>
          c.metodo === "download" ? { error: { message: "storage timeout" } } : undefined,
      }
    );
    await anexarUrl(a.deps);
    const sa = sc(await anexarUrl(a.deps));
    assert.equal(sa.substituiu, true);
    assert.equal(sa.ja_estava_anexado, false);
    assert.equal(a.banco.arquivos.length, 1);
    assert.equal(objetosDaOportunidade(a.fake).length, 1);

    // 2) a ref gravada na linha é de OUTRA empresa: nem tenta ler
    const b = cenarioUrlComBanco({ [URL_EDITAL]: () => new Response(PDF) });
    b.banco.arquivos.push(
      await arquivoDoEdital(b.fake, PDF, {
        url: `anexos-oportunidade/${OUTRA}/2026/09/u1-Edital.pdf`,
      })
    );
    const logsAntes = log.mock.calls.length;
    const sb = sc(await anexarUrl(b.deps));
    assert.equal(sb.substituiu, true);
    assert.equal(downloadsDaOportunidade(b.fake).length, 0);
    // recusada na origem (caminhoDaEmpresa), sem nem tentar o Storage: nem erro para o log
    assert.equal(log.mock.calls.length, logsAntes, "ref de outra empresa é recusada em silêncio");

    // 3) a linha existe mas o objeto sumiu do Storage
    const c = cenarioUrlComBanco({ [URL_EDITAL]: () => new Response(PDF) });
    const semObjeto = await arquivoDoEdital(c.fake, PDF);
    c.fake.objetos.delete(semObjeto.url);
    c.banco.arquivos.push(semObjeto);
    const s3 = sc(await anexarUrl(c.deps));
    assert.equal(s3.substituiu, true);
    assert.equal(s3.ja_estava_anexado, false);
    assert.deepEqual(objetosDaOportunidade(c.fake), [c.banco.arquivos[0].url]);

    // 4) a leitura da tabela falha: grava como arquivo novo
    const d = cenarioUrlComBanco(
      { [URL_EDITAL]: () => new Response(PDF) },
      {
        extra: (q) =>
          q.tabela === "arquivo_oportunidade" && q.op === "select"
            ? { error: { message: "canceling statement due to statement timeout" } }
            : undefined,
      }
    );
    const sd = sc(await anexarUrl(d.deps));
    assert.equal(sd.substituiu, false);
    assert.equal(sd.ja_estava_anexado, false);
    assert.equal(d.banco.arquivos.length, 1);

    // nenhum log traz ref, caminho de Storage ou a URL pedida
    const logs = log.mock.calls.map((x) => x.arguments.join(" "));
    // um log por cenário que falhou na conferência (1, 3 e 4); o 2 não gera nenhum
    assert.equal(logs.length, 3, logs.join("\n"));
    for (const l of logs) {
      assert.match(l, /anexar_edital_por_url/);
      for (const proibido of [
        "anexos-oportunidade/",
        E,
        OUTRA,
        URL_EDITAL,
        "editais/009",
        origem,
      ]) {
        assert.ok(!l.includes(proibido), `${proibido} em ${l}`);
      }
    }
  } finally {
    log.mock.restore();
  }
});

test("anexar_edital_por_url: arquivo já assinado — idêntico vale como já anexado; diferente é mantido, sem troca", async () => {
  // idêntico
  const a = cenarioUrlComBanco({ [URL_EDITAL]: () => new Response(PDF) });
  a.banco.arquivos.push(await arquivoDoEdital(a.fake, PDF, { assinatura: "assinado" }));
  const sa = sc(await anexarUrl(a.deps));
  assert.equal(sa.ja_estava_anexado, true);
  assert.equal(sa.arquivo_id, "00000000-0000-4000-9000-0000000000e1");
  assert.equal(a.gravados.length, 0);

  // diferente (mesmo tamanho): o banco mantém o assinado e o objeto novo não fica órfão
  const outro = new TextEncoder().encode("%PDF-1.7 documento de TESTE");
  assert.equal(outro.length, PDF.length);
  const b = cenarioUrlComBanco({ [URL_EDITAL]: () => new Response(outro) });
  const assinado = await arquivoDoEdital(b.fake, PDF, { assinatura: "assinado" });
  b.banco.arquivos.push(assinado);
  const refAntes = assinado.url;
  const rb = await anexarUrl(b.deps);
  assert.equal(rb.resultado.isError, false);
  const sb = sc(rb);
  assert.equal(sb.mantido_assinado, true);
  assert.equal(sb.substituiu, false);
  assert.equal(sb.ja_estava_anexado, false);
  assert.equal(sb.arquivo_id, assinado.id);
  assert.deepEqual(avisosDaUrl(sb), [
    "Já existe uma versão assinada deste edital na oportunidade; ela foi mantida, sem troca.",
  ]);
  assert.equal(assinado.url, refAntes);
  assert.deepEqual(objetosDaOportunidade(b.fake), [refAntes]);
  assert.equal(historicoDe(b.fake).length, 0);
  assert.equal(ligacoesDe(b.fake).length, 0);
});

test("anexar_edital_por_url: erros do download vão para o motivo certo e nada é gravado", async () => {
  const dns = async (h: string) =>
    h === "interno.exemplo.gov.br" ? ["10.0.0.9"] : ["200.160.2.3"];
  const base = "https://portal.exemplo.gov.br";
  const redir = (para: string) => () =>
    new Response(null, { status: 302, headers: { location: para } });
  const casos: [string, string, Record<string, () => Response>, string?][] = [
    ["http", "404", {}],
    ["http", "500", { [`${base}/x.pdf`]: () => new Response("erro", { status: 500 }) }],
    ["vazio", "vazio", { [`${base}/x.pdf`]: () => new Response(new Uint8Array(0)) }],
    [
      "grande_demais",
      "declarado",
      {
        [`${base}/x.pdf`]: () => new Response(PDF, { headers: { "content-length": "52428801" } }),
      },
    ],
    [
      "muitos_redirecionamentos",
      "4 saltos",
      {
        [`${base}/x.pdf`]: redir("/1"),
        [`${base}/1`]: redir("/2"),
        [`${base}/2`]: redir("/3"),
        [`${base}/3`]: redir("/4"),
        [`${base}/4`]: () => new Response(PDF),
      },
    ],
    [
      "destino_bloqueado",
      "salto para a rede interna",
      { [`${base}/x.pdf`]: redir("https://interno.exemplo.gov.br/segredo") },
    ],
    [
      "destino_bloqueado",
      "salto para http",
      { [`${base}/x.pdf`]: redir("http://portal.exemplo.gov.br/y") },
    ],
    [
      "destino_bloqueado",
      "salto para metadados",
      { [`${base}/x.pdf`]: redir("https://169.254.169.254/latest/meta-data") },
    ],
    ["destino_bloqueado", "nome interno", {}, "https://interno.exemplo.gov.br/x.pdf"],
  ];
  for (const [motivo, rotulo, rotas, url] of casos) {
    const m = cenarioUrl(rotas, dns);
    const r = await anexarUrl(m.deps, { url: url ?? `${base}/x.pdf` });
    assert.equal(r.resultado.isError, true, rotulo);
    const s = sc(r);
    assert.equal(s.motivo, motivo, rotulo);
    assert.equal(typeof s.erro, "string", rotulo);
    assert.equal(r.alvo, OP, rotulo);
    assert.equal(m.gravados.length, 0, rotulo);
    assert.equal(m.fake.objetos.size, 0, rotulo);
    assert.equal(historicoDe(m.fake).length, 0, rotulo);
    assert.equal(ligacoesDe(m.fake).length, 0, rotulo);
  }
  // o destino recusado nem chegou a ser pedido
  const m = cenarioUrl({ [`${base}/x.pdf`]: redir("https://interno.exemplo.gov.br/segredo") }, dns);
  await anexarUrl(m.deps, { url: `${base}/x.pdf` });
  assert.deepEqual(m.pedidos, [`${base}/x.pdf`]);
});

test("anexar_edital_por_url: servidor que não responde → tempo_esgotado depois de 30 s", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const { deps, gravados } = montarDeps(
      (c: ChamadaFake) => (c.tabela === "oportunidade" ? { data: { id: OP } } : undefined),
      { fetchFn: (() => new Promise<Response>(() => {})) as typeof fetch, resolverDns: dnsPublico }
    );
    const pendente = anexarUrl(deps);
    for (let i = 0; i < 30; i++) await new Promise((ok) => setImmediate(ok));
    mock.timers.tick(30_000);
    const r = await pendente;
    assert.equal(r.resultado.isError, true);
    assert.equal(sc(r).motivo, "tempo_esgotado");
    assert.equal(gravados.length, 0);
  } finally {
    mock.timers.reset();
  }
});

test("anexar_edital_por_url: o limite de 50 MB vale no fluxo (sem content-length)", async () => {
  const pedaco = 1024 * 1024;
  const fluxo = (total: number) => {
    let enviados = 0;
    return new ReadableStream<Uint8Array>({
      pull(c) {
        if (enviados >= total) return c.close();
        const n = Math.min(pedaco, total - enviados);
        enviados += n;
        c.enqueue(new Uint8Array(n).fill(0x25));
      },
    });
  };
  const m = cenarioUrl({ [URL_EDITAL]: () => new Response(fluxo(LIMITE_ARQUIVO_SERVIDOR + 1)) });
  const r = await anexarUrl(m.deps);
  assert.equal(sc(r).motivo, "grande_demais");
  assert.equal(m.gravados.length, 0);
});

test("anexar_edital_por_url: a ligação à análise que falha não derruba a ferramenta e o log não traz ref nem URL", async () => {
  const log = mock.method(console, "error", () => {});
  try {
    const f = fetchDe({ [URL_EDITAL]: () => new Response(PDF) });
    const { deps, gravados } = montarDeps(
      (c: ChamadaFake) => {
        if (c.tabela === "oportunidade" && c.op === "select") return { data: { id: OP } };
        if (c.tabela === "edital_analise_anexar_arquivos")
          return { error: { message: `falha em ${URL_EDITAL} anexos-oportunidade/${E}/x.pdf` } };
        return undefined;
      },
      { fetchFn: f.fetchFn, resolverDns: dnsPublico }
    );
    const r = await anexarUrl(deps);
    assert.equal(r.resultado.isError, false);
    assert.equal(sc(r).arquivo_id, "arq-1");
    assert.deepEqual(avisosDaUrl(sc(r)), [
      "O arquivo foi anexado, mas não consegui ligá-lo à análise do edital desta oportunidade.",
    ]);
    assert.equal(gravados.length, 1);
    const logs = log.mock.calls.map((x) => x.arguments.join(" "));
    assert.equal(logs.length, 1);
    assert.match(logs[0], /anexar_edital_por_url/);
    for (const proibido of ["anexos-oportunidade/", E, "https://", "editais/009"]) {
      assert.ok(!logs[0].includes(proibido), `${proibido} em ${logs[0]}`);
    }
  } finally {
    log.mock.restore();
  }
});

test("anexar_edital_por_url: os logs só têm o host e o motivo, nunca a URL (token na query) nem o erro de rede", async () => {
  const segredo = "https://portal.exemplo.gov.br/baixar/arquivo-secreto.pdf?token=SEGREDO123&id=9";
  const metodos = ["log", "info", "warn", "error", "debug"] as const;
  const espioes = metodos.map((nome) => mock.method(console, nome, () => {}));
  try {
    const rotas = { [segredo]: () => new Response("proibido", { status: 403 }) };
    const lancaErro = (async () => {
      throw new TypeError(`error sending request for url (${segredo}): connection refused`);
    }) as typeof fetch;
    const casos = [
      cenarioUrl(rotas).deps,
      cenarioUrl({}).deps,
      montarDeps(
        (c: ChamadaFake) => (c.tabela === "oportunidade" ? { data: { id: OP } } : undefined),
        { fetchFn: lancaErro, resolverDns: dnsPublico }
      ).deps,
      cenarioUrl(rotas, async () => ["10.0.0.1"]).deps,
    ];
    const saidas: string[] = [];
    for (const deps of casos) {
      const r = await anexarUrl(deps, { url: segredo });
      assert.equal(r.resultado.isError, true);
      saidas.push(JSON.stringify(sc(r)), JSON.stringify(r));
    }
    const logs = espioes.flatMap((e) => e.mock.calls.map((x) => x.arguments.join(" ")));
    assert.ok(logs.length >= 3, "o motivo da recusa fica no log");
    for (const l of [...logs, ...saidas]) {
      for (const proibido of [
        "SEGREDO123",
        "token",
        "arquivo-secreto",
        "/baixar",
        "https://",
        "refused",
      ]) {
        assert.ok(!l.includes(proibido), `${proibido} em ${l}`);
      }
    }
    // o que fica no log: o host e o motivo
    for (const motivo of ["http", "destino_bloqueado"]) {
      const esperado = `[conector] anexar_edital_por_url: download recusado (host portal.exemplo.gov.br, motivo ${motivo})`;
      assert.ok(logs.includes(esperado), `${esperado}\n${logs.join("\n")}`);
    }
  } finally {
    for (const e of espioes) e.mock.restore();
  }
});

test("anexar_edital_por_url: a saída nunca traz ref de Storage, caminho, URL pedida nem o UUID da empresa", async () => {
  const pedida = "https://portal.exemplo.gov.br/editais/009.pdf?token=SEGREDO123";
  const velho = new TextEncoder().encode("%PDF-1.7 edital A");
  const novo = new TextEncoder().encode("%PDF-1.7 edital B");
  let atual = velho;
  const m = cenarioUrlComBanco({ [pedida]: () => new Response(atual) });
  const saidas = [];
  saidas.push(await anexarUrl(m.deps, { url: pedida })); // novo
  saidas.push(await anexarUrl(m.deps, { url: pedida })); // já estava
  atual = novo;
  saidas.push(await anexarUrl(m.deps, { url: pedida })); // trocado
  const erro = cenarioUrl({ [pedida]: () => new Response("x", { status: 500 }) });
  saidas.push(await anexarUrl(erro.deps, { url: pedida }));
  const semTipo = cenarioUrl({ [pedida]: () => new Response("<html>login</html>") });
  saidas.push(await anexarUrl(semTipo.deps, { url: pedida }));
  const assinado = cenarioUrlComBanco({ [pedida]: () => new Response(novo) });
  assinado.banco.arquivos.push({
    ...(await arquivoDoEdital(assinado.fake, velho, { assinatura: "assinado" })),
    origem: await origemDaUrl(pedida),
  });
  saidas.push(await anexarUrl(assinado.deps, { url: pedida }));
  assert.deepEqual(
    saidas.map((r) => [r.resultado.isError, sc(r).substituiu ?? sc(r).motivo]),
    [
      [false, false],
      [false, false],
      [false, true],
      [true, "http"],
      [true, "tipo_nao_aceito"],
      [false, false],
    ]
  );
  for (const r of saidas) {
    const { link, ...resto } = sc(r);
    if (link !== undefined) assert.equal(link, linkOportunidade(OP));
    assert.deepEqual(JSON.parse(r.resultado.content[0].text as string), sc(r));
    const json = JSON.stringify(resto);
    for (const proibido of [
      "anexos-oportunidade/",
      "habilitacao/",
      "certificados/",
      "https://", // (o motivo "http" é um valor válido; o que não pode sair é um endereço)
      "http://",
      "token",
      "SEGREDO123",
      "editais/009",
      E,
      OUTRA,
    ]) {
      assert.ok(!json.includes(proibido), `${proibido} em ${json}`);
    }
    assert.ok(!/\/20\d\d\/\d\d\//.test(json), json);
  }
});

// ─── checklist_habilitacao (Task C5) ──────────────────────────────────────────────────────────

test("checklist_habilitacao: lê edital, arquivos, biblioteca e acervo e devolve o que falta", async () => {
  const { deps, fake } = montarDeps((c: ChamadaFake) => {
    if (c.tabela === "oportunidade" && c.op === "select") {
      return {
        data: {
          id: OP,
          edital_analise: {
            extraido: {
              datas: { sessao: { data: "2026-11-05" } },
              habilitacao: {
                outros_documentos: [
                  { descricao: "Declaração de que não emprega menor", pagina: 3 },
                ],
              },
            },
            atende: { cats_anexar: [{ id: AT1 }] },
          },
        },
      };
    }
    if (c.tabela === "arquivo_oportunidade") {
      return {
        data: [
          {
            id: "f1",
            nome: "Proposta.pdf",
            pasta: "Envelope 01 – Proposta",
            categoria: null,
            origem: "gerado:proposta:pdf",
            assinatura: "pendente",
          },
        ],
      };
    }
    if (c.tabela === "acervo_documento")
      return { data: [doc("d1", "crf_fgts", { validade: "2026-12-31" })] };
    if (c.tabela === "acervo_atestado")
      return { data: [{ id: AT1, numero: "1/2025", arquivo_ref: null }] };
    if (c.tabela === "modelo_declaracao") return { data: [] };
    return undefined;
  });
  const def = ferramenta("checklist_habilitacao").def;
  assert.deepEqual(
    [def.inputSchema.required, def.annotations.readOnlyHint, def.annotations.idempotentHint],
    [["oportunidade_id"], true, true]
  );
  const r = await ferramenta("checklist_habilitacao").executar({ oportunidade_id: OP }, deps);
  assert.equal(r.resultado.isError, false);
  const s = sc(r);
  assert.equal(s.oportunidade_id, OP);
  assert.equal(s.sessao, "2026-11-05");
  assert.deepEqual((s.proposta as { situacao: string }[])[0].situacao, "falta_assinar");
  assert.deepEqual(
    (s.certidoes as { tipo: string; situacao: string }[]).find((x) => x.tipo === "crf_fgts")
      ?.situacao,
    "nao_anexado"
  );
  assert.deepEqual(s.acervo, [{ atestado_id: AT1, numero: "1/2025", situacao: "sem_pdf" }]);
  assert.deepEqual((s.declaracoes as { chave: string; situacao: string }[])[0], {
    chave: "nao_emprega_menor",
    titulo: "Declaração de que não emprega menor",
    exigida_no_edital: true,
    situacao: "falta",
  });
  assert.equal((s.resumo as { pronto: boolean }).pronto, false);
  assert.ok(String(s.link).endsWith(`openId=${OP}`));
  // só leitura: nenhuma gravação e nenhum acesso ao Storage
  assert.ok(fake.chamadas.every((c) => c.op === "select"));
  assert.equal(fake.chamadasStorage.length, 0);
});

test("checklist_habilitacao: sem a análise do edital avisa e cobre os essenciais; outra empresa → nao_encontrado", async () => {
  const sem = montarDeps((c: ChamadaFake) =>
    c.tabela === "oportunidade" ? { data: { id: OP, edital_analise: null } } : undefined
  );
  const s = sc(
    await ferramenta("checklist_habilitacao").executar({ oportunidade_id: OP }, sem.deps)
  );
  assert.equal((s.certidoes as unknown[]).length, 8);
  assert.match(String((s.avisos as string[])[0]), /análise do edital/);
  const fora = montarDeps(() => ({ data: null }));
  assert.equal(
    sc(await ferramenta("checklist_habilitacao").executar({ oportunidade_id: OP }, fora.deps))
      .motivo,
    "nao_encontrado"
  );
});

const CRONOGRAMA_GRAVADO = { meses: 3, pct: { "1": [50, 30, 20] } };

/**
 * A análise que o checklist lê por padrão: a sessão e UMA exigência de habilitação que os documentos essenciais já
 * cobrem (a análise gravada sem nenhuma exigência conta como "sem análise": correção da revisão 2).
 */
const ANALISE_DO_CHECKLIST = {
  extraido: {
    datas: { sessao: { data: "2026-11-05" } },
    habilitacao: {
      outros_documentos: [
        { descricao: "Certidão Negativa de Débitos Trabalhistas (CNDT)", pagina: 9 },
      ],
    },
  },
};

const linhaArquivo = (id: string, origem: string | null, extra: Record<string, unknown> = {}) => ({
  id,
  nome: `Arquivo ${id}`,
  pasta: null,
  categoria: null,
  origem,
  assinatura: null,
  ...extra,
});

/** Responde a uma leitura paginada (order + range) aplicando também os filtros. */
function paginada(linhas: readonly object[], c: ChamadaFake): { data: object[] } {
  const { data } = filtrar(linhas, c);
  const faixa = c.filtros.find((f) => f.metodo === "range");
  return { data: faixa ? data.slice(Number(faixa.args[0]), Number(faixa.args[1]) + 1) : data };
}

/**
 * A biblioteca é devolvida SEM aplicar o filtro `ativo` (como o fake de sempre), para provar que o código também
 * descarta o inativo; arquivos e atestados respondem com os filtros e a paginação do banco.
 */
function cenarioChecklist(p: {
  analise?: unknown;
  licitacaoData?: unknown;
  /** oportunidade.cronograma_ff; sem a chave, a oportunidade tem um cronograma gravado (3 meses). */
  cronograma?: unknown;
  docs?: Record<string, unknown>[];
  arquivos?: Record<string, unknown>[];
  atestados?: Record<string, unknown>[];
  modelos?: Record<string, unknown>[];
}) {
  const analise = "analise" in p ? p.analise : ANALISE_DO_CHECKLIST;
  const cronograma = "cronograma" in p ? p.cronograma : CRONOGRAMA_GRAVADO;
  const arquivos = (p.arquivos ?? []).map((a) => ({
    empresa_id: E,
    oportunidade_id: OP,
    deleted_at: null,
    ...a,
  }));
  const atestados = (p.atestados ?? []).map((a) => ({ empresa_id: E, deleted_at: null, ...a }));
  return montarDeps((c: ChamadaFake) => {
    if (c.tabela === "oportunidade" && c.op === "select")
      return {
        data: {
          id: OP,
          edital_analise: analise,
          licitacao_data: p.licitacaoData ?? null,
          cronograma_ff: cronograma,
        },
      };
    if (c.tabela === "arquivo_oportunidade") return paginada(arquivos, c);
    if (c.tabela === "acervo_documento") return { data: p.docs ?? [] };
    if (c.tabela === "acervo_atestado") return filtrar(atestados, c);
    if (c.tabela === "modelo_declaracao") return { data: p.modelos ?? [] };
    return undefined;
  });
}
const checklist = (deps: DepsFerramenta, id: unknown = OP) =>
  ferramenta("checklist_habilitacao").executar({ oportunidade_id: id }, deps);

test("checklist_habilitacao: defs — quarta da lista, só leitura, schema fechado e só o id da oportunidade", () => {
  assert.deepEqual(
    FERRAMENTAS_HABILITACAO.map((f) => f.def.name),
    ["anexar_habilitacao", "anexar_acervo", "anexar_edital_por_url", "checklist_habilitacao"]
  );
  const def = ferramenta("checklist_habilitacao").def;
  assert.equal(FERRAMENTAS_HABILITACAO[3], ferramenta("checklist_habilitacao"));
  assert.deepEqual(def.annotations, {
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: false,
  });
  assert.deepEqual(Object.keys(def.inputSchema.properties as object), ["oportunidade_id"]);
  assert.equal(def.inputSchema.additionalProperties, false);
  assert.deepEqual(def.inputSchema.required, ["oportunidade_id"]);
  assert.match(def.description, /Só lê/);
});

test("checklist_habilitacao: as consultas filtram pela empresa, sem excluídos, só a oportunidade, só documentos ativos e só as CATs do Atende?", async () => {
  const { deps, fake } = cenarioChecklist({
    analise: { ...SESSAO_EDITAL, atende: { cats_anexar: [{ id: AT1 }] } },
    atestados: [atestado(AT1)],
  });
  const r = await checklist(deps);
  assert.equal(r.resultado.isError, false);
  const consultas = (t: string) => fake.chamadas.filter((c) => c.tabela === t);
  for (const t of [
    "oportunidade",
    "arquivo_oportunidade",
    "acervo_documento",
    "acervo_atestado",
    "modelo_declaracao",
  ]) {
    assert.equal(consultas(t).length, 1, t);
  }
  const base = [
    ["eq", "empresa_id", E],
    ["is", "deleted_at", null],
  ];
  assert.deepEqual(filtrosDe(consultas("oportunidade")[0]), [...base, ["eq", "id", OP]]);
  assert.deepEqual(filtrosDe(consultas("arquivo_oportunidade")[0]), [
    ...base,
    ["eq", "oportunidade_id", OP],
  ]);
  assert.deepEqual(filtrosDe(consultas("acervo_documento")[0]), [...base, ["eq", "ativo", true]]);
  assert.deepEqual(filtrosDe(consultas("acervo_atestado")[0]), [...base, ["in", "id", [AT1]]]);
  assert.deepEqual(filtrosDe(consultas("modelo_declaracao")[0]), base);
  // só as colunas de que o checklist precisa: nenhuma ref de arquivo da oportunidade nem da biblioteca
  assert.equal(
    consultas("oportunidade")[0].colunas,
    "id, edital_analise, licitacao_data, cronograma_ff"
  );
  assert.equal(
    consultas("arquivo_oportunidade")[0].colunas,
    "id, nome, pasta, categoria, origem, assinatura"
  );
  assert.equal(consultas("acervo_documento")[0].colunas, "id, tipo, nome, validade, ativo");
  assert.equal(consultas("acervo_atestado")[0].colunas, "id, numero, arquivo_ref");
  // tudo leitura
  assert.ok(fake.chamadas.every((c) => c.op === "select"));
});

test("checklist_habilitacao: sem CATs no Atende? o acervo nem é consultado; ids que não são UUID não vão ao banco", async () => {
  const sem = cenarioChecklist({});
  assert.deepEqual(sc(await checklist(sem.deps)).acervo, []);
  assert.equal(sem.fake.chamadas.filter((c) => c.tabela === "acervo_atestado").length, 0);

  const ruins = cenarioChecklist({
    analise: {
      atende: { cats_anexar: [{ id: "isto-nao-e-uuid" }, { id: AT1.toUpperCase() }, { id: AT1 }] },
    },
    atestados: [atestado(AT1)],
  });
  const s = sc(await checklist(ruins.deps));
  const leitura = ruins.fake.chamadas.filter((c) => c.tabela === "acervo_atestado");
  assert.equal(leitura.length, 1);
  assert.deepEqual(leitura[0].filtros.find((f) => f.metodo === "in")?.args, ["id", [AT1]]);
  assert.deepEqual(s.acervo, [
    { atestado_id: "isto-nao-e-uuid", numero: null, situacao: "nao_encontrado" },
    { atestado_id: AT1, numero: "51/2025", situacao: "nao_anexado" },
  ]);
  // só com ids que não são UUID também não consulta
  const so = cenarioChecklist({ analise: { atende: { cats_anexar: [{ id: "x" }] } } });
  await checklist(so.deps);
  assert.equal(so.fake.chamadas.filter((c) => c.tabela === "acervo_atestado").length, 0);
});

test("checklist_habilitacao: mais de 100 CATs no Atende? são lidas em lotes de até 100 ids", async () => {
  const ids = Array.from(
    { length: 150 },
    (_, i) => `00000000-0000-4000-8000-${String(100000000000 + i)}`
  );
  const { deps, fake } = cenarioChecklist({
    analise: { atende: { cats_anexar: ids.map((id) => ({ id })) } },
    atestados: ids.map((id) => atestado(id)),
  });
  const s = sc(await checklist(deps));
  const leituras = fake.chamadas.filter((c) => c.tabela === "acervo_atestado");
  assert.deepEqual(
    leituras.map((c) => (c.filtros.find((f) => f.metodo === "in")!.args[1] as string[]).length),
    [100, 50]
  );
  assert.equal((s.acervo as unknown[]).length, 150);
  assert.ok((s.acervo as { situacao: string }[]).every((a) => a.situacao === "nao_anexado"));
});

test("checklist_habilitacao: uma oportunidade com muitos arquivos é lida por páginas, sem consulta por arquivo e sem Storage", async () => {
  const arquivos = Array.from({ length: 2300 }, (_, i) =>
    linhaArquivo(
      `00000000-0000-4000-9000-${String(100000000000 + i)}`,
      i % 4 === 0 ? `biblioteca:ant-${i}` : `url:${i}`,
      {
        assinatura: i % 2 === 0 ? "pendente" : null,
        nome: `Arquivo ${String(i).padStart(4, "0")}.pdf`,
      }
    )
  );
  const { deps, fake } = cenarioChecklist({ arquivos });
  const r = await checklist(deps);
  assert.equal(r.resultado.isError, false);
  const s = sc(r);
  const paginas = fake.chamadas.filter((c) => c.tabela === "arquivo_oportunidade");
  assert.deepEqual(
    paginas.map((c) => c.filtros.find((f) => f.metodo === "range")?.args),
    [
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]
  );
  // 1 oportunidade + 3 páginas + biblioteca + modelos: nada por arquivo
  assert.equal(fake.chamadas.length, 6);
  assert.equal(fake.chamadasStorage.length, 0);
  assert.ok(fake.chamadas.every((c) => c.op === "select"));
  // todos os arquivos foram vistos
  assert.equal((s.resumo as { falta_assinar: number }).falta_assinar, 1150);
  assert.equal((s.falta_assinar as unknown[]).length, 1150);
  assert.equal((s.copias_desatualizadas as unknown[]).length, 575);
});

test("checklist_habilitacao: documento inativo que o banco devolva não conta; a cópia dele na pasta é cópia desatualizada", async () => {
  const docs = [
    doc("d1", "crf_fgts", { nome: "CRF novo", validade: "2026-12-31" }),
    doc("d2", "crf_fgts", { nome: "CRF velho", validade: "2026-09-30", ativo: false }),
    doc("d3", "cnd_federal", { nome: "CND", validade: "2026-10-01" }),
    doc("d4", "cartao_cnpj", { nome: "Cartão" }),
  ];
  const { deps } = cenarioChecklist({
    docs,
    arquivos: [
      linhaArquivo("a1", "biblioteca:d1", { nome: "CRF do FGTS - CRF novo.pdf" }),
      linhaArquivo("a2", "biblioteca:d2", { nome: "CRF do FGTS - CRF velho.pdf" }),
      linhaArquivo("a3", "biblioteca:d3", { nome: "CND Federal - CND.pdf" }),
      linhaArquivo("a4", "biblioteca:d4", { nome: "Cartão CNPJ - Cartão.pdf" }),
      linhaArquivo("a5", `acervo:${AT1}`, { nome: "CAT 1.pdf" }),
      linhaArquivo("a6", "gerado:proposta:pdf", { nome: "Proposta.pdf" }),
    ],
  });
  const s = sc(await checklist(deps));
  const cert = (tipo: string) =>
    (
      s.certidoes as {
        tipo: string;
        situacao: string;
        documentos: number;
        validade: string | null;
      }[]
    ).find((x) => x.tipo === tipo)!;
  // o CRF velho (inativo) nem é contado: sobra o novo, anexado
  assert.deepEqual(
    [cert("crf_fgts").situacao, cert("crf_fgts").documentos, cert("crf_fgts").validade],
    ["anexado", 1, "2026-12-31"]
  );
  assert.equal(cert("cnd_federal").situacao, "vencido");
  assert.equal(cert("cartao_cnpj").situacao, "anexado");
  assert.deepEqual(s.copias_desatualizadas, [
    { arquivo_id: "a3", nome: "CND Federal - CND.pdf", motivo: "vencido" },
    { arquivo_id: "a2", nome: "CRF do FGTS - CRF velho.pdf", motivo: "substituido_ou_removido" },
  ]);
  assert.equal((s.resumo as { desatualizadas: number }).desatualizadas, 2);
  assert.equal((s.resumo as { pronto: boolean }).pronto, false);
  assert.ok(
    (s.proximos_passos as string[]).includes(
      "Exclua da pasta do envelope as cópias desatualizadas: CND Federal - CND.pdf; CRF do FGTS - CRF velho.pdf."
    )
  );
});

test("checklist_habilitacao: a data da sessão é a mesma da anexar_habilitacao (a coluna vale mais que o edital)", async () => {
  const docs = [doc("d1", "crf_fgts", { nome: "CRF", validade: "2026-11-02" })];
  const arquivos = [linhaArquivo("a1", "biblioteca:d1")];
  const crfDe = (s: Record<string, unknown>) =>
    (s.certidoes as { tipo: string; situacao: string }[]).find((x) => x.tipo === "crf_fgts")
      ?.situacao;
  const avisosDe = (s: Record<string, unknown>) => s.avisos as string[];
  const AVISO =
    "A oportunidade não tem data de sessão futura: não conferi se algum documento vence antes dela.";
  // sem data de sessão, mas com uma exigência (sem exigência nenhuma a análise contaria como ausente)
  const SEM_DATA = { extraido: { habilitacao: ANALISE_DO_CHECKLIST.extraido.habilitacao } };

  // sem a coluna: o edital (05/11) é depois do vencimento (02/11): vence antes
  const soEdital = sc(await checklist(cenarioChecklist({ docs, arquivos }).deps));
  assert.deepEqual([soEdital.sessao, crfDe(soEdital)], ["2026-11-05", "vence_antes_da_sessao"]);
  assert.deepEqual(avisosDe(soEdital), []);
  // a sessão foi antecipada na tela para 30/10: o documento vale nela, mesmo com o edital dizendo 05/11
  const antecipada = sc(
    await checklist(cenarioChecklist({ docs, arquivos, licitacaoData: "2026-10-30" }).deps)
  );
  assert.deepEqual([antecipada.sessao, crfDe(antecipada)], ["2026-10-30", "anexado"]);
  assert.deepEqual(avisosDe(antecipada), []);
  // coluna sem valor usável (inválida) cai no edital
  const invalida = sc(
    await checklist(cenarioChecklist({ docs, arquivos, licitacaoData: "2026-02-30" }).deps)
  );
  assert.deepEqual([invalida.sessao, crfDe(invalida)], ["2026-11-05", "vence_antes_da_sessao"]);
  // a coluna no passado manda, mesmo com o edital no futuro: não há sessão futura; o aviso diz que não conferiu
  const passada = sc(
    await checklist(cenarioChecklist({ docs, arquivos, licitacaoData: "2026-10-01" }).deps)
  );
  assert.deepEqual([passada.sessao, crfDe(passada)], ["2026-10-01", "anexado"]);
  assert.deepEqual(avisosDe(passada), [AVISO]);
  // sem nenhuma data, idem (e a sessão sai null)
  const nenhuma = sc(await checklist(cenarioChecklist({ docs, arquivos, analise: SEM_DATA }).deps));
  assert.deepEqual([nenhuma.sessao, crfDe(nenhuma)], [null, "anexado"]);
  assert.deepEqual(avisosDe(nenhuma), [AVISO]);
  // nada anexado com validade: não há o que conferir, sem aviso
  const semAnexo = sc(await checklist(cenarioChecklist({ docs, analise: SEM_DATA }).deps));
  assert.deepEqual(avisosDe(semAnexo), []);
});

test("checklist_habilitacao: o aviso da análise vem antes do da sessão; o edital pode vir como texto (jsonb legado)", async () => {
  const docs = [doc("d1", "crf_fgts", { validade: "2026-12-31" })];
  const arquivos = [linhaArquivo("a1", "biblioteca:d1")];
  // sem análise e sem sessão: o aviso da análise é o primeiro, e o da sessão vem depois
  const sem = sc(await checklist(cenarioChecklist({ docs, arquivos, analise: null }).deps));
  assert.equal((sem.avisos as string[]).length, 2);
  assert.equal(
    (sem.avisos as string[])[0],
    "A oportunidade ainda não tem a análise do edital: o checklist cobre só os documentos essenciais. Grave o edital com criar_ou_atualizar_oportunidade."
  );
  assert.match((sem.avisos as string[])[1], /data de sessão futura/);
  // com a coluna futura (sem análise), só o aviso da análise
  const comColuna = sc(
    await checklist(
      cenarioChecklist({ docs, arquivos, analise: null, licitacaoData: "2026-11-20" }).deps
    )
  );
  assert.equal(comColuna.sessao, "2026-11-20");
  assert.equal((comColuna.avisos as string[]).length, 1);
  // análise gravada como texto
  const texto = sc(
    await checklist(
      cenarioChecklist({
        analise: JSON.stringify({
          extraido: {
            datas: { sessao: { data: "2026-11-05" } },
            habilitacao: {
              outros_documentos: [{ descricao: "Alvará de funcionamento", pagina: 2 }],
            },
          },
        }),
      }).deps
    )
  );
  assert.equal(texto.sessao, "2026-11-05");
  assert.deepEqual(texto.avisos, []);
  assert.ok((texto.certidoes as { tipo: string }[]).some((x) => x.tipo === "alvara"));
});

test("checklist_habilitacao: modelos da empresa dão o título; modelo desativado cai no título da chave", async () => {
  const analise = {
    extraido: {
      habilitacao: {
        outros_documentos: [
          { descricao: "Declaração de que não emprega menor", pagina: 1 },
          { descricao: "Declaração de enquadramento como ME/EPP", pagina: 2 },
        ],
      },
    },
  };
  const { deps } = cenarioChecklist({
    analise,
    modelos: [
      {
        chave: "nao_emprega_menor",
        titulo: "Declaração (modelo da empresa)",
        texto: "x",
        ativo: true,
        ordem: 1,
      },
      { chave: "me_epp", titulo: "ME/EPP desativado", texto: "x", ativo: false, ordem: 3 },
    ],
  });
  const s = sc(await checklist(deps));
  assert.deepEqual(
    (s.declaracoes as { chave: string; titulo: string }[]).map((d) => [d.chave, d.titulo]),
    [
      ["nao_emprega_menor", "Declaração (modelo da empresa)"],
      ["me_epp", "me_epp"],
    ]
  );
});

test("checklist_habilitacao: id da oportunidade que não é UUID ou de outra empresa → nao_encontrado, nada mais é lido", async () => {
  const lixo = cenarioChecklist({});
  const r1 = await checklist(lixo.deps, "isto-nao-e-uuid");
  assert.equal(r1.resultado.isError, true);
  assert.equal(sc(r1).motivo, "nao_encontrado");
  assert.equal(sc(await checklist(lixo.deps, null)).motivo, "nao_encontrado");
  const semId = await ferramenta("checklist_habilitacao").executar({}, lixo.deps);
  assert.equal(sc(semId).motivo, "nao_encontrado");
  assert.equal(lixo.fake.chamadas.length, 0);
  // oportunidade de outra empresa: a camada devolve null e mais nada é lido
  const fora = montarDeps(() => ({ data: null }));
  const r2 = await checklist(fora.deps);
  assert.equal(sc(r2).motivo, "nao_encontrado");
  assert.deepEqual(
    fora.fake.chamadas.map((c) => c.tabela),
    ["oportunidade"]
  );
  assert.equal(fora.fake.chamadasStorage.length, 0);
});

test("checklist_habilitacao: a saída nunca traz ref de Storage, caminho nem URL (só ids, nomes, rótulos, situações, datas e textos)", async () => {
  const docs = [
    doc("d1", "crf_fgts", {
      validade: "2026-12-31",
      arquivo_ref: `habilitacao/${E}/2026/10/crf.pdf`,
    }),
    doc("d2", "cndt_trabalhista", { arquivo_ref: `habilitacao/${OUTRA}/x.pdf`, numero: "123" }),
    doc("d3", "cartao_cnpj", { validade: "2026-01-01" }),
  ];
  const { deps } = cenarioChecklist({
    analise: {
      extraido: {
        datas: { sessao: { data: "2026-11-05" } },
        habilitacao: { outros_documentos: [{ descricao: "Alvará de funcionamento", pagina: 4 }] },
      },
      atende: { cats_anexar: [{ id: AT1 }, { id: AT2 }] },
    },
    docs,
    atestados: [
      atestado(AT1, { arquivo_ref: `certificados/${E}/2025/01/cat1.pdf` }),
      atestado(AT2, { arquivo_ref: `certificados/${OUTRA}/2025/01/cat2.pdf` }),
    ],
    arquivos: [
      // se a consulta um dia trouxer mais colunas, a saída não pode repassá-las
      linhaArquivo("a1", "biblioteca:d1", {
        url: `anexos-oportunidade/${E}/2026/10/u1-CRF.pdf`,
        tamanho: 10,
      }),
      linhaArquivo("a2", "gerado:proposta:pdf", {
        assinatura: "pendente",
        url: `anexos-oportunidade/${E}/2026/10/u2-Proposta.pdf`,
      }),
      linhaArquivo("a3", `acervo:${AT1}`, { url: `anexos-oportunidade/${E}/2026/10/u3-CAT.pdf` }),
      linhaArquivo("a4", "biblioteca:d-antigo", {
        url: `anexos-oportunidade/${OUTRA}/2026/10/u4.pdf`,
      }),
    ],
  });
  const r = await checklist(deps);
  assert.equal(r.resultado.isError, false);
  const { link, ...resto } = sc(r);
  assert.equal(link, linkOportunidade(OP));
  assert.deepEqual(JSON.parse(r.resultado.content[0].text as string), sc(r));
  const json = JSON.stringify(resto);
  for (const proibido of [
    "anexos-oportunidade/",
    "habilitacao/",
    "certificados/",
    "http",
    "u1-",
    "u2-",
    "u4",
    E,
    OUTRA,
  ]) {
    assert.ok(!json.includes(proibido), `${proibido} em ${json}`);
  }
  assert.ok(!/\/20\d\d\/\d\d\//.test(json), json);
  // e as chaves são só as do checklist
  assert.deepEqual(Object.keys(resto).sort(), [
    "acervo",
    "avisos",
    "certidoes",
    "copias_desatualizadas",
    "declaracoes",
    "edital",
    "falta_assinar",
    "oportunidade_id",
    "outros_documentos",
    "proposta",
    "proximos_passos",
    "resumo",
    "sessao",
  ]);
});

// ─── checklist_habilitacao: correção da revisão 1 ─────────────────────────────────────────────

const AVISO_SEM_CRONOGRAMA =
  "A oportunidade não tem cronograma gravado: confira se o edital pede o cronograma físico-financeiro.";
const AVISO_ATENDE_NAO_CONCLUI =
  "O Atende? desta oportunidade não concluiu que a empresa atende à qualificação técnica.";
const PASSO_CRONOGRAMA =
  "Se o edital pede cronograma físico-financeiro, grave com importar_cronograma e chame gerar_documentos_proposta de novo.";
const propostaDe = (s: Record<string, unknown>) =>
  (s.proposta as { documento: string; situacao: string }[]).map((p) => [p.documento, p.situacao]);

test("checklist_habilitacao: sem cronograma gravado as linhas do cronograma ficam sem_cronograma, com aviso e passo", async () => {
  const sem = sc(await checklist(cenarioChecklist({ cronograma: null }).deps));
  assert.deepEqual(propostaDe(sem), [
    ["proposta_pdf", "falta"],
    ["proposta_xlsx", "falta"],
    ["cronograma_pdf", "sem_cronograma"],
    ["cronograma_xlsx", "sem_cronograma"],
  ]);
  assert.deepEqual(avisosDe(sem), [AVISO_SEM_CRONOGRAMA]);
  const passos = sem.proximos_passos as string[];
  assert.ok(passos.includes("Gere a proposta: gerar_documentos_proposta."));
  assert.ok(passos.includes(PASSO_CRONOGRAMA));
  // o cronograma_pdf fora de faltam: edital, proposta_pdf, 8 essenciais (análise tem sessão, então não falta)
  assert.equal((sem.resumo as { faltam: number }).faltam, 1 + 1 + 8);

  // com cronograma gravado: conta em faltam como sempre, sem aviso e sem o passo
  const com = sc(await checklist(cenarioChecklist({}).deps));
  assert.deepEqual(propostaDe(com), [
    ["proposta_pdf", "falta"],
    ["proposta_xlsx", "falta"],
    ["cronograma_pdf", "falta"],
    ["cronograma_xlsx", "falta"],
  ]);
  assert.deepEqual(avisosDe(com), []);
  assert.ok(!(com.proximos_passos as string[]).includes(PASSO_CRONOGRAMA));
  assert.ok(
    (com.proximos_passos as string[]).includes(
      "Gere a proposta e o cronograma: gerar_documentos_proposta."
    )
  );
  assert.equal((com.resumo as { faltam: number }).faltam, 1 + 2 + 8);
});

test("checklist_habilitacao: o cronograma gravado vem de cronograma_ff (objeto ou texto do legado); texto inválido, vazio ou meses 0 = sem cronograma", async () => {
  const tem = async (cronograma: unknown) =>
    !avisosDe(sc(await checklist(cenarioChecklist({ cronograma }).deps))).includes(
      AVISO_SEM_CRONOGRAMA
    );
  // com cronograma
  assert.equal(await tem({ meses: 3, pct: {} }), true);
  assert.equal(await tem({ meses: 1 }), true);
  assert.equal(await tem(JSON.stringify({ meses: 6, pct: { "1": [100, 0, 0, 0, 0, 0] } })), true);
  assert.equal(await tem({ meses: "4" }), true); // normalizarCronograma aceita número em texto
  // sem cronograma (a mesma leitura da gerar_documentos_proposta)
  for (const ruim of [
    null,
    undefined,
    {},
    [],
    "",
    "isto não é JSON",
    "null",
    "[]",
    "42",
    { meses: 0 },
    { meses: -2 },
    { meses: "x" },
    { pct: { "1": [100] } },
    JSON.stringify({ meses: 0 }),
  ]) {
    assert.equal(await tem(ruim), false, JSON.stringify(ruim));
  }
});

const AVISO_CRONOGRAMA_ANTIGO =
  "Há arquivos de cronograma gerados antes na pasta, mas a oportunidade não tem cronograma gravado.";

test("checklist_habilitacao: arquivo de cronograma gerado antes NÃO conta como cronograma gravado (só cronograma_ff conta), mas avisa", async () => {
  const faltam = (s: Record<string, unknown>) => (s.resumo as { faltam: number }).faltam;
  // só o Excel antigo, com cronograma_ff vazio: sem cronograma gravado; o arquivo mostra a situação real
  const soXlsx = sc(
    await checklist(
      cenarioChecklist({
        cronograma: {},
        arquivos: [linhaArquivo("c2", "gerado:cronograma:xlsx")],
      }).deps
    )
  );
  assert.deepEqual(avisosDe(soXlsx), [AVISO_SEM_CRONOGRAMA, AVISO_CRONOGRAMA_ANTIGO]);
  assert.deepEqual(propostaDe(soXlsx), [
    ["proposta_pdf", "falta"],
    ["proposta_xlsx", "falta"],
    ["cronograma_pdf", "sem_cronograma"],
    ["cronograma_xlsx", "ok"],
  ]);
  assert.ok((soXlsx.proximos_passos as string[]).includes(PASSO_CRONOGRAMA));
  // edital, proposta_pdf e 8 essenciais; o cronograma_pdf que não existe não conta
  assert.equal(faltam(soXlsx), 1 + 1 + 8);

  // o PDF antigo (pendente de assinatura) também: o arquivo continua valendo como arquivo, o cronograma não
  const pdf = sc(
    await checklist(
      cenarioChecklist({
        cronograma: null,
        arquivos: [
          linhaArquivo("c1", "gerado:cronograma:pdf", {
            assinatura: "pendente",
            nome: "Cronograma.pdf",
          }),
        ],
      }).deps
    )
  );
  assert.deepEqual(avisosDe(pdf), [AVISO_SEM_CRONOGRAMA, AVISO_CRONOGRAMA_ANTIGO]);
  assert.deepEqual(propostaDe(pdf), [
    ["proposta_pdf", "falta"],
    ["proposta_xlsx", "falta"],
    ["cronograma_pdf", "falta_assinar"],
    ["cronograma_xlsx", "sem_cronograma"],
  ]);
  assert.equal((pdf.resumo as { falta_assinar: number }).falta_assinar, 1);
  assert.ok((pdf.proximos_passos as string[]).includes(PASSO_CRONOGRAMA));

  // origem parecida que não é a do cronograma gerado: só o aviso de sem cronograma
  const outra = sc(
    await checklist(
      cenarioChecklist({
        cronograma: null,
        arquivos: [linhaArquivo("c3", "gerado:proposta:pdf"), linhaArquivo("c4", "url:cronograma")],
      }).deps
    )
  );
  assert.deepEqual(avisosDe(outra), [AVISO_SEM_CRONOGRAMA]);

  // com cronograma gravado, o arquivo gerado é o de sempre: sem nenhum dos dois avisos
  const gravado = sc(
    await checklist(
      cenarioChecklist({
        arquivos: [linhaArquivo("c5", "gerado:cronograma:pdf", { assinatura: "assinado" })],
      }).deps
    )
  );
  assert.deepEqual(avisosDe(gravado), []);
  assert.deepEqual(propostaDe(gravado)[2], ["cronograma_pdf", "ok"]);
});

const EDITAL_TECNICO = {
  extraido: {
    datas: { sessao: { data: "2026-11-05" } },
    habilitacao: { tecnica_operacional: [{ id: "op1", descricao: "Iluminação pública" }] },
  },
};

test("checklist_habilitacao: sem a análise do edital soma 1 a faltam e manda gravar a análise (nunca pronto)", async () => {
  const s = sc(await checklist(cenarioChecklist({ analise: null }).deps));
  const resumo = s.resumo as { sem_analise: number; sem_atende: number; pronto: boolean };
  assert.deepEqual([resumo.sem_analise, resumo.sem_atende, resumo.pronto], [1, 0, false]);
  assert.ok(
    (s.proximos_passos as string[]).includes(
      "Grave a análise do edital (ler_edital_anexado e criar_ou_atualizar_oportunidade) para o SIGO conferir as exigências."
    )
  );
  // o aviso é o mesmo de antes; a análise `{}` conta como ausente (mesma regra do checklist)
  const vazia = sc(await checklist(cenarioChecklist({ analise: { extraido: {} } }).deps));
  assert.equal((vazia.resumo as { sem_analise: number }).sem_analise, 1);
  assert.match(avisosDe(vazia)[0], /ainda não tem a análise do edital/);
});

const AVISO_ANALISE_VAZIA =
  "A análise do edital gravada na oportunidade não tem nenhuma exigência de habilitação: o checklist cobre só os documentos essenciais. Releia a habilitação do edital (ler_edital_anexado) e grave de novo com criar_ou_atualizar_oportunidade.";
const PASSO_ANALISE_VAZIA =
  "Releia a parte de habilitação do edital (ler_edital_anexado, roteiro analisar_edital) e grave com criar_ou_atualizar_oportunidade passando o oportunidade_id desta oportunidade: a análise gravada não tem nenhuma exigência de habilitação.";

test("checklist_habilitacao: análise gravada porém vazia (forma real do sanearEdital) conta como sem_analise, com aviso e passo próprios", async () => {
  // o Claude leu um edital cuja habilitação está noutro anexo e gravou tudo vazio: antes dava pronto: true
  const docs = [
    "cnd_federal",
    "cnd_estadual",
    "cnd_municipal",
    "crf_fgts",
    "cndt_trabalhista",
    "certidao_falencia",
    "contrato_social",
    "cartao_cnpj",
  ].map((tipo, i) => doc(`d${i}`, tipo, { validade: "2027-12-31" }));
  const tudoAnexado = [
    linhaArquivo("e1", null, { categoria: "edital" }),
    linhaArquivo("p1", "gerado:proposta:pdf", { assinatura: "assinado" }),
    linhaArquivo("p3", "gerado:cronograma:pdf", { assinatura: "assinado" }),
    ...docs.map((d) => linhaArquivo(`b-${d.id}`, `biblioteca:${d.id}`)),
  ];
  const montar = (extraido: unknown) =>
    checklist(cenarioChecklist({ analise: { extraido }, docs, arquivos: tudoAnexado }).deps);
  type Resumo = {
    sem_analise: number;
    faltam: number;
    pronto: boolean;
    sem_pendencia_do_sigo: boolean;
  };
  for (const extraido of [
    sanearEdital({}),
    sanearEdital({ objeto: "Iluminação pública", datas: { sessao: { data: "2026-11-05" } } }),
  ]) {
    const s = sc(await montar(extraido));
    const resumo = s.resumo as Resumo;
    assert.deepEqual(
      [resumo.sem_analise, resumo.faltam, resumo.pronto, resumo.sem_pendencia_do_sigo],
      [1, 1, false, false]
    );
    assert.equal(avisosDe(s)[0], AVISO_ANALISE_VAZIA);
    assert.deepEqual(s.proximos_passos, [PASSO_ANALISE_VAZIA]);
    // não é o texto de "ainda não tem a análise"
    assert.ok(!avisosDe(s).some((a) => /ainda não tem a análise/.test(a)));
  }
  // controle positivo: com uma exigência de habilitação (a mesma montagem) o checklist fica pronto de verdade
  const ok = sc(
    await montar(
      sanearEdital({
        datas: { sessao: { data: "2026-11-05" } },
        habilitacao: {
          outros_documentos: [{ descricao: "Certidão Negativa de Débitos Trabalhistas (CNDT)" }],
        },
      })
    )
  );
  assert.deepEqual(ok.resumo, {
    faltam: 0,
    vencidos: 0,
    falta_assinar: 0,
    verificar: 0,
    desatualizadas: 0,
    sem_analise: 0,
    sem_atende: 0,
    atende_negativo: 0,
    conferir_a_mao: 0,
    sem_pendencia_do_sigo: true,
    pronto: true,
  });
  assert.deepEqual(avisosDe(ok), []);
  assert.deepEqual(ok.proximos_passos, []);
});

test("checklist_habilitacao: edital com qualificação técnica e sem Atende? → sem_atende, passo com registrar_atende, nunca pronto", async () => {
  const s = sc(await checklist(cenarioChecklist({ analise: EDITAL_TECNICO }).deps));
  assert.equal((s.resumo as { sem_atende: number }).sem_atende, 1);
  assert.ok(
    (s.proximos_passos as string[]).includes(
      "Confira o acervo técnico contra o edital e grave com registrar_atende."
    )
  );
  // não há veredito para reclamar: o aviso do veredito não sai
  assert.ok(!avisosDe(s).includes(AVISO_ATENDE_NAO_CONCLUI));
  // Atende? gravado com veredito, mas sem nenhuma CAT: continua faltando
  const semCat = sc(
    await checklist(
      cenarioChecklist({
        analise: { ...EDITAL_TECNICO, atende: { veredito: "atende", cats_anexar: [] } },
      }).deps
    )
  );
  assert.equal((semCat.resumo as { sem_atende: number }).sem_atende, 1);
});

test("checklist_habilitacao: veredito do Atende? diferente de 'atende' é só aviso (não conta em faltam)", async () => {
  const comVeredito = (veredito: string, extraido: unknown = EDITAL_TECNICO.extraido) =>
    checklist(
      cenarioChecklist({
        analise: { extraido, atende: { veredito, cats_anexar: [{ id: AT1 }] } },
        atestados: [atestado(AT1)],
        arquivos: [linhaArquivo("a1", `acervo:${AT1}`)],
      }).deps
    );
  for (const veredito of ["atende_parcialmente", "nao_atende"]) {
    const s = sc(await comVeredito(veredito));
    const resumo = s.resumo as { sem_atende: number; faltam: number };
    assert.equal(resumo.sem_atende, 0, veredito);
    assert.ok(avisosDe(s).includes(AVISO_ATENDE_NAO_CONCLUI), veredito);
    // a CAT está anexada: o que falta é só o resto (edital, proposta_pdf, cronograma_pdf, 8 essenciais)
    assert.equal(resumo.faltam, 1 + 2 + 8, veredito);
  }
  // "atende": nenhum aviso do veredito
  assert.ok(!avisosDe(sc(await comVeredito("atende"))).includes(AVISO_ATENDE_NAO_CONCLUI));
  // edital sem exigência técnica: o veredito do Atende? ("atende_parcialmente" quando não há itens) não é problema
  const semTecnica = sc(await comVeredito("atende_parcialmente", { habilitacao: {} }));
  assert.ok(!avisosDe(semTecnica).includes(AVISO_ATENDE_NAO_CONCLUI));
});

test("checklist_habilitacao: veredito nao_atende trava o pronto (atende_negativo) e manda revisar com o usuário; parcialmente só avisa", async () => {
  const comVeredito = async (veredito: string) =>
    sc(
      await checklist(
        cenarioChecklist({
          analise: {
            extraido: EDITAL_TECNICO.extraido,
            atende: { veredito, cats_anexar: [{ id: AT1 }] },
          },
          atestados: [atestado(AT1)],
          arquivos: [linhaArquivo("a1", `acervo:${AT1}`)],
        }).deps
      )
    );
  const resumo = (s: Record<string, unknown>) =>
    s.resumo as { atende_negativo: number; sem_atende: number; faltam: number; pronto: boolean };
  const negativo = await comVeredito("nao_atende");
  assert.deepEqual(
    [resumo(negativo).atende_negativo, resumo(negativo).sem_atende, resumo(negativo).pronto],
    [1, 0, false]
  );
  assert.ok(
    (negativo.proximos_passos as string[]).includes(
      "O Atende? concluiu que a empresa NÃO atende à qualificação técnica do edital: revise com o usuário antes de seguir."
    )
  );
  assert.ok(avisosDe(negativo).includes(AVISO_ATENDE_NAO_CONCLUI));
  // atende_parcialmente continua só aviso: não trava e não gera o passo
  const parcial = await comVeredito("atende_parcialmente");
  assert.equal(resumo(parcial).atende_negativo, 0);
  assert.ok(avisosDe(parcial).includes(AVISO_ATENDE_NAO_CONCLUI));
  assert.ok(!(parcial.proximos_passos as string[]).some((p) => p.includes("NÃO atende")));
  assert.equal(resumo(await comVeredito("atende")).atende_negativo, 0);
});

test("checklist_habilitacao: registro fora do CREA exige o veredito do Atende? (sem exigir CAT); o aviso do veredito vale também para ele", async () => {
  const comRegistro = (atende: unknown, tipos = ["cadastro_concessionaria"]) =>
    checklist(
      cenarioChecklist({
        analise: {
          extraido: sanearEdital({
            datas: { sessao: { data: "2026-11-05" } },
            habilitacao: {
              outros_documentos: [
                { descricao: "Certidão Negativa de Débitos Trabalhistas (CNDT)" },
              ],
              registros: tipos.map((tipo) => ({ tipo, descricao: "Cadastro na concessionária" })),
            },
          }),
          atende,
        },
      }).deps
    );
  const resumo = (s: Record<string, unknown>) =>
    s.resumo as { sem_atende: number; atende_negativo: number };
  // sem Atende? gravado: sem_atende, e o passo manda gravar com registrar_atende
  const sem = sc(await comRegistro(null));
  assert.equal(resumo(sem).sem_atende, 1);
  assert.ok(
    (sem.proximos_passos as string[]).includes(
      "Confira o acervo técnico contra o edital e grave com registrar_atende."
    )
  );
  // só o veredito basta (nenhuma CAT é exigida)
  const atende = sc(await comRegistro({ veredito: "atende" }));
  assert.equal(resumo(atende).sem_atende, 0);
  assert.ok(!avisosDe(atende).includes(AVISO_ATENDE_NAO_CONCLUI));
  // veredito que não é "atende": o mesmo aviso de sempre
  const parcial = sc(await comRegistro({ veredito: "atende_parcialmente" }));
  assert.equal(resumo(parcial).sem_atende, 0);
  assert.ok(avisosDe(parcial).includes(AVISO_ATENDE_NAO_CONCLUI));
  assert.equal(resumo(sc(await comRegistro({ veredito: "nao_atende" }))).atende_negativo, 1);
  // só CREA: o que se confere é a certidão, o Atende? não é exigido
  const crea = sc(await comRegistro(null, ["crea"]));
  assert.equal(resumo(crea).sem_atende, 0);
});

test("checklist_habilitacao: avisos de visita técnica obrigatória e de garantia da proposta (só quando o edital diz que é exigida)", async () => {
  const AVISO_VISITA = "O edital exige visita técnica: confira a data e o atestado de visita.";
  const AVISO_GARANTIA = "O edital exige garantia da proposta: confira o valor e a forma.";
  const avisos = async (extra: Record<string, unknown>) =>
    avisosDe(
      sc(
        await checklist(
          cenarioChecklist({
            analise: {
              extraido: sanearEdital({
                datas: { sessao: { data: "2026-11-05" } },
                habilitacao: ANALISE_DO_CHECKLIST.extraido.habilitacao,
                ...extra,
              }),
            },
          }).deps
        )
      )
    );
  // visita obrigatória: o aviso; garantia exigida: o aviso (nesta ordem, depois dos demais)
  assert.deepEqual(
    await avisos({
      datas: { sessao: { data: "2026-11-05" }, visita_tecnica: { obrigatoria: true } },
    }),
    [AVISO_VISITA]
  );
  assert.deepEqual(await avisos({ garantia_proposta: { exigida: true, percentual: 1 } }), [
    AVISO_GARANTIA,
  ]);
  assert.deepEqual(
    await avisos({
      datas: { sessao: { data: "2026-11-05" }, visita_tecnica: { obrigatoria: true } },
      garantia_proposta: { exigida: true },
    }),
    [AVISO_VISITA, AVISO_GARANTIA]
  );
  // não exigida, desconhecida ou texto: nada
  assert.deepEqual(
    await avisos({
      datas: { sessao: { data: "2026-11-05" }, visita_tecnica: { obrigatoria: false } },
      garantia_proposta: { exigida: false },
    }),
    []
  );
  assert.deepEqual(await avisos({}), []);
  // a análise bruta (sem passar pelo sanearEdital) com texto no lugar do booleano também não avisa
  const bruta = sc(
    await checklist(
      cenarioChecklist({
        analise: {
          extraido: {
            ...ANALISE_DO_CHECKLIST.extraido,
            datas: { sessao: { data: "2026-11-05" }, visita_tecnica: { obrigatoria: "sim" } },
            garantia_proposta: "exigida",
          },
        },
      }).deps
    )
  );
  assert.deepEqual(avisosDe(bruta), []);
});

test("checklist_habilitacao: a descrição manda repassar os avisos e não ler o pronto isolado", () => {
  const d = ferramenta("checklist_habilitacao").def.description;
  assert.match(d, /Repasse os avisos/);
  assert.match(d, /não leia (o )?pronto isolado|pronto sozinho não basta/i);
  assert.match(d, /conferir_a_mao/);
  assert.match(d, /sem_pendencia_do_sigo/);
  assert.match(d, /Só lê/);
});

test("checklist_habilitacao: certidão anexada sem validade cadastrada avisa (só as certidões, só as anexadas)", async () => {
  const docs = [
    doc("d1", "crf_fgts", { validade: null }), // certidão anexada sem validade: avisa
    doc("d2", "cnd_federal", { validade: "2026-12-31" }), // com validade: não avisa
    doc("d3", "cartao_cnpj", { validade: null }), // documento (não certidão): não avisa
    doc("d4", "cndt_trabalhista", { validade: null }), // certidão que nem foi anexada: não avisa
    doc("d5", "cnd_estadual", { validade: null }), // anexada sem validade: avisa (na ordem da lista)
  ];
  const arquivos = ["d1", "d2", "d3", "d5"].map((d) => linhaArquivo(`a-${d}`, `biblioteca:${d}`));
  const s = sc(await checklist(cenarioChecklist({ docs, arquivos }).deps));
  assert.deepEqual(avisosDe(s), [
    "Certidão(ões) sem validade cadastrada na biblioteca: CND Estadual; CRF do FGTS. Confira as datas.",
  ]);
  // o documento fica anexado (o aviso não muda a situação)
  const cert = (tipo: string) =>
    (s.certidoes as { tipo: string; situacao: string; validade: string | null }[]).find(
      (x) => x.tipo === tipo
    )!;
  assert.deepEqual([cert("crf_fgts").situacao, cert("crf_fgts").validade], ["anexado", null]);
  // sem nenhuma anexada sem validade, sem o aviso
  const nada = sc(
    await checklist(
      cenarioChecklist({
        docs: [doc("d2", "cnd_federal", { validade: "2026-12-31" })],
        arquivos: [linhaArquivo("a2", "biblioteca:d2")],
      }).deps
    )
  );
  assert.deepEqual(avisosDe(nada), []);
});

test("checklist_habilitacao: ordem dos avisos — análise, sessão, cronograma, Atende?, certidão sem validade", async () => {
  // sem data de sessão, com um documento anexado que tem validade (por isso o aviso da sessão) e uma certidão sem
  const docs = [
    doc("d1", "crf_fgts", { validade: null }),
    doc("d2", "cnd_federal", { validade: "2026-12-31" }),
  ];
  const s = sc(
    await checklist(
      cenarioChecklist({
        analise: {
          extraido: { habilitacao: { tecnica_operacional: [{ id: "op1" }] } },
          atende: { veredito: "nao_atende", cats_anexar: [{ id: AT1 }] },
        },
        cronograma: null,
        docs,
        arquivos: [linhaArquivo("a1", "biblioteca:d1"), linhaArquivo("a2", "biblioteca:d2")],
        atestados: [atestado(AT1)],
      }).deps
    )
  );
  assert.deepEqual(avisosDe(s), [
    "A oportunidade não tem data de sessão futura: não conferi se algum documento vence antes dela.",
    AVISO_SEM_CRONOGRAMA,
    AVISO_ATENDE_NAO_CONCLUI,
    "Certidão(ões) sem validade cadastrada na biblioteca: CRF do FGTS. Confira as datas.",
  ]);
  const sem = sc(await checklist(cenarioChecklist({ analise: null, cronograma: null }).deps));
  assert.deepEqual(avisosDe(sem).length, 2);
  assert.match(avisosDe(sem)[0], /ainda não tem a análise do edital/);
  assert.equal(avisosDe(sem)[1], AVISO_SEM_CRONOGRAMA);
});

test("checklist_habilitacao: CAT sumida do acervo manda refazer o Atende?, e a aba das CATs tem o nome real", async () => {
  const s = sc(
    await checklist(
      cenarioChecklist({
        analise: {
          ...SESSAO_EDITAL,
          atende: { veredito: "atende", cats_anexar: [{ id: AT1 }, { id: AT2 }] },
        },
        atestados: [atestado(AT2, { arquivo_ref: null })],
      }).deps
    )
  );
  const passos = s.proximos_passos as string[];
  assert.ok(passos.includes("Envie o PDF destas CATs em Acervo técnico → Documentos: 52/2025."));
  assert.ok(
    passos.includes(
      `Refaça o Atende? desta oportunidade (ler_acervo e registrar_atende): 1 CAT(s) citada(s) não estão mais no acervo técnico: ${AT1}.`
    )
  );
});

test("checklist_habilitacao: não grava nada — nem arquivo, nem histórico, nem RPC (idempotente)", async () => {
  const { deps, fake } = cenarioChecklist({
    docs: [doc("d1", "crf_fgts")],
    arquivos: [linhaArquivo("a1", "biblioteca:d1")],
  });
  const a = sc(await checklist(deps));
  const b = sc(await checklist(deps));
  assert.deepEqual(a, b);
  assert.ok(fake.chamadas.every((c) => c.op === "select"));
  assert.ok(!fake.chamadas.some((c) => c.tabela === "oportunidade_atualizacao"));
  assert.ok(!fake.chamadas.some((c) => c.tabela === "conector_gravar_arquivo"));
  assert.equal(fake.chamadasStorage.length, 0);
});

// ─── instruções e prompt "Montar a licitação completa" (Task C6) ─────────────────────────────

test("instruções e prompt 'Montar a licitação completa'", () => {
  const total = INSTRUCOES_HABILITACAO.reduce((s, l) => s + l.length, 0);
  assert.ok(total <= 800, `INSTRUCOES_HABILITACAO com ${total}`);
  assert.deepEqual(
    PROMPTS_HABILITACAO.map((p) => [p.name, p.title]),
    [["montar_licitacao_completa", "Montar a licitação completa"]]
  );
  const texto = PROMPTS_HABILITACAO[0].montar({});
  const ordem = [
    "empresa_atual",
    "criar_ou_atualizar_oportunidade",
    "registrar_atende",
    "importar_orcamento",
    "aplicar_desconto",
    "importar_cronograma",
    "gerar_documentos_proposta",
    "anexar_habilitacao",
    "anexar_acervo",
    "gerar_declaracoes",
    "anexar_edital_por_url",
    "checklist_habilitacao",
  ];
  let pos = -1;
  for (const nome of ordem) {
    const i = texto.indexOf(nome, pos + 1);
    assert.ok(i > pos, `${nome} fora de ordem`);
    pos = i;
  }
  assert.ok(texto.includes("DADOS"));
  const comId = PROMPTS_HABILITACAO[0].montar({ oportunidade_id: OP });
  assert.ok(comId.includes(OP));
});

test("INSTRUCOES_HABILITACAO: cita as cinco ferramentas, o vencido, o falta assinar e o checklist", () => {
  const texto = INSTRUCOES_HABILITACAO.join("\n");
  for (const nome of [
    "gerar_documentos_proposta",
    "gerar_declaracoes",
    "anexar_habilitacao",
    "anexar_acervo",
    "anexar_edital_por_url",
    "checklist_habilitacao",
  ]) {
    assert.ok(texto.includes(nome), nome);
    assert.ok(NOMES_FERRAMENTAS.includes(nome), `${nome} não está em NOMES_FERRAMENTAS`);
  }
  assert.match(texto, /vencido não é anexado/);
  assert.match(texto, /falta assinar/);
  assert.match(texto, /gov\.br/);
  assert.match(texto, /não tente enviar arquivo do chat/i);
  // revisão 2: o fim da instrução manda repassar os avisos e usar os dois campos do resumo
  const fim = INSTRUCOES_HABILITACAO[INSTRUCOES_HABILITACAO.length - 1];
  assert.match(fim, /checklist_habilitacao/);
  assert.match(fim, /avisos/);
  assert.match(fim, /sem_pendencia_do_sigo/);
  assert.match(fim, /conferir_a_mao/);
});

test("prompt 'Montar a licitação completa': um passo por linha, em ordem, sem ferramenta inexistente", () => {
  const texto = PROMPTS_HABILITACAO[0].montar({});
  const linhas = texto.split("\n");
  // os passos 1 a 10, cada um numa linha só, na ordem
  const posicoes = Array.from({ length: 10 }, (_, k) => {
    const achadas = linhas.filter((l) => l.startsWith(`${k + 1}. `));
    assert.equal(achadas.length, 1, `passo ${k + 1}`);
    return linhas.indexOf(achadas[0]);
  });
  assert.deepEqual(
    [...posicoes].sort((a, b) => a - b),
    posicoes
  );
  // a análise do edital é gravada por criar_ou_atualizar_oportunidade (não existe registrar_edital)
  assert.ok(!texto.includes("registrar_edital"));
  // toda palavra com cara de ferramenta (verbo_substantivo) é uma ferramenta que existe de verdade
  const COM_CARA_DE_FERRAMENTA =
    /^(registrar|criar|importar|aplicar|gerar|anexar|checklist|ler|buscar|obter|empresa|adicionar|cadastrar|status)_/;
  for (const nome of texto.match(/\b[a-z]+(?:_[a-z]+)+\b/g) ?? []) {
    if (COM_CARA_DE_FERRAMENTA.test(nome)) {
      assert.ok(NOMES_FERRAMENTAS.includes(nome), `${nome} não é ferramenta do conector`);
    }
  }
  // as variáveis, os modelos padrão e as categorias do edital vêm das listas reais (nada desatualizado)
  for (const v of VARIAVEIS_DECLARACAO) assert.ok(texto.includes(`{${v}}`), `variável {${v}}`);
  for (const m of CHAVES_MODELO_PADRAO) assert.ok(texto.includes(m), `modelo ${m}`);
  for (const c of CATEGORIAS_EDITAL) assert.ok(texto.includes(c), `categoria ${c}`);
  assert.ok(texto.includes("Credenciamento"));
});

test("prompt 'Montar a licitação completa': cada saída nova das ferramentas é explicada no passo certo", () => {
  const linhas = PROMPTS_HABILITACAO[0].montar({}).split("\n");
  const passo = (n: number) => linhas.find((l) => l.startsWith(`${n}. `)) ?? "";
  const precisa = (n: number, trechos: (string | RegExp)[]) => {
    for (const t of trechos) {
      const ok = typeof t === "string" ? passo(n).includes(t) : t.test(passo(n));
      assert.ok(ok, `passo ${n} sem ${t}`);
    }
  };
  // 5: proposta e cronograma
  precisa(5, [
    "orcamento_grande_demais",
    "800",
    "Exportar proposta",
    "mantidos_assinados",
    "exclui o PDF assinado",
    "falhas",
    "validade_dias",
  ]);
  // 6: habilitação (o conector nunca apaga arquivo)
  precisa(6, [
    "vencidos",
    "faltam",
    "copias_desatualizadas",
    "falhas",
    /exclu\w+ essas cópias/,
    "não apaga",
  ]);
  // 7: CATs
  precisa(7, ["sem_pdf", "atestado_ids"]);
  // 8: declarações
  precisa(8, ["mantidas_assinadas", "falhas", "variaveis_sem_valor", "gerar_declaracoes"]);
  // 9: edital pelo link
  precisa(9, [
    "ja_estava_anexado",
    "Preparar para o Claude",
    "ler_edital_anexado",
    "gerar_link_envio",
  ]);
  // 10: checklist (só "pronto" quando a ferramenta diz)
  precisa(10, [
    "resumo.pronto",
    "sem_analise",
    "sem_atende",
    "sem_cronograma",
    "verificar",
    "copias_desatualizadas",
    "falta_assinar",
    // revisão 2: o que o Claude diz quando só restam linhas a conferir à mão, e o que trava o pronto
    "sem_pendencia_do_sigo",
    "conferir_a_mao",
    "atende_negativo",
    "avisos",
    "proximos_passos",
  ]);
  // o pronto continua sendo o único jeito de dizer "pronta"; sem_pendencia_do_sigo só autoriza dizer o que sobra
  assert.match(passo(10), /Só diga que a habilitação está pronta se resumo\.pronto for true/);
  assert.match(passo(10), /sem_pendencia_do_sigo for true/);
  const texto = linhas.join("\n");
  assert.match(texto, /nunca afirme que um documento está anexado, gerado ou válido sem/i);
  assert.match(texto, /Não informe nome nem CPF de representante/);
  assert.match(texto, /Configurações → Empresa/);
});
