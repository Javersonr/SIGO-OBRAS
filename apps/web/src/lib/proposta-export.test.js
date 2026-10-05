import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { montarDadosProposta } from "./proposta-orcamento";
import { gerarPdfProposta, montarPlanilhaProposta } from "./proposta-export";

const item = (id, numero, ordem, quantidade, valor_unitario, valor_total, extra = {}) => ({
  id,
  numero,
  etapa: false,
  codigo: null,
  fonte: "SINAPI",
  descricao: `Serviço ${numero ?? id}`,
  unidade: "m²",
  quantidade,
  valor_unitario_ref: valor_unitario,
  valor_unitario,
  valor_total,
  ordem,
  ...extra,
});
const etapa = (id, numero, ordem, descricao) => ({ id, numero, etapa: true, descricao, ordem });

// 1 > 1.1 > (1.1.1, 1.1.2); 1.2; 2 > 2.1; etapa 3 vazia; item antigo com BDI (sem número)
const ITENS = [
  etapa("e1", "1", 0, "Serviços preliminares"),
  etapa("e11", "1.1", 1, "Movimento de terra"),
  item("i111", "1.1.1", 2, 125.5, 9.18, 1152.09),
  item("i112", "1.1.2", 3, 10, 43.82, 438.2),
  item("i12", "1.2", 4, 2, 100, 200),
  etapa("e2", "2", 5, "Iluminação"),
  item("i21", "2.1", 6, 3, 1000.5, 3001.5),
  etapa("e3", "3", 7, "Etapa sem itens"),
  item("leg", null, 8, 2, 100, 220, { bdi: 10, valor_unitario_ref: null }),
];

function dados(itens = ITENS) {
  return montarDadosProposta({
    itens,
    info: {
      orgao: "Prefeitura Municipal de Teste",
      objeto: "Iluminação pública",
      edital: "Pregão 12/2026",
      data_base: "03/2026",
      bdi: "25%",
    },
    oportunidade: { nome: "PM Teste" },
    empresa: {
      razao_social: "Empresa Teste Ltda",
      cnpj: "11222333000181",
      endereco: "Rua A",
      numero: "100",
      cidade: "Araxá",
      estado: "MG",
      telefone: "34999998888",
      email: "contato@teste.com.br",
    },
    representante: { nome: "Fulano de Tal", cargo: "Sócio-administrador", cpf: "52998224725" },
    opcoes: { validadeDias: 60, local: "Araxá/MG", dataISO: "2026-10-05" },
  });
}

/** linha (1-based) do cabeçalho da tabela: A = "Item" e D = "Descrição" */
function linhaCabecalho(ws) {
  const faixa = XLSX.utils.decode_range(ws["!ref"]);
  for (let r = faixa.s.r; r <= faixa.e.r; r++) {
    if (ws[`A${r + 1}`]?.v === "Item" && ws[`D${r + 1}`]?.v === "Descrição") return r + 1;
  }
  throw new Error("cabeçalho da tabela não encontrado");
}

function textosColunaA(ws) {
  const faixa = XLSX.utils.decode_range(ws["!ref"]);
  const saida = [];
  for (let r = faixa.s.r; r <= faixa.e.r; r++) if (ws[`A${r + 1}`]) saida.push(ws[`A${r + 1}`].v);
  return saida;
}

describe("montarPlanilhaProposta", () => {
  const wb = montarPlanilhaProposta(dados());
  const ws = wb.Sheets.Proposta;
  const h = linhaCabecalho(ws); // itens a partir de h + 1

  it("aba Proposta com o cabeçalho do documento e da tabela", () => {
    expect(wb.SheetNames).toEqual(["Proposta"]);
    expect(ws.A1.v).toBe("Empresa Teste Ltda");
    expect(ws.A2.v).toBe("CNPJ: 11.222.333/0001-81");
    const textos = textosColunaA(ws);
    expect(textos).toContain("PROPOSTA DE PREÇOS");
    expect(textos).toContain("Órgão: Prefeitura Municipal de Teste");
    expect(textos).toContain("Objeto: Iluminação pública");
    expect(textos).toContain("Edital/Processo: Pregão 12/2026");
    expect(textos).toContain("Data-base: 03/2026 | BDI de referência: 25%");
    expect(["A", "B", "C", "D", "E", "F", "G", "H"].map((c) => ws[`${c}${h}`].v)).toEqual([
      "Item",
      "Código",
      "Fonte",
      "Descrição",
      "Unid.",
      "Qtd.",
      "Preço unit. (R$)",
      "Total (R$)",
    ]);
  });

  it("item: número como texto e total ROUND(Fn*Gn,2) com o valor em cache", () => {
    const n = h + 3; // 1.1.1
    expect(ws[`A${n}`]).toMatchObject({ t: "s", v: "1.1.1" });
    expect(ws[`F${n}`].v).toBe(125.5);
    expect(ws[`G${n}`].v).toBe(9.18);
    expect(ws[`H${n}`]).toMatchObject({ t: "n", v: 1152.09, f: `ROUND(F${n}*G${n},2)` });
    expect(ws[`H${h + 4}`]).toMatchObject({ v: 438.2, f: `ROUND(F${h + 4}*G${h + 4},2)` });
  });

  it("etapas: descrição em maiúsculas e SUBTOTAL do bloco, aninhado", () => {
    const e1 = h + 1;
    const e11 = h + 2;
    const e2 = h + 6;
    expect(ws[`D${e1}`].v).toBe("SERVIÇOS PRELIMINARES");
    expect(ws[`H${e1}`]).toMatchObject({ v: 1790.29, f: `SUBTOTAL(9,H${e1 + 1}:H${e1 + 4})` });
    expect(ws[`H${e11}`]).toMatchObject({ v: 1590.29, f: `SUBTOTAL(9,H${e11 + 1}:H${e11 + 2})` });
    expect(ws[`H${e2}`]).toMatchObject({ v: 3001.5, f: `SUBTOTAL(9,H${e2 + 1}:H${e2 + 1})` });
    expect(ws[`F${e1}`]).toBeUndefined();
    expect(ws[`G${e1}`]).toBeUndefined();
  });

  it("etapa sem itens: 0 sem fórmula; item antigo com BDI: valor fixo", () => {
    const e3 = h + 8;
    expect(ws[`H${e3}`]).toMatchObject({ t: "n", v: 0 });
    expect(ws[`H${e3}`].f).toBeUndefined();
    expect(ws[`A${e3 + 1}`].v).toBe("9");
    expect(ws[`H${e3 + 1}`]).toMatchObject({ t: "n", v: 220 });
    expect(ws[`H${e3 + 1}`].f).toBeUndefined();
  });

  it("total geral: SUBTOTAL de toda a tabela; depois extenso, validade, local e assinatura", () => {
    const t = h + 10;
    expect(ws[`D${t}`].v).toBe("VALOR GLOBAL DA PROPOSTA (R$)");
    expect(ws[`H${t}`]).toMatchObject({ v: 5011.79, f: `SUBTOTAL(9,H${h + 1}:H${h + 9})` });
    const textos = textosColunaA(ws);
    expect(textos).toContain(
      "Valor global por extenso: cinco mil e onze reais e setenta e nove centavos"
    );
    expect(textos).toContain("Validade da proposta: 60 dias");
    expect(textos).toContain("Araxá/MG, 05 de outubro de 2026");
    expect(textos.slice(-3)).toEqual([
      "Fulano de Tal",
      "Sócio-administrador",
      "CPF: 529.982.247-25",
    ]);
  });

  it("grava e relê o .xlsx com fórmulas e valores", () => {
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const ws2 = XLSX.read(buf, { type: "buffer" }).Sheets.Proposta;
    expect(ws2[`H${h + 1}`]).toMatchObject({ v: 1790.29, f: `SUBTOTAL(9,H${h + 2}:H${h + 5})` });
    expect(ws2[`H${h + 10}`]).toMatchObject({ v: 5011.79 });
    expect(ws2[`A${h + 2}`].v).toBe("1.1");
  });
});

// jsPDF no PC do escritório (i3) é lento: folga no tempo-limite dos testes de PDF
const LIMITE_PDF = 20000;

describe("gerarPdfProposta", () => {
  it(
    "gera o PDF com uma página e o rodapé",
    () => {
      const doc = gerarPdfProposta(dados(), { jsPDF, autoTable });
      expect(doc.getNumberOfPages()).toBe(1);
      const saida = doc.output();
      expect(saida.startsWith("%PDF-")).toBe(true);
      expect(saida).toContain("Página 1 de 1");
      expect(saida).toContain("PROPOSTA DE PREÇOS");
    },
    LIMITE_PDF
  );

  it(
    "quebra páginas com muitos itens e numera todas",
    () => {
      const muitos = [etapa("e1", "1", 0, "Etapa única")];
      for (let i = 1; i <= 150; i++) muitos.push(item(`i${i}`, `1.${i}`, i, 1, 10, 10));
      const doc = gerarPdfProposta(dados(muitos), { jsPDF, autoTable });
      const n = doc.getNumberOfPages();
      expect(n).toBeGreaterThan(1);
      expect(doc.output()).toContain(`Página ${n} de ${n}`);
    },
    LIMITE_PDF
  );

  it(
    "não lança com caracteres fora da fonte do PDF",
    () => {
      const estranhos = [
        etapa("e1", "1", 0, "Etapa ≤ 3 😀"),
        item("i1", "1.1", 1, 1, 10, 10, { descricao: "Tubo ≤ 3m Ω" }),
      ];
      const doc = gerarPdfProposta(dados(estranhos), { jsPDF, autoTable });
      expect(doc.output()).toContain("Tubo <= 3m ohm");
    },
    LIMITE_PDF
  );
});
