/**
 * Paridade dos documentos da licitação: os dados da proposta e do cronograma montados no servidor
 * (supabase/functions/_shared/documentos/) são iguais aos da tela (proposta-orcamento.js e
 * cronograma-export.js), e as planilhas e os PDFs que o servidor gera (proposta-export.ts e
 * cronograma-export.ts) são iguais aos da tela: as mesmas células e o mesmo PDF, byte a byte.
 * Spec 2026-10-09 §3 e §6.
 */
import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import * as modAutoTable from "jspdf-autotable";
import * as telaProposta from "./proposta-orcamento";
import * as telaExport from "./proposta-export";
import * as telaCronExport from "./cronograma-export";
import { formatarCpf, validarCpf } from "./cpf";
import { formatarCpfCnpj } from "./ler-documento";
import { formatarTelefone } from "./telefone";
import { etapasDoOrcamento } from "./cronograma-ff";
import { montarDadosCronograma, nomeArquivoCronograma } from "./cronograma-export";
import { montarRegistrosImportacao } from "./orcamento-registros";
import * as formatos from "../../../../supabase/functions/_shared/documentos/formatos.ts";
import * as srvProposta from "../../../../supabase/functions/_shared/documentos/dados-proposta.ts";
import * as srvCronograma from "../../../../supabase/functions/_shared/documentos/dados-cronograma.ts";
import * as srvExport from "../../../../supabase/functions/_shared/documentos/proposta-export.ts";
import * as srvCronExport from "../../../../supabase/functions/_shared/documentos/cronograma-export.ts";
import { orcamentoSintetico } from "../../../../supabase/functions/_shared/orcamento/testes/sintetico.ts";

const E = "00000000-0000-4000-8000-000000000001";
const OP = "00000000-0000-4000-8000-000000000011";

export const EMPRESA = {
  nome: "Empresa Teste",
  razao_social: "Empresa Teste Construções & Serviços Ltda",
  nome_fantasia: "Teste",
  cnpj: "11222333000181",
  endereco: "Rua das Obras",
  numero: "100",
  complemento: "Sala 2",
  bairro: "Centro",
  cidade: "Cidade Exemplo",
  estado: "MG",
  cep: "38000000",
  telefone: "3433330000",
  email: "contato@exemplo.test",
};
export const REPRESENTANTE = {
  nome: "Fulana de Tal",
  cargo: "Sócia-administradora",
  cpf: "52998224725",
};
export const OPORTUNIDADE = {
  id: OP,
  nome: "CE 009/2026 — Iluminação pública",
  orgao: "Prefeitura de Exemplo",
  licitacao_numero: "009/2026",
  licitacao_processo: "123/2026",
};
export const INFO = {
  orgao: "Prefeitura Municipal de Exemplo",
  objeto: "Modernização da iluminação pública",
  edital: "CE 009/2026",
  data_base: "09/2025",
  bdi: "23,96",
};
export const OPCOES = { validadeDias: 60, local: "Cidade Exemplo/MG", dataISO: "2026-10-13" };

/**
 * Orçamento gravado como a tela grava: as `n` primeiras linhas do orçamento sintético (etapa 1, os
 * itens 1.1 e 1.2, a subetapa 1.3 e os itens dela…), com o desconto aplicado.
 */
export function itensDoOrcamento(n = 60, descontoPct = 12.35) {
  return montarRegistrosImportacao(orcamentoSintetico().slice(0, n), {
    empresaId: E,
    oportunidadeId: OP,
    descontoPct,
  }).map((r, i) => ({ ...r, id: `item-${i}` }));
}

describe("formatos: tela × servidor", () => {
  it("valor por extenso em valores de borda e aleatórios", () => {
    const valores = [
      0,
      0.01,
      0.99,
      1,
      1.01,
      19,
      20,
      21,
      100,
      101,
      999.99,
      1000,
      1001,
      1100,
      2500,
      1e6,
      1e6 + 1,
      1417472.96,
      2e9,
    ];
    let semente = 20261013;
    for (let i = 0; i < 300; i++) {
      semente = (semente * 48271) % 2147483647;
      valores.push((semente % 500000000) / 100);
    }
    for (const v of valores) {
      expect(formatos.valorPorExtenso(v), String(v)).toBe(telaProposta.valorPorExtenso(v));
    }
  });
  it("CPF, CNPJ e telefone", () => {
    const entradas = [
      "52998224725",
      "529.982.247-25",
      "5299",
      "",
      null,
      "11222333000181",
      "abc",
      "3433330000",
      "34999990000",
      "+55 34 99999-0000",
      "123",
    ];
    for (const x of entradas) {
      expect(formatos.formatarCpf(x), String(x)).toBe(formatarCpf(x));
      expect(formatos.validarCpf(x), String(x)).toBe(validarCpf(x));
      expect(formatos.formatarCpfCnpj(x), String(x)).toBe(formatarCpfCnpj(x));
      expect(formatos.formatarTelefone(x), String(x)).toBe(formatarTelefone(x));
    }
  });
});

describe("dados da proposta e do cronograma: tela × servidor", () => {
  const casos = [
    {
      nome: "completo",
      info: INFO,
      oportunidade: OPORTUNIDADE,
      empresa: EMPRESA,
      representante: REPRESENTANTE,
      opcoes: OPCOES,
    },
    {
      nome: "sem info",
      info: null,
      oportunidade: OPORTUNIDADE,
      empresa: EMPRESA,
      representante: REPRESENTANTE,
      opcoes: OPCOES,
    },
    { nome: "vazio", info: {}, oportunidade: {}, empresa: {}, representante: {}, opcoes: {} },
    {
      nome: "1 dia",
      info: INFO,
      oportunidade: OPORTUNIDADE,
      empresa: { nome: "Só nome" },
      representante: { nome: "X" },
      opcoes: { validadeDias: 1 },
    },
  ];
  for (const c of casos) {
    it(`montarDadosProposta: ${c.nome}`, () => {
      const itens = itensDoOrcamento();
      expect(srvProposta.montarDadosProposta({ itens, ...c })).toEqual(
        telaProposta.montarDadosProposta({ itens, ...c })
      );
      expect(srvProposta.montarCabecalhoLicitacao(c)).toEqual(
        telaProposta.montarCabecalhoLicitacao(c)
      );
    });
    it(`montarDadosCronograma: ${c.nome}`, () => {
      const etapas = etapasDoOrcamento(itensDoOrcamento());
      const cronograma = {
        meses: 4,
        pct: Object.fromEntries(etapas.map((e) => [e.numero, [20, 35, 30, 15]])),
      };
      expect(srvCronograma.montarDadosCronograma({ etapas, cronograma, ...c })).toEqual(
        montarDadosCronograma({ etapas, cronograma, ...c })
      );
    });
  }
  it("validarRepresentante, localDaEmpresa e nomes de arquivo", () => {
    for (const r of [REPRESENTANTE, {}, { nome: " " }, { nome: "X", cpf: "123" }, undefined]) {
      expect(srvProposta.validarRepresentante(r)).toEqual(telaProposta.validarRepresentante(r));
    }
    for (const e of [EMPRESA, {}, null, { cidade: "Só cidade" }]) {
      expect(srvProposta.localDaEmpresa(e)).toBe(telaProposta.localDaEmpresa(e));
    }
    for (const n of ["CE 009/2026", 'a:b*c?"d"<e>|f', "", null, "x".repeat(300)]) {
      expect(srvProposta.nomeArquivoProposta(n, "2026-10-13", "pdf")).toBe(
        telaProposta.nomeArquivoProposta(n, "2026-10-13", "pdf")
      );
      expect(srvCronograma.nomeArquivoCronograma(n, "2026-10-13", "xlsx")).toBe(
        nomeArquivoCronograma(n, "2026-10-13", "xlsx")
      );
    }
  });
});

const autoTable = srvExport.resolverAutoTable(modAutoTable);
/** Data e id fixos: o jsPDF grava os dois no arquivo, e sem isto dois PDFs iguais sairiam diferentes. */
const pdfFixo = (doc) => {
  doc.setCreationDate(new Date(Date.UTC(2026, 9, 13, 12, 0, 0)));
  doc.setFileId("0".repeat(32));
  return doc.output();
};

describe("arquivos da proposta e do cronograma: tela × servidor", () => {
  for (const n of [3, 60, 400]) {
    it(`proposta com ${n} linhas: mesma planilha e mesmo PDF`, () => {
      const itens = itensDoOrcamento(n);
      const dados = telaProposta.montarDadosProposta({
        itens,
        info: INFO,
        oportunidade: OPORTUNIDADE,
        empresa: EMPRESA,
        representante: REPRESENTANTE,
        opcoes: OPCOES,
      });
      expect(srvExport.montarPlanilhaProposta(dados, XLSX)).toEqual(
        telaExport.montarPlanilhaProposta(dados)
      );
      expect(pdfFixo(srvExport.gerarPdfProposta(dados, { jsPDF, autoTable }))).toBe(
        pdfFixo(telaExport.gerarPdfProposta(dados, { jsPDF, autoTable }))
      );
    });
  }
  for (const meses of [1, 4, 12, 13, 24]) {
    it(`cronograma de ${meses} meses: mesma planilha e mesmo PDF`, () => {
      const etapas = etapasDoOrcamento(itensDoOrcamento(400));
      const linha = Array.from({ length: meses }, (_, j) =>
        j === meses - 1
          ? Number((100 - (Math.floor(10000 / meses) * (meses - 1)) / 100).toFixed(2))
          : Math.floor(10000 / meses) / 100
      );
      const cronograma = { meses, pct: Object.fromEntries(etapas.map((e) => [e.numero, linha])) };
      const dados = montarDadosCronograma({
        etapas,
        cronograma,
        info: INFO,
        oportunidade: OPORTUNIDADE,
        empresa: EMPRESA,
        representante: REPRESENTANTE,
        opcoes: OPCOES,
      });
      expect(srvCronExport.montarPlanilhaCronograma(dados, XLSX)).toEqual(
        telaCronExport.montarPlanilhaCronograma(dados)
      );
      expect(pdfFixo(srvCronExport.gerarPdfCronograma(dados, { jsPDF, autoTable }))).toBe(
        pdfFixo(telaCronExport.gerarPdfCronograma(dados, { jsPDF, autoTable }))
      );
    });
  }
});
