// node --test supabase/functions/_shared/habilitacao/checklist.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classificarExigencia,
  conferirCopiasComOsAtivos,
  copiasDaBiblioteca,
  documentoVencido,
  montarChecklist,
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
  // faltam: o edital, os dois PDFs e cinco certidões/documentos (cnd_federal, cnd_municipal, certidao_falencia,
  // contrato_social e cartao_cnpj); cndt está vencida (conta em `vencidos`, não em `faltam`)
  assert.equal(c.resumo.faltam, 1 + 2 + 5);
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
  assert.equal(c.resumo.faltam, 1 + 2 + 3 + 8); // edital, 2 PDFs, 3 CATs fora, 8 essenciais
  const passos = c.proximos_passos;
  assert.ok(passos.includes("Anexe as CATs do Atende?: anexar_acervo."));
  assert.ok(passos.includes("Envie no Acervo técnico o PDF destas CATs: do Atende."));
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
  const pronto = montarChecklist(vazio({ arquivos: base, documentos }));
  assert.deepEqual(pronto.resumo, {
    faltam: 0,
    vencidos: 0,
    falta_assinar: 0,
    verificar: 0,
    desatualizadas: 0,
    pronto: true,
  });
  const comAntiga = montarChecklist(
    vazio({
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
  assert.equal(p7, "Envie no Acervo técnico o PDF destas CATs: 2/2025.");
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
