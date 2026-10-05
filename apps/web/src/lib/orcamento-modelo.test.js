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
  it("aba Informações: coluna B como Texto, exceto o total da prefeitura", () => {
    const wb = XLSX.read(comoArquivo(gerarModelo()), { type: "array", cellNF: true });
    const info = wb.Sheets[ABA_INFORMACOES];
    const linhaTotal = ROTULOS_INFO.indexOf("Total da prefeitura (R$)") + 1;
    ROTULOS_INFO.forEach((_, i) => {
      if (i + 1 === linhaTotal) expect(info[`B${i + 1}`]?.z).not.toBe("@");
      else expect(info[`B${i + 1}`].z).toBe("@");
    });
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
  // O formato (z) decide: com dia → dd/mm/aaaa; sem dia (tabela de preços é mês/ano) → mm/aaaa.
  it.each([
    ["m/d/yy", "01/09/2025"],
    ["dd/mm/yyyy", "01/09/2025"],
    ["d-mmm-yy", "01/09/2025"],
    ["d-mmm", "01/09/2025"],
    ["mm-dd-yy", "01/09/2025"],
    ["[$-416]d/m/yyyy", "01/09/2025"],
    ["mm/yyyy", "09/2025"],
    ["mmm-yy", "09/2025"],
    ["mmm/yy", "09/2025"],
    ['mmmm" de "yyyy', "09/2025"],
  ])("Data-base numérica com formato %s vira %s", (z, esperado) => {
    const wb = montarWb(ORC_OK, [["Data-base", 0]]);
    wb.Sheets[ABA_INFORMACOES].B1 = { t: "n", v: 45901, z };
    const r = lerArquivoModelo(comoArquivo(wb));
    expect(r.info.data_base).toBe(esperado);
    expect(r.avisos).toEqual([]);
  });
  it("Data-base em número puro (General) vira o texto do número e avisa", () => {
    const wb = montarWb(ORC_OK, [
      ["Órgão", "Prefeitura"],
      ["Data-base", 0],
    ]);
    wb.Sheets[ABA_INFORMACOES].B2 = { t: "n", v: 45901, z: "General" };
    const r = lerArquivoModelo(comoArquivo(wb));
    expect(r.info.data_base).toBe("45901");
    expect(r.avisos).toEqual(["Informações, linha 2: Data-base numérica (45901) — confira."]);
  });
  it("Data-base digitada como texto fica como está, sem aviso", () => {
    const wb = montarWb(ORC_OK, [["Data-base", 0]]);
    wb.Sheets[ABA_INFORMACOES].B1 = { t: "s", v: "09/2025", z: "@" };
    const r = lerArquivoModelo(comoArquivo(wb));
    expect(r.info.data_base).toBe("09/2025");
    expect(r.avisos).toEqual([]);
  });
  it("Data-base numérica sem formato salvo (workbook em memória) segue o texto exibido", () => {
    const wb = montarWb(ORC_OK, [["Data-base", 0]]);
    wb.Sheets[ABA_INFORMACOES].B1 = { t: "n", v: 45901, w: "9/1/25" };
    expect(lerPlanilhaModelo(wb).info.data_base).toBe("01/09/2025");
  });
  it("ruído de ponto flutuante de fórmula não gera aviso de casas decimais", () => {
    // Os produtos de fórmula vêm com resto: 11.528000000000002, 1320988.2950000002 (cortar em
    // 10 casas fixas não limparia este, de 7 dígitos inteiros) e 109.89000000000001.
    expect(10.48 * 1.1).not.toBe(11.528);
    expect(1234568.5 * 1.07).not.toBe(1320988.295);
    expect(99.9 * 1.1).not.toBe(109.89);
    const r = lerPlanilhaModelo(
      montarWb([
        CAB,
        ["1", null, null, "Etapa"],
        ["1.1", null, null, "A", "m", 10.48 * 1.1, 0.1 + 0.2],
        ["1.2", null, null, "B", "m", 1234568.5 * 1.07, 99.9 * 1.1],
      ])
    );
    expect(r.erros).toEqual([]);
    expect(r.avisos).toEqual([]);
    expect(r.itens[1]).toMatchObject({ quantidade: 11.528, valor_unitario_ref: 0.3 });
    expect(r.itens[2]).toMatchObject({ quantidade: 1320988.295, valor_unitario_ref: 109.89 });
  });
  it("mais de 3 (ou 4) casas de verdade continuam avisando, com o ruído já limpo", () => {
    const r = lerPlanilhaModelo(
      montarWb([
        CAB,
        ["1", null, null, "Etapa"],
        ["1.1", null, null, "A", "m", 2.3456 * 1.1, 0.00005],
      ])
    );
    expect(r.avisos).toEqual([
      "Linha 3: Quantidade com mais de 3 casas; arredondada para 2,58.",
      "Linha 3: Preço unitário com mais de 4 casas; arredondado para 0,0001.",
    ]);
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
  // O Excel decide pelo formato da célula: d-mmm ("1/10" → 1-Oct) e mmm-yy não passam por
  // `w` com três números, então é o `z` (cellNF) que vale.
  it.each(["m/d/yy", "dd/mm/yyyy", "d-mmm", "d-mmm-yy", "mmm-yy", "mm/yyyy"])(
    "Item que o Excel transformou em data (formato %s)",
    (z) => {
      const wb = montarWb([CAB, ["1", null, null, "Etapa"], [0, null, null, "A", "m", 1, 1]]);
      wb.Sheets[ABA_ORCAMENTO].A3 = { t: "n", v: 46296, z };
      const erros = lerArquivoModelo(comoArquivo(wb)).erros;
      expect(erros[0]).toMatch(/^Linha 3: Item virou data no Excel \(".+"\); formate a coluna A/);
    }
  );
  it.each(["General", "0.00", "0%", "@", '0 "dias"'])(
    "Item numérico com formato %s não é data",
    (z) => {
      const wb = montarWb([CAB, ["1", null, null, "Etapa"], [0, null, null, "A", "m", 1, 1]]);
      wb.Sheets[ABA_ORCAMENTO].A3 = { t: "n", v: 2, z };
      const r = lerArquivoModelo(comoArquivo(wb));
      expect(r.erros.join("\n")).not.toContain("virou data");
    }
  );
  it("Item em data sem formato salvo (workbook em memória): vale o texto exibido", () => {
    const wb = montarWb([CAB, ["1", null, null, "Etapa"], [0, null, null, "A", "m", 1, 1]]);
    wb.Sheets[ABA_ORCAMENTO].A3 = { t: "n", v: 46296, w: "10/1/26" };
    expect(lerPlanilhaModelo(wb).erros[0]).toBe(
      'Linha 3: Item virou data no Excel ("10/1/26"); formate a coluna A como Texto e digite de novo.'
    );
  });
  it("Quantidade e Preço com formato de data são erro (e Total é só aviso)", () => {
    const wb = montarWb([
      CAB,
      ["1", null, null, "Etapa"],
      ["1.1", null, null, "A", "m", 0, 0, 0],
      ["1.2", null, null, "B", "m", 1, 1, 0],
    ]);
    const orc = wb.Sheets[ABA_ORCAMENTO];
    orc.F3 = { t: "n", v: 46023, z: "d-mmm" }; // 1/1 digitado como quantidade
    orc.G3 = { t: "n", v: 46023, z: "mmm-yy" };
    orc.H4 = { t: "n", v: 46023, z: "dd/mm/yyyy" };
    const r = lerArquivoModelo(comoArquivo(wb));
    expect(r.erros).toEqual([
      'Linha 3: Quantidade virou data no Excel ("1-Jan"); formate como Número e digite de novo.',
      'Linha 3: Preço unitário virou data no Excel ("Jan-26"); formate como Número e digite de novo.',
    ]);
    expect(r.itens.map((i) => i.linha)).toEqual([2, 4]); // o item da linha 4 segue, sem o Total
    expect(r.avisos[0]).toMatch(
      /^Linha 4: Total \(R\$\) virou data no Excel \(".+"\);.*foi ignorado\.$/
    );
  });
  // Os tetos são os das colunas do banco (numeric 14,3 / 14,4 / 14,2): acima deles o INSERT da
  // importação estoura depois de o orçamento antigo já ter sido apagado.
  it("Quantidade acima do limite (1e11) é erro, sem lançar", () => {
    const r = lerPlanilhaModelo(
      montarWb([
        CAB,
        ["1", null, null, "A", "m", 1e11, 1],
        ["2", null, null, "B", "m", 1e308, 1e308],
        ["3", null, null, "C", "m", 99999999999.9996, 1], // arredondada a 3 casas dá 1e11
        ["4", null, null, "D", "m", 99999999999.999, 0.01], // a maior que cabe: passa
      ])
    );
    expect(r.erros).toEqual([
      "Linha 2: Quantidade acima do limite (menos de 100.000.000.000).",
      "Linha 3: Quantidade acima do limite (menos de 100.000.000.000).",
      "Linha 3: Preço unitário acima do limite (menos de 10.000.000.000).",
      "Linha 4: Quantidade acima do limite (menos de 100.000.000.000).",
    ]);
    expect(r.itens.map((i) => i.linha)).toEqual([5]);
  });
  it("Preço unitário acima do limite (1e10) é erro, sem lançar", () => {
    const r = lerPlanilhaModelo(
      montarWb([
        CAB,
        ["1", null, null, "A", "m", 1, 1e10],
        ["2", null, null, "B", "m", 1, 1e308],
        ["3", null, null, "C", "m", 0.001, 9999999999.99995], // arredondado a 4 casas dá 1e10
        ["4", null, null, "D", "m", 0.001, 9999999999.9999], // o maior que cabe: passa
      ])
    );
    expect(r.erros).toEqual([
      "Linha 2: Preço unitário acima do limite (menos de 10.000.000.000).",
      "Linha 3: Preço unitário acima do limite (menos de 10.000.000.000).",
      "Linha 4: Preço unitário acima do limite (menos de 10.000.000.000).",
    ]);
    expect(r.itens.map((i) => i.linha)).toEqual([5]);
  });
  it("Total da linha acima do limite (1e12) é erro, sem lançar", () => {
    const r = lerPlanilhaModelo(
      montarWb([
        CAB,
        ["1", null, null, "A", "m", 1e6, 1e6], // total 1e12 exato
        ["2", null, null, "B", "m", 5e10, 5e9], // cada um abaixo do limite, total 2,5e20
        ["3", null, null, "C", "m", 99999999999.999, 9999999999.9999], // os dois no máximo
        ["4", null, null, "D", "m", 999999.999, 999999.9999], // total logo abaixo de 1e12: passa
      ])
    );
    expect(r.erros).toEqual([
      "Linha 2: Total da linha acima do limite (menos de 1.000.000.000.000).",
      "Linha 3: Total da linha acima do limite (menos de 1.000.000.000.000).",
      "Linha 4: Total da linha acima do limite (menos de 1.000.000.000.000).",
    ]);
    expect(r.itens.map((i) => i.linha)).toEqual([5]);
    expect(r.totais.referencia).toBeLessThan(1e12);
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
  it("Total da prefeitura que o Excel transformou em data é ignorado, com aviso", () => {
    const wb = montarWb(ORC_OK, [["Total da prefeitura (R$)", 0]]);
    wb.Sheets[ABA_INFORMACOES].B1 = { t: "n", v: 46023, z: "d-mmm" };
    const r = lerArquivoModelo(comoArquivo(wb));
    expect(r.info.total_prefeitura).toBeNull();
    expect(r.avisos).toEqual([
      'Informações: Total da prefeitura (R$) virou data no Excel ("1-Jan"); formate como Número e digite de novo; foi ignorado.',
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
  it("linha sem quantidade e preço, mas com Unidade ou Total, vira etapa e avisa", () => {
    const r = lerPlanilhaModelo(
      montarWb([
        CAB,
        ["1", null, null, "Etapa só com texto"],
        ["1.1", null, null, "Tem unidade", "un"],
        ["1.2", null, null, "Tem total", null, null, null, 100],
        ["1.3", null, null, "Item", "m", 1, 1],
      ])
    );
    expect(r.erros).toEqual([]);
    expect(r.avisos).toEqual([
      "Linha 3: linha sem quantidade e preço tratada como etapa — confira.",
      "Linha 4: linha sem quantidade e preço tratada como etapa — confira.",
    ]);
    expect(r.itens.map((i) => i.etapa)).toEqual([true, true, true, false]);
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
