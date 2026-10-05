import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  ABA_CRONOGRAMA,
  cabecalhoCronograma,
  lerAbaCronograma,
  lerArquivoCronograma,
} from "./cronograma-modelo";
import { ABA_ORCAMENTO, gerarModelo } from "./orcamento-modelo";

const CAB4 = cabecalhoCronograma(4);
const ETAPAS = ["1", "2"];

/** Workbook em memória só com a aba Cronograma (e a Orçamento, como no arquivo da skill). */
function montarWb(linhas) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Item"]]), ABA_ORCAMENTO);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), ABA_CRONOGRAMA);
  return wb;
}

/** Bytes do .xlsx, como o `await file.arrayBuffer()` do navegador entrega. */
function comoArquivo(wb) {
  return XLSX.write(wb, { type: "array", bookType: "xlsx" });
}

const OK = [CAB4, ["1", "SERVIÇOS DE ELÉTRICA", 20, 35, 30, 15], ["2", "POSTES", 0, 50, 50, 0]];

describe("constantes", () => {
  it("nome da aba e cabeçalho", () => {
    expect(ABA_CRONOGRAMA).toBe("Cronograma");
    expect(cabecalhoCronograma(3)).toEqual(["Item", "Descrição", "Mês 1", "Mês 2", "Mês 3"]);
    expect(cabecalhoCronograma(0)).toEqual(["Item", "Descrição"]);
    const padrao = cabecalhoCronograma();
    expect(padrao).toHaveLength(14);
    expect(padrao[13]).toBe("Mês 12");
  });
});

describe("lerAbaCronograma — caminho feliz", () => {
  it("lê meses e % por etapa (arquivo gravado e relido)", () => {
    const r = lerArquivoCronograma(comoArquivo(montarWb(OK)), ETAPAS);
    expect(r.erros).toEqual([]);
    expect(r.avisos).toEqual([]);
    expect(r.cronograma).toEqual({
      meses: 4,
      pct: { 1: [20, 35, 30, 15], 2: [0, 50, 50, 0] },
      origem: "importado",
    });
    expect(r.resumo).toEqual({ meses: 4, linhas: 2, ignoradas: 0, faltando: 0 });
  });
  it("cabeçalho com variações (acento, maiúsculas, espaços e ordem)", () => {
    const r = lerAbaCronograma(
      montarWb([
        ["MES 2", " ITEM ", "descricao", "Mes1", "mês  3"],
        [35, "1", "x", 20, 45],
        [50, 2, "y", 50, 0],
      ]),
      ETAPAS
    );
    expect(r.erros).toEqual([]);
    expect(r.cronograma.pct).toEqual({ 1: [20, 35, 45], 2: [50, 50, 0] });
    expect(r.resumo.meses).toBe(3);
  });
  it("% como número, como texto pt-BR e com formato de %; vazio = 0", () => {
    const wb = montarWb([
      CAB4,
      ["1", "A", "12,5", "12.5%", " 25 % ", null],
      ["2", "B", 0, 0, 0, 0],
    ]);
    const ws = wb.Sheets[ABA_CRONOGRAMA];
    ws.F2 = { t: "n", v: 0.5, z: "0%" };
    ws.C3 = { t: "n", v: 0.075, z: "0.0%" };
    ws.D3 = { t: "n", v: 0.07, z: "0.00%" };
    ws.E3 = { t: "n", v: 85.5, z: '0.0"%"' }; // % literal: o valor já está em %
    const r = lerArquivoCronograma(comoArquivo(wb), ETAPAS);
    expect(r.erros).toEqual([]);
    expect(r.cronograma.pct).toEqual({ 1: [12.5, 12.5, 25, 50], 2: [7.5, 7, 85.5, 0] });
    expect(r.avisos).toEqual([]);
  });
  it("% com formato sem `z` (workbook em memória): vale o texto exibido", () => {
    const wb = montarWb([CAB4, ["1", "A", 0, 0, 0, 0]]);
    wb.Sheets[ABA_CRONOGRAMA].C2 = { t: "n", v: 1, w: "100%" };
    expect(lerAbaCronograma(wb, ["1"]).cronograma.pct).toEqual({ 1: [100, 0, 0, 0] });
  });
  it("60 meses; colunas depois do Mês 60 são ignoradas", () => {
    const cab = cabecalhoCronograma(61);
    const linha = ["1", "A", ...new Array(59).fill(1.67), 1.47, 5];
    const r = lerArquivoCronograma(comoArquivo(montarWb([cab, linha])), ["1"]);
    expect(r.erros).toEqual([]);
    expect(r.resumo.meses).toBe(60);
    expect(r.cronograma.pct[1]).toHaveLength(60);
    expect(r.cronograma.pct[1][59]).toBe(1.47);
    expect(r.avisos).toEqual(["Linha 1: colunas depois do Mês 60 foram ignoradas."]);
  });
  it("linhas em branco e linha só com descrição não contam", () => {
    const r = lerAbaCronograma(
      montarWb([CAB4, [], ["", "nota solta"], ["1", "A", 100, 0, 0, 0], ["2", "B", 0, 0, 0, 100]]),
      ETAPAS
    );
    expect(r.erros).toEqual([]);
    expect(r.avisos).toEqual([]);
    expect(r.resumo).toEqual({ meses: 4, linhas: 2, ignoradas: 0, faltando: 0 });
  });
});

describe("lerAbaCronograma — erros", () => {
  it("sem a aba Cronograma (arquivo só com o orçamento)", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Item"]]), ABA_ORCAMENTO);
    const r = lerArquivoCronograma(comoArquivo(wb), ETAPAS);
    expect(r.cronograma).toBeNull();
    expect(r.erros).toEqual([
      'A planilha não tem a aba "Cronograma". Use o modelo do SIGO preenchido pela skill do Claude.',
    ]);
    expect(r.resumo).toEqual({ meses: 0, linhas: 0, ignoradas: 0, faltando: 0 });
  });
  it("arquivo que nem é planilha", () => {
    const r = lerArquivoCronograma(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]), ETAPAS);
    expect(r.cronograma).toBeNull();
    expect(r.erros).toEqual(["Não foi possível ler o arquivo como planilha Excel (.xlsx)."]);
  });
  it("cabeçalho sem Item ou sem nenhum Mês n", () => {
    const erros = (cabecalho) => lerAbaCronograma(montarWb([cabecalho, ["1", 100]]), ETAPAS).erros;
    expect(erros(["Descrição", "Mês 1"])).toEqual(["Linha 1: falta a coluna Item."]);
    expect(erros(["Item", "Total"])).toEqual([
      "Linha 1: falta a coluna Mês 1 (os meses vão em Mês 1, Mês 2…).",
    ]);
    expect(lerAbaCronograma(montarWb([]), ETAPAS).erros).toEqual([
      "Linha 1: falta a coluna Item.",
      "Linha 1: falta a coluna Mês 1 (os meses vão em Mês 1, Mês 2…).",
    ]);
  });
  it("% negativo, acima de 100 (também com formato de %) e texto não numérico", () => {
    const wb = montarWb([CAB4, ["1", "A", -5, 120, "abc", "-3"], ["2", "B", 0, 0, 0, 0]]);
    wb.Sheets[ABA_CRONOGRAMA].D3 = { t: "n", v: 1.2, z: "0%" };
    const r = lerArquivoCronograma(comoArquivo(wb), ETAPAS);
    expect(r.cronograma).toBeNull();
    expect(r.erros).toEqual([
      "Linha 2, Mês 1: % negativo (-5).",
      "Linha 2, Mês 2: % acima de 100 (120).",
      'Linha 2, Mês 3: "abc" não é um % de 0 a 100.',
      'Linha 2, Mês 4: "-3" não é um % de 0 a 100.',
      "Linha 3, Mês 2: % acima de 100 (120).",
    ]);
  });
  it("Item repetido", () => {
    const r = lerAbaCronograma(
      montarWb([
        CAB4,
        ["1", "A", 100, 0, 0, 0],
        ["2", "B", 100, 0, 0, 0],
        ["1", "C", 0, 0, 0, 100],
      ]),
      ETAPAS
    );
    expect(r.cronograma).toBeNull();
    expect(r.erros).toEqual(["Linha 4: Item 1 repetido (já está na linha 2)."]);
  });
  it("fórmula sem valor salvo, data, booleano e NaN numa célula de mês", () => {
    const wb = montarWb([CAB4, ["1", "A", 0, 0, 0, 0]]);
    const ws = wb.Sheets[ABA_CRONOGRAMA];
    ws.C2 = { t: "z", f: "10*2" };
    ws.D2 = { t: "n", v: 46296, z: "m/d/yy", w: "10/1/26" };
    ws.E2 = { t: "b", v: true, w: "TRUE" };
    ws.F2 = { t: "n", v: NaN }; // número não finito (arquivo malformado)
    expect(lerAbaCronograma(wb, ["1"]).erros).toEqual([
      "Linha 2, Mês 1: fórmula sem valor salvo; grave o número.",
      'Linha 2, Mês 2: virou data no Excel ("10/1/26"); formate como Número.',
      'Linha 2, Mês 3: "TRUE" não é um número.',
      'Linha 2, Mês 4: "NaN" não é um número.',
    ]);
  });
  it("aba vazia (modelo em branco) ou sem nenhuma etapa do orçamento", () => {
    const branco = lerArquivoCronograma(comoArquivo(gerarModelo()), ETAPAS);
    expect(branco.cronograma).toBeNull();
    expect(branco.erros).toEqual(['A aba "Cronograma" não tem linhas preenchidas.']);
    const outras = lerAbaCronograma(montarWb([CAB4, ["7", "X", 100, 0, 0, 0]]), ETAPAS);
    expect(outras.erros).toEqual([
      'Nenhuma linha da aba "Cronograma" tem o Item de uma etapa do orçamento.',
    ]);
  });
});

describe("lerAbaCronograma — avisos", () => {
  it("linha que não soma 100,00 entra assim mesmo", () => {
    const r = lerAbaCronograma(
      montarWb([CAB4, ["1", "A", 20, 35, 30, 14.99], ["2", "B", 50, 50, 10, 0]]),
      ETAPAS
    );
    expect(r.erros).toEqual([]);
    expect(r.cronograma.pct[1]).toEqual([20, 35, 30, 14.99]);
    expect(r.avisos).toEqual([
      "Linha 2: a etapa 1 soma 99,99%, e não 100,00%; fica vermelha até ser corrigida.",
      "Linha 3: a etapa 2 soma 110,00%, e não 100,00%; fica vermelha até ser corrigida.",
    ]);
  });
  it("Item sem etapa no orçamento é ignorado; etapa sem linha fica vazia", () => {
    const r = lerAbaCronograma(
      montarWb([
        CAB4,
        ["1", "A", 100, 0, 0, 0],
        ["1.1", "Sub", 100, 0, 0, 0],
        ["9", "X", 0, 0, 0, 0],
      ]),
      ["1", "2", "3"]
    );
    expect(r.erros).toEqual([]);
    expect(r.cronograma.pct).toEqual({ 1: [100, 0, 0, 0] });
    expect(r.avisos).toEqual([
      "Linha 3: Item 1.1 não é etapa do orçamento; foi ignorado.",
      "Linha 4: Item 9 não é etapa do orçamento; foi ignorado.",
      "Etapa 2 do orçamento sem linha no cronograma; fica vazia.",
      "Etapa 3 do orçamento sem linha no cronograma; fica vazia.",
    ]);
    expect(r.resumo).toEqual({ meses: 4, linhas: 1, ignoradas: 2, faltando: 2 });
  });
  it("% com mais de 2 casas é arredondado", () => {
    const linha = ["1", "A", 33.333, "33,3333", 33.334, "0,000"];
    const r = lerAbaCronograma(montarWb([CAB4, linha]), ["1"]);
    expect(r.erros).toEqual([]);
    expect(r.cronograma.pct[1]).toEqual([33.33, 33.33, 33.33, 0]);
    expect(r.avisos).toEqual([
      "Linha 2, Mês 1: % com mais de 2 casas; arredondado para 33,33.",
      "Linha 2, Mês 2: % com mais de 2 casas; arredondado para 33,33.",
      "Linha 2, Mês 3: % com mais de 2 casas; arredondado para 33,33.",
      "Linha 2: a etapa 1 soma 99,99%, e não 100,00%; fica vermelha até ser corrigida.",
    ]);
  });
  it("célula numérica: a faixa de 0 a 100 vale sobre o % já arredondado em 2 casas", () => {
    // 100,004 vira 100,00 e −0,004 vira 0,00, com o aviso de casas a mais (número ou formato de %)
    const wb = montarWb([CAB4, ["1", "A", 100.004, -0.004, 0, 0], ["2", "B", 0, 0, 0, 0]]);
    wb.Sheets[ABA_CRONOGRAMA].C3 = { t: "n", v: 1.00004, z: "0.000%" };
    const ok = lerAbaCronograma(wb, ETAPAS);
    expect(ok.erros).toEqual([]);
    expect(ok.cronograma.pct).toEqual({ 1: [100, 0, 0, 0], 2: [100, 0, 0, 0] });
    expect(ok.avisos).toEqual([
      "Linha 2, Mês 1: % com mais de 2 casas; arredondado para 100,00.",
      "Linha 2, Mês 2: % com mais de 2 casas; arredondado para 0,00.",
      "Linha 3, Mês 1: % com mais de 2 casas; arredondado para 100,00.",
    ]);
    // 100,005 vira 100,01 e −0,006 vira −0,01: erro, com o valor que veio na célula
    const wb2 = montarWb([CAB4, ["1", "A", 100.005, -0.006, 0, 0], ["2", "B", 0, 0, 0, 0]]);
    wb2.Sheets[ABA_CRONOGRAMA].E3 = { t: "n", v: 1.00005, z: "0.000%" };
    const r = lerAbaCronograma(wb2, ETAPAS);
    expect(r.cronograma).toBeNull();
    expect(r.erros).toEqual([
      "Linha 2, Mês 1: % acima de 100 (100,005).",
      "Linha 2, Mês 2: % negativo (-0,006).",
      "Linha 3, Mês 3: % acima de 100 (100,005).",
    ]);
  });
  it("linha sem Item, Mês faltando no meio e coluna repetida", () => {
    const r = lerAbaCronograma(
      montarWb([
        ["Item", "Descrição", "Mês 1", "Mês 3", "Mês 1"],
        ["1", "A", 40, 60, 99],
        ["", "B", 10, 0, 0],
      ]),
      ["1"]
    );
    expect(r.erros).toEqual([]);
    expect(r.cronograma).toEqual({ meses: 3, pct: { 1: [40, 0, 60] }, origem: "importado" });
    expect(r.avisos).toEqual([
      "Linha 1: a coluna Mês 1 se repete; vale a primeira.",
      "Linha 1: falta a coluna Mês 2; o mês fica com 0%.",
      "Linha 3: linha sem Item; foi ignorada.",
    ]);
    expect(r.resumo).toEqual({ meses: 3, linhas: 1, ignoradas: 1, faltando: 0 });
  });
});
