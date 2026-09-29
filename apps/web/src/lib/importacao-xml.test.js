import { describe, it, expect } from "vitest";
import { cadastroDoXml, lancamentoDoXml } from "./importacao-xml";

// DocumentoFiscal como o lerXmlFiscal devolve (dados fictícios)
const NFE = {
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
  vencimentos: [
    { numero: "002", data: "2026-11-10", valor: 100 },
    { numero: "001", data: "2026-10-10", valor: 100.1 },
    { numero: "003", data: "2026-12-10", valor: 100 },
  ],
  forma_pagamento: "boleto",
  descricao: "VENDA DE MERCADORIA",
  itens: [],
  avisos: [],
  duvidosos: [],
};

const NFSE = {
  ...NFE,
  tipo: "nfse",
  numero: "987",
  chave: null,
  valor_total: 1500,
  emitente: {
    nome: "SINERGIA SERVICOS LTDA",
    documento: "11444777000161",
    ie: null,
    endereco: null,
  },
  destinatario: { nome: "PREFEITURA MUNICIPAL DE EXEMPLO", documento: "46523015000135" },
  vencimentos: [],
  forma_pagamento: null,
  descricao: "MANUTENCAO DE ILUMINACAO PUBLICA",
};

const CONTA = { id: "conta-1", nome: "Banco Principal" };

describe("lancamentoDoXml — despesa", () => {
  const fornecedor = {
    id: "f1",
    nome_razao: "Elétrica M&M",
    cnpj: "11.222.333/0001-81",
    categorias: ["Material Elétrico"],
  };
  const categorias = [
    { id: "c1", nome: "Material Elétrico", tipo: "Despesa" },
    { id: "c2", nome: "Vendas", tipo: "Receita" },
  ];

  it("grava fornecedor, categoria, chave, nº do documento e o 1º vencimento", () => {
    const r = lancamentoDoXml(NFE, {
      tipo: "despesa",
      pessoa: fornecedor,
      conta: CONTA,
      categorias,
      empresaId: "emp-1",
      hoje: "2026-09-25",
    });
    expect(r.rotulo).toBe("NF-e");
    expect(r.duplicatas).toBe(3);
    expect(r.registro).toEqual({
      empresa_id: "emp-1",
      tipo: "Despesa",
      conta_id: "conta-1",
      conta_nome: "Banco Principal",
      valor: 300.1,
      data: "2026-09-10",
      data_vencimento: "2026-10-10",
      descricao: "NF-e 1234 - ELETRICA M&M LTDA",
      status: "em_aberto",
      forma_pagamento: "boleto",
      observacoes: "Importado de XML - NF-e 1234",
      fornecedor_id: "f1",
      fornecedor_nome: "Elétrica M&M",
      categoria_id: "c1",
      categoria_nome: "Material Elétrico",
      chave_nfe: "35260911222333000181550010000012341123456787",
      numero_documento: "35260911222333000181550010000012341123456787",
    });
  });

  it("NFS-e sem chave: numero_documento = número; sem vencimentos, vence na emissão", () => {
    const { registro, duplicatas, rotulo } = lancamentoDoXml(NFSE, {
      tipo: "despesa",
      pessoa: { id: "f2", nome_razao: "SINERGIA SERVICOS LTDA", cnpj: "11444777000161" },
      conta: CONTA,
      empresaId: "emp-1",
      hoje: "2026-09-25",
    });
    expect(rotulo).toBe("NFS-e");
    expect(duplicatas).toBe(0);
    expect(registro).toMatchObject({
      valor: 1500,
      data: "2026-09-10",
      data_vencimento: "2026-09-10",
      chave_nfe: null,
      numero_documento: "987",
      categoria_id: null,
      forma_pagamento: null,
      observacoes: "Importado de XML - NFS-e 987",
    });
  });
});

describe("lancamentoDoXml — receita", () => {
  it("a pessoa é o destinatário/tomador; receita não leva chave nem nº do documento", () => {
    const { registro } = lancamentoDoXml(NFSE, {
      tipo: "receita",
      pessoa: { id: "cl1", nome_razao: "Prefeitura de Exemplo", documento: "46.523.015/0001-35" },
      conta: CONTA,
      empresaId: "emp-1",
      hoje: "2026-09-25",
    });
    expect(registro).toEqual({
      empresa_id: "emp-1",
      tipo: "receita",
      conta_id: "conta-1",
      conta_nome: "Banco Principal",
      valor: 1500,
      data: "2026-09-10",
      data_vencimento: "2026-09-10",
      descricao: "NFS-e 987 - PREFEITURA MUNICIPAL DE EXEMPLO",
      status: "em_aberto",
      forma_pagamento: null,
      observacoes: "Importado de XML - NFS-e 987",
      cliente_id: "cl1",
      cliente_nome: "Prefeitura de Exemplo",
    });
  });

  it("sem cliente cadastrado guarda só o nome lido; sem nada, 'Cliente Desconhecido'", () => {
    const opcoes = {
      tipo: "receita",
      pessoa: null,
      conta: CONTA,
      empresaId: "e",
      hoje: "2026-09-25",
    };
    expect(lancamentoDoXml(NFSE, opcoes).registro).toMatchObject({
      cliente_id: null,
      cliente_nome: "PREFEITURA MUNICIPAL DE EXEMPLO",
    });
    const semTomador = {
      ...NFSE,
      numero: null,
      descricao: null,
      destinatario: { nome: null, documento: null },
    };
    expect(lancamentoDoXml(semTomador, opcoes).registro).toMatchObject({
      cliente_id: null,
      cliente_nome: "Cliente Desconhecido",
      descricao: "NFS-e S/N - Cliente Desconhecido",
      observacoes: "Importado de XML - NFS-e S/N",
    });
  });
});

describe("cadastroDoXml", () => {
  it("fornecedor novo com CNPJ só em dígitos e IE; CPF → PF", () => {
    expect(cadastroDoXml(NFE, "despesa")).toEqual({
      nome_razao: "ELETRICA M&M LTDA",
      tipo_pessoa: "PJ",
      ativo: true,
      cnpj: "11222333000181",
      inscricao_estadual: "123456789110",
    });
    const pf = {
      ...NFE,
      emitente: { nome: "JOSE DA SILVA", documento: "123.456.789-09", ie: null },
    };
    expect(cadastroDoXml(pf, "despesa")).toMatchObject({ tipo_pessoa: "PF", cnpj: "12345678909" });
  });

  it("despesa sem emitente ainda cria 'Fornecedor Desconhecido' (como antes)", () => {
    const semEmitente = { ...NFE, emitente: { nome: null, documento: null, ie: null } };
    expect(cadastroDoXml(semEmitente, "despesa")).toEqual({
      nome_razao: "Fornecedor Desconhecido",
      tipo_pessoa: "PJ",
      ativo: true,
      cnpj: "",
      inscricao_estadual: "",
    });
  });

  it("cliente novo só com CPF/CNPJ do tomador", () => {
    expect(cadastroDoXml(NFSE, "receita")).toEqual({
      nome_razao: "PREFEITURA MUNICIPAL DE EXEMPLO",
      tipo_pessoa: "PJ",
      ativo: true,
      documento: "46523015000135",
    });
    const semDocumento = { ...NFSE, destinatario: { nome: "CONSUMIDOR", documento: null } };
    expect(cadastroDoXml(semDocumento, "receita")).toBeNull();
  });
});
