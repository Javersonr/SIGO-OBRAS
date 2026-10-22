// node --test supabase/functions/_shared/documentos/dados-proposta.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  localDaEmpresa,
  montarCabecalhoLicitacao,
  montarDadosProposta,
  nomeArquivoProposta,
  validarRepresentante,
} from "./dados-proposta.ts";

const EMPRESA = {
  nome: "Empresa Teste",
  razao_social: "Empresa Teste Construções Ltda",
  cnpj: "11222333000181",
  endereco: "Rua das Obras",
  numero: "100",
  bairro: "Centro",
  cidade: "Cidade Exemplo",
  estado: "MG",
  cep: "38000000",
  email: "contato@exemplo.test",
};
const REP = { nome: "Fulana de Tal", cargo: "Sócia-administradora", cpf: "52998224725" };
const ITENS = [
  { id: "1", numero: "1", etapa: true, descricao: "Serviços preliminares", ordem: 1 },
  {
    id: "2",
    numero: "1.1",
    etapa: false,
    descricao: "Placa de obra",
    codigo: "74209/001",
    fonte: "SINAPI",
    unidade: "m²",
    quantidade: 6,
    valor_unitario_ref: 500,
    valor_unitario: 438.25,
    valor_total: 2629.5,
    ordem: 2,
  },
  {
    id: "3",
    numero: "1.2",
    etapa: false,
    descricao: "Mobilização",
    unidade: "un",
    quantidade: 1,
    valor_unitario_ref: 1000,
    valor_unitario: 1000,
    valor_total: 1000,
    ordem: 3,
  },
];

test("montarDadosProposta: linhas na ordem da tela, subtotal da etapa, total e extenso", () => {
  const d = montarDadosProposta({
    itens: ITENS,
    info: {
      orgao: "Prefeitura de Exemplo",
      objeto: "Iluminação pública",
      edital: "CE 009/2026",
      bdi: "23,96",
    },
    oportunidade: { nome: "CE 009 Exemplo" },
    empresa: EMPRESA,
    representante: REP,
    opcoes: { validadeDias: 60, local: "Cidade Exemplo/MG", dataISO: "2026-10-13" },
  });
  assert.equal(d.titulo, "Proposta de preços");
  assert.deepEqual(d.empresa, {
    nome: "Empresa Teste Construções Ltda",
    cnpj: "11.222.333/0001-81",
    endereco: "Rua das Obras, 100 - Centro - Cidade Exemplo/MG - CEP 38000-000",
    contato: "E-mail: contato@exemplo.test",
  });
  assert.deepEqual(
    d.linhas.map((l) => [l.tipo, l.numero, l.total, l.nivel]),
    [
      ["etapa", "1", 3629.5, 1],
      ["item", "1.1", 2629.5, 2],
      ["item", "1.2", 1000, 2],
    ]
  );
  assert.equal(d.totalGeral, 3629.5);
  assert.equal(d.totalExtenso, "três mil seiscentos e vinte e nove reais e cinquenta centavos");
  assert.equal(d.validade, "Validade da proposta: 60 dias");
  assert.equal(d.localData, "Cidade Exemplo/MG, 13 de outubro de 2026");
  assert.deepEqual(d.representante, {
    nome: "Fulana de Tal",
    cargo: "Sócia-administradora",
    cpf: "529.982.247-25",
  });
  assert.equal(d.orgao, "Prefeitura de Exemplo");
  assert.equal(d.edital, "CE 009/2026");
  assert.equal(d.bdi, "23,96%");
  assert.equal(d.dataBase, null);
});

test("montarCabecalhoLicitacao: sem orcamento_info cai nos campos da oportunidade", () => {
  const c = montarCabecalhoLicitacao({
    oportunidade: {
      nome: "Obra X",
      orgao: "Município Y",
      licitacao_numero: "12/2026",
      licitacao_processo: "88/2026",
    },
    empresa: EMPRESA,
    representante: REP,
    opcoes: { local: "", dataISO: "2026-10-13" },
  });
  assert.equal(c.orgao, "Município Y");
  assert.equal(c.objeto, "Obra X");
  assert.equal(c.edital, "Edital 12/2026 - Processo 88/2026");
  assert.equal(c.localData, "13 de outubro de 2026");
});

test("validarRepresentante, localDaEmpresa e nomeArquivoProposta", () => {
  assert.deepEqual(validarRepresentante(REP), { ok: true, erros: [] });
  assert.deepEqual(validarRepresentante({ nome: " ", cpf: "123" }), {
    ok: false,
    erros: ["Informe o nome do representante legal", "CPF do representante legal inválido"],
  });
  assert.equal(localDaEmpresa(EMPRESA), "Cidade Exemplo/MG");
  assert.equal(localDaEmpresa(null), "");
  assert.equal(
    nomeArquivoProposta('CE 009: "Exemplo"/SP', "2026-10-13", "pdf"),
    "Proposta - CE 009- -Exemplo--SP - 2026-10-13.pdf"
  );
});
