// node --test supabase/functions/_shared/documentos/declaracoes.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chaveDoItem,
  CHAVES_MODELO_PADRAO,
  LIMITE_TEXTO_DECLARACAO,
  MAX_ITENS_DECLARACAO,
  modelosDaEmpresa,
  MODELOS_PADRAO,
  montarDadosDeclaracao,
  nomeArquivoDeclaracao,
  preencherModelo,
  validarItensDeclaracao,
  VARIAVEIS_DECLARACAO,
  variaveisDaDeclaracao,
} from "./declaracoes.ts";

const CAB = {
  empresa: {
    nome: "Empresa Teste Ltda",
    cnpj: "11.222.333/0001-81",
    endereco: "Rua das Obras, 100 - Cidade/MG",
    contato: "",
  },
  orgao: "Prefeitura de Exemplo",
  objeto: "Iluminação pública",
  edital: "CE 009/2026",
  localData: "Cidade/MG, 13 de outubro de 2026",
  representante: { nome: "Fulana de Tal", cargo: "Sócia-administradora", cpf: "529.982.247-25" },
};

test("MODELOS_PADRAO: os seis da spec, na ordem, só com variáveis conhecidas", () => {
  assert.deepEqual(
    MODELOS_PADRAO.map((m) => m.chave),
    [...CHAVES_MODELO_PADRAO]
  );
  assert.deepEqual(CHAVES_MODELO_PADRAO, [
    "nao_emprega_menor",
    "fato_impeditivo",
    "me_epp",
    "requisitos_habilitacao",
    "reserva_cargos",
    "elaboracao_independente",
  ]);
  assert.deepEqual(VARIAVEIS_DECLARACAO, [
    "empresa",
    "cnpj",
    "endereco",
    "orgao",
    "edital",
    "objeto",
    "local",
    "data",
    "representante",
    "cargo",
    "cpf",
  ]);
  for (const m of MODELOS_PADRAO) {
    assert.ok(m.titulo.startsWith("Declaração"), m.chave);
    assert.ok(m.texto.length > 100 && m.texto.length <= LIMITE_TEXTO_DECLARACAO, m.chave);
    const usadas = [...m.texto.matchAll(/\{([a-z_]+)\}/g)].map((x) => x[1]);
    assert.deepEqual(
      usadas.filter((v) => !(VARIAVEIS_DECLARACAO as readonly string[]).includes(v)),
      [],
      m.chave
    );
    assert.ok(m.texto.startsWith("{empresa}, inscrita no CNPJ sob o nº {cnpj}"), m.chave);
  }
  assert.ok(MODELOS_PADRAO[0].texto.includes("inciso XXXIII do art. 7º da Constituição Federal"));
  assert.equal(MODELOS_PADRAO[5].texto.split("\n\n").length, 7);
});

test("MODELOS_PADRAO é imutável e modelosDaEmpresa devolve cópias novas", () => {
  assert.ok(Object.isFrozen(MODELOS_PADRAO));
  for (const padrao of MODELOS_PADRAO) assert.ok(Object.isFrozen(padrao), padrao.chave);
  assert.throws(() => {
    (MODELOS_PADRAO as unknown as { chave: string }[])[0].chave = "alterada";
  }, TypeError);
  const copias = modelosDaEmpresa([]);
  assert.equal(copias.length, 6);
  copias.forEach((copia, i) => {
    assert.notEqual(copia, MODELOS_PADRAO[i]);
    assert.deepEqual(copia, MODELOS_PADRAO[i]);
  });
  copias[0].texto = "mexido por quem chamou";
  assert.notEqual(MODELOS_PADRAO[0].texto, "mexido por quem chamou");
  assert.notEqual(modelosDaEmpresa([])[0].texto, "mexido por quem chamou");
});

test("modelosDaEmpresa: a linha da empresa troca o padrão; inativo sai; próprio entra", () => {
  const r = modelosDaEmpresa([
    {
      chave: "me_epp",
      titulo: "ME/EPP da casa",
      texto: "Texto próprio {empresa}",
      ativo: true,
      ordem: 3,
    },
    { chave: "reserva_cargos", titulo: "x", texto: "y", ativo: false },
    {
      chave: "visita_tecnica",
      titulo: "Declaração de visita técnica",
      texto: "{empresa} visitou.",
      ativo: true,
      ordem: null,
    },
  ]);
  assert.deepEqual(
    r.map((m) => m.chave),
    [
      "nao_emprega_menor",
      "fato_impeditivo",
      "me_epp",
      "requisitos_habilitacao",
      "elaboracao_independente",
      "visita_tecnica",
    ]
  );
  assert.equal(r.find((m) => m.chave === "me_epp")?.titulo, "ME/EPP da casa");
  assert.equal(modelosDaEmpresa([]).length, 6);
});

test("variaveisDaDeclaracao e preencherModelo", () => {
  const vars = variaveisDaDeclaracao(CAB, "Cidade/MG", "2026-10-13");
  assert.deepEqual(vars, {
    empresa: "Empresa Teste Ltda",
    cnpj: "11.222.333/0001-81",
    endereco: "Rua das Obras, 100 - Cidade/MG",
    orgao: "Prefeitura de Exemplo",
    edital: "CE 009/2026",
    objeto: "Iluminação pública",
    local: "Cidade/MG",
    data: "13 de outubro de 2026",
    representante: "Fulana de Tal",
    cargo: "Sócia-administradora",
    cpf: "529.982.247-25",
  });
  assert.deepEqual(preencherModelo("{empresa}, CNPJ {cnpj}, no {edital}.", vars), {
    texto: "Empresa Teste Ltda, CNPJ 11.222.333/0001-81, no CE 009/2026.",
    sem_valor: [],
    desconhecidas: [],
  });
  assert.deepEqual(
    preencherModelo("{cargo} {cpf} {cpf} {porte} {Empresa}", { ...vars, cargo: "", cpf: "" }),
    {
      texto: "________ ________ ________ {porte} {Empresa}",
      sem_valor: ["cargo", "cpf"],
      desconhecidas: ["porte"],
    }
  );
});

test("variaveisDaDeclaracao: valor com quebra de linha ou espaços repetidos vira uma linha só", () => {
  const vars = variaveisDaDeclaracao(
    {
      ...CAB,
      objeto: "Iluminação\n\npública  LED",
      orgao: "  Prefeitura\r\n de Exemplo\t",
    },
    " Cidade/MG\n",
    "2026-10-13"
  );
  assert.equal(vars.objeto, "Iluminação pública LED");
  assert.equal(vars.orgao, "Prefeitura de Exemplo");
  assert.equal(vars.local, "Cidade/MG");
  const r = preencherModelo("Objeto: {objeto}.\n\nFim.", vars);
  assert.equal(r.texto, "Objeto: Iluminação pública LED.\n\nFim.");
  assert.equal(r.texto.split("\n\n").length, 2);
});

test("variaveisDaDeclaracao: data inválida deixa {data} vazia e o modelo põe o campo em branco", () => {
  for (const ruim of ["", "13/10/2026", "2026-13-01", "2026-00-10", "texto"]) {
    const vars = variaveisDaDeclaracao(CAB, "Cidade/MG", ruim);
    assert.equal(vars.data, "", ruim);
    assert.deepEqual(preencherModelo("{local}, {data}.", vars), {
      texto: "Cidade/MG, ________.",
      sem_valor: ["data"],
      desconhecidas: [],
    });
  }
});

test("preencherModelo: o valor entra literal ($&, $1, $$ e {variavel} dentro dele não são reprocessados)", () => {
  const vars = {
    ...variaveisDaDeclaracao(CAB, "Cidade/MG", "2026-10-13"),
    empresa: "A$&B $1 $$ {cnpj} $` $'",
  };
  assert.deepEqual(preencherModelo("{empresa}, CNPJ {cnpj}.", vars), {
    texto: "A$&B $1 $$ {cnpj} $` $', CNPJ 11.222.333/0001-81.",
    sem_valor: [],
    desconhecidas: [],
  });
});

test("validarItensDeclaracao: modelo OU título e texto; limites; sem repetir", () => {
  assert.deepEqual(
    validarItensDeclaracao([{ modelo: "me_epp" }, { titulo: " Anexo V ", texto: " Texto " }]),
    {
      ok: true,
      itens: [
        { tipo: "modelo", chave: "me_epp" },
        { tipo: "texto", titulo: "Anexo V", texto: "Texto" },
      ],
    }
  );
  const erros = (itens: unknown) => {
    const r = validarItensDeclaracao(itens);
    return r.ok ? [] : r.erros;
  };
  assert.deepEqual(erros(null), ["itens: informe de 1 a 12 declarações"]);
  assert.deepEqual(erros([]), ["itens: informe de 1 a 12 declarações"]);
  assert.deepEqual(
    erros(Array(MAX_ITENS_DECLARACAO + 1).fill({ modelo: "me_epp" }))[0],
    "itens: no máximo 12 por chamada (vieram 13)"
  );
  assert.deepEqual(erros([{ modelo: "me_epp", titulo: "x", texto: "y" }]), [
    'itens[0]: informe "modelo" OU "titulo" e "texto", não os dois',
  ]);
  assert.deepEqual(erros([{}]), ['itens[0]: informe "modelo" ou "titulo" e "texto"']);
  assert.deepEqual(erros([{ modelo: "ME EPP" }]), ["itens[0].modelo: chave inválida"]);
  assert.deepEqual(erros([{ titulo: "x".repeat(201), texto: "y" }]), [
    "itens[0].titulo: de 1 a 200 caracteres",
  ]);
  assert.deepEqual(erros([{ titulo: "x", texto: "y".repeat(LIMITE_TEXTO_DECLARACAO + 1) }]), [
    "itens[0].texto: de 1 a 20000 caracteres",
  ]);
  assert.deepEqual(erros([{ modelo: "me_epp" }, { modelo: "me_epp" }]), [
    "itens[1]: declaração repetida (me_epp)",
  ]);
});

test("chaveDoItem e nomeArquivoDeclaracao", () => {
  assert.equal(chaveDoItem({ tipo: "modelo", chave: "me_epp" }), "me_epp");
  assert.equal(
    chaveDoItem({ tipo: "texto", titulo: "Declaração do Anexo V — Visita Técnica", texto: "x" }),
    "edital_declaracao_do_anexo_v_visita_tecnica"
  );
  assert.equal(chaveDoItem({ tipo: "texto", titulo: "!!!", texto: "x" }), "edital_declaracao");
  assert.ok(chaveDoItem({ tipo: "texto", titulo: "a".repeat(100), texto: "x" }).length <= 47);
  assert.equal(
    nomeArquivoDeclaracao("Declaração de que não emprega menor", "pdf"),
    "Declaração de que não emprega menor.pdf"
  );
  assert.equal(
    nomeArquivoDeclaracao("Anexo V: visita/técnica", "docx"),
    "Declaração - Anexo V- visita-técnica.docx"
  );
});

const TITULO_LOTE_1 = "Declaração do Anexo V - Visita Técnica ao local da obra - Lote 1";
const TITULO_LOTE_2 = "Declaração do Anexo V - Visita Técnica ao local da obra - Lote 2";
const chaveDeTitulo = (titulo: string) => chaveDoItem({ tipo: "texto", titulo, texto: "x" });

test("chaveDoItem: títulos longos que só diferem no fim (Lote 1 × Lote 2) não colidem", () => {
  const c1 = chaveDeTitulo(TITULO_LOTE_1);
  const c2 = chaveDeTitulo(TITULO_LOTE_2);
  assert.notEqual(c1, c2);
  for (const c of [c1, c2]) {
    assert.ok(c.length <= 47, c);
    assert.match(c, /^edital_[a-z0-9_]+$/);
    assert.doesNotMatch(c, /__/);
    assert.doesNotMatch(c, /_$/);
  }
  // fixa o algoritmo (31 primeiros + "_" + FNV-1a de 32 bits do normalizado inteiro): a chave vira a
  // `origem` do arquivo gravado, então mudar a regra depois orfanaria o que já foi anexado
  assert.equal(c1, "edital_declaracao_do_anexo_v_visita_te_9a27f3e9");
  assert.equal(c2, "edital_declaracao_do_anexo_v_visita_te_9727ef30");
  assert.equal(chaveDeTitulo("a".repeat(100)), `edital_${"a".repeat(31)}_0a0bb1d9`);
  // mesmo título, mesma chave
  assert.equal(chaveDeTitulo(TITULO_LOTE_1), c1);
  assert.equal(chaveDeTitulo(`  ${TITULO_LOTE_1.toUpperCase()}!! `), c1);
});

test("chaveDoItem: até 40 caracteres normalizados a chave é o próprio título; o corte em '_' não duplica", () => {
  assert.equal(
    chaveDeTitulo("Declaração do Anexo V — Visita Técnica"),
    "edital_declaracao_do_anexo_v_visita_tecnica"
  );
  assert.equal(chaveDeTitulo("x".repeat(40)), `edital_${"x".repeat(40)}`);
  assert.equal(chaveDeTitulo("x".repeat(41)), `edital_${"x".repeat(31)}_fb64f7a7`);
  // o 31º caractere é um "_": tira o "_" do fim do corte antes de juntar o hash
  const cortaNoUnderscore = chaveDeTitulo(`${"a".repeat(30)} ${"b".repeat(20)}`);
  assert.equal(cortaNoUnderscore, `edital_${"a".repeat(30)}_712a2dec`);
  assert.doesNotMatch(cortaNoUnderscore, /__/);
  assert.equal(chaveDeTitulo("!!!"), "edital_declaracao");
  assert.equal(chaveDeTitulo(""), "edital_declaracao");
});

test("validarItensDeclaracao: Lote 1 e Lote 2 passam; o mesmo título duas vezes é repetido", () => {
  const itens = [
    { titulo: TITULO_LOTE_1, texto: "Texto 1" },
    { titulo: TITULO_LOTE_2, texto: "Texto 2" },
  ];
  const ok = validarItensDeclaracao(itens);
  assert.equal(ok.ok, true);
  const repetido = validarItensDeclaracao([...itens, { titulo: TITULO_LOTE_1, texto: "Outro" }]);
  assert.deepEqual(repetido, {
    ok: false,
    erros: [`itens[2]: declaração repetida (${chaveDeTitulo(TITULO_LOTE_1)})`],
  });
});

test("nomeArquivoDeclaracao: caractere de formato Unicode vira '-' e o corte não deixa meio emoji", () => {
  const nome = nomeArquivoDeclaracao("Anexo ‮fdp", "pdf");
  assert.ok(!nome.includes("‮"));
  assert.equal(nome, "Declaração - Anexo -fdp.pdf");
  assert.equal(nomeArquivoDeclaracao("A​b­c", "docx"), "Declaração - A-b-c.docx");
  // comportamento de hoje: o corte em 150 vale para o título; o prefixo e a extensão vêm depois
  assert.equal(
    nomeArquivoDeclaracao("x".repeat(300), "pdf"),
    `Declaração - ${"x".repeat(150)}.pdf`
  );
  assert.equal(
    nomeArquivoDeclaracao(`Declaração ${"y".repeat(300)}`, "docx"),
    `${`Declaração ${"y".repeat(300)}`.slice(0, 150)}.docx`
  );
  // o 150º ponto de código é um emoji de 2 unidades UTF-16: fica inteiro, sem surrogate solto
  const comEmoji = nomeArquivoDeclaracao(`${"x".repeat(149)}😀zzz`, "pdf");
  assert.equal(comEmoji, `Declaração - ${"x".repeat(149)}😀.pdf`);
  assert.ok(comEmoji.isWellFormed());
  assert.equal(Array.from(comEmoji.slice("Declaração - ".length, -".pdf".length)).length, 150);
  // cortado em 150 pontos de código mesmo com emojis em todo o título
  const soEmojis = nomeArquivoDeclaracao("😀".repeat(300), "pdf");
  assert.ok(soEmojis.isWellFormed());
  assert.equal(soEmojis, `Declaração - ${"😀".repeat(150)}.pdf`);
});

test("montarDadosDeclaracao: parágrafos por linha em branco, destinatário e referência", () => {
  const d = montarDadosDeclaracao({
    titulo: "Declaração de teste",
    texto: "Primeiro parágrafo\ncontinua aqui.\n\n\nSegundo parágrafo.\r\n\r\n   ",
    cabecalho: CAB,
  });
  assert.deepEqual(d.paragrafos, ["Primeiro parágrafo continua aqui.", "Segundo parágrafo."]);
  assert.equal(d.destinatario, "Prefeitura de Exemplo");
  assert.equal(d.referencia, "Ref.: CE 009/2026 — Iluminação pública");
  assert.equal(d.localData, "Cidade/MG, 13 de outubro de 2026");
  assert.deepEqual(d.representante, CAB.representante);
  const semLicitacao = montarDadosDeclaracao({
    titulo: "T",
    texto: "x",
    cabecalho: { ...CAB, orgao: null, edital: null, objeto: null },
  });
  assert.equal(semLicitacao.destinatario, null);
  assert.equal(semLicitacao.referencia, null);
});
