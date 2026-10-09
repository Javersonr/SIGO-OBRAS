/**
 * Paridade da validação das linhas do orçamento: o JSON do conector do Claude
 * (validarLinhasModelo, supabase/functions/_shared/orcamento/modelo.ts) e a planilha da tela
 * (lerPlanilhaModelo) dão os mesmos itens, info, erros, avisos e totais (spec 2026-10-08 §2).
 * Cada caso monta, com aoa_to_sheet, o workbook equivalente às linhas: uma coluna por campo, na
 * ordem do modelo, e a aba Informações com os rótulos do modelo.
 */
import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  ABA_INFORMACOES,
  ABA_ORCAMENTO,
  CABECALHOS_MODELO,
  CHAVES_INFO,
  LIMITE_LINHAS,
  ROTULOS_INFO,
  lerPlanilhaModelo,
} from "./orcamento-modelo";
import {
  CAMPOS_INFORMACOES_CONECTOR,
  CAMPOS_LINHA_CONECTOR,
  LIMITE_LINHAS as LIMITE_LINHAS_SERVIDOR,
  validarLinhasModelo,
} from "../../../../supabase/functions/_shared/orcamento/modelo.ts";
import { orcamentoSintetico } from "../../../../supabase/functions/_shared/orcamento/testes/sintetico.ts";

/** Workbook do modelo com as mesmas células que o JSON (null = célula vazia). */
function workbook(linhas, informacoes) {
  const wb = XLSX.utils.book_new();
  const orcamento = [
    CABECALHOS_MODELO,
    ...linhas.map((l) => CAMPOS_LINHA_CONECTOR.map((c) => l?.[c] ?? null)),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(orcamento), ABA_ORCAMENTO);
  const inf = informacoes || {};
  const aba = ROTULOS_INFO.map((rotulo, i) => [
    rotulo,
    inf[CAMPOS_INFORMACOES_CONECTOR[i]] ?? null,
  ]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aba), ABA_INFORMACOES);
  return wb;
}

function confere(linhas, informacoes = null) {
  const tela = lerPlanilhaModelo(workbook(linhas, informacoes));
  const { itensSemEtapa, ...servidor } = validarLinhasModelo(linhas, informacoes);
  expect(Array.isArray(itensSemEtapa)).toBe(true);
  expect(servidor).toEqual(tela);
  return { tela, itensSemEtapa };
}

const etapa = (item, descricao) => ({ item, descricao });
const linha = (item, descricao, quantidade, preco_unitario, extra = {}) => ({
  item,
  descricao,
  unidade: "un",
  quantidade,
  preco_unitario,
  ...extra,
});

// O ORC_OK de orcamento-modelo.test.js (Itatinga reduzido), em JSON.
const ORC_OK = [
  etapa("1", "SERVIÇOS PRELIMINARES"),
  {
    item: "1.1",
    codigo: "93358",
    fonte: "SINAPI",
    descricao: "Escavação manual",
    unidade: "m³",
    quantidade: 125.5,
    preco_unitario: 10.48,
    total: 1315.24,
  },
  {
    item: "1.2",
    descricao: "Placa de obra",
    unidade: "m²",
    quantidade: "2,88",
    preco_unitario: "400,00",
    total: "1.152,00",
  },
  etapa("2", "ILUMINAÇÃO"),
  {
    item: "2.1",
    codigo: 41210,
    fonte: "SINAPI",
    descricao: "Poste 12/1000",
    unidade: "un",
    quantidade: 6,
    preco_unitario: 2827.92,
    total: 16967.52,
  },
];
const INFO_OK = {
  orgao: "Prefeitura Municipal de Itatinga",
  objeto: "Iluminação pública",
  edital: "PE 12/2026",
  data_base: "09/2025",
  bdi: "23,96",
  fonte_precos: "SINAPI 09/2025",
  total_prefeitura: 19434.76,
  observacoes: "",
};

describe("paridade do modelo: constantes", () => {
  it("os campos do JSON seguem as colunas e os rótulos do modelo, na mesma ordem", () => {
    expect(CAMPOS_LINHA_CONECTOR).toHaveLength(CABECALHOS_MODELO.length);
    expect(LIMITE_LINHAS_SERVIDOR).toBe(LIMITE_LINHAS);
    const chaves = ROTULOS_INFO.map((r) => CHAVES_INFO[r]);
    expect(CAMPOS_INFORMACOES_CONECTOR.map((c) => (c === "fonte_precos" ? "fonte" : c))).toEqual(
      chaves
    );
  });
});

describe("paridade do modelo: casos", () => {
  it("ORC_OK (Itatinga reduzido) com e sem informações", () => {
    const { tela } = confere(ORC_OK, INFO_OK);
    expect(tela.erros).toEqual([]);
    expect(tela.totais.referencia).toBe(19434.76);
    confere(ORC_OK);
    confere(ORC_OK, { bdi: 23.96, data_base: 45901, total_prefeitura: "dezenove mil" });
  });
  it("item repetido, item vazio, '1.a' e '1.'", () => {
    confere([
      linha("1.1", "A", 1, 1),
      linha(null, "B", 1, 1),
      linha("1.a", "C", 1, 1),
      linha("1.", "D", 1, 1),
      linha("1.1", "E", 1, 1),
      linha("1.2", "", 1, 1),
    ]);
  });
  it("quantidade sem preço, preço sem quantidade, texto não numérico, zero e negativo", () => {
    confere([
      linha("1", "A", 0, 1),
      linha("2", "B", -1, 1),
      linha("3", "C", 1, -0.01),
      linha("4", "D", "abc", 1),
      linha("5", "E", 1, "dez"),
      linha("6", "F", 1, null),
      linha("7", "G", null, 1),
      linha("8", "H", 1, 1),
    ]);
  });
  it("total divergente (0,01 exato não avisa) e total que não é número", () => {
    confere([
      etapa("1", "Etapa"),
      linha("1.1", "A", 125.5, 10.48, { total: 1315.3 }),
      linha("1.2", "B", 125.5, 10.48, { total: 1315.25 }),
      linha("1.3", "C", 1, 1, { total: "um real" }),
    ]);
  });
  it("soma diferente do total da prefeitura", () => {
    confere(ORC_OK, { total_prefeitura: "R$ 19.500,00" });
  });
  it("item 1.1 como número (e inteiro como número)", () => {
    confere([etapa(1, "Etapa"), linha(1.1, "A", 1, 2)]);
  });
  it("4 casas na quantidade e 5 casas no preço; ruído de ponto flutuante", () => {
    confere([etapa("1", "Etapa"), linha("1.1", "A", 2.3456, 10.48475)]);
    confere([
      etapa("1", "Etapa"),
      linha("1.1", "A", 10.48 * 1.1, 0.1 + 0.2),
      linha("1.2", "B", 1234568.5 * 1.07, 99.9 * 1.1),
    ]);
  });
  it("acima do teto: quantidade, preço e total da linha", () => {
    confere([
      linha("1", "A", 1e11, 1),
      linha("2", "B", 1e308, 1e308),
      linha("3", "C", 99999999999.9996, 1),
      linha("4", "D", 99999999999.999, 0.01),
      linha("5", "E", 1, 1e10),
      linha("6", "F", 0.001, 9999999999.99995),
      linha("7", "G", 1e6, 1e6),
      linha("8", "H", 999999.999, 999999.9999),
    ]);
  });
  it("sem etapas (o conector bloqueia: todos em itensSemEtapa)", () => {
    const { itensSemEtapa } = confere([linha("1", "A", 1, 1), linha("2", "B", 1, 1)]);
    expect(itensSemEtapa).toEqual(["1", "2"]);
  });
  it("item sem etapa acima e numeração fora de sequência", () => {
    const { itensSemEtapa } = confere([
      etapa("1", "Etapa 1"),
      linha("1.1", "A", 1, 1),
      linha("1.3", "B", 1, 1),
      linha("2.1", "C", 1, 1),
    ]);
    expect(itensSemEtapa).toEqual(["2.1"]);
  });
  it("etapas aninhadas, linha sem quantidade e preço com unidade ou total, item sem unidade", () => {
    confere([
      etapa("1", "E1"),
      etapa("1.1", "E1.1"),
      linha("1.1.1", "A", 1, 1),
      { item: "1.1.2", descricao: "Tem unidade", unidade: "un" },
      { item: "1.1.3", descricao: "Tem total", total: 100 },
      linha("1.2", "C", 1, 1, { unidade: "  " }),
      linha("1.3", "D", 1, 1, { unidade: null }),
    ]);
  });
  it("linhas vazias no meio e no fim mantêm a numeração do Excel", () => {
    confere([
      etapa("1", "Etapa"),
      {},
      { item: "  ", descricao: "", codigo: null },
      linha("1.1", "Serviço", 1, 2),
      {},
    ]);
  });
  it("'2,88' e '1.152,00' como texto; 'R$ 1.234,56'", () => {
    confere([
      etapa("1", "Etapa"),
      linha("1.1", "A", "2,88", "1.152,00", { total: "R$ 3.317,76" }),
      linha("1.2", "B", " 3 ", "R$ 1.234,56"),
    ]);
  });
  it(`${LIMITE_LINHAS + 1} linhas (acima do limite) e ${LIMITE_LINHAS} linhas sintéticas`, () => {
    const sintetico = orcamentoSintetico().map((i) => ({
      item: i.numero,
      codigo: i.codigo,
      fonte: i.fonte,
      descricao: i.descricao,
      unidade: i.unidade,
      quantidade: i.quantidade,
      preco_unitario: i.valor_unitario_ref,
      total: null,
    }));
    const { tela } = confere(sintetico);
    expect(tela.erros).toEqual([]);
    expect(tela.itens).toHaveLength(LIMITE_LINHAS);
    confere([...sintetico, linha("11", "x", 1, 1)]);
  });
});
