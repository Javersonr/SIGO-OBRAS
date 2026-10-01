import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  ABA_ORCAMENTO,
  ABA_INFORMACOES,
  CABECALHOS_MODELO,
  ROTULOS_INFO,
  CHAVES_INFO,
  LIMITE_LINHAS,
  lerNumeroBR,
  gerarModelo,
  lerPlanilhaModelo,
  lerArquivoModelo,
} from "./orcamento-modelo";

const CAB = CABECALHOS_MODELO;
const NBSP = String.fromCharCode(0xa0);

/** Workbook em memória com as abas Orçamento e Informações. */
function montarWb(linhas, info = [["Órgão", "Prefeitura de Teste"]]) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), ABA_ORCAMENTO);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(info), ABA_INFORMACOES);
  return wb;
}

/** Bytes do .xlsx, como o `await file.arrayBuffer()` do navegador entrega. */
function comoArquivo(wb) {
  return XLSX.write(wb, { type: "array", bookType: "xlsx" });
}

const INFO_OK = [
  ["Órgão", "Prefeitura Municipal de Itatinga"],
  ["Objeto", "Iluminação pública"],
  ["Edital/Processo", "PE 12/2026"],
  ["Data-base", "09/2025"],
  ["BDI (%)", "23,96"],
  ["Fonte de preços", "SINAPI 09/2025"],
  ["Total da prefeitura (R$)", 19434.76],
  ["Observações", ""],
];

const ORC_OK = [
  CAB,
  ["1", null, null, "SERVIÇOS PRELIMINARES"],
  ["1.1", "93358", "SINAPI", "Escavação manual", "m³", 125.5, 10.48, 1315.24],
  ["1.2", null, null, "Placa de obra", "m²", "2,88", "400,00", "1.152,00"],
  ["2", null, null, "ILUMINAÇÃO"],
  ["2.1", 41210, "SINAPI", "Poste 12/1000", "un", 6, 2827.92, 16967.52],
];

describe("constantes", () => {
  it("nomes do modelo", () => {
    expect(ABA_ORCAMENTO).toBe("Orçamento");
    expect(ABA_INFORMACOES).toBe("Informações");
    expect(CAB).toHaveLength(8);
    expect(Object.keys(CHAVES_INFO)).toEqual(ROTULOS_INFO);
    expect(LIMITE_LINHAS).toBe(3000);
  });
});

describe("lerNumeroBR", () => {
  it("números e textos pt-BR", () => {
    expect(lerNumeroBR(12.5)).toBe(12.5);
    expect(lerNumeroBR(-3)).toBe(-3);
    expect(lerNumeroBR("1.234,56")).toBe(1234.56);
    expect(lerNumeroBR("12,5")).toBe(12.5);
    expect(lerNumeroBR("1234.56")).toBe(1234.56);
    expect(lerNumeroBR(" R$ 1.234,56 ")).toBe(1234.56);
    expect(lerNumeroBR(`R$${NBSP}1.234,56`)).toBe(1234.56); // formatBRL usa espaço não separável
    expect(lerNumeroBR("1.234.567,89")).toBe(1234567.89);
    expect(lerNumeroBR("1.234.567")).toBe(1234567);
    expect(lerNumeroBR("1,234.56")).toBe(1234.56);
    expect(lerNumeroBR("-3,5")).toBe(-3.5);
  });
  it("vazio → null; inválido → NaN", () => {
    expect(lerNumeroBR(null)).toBeNull();
    expect(lerNumeroBR(undefined)).toBeNull();
    expect(lerNumeroBR("")).toBeNull();
    expect(lerNumeroBR("   ")).toBeNull();
    expect(lerNumeroBR("abc")).toBeNaN();
    expect(lerNumeroBR("1,2,3")).toBeNaN();
    expect(lerNumeroBR(Infinity)).toBeNaN();
    expect(lerNumeroBR(true)).toBeNaN();
  });
});

describe("gerarModelo", () => {
  it("duas abas, cabeçalho, coluna A como Texto e rótulos", () => {
    const wb = XLSX.read(comoArquivo(gerarModelo()), { type: "array", cellNF: true });
    expect(wb.SheetNames).toEqual([ABA_ORCAMENTO, ABA_INFORMACOES]);
    const orc = wb.Sheets[ABA_ORCAMENTO];
    expect(XLSX.utils.sheet_to_json(orc, { header: 1 })[0]).toEqual(CAB);
    expect(orc.A2.z).toBe("@");
    expect(orc.A501.z).toBe("@");
    expect(orc["!ref"]).toBe("A1:H501");
    const info = XLSX.utils.sheet_to_json(wb.Sheets[ABA_INFORMACOES], { header: 1 });
    expect(info.map((l) => l[0])).toEqual(ROTULOS_INFO);
  });
  it("o modelo em branco não tem item (e o cabeçalho passa)", () => {
    const r = lerPlanilhaModelo(gerarModelo());
    expect(r.erros).toEqual([`Nenhum item com Quantidade e Preço unitário na aba "Orçamento".`]);
  });
});

describe("lerPlanilhaModelo — caminho feliz", () => {
  it("etapas, itens, info e totais (arquivo gravado e relido)", () => {
    const r = lerArquivoModelo(comoArquivo(montarWb(ORC_OK, INFO_OK)));
    expect(r.erros).toEqual([]);
    expect(r.avisos).toEqual([]);
    expect(r.totais).toEqual({
      referencia: 19434.76,
      prefeitura: 19434.76,
      qtdEtapas: 2,
      qtdItens: 3,
    });
    expect(r.itens).toHaveLength(5);
    expect(r.itens[0]).toEqual({
      linha: 2,
      numero: "1",
      etapa: true,
      codigo: null,
      fonte: null,
      descricao: "SERVIÇOS PRELIMINARES",
      unidade: null,
      quantidade: null,
      valor_unitario_ref: null,
      total_informado: null,
    });
    expect(r.itens[2]).toEqual({
      linha: 4,
      numero: "1.2",
      etapa: false,
      codigo: null,
      fonte: null,
      descricao: "Placa de obra",
      unidade: "m²",
      quantidade: 2.88,
      valor_unitario_ref: 400,
      total_informado: 1152,
    });
    expect(r.itens[4].codigo).toBe("41210");
    expect(r.info).toEqual({
      orgao: "Prefeitura Municipal de Itatinga",
      objeto: "Iluminação pública",
      edital: "PE 12/2026",
      data_base: "09/2025",
      bdi: "23,96",
      fonte: "SINAPI 09/2025",
      total_prefeitura: 19434.76,
      observacoes: null,
    });
  });
  it("cabeçalho sem acento, em maiúsculas, com espaços e em outra ordem", () => {
    const wb = montarWb([
      ["  descricao ", "ITEM", "Preco Unitario  (R$)", "quantidade", "UNIDADE", "codigo"],
      ["Etapa", "1"],
      ["Serviço", "1.1", 10.48, 125.5, "m", "123"],
    ]);
    const r = lerPlanilhaModelo(wb);
    expect(r.erros).toEqual([]);
    expect(r.itens[1]).toMatchObject({ numero: "1.1", codigo: "123", quantidade: 125.5 });
    expect(r.totais.referencia).toBe(1315.24);
  });
  it("linha em branco no meio mantém o número da linha do Excel", () => {
    const r = lerPlanilhaModelo(
      montarWb([CAB, ["1", null, null, "Etapa"], [], ["1.1", null, null, "Serviço", "m", 1, 2]])
    );
    expect(r.itens.map((i) => i.linha)).toEqual([2, 4]);
  });
  it("data e percentual numéricos na aba Informações", () => {
    const wb = montarWb(ORC_OK, [
      ["Data-base", 0],
      ["BDI (%)", 0],
    ]);
    wb.Sheets[ABA_INFORMACOES].B1 = { t: "n", v: 45901, z: "m/d/yy" };
    wb.Sheets[ABA_INFORMACOES].B2 = { t: "n", v: 0.2396, z: "0.00%" };
    const r = lerArquivoModelo(comoArquivo(wb));
    expect(r.info.data_base).toBe("01/09/2025");
    expect(r.info.bdi).toBe("23,96%");
  });
});

describe("lerPlanilhaModelo — erros", () => {
  it("sem a aba Orçamento", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([CAB]), "Planilha1");
    expect(lerPlanilhaModelo(wb).erros[0]).toContain('não tem a aba "Orçamento"');
  });
  it("cabeçalho sem coluna obrigatória", () => {
    const r = lerPlanilhaModelo(montarWb([["Item", "Descrição", "Unidade", "Total (R$)"]]));
    expect(r.erros).toEqual([
      "Linha 1: faltam as colunas obrigatórias: Quantidade, Preço unitário (R$).",
    ]);
  });
  it("nenhum item (só etapas)", () => {
    const r = lerPlanilhaModelo(montarWb([CAB, ["1", null, null, "Etapa"]]));
    expect(r.erros).toEqual([`Nenhum item com Quantidade e Preço unitário na aba "Orçamento".`]);
  });
  it("Item vazio, fora do padrão e repetido; Descrição vazia", () => {
    const r = lerPlanilhaModelo(
      montarWb([
        CAB,
        ["1.1", null, null, "A", "m", 1, 1],
        [null, null, null, "B", "m", 1, 1],
        ["1.a", null, null, "C", "m", 1, 1],
        ["1.", null, null, "D", "m", 1, 1],
        ["1.1", null, null, "E", "m", 1, 1],
        ["1.2", null, null, "", "m", 1, 1],
      ])
    );
    expect(r.erros).toEqual([
      "Linha 3: Item vazio.",
      'Linha 4: Item "1.a" fora do padrão (use 1, 1.1, 1.1.2).',
      'Linha 5: Item "1." fora do padrão (use 1, 1.1, 1.1.2).',
      "Linha 6: Item 1.1 repetido (já está na linha 2).",
      "Linha 7: Descrição vazia.",
    ]);
  });
  it("Item que o Excel transformou em data", () => {
    const wb = montarWb([CAB, ["1", null, null, "Etapa"], [0, null, null, "A", "m", 1, 1]]);
    wb.Sheets[ABA_ORCAMENTO].A3 = { t: "n", v: 46296, z: "m/d/yy" };
    expect(lerArquivoModelo(comoArquivo(wb)).erros).toEqual([
      'Linha 3: Item virou data no Excel ("10/1/26"); formate a coluna A como Texto e digite de novo.',
      `Nenhum item com Quantidade e Preço unitário na aba "Orçamento".`,
    ]);
  });
  it("quantidade ≤ 0, preço < 0, texto não numérico e só um dos dois", () => {
    const r = lerPlanilhaModelo(
      montarWb([
        CAB,
        ["1", null, null, "A", "m", 0, 1],
        ["2", null, null, "B", "m", -1, 1],
        ["3", null, null, "C", "m", 1, -0.01],
        ["4", null, null, "D", "m", "abc", 1],
        ["5", null, null, "E", "m", 1, "dez"],
        ["6", null, null, "F", "m", 1, null],
        ["7", null, null, "G", "m", null, 1],
        ["8", null, null, "H", "m", 1, 1],
      ])
    );
    expect(r.erros).toEqual([
      "Linha 2: Quantidade deve ser maior que zero.",
      "Linha 3: Quantidade deve ser maior que zero.",
      "Linha 4: Preço unitário negativo.",
      'Linha 5: Quantidade não é um número ("abc").',
      'Linha 6: Preço unitário não é um número ("dez").',
      "Linha 7: Quantidade sem Preço unitário.",
      "Linha 8: Preço unitário sem Quantidade.",
    ]);
  });
  it("fórmula sem valor salvo (como o openpyxl grava) não vira etapa", () => {
    const wb = montarWb([CAB, ["1", null, null, "A", "m", 1, 1]]);
    wb.Sheets[ABA_ORCAMENTO].F2 = { t: "n", f: "2*3" };
    wb.Sheets[ABA_ORCAMENTO].G2 = { t: "n", f: "10/4" };
    expect(lerArquivoModelo(comoArquivo(wb)).erros).toEqual([
      "Linha 2: Quantidade é uma fórmula sem valor salvo; grave o número.",
      "Linha 2: Preço unitário é uma fórmula sem valor salvo; grave o número.",
      `Nenhum item com Quantidade e Preço unitário na aba "Orçamento".`,
    ]);
  });
  it("mais de 3.000 linhas", () => {
    const linhas = [CAB];
    for (let i = 1; i <= LIMITE_LINHAS + 1; i++) {
      linhas.push([String(i), null, null, "x", "m", 1, 1]);
    }
    const r = lerPlanilhaModelo(montarWb(linhas));
    expect(r.erros).toEqual([`A aba "Orçamento" tem 3.001 linhas preenchidas; o limite é 3.000.`]);
    expect(r.itens).toEqual([]);
  });
  it("arquivo que não é o modelo, ou nem é planilha", () => {
    const pdf = lerArquivoModelo(new TextEncoder().encode("%PDF-1.7 lixo"));
    expect(pdf.erros).toEqual([
      'A planilha não tem a aba "Orçamento". Use o modelo do SIGO (botão Baixar modelo).',
    ]);
    const zipQuebrado = lerArquivoModelo(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]));
    expect(zipQuebrado.erros).toEqual([
      "Não foi possível ler o arquivo como planilha Excel (.xlsx).",
    ]);
  });
});

describe("lerPlanilhaModelo — avisos", () => {
  it("Total da linha diferente em mais de R$ 0,01 (0,01 exato não avisa)", () => {
    const r = lerPlanilhaModelo(
      montarWb([
        CAB,
        ["1", null, null, "Etapa"],
        ["1.1", null, null, "A", "m", 125.5, 10.48, 1315.3],
        ["1.2", null, null, "B", "m", 125.5, 10.48, 1315.25],
      ])
    );
    expect(r.erros).toEqual([]);
    expect(r.avisos).toEqual([
      "Linha 3: Total (R$) informado 1.315,30 difere do calculado 1.315,24.",
    ]);
  });
  it("soma diferente do Total da prefeitura", () => {
    const r = lerPlanilhaModelo(montarWb(ORC_OK, [["Total da prefeitura (R$)", "R$ 19.500,00"]]));
    expect(r.totais.prefeitura).toBe(19500);
    expect(r.avisos).toEqual([
      "Soma dos itens (R$ 19.434,76) difere do Total da prefeitura (R$ 19.500,00) em R$ 65,24.",
    ]);
  });
  it("quantidade com mais de 3 casas e preço com mais de 4 casas são arredondados", () => {
    const r = lerPlanilhaModelo(
      montarWb([CAB, ["1", null, null, "Etapa"], ["1.1", null, null, "A", "m", 2.3456, 10.48475]])
    );
    expect(r.itens[1]).toMatchObject({ quantidade: 2.346, valor_unitario_ref: 10.4848 });
    expect(r.avisos).toEqual([
      "Linha 3: Quantidade com mais de 3 casas; arredondada para 2,346.",
      "Linha 3: Preço unitário com mais de 4 casas; arredondado para 10,4848.",
    ]);
  });
  it("Item lido como número (1.1): usa o valor e avisa; inteiro não avisa", () => {
    const r = lerArquivoModelo(
      comoArquivo(montarWb([CAB, [1, null, null, "Etapa"], [1.1, null, null, "A", "m", 1, 2]]))
    );
    expect(r.erros).toEqual([]);
    expect(r.itens.map((i) => i.numero)).toEqual(["1", "1.1"]);
    expect(r.avisos).toEqual([
      "Linha 3: Item lido como número (1.1); se era 1.10, formate a coluna A como Texto e digite de novo.",
    ]);
  });
  it("item sem etapa acima e numeração fora de sequência", () => {
    const r = lerPlanilhaModelo(
      montarWb([
        CAB,
        ["1", null, null, "Etapa 1"],
        ["1.1", null, null, "A", "m", 1, 1],
        ["1.3", null, null, "B", "m", 1, 1],
        ["2.1", null, null, "C", "m", 1, 1],
      ])
    );
    expect(r.avisos).toEqual([
      "Linha 4: Item 1.3 fora de sequência (depois de 1.1).",
      "Linha 5: Item 2.1 fora de sequência (depois de 1.3).",
      "Linha 5: item 2.1 sem etapa acima.",
    ]);
  });
  it("item sem unidade avisa (vazio ou só espaços); etapa sem unidade não", () => {
    const r = lerPlanilhaModelo(
      montarWb([
        CAB,
        ["1", null, null, "Etapa"],
        ["1.1", null, null, "A", null, 1, 1],
        ["1.2", null, null, "B", "  ", 1, 1],
        ["1.3", null, null, "C", "m", 1, 1],
      ])
    );
    expect(r.erros).toEqual([]);
    expect(r.avisos).toEqual(["Linha 3: item sem unidade.", "Linha 4: item sem unidade."]);
    expect(r.itens.map((i) => i.unidade)).toEqual([null, null, null, "m"]);
    expect(r.totais).toMatchObject({ qtdEtapas: 1, qtdItens: 3 });
  });
  it("sequência normal com etapas aninhadas não avisa", () => {
    const r = lerPlanilhaModelo(
      montarWb([
        CAB,
        ["1", null, null, "E1"],
        ["1.1", null, null, "E1.1"],
        ["1.1.1", null, null, "A", "m", 1, 1],
        ["1.1.2", null, null, "B", "m", 1, 1],
        ["1.2", null, null, "C", "m", 1, 1],
        ["2", null, null, "E2"],
        ["2.1", null, null, "D", "m", 1, 1],
      ])
    );
    expect(r.avisos).toEqual([]);
  });
  it("lista sem etapas: um aviso só; sem a aba Informações: aviso", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        CAB,
        ["1", null, null, "A", "m", 1, 1],
        ["2", null, null, "B", "m", 1, 1],
      ]),
      ABA_ORCAMENTO
    );
    expect(lerPlanilhaModelo(wb).avisos).toEqual([
      'A planilha não tem a aba "Informações"; órgão, objeto e total da prefeitura ficam em branco.',
      "A planilha não tem linhas de etapa; os itens ficam sem subtotal.",
    ]);
  });
});
