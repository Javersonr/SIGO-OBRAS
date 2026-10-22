// node --test supabase/functions/_shared/documentos/cronograma-export.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { jsPDF } from "jspdf";
import * as modAutoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { montarDadosCronograma } from "./dados-cronograma.ts";
import { gerarPdfCronograma, montarPlanilhaCronograma } from "./cronograma-export.ts";
import { bytesDaPlanilha, bytesDoPdf, resolverAutoTable } from "./proposta-export.ts";

const autoTable = resolverAutoTable(modAutoTable);
const dados = (meses: number) =>
  montarDadosCronograma({
    etapas: [
      { numero: "1", descricao: "Serviços preliminares", centavos: 100000 },
      { numero: "2", descricao: "Rede de distribuição", centavos: 300000 },
    ],
    cronograma: {
      meses,
      pct: {
        "1": [100, ...Array(meses - 1).fill(0)],
        "2": Array.from({ length: meses }, (_, j) =>
          j === meses - 1 ? 100 - Math.floor(100 / meses) * (meses - 1) : Math.floor(100 / meses)
        ),
      },
    },
    info: { orgao: "Prefeitura de Exemplo" },
    oportunidade: { nome: "CE 009 Exemplo" },
    empresa: { razao_social: "Empresa Teste Ltda" },
    representante: { nome: "Fulana de Tal" },
    opcoes: { local: "Cidade/MG", dataISO: "2026-10-13" },
  });

test("planilha do cronograma: aba Cronograma, um mês por coluna e o rodapé", () => {
  const bytes = bytesDaPlanilha(montarPlanilhaCronograma(dados(4), XLSX), XLSX);
  const lido = XLSX.read(bytes, { type: "array" });
  assert.deepEqual(lido.SheetNames, ["Cronograma"]);
  const linhas = XLSX.utils.sheet_to_json(lido.Sheets.Cronograma, {
    header: 1,
    raw: true,
  }) as unknown[][];
  const cabecalho = linhas.find((l) => l[0] === "Item" && l[1] === "Etapa");
  assert.ok(cabecalho);
  assert.deepEqual(cabecalho.slice(4), ["Mês 1", "Mês 2", "Mês 3", "Mês 4"]);
  for (const rotulo of ["Total do mês (R$)", "% do mês", "Acumulado (R$)", "Acumulado (%)"]) {
    assert.ok(
      linhas.some((l) => l.includes(rotulo)),
      rotulo
    );
  }
});

test("PDF do cronograma: 4 meses numa página; 18 meses quebra em mais de uma", () => {
  const curto = gerarPdfCronograma(dados(4), { jsPDF, autoTable });
  assert.equal(new TextDecoder().decode(bytesDoPdf(curto).slice(0, 5)), "%PDF-");
  // deno-lint-ignore no-explicit-any
  assert.equal((curto as any).getNumberOfPages(), 1);
  const longo = gerarPdfCronograma(dados(18), { jsPDF, autoTable });
  // deno-lint-ignore no-explicit-any
  assert.ok((longo as any).getNumberOfPages() > 1);
});
