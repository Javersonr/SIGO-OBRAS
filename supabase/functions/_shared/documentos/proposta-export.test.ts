// node --test supabase/functions/_shared/documentos/proposta-export.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { jsPDF } from "jspdf";
import * as modAutoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { montarDadosProposta } from "./dados-proposta.ts";
import {
  bytesDaPlanilha,
  bytesDoPdf,
  gerarPdfProposta,
  moedaBR,
  montarPlanilhaProposta,
  resolverAutoTable,
  textoPdf,
} from "./proposta-export.ts";

const autoTable = resolverAutoTable(modAutoTable);
const dados = () =>
  montarDadosProposta({
    itens: [
      { id: "1", numero: "1", etapa: true, descricao: "Serviços preliminares", ordem: 1 },
      {
        id: "2",
        numero: "1.1",
        etapa: false,
        descricao: "Placa de obra",
        unidade: "m²",
        quantidade: 6,
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
        valor_unitario: 1000,
        valor_total: 1000,
        ordem: 3,
      },
    ],
    info: { orgao: "Prefeitura de Exemplo", edital: "CE 009/2026" },
    oportunidade: { nome: "CE 009 Exemplo" },
    empresa: {
      razao_social: "Empresa Teste Ltda",
      cnpj: "11222333000181",
      cidade: "Cidade",
      estado: "MG",
    },
    representante: { nome: "Fulana de Tal", cargo: "Sócia", cpf: "52998224725" },
    opcoes: { validadeDias: 60, local: "Cidade/MG", dataISO: "2026-10-13" },
  });

test("resolverAutoTable acha a função no módulo do Node", () => {
  assert.equal(typeof autoTable, "function");
  assert.throws(() => resolverAutoTable({}), /jspdf-autotable não carregou/);
});

test("planilha da proposta: aba Proposta, fórmulas com o valor em cache e relida do .xlsx", () => {
  const wb = montarPlanilhaProposta(dados(), XLSX);
  const bytes = bytesDaPlanilha(wb, XLSX);
  assert.deepEqual([...bytes.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  const lido = XLSX.read(bytes, { type: "array" });
  assert.deepEqual(lido.SheetNames, ["Proposta"]);
  const linhas = XLSX.utils.sheet_to_json(lido.Sheets.Proposta, {
    header: 1,
    raw: true,
  }) as unknown[][];
  const global = linhas.find((l) => l[3] === "VALOR GLOBAL DA PROPOSTA (R$)");
  assert.ok(global, "linha do valor global");
  assert.equal(global[7], 3629.5);
  const celulas = Object.values(lido.Sheets.Proposta) as { f?: string }[];
  assert.ok(celulas.some((c) => /^SUBTOTAL\(9,H\d+:H\d+\)$/.test(c?.f ?? "")));
  assert.ok(celulas.some((c) => /^ROUND\(F\d+\*G\d+,2\)$/.test(c?.f ?? "")));
  assert.ok(linhas.some((l) => l[0] === "Fulana de Tal"));
});

test("PDF da proposta: gera bytes de PDF, com página numerada e sem DOM", () => {
  const doc = gerarPdfProposta(dados(), { jsPDF, autoTable });
  const bytes = bytesDoPdf(doc);
  assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
  assert.ok(bytes.length > 3000);
  // deno-lint-ignore no-explicit-any
  assert.equal((doc as any).getNumberOfPages(), 1);
});

test("textoPdf: troca o que a helvetica não tem", () => {
  assert.equal(textoPdf("≤ 10 Ω ⌀ 20\tmm"), "<= 10 ohm Ø 20 mm");
  assert.equal(textoPdf("linha\nquebrada"), "linha quebrada");
  assert.equal(textoPdf("日本"), "??");
  assert.equal(textoPdf(null), "");
});

// ─── moedaBR: o "R$ 1.234,56" da proposta, que a ferramenta do conector reaproveita ───────────────

/** A fórmula que a ferramenta do conector (gerar_documentos_proposta) trazia copiada, antes de reusar a daqui. */
const moedaCopiadaDaFerramenta = (v: number): string =>
  `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

test("moedaBR: mesmo texto da fórmula antiga da ferramenta para 0, 1234,5, 1e9, negativo e centavos", () => {
  for (const v of [0, 1234.5, 1e9, -5.5, -1234567.891, 0.005, 3629.5, 1237197.39]) {
    assert.equal(moedaBR(v), moedaCopiadaDaFerramenta(v), String(v));
  }
  assert.equal(moedaBR(1234.5), "R$ 1.234,50");
  assert.equal(moedaBR(1e9), "R$ 1.000.000.000,00");
  assert.equal(moedaBR(0), "R$ 0,00");
  assert.equal(moedaBR(-5.5), "R$ -5,50");
});

test("moedaBR é a mesma do PDF da proposta: 'Valor global da proposta: <moedaBR(total)>' nos bytes", () => {
  const d = dados();
  const pdf = new TextDecoder("latin1").decode(
    bytesDoPdf(gerarPdfProposta(d, { jsPDF, autoTable }))
  );
  assert.ok(pdf.includes(`Valor global da proposta: ${moedaBR(d.totalGeral)}`));
  assert.ok(pdf.includes("Valor global da proposta: R$ 3.629,50"));
});
