import { describe, it, expect } from "vitest";
import { acharPessoa, adequarLeituraAoContexto, montarPreenchimento } from "./documento-financeiro";

/** DocumentoFiscal completo (formato do contrato) com os campos sobrescritos. */
function doc(extra = {}) {
  return {
    origem: "xml",
    tipo: "nfe",
    numero: "1234",
    chave: "35260911222333000181550010000012341123456787",
    data_emissao: "2026-09-10",
    valor_total: 300.1,
    emitente: {
      nome: "ELETRICA M&M LTDA",
      documento: "11222333000181",
      ie: "123456789110",
      endereco: "RUA DAS FLORES, 100 - CENTRO - SAO PAULO/SP - CEP 01001-000",
    },
    destinatario: { nome: "CONSTRUTORA EXEMPLO LTDA", documento: "11444777000161" },
    vencimentos: [],
    forma_pagamento: null,
    descricao: "VENDA DE MERCADORIA",
    itens: [],
    avisos: [],
    duvidosos: [],
    ...extra,
  };
}

const categorias = [
  { id: "r1", nome: "Material Elétrico", tipo: "Receita" },
  { id: "d1", nome: "Material Elétrico", tipo: "Despesa" },
  { id: "d2", nome: "Combustível", tipo: "Despesa" },
];

const fornecedores = [
  { id: "f1", nome_razao: "ELETRICA M&M LTDA", cnpj: "99.888.777/0001-66" },
  {
    id: "f2",
    nome_razao: "Elétrica MM (matriz)",
    cnpj: "11.222.333/0001-81",
    categorias: '["Material Eletrico"]',
  },
  { id: "f3", nome_razao: "José da Silva", cnpj: "" },
];

describe("montarPreenchimento — despesa", () => {
  it("NF-e: fornecedor pelos DÍGITOS do CNPJ (antes do nome), categoria de despesa, parcelas e itens", () => {
    const r = montarPreenchimento(
      doc({
        forma_pagamento: "boleto",
        vencimentos: [
          { numero: "002", data: "2026-11-10", valor: 100 },
          { numero: "001", data: "2026-10-10", valor: 100.1 },
          { numero: "003", data: "2026-12-10", valor: 100 },
        ],
        itens: [
          {
            descricao: "CABO 2,5MM",
            codigo: "CAB-25",
            ean: null,
            ncm: "85444900",
            unidade: null,
            quantidade: 2,
            valor_unitario: 150,
            valor_total: 300,
          },
        ],
      }),
      { tipo: "despesa", pessoas: fornecedores, categorias }
    );
    expect(r.patch).toEqual({
      valor: "300.10",
      data_competencia: "2026-09-10",
      data_vencimento: "2026-10-10",
      forma_pagamento: "boleto",
      descricao: "NF-e 1234 - ELETRICA M&M LTDA",
      chave_nfe: "35260911222333000181550010000012341123456787",
      numero_documento: "35260911222333000181550010000012341123456787",
      fornecedor_id: "f2",
      fornecedor_nome: "Elétrica MM (matriz)",
      categoria_id: "d1",
      categoria_nome: "Material Elétrico",
    });
    expect(r.parcelas).toEqual([
      {
        numero: 1,
        valor: 100.1,
        data_vencimento: "2026-10-10",
        data_pagamento: null,
        status: "em_aberto",
      },
      {
        numero: 2,
        valor: 100,
        data_vencimento: "2026-11-10",
        data_pagamento: null,
        status: "em_aberto",
      },
      {
        numero: 3,
        valor: 100,
        data_vencimento: "2026-12-10",
        data_pagamento: null,
        status: "em_aberto",
      },
    ]);
    expect(r.itens).toEqual([
      {
        descricao: "CABO 2,5MM",
        codigo: "CAB-25",
        ean: "",
        ncm: "85444900",
        unidade: "UN",
        quantidade: 2,
        valor_unitario: 150,
        valor_total: 300,
      },
    ]);
    expect(r.pessoaSugerida).toBeNull();
    expect(r.avisos).toEqual([]);
  });

  it("recibo sem CPF/CNPJ: fornecedor pelo NOME normalizado; vencimento lido; sem parcelas", () => {
    const r = montarPreenchimento(
      doc({
        origem: "ia",
        tipo: "recibo",
        numero: null,
        chave: null,
        valor_total: 450,
        emitente: { nome: "JOSE  DA SILVA", documento: null, ie: null, endereco: null },
        vencimentos: [{ numero: null, data: "2026-09-20", valor: 450 }],
        forma_pagamento: "dinheiro",
      }),
      { tipo: "despesa", pessoas: fornecedores, categorias }
    );
    expect(r.patch).toEqual({
      valor: "450.00",
      data_competencia: "2026-09-10",
      data_vencimento: "2026-09-20",
      forma_pagamento: "dinheiro",
      descricao: "Recibo - JOSE DA SILVA",
      fornecedor_id: "f3",
      fornecedor_nome: "José da Silva",
    });
    expect(r.parcelas).toEqual([]);
  });

  it("sem vencimento: data de vencimento = emissão; número do documento sem chave", () => {
    const r = montarPreenchimento(doc({ tipo: "cupom", chave: null, numero: "55" }), {
      tipo: "despesa",
      pessoas: fornecedores,
    });
    expect(r.patch).toMatchObject({
      data_competencia: "2026-09-10",
      data_vencimento: "2026-09-10",
      descricao: "Cupom fiscal 55 - ELETRICA M&M LTDA",
      numero_documento: "55",
    });
    expect(r.patch).not.toHaveProperty("chave_nfe");
  });

  // O "Regime Contábil" dos relatórios filtra por numero_documento: só documento fiscal ganha número.
  it.each([
    ["boleto", "123456"],
    ["recibo", "77"],
    ["comprovante_pix", "9001"],
    ["outro", "5"],
  ])("%s com número e sem chave NÃO preenche numero_documento", (tipo, numero) => {
    const r = montarPreenchimento(
      doc({
        origem: "ia",
        tipo,
        numero,
        chave: null,
        emitente: { nome: "JOSE DA SILVA", documento: null, ie: null, endereco: null },
        vencimentos: [{ numero: null, data: "2026-10-05", valor: 89.9 }],
      }),
      { tipo: "despesa", pessoas: fornecedores }
    );
    expect(r.patch).not.toHaveProperty("numero_documento");
    expect(r.patch).not.toHaveProperty("chave_nfe");
    expect(r.patch.descricao).toContain(numero);
  });

  it.each([
    ["nfse", "8801"],
    ["cupom", "55"],
    ["nfce", "302"],
  ])("%s sem chave preenche numero_documento com o número", (tipo, numero) => {
    const r = montarPreenchimento(doc({ origem: "ia", tipo, chave: null, numero }), {
      tipo: "despesa",
      pessoas: fornecedores,
    });
    expect(r.patch.numero_documento).toBe(numero);
  });

  it("qualquer tipo COM chave de NF-e preenche numero_documento e chave_nfe", () => {
    const chave = "35260911222333000181550010000012341123456787";
    const r = montarPreenchimento(doc({ origem: "ia", tipo: "outro", chave, numero: "1234" }), {
      tipo: "despesa",
      pessoas: fornecedores,
    });
    expect(r.patch).toMatchObject({ numero_documento: chave, chave_nfe: chave });
  });

  it("boleto com número: a descrição continua trazendo o número", () => {
    const r = montarPreenchimento(
      doc({
        origem: "ia",
        tipo: "boleto",
        numero: "123",
        chave: null,
        emitente: { nome: "Provedor Net", documento: null, ie: null, endereco: null },
      }),
      { tipo: "despesa", pessoas: fornecedores }
    );
    expect(r.patch.descricao).toBe("Boleto 123 - Provedor Net");
    expect(r.patch).not.toHaveProperty("numero_documento");
  });

  it("fornecedor não cadastrado: sugere o cadastro e limpa a seleção anterior", () => {
    const r = montarPreenchimento(
      doc({
        emitente: {
          nome: "NOVO FORNECEDOR LTDA",
          documento: "11444777000161",
          ie: null,
          endereco: "RUA B, 1 - CENTRO",
        },
        avisos: ["XML sem o protocolo de autorização da SEFAZ: confira se a nota foi autorizada."],
      }),
      { tipo: "despesa", pessoas: fornecedores, categorias }
    );
    expect(r.patch).toMatchObject({ fornecedor_id: "", fornecedor_nome: "NOVO FORNECEDOR LTDA" });
    expect(r.patch).not.toHaveProperty("categoria_id");
    expect(r.pessoaSugerida).toEqual({
      nome: "NOVO FORNECEDOR LTDA",
      documento: "11444777000161",
      endereco: "RUA B, 1 - CENTRO",
    });
    expect(r.avisos).toEqual([
      "XML sem o protocolo de autorização da SEFAZ: confira se a nota foi autorizada.",
    ]);
  });

  it("boleto sem total: valor pela soma dos vencimentos e forma boleto pelo tipo", () => {
    const r = montarPreenchimento(
      doc({
        origem: "ia",
        tipo: "boleto",
        numero: null,
        chave: null,
        data_emissao: null,
        valor_total: null,
        emitente: { nome: null, documento: null, ie: null, endereco: null },
        vencimentos: [{ numero: null, data: "2026-10-05", valor: 89.9 }],
        descricao: "Mensalidade internet",
      }),
      { tipo: "despesa", pessoas: fornecedores }
    );
    expect(r.patch).toEqual({
      valor: "89.90",
      data_vencimento: "2026-10-05",
      forma_pagamento: "boleto",
      descricao: "Boleto - Mensalidade internet",
    });
    expect(r.pessoaSugerida).toBeNull();
  });

  it("documento nulo → nada a preencher", () => {
    expect(montarPreenchimento(null, { tipo: "despesa" })).toEqual({
      patch: {},
      parcelas: [],
      itens: [],
      pessoaSugerida: null,
      avisos: [],
    });
  });
});

describe("montarPreenchimento — receita", () => {
  const clientes = [
    { id: "c1", nome_razao: "Construtora Exemplo", documento: "11.444.777/0001-61" },
    { id: "c2", nome_razao: "ELETRICA M&M LTDA", documento: "11222333000181" },
  ];

  it("cliente = destinatário por dígitos; sem chave/categoria; cartão não entra; parcelas de receita", () => {
    const r = montarPreenchimento(
      doc({
        tipo: "nfse",
        numero: "2026000000123",
        chave: null,
        forma_pagamento: "cartao",
        vencimentos: [
          { numero: "1", data: "2026-10-10", valor: 150.05 },
          { numero: "2", data: "2026-11-10", valor: 150.05 },
        ],
      }),
      { tipo: "receita", pessoas: clientes, categorias }
    );
    expect(r.patch).toEqual({
      valor: "300.10",
      data_competencia: "2026-09-10",
      data_vencimento: "2026-10-10",
      descricao: "NFS-e 2026000000123 - CONSTRUTORA EXEMPLO LTDA",
      cliente_id: "c1",
      cliente_nome: "Construtora Exemplo",
    });
    expect(r.parcelas).toEqual([
      {
        numero: 1,
        valor: 150.05,
        data_vencimento: "2026-10-10",
        data_pagamento: "",
        status: "em_aberto",
      },
      {
        numero: 2,
        valor: 150.05,
        data_vencimento: "2026-11-10",
        data_pagamento: "",
        status: "em_aberto",
      },
    ]);
  });

  it("cliente não cadastrado → pessoaSugerida com o documento do destinatário", () => {
    const r = montarPreenchimento(
      doc({
        destinatario: { nome: "PREFEITURA DE EXEMPLO", documento: "12345678909" },
        forma_pagamento: "pix",
      }),
      { tipo: "receita", pessoas: clientes }
    );
    expect(r.patch).toMatchObject({
      cliente_id: "",
      cliente_nome: "PREFEITURA DE EXEMPLO",
      forma_pagamento: "pix",
    });
    expect(r.pessoaSugerida).toEqual({
      nome: "PREFEITURA DE EXEMPLO",
      documento: "12345678909",
      endereco: null,
    });
  });
});

describe("acharPessoa", () => {
  it("dígitos primeiro, nome (sem acento/caixa/espaços extras) depois, senão null", () => {
    const alvo = (nome, documento) => ({ nome, documento });
    expect(acharPessoa(fornecedores, alvo("x", "11222333000181"), "cnpj")?.id).toBe("f2");
    expect(acharPessoa(fornecedores, alvo(" jose da  silva ", null), "cnpj")?.id).toBe("f3");
    expect(acharPessoa(fornecedores, alvo("Outro", "12345678909"), "cnpj")).toBeNull();
    expect(acharPessoa([], alvo(null, null), "cnpj")).toBeNull();
  });
});

describe("adequarLeituraAoContexto", () => {
  const parcelas = [1, 2, 3].map((n) => ({
    numero: n,
    valor: 100,
    data_vencimento: `2026-10-${String(n * 10).padStart(2, "0")}`,
    status: "em_aberto",
  }));
  const itens = [{ descricao: "CABO 2,5MM", quantidade: 10 }];
  const leitura = (extra) => ({ parcelas, itens, avisos: ["Valor lido com dúvida"], ...extra });

  it("despesa nova: entra tudo e a tela ajusta o parcelamento", () => {
    const r = adequarLeituraAoContexto(leitura(), {});
    expect(r).toEqual({
      parcelas,
      itens,
      avisos: ["Valor lido com dúvida"],
      tocaParcelamento: true,
    });
  });

  it("edição: ignora as duplicatas, avisa e não mexe no parcelamento", () => {
    const r = adequarLeituraAoContexto(leitura(), { edicao: true });
    expect(r.tocaParcelamento).toBe(false);
    expect(r.parcelas).toEqual([]);
    expect(r.avisos).toEqual([
      "Valor lido com dúvida",
      "O documento traz 3 vencimentos, mas o parcelamento não foi alterado na edição.",
    ]);
    // os itens da nota continuam valendo (despesa que ainda não teve entrada de estoque)
    expect(r.itens).toEqual(itens);
  });

  it("edição com um vencimento só (o montarPreenchimento devolve parcelas vazias): sem aviso", () => {
    const r = adequarLeituraAoContexto(leitura({ parcelas: [] }), { edicao: true });
    expect(r.tocaParcelamento).toBe(false);
    expect(r.avisos).toEqual(["Valor lido com dúvida"]);
  });

  it("edição de despesa que já gerou entrada de estoque: não carrega os itens da nota", () => {
    const r = adequarLeituraAoContexto(leitura(), { edicao: true, jaGerouEstoque: true });
    expect(r.itens).toEqual([]);
    expect(r.avisos).toContain(
      "Esta despesa já gerou entrada de estoque: os itens da nota não foram carregados."
    );
  });

  it("já gerou estoque, mas o documento não tem itens: sem aviso", () => {
    const r = adequarLeituraAoContexto(leitura({ itens: [] }), {
      edicao: true,
      jaGerouEstoque: true,
    });
    expect(r.avisos).toEqual(["Valor lido com dúvida", expect.stringContaining("3 vencimentos")]);
  });

  it("pré-lançamento e reconciliação (não gravam parcelas nem itens): só o valor e o vencimento", () => {
    const r = adequarLeituraAoContexto(leitura(), { salvaDadosDoDocumento: false });
    expect(r.tocaParcelamento).toBe(false);
    expect(r.parcelas).toEqual([]);
    expect(r.itens).toEqual([]);
    expect(r.avisos).toEqual([
      "Valor lido com dúvida",
      "O documento traz 3 vencimentos, mas esta tela não divide em parcelas: confira o valor e o vencimento.",
    ]);
  });

  it("não altera a leitura recebida", () => {
    const entrada = leitura();
    adequarLeituraAoContexto(entrada, { edicao: true, jaGerouEstoque: true });
    expect(entrada).toEqual(leitura());
  });

  it("a partir do documento: NF-e com 3 duplicatas vira parcelas só na despesa nova", () => {
    const montado = montarPreenchimento(
      doc({
        vencimentos: [
          { numero: "001", data: "2026-10-10", valor: 100 },
          { numero: "002", data: "2026-11-10", valor: 100 },
          { numero: "003", data: "2026-12-10", valor: 100.1 },
        ],
        itens: [{ descricao: "CABO", quantidade: 1, valor_unitario: 300.1, valor_total: 300.1 }],
      }),
      { tipo: "despesa" }
    );
    expect(adequarLeituraAoContexto(montado, {}).parcelas).toHaveLength(3);
    const edicao = adequarLeituraAoContexto(montado, { edicao: true });
    expect(edicao.parcelas).toEqual([]);
    expect(edicao.itens).toHaveLength(1);
    // o patch (valor total, vencimento da 1ª duplicata) segue o mesmo nos dois casos
    expect(montado.patch).toMatchObject({ valor: "300.10", data_vencimento: "2026-10-10" });
  });
});
