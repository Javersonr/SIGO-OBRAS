// node --test supabase/functions/_shared/habilitacao/checklist.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sanearEdital } from "../edital/edital-regras.ts";
import {
  classificarExigencia,
  conferirCopiasComOsAtivos,
  copiasDaBiblioteca,
  documentoVencido,
  exigeAtende,
  exigeQualificacaoTecnica,
  montarChecklist,
  situacaoDaAnalise,
  temRegistroForaDoCrea,
  vereditoDoAtende,
  PREFIXO_BIBLIOTECA,
  type ArquivoChecklist,
  type EntradaChecklist,
} from "./checklist.ts";

const HOJE = "2026-10-13";
const AT1 = "00000000-0000-4000-8000-000000000051";
const AT2 = "00000000-0000-4000-8000-000000000052";

test("classificarExigencia: certidões, documentos e declarações pelo texto do edital", () => {
  const c = (t: unknown) => classificarExigencia(t);
  assert.deepEqual(c("Certificado de Regularidade do FGTS"), {
    tipos: ["crf_fgts"],
    declaracoes: [],
  });
  assert.deepEqual(c("Certidão Negativa de Débitos Trabalhistas (CNDT)"), {
    tipos: ["cndt_trabalhista"],
    declaracoes: [],
  });
  assert.deepEqual(c("Certidão negativa de falência ou recuperação judicial"), {
    tipos: ["certidao_falencia"],
    declaracoes: [],
  });
  assert.deepEqual(c("Prova de regularidade com as Fazendas Federal, Estadual e Municipal"), {
    tipos: ["cnd_federal", "cnd_estadual", "cnd_municipal"],
    declaracoes: [],
  });
  assert.deepEqual(c("Certidão conjunta de tributos federais e dívida ativa da União"), {
    tipos: ["cnd_federal"],
    declaracoes: [],
  });
  assert.deepEqual(c("Prova de inscrição estadual"), {
    tipos: ["inscricao_estadual"],
    declaracoes: [],
  });
  assert.deepEqual(c("Comprovante de inscrição no CNPJ"), {
    tipos: ["cartao_cnpj"],
    declaracoes: [],
  });
  assert.deepEqual(c("Ato constitutivo, estatuto ou contrato social em vigor"), {
    tipos: ["contrato_social"],
    declaracoes: [],
  });
  assert.deepEqual(c("Balanço patrimonial do último exercício"), {
    tipos: ["balanco_dre"],
    declaracoes: [],
  });
  assert.deepEqual(c("Certidão de registro da empresa no CREA"), {
    tipos: ["certidao_crea_pj"],
    declaracoes: [],
  });
  assert.deepEqual(c("Alvará de funcionamento"), { tipos: ["alvara"], declaracoes: [] });
  assert.deepEqual(c("Declaração de que não emprega menor (art. 7º, XXXIII, da CF)"), {
    tipos: [],
    declaracoes: ["nao_emprega_menor"],
  });
  assert.deepEqual(c("Declaração de inexistência de fatos impeditivos"), {
    tipos: [],
    declaracoes: ["fato_impeditivo"],
  });
  assert.deepEqual(c("Declaração de enquadramento como ME/EPP (Lei Complementar nº 123)"), {
    tipos: [],
    declaracoes: ["me_epp"],
  });
  assert.deepEqual(c("Declaração de cumprimento dos requisitos de habilitação"), {
    tipos: [],
    declaracoes: ["requisitos_habilitacao"],
  });
  assert.deepEqual(c("Declaração de reserva de cargos para pessoa com deficiência"), {
    tipos: [],
    declaracoes: ["reserva_cargos"],
  });
  assert.deepEqual(c("Declaração de elaboração independente de proposta"), {
    tipos: [],
    declaracoes: ["elaboracao_independente"],
  });
  assert.deepEqual(c("Atestado de visita técnica emitido pela Secretaria de Obras"), {
    tipos: [],
    declaracoes: [],
  });
  assert.deepEqual(c(""), { tipos: [], declaracoes: [] });
  assert.deepEqual(c(null), { tipos: [], declaracoes: [] });
});

const arq = (
  id: string,
  origem: string | null,
  extra: Partial<ArquivoChecklist> = {}
): ArquivoChecklist => ({
  id,
  nome: `Arquivo ${id}`,
  pasta: null,
  categoria: null,
  origem,
  assinatura: null,
  ...extra,
});
const ESSENCIAIS = [
  "cnd_federal",
  "cnd_estadual",
  "cnd_municipal",
  "crf_fgts",
  "cndt_trabalhista",
  "certidao_falencia",
  "contrato_social",
  "cartao_cnpj",
];
const EXTRAIDO = {
  datas: { sessao: { data: "2026-11-05" } },
  exclusiva_me_epp: false,
  habilitacao: {
    economica: [{ id: "ec1", tipo: "patrimonio_liquido" }],
    registros: [{ id: "rg1", tipo: "crea" }],
    outros_documentos: [
      { descricao: "Declaração de que não emprega menor", pagina: 12 },
      { descricao: "Atestado de visita técnica", pagina: 14 },
    ],
  },
};

test("montarChecklist: oportunidade vazia — tudo o que falta e os próximos passos", () => {
  const c = montarChecklist({
    extraido: EXTRAIDO,
    atende: { cats_anexar: [{ id: AT1 }, { id: AT2 }] },
    arquivos: [],
    documentos: [],
    atestados: [
      { id: AT1, numero: "1/2025", arquivo_ref: "certificados/x" },
      { id: AT2, numero: "2/2025", arquivo_ref: null },
    ],
    modelos: [{ chave: "nao_emprega_menor", titulo: "Declaração de que não emprega menor" }],
    hojeISO: HOJE,
  });
  assert.equal(c.sessao, "2026-11-05");
  assert.deepEqual(c.edital, { situacao: "falta", arquivos: 0 });
  assert.deepEqual(
    c.proposta.map((p) => [p.documento, p.situacao]),
    [
      ["proposta_pdf", "falta"],
      ["proposta_xlsx", "falta"],
      ["cronograma_pdf", "falta"],
      ["cronograma_xlsx", "falta"],
    ]
  );
  // essenciais + os que o edital pede (balanço pela exigência econômica; CREA pelo registro)
  assert.deepEqual(
    c.certidoes.map((x) => x.tipo),
    [
      "cnd_federal",
      "cnd_estadual",
      "cnd_municipal",
      "crf_fgts",
      "cndt_trabalhista",
      "certidao_falencia",
      "certidao_crea_pj",
      "contrato_social",
      "cartao_cnpj",
      "balanco_dre",
    ]
  );
  assert.ok(c.certidoes.every((x) => x.situacao === "falta"));
  assert.deepEqual(
    c.certidoes.filter((x) => x.exigido_no_edital).map((x) => x.tipo),
    ["certidao_crea_pj", "balanco_dre"]
  );
  assert.deepEqual(c.acervo, [
    { atestado_id: AT1, numero: "1/2025", situacao: "nao_anexado" },
    { atestado_id: AT2, numero: "2/2025", situacao: "sem_pdf" },
  ]);
  assert.deepEqual(c.declaracoes, [
    {
      chave: "nao_emprega_menor",
      titulo: "Declaração de que não emprega menor",
      exigida_no_edital: true,
      situacao: "falta",
    },
  ]);
  assert.deepEqual(c.outros_documentos, [
    {
      descricao: "Declaração de que não emprega menor",
      pagina: 12,
      classificado_como: ["declaracao:nao_emprega_menor"],
      situacao: "coberto",
    },
    {
      descricao: "Atestado de visita técnica",
      pagina: 14,
      classificado_como: [],
      situacao: "verificar",
    },
  ]);
  assert.deepEqual(c.falta_assinar, []);
  // faltam: edital 1 + proposta_pdf e cronograma_pdf 2 + 10 documentos + 2 CATs + 1 declaração
  assert.deepEqual(c.resumo, {
    faltam: 16,
    vencidos: 0,
    falta_assinar: 0,
    verificar: 1,
    desatualizadas: 0,
    sem_analise: 0,
    sem_atende: 0,
    atende_negativo: 0,
    conferir_a_mao: 1,
    sem_pendencia_do_sigo: false,
    pronto: false,
  });
  assert.ok(c.proximos_passos.some((p) => p.includes("anexar_edital_por_url")));
  assert.ok(c.proximos_passos.some((p) => p.includes("gerar_documentos_proposta")));
  assert.ok(c.proximos_passos.some((p) => p.includes("gerar_declaracoes")));
  assert.ok(c.proximos_passos.some((p) => p.includes("anexar_acervo")));
  assert.ok(c.proximos_passos.some((p) => p.includes("Documentos e certidões")));
});

test("montarChecklist: tudo anexado e assinado → pronto", () => {
  const documentos = [...ESSENCIAIS, "certidao_crea_pj", "balanco_dre"].map((tipo, i) => ({
    id: `d${i}`,
    tipo,
    nome: `Doc ${tipo}`,
    validade: tipo.startsWith("c") ? "2026-12-31" : null,
    ativo: true,
  }));
  const arquivos = [
    arq("e1", null, { categoria: "edital" }),
    arq("p1", "gerado:proposta:pdf", { assinatura: "assinado" }),
    arq("p2", "gerado:proposta:xlsx"),
    arq("p3", "gerado:cronograma:pdf", { assinatura: "assinado" }),
    arq("p4", "gerado:cronograma:xlsx"),
    ...documentos.map((d) => arq(`b-${d.id}`, `biblioteca:${d.id}`)),
    arq("a1", `acervo:${AT1}`),
    arq("dc1", "declaracao:nao_emprega_menor:pdf", { assinatura: "assinado" }),
    arq("dc2", "declaracao:nao_emprega_menor:docx"),
  ];
  const c = montarChecklist({
    extraido: {
      ...EXTRAIDO,
      habilitacao: {
        ...EXTRAIDO.habilitacao,
        outros_documentos: [EXTRAIDO.habilitacao.outros_documentos[0]],
      },
    },
    atende: { cats_anexar: [{ id: AT1 }] },
    arquivos,
    documentos,
    atestados: [{ id: AT1, numero: "1/2025", arquivo_ref: "certificados/x" }],
    modelos: [],
    hojeISO: HOJE,
  });
  assert.ok(
    c.certidoes.every((x) => x.situacao === "anexado"),
    JSON.stringify(c.certidoes)
  );
  assert.ok(c.proposta.every((p) => p.situacao === "ok"));
  assert.deepEqual(
    c.acervo.map((a) => a.situacao),
    ["anexado"]
  );
  assert.deepEqual(
    c.declaracoes.map((d) => d.situacao),
    ["ok"]
  );
  assert.deepEqual(c.copias_desatualizadas, []);
  assert.deepEqual(c.resumo, {
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
  assert.deepEqual(c.proximos_passos, []);
});

test("montarChecklist: vencido, vence antes da sessão, não anexado e falta assinar", () => {
  const documentos = [
    { id: "d1", tipo: "crf_fgts", nome: "CRF", validade: "2026-10-28", ativo: true },
    { id: "d2", tipo: "cnd_federal", nome: "CND", validade: "2026-10-01", ativo: true },
    { id: "d3", tipo: "cndt_trabalhista", nome: "CNDT", validade: "2027-03-01", ativo: true },
    { id: "d4", tipo: "cnd_federal", nome: "CND antiga", validade: "2026-01-01", ativo: false },
  ];
  const arquivos = [
    arq("b1", "biblioteca:d1"),
    arq("p1", "gerado:proposta:pdf", {
      assinatura: "pendente",
      nome: "Proposta.pdf",
      pasta: "Envelope 01 – Proposta",
    }),
    arq("x1", "declaracao:me_epp:pdf", {
      assinatura: "pendente",
      nome: "Declaração ME.pdf",
      pasta: "Envelope 02 – Habilitação",
    }),
  ];
  const c = montarChecklist({
    extraido: null,
    atende: null,
    arquivos,
    documentos,
    atestados: [],
    modelos: [{ chave: "me_epp", titulo: "Declaração de ME/EPP" }],
    hojeISO: HOJE,
  });
  const situacao = (tipo: string) => c.certidoes.find((x) => x.tipo === tipo)?.situacao;
  assert.equal(c.sessao, null);
  assert.equal(situacao("crf_fgts"), "anexado");
  assert.equal(situacao("cnd_federal"), "vencido");
  assert.equal(situacao("cndt_trabalhista"), "nao_anexado");
  assert.equal(situacao("cartao_cnpj"), "falta");
  assert.deepEqual(c.proposta[0], {
    documento: "proposta_pdf",
    situacao: "falta_assinar",
    nome: "Proposta.pdf",
  });
  assert.deepEqual(c.declaracoes, [
    {
      chave: "me_epp",
      titulo: "Declaração de ME/EPP",
      exigida_no_edital: false,
      situacao: "falta_assinar",
    },
  ]);
  assert.deepEqual(c.falta_assinar, [
    { arquivo_id: "p1", nome: "Proposta.pdf", pasta: "Envelope 01 – Proposta" },
    { arquivo_id: "x1", nome: "Declaração ME.pdf", pasta: "Envelope 02 – Habilitação" },
  ]);
  assert.equal(c.resumo.vencidos, 1);
  assert.equal(c.resumo.falta_assinar, 2);
  assert.equal(c.resumo.pronto, false);
  assert.ok(c.proximos_passos.some((p) => p.includes("anexar_habilitacao")));
  assert.ok(c.proximos_passos.some((p) => p.includes("Enviar assinado")));
  // com a sessão em 05/11, o CRF que vence em 28/10 passa a "vence_antes_da_sessao"
  const comSessao = montarChecklist({
    extraido: { datas: { sessao: { data: "2026-11-05" } } },
    atende: null,
    arquivos,
    documentos,
    atestados: [],
    modelos: [],
    hojeISO: HOJE,
  });
  assert.equal(
    comSessao.certidoes.find((x) => x.tipo === "crf_fgts")?.situacao,
    "vence_antes_da_sessao"
  );
  assert.equal(comSessao.resumo.vencidos, 2);
});

test("montarChecklist: edital exclusivo para ME/EPP exige a declaração; texto livre marca os tipos pedidos", () => {
  const c = montarChecklist({
    extraido: {
      exclusiva_me_epp: true,
      habilitacao: {
        outros_documentos: [
          { descricao: "Alvará de funcionamento e prova de inscrição municipal", pagina: null },
        ],
      },
    },
    atende: null,
    arquivos: [],
    documentos: [],
    atestados: [],
    modelos: [{ chave: "me_epp", titulo: "Declaração de ME/EPP" }],
    hojeISO: HOJE,
  });
  assert.deepEqual(
    c.declaracoes.map((d) => [d.chave, d.exigida_no_edital, d.situacao]),
    [["me_epp", true, "falta"]]
  );
  assert.deepEqual(
    c.certidoes.filter((x) => x.exigido_no_edital).map((x) => x.tipo),
    ["inscricao_municipal", "alvara"]
  );
  assert.deepEqual(c.outros_documentos[0].classificado_como, ["inscricao_municipal", "alvara"]);
});

// ─── classificarExigencia: ajustes além dos casos do brief ────────────────────────────────────

test("classificarExigencia: CRC do contador, contrato social registrado na Junta e Justiça Estadual não viram outro documento", () => {
  const c = (t: unknown) => classificarExigencia(t);
  // CRC aqui é o Conselho Regional de Contabilidade, não o Certificado de Registro Cadastral do SICAF
  assert.deepEqual(c("Balanço patrimonial assinado por contador, com registro no CRC"), {
    tipos: ["balanco_dre"],
    declaracoes: [],
  });
  assert.deepEqual(c("Certificado de Registro Cadastral (CRC) do SICAF"), {
    tipos: ["sicaf"],
    declaracoes: [],
  });
  assert.deepEqual(c("Cadastro no SICAF"), { tipos: ["sicaf"], declaracoes: [] });
  // o contrato social "registrado na Junta Comercial" não pede a certidão simplificada
  assert.deepEqual(c("Contrato social em vigor, devidamente registrado na Junta Comercial"), {
    tipos: ["contrato_social"],
    declaracoes: [],
  });
  assert.deepEqual(c("Certidão simplificada emitida pela Junta Comercial"), {
    tipos: ["certidao_junta"],
    declaracoes: [],
  });
  assert.deepEqual(c("Certidão da Junta Comercial do domicílio da licitante"), {
    tipos: ["certidao_junta"],
    declaracoes: [],
  });
  // "Justiça Estadual/Federal" é quem emite a certidão, não a esfera do tributo
  assert.deepEqual(
    c("Certidão negativa de falência expedida pelo distribuidor da Justiça Estadual"),
    {
      tipos: ["certidao_falencia"],
      declaracoes: [],
    }
  );
  assert.deepEqual(c("Certidão negativa de falência, emitida pelo Tribunal de Justiça do Estado"), {
    tipos: ["certidao_falencia"],
    declaracoes: [],
  });
  // a regularidade fiscal continua sendo reconhecida quando o órgão aparece no mesmo texto
  assert.deepEqual(
    c("Certidão negativa de tributos estaduais, da Secretaria de Fazenda do Estado"),
    {
      tipos: ["cnd_estadual"],
      declaracoes: [],
    }
  );
});

test("classificarExigencia: letras maiúsculas, acento ausente, pontuação e várias declarações na mesma linha", () => {
  const c = (t: unknown) => classificarExigencia(t);
  assert.deepEqual(c("CERTIDAO NEGATIVA DE DEBITOS TRABALHISTAS"), {
    tipos: ["cndt_trabalhista"],
    declaracoes: [],
  });
  assert.deepEqual(
    c("Declaração de que não emprega menor e declaração de inexistência de fato impeditivo."),
    {
      tipos: [],
      declaracoes: ["nao_emprega_menor", "fato_impeditivo"],
    }
  );
  assert.deepEqual(c("Certidão negativa de débitos municipais"), {
    tipos: ["cnd_municipal"],
    declaracoes: [],
  });
  // dois documentos citados juntos, na ordem da lista de tipos (não na do texto)
  assert.deepEqual(c("Certidão de regularidade do FGTS e balanço patrimonial"), {
    tipos: ["crf_fgts", "balanco_dre"],
    declaracoes: [],
  });
  // texto que não é string
  assert.deepEqual(c(undefined), { tipos: [], declaracoes: [] });
  assert.deepEqual(c(42), { tipos: [], declaracoes: [] });
  assert.deepEqual(c("   "), { tipos: [], declaracoes: [] });
});

// ─── data da sessão: a coluna da oportunidade vale mais que a do edital ───────────────────────

const CRF = { id: "d1", tipo: "crf_fgts", nome: "CRF", validade: "2026-11-02", ativo: true };
function comSessao(
  p: { licitacaoData?: unknown; sessaoEdital?: unknown; extraido?: unknown },
  validade = CRF.validade
) {
  const extraido =
    "extraido" in p ? p.extraido : { datas: { sessao: { data: p.sessaoEdital ?? null } } };
  return montarChecklist({
    extraido,
    atende: null,
    licitacaoData: p.licitacaoData,
    arquivos: [arq("b1", "biblioteca:d1")],
    documentos: [{ ...CRF, validade }],
    atestados: [],
    modelos: [],
    hojeISO: HOJE,
  });
}
const crf = (c: ReturnType<typeof montarChecklist>) =>
  c.certidoes.find((x) => x.tipo === "crf_fgts");

test("montarChecklist: a coluna licitacao_data (a Sessão da tela) vale mais que a data do edital", () => {
  // só o edital (sessão 20/10, antes do vencimento do CRF em 02/11): anexado
  const soEdital = comSessao({ sessaoEdital: "2026-10-20" });
  assert.equal(soEdital.sessao, "2026-10-20");
  assert.equal(crf(soEdital)?.situacao, "anexado");
  // a sessão foi adiada na tela para 10/11: o CRF passa a vencer antes dela, mesmo com o edital dizendo 20/10
  const adiada = comSessao({ licitacaoData: "2026-11-10", sessaoEdital: "2026-10-20" });
  assert.equal(adiada.sessao, "2026-11-10");
  assert.equal(crf(adiada)?.situacao, "vence_antes_da_sessao");
  assert.equal(adiada.resumo.vencidos, 1);
  // e o contrário: a coluna é antes do vencimento e o edital, depois
  const adiantada = comSessao({ licitacaoData: "2026-10-30", sessaoEdital: "2026-11-10" });
  assert.equal(adiantada.sessao, "2026-10-30");
  assert.equal(crf(adiantada)?.situacao, "anexado");
  // coluna sem edital (a oportunidade ainda não tem análise)
  const semEdital = comSessao({ licitacaoData: "2026-11-10", extraido: null });
  assert.equal(semEdital.sessao, "2026-11-10");
  assert.equal(crf(semEdital)?.situacao, "vence_antes_da_sessao");
});

test("montarChecklist: coluna no passado vale e não é sessão futura (nada vence antes dela); hoje também não é futura", () => {
  // a coluna (01/10) já passou; o edital (10/11) é ignorado porque a coluna manda
  const passada = comSessao({ licitacaoData: "2026-10-01", sessaoEdital: "2026-11-10" });
  assert.equal(passada.sessao, "2026-10-01");
  assert.equal(crf(passada)?.situacao, "anexado");
  assert.equal(passada.resumo.vencidos, 0);
  // sessão hoje: não é futura (o dia já começou)
  const hoje = comSessao({ licitacaoData: HOJE }, "2026-10-13");
  assert.equal(hoje.sessao, HOJE);
  assert.equal(crf(hoje)?.situacao, "anexado");
  // edital no passado e sem coluna: idem
  const editalPassado = comSessao({ sessaoEdital: "2026-09-01" });
  assert.equal(editalPassado.sessao, "2026-09-01");
  assert.equal(crf(editalPassado)?.situacao, "anexado");
});

test("montarChecklist: coluna inválida ou vazia cai na data do edital; sem nenhuma, a sessão é null", () => {
  for (const ruim of [
    null,
    undefined,
    "",
    "   ",
    "2026-02-30",
    "05/11/2026",
    "amanhã",
    20261105,
    {},
  ]) {
    const c = comSessao({ licitacaoData: ruim, sessaoEdital: "2026-11-10" });
    assert.equal(c.sessao, "2026-11-10", String(ruim));
    assert.equal(crf(c)?.situacao, "vence_antes_da_sessao", String(ruim));
  }
  for (const nenhum of [
    { extraido: null },
    { sessaoEdital: "2026-02-30" },
    { sessaoEdital: "texto" },
  ]) {
    const c = comSessao({ licitacaoData: "inválida", ...nenhum });
    assert.equal(c.sessao, null);
    assert.equal(crf(c)?.situacao, "anexado");
  }
});

test("montarChecklist: 'vence antes' é estrito (validade igual ao dia da sessão ainda vale) e todos os anexados têm de vencer antes", () => {
  assert.equal(crf(comSessao({ licitacaoData: "2026-11-02" }))?.situacao, "anexado");
  assert.equal(crf(comSessao({ licitacaoData: "2026-11-03" }))?.situacao, "vence_antes_da_sessao");
  // dois documentos anexados do mesmo tipo
  const dois = (validadeA: string | null, validadeB: string | null, sessao: string) =>
    montarChecklist({
      extraido: { datas: { sessao: { data: sessao } } },
      atende: null,
      arquivos: [arq("b1", "biblioteca:a"), arq("b2", "biblioteca:b")],
      documentos: [
        { id: "a", tipo: "cnd_estadual", nome: "MG", validade: validadeA, ativo: true },
        { id: "b", tipo: "cnd_estadual", nome: "SP", validade: validadeB, ativo: true },
      ],
      atestados: [],
      modelos: [],
      hojeISO: HOJE,
    }).certidoes.find((x) => x.tipo === "cnd_estadual")!;
  // os dois vencem antes da sessão
  assert.equal(dois("2026-11-10", "2026-11-20", "2026-12-01").situacao, "vence_antes_da_sessao");
  // um ainda vale na sessão: o tipo está coberto
  assert.equal(dois("2026-11-10", "2026-12-20", "2026-12-01").situacao, "anexado");
  // um sem validade nunca vence: também cobre
  assert.equal(dois("2026-11-10", null, "2026-12-01").situacao, "anexado");
  // a validade mostrada é a menor entre as anexadas (a que vence primeiro)
  assert.equal(dois("2026-11-10", "2026-12-20", "2026-12-01").validade, "2026-11-10");
  assert.equal(dois("2026-11-10", null, "2026-12-01").validade, "2026-11-10");
});

// ─── certidões: vários documentos do mesmo tipo, versões inativas e validades ──────────────────

test("montarChecklist: vários documentos por tipo — o que vale é o anexado; vencido só quando todos venceram", () => {
  const documentos = [
    // cnd_estadual: MG anexada, SP válida e fora da pasta
    { id: "ea", tipo: "cnd_estadual", nome: "MG", validade: "2026-12-01", ativo: true },
    { id: "eb", tipo: "cnd_estadual", nome: "SP", validade: "2026-11-20", ativo: true },
    // cnd_municipal: uma vencida e outra válida, nenhuma anexada
    { id: "ma", tipo: "cnd_municipal", nome: "Velha", validade: "2026-09-01", ativo: true },
    { id: "mb", tipo: "cnd_municipal", nome: "Nova", validade: "2026-10-15", ativo: true },
    { id: "mc", tipo: "cnd_municipal", nome: "Outra", validade: "2026-10-20", ativo: true },
    // cndt: só vencidas
    { id: "ta", tipo: "cndt_trabalhista", nome: "A", validade: "2026-08-01", ativo: true },
    { id: "tb", tipo: "cndt_trabalhista", nome: "B", validade: "2026-09-15", ativo: true },
    // crf: sem validade, anexado
    { id: "fa", tipo: "crf_fgts", nome: "F", validade: null, ativo: true },
    // versão substituída: o checklist só olha as ativas
    { id: "xa", tipo: "certidao_falencia", nome: "Antiga", validade: "2027-01-01", ativo: false },
    // tipo fora do checklist não cria linha
    { id: "oa", tipo: "outro", nome: "Qualquer", validade: "2027-01-01", ativo: true },
  ];
  const c = montarChecklist({
    extraido: null,
    atende: null,
    arquivos: [arq("b1", "biblioteca:ea"), arq("b2", "biblioteca:fa"), arq("b3", "biblioteca:ta")],
    documentos,
    atestados: [],
    modelos: [],
    hojeISO: HOJE,
  });
  const x = (tipo: string) => c.certidoes.find((y) => y.tipo === tipo)!;
  assert.deepEqual(x("cnd_estadual"), {
    tipo: "cnd_estadual",
    rotulo: "CND Estadual",
    exigido_no_edital: false,
    situacao: "anexado",
    validade: "2026-12-01",
    documentos: 2,
  });
  // sem anexado: não anexado, e a validade é a menor entre as válidas (a vencida não conta)
  assert.deepEqual(
    [x("cnd_municipal").situacao, x("cnd_municipal").validade, x("cnd_municipal").documentos],
    ["nao_anexado", "2026-10-15", 3]
  );
  // só vencidas: vencido, com a maior validade; o arquivo da vencida anexado não a faz valer
  assert.deepEqual(
    [x("cndt_trabalhista").situacao, x("cndt_trabalhista").validade],
    ["vencido", "2026-09-15"]
  );
  assert.deepEqual([x("crf_fgts").situacao, x("crf_fgts").validade], ["anexado", null]);
  // só havia a versão substituída: falta
  assert.deepEqual(
    [x("certidao_falencia").situacao, x("certidao_falencia").documentos],
    ["falta", 0]
  );
  assert.ok(!c.certidoes.some((y) => y.tipo === "outro"));
  assert.equal(c.resumo.vencidos, 1);
  // faltam: o edital, os dois PDFs, a análise do edital (extraido null) e cinco certidões/documentos (cnd_federal,
  // cnd_municipal, certidao_falencia, contrato_social e cartao_cnpj); cndt está vencida (conta em `vencidos`)
  assert.equal(c.resumo.faltam, 1 + 2 + 1 + 5);
});

test("montarChecklist: documentos inativos, com validade ruim ou nulos não derrubam o checklist", () => {
  const c = montarChecklist({
    extraido: null,
    atende: null,
    arquivos: [arq("b1", "biblioteca:a")],
    documentos: [
      { id: "a", tipo: "crf_fgts", nome: "CRF", validade: "talvez", ativo: true },
      null as never,
      { id: "b", tipo: "cartao_cnpj", nome: "CNPJ", validade: "2026-10-13", ativo: true },
    ],
    atestados: [],
    modelos: [],
    hojeISO: HOJE,
  });
  const x = (tipo: string) => c.certidoes.find((y) => y.tipo === tipo)!;
  assert.deepEqual([x("crf_fgts").situacao, x("crf_fgts").validade], ["anexado", null]);
  // vence hoje ainda está em vigor
  assert.deepEqual(
    [x("cartao_cnpj").situacao, x("cartao_cnpj").validade],
    ["nao_anexado", "2026-10-13"]
  );
});

// ─── edital, proposta, acervo e declarações ───────────────────────────────────────────────────

/**
 * Uma análise do edital já gravada, com UMA exigência de habilitação que os documentos essenciais já cobrem (uma análise
 * sem nenhuma exigência conta como "sem análise": correção da revisão 2).
 */
const ANALISE_MINIMA = {
  habilitacao: {
    outros_documentos: [
      { descricao: "Certidão Negativa de Débitos Trabalhistas (CNDT)", pagina: 9 },
    ],
  },
};

const vazio = (extra: Partial<EntradaChecklist> = {}): EntradaChecklist => ({
  extraido: null,
  atende: null,
  arquivos: [],
  documentos: [],
  atestados: [],
  modelos: [],
  hojeISO: HOJE,
  ...extra,
});

test("montarChecklist: edital conta as quatro categorias do edital e só elas", () => {
  const c = montarChecklist(
    vazio({
      arquivos: [
        arq("e1", null, { categoria: "errata" }),
        arq("e2", "url:abc", { categoria: "termo_referencia" }),
        arq("e3", null, { categoria: "anexo_edital" }),
        arq("e4", null, { categoria: "edital" }),
        arq("o1", null, { categoria: "outro" }),
        arq("o2", null),
      ],
    })
  );
  assert.deepEqual(c.edital, { situacao: "ok", arquivos: 4 });
  const so = montarChecklist(vazio({ arquivos: [arq("o1", null, { categoria: "foto" })] }));
  assert.deepEqual(so.edital, { situacao: "falta", arquivos: 0 });
});

test("montarChecklist: proposta — assinado e sem estado valem ok; só 'pendente' falta assinar", () => {
  const c = montarChecklist(
    vazio({
      arquivos: [
        arq("p1", "gerado:proposta:pdf", { assinatura: "assinado", nome: "Proposta.pdf" }),
        arq("p2", "gerado:proposta:xlsx", { nome: "Proposta.xlsx" }),
        arq("p3", "gerado:cronograma:pdf", { assinatura: "pendente", nome: "Cronograma.pdf" }),
      ],
    })
  );
  assert.deepEqual(c.proposta, [
    { documento: "proposta_pdf", situacao: "ok", nome: "Proposta.pdf" },
    { documento: "proposta_xlsx", situacao: "ok", nome: "Proposta.xlsx" },
    { documento: "cronograma_pdf", situacao: "falta_assinar", nome: "Cronograma.pdf" },
    { documento: "cronograma_xlsx", situacao: "falta", nome: null },
  ]);
  // só o PDF do cronograma está em falta_assinar; o xlsx que falta não conta em `faltam` (só os PDFs contam)
  assert.equal(c.resumo.falta_assinar, 1);
  assert.ok(!c.proximos_passos.some((p) => p.includes("gerar_documentos_proposta")));
});

test("montarChecklist: acervo — anexado vale mesmo sem o atestado lido; ids repetidos ou maiúsculos contam uma vez", () => {
  const AT3 = "00000000-0000-4000-8000-000000000053";
  const AT4 = "00000000-0000-4000-8000-000000000054";
  const c = montarChecklist(
    vazio({
      atende: {
        cats_anexar: [
          { id: AT1, numero: "9/2025" },
          { id: AT1.toUpperCase() },
          { id: AT2 },
          { id: AT3, numero: "do Atende" },
          { id: AT4, numero: "4/2025" },
          { id: "" },
          { numero: "sem id" },
          null,
          7,
        ],
      },
      arquivos: [arq("a1", `acervo:${AT1}`)],
      atestados: [
        { id: AT2, numero: "2/2025", arquivo_ref: "certificados/x" },
        { id: AT3, numero: null, arquivo_ref: "  " },
      ],
    })
  );
  assert.deepEqual(c.acervo, [
    // o arquivo está na pasta: anexado, com o número do Atende? (o atestado não veio)
    { atestado_id: AT1, numero: "9/2025", situacao: "anexado" },
    { atestado_id: AT2, numero: "2/2025", situacao: "nao_anexado" },
    // ref em branco = sem PDF; sem número no cadastro, vale o do Atende?
    { atestado_id: AT3, numero: "do Atende", situacao: "sem_pdf" },
    { atestado_id: AT4, numero: "4/2025", situacao: "nao_encontrado" },
  ]);
  // edital, 2 PDFs, a análise do edital (extraido null), 3 CATs fora e 8 essenciais
  assert.equal(c.resumo.faltam, 1 + 2 + 1 + 3 + 8);
  const passos = c.proximos_passos;
  assert.ok(passos.includes("Anexe as CATs do Atende?: anexar_acervo."));
  assert.ok(passos.includes("Envie o PDF destas CATs em Acervo técnico → Documentos: do Atende."));
});

test("montarChecklist: declarações — exigidas primeiro, depois as dos arquivos; título pelo modelo, pelo arquivo ou pela chave", () => {
  const c = montarChecklist(
    vazio({
      extraido: {
        exclusiva_me_epp: true,
        habilitacao: {
          outros_documentos: [
            { descricao: "Declaração de que não emprega menor", pagina: 3 },
            { descricao: "Declaração de elaboração independente de proposta", pagina: 4 },
          ],
        },
      },
      arquivos: [
        arq("d1", "declaracao:requisitos_habilitacao:pdf", {
          nome: "Declaração - Requisitos de habilitação.pdf",
          assinatura: "assinado",
        }),
        arq("d2", "declaracao:edital_anexo_v:pdf", { nome: "", assinatura: "pendente" }),
        arq("d3", "declaracao:nao_emprega_menor:pdf", {
          nome: "Declaração - menor.pdf",
          assinatura: "pendente",
        }),
        // só o .docx (o PDF falhou): não vale como a declaração, e uma chave que ninguém pediu não aparece
        arq("d4", "declaracao:reserva_cargos:docx", { nome: "Declaração - reserva.docx" }),
        arq("d5", "declaracao:me_epp:docx", { nome: "Declaração - ME.docx" }),
      ],
      modelos: [
        { chave: "nao_emprega_menor", titulo: "Declaração de que não emprega menor" },
        { chave: "me_epp", titulo: "Declaração de ME/EPP" },
      ],
    })
  );
  assert.deepEqual(
    c.declaracoes.map((d) => [d.chave, d.titulo, d.exigida_no_edital, d.situacao]),
    [
      ["nao_emprega_menor", "Declaração de que não emprega menor", true, "falta_assinar"],
      ["elaboracao_independente", "elaboracao_independente", true, "falta"],
      ["me_epp", "Declaração de ME/EPP", true, "falta"],
      ["requisitos_habilitacao", "Declaração - Requisitos de habilitação", false, "ok"],
      ["edital_anexo_v", "edital_anexo_v", false, "falta_assinar"],
    ]
  );
  assert.ok(
    c.proximos_passos.includes(
      "Gere as declarações: gerar_declaracoes (elaboracao_independente, me_epp)."
    )
  );
  assert.deepEqual(
    c.falta_assinar.map((f) => f.arquivo_id),
    ["d2", "d3"]
  );
});

test("montarChecklist: linhas de outros_documentos — texto limitado a 300, página só número, linha vazia ignorada, texto solto aceito", () => {
  const longa = "Certidão de regularidade do FGTS ".repeat(20);
  const c = montarChecklist(
    vazio({
      extraido: {
        habilitacao: {
          outros_documentos: [
            { descricao: longa, pagina: "12" },
            { descricao: "Prova de inscrição estadual", pagina: 7 },
            "Declaração de que não emprega menor",
            { descricao: "   ", pagina: 1 },
            { pagina: 2 },
            null,
            42,
            { descricao: "Plano de trabalho detalhado", pagina: Number.NaN },
          ],
        },
      },
    })
  );
  assert.equal(c.outros_documentos.length, 4);
  assert.equal(c.outros_documentos[0].descricao.length, 300);
  assert.deepEqual(
    c.outros_documentos.map((o) => [o.pagina, o.classificado_como, o.situacao]),
    [
      [null, ["crf_fgts"], "coberto"],
      [7, ["inscricao_estadual"], "coberto"],
      [null, ["declaracao:nao_emprega_menor"], "coberto"],
      [null, [], "verificar"],
    ]
  );
  assert.equal(c.resumo.verificar, 1);
  assert.ok(
    c.proximos_passos.includes(
      'Confira à mão 1 exigência(s) do edital que o SIGO não reconheceu (outros_documentos em "verificar").'
    )
  );
});

test("montarChecklist: análise com formato estranho não derruba (só os essenciais)", () => {
  for (const extraido of [
    "texto",
    42,
    [],
    { habilitacao: "x" },
    { habilitacao: { outros_documentos: "x" } },
  ]) {
    for (const atende of [null, "x", [], { cats_anexar: "x" }, { cats_anexar: {} }]) {
      const c = montarChecklist(vazio({ extraido, atende }));
      assert.equal(c.certidoes.length, ESSENCIAIS.length, JSON.stringify([extraido, atende]));
      assert.deepEqual(c.acervo, []);
      assert.deepEqual(c.outros_documentos, []);
      assert.equal(c.sessao, null);
    }
  }
});

test("montarChecklist: registros do CREA (crea e visto_crea) pedem a certidão; outros registros não", () => {
  const c = (tipos: string[]) =>
    montarChecklist(
      vazio({ extraido: { habilitacao: { registros: tipos.map((tipo) => ({ tipo })) } } })
    ).certidoes.some((x) => x.tipo === "certidao_crea_pj" && x.exigido_no_edital);
  assert.equal(c(["crea"]), true);
  assert.equal(c(["visto_crea"]), true);
  assert.equal(c(["cau"]), false);
  assert.equal(c([]), false);
});

// ─── cópias desatualizadas: o que ficou na pasta do envelope e não vale mais ───────────────────

test("montarChecklist: copia da biblioteca de documento renovado, removido ou vencido fica listada; as válidas e as de outra origem, não", () => {
  const documentos = [
    { id: "d-novo", tipo: "crf_fgts", nome: "CRF novo", validade: "2026-12-31", ativo: true },
    // certidão renovada pela tela: a antiga ficou inativa. O checklist só lê os ativos, mas ignora o inativo se vier
    { id: "d-velho", tipo: "crf_fgts", nome: "CRF velho", validade: "2026-09-30", ativo: false },
    { id: "d-venc", tipo: "cnd_federal", nome: "CND", validade: "2026-10-01", ativo: true },
    { id: "d-ok", tipo: "cartao_cnpj", nome: "Cartão", validade: null, ativo: true },
    { id: "d-hoje", tipo: "alvara", nome: "Alvará", validade: HOJE, ativo: true },
  ];
  const arquivos = [
    arq("c1", "biblioteca:d-novo", { nome: "CRF do FGTS - CRF novo.pdf" }),
    arq("c2", "biblioteca:d-velho", { nome: "CRF do FGTS - CRF velho.pdf" }),
    arq("c3", "biblioteca:d-venc", { nome: "CND Federal - CND.pdf" }),
    arq("c4", "biblioteca:d-ok", { nome: "Cartão CNPJ.pdf" }),
    arq("c5", "biblioteca:d-sumiu", { nome: "Balanço.pdf" }),
    arq("c6", "biblioteca:d-hoje", { nome: "Alvará.pdf" }), // vence hoje: ainda vale
    // outras origens são ignoradas
    arq("c7", `acervo:${AT1}`, { nome: "CAT 1.pdf" }),
    arq("c8", "gerado:proposta:pdf", { nome: "Proposta.pdf" }),
    arq("c9", "declaracao:me_epp:pdf", { nome: "Declaração.pdf" }),
    arq("c10", "url:0123456789abcdef", { nome: "Edital.pdf" }),
    arq("c11", null, { nome: "Foto.jpg" }),
    arq("c12", "Biblioteca:d-velho", { nome: "Maiúscula não é o prefixo.pdf" }),
  ];
  const c = montarChecklist(vazio({ arquivos, documentos }));
  // por nome (e id), como a conferência da anexar_habilitacao
  assert.deepEqual(c.copias_desatualizadas, [
    { arquivo_id: "c5", nome: "Balanço.pdf", motivo: "substituido_ou_removido" },
    { arquivo_id: "c3", nome: "CND Federal - CND.pdf", motivo: "vencido" },
    { arquivo_id: "c2", nome: "CRF do FGTS - CRF velho.pdf", motivo: "substituido_ou_removido" },
  ]);
  assert.equal(c.resumo.desatualizadas, 3);
  assert.equal(c.resumo.pronto, false);
  // o CRF novo está anexado e vale; o documento vencido continua "vencido" pela validade
  const x = (tipo: string) => c.certidoes.find((y) => y.tipo === tipo)!;
  assert.equal(x("crf_fgts").situacao, "anexado");
  assert.equal(x("crf_fgts").documentos, 1);
  assert.equal(x("cnd_federal").situacao, "vencido");
  // o passo vem logo depois do 4 (o das certidões a atualizar)
  const passos = c.proximos_passos;
  const i4 = passos.findIndex((p) => p.startsWith("Atualize em Acervo técnico"));
  assert.ok(i4 >= 0);
  assert.equal(
    passos[i4 + 1],
    "Exclua da pasta do envelope as cópias desatualizadas: Balanço.pdf; CND Federal - CND.pdf; CRF do FGTS - CRF velho.pdf."
  );
});

test("montarChecklist: só uma cópia antiga na pasta já basta para não estar pronto, e é o único passo", () => {
  const documentos = [...ESSENCIAIS].map((tipo, i) => ({
    id: `d${i}`,
    tipo,
    nome: `Doc ${tipo}`,
    validade: null,
    ativo: true,
  }));
  const base = [
    arq("e1", null, { categoria: "edital" }),
    arq("p1", "gerado:proposta:pdf", { assinatura: "assinado" }),
    arq("p3", "gerado:cronograma:pdf", { assinatura: "assinado" }),
    ...documentos.map((d) => arq(`b-${d.id}`, `biblioteca:${d.id}`)),
  ];
  // sem a análise do edital (extraido null) NUNCA está pronto, mesmo com tudo anexado e assinado (correção da revisão 1:
  // antes este caso dava pronto: true)
  const semAnalise = montarChecklist(vazio({ arquivos: base, documentos }));
  assert.deepEqual(semAnalise.resumo, {
    faltam: 1,
    vencidos: 0,
    falta_assinar: 0,
    verificar: 0,
    desatualizadas: 0,
    sem_analise: 1,
    sem_atende: 0,
    atende_negativo: 0,
    conferir_a_mao: 0,
    sem_pendencia_do_sigo: false,
    pronto: false,
  });
  // com a análise gravada (com ao menos uma exigência de habilitação), tudo certo: pronto
  const pronto = montarChecklist(vazio({ extraido: ANALISE_MINIMA, arquivos: base, documentos }));
  assert.deepEqual(pronto.resumo, {
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
  const comAntiga = montarChecklist(
    vazio({
      extraido: ANALISE_MINIMA,
      arquivos: [
        ...base,
        arq("velha", "biblioteca:d-que-foi-substituido", { nome: "CND de 2025.pdf" }),
      ],
      documentos,
    })
  );
  assert.deepEqual(comAntiga.resumo, {
    faltam: 0,
    vencidos: 0,
    falta_assinar: 0,
    verificar: 0,
    desatualizadas: 1,
    sem_analise: 0,
    sem_atende: 0,
    atende_negativo: 0,
    conferir_a_mao: 0,
    sem_pendencia_do_sigo: false,
    pronto: false,
  });
  assert.deepEqual(comAntiga.proximos_passos, [
    "Exclua da pasta do envelope as cópias desatualizadas: CND de 2025.pdf.",
  ]);
});

test("montarChecklist: a ordem dos próximos passos (1 a 9) com a exclusão das cópias logo depois do 4", () => {
  const c = montarChecklist({
    extraido: {
      habilitacao: {
        outros_documentos: [
          { descricao: "Declaração de que não emprega menor" },
          { descricao: "Plano X" },
        ],
      },
    },
    atende: { cats_anexar: [{ id: AT1 }, { id: AT2, numero: "2/2025" }] },
    arquivos: [
      arq("c1", "biblioteca:d-velho", { nome: "Antiga.pdf" }),
      arq("p1", "gerado:proposta:pdf", { assinatura: "pendente" }),
    ],
    documentos: [{ id: "d9", tipo: "crf_fgts", nome: "CRF", validade: "2027-01-01", ativo: true }],
    atestados: [
      { id: AT1, numero: "1/2025", arquivo_ref: "certificados/x" },
      { id: AT2, numero: "2/2025", arquivo_ref: null },
    ],
    modelos: [],
    hojeISO: HOJE,
  });
  assert.equal(c.proximos_passos.length, 10);
  const [p1, p2, p3, p4, p5, p6, p7, p8, p9, p10] = c.proximos_passos;
  assert.equal(
    p1,
    "Anexe o edital: anexar_edital_por_url (link público do arquivo) ou gerar_link_envio."
  );
  assert.equal(p2, "Gere a proposta e o cronograma: gerar_documentos_proposta.");
  assert.equal(p3, "Anexe a habilitação que já está na biblioteca: anexar_habilitacao.");
  assert.ok(
    p4.startsWith(
      "Atualize em Acervo técnico → Documentos e certidões: CND Federal (Receita/PGFN); CND Estadual;"
    )
  );
  assert.ok(p4.endsWith("Cartão CNPJ."));
  assert.equal(p5, "Exclua da pasta do envelope as cópias desatualizadas: Antiga.pdf.");
  assert.equal(p6, "Anexe as CATs do Atende?: anexar_acervo.");
  assert.equal(p7, "Envie o PDF destas CATs em Acervo técnico → Documentos: 2/2025.");
  assert.equal(p8, "Gere as declarações: gerar_declaracoes (nao_emprega_menor).");
  assert.equal(p9, 'Assine no gov.br e use "Enviar assinado" na aba Arquivos: 1 arquivo(s).');
  assert.equal(
    p10,
    'Confira à mão 1 exigência(s) do edital que o SIGO não reconheceu (outros_documentos em "verificar").'
  );
});

// ─── núcleo das cópias da biblioteca (usado também pela anexar_habilitacao) ─────────────────────

test("copiasDaBiblioteca: só a origem biblioteca:<id>; as outras origens, a ausente e a lixeira são ignoradas", () => {
  assert.equal(PREFIXO_BIBLIOTECA, "biblioteca:");
  const copias = copiasDaBiblioteca([
    { id: "a", nome: "A.pdf", origem: "biblioteca:d1" },
    { id: "b", nome: null, origem: "biblioteca:d2" },
    { id: "c", nome: "C.pdf", origem: "acervo:x" },
    { id: "d", nome: "D.pdf", origem: null },
    { id: "e", nome: "E.pdf", origem: undefined },
    { id: "f", nome: "F.pdf", origem: 7 },
    { id: "g", nome: "G.pdf", origem: "gerado:proposta:pdf" },
    { id: "h", nome: "H.pdf", origem: "biblioteca:" },
  ]);
  assert.deepEqual(copias, [
    { arquivoId: "a", nome: "A.pdf", documentoId: "d1" },
    { arquivoId: "b", nome: "", documentoId: "d2" },
    { arquivoId: "h", nome: "H.pdf", documentoId: "" },
  ]);
});

test("conferirCopiasComOsAtivos: vencidas entre os ativos, o resto fora dos ativos; válidas somem", () => {
  const copias = [
    { arquivoId: "a", nome: "A", documentoId: "d1" }, // ativo e válido
    { arquivoId: "b", nome: "B", documentoId: "d2" }, // ativo e vencido
    { arquivoId: "c", nome: "C", documentoId: "d3" }, // não está entre os ativos
    { arquivoId: "d", nome: "D", documentoId: "d4" }, // ativo, sem validade
    { arquivoId: "e", nome: "E", documentoId: "d5" }, // vence hoje: vale
  ];
  const ativos = new Map<string, { validade?: unknown }>([
    ["d1", { validade: "2027-01-01" }],
    ["d2", { validade: "2026-10-12" }],
    ["d4", { validade: null }],
    ["d5", { validade: HOJE }],
  ]);
  const r = conferirCopiasComOsAtivos(copias, ativos, HOJE);
  assert.deepEqual(
    r.vencidas.map((c) => c.arquivoId),
    ["b"]
  );
  assert.deepEqual(
    r.foraDosAtivos.map((c) => c.arquivoId),
    ["c"]
  );
  assert.equal(documentoVencido("2026-10-12", HOJE), true);
  assert.equal(documentoVencido(HOJE, HOJE), false);
  assert.equal(documentoVencido(null, HOJE), false);
  assert.equal(documentoVencido("lixo", HOJE), false);
});

// ═══ Correção da revisão 1 da C5 ═══════════════════════════════════════════════════════════════

// ─── classificarExigencia: redações reais de editais de obra e iluminação pública ───────────────

type Redacao = [texto: string, tipos: string[], declaracoes: string[]];

/**
 * Cada linha: a redação como vem no edital, os tipos de documento da biblioteca e as declarações esperados.
 * `[]` e `[]` = o SIGO não reconhece e a linha cai em "verificar" (nunca "coberto" por engano).
 */
const REDACOES: Redacao[] = [
  // ── habilitação jurídica ──
  [
    "Ato constitutivo, estatuto ou contrato social em vigor, devidamente registrado",
    ["contrato_social"],
    [],
  ],
  ["Contrato social consolidado, registrado na Junta Comercial", ["contrato_social"], []],
  ["Certidão simplificada da Junta Comercial, emitida há menos de 90 dias", ["certidao_junta"], []],
  ["Requerimento de empresário, no caso de empresa individual", ["contrato_social"], []],
  ["Procuração por instrumento público ou particular, com firma reconhecida", ["procuracao"], []],
  // exigência condicional: o SIGO não sabe se se aplica
  ["Procuração, quando for o caso", [], []],
  ["Se houver, procuração do representante legal", [], []],
  ["Caso exista, certidão simplificada da Junta Comercial", [], []],
  ["Declaração de microempresa ou empresa de pequeno porte, se for o caso", [], []],
  ["Documento de identificação do representante legal", [], []],
  ["Comprovante de inscrição e de situação cadastral no CNPJ", ["cartao_cnpj"], []],
  ["Alvará de funcionamento ou licença de localização", ["alvara"], []],
  ["CRC — Certificado de Registro Cadastral do SICAF", ["sicaf"], []],
  // ── regularidade fiscal ──
  ["Prova de inscrição estadual e municipal", ["inscricao_estadual", "inscricao_municipal"], []],
  ["Prova de inscrição estadual ou municipal", ["inscricao_estadual", "inscricao_municipal"], []],
  ["Inscrição Estadual e/ou Municipal", ["inscricao_estadual", "inscricao_municipal"], []],
  [
    "Prova de inscrição no Cadastro de Contribuintes Estadual ou Municipal, relativo ao domicílio ou sede do licitante",
    ["inscricao_estadual", "inscricao_municipal"],
    [],
  ],
  // a inscrição no CNPJ não é a municipal só porque "municipais" aparece mais adiante
  [
    "Prova de inscrição no CNPJ e certidão negativa de débitos municipais",
    ["cnd_municipal", "cartao_cnpj"],
    [],
  ],
  ["Certidão Negativa de Débitos Estaduais", ["cnd_estadual"], []],
  ["Certidão de regularidade fiscal com a Fazenda Municipal", ["cnd_municipal"], []],
  [
    "Certidão conjunta negativa de débitos relativos a tributos federais e à dívida ativa da União",
    ["cnd_federal"],
    [],
  ],
  [
    "Prova de regularidade para com a Fazenda Federal, Estadual e Municipal",
    ["cnd_federal", "cnd_estadual", "cnd_municipal"],
    [],
  ],
  // "ME/EPP" aqui é o prazo de regularização, NÃO a declaração de enquadramento
  [
    "Certidão de regularidade fiscal (para ME/EPP, o prazo de regularização será de cinco dias úteis)",
    [],
    [],
  ],
  ["CERTIDÃO DE REGULARIDADE DO FGTS - CRF", ["crf_fgts"], []],
  // ── regularidade trabalhista ──
  ["Certidão Negativa de Débitos Trabalhistas (CNDT)", ["cndt_trabalhista"], []],
  // declaração que nenhum modelo cobre: não vira CNDT por causa da palavra "trabalhistas"
  ["Declaração de cumprimento das normas trabalhistas", [], []],
  ["Declaração de que a licitante cumpre as normas de segurança do trabalho", [], []],
  [
    "Declaração de que não emprega menor de 18 anos em trabalho noturno, perigoso ou insalubre, nem menor de 16 anos",
    [],
    ["nao_emprega_menor"],
  ],
  // ── qualificação econômico-financeira ──
  ["Balanço patrimonial e demonstrações contábeis do último exercício social", ["balanco_dre"], []],
  ["Balanço patrimonial assinado por contador com registro no CRC", ["balanco_dre"], []],
  [
    "Certidão negativa de falência ou recuperação judicial expedida pelo distribuidor da sede da licitante",
    ["certidao_falencia"],
    [],
  ],
  ["Comprovação de patrimônio líquido mínimo de 10% do valor estimado", [], []],
  // ── qualificação técnica ──
  ["Certidão de registro da empresa no CREA", ["certidao_crea_pj"], []],
  [
    "Certidão de registro e quitação da empresa e dos responsáveis técnicos no CREA ou CAU",
    ["certidao_crea_pj"],
    [],
  ],
  // atestado e CAT são do acervo técnico, não a certidão de registro da empresa
  ["Atestado de capacidade técnica registrado no CREA", [], []],
  ["CAT — Certidão de Acervo Técnico emitida pelo CREA", [], []],
  [
    "Declaração do responsável técnico, registrado no CREA, de que acompanhará a execução da obra",
    [],
    [],
  ],
  ["Atestado de visita técnica emitido pela Secretaria de Obras", [], []],
  ["Declaração de vistoria ao local da obra", [], []],
  // ── declarações com modelo ──
  ["Declaração de inexistência de fatos impeditivos à habilitação", [], ["fato_impeditivo"]],
  [
    "Declaração, sob as penas da lei, de que não há fato superveniente impeditivo",
    [],
    ["fato_impeditivo"],
  ],
  ["Declaração de enquadramento como microempresa ou empresa de pequeno porte", [], ["me_epp"]],
  [
    "Declaração de que cumpre plenamente os requisitos de habilitação",
    [],
    ["requisitos_habilitacao"],
  ],
  [
    "Declaração de reserva de cargos para pessoa com deficiência ou reabilitado da Previdência Social",
    [],
    ["reserva_cargos"],
  ],
  ["Declaração de elaboração independente de proposta", [], ["elaboracao_independente"]],
  // ── declaração e documento na mesma linha: os dois valem ──
  [
    "Alvará de funcionamento e declaração de que não emprega menor",
    ["alvara"],
    ["nao_emprega_menor"],
  ],
  [
    "Certidão negativa de falência e declaração de inexistência de fatos impeditivos",
    ["certidao_falencia"],
    ["fato_impeditivo"],
  ],
  // ── revisão 2 ──
  // "reabilitada" da idoneidade NÃO é a reserva de cargos (só "reabilitado da Previdência" é): sem modelo, verificar
  [
    "Declaração de idoneidade: de que não foi declarada inidônea, ou, se o foi, que está reabilitada",
    [],
    [],
  ],
  // duas declarações e só uma reconhecida: o que sobra não pode ficar "coberto" por engano
  ["Declaração de que não emprega menor e declaração de normas de segurança do trabalho", [], []],
  // as duas reconhecidas: valem as duas
  [
    "Declaração de que não emprega menor e declaração de inexistência de fatos impeditivos",
    [],
    ["nao_emprega_menor", "fato_impeditivo"],
  ],
  // outras formas de exigência condicional
  ["Procuração, quando houver", [], []],
  ["Certidão simplificada da Junta Comercial, se couber", [], []],
  ["Alvará de funcionamento, quando aplicável", [], []],
  ["Alvara de funcionamento, quando aplicavel", [], []],
  ["Procuração do representante legal, se existir", [], []],
];

test("classificarExigencia: tabela de redações reais de editais (jurídica, fiscal, trabalhista, econômica, técnica e declarações)", () => {
  assert.ok(REDACOES.length >= 30, `só ${REDACOES.length} redações`);
  for (const [texto, tipos, declaracoes] of REDACOES) {
    assert.deepEqual(classificarExigencia(texto), { tipos, declaracoes }, texto);
  }
});

test("classificarExigencia: cada chamada devolve listas novas (quem recebe pode alterá-las sem estragar a próxima)", () => {
  const a = classificarExigencia("Procuração, quando for o caso");
  a.tipos.push("x");
  assert.deepEqual(classificarExigencia("Procuração, quando for o caso"), {
    tipos: [],
    declaracoes: [],
  });
});

test("classificarExigencia: a palavra 'declaração' é o que liga as regras de declaração (sem ela, ME/EPP e menor não viram declaração)", () => {
  const c = (t: string) => classificarExigencia(t);
  assert.deepEqual(c("Empresa de pequeno porte: comprovar o enquadramento (LC 123)"), {
    tipos: [],
    declaracoes: [],
  });
  assert.deepEqual(c("DECLARAÇÃO DE ENQUADRAMENTO COMO ME/EPP"), {
    tipos: [],
    declaracoes: ["me_epp"],
  });
  assert.deepEqual(c("declaracao de que nao emprega menor"), {
    tipos: [],
    declaracoes: ["nao_emprega_menor"],
  });
  // espaços e quebras de linha no meio do texto lido do PDF
  assert.deepEqual(c("Prova de   inscrição\n estadual\te municipal"), {
    tipos: ["inscricao_estadual", "inscricao_municipal"],
    declaracoes: [],
  });
});

test("semAcento: o código-fonte usa o escape \\u0300-\\u036f, não os caracteres combinantes crus", () => {
  const fonte = readFileSync(new URL("./checklist.ts", import.meta.url), "utf8");
  assert.ok(fonte.includes("[\\u0300-\\u036f]"));
  assert.ok(!/[\u0300-\u036f]/.test(fonte), "há caractere combinante cru em checklist.ts");
});

// ─── sem a análise do edital e sem o Atende? nunca está pronto ──────────────────────────────────

/** Tudo anexado e assinado, para isolar o efeito da análise e do Atende?. */
function montagemCompleta(extra: Partial<EntradaChecklist> = {}) {
  const documentos = ESSENCIAIS.map((tipo, i) => ({
    id: `d${i}`,
    tipo,
    nome: `Doc ${tipo}`,
    validade: null,
    ativo: true,
  }));
  return vazio({
    arquivos: [
      arq("e1", null, { categoria: "edital" }),
      arq("p1", "gerado:proposta:pdf", { assinatura: "assinado" }),
      arq("p3", "gerado:cronograma:pdf", { assinatura: "assinado" }),
      ...documentos.map((d) => arq(`b-${d.id}`, `biblioteca:${d.id}`)),
    ],
    documentos,
    ...extra,
  });
}

const PASSO_ANALISE =
  "Grave a análise do edital (ler_edital_anexado e criar_ou_atualizar_oportunidade) para o SIGO conferir as exigências.";
const PASSO_ATENDE = "Confira o acervo técnico contra o edital e grave com registrar_atende.";
const PASSO_ATENDE_NEGATIVO =
  "O Atende? concluiu que a empresa NÃO atende à qualificação técnica do edital: revise com o usuário antes de seguir.";

test("montarChecklist: sem a análise do edital soma 1 a faltam, nunca está pronto e manda gravar a análise", () => {
  for (const extraido of [null, undefined, {}, [], "texto", 42]) {
    const c = montarChecklist(montagemCompleta({ extraido }));
    assert.equal(c.resumo.sem_analise, 1, JSON.stringify(extraido));
    assert.equal(c.resumo.faltam, 1, JSON.stringify(extraido));
    assert.equal(c.resumo.pronto, false, JSON.stringify(extraido));
    assert.deepEqual(c.proximos_passos, [PASSO_ANALISE], JSON.stringify(extraido));
  }
  // com qualquer análise gravada (mesmo sem exigência), não é "sem análise"
  const ok = montarChecklist(montagemCompleta({ extraido: ANALISE_MINIMA }));
  assert.equal(ok.resumo.sem_analise, 0);
  assert.equal(ok.resumo.pronto, true);
  assert.deepEqual(ok.proximos_passos, []);
});

test("montarChecklist: o passo da análise vem logo depois do edital e antes da proposta", () => {
  const c = montarChecklist(vazio());
  assert.equal(
    c.proximos_passos[0],
    "Anexe o edital: anexar_edital_por_url (link público do arquivo) ou gerar_link_envio."
  );
  assert.equal(c.proximos_passos[1], PASSO_ANALISE);
  assert.equal(c.proximos_passos[2], "Gere a proposta e o cronograma: gerar_documentos_proposta.");
  // vazio(): edital 1 + proposta_pdf e cronograma_pdf 2 + análise 1 + 8 essenciais
  assert.equal(c.resumo.faltam, 1 + 2 + 1 + 8);
});

const TECNICA_OPERACIONAL = {
  habilitacao: { tecnica_operacional: [{ id: "op1", descricao: "Iluminação pública LED" }] },
};
const TECNICA_PROFISSIONAL = {
  habilitacao: { tecnica_profissional: [{ id: "pr1", descricao: "Engenheiro eletricista" }] },
};

test("exigeQualificacaoTecnica e vereditoDoAtende: leitura defensiva", () => {
  assert.equal(exigeQualificacaoTecnica(TECNICA_OPERACIONAL), true);
  assert.equal(exigeQualificacaoTecnica(TECNICA_PROFISSIONAL), true);
  assert.equal(exigeQualificacaoTecnica({ habilitacao: { tecnica_operacional: [] } }), false);
  assert.equal(exigeQualificacaoTecnica({ habilitacao: { tecnica_operacional: "x" } }), false);
  assert.equal(exigeQualificacaoTecnica({ habilitacao: {} }), false);
  for (const ruim of [null, undefined, "x", 3, [], {}]) {
    assert.equal(exigeQualificacaoTecnica(ruim), false);
  }
  assert.equal(vereditoDoAtende({ veredito: "atende" }), "atende");
  assert.equal(vereditoDoAtende({ veredito: " nao_atende " }), "nao_atende");
  for (const ruim of [
    null,
    undefined,
    "x",
    [],
    {},
    { veredito: "" },
    { veredito: "  " },
    { veredito: 3 },
  ]) {
    assert.equal(vereditoDoAtende(ruim), null);
  }
});

test("montarChecklist: edital com qualificação técnica e sem Atende? soma 1 a faltam e manda gravar com registrar_atende", () => {
  const CATS = [{ id: AT1 }];
  const ATESTADOS = [{ id: AT1, numero: "1/2025", arquivo_ref: "certificados/x" }];
  const pasta = [arq("a1", `acervo:${AT1}`)];
  // técnica operacional OU profissional pedem o Atende?; cada caso isolado, com a CAT já anexada quando há
  // [nome, extraido, atende, sem_atende esperado, atende_negativo esperado]
  const casos: [string, unknown, unknown, number, number][] = [
    ["sem atende", TECNICA_OPERACIONAL, null, 1, 0],
    ["atende vazio", TECNICA_OPERACIONAL, {}, 1, 0],
    ["profissional sem atende", TECNICA_PROFISSIONAL, null, 1, 0],
    [
      "veredito sem nenhuma CAT",
      TECNICA_OPERACIONAL,
      { veredito: "atende", cats_anexar: [] },
      1,
      0,
    ],
    ["veredito sem cats_anexar", TECNICA_OPERACIONAL, { veredito: "atende" }, 1, 0],
    ["CATs sem veredito", TECNICA_OPERACIONAL, { cats_anexar: CATS }, 1, 0],
    ["veredito em branco", TECNICA_OPERACIONAL, { veredito: " ", cats_anexar: CATS }, 1, 0],
    ["atende completo", TECNICA_OPERACIONAL, { veredito: "atende", cats_anexar: CATS }, 0, 0],
    [
      "só parcialmente: é aviso (na ferramenta), não falta nem trava",
      TECNICA_OPERACIONAL,
      { veredito: "atende_parcialmente", cats_anexar: CATS },
      0,
      0,
    ],
    [
      // revisão 2: resposta clara de "não atende" trava o pronto (contador próprio, não entra em faltam)
      "não atende com CAT citada: não é falta, mas trava o pronto",
      TECNICA_PROFISSIONAL,
      { veredito: "nao_atende", cats_anexar: CATS },
      0,
      1,
    ],
    [
      // o "não atende" não tem CAT para citar: é um veredito completo, e pedir para gravar de novo não resolveria
      "não atende sem nenhuma CAT: só atende_negativo, sem sem_atende",
      TECNICA_OPERACIONAL,
      { veredito: "nao_atende", cats_anexar: [] },
      0,
      1,
    ],
    ["edital sem técnica não precisa de Atende?", ANALISE_MINIMA, null, 0, 0],
    [
      "listas de técnica vazias não pedem Atende?",
      { habilitacao: { ...ANALISE_MINIMA.habilitacao, tecnica_operacional: [] } },
      null,
      0,
      0,
    ],
  ];
  for (const [nome, extraido, atende, esperado, negativo] of casos) {
    const c = montarChecklist(
      montagemCompleta({
        extraido,
        atende,
        arquivos: [...montagemCompleta().arquivos, ...pasta],
        atestados: ATESTADOS,
      })
    );
    assert.equal(c.resumo.sem_atende, esperado, nome);
    assert.equal(c.resumo.atende_negativo, negativo, nome);
    assert.equal(c.resumo.faltam, esperado, nome);
    assert.equal(c.resumo.pronto, esperado === 0 && negativo === 0, nome);
    assert.deepEqual(
      c.proximos_passos,
      esperado ? [PASSO_ATENDE] : negativo ? [PASSO_ATENDE_NEGATIVO] : [],
      nome
    );
  }
});

test("montarChecklist: o passo do Atende? vem antes dos passos das CATs", () => {
  const c = montarChecklist(
    vazio({
      extraido: TECNICA_OPERACIONAL,
      atende: { veredito: "atende", cats_anexar: [] },
    })
  );
  assert.equal(c.resumo.sem_atende, 1);
  const i = c.proximos_passos.indexOf(PASSO_ATENDE);
  assert.ok(i > c.proximos_passos.findIndex((p) => p.startsWith("Atualize em Acervo técnico")));
  // sem CATs não há passo de CAT, mas com CATs o passo do Atende? precede "Anexe as CATs"
  const comCats = montarChecklist(
    vazio({
      extraido: TECNICA_OPERACIONAL,
      atende: { cats_anexar: [{ id: AT1 }] },
      atestados: [{ id: AT1, numero: "1/2025", arquivo_ref: "certificados/x" }],
    })
  );
  assert.ok(
    comCats.proximos_passos.indexOf(PASSO_ATENDE) <
      comCats.proximos_passos.indexOf("Anexe as CATs do Atende?: anexar_acervo.")
  );
});

// ─── cronograma: sem cronograma gravado a linha não conta como falta ────────────────────────────

const PASSO_CRONOGRAMA =
  "Se o edital pede cronograma físico-financeiro, grave com importar_cronograma e chame gerar_documentos_proposta de novo.";

test("montarChecklist: sem cronograma gravado, as linhas do cronograma ficam sem_cronograma e fora de faltam", () => {
  const entrada = vazio({ extraido: ANALISE_MINIMA });
  const com = montarChecklist(entrada); // padrão: temCronograma = true
  const comExplicito = montarChecklist({ ...entrada, temCronograma: true });
  const sem = montarChecklist({ ...entrada, temCronograma: false });
  assert.deepEqual(comExplicito, com);
  assert.deepEqual(
    com.proposta.map((p) => p.situacao),
    ["falta", "falta", "falta", "falta"]
  );
  assert.deepEqual(
    sem.proposta.map((p) => [p.documento, p.situacao, p.nome]),
    [
      ["proposta_pdf", "falta", null],
      ["proposta_xlsx", "falta", null],
      ["cronograma_pdf", "sem_cronograma", null],
      ["cronograma_xlsx", "sem_cronograma", null],
    ]
  );
  // o cronograma_pdf deixa de contar em faltam
  assert.equal(sem.resumo.faltam, com.resumo.faltam - 1);
  // o passo 2 fala só da proposta; o texto antigo continua com cronograma gravado
  assert.ok(
    com.proximos_passos.includes("Gere a proposta e o cronograma: gerar_documentos_proposta.")
  );
  assert.ok(sem.proximos_passos.includes("Gere a proposta: gerar_documentos_proposta."));
  assert.ok(!sem.proximos_passos.some((p) => p.includes("proposta e o cronograma")));
  // e SEMPRE vem o passo que manda conferir se o edital pede o cronograma
  assert.ok(sem.proximos_passos.includes(PASSO_CRONOGRAMA));
  assert.ok(!com.proximos_passos.includes(PASSO_CRONOGRAMA));
  // o passo vem logo depois do da proposta
  const i = sem.proximos_passos.indexOf("Gere a proposta: gerar_documentos_proposta.");
  assert.equal(sem.proximos_passos[i + 1], PASSO_CRONOGRAMA);
});

test("montarChecklist: sem cronograma e com o resto pronto, o único passo é conferir o cronograma", () => {
  const base = montagemCompleta({ extraido: ANALISE_MINIMA });
  // o cronograma_pdf que o helper assinou sai: a oportunidade não tem cronograma
  const arquivos = base.arquivos.filter((a) => a.origem !== "gerado:cronograma:pdf");
  const c = montarChecklist({ ...base, arquivos, temCronograma: false });
  assert.equal(c.proposta[2].situacao, "sem_cronograma");
  assert.equal(c.resumo.faltam, 0);
  assert.deepEqual(c.proximos_passos, [PASSO_CRONOGRAMA]);
  // com cronograma gravado, o mesmo arquivo que falta conta como antes
  const gravado = montarChecklist({ ...base, arquivos, temCronograma: true });
  assert.equal(gravado.resumo.faltam, 1);
  assert.equal(gravado.resumo.pronto, false);
});

test("montarChecklist: arquivo de cronograma que existe mostra a situação real mesmo com temCronograma false", () => {
  const c = montarChecklist(
    vazio({
      extraido: ANALISE_MINIMA,
      temCronograma: false,
      arquivos: [arq("c1", "gerado:cronograma:pdf", { assinatura: "pendente", nome: "Crono.pdf" })],
    })
  );
  assert.deepEqual(
    c.proposta.map((p) => p.situacao),
    ["falta", "falta", "falta_assinar", "sem_cronograma"]
  );
  assert.equal(c.resumo.falta_assinar, 1);
});

// ─── CATs citadas no Atende? que não estão mais no acervo ───────────────────────────────────────

test("montarChecklist: CAT que sumiu do acervo manda refazer o Atende?, depois do passo do PDF das CATs", () => {
  const AT3 = "00000000-0000-4000-8000-000000000053";
  const c = montarChecklist(
    vazio({
      extraido: ANALISE_MINIMA,
      atende: {
        veredito: "atende",
        cats_anexar: [{ id: AT1, numero: "7/2024" }, { id: AT2 }, { id: AT3, numero: "3/2025" }],
      },
      atestados: [{ id: AT3, numero: "3/2025", arquivo_ref: null }],
    })
  );
  assert.deepEqual(
    c.acervo.map((a) => a.situacao),
    ["nao_encontrado", "nao_encontrado", "sem_pdf"]
  );
  const passos = c.proximos_passos;
  const iPdf = passos.indexOf("Envie o PDF destas CATs em Acervo técnico → Documentos: 3/2025.");
  assert.ok(iPdf >= 0);
  assert.equal(
    passos[iPdf + 1],
    `Refaça o Atende? desta oportunidade (ler_acervo e registrar_atende): 2 CAT(s) citada(s) não estão mais no acervo técnico: 7/2024; ${AT2}.`
  );
  // sem CAT desaparecida não há o passo
  const sem = montarChecklist(
    vazio({
      extraido: ANALISE_MINIMA,
      atende: { veredito: "atende", cats_anexar: [{ id: AT3 }] },
      atestados: [{ id: AT3, numero: "3/2025", arquivo_ref: null }],
    })
  );
  assert.ok(!sem.proximos_passos.some((p) => p.startsWith("Refaça o Atende?")));
});

// ─── vence_antes_da_sessao: o passo certo depende de haver outro documento válido ───────────────

test("montarChecklist: vence antes da sessão com OUTRO documento válido na biblioteca manda anexar (passo 3), não atualizar (passo 4)", () => {
  const velho = {
    id: "velho",
    tipo: "crf_fgts",
    nome: "CRF velho",
    validade: "2026-10-28",
    ativo: true,
  };
  const montar = (outro: Record<string, unknown> | null, anexadoOutro = false) => {
    const documentos = [
      velho,
      ...(outro ? [{ id: "novo", tipo: "crf_fgts", nome: "CRF novo", ativo: true, ...outro }] : []),
    ];
    const arquivos = [arq("b1", "biblioteca:velho")];
    if (anexadoOutro) arquivos.push(arq("b2", "biblioteca:novo"));
    return montarChecklist({
      extraido: { datas: { sessao: { data: "2026-11-05" } } },
      atende: null,
      arquivos,
      documentos,
      atestados: [],
      modelos: [],
      hojeISO: HOJE,
    });
  };
  const atualizar = (c: ReturnType<typeof montarChecklist>) =>
    c.proximos_passos.find((p) => p.startsWith("Atualize em Acervo técnico")) ?? "";
  const anexar = (c: ReturnType<typeof montarChecklist>) =>
    c.proximos_passos.includes(
      "Anexe a habilitação que já está na biblioteca: anexar_habilitacao."
    );
  const crf = (c: ReturnType<typeof montarChecklist>) =>
    c.certidoes.find((x) => x.tipo === "crf_fgts")!;

  // outro CRF em vigor na sessão, ainda fora da pasta: é só anexar
  for (const validade of ["2027-01-01", "2026-11-05", null]) {
    const c = montar({ validade });
    assert.equal(crf(c).situacao, "vence_antes_da_sessao", String(validade));
    assert.equal(c.resumo.vencidos, 1, String(validade));
    assert.equal(c.resumo.pronto, false, String(validade));
    assert.ok(anexar(c), `anexar com validade ${validade}`);
    assert.ok(!atualizar(c).includes("CRF do FGTS"), `atualizar com validade ${validade}`);
  }
  // outro que também vence antes da sessão, ou que já venceu: só renovando na biblioteca
  for (const validade of ["2026-11-03", "2026-10-01"]) {
    const c = montar({ validade });
    assert.equal(crf(c).situacao, "vence_antes_da_sessao", String(validade));
    assert.ok(!anexar(c), `anexar com validade ${validade}`);
    assert.ok(atualizar(c).includes("CRF do FGTS"), `atualizar com validade ${validade}`);
  }
  // nenhum outro documento do tipo
  const so = montar(null);
  assert.ok(!anexar(so));
  assert.ok(atualizar(so).includes("CRF do FGTS"));
  // o outro também já está na pasta e vale na sessão: o tipo está coberto
  const coberto = montar({ validade: "2027-01-01" }, true);
  assert.equal(crf(coberto).situacao, "anexado");
  assert.equal(coberto.resumo.vencidos, 0);
  // outro documento INATIVO não conta (o checklist só lê os ativos)
  const inativo = montar({ validade: "2027-01-01", ativo: false });
  assert.ok(!anexar(inativo));
  assert.ok(atualizar(inativo).includes("CRF do FGTS"));
});

test("montarChecklist: a exclusão das cópias desatualizadas lista no máximo 10 nomes e conta o resto", () => {
  const copias = Array.from({ length: 13 }, (_, i) =>
    arq(`c${i}`, `biblioteca:antigo-${i}`, { nome: `Cópia ${String(i).padStart(2, "0")}.pdf` })
  );
  const c = montarChecklist(vazio({ extraido: ANALISE_MINIMA, arquivos: copias }));
  const passo = c.proximos_passos.find((p) => p.startsWith("Exclua"))!;
  assert.equal(
    passo,
    "Exclua da pasta do envelope as cópias desatualizadas: " +
      Array.from({ length: 10 }, (_, i) => `Cópia ${String(i).padStart(2, "0")}.pdf`).join("; ") +
      " e mais 3."
  );
  // o resumo conta todas
  assert.equal(c.resumo.desatualizadas, 13);
  assert.equal(c.copias_desatualizadas.length, 13);
  // 10 exatas: sem "e mais"
  const dez = montarChecklist(vazio({ extraido: ANALISE_MINIMA, arquivos: copias.slice(0, 10) }));
  assert.ok(!dez.proximos_passos.find((p) => p.startsWith("Exclua"))!.includes("e mais"));
});

// ═══ Correção da revisão 2 da C5 ═══════════════════════════════════════════════════════════════

const PASSO_ANALISE_VAZIA =
  "Releia a parte de habilitação do edital (ler_edital_anexado, roteiro analisar_edital) e grave com criar_ou_atualizar_oportunidade passando o oportunidade_id desta oportunidade: a análise gravada não tem nenhuma exigência de habilitação.";

/** Uma lista só com o que o `sanearEdital` produziria para a habilitação. */
const edital = (habilitacao: Record<string, unknown>, resto: Record<string, unknown> = {}) =>
  sanearEdital({ ...resto, habilitacao });

// ─── análise gravada, porém vazia ───────────────────────────────────────────────────────────────

test("situacaoDaAnalise: ausente, sem nenhuma exigência de habilitação, ou com exigência", () => {
  for (const ausente of [null, undefined, {}, [], "texto", 42]) {
    assert.equal(situacaoDaAnalise(ausente), "ausente", JSON.stringify(ausente));
  }
  const semExigencia: unknown[] = [
    sanearEdital({}), // a forma REAL: todas as chaves, listas vazias
    sanearEdital({ objeto: "Iluminação pública", datas: { sessao: { data: "2026-11-05" } } }),
    sanearEdital({ exclusiva_me_epp: false }),
    { habilitacao: {} },
    { habilitacao: "x" },
    { datas: { sessao: { data: "2026-11-05" } } },
    {
      habilitacao: {
        outros_documentos: [],
        tecnica_operacional: [],
        tecnica_profissional: [],
        economica: [],
        registros: [],
      },
    },
    // linhas sem texto não são exigência; itens nulos também não
    { habilitacao: { outros_documentos: [{ descricao: "   " }, { pagina: 2 }, null, 7, ""] } },
    { habilitacao: { economica: [null], registros: [undefined] } },
    { habilitacao: { tecnica_operacional: "x", outros_documentos: "y" } },
    { exclusiva_me_epp: "true" },
  ];
  for (const x of semExigencia) {
    assert.equal(situacaoDaAnalise(x), "sem_exigencias", JSON.stringify(x));
  }
  const comExigencia: unknown[] = [
    ANALISE_MINIMA,
    edital({ outros_documentos: [{ descricao: "Alvará de funcionamento" }] }),
    { habilitacao: { outros_documentos: ["Alvará de funcionamento"] } }, // texto solto (o sanearEdital o descartaria)
    edital({ tecnica_operacional: [{ id: "op1", descricao: "Iluminação pública LED" }] }),
    edital({ tecnica_profissional: [{ id: "pr1", descricao: "Engenheiro eletricista" }] }),
    edital({ economica: [{ id: "ec1", tipo: "patrimonio_liquido" }] }),
    edital({ registros: [{ id: "rg1", tipo: "cadastro_concessionaria" }] }),
    sanearEdital({ exclusiva_me_epp: true }),
  ];
  for (const x of comExigencia) {
    assert.equal(situacaoDaAnalise(x), "com_exigencias", JSON.stringify(x));
  }
});

test("montarChecklist: análise gravada porém vazia (sanearEdital({})) conta como sem_analise, trava o pronto e manda reler a habilitação", () => {
  // o Claude leu um edital cuja habilitação está noutro anexo e gravou tudo vazio: com os essenciais anexados o
  // checklist dava pronto: true (a revisão 1 só olhava Object.keys, e sanearEdital devolve sempre todas as chaves)
  for (const extraido of [
    sanearEdital({}),
    sanearEdital({ objeto: "Iluminação pública", datas: { sessao: { data: "2026-11-05" } } }),
    { habilitacao: {} },
    { datas: { sessao: { data: "2026-11-05" } } },
  ]) {
    const c = montarChecklist(montagemCompleta({ extraido }));
    assert.equal(c.resumo.sem_analise, 1, JSON.stringify(extraido));
    assert.equal(c.resumo.faltam, 1, JSON.stringify(extraido));
    assert.equal(c.resumo.pronto, false, JSON.stringify(extraido));
    assert.equal(c.resumo.sem_pendencia_do_sigo, false, JSON.stringify(extraido));
    assert.deepEqual(c.proximos_passos, [PASSO_ANALISE_VAZIA], JSON.stringify(extraido));
  }
  // a análise AUSENTE continua com o texto de antes
  const ausente = montarChecklist(montagemCompleta({ extraido: {} }));
  assert.deepEqual(ausente.proximos_passos, [PASSO_ANALISE]);
  assert.equal(ausente.resumo.sem_analise, 1);
});

test("montarChecklist: qualquer exigência de habilitação (ou edital exclusivo para ME/EPP) faz a análise valer", () => {
  const comExigencia = [
    edital({
      outros_documentos: [{ descricao: "Certidão Negativa de Débitos Trabalhistas (CNDT)" }],
    }),
    edital({ tecnica_operacional: [{ id: "op1", descricao: "Iluminação pública LED" }] }),
    edital({ tecnica_profissional: [{ id: "pr1", descricao: "Engenheiro eletricista" }] }),
    edital({ economica: [{ id: "ec1", tipo: "patrimonio_liquido" }] }),
    edital({ registros: [{ id: "rg1", tipo: "crea" }] }),
    sanearEdital({ exclusiva_me_epp: true }),
  ];
  for (const extraido of comExigencia) {
    const c = montarChecklist(montagemCompleta({ extraido }));
    assert.equal(c.resumo.sem_analise, 0, JSON.stringify(extraido));
    assert.ok(!c.proximos_passos.includes(PASSO_ANALISE_VAZIA));
    assert.ok(!c.proximos_passos.includes(PASSO_ANALISE));
  }
  // controle positivo: análise com a exigência já coberta e tudo anexado e assinado → pronto de verdade
  const pronto = montarChecklist(
    montagemCompleta({
      extraido: edital({
        outros_documentos: [{ descricao: "Certidão Negativa de Débitos Trabalhistas (CNDT)" }],
      }),
    })
  );
  assert.deepEqual(pronto.resumo, {
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
  assert.deepEqual(pronto.proximos_passos, []);
});

// ─── registros fora do CREA entram na regra do Atende? ──────────────────────────────────────────

test("temRegistroForaDoCrea e exigeAtende: leitura defensiva", () => {
  assert.equal(
    temRegistroForaDoCrea(edital({ registros: [{ tipo: "cadastro_concessionaria" }] })),
    true
  );
  assert.equal(temRegistroForaDoCrea(edital({ registros: [{ tipo: "outro" }] })), true);
  assert.equal(
    temRegistroForaDoCrea(edital({ registros: [{ tipo: "crea" }, { tipo: "outro" }] })),
    true
  );
  // tipo que o sanearEdital transformaria em "outro", item sem tipo e texto solto: vale como registro fora do CREA
  assert.equal(temRegistroForaDoCrea({ habilitacao: { registros: [{ tipo: "xpto" }] } }), true);
  assert.equal(temRegistroForaDoCrea({ habilitacao: { registros: [{ id: "rg1" }] } }), true);
  assert.equal(
    temRegistroForaDoCrea({ habilitacao: { registros: ["Cadastro na concessionária"] } }),
    true
  );
  // só CREA (a certidão do CREA é o que se confere), lista vazia, item nulo e formatos estranhos: não
  assert.equal(
    temRegistroForaDoCrea(edital({ registros: [{ tipo: "crea" }, { tipo: "visto_crea" }] })),
    false
  );
  assert.equal(temRegistroForaDoCrea(edital({ registros: [] })), false);
  for (const ruim of [
    null,
    undefined,
    "x",
    3,
    [],
    {},
    { habilitacao: "x" },
    { habilitacao: { registros: "x" } },
    { habilitacao: { registros: [null] } },
  ]) {
    assert.equal(temRegistroForaDoCrea(ruim), false, JSON.stringify(ruim));
  }
  // exigeAtende = técnica OU registro fora do CREA
  assert.equal(exigeAtende(TECNICA_OPERACIONAL), true);
  assert.equal(exigeAtende(TECNICA_PROFISSIONAL), true);
  assert.equal(exigeAtende(edital({ registros: [{ tipo: "outro" }] })), true);
  assert.equal(exigeAtende(edital({ registros: [{ tipo: "crea" }] })), false);
  assert.equal(exigeAtende(ANALISE_MINIMA), false);
  assert.equal(exigeAtende(null), false);
});

test("montarChecklist: registro fora do CREA (concessionária, outro) exige o veredito do Atende? gravado, mas não exige CAT", () => {
  const casos: [string, string[], unknown, number, number][] = [
    // [nome, tipos dos registros, atende, sem_atende, atende_negativo]
    ["cadastro_concessionaria sem Atende?", ["cadastro_concessionaria"], null, 1, 0],
    ["outro com Atende? vazio", ["outro"], {}, 1, 0],
    ["outro com cats_anexar vazio e sem veredito", ["outro"], { cats_anexar: [] }, 1, 0],
    [
      "CREA junto de outro registro pede o Atende?",
      ["crea", "cadastro_concessionaria"],
      null,
      1,
      0,
    ],
    // só o veredito: nenhuma CAT é exigida
    ["outro com veredito atende e sem CAT", ["outro"], { veredito: "atende" }, 0, 0],
    [
      "concessionária com veredito atende e cats vazio",
      ["cadastro_concessionaria"],
      { veredito: "atende", cats_anexar: [] },
      0,
      0,
    ],
    [
      "atende_parcialmente é só aviso (na ferramenta)",
      ["outro"],
      { veredito: "atende_parcialmente" },
      0,
      0,
    ],
    ["nao_atende trava o pronto, mas não é falta", ["outro"], { veredito: "nao_atende" }, 0, 1],
    // só CREA: o que se confere é a certidão (não pede o Atende?)
    ["só crea", ["crea"], null, 0, 0],
    ["só visto_crea", ["visto_crea"], null, 0, 0],
  ];
  for (const [nome, tipos, atende, semAtende, negativo] of casos) {
    const extraido = edital({
      registros: tipos.map((tipo) => ({ tipo, descricao: `Registro ${tipo}` })),
    });
    const c = montarChecklist(montagemCompleta({ extraido, atende }));
    assert.equal(c.resumo.sem_atende, semAtende, nome);
    assert.equal(c.resumo.atende_negativo, negativo, nome);
    assert.equal(c.proximos_passos.includes(PASSO_ATENDE), semAtende === 1, nome);
    assert.equal(c.proximos_passos.includes(PASSO_ATENDE_NEGATIVO), negativo === 1, nome);
    if (!tipos.some((t) => t.includes("crea"))) {
      // sem CREA não há certidão a mais: o Atende? é a única pendência
      assert.equal(c.resumo.faltam, semAtende, nome);
      assert.equal(c.resumo.pronto, semAtende === 0 && negativo === 0, nome);
    }
  }
});

// ─── "não atende" trava o pronto ────────────────────────────────────────────────────────────────

test("montarChecklist: veredito nao_atende trava o pronto (atende_negativo) com qualquer edital; parcialmente continua só aviso", () => {
  const CATS = [{ id: AT1 }];
  const arquivos = [...montagemCompleta().arquivos, arq("a1", `acervo:${AT1}`)];
  const atestados = [{ id: AT1, numero: "1/2025", arquivo_ref: "certificados/x" }];
  const montar = (extraido: unknown, veredito: string) =>
    montarChecklist(
      montagemCompleta({ extraido, atende: { veredito, cats_anexar: CATS }, arquivos, atestados })
    );
  // técnica exigida
  const tecnica = montar(TECNICA_OPERACIONAL, "nao_atende");
  assert.equal(tecnica.resumo.atende_negativo, 1);
  assert.equal(tecnica.resumo.sem_atende, 0);
  assert.equal(tecnica.resumo.faltam, 0);
  assert.equal(tecnica.resumo.pronto, false);
  assert.equal(tecnica.resumo.sem_pendencia_do_sigo, false);
  assert.deepEqual(tecnica.proximos_passos, [PASSO_ATENDE_NEGATIVO]);
  // edital só econômico: o Atende? também calcula a parte econômica, e "não atende" é "não atende"
  const economico = montar(
    edital({ economica: [{ id: "ec1", tipo: "patrimonio_liquido" }] }),
    "nao_atende"
  );
  assert.equal(economico.resumo.atende_negativo, 1);
  assert.equal(economico.resumo.pronto, false);
  // veredito com espaços e outros vereditos
  const comEspaco = montarChecklist(
    montagemCompleta({
      extraido: TECNICA_OPERACIONAL,
      atende: { veredito: " nao_atende ", cats_anexar: CATS },
      arquivos,
      atestados,
    })
  );
  assert.equal(comEspaco.resumo.atende_negativo, 1);
  for (const veredito of ["atende", "atende_parcialmente"]) {
    const c = montar(TECNICA_OPERACIONAL, veredito);
    assert.equal(c.resumo.atende_negativo, 0, veredito);
    assert.equal(c.resumo.pronto, true, veredito);
  }
  // sem Atende? gravado: não há veredito negativo
  assert.equal(
    montarChecklist(montagemCompleta({ extraido: ANALISE_MINIMA })).resumo.atende_negativo,
    0
  );
});

test("montarChecklist: o passo do 'não atende' vem logo depois do passo do Atende? e antes das CATs", () => {
  const c = montarChecklist(
    vazio({
      extraido: TECNICA_OPERACIONAL,
      atende: { veredito: "nao_atende", cats_anexar: [{ id: AT1 }] },
      atestados: [{ id: AT1, numero: "1/2025", arquivo_ref: "certificados/x" }],
    })
  );
  const passos = c.proximos_passos;
  const i = passos.indexOf(PASSO_ATENDE_NEGATIVO);
  assert.ok(i > passos.findIndex((p) => p.startsWith("Atualize em Acervo técnico")));
  assert.ok(i < passos.indexOf("Anexe as CATs do Atende?: anexar_acervo."));
});

// ─── conferir_a_mao e sem_pendencia_do_sigo ─────────────────────────────────────────────────────

test("montarChecklist: conferir_a_mao e sem_pendencia_do_sigo — só as linhas em verificar não contam como pendência do SIGO", () => {
  const SO_VERIFICAR = {
    habilitacao: {
      outros_documentos: [
        { descricao: "Plano de trabalho detalhado" },
        { descricao: "Atestado de visita técnica" },
        { descricao: "Certidão Negativa de Débitos Trabalhistas (CNDT)" },
      ],
    },
  };
  const base = montagemCompleta({ extraido: SO_VERIFICAR });
  const c = montarChecklist(base);
  // o pronto continua estrito: 2 linhas a conferir à mão ainda o impedem
  assert.equal(c.resumo.verificar, 2);
  assert.equal(c.resumo.conferir_a_mao, 2);
  assert.equal(c.resumo.faltam, 0);
  assert.equal(c.resumo.pronto, false);
  assert.equal(c.resumo.sem_pendencia_do_sigo, true);
  // cada contador do SIGO derruba o sem_pendencia_do_sigo
  const sem = (nome: string, extra: Partial<EntradaChecklist>, conferir = 2) => {
    const r = montarChecklist({ ...base, ...extra }).resumo;
    assert.equal(r.sem_pendencia_do_sigo, false, nome);
    assert.equal(r.pronto, false, nome);
    assert.equal(r.conferir_a_mao, conferir, nome);
  };
  sem("falta o edital", { arquivos: base.arquivos.filter((a) => a.categoria !== "edital") });
  sem("falta assinar", {
    arquivos: base.arquivos.map((a) =>
      a.origem === "gerado:proposta:pdf" ? { ...a, assinatura: "pendente" } : a
    ),
  });
  sem("cópia desatualizada", { arquivos: [...base.arquivos, arq("velha", "biblioteca:sumiu")] });
  sem("documento vencido", {
    documentos: base.documentos.map((d) =>
      d.tipo === "crf_fgts" ? { ...d, validade: "2026-10-01" } : d
    ),
  });
  sem("sem análise", { extraido: null }, 0); // sem análise não há linha em "verificar"
  sem("sem Atende?", {
    extraido: { habilitacao: { ...SO_VERIFICAR.habilitacao, ...TECNICA_OPERACIONAL.habilitacao } },
  });
  sem("Atende? negativo", {
    extraido: { habilitacao: { ...SO_VERIFICAR.habilitacao, ...TECNICA_OPERACIONAL.habilitacao } },
    atende: { veredito: "nao_atende", cats_anexar: [{ id: AT1 }] },
    arquivos: [...base.arquivos, arq("a1", `acervo:${AT1}`)],
  });
  // sem nada em verificar, conferir_a_mao é 0 e o pronto vale
  const limpo = montarChecklist(montagemCompleta({ extraido: ANALISE_MINIMA })).resumo;
  assert.deepEqual(
    [limpo.conferir_a_mao, limpo.sem_pendencia_do_sigo, limpo.pronto],
    [0, true, true]
  );
});

// ─── classificarExigencia: ajustes da revisão 2 ─────────────────────────────────────────────────

test("classificarExigencia: 'reabilitado' só liga a reserva de cargos quando é o reabilitado da Previdência", () => {
  const c = (t: string) => classificarExigencia(t);
  for (const texto of [
    "Declaração de reserva de cargos para pessoa com deficiência ou reabilitado da Previdência Social",
    "Declaração de que cumpre a reserva de cargos para beneficiários reabilitados pela Previdência Social",
    "Declaração de contratação de pessoas reabilitadas da Previdência",
  ]) {
    assert.deepEqual(c(texto), { tipos: [], declaracoes: ["reserva_cargos"] }, texto);
  }
  // reabilitação da idoneidade: não é reserva de cargos, e sem modelo cai em "verificar"
  for (const texto of [
    "Declaração de idoneidade: de que não foi declarada inidônea, ou, se o foi, que está reabilitada",
    "Declaração de que a empresa está reabilitada perante a Administração Pública",
  ]) {
    assert.deepEqual(c(texto), { tipos: [], declaracoes: [] }, texto);
  }
});

test("classificarExigencia: mais 'declaração' no texto do que declarações reconhecidas → nada reconhecido (verificar)", () => {
  const c = (t: string) => classificarExigencia(t);
  assert.deepEqual(
    c("Declaração de que não emprega menor e declaração de normas de segurança do trabalho"),
    { tipos: [], declaracoes: [] }
  );
  // sem acento e com quebra de linha no meio
  assert.deepEqual(
    c("Declaracao de que nao emprega menor;\ndeclaracao de cumprimento das normas trabalhistas"),
    { tipos: [], declaracoes: [] }
  );
  // o documento que a mesma linha pede também não vale quando uma declaração ficou sem modelo
  assert.deepEqual(
    c("Alvará de funcionamento, declaração de que não emprega menor e declaração de vistoria"),
    {
      tipos: [],
      declaracoes: [],
    }
  );
  // uma declaração que casa com dois modelos continua valendo (1 'declaração' para 2 reconhecidas)
  assert.deepEqual(
    c("Declaração de que não emprega menor e de inexistência de fatos impeditivos"),
    {
      tipos: [],
      declaracoes: ["nao_emprega_menor", "fato_impeditivo"],
    }
  );
  // duas declarações, duas reconhecidas
  assert.deepEqual(
    c(
      "Declaração de elaboração independente de proposta e declaração de inexistência de fatos impeditivos"
    ),
    { tipos: [], declaracoes: ["fato_impeditivo", "elaboracao_independente"] }
  );
});

test("classificarExigencia: novas formas de exigência condicional (quando houver, se couber, quando aplicável, se existir)", () => {
  const c = (t: string) => classificarExigencia(t);
  for (const texto of [
    "Procuração, quando houver",
    "Certidão simplificada da Junta Comercial, se couber",
    "Alvará de funcionamento, quando aplicável",
    "Alvará de funcionamento, QUANDO APLICÁVEL",
    "Alvara de funcionamento, quando aplicavel",
    "Procuração do representante legal, se existir",
    "Declaração de microempresa, quando houver enquadramento",
  ]) {
    assert.deepEqual(c(texto), { tipos: [], declaracoes: [] }, texto);
  }
  // o texto sem a condicional continua reconhecido
  assert.deepEqual(c("Alvará de funcionamento"), { tipos: ["alvara"], declaracoes: [] });
});
