import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { normalizarCronograma, resumoCronograma } from "./cronograma-ff";
import { montarDadosProposta } from "./proposta-orcamento";
import {
  TITULO_CRONOGRAMA,
  gerarPdfCronograma,
  montarDadosCronograma,
  montarPlanilhaCronograma,
  nomeArquivoCronograma,
} from "./cronograma-export";

// 2 etapas: R$ 10.000,00 (20/35/30/15) e R$ 30.000,00 (0/50/50/0); total R$ 40.000,00.
// Mês: 2.000 · 18.500 · 18.000 · 1.500 (5% · 46,25% · 45% · 3,75%), acumulado 100%.
const ETAPAS = [
  { numero: "1", descricao: "Serviços preliminares", centavos: 1_000_000 },
  { numero: "2", descricao: "Iluminação", centavos: 3_000_000 },
];
const CRONOGRAMA = {
  meses: 4,
  pct: { 1: [20, 35, 30, 15], 2: [0, 50, 50, 0], 9: [100, 0, 0, 0] },
  origem: "importado",
  arquivo_nome: "Orcamento SIGO - PM Teste.xlsx",
};
const INFO = {
  orgao: "Prefeitura Municipal de Teste",
  objeto: "Iluminação pública",
  edital: "Pregão 12/2026",
  data_base: "03/2026",
  bdi: "25%",
};
const OPORTUNIDADE = { id: "op1", nome: "PM Teste - LED" };
const EMPRESA = {
  razao_social: "Empresa Teste Ltda",
  cnpj: "11222333000181",
  endereco: "Rua A",
  numero: "100",
  cidade: "Araxá",
  estado: "MG",
};
const REPRESENTANTE = { nome: "Fulano de Tal", cargo: "Sócio-administrador", cpf: "52998224725" };
const OPCOES = { local: "Araxá/MG", dataISO: "2026-10-05" };

function dados({ etapas = ETAPAS, cronograma = CRONOGRAMA, ...extra } = {}) {
  return montarDadosCronograma({
    etapas,
    cronograma,
    info: INFO,
    oportunidade: OPORTUNIDADE,
    empresa: EMPRESA,
    representante: REPRESENTANTE,
    opcoes: OPCOES,
    ...extra,
  });
}

/** n etapas de R$ 1.000,00 com a mesma linha de % */
function muitas(n, linha) {
  const etapas = [];
  const pct = {};
  for (let i = 1; i <= n; i++) {
    etapas.push({ numero: String(i), descricao: `Etapa ${i}`, centavos: 100_000 });
    pct[String(i)] = [...linha];
  }
  return { etapas, cronograma: { meses: linha.length, pct } };
}

/** 17 × 5,55 + 5,65 = 100,00 */
const LINHA_18 = [...new Array(17).fill(5.55), 5.65];

describe("montarDadosCronograma", () => {
  it("cabeçalho, local/data e representante iguais aos da proposta; título e prazo", () => {
    const d = dados();
    const p = montarDadosProposta({
      itens: [],
      info: INFO,
      oportunidade: OPORTUNIDADE,
      empresa: EMPRESA,
      representante: REPRESENTANTE,
      opcoes: { ...OPCOES, validadeDias: 60 },
    });
    for (const campo of ["empresa", "orgao", "objeto", "edital", "localData", "representante"]) {
      expect(d[campo]).toEqual(p[campo]);
    }
    expect(d.titulo).toBe(TITULO_CRONOGRAMA);
    expect(TITULO_CRONOGRAMA).toBe("Cronograma físico-financeiro");
    expect(d.prazoMeses).toBe(4);
    expect(d.localData).toBe("Araxá/MG, 05 de outubro de 2026");
    expect(d.representante).toEqual({
      nome: "Fulano de Tal",
      cargo: "Sócio-administrador",
      cpf: "529.982.247-25",
    });
    expect(Object.keys(d).sort()).toEqual(
      [
        "edital",
        "empresa",
        "localData",
        "objeto",
        "orgao",
        "prazoMeses",
        "representante",
        "resumo",
        "titulo",
      ].sort()
    );
  });

  it("resumo = resumoCronograma das etapas com o cronograma normalizado (órfã fora)", () => {
    const d = dados();
    expect(d.resumo).toEqual(resumoCronograma(ETAPAS, normalizarCronograma(CRONOGRAMA)));
    expect(d.resumo.linhas.map((l) => l.numero)).toEqual(["1", "2"]);
    expect(d.resumo.totalCentavos).toBe(4_000_000);
    expect(d.resumo.meses.map((m) => m.centavos)).toEqual([200_000, 1_850_000, 1_800_000, 150_000]);
  });

  it("sem cronograma: prazo 0 e nenhum mês", () => {
    for (const cronograma of [{}, null, undefined]) {
      const d = montarDadosCronograma({ etapas: ETAPAS, cronograma, opcoes: OPCOES });
      expect(d.prazoMeses).toBe(0);
      expect(d.resumo.meses).toEqual([]);
    }
  });
});

describe("nomeArquivoCronograma", () => {
  it("monta o nome com a data, com o saneamento da proposta", () => {
    expect(nomeArquivoCronograma("PM Itatinga - LED", "2026-10-05", "pdf")).toBe(
      "Cronograma - PM Itatinga - LED - 2026-10-05.pdf"
    );
    expect(nomeArquivoCronograma("PM Itatinga: LED/Praça", "2026-10-05T10:00:00Z", "xlsx")).toBe(
      "Cronograma - PM Itatinga- LED-Praça - 2026-10-05.xlsx"
    );
    expect(nomeArquivoCronograma("  ", "2026-10-05", "pdf")).toBe(
      "Cronograma - Oportunidade - 2026-10-05.pdf"
    );
    // só o prefixo do nome do arquivo muda, não o nome da oportunidade
    expect(nomeArquivoCronograma("Proposta - X", "2026-10-05", "pdf")).toBe(
      "Cronograma - Proposta - X - 2026-10-05.pdf"
    );
  });
});

/** linha (1-based) do cabeçalho da tabela: A = "Item" e B = "Etapa" */
function linhaCabecalho(ws) {
  const faixa = XLSX.utils.decode_range(ws["!ref"]);
  for (let r = faixa.s.r; r <= faixa.e.r; r++) {
    if (ws[`A${r + 1}`]?.v === "Item" && ws[`B${r + 1}`]?.v === "Etapa") return r + 1;
  }
  throw new Error("cabeçalho da tabela não encontrado");
}

function textosColunaA(ws) {
  const faixa = XLSX.utils.decode_range(ws["!ref"]);
  const saida = [];
  for (let r = faixa.s.r; r <= faixa.e.r; r++) if (ws[`A${r + 1}`]) saida.push(ws[`A${r + 1}`].v);
  return saida;
}

/** Soma (em centavos) das células citadas num SUM(...) de células e intervalos de 1 linha. */
function somaDaFormula(ws, formula) {
  const refs = formula.replace(/SUM\(|\)|\$/g, "").split(",");
  let total = 0;
  for (const ref of refs) {
    const [ini, fim = ini] = ref.split(":");
    const a = XLSX.utils.decode_cell(ini);
    const b = XLSX.utils.decode_cell(fim);
    for (let r = a.r; r <= b.r; r++) {
      for (let c = a.c; c <= b.c; c++) {
        total += Math.round((ws[XLSX.utils.encode_cell({ r, c })]?.v ?? 0) * 100);
      }
    }
  }
  return total;
}

describe("montarPlanilhaCronograma", () => {
  const wb = montarPlanilhaCronograma(dados());
  const ws = wb.Sheets.Cronograma;
  const h = linhaCabecalho(ws); // etapa 1: h+1 (R$) e h+2 (%); etapa 2: h+3 e h+4
  const f = h + 5; // Total do mês; depois % do mês, Acumulado (R$), Acumulado (%)

  it("aba Cronograma com o cabeçalho do documento, o prazo e o da tabela", () => {
    expect(wb.SheetNames).toEqual(["Cronograma"]);
    expect(ws.A1.v).toBe("Empresa Teste Ltda");
    expect(ws.A2.v).toBe("CNPJ: 11.222.333/0001-81");
    const textos = textosColunaA(ws);
    expect(textos).toContain("CRONOGRAMA FÍSICO-FINANCEIRO");
    expect(textos).toContain("Órgão: Prefeitura Municipal de Teste");
    expect(textos).toContain("Objeto: Iluminação pública");
    expect(textos).toContain("Edital/Processo: Pregão 12/2026");
    expect(textos).toContain("Prazo de execução: 4 meses");
    // data-base e BDI são da proposta, não do cronograma
    expect(textos.some((t) => String(t).startsWith("Data-base"))).toBe(false);
    expect(["A", "B", "C", "D", "E", "F", "G", "H"].map((c) => ws[`${c}${h}`].v)).toEqual([
      "Item",
      "Etapa",
      "Valor da etapa (R$)",
      "% do total",
      "Mês 1",
      "Mês 2",
      "Mês 3",
      "Mês 4",
    ]);
    expect(ws[`I${h}`]).toBeUndefined();
  });

  it("2 linhas por etapa: R$ (com valor e peso) em cima e % embaixo; mês com 0% em branco", () => {
    expect(ws[`A${h + 1}`]).toMatchObject({ t: "s", v: "1" });
    expect(ws[`B${h + 1}`].v).toBe("Serviços preliminares");
    expect(ws[`C${h + 1}`]).toMatchObject({ t: "n", v: 10000, z: "#,##0.00" });
    expect(ws[`D${h + 1}`]).toMatchObject({ t: "n", v: 0.25, z: "0.00%" });
    expect(["E", "F", "G", "H"].map((c) => ws[`${c}${h + 1}`].v)).toEqual([2000, 3500, 3000, 1500]);
    expect(ws[`E${h + 1}`].z).toBe("#,##0.00");
    expect(["E", "F", "G", "H"].map((c) => ws[`${c}${h + 2}`].v)).toEqual([0.2, 0.35, 0.3, 0.15]);
    expect(ws[`E${h + 2}`].z).toBe("0.00%");
    expect(ws[`A${h + 2}`]).toBeUndefined();
    expect(ws[`C${h + 2}`]).toBeUndefined();
    // Item, Etapa, Valor e % do total mesclados nas 2 linhas da etapa
    expect(ws["!merges"]).toContainEqual({ s: { r: h, c: 0 }, e: { r: h + 1, c: 0 } });
    expect(ws["!merges"]).toContainEqual({ s: { r: h + 2, c: 3 }, e: { r: h + 3, c: 3 } });
    expect(ws["!merges"]).toHaveLength(8);

    expect(ws[`A${h + 3}`].v).toBe("2");
    expect(ws[`D${h + 3}`].v).toBe(0.75);
    expect(ws[`E${h + 3}`]).toBeUndefined();
    expect(ws[`E${h + 4}`]).toBeUndefined();
    expect(ws[`F${h + 3}`].v).toBe(15000);
    expect(ws[`F${h + 4}`].v).toBe(0.5);
    expect(ws[`H${h + 3}`]).toBeUndefined();
    // a etapa órfã (9) não sai
    expect(textosColunaA(ws)).not.toContain("9");
  });

  it("rodapé: SUM das linhas de R$, % do mês e acumulados, com o valor em cache", () => {
    expect([0, 1, 2, 3].map((k) => ws[`B${f + k}`].v)).toEqual([
      "Total do mês (R$)",
      "% do mês",
      "Acumulado (R$)",
      "Acumulado (%)",
    ]);
    expect(ws[`C${f}`]).toMatchObject({ v: 40000, f: `SUM(C${h + 1},C${h + 3})` });
    expect(ws[`E${f}`]).toMatchObject({ v: 2000, f: `SUM(E${h + 1},E${h + 3})`, z: "#,##0.00" });
    expect(ws[`F${f}`]).toMatchObject({ v: 18500, f: `SUM(F${h + 1},F${h + 3})` });
    expect(ws[`H${f}`]).toMatchObject({ v: 1500, f: `SUM(H${h + 1},H${h + 3})` });

    expect(ws[`E${f + 1}`]).toMatchObject({
      v: 0.05,
      f: `IF($C$${f}=0,0,E${f}/$C$${f})`,
      z: "0.00%",
    });
    expect(ws[`F${f + 1}`].v).toBeCloseTo(0.4625, 10);

    expect(ws[`E${f + 2}`]).toMatchObject({ v: 2000, f: `SUM($E$${f}:E${f})` });
    expect(ws[`G${f + 2}`]).toMatchObject({ v: 38500, f: `SUM($E$${f}:G${f})` });
    expect(ws[`H${f + 2}`].v).toBe(40000);

    expect(ws[`F${f + 3}`]).toMatchObject({ f: `SUM($E$${f + 1}:F${f + 1})` });
    expect(ws[`F${f + 3}`].v).toBeCloseTo(0.5125, 10);
    expect(ws[`H${f + 3}`]).toMatchObject({ v: 1, z: "0.00%" });
  });

  it("as fórmulas de soma batem com o valor em cache (o Excel recalcula igual)", () => {
    for (const col of ["C", "E", "F", "G", "H"]) {
      const cel = ws[`${col}${f}`];
      expect(somaDaFormula(ws, cel.f)).toBe(Math.round(cel.v * 100));
    }
    for (const col of ["E", "F", "G", "H"]) {
      const cel = ws[`${col}${f + 2}`];
      expect(somaDaFormula(ws, cel.f)).toBe(Math.round(cel.v * 100));
    }
  });

  it("local/data e assinatura no fim", () => {
    const textos = textosColunaA(ws);
    expect(textos).toContain("Araxá/MG, 05 de outubro de 2026");
    expect(textos.slice(-3)).toEqual([
      "Fulano de Tal",
      "Sócio-administrador",
      "CPF: 529.982.247-25",
    ]);
  });

  it("grava e relê o .xlsx com fórmulas e valores", () => {
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const ws2 = XLSX.read(buf, { type: "buffer" }).Sheets.Cronograma;
    expect(ws2[`E${f}`]).toMatchObject({ v: 2000, f: `SUM(E${h + 1},E${h + 3})` });
    expect(ws2[`H${f + 2}`]).toMatchObject({ v: 40000, f: `SUM($E$${f}:H${f})` });
    expect(ws2[`A${h + 1}`].v).toBe("1");
  });

  it("mais de 255 etapas: SUM de SUMs (limite de argumentos do Excel)", () => {
    const { etapas, cronograma } = muitas(300, [100]);
    const ws3 = montarPlanilhaCronograma(dados({ etapas, cronograma })).Sheets.Cronograma;
    const h3 = linhaCabecalho(ws3);
    const tot = ws3[`E${h3 + 601}`];
    expect(ws3[`B${h3 + 601}`].v).toBe("Total do mês (R$)");
    expect(tot.f.startsWith("SUM(SUM(")).toBe(true);
    expect(tot.f.match(/E\d+/g)).toHaveLength(300);
    expect(tot.v).toBe(300_000);
    expect(somaDaFormula(ws3, tot.f)).toBe(30_000_000);
  });

  it("sem etapas: rodapé sem fórmula", () => {
    const ws4 = montarPlanilhaCronograma(dados({ etapas: [] })).Sheets.Cronograma;
    const h4 = linhaCabecalho(ws4);
    expect(ws4[`B${h4 + 1}`].v).toBe("Total do mês (R$)");
    expect(ws4[`C${h4 + 1}`]).toMatchObject({ t: "n", v: 0 });
    expect(ws4[`C${h4 + 1}`].f).toBeUndefined();
    expect(ws4[`E${h4 + 1}`].f).toBeUndefined();
  });
});

// jsPDF no PC do escritório (i3) é lento: folga no tempo-limite dos testes de PDF
const LIMITE_PDF = 20000;

/** autoTable que guarda as opções de cada chamada */
function espiao() {
  const chamadas = [];
  const fn = (doc, opcoes) => {
    chamadas.push(opcoes);
    return autoTable(doc, opcoes);
  };
  return { fn, chamadas };
}

describe("gerarPdfCronograma", () => {
  it(
    "4 meses: uma página, sem quebra horizontal, com o rodapé da tabela",
    () => {
      const { fn, chamadas } = espiao();
      const doc = gerarPdfCronograma(dados(), { jsPDF, autoTable: fn });
      expect(doc.getNumberOfPages()).toBe(1);
      expect(chamadas).toHaveLength(1);
      expect(chamadas[0].horizontalPageBreak).toBe(false);
      expect(chamadas[0].head).toEqual([
        ["Item", "Etapa", "Valor da etapa (R$)", "% do total", "Mês 1", "Mês 2", "Mês 3", "Mês 4"],
      ]);
      // etapa: R$ em cima e % embaixo na mesma célula; mês com 0% em branco
      expect(chamadas[0].body[0]).toEqual([
        "1",
        "Serviços preliminares",
        "10.000,00",
        "25,00%",
        "2.000,00\n20,00%",
        "3.500,00\n35,00%",
        "3.000,00\n30,00%",
        "1.500,00\n15,00%",
      ]);
      expect(chamadas[0].body[1][4]).toBe("");
      expect(chamadas[0].body.slice(2).map((l) => l[1])).toEqual([
        "Total do mês (R$)",
        "% do mês",
        "Acumulado (R$)",
        "Acumulado (%)",
      ]);
      expect(chamadas[0].body[2].slice(2)).toEqual([
        "40.000,00",
        "",
        "2.000,00",
        "18.500,00",
        "18.000,00",
        "1.500,00",
      ]);
      expect(chamadas[0].body[5].slice(4)).toEqual(["5,00%", "51,25%", "96,25%", "100,00%"]);
      const saida = doc.output();
      expect(saida.startsWith("%PDF-")).toBe(true);
      expect(saida).toContain("CRONOGRAMA FÍSICO-FINANCEIRO");
      expect(saida).toContain("Prazo de execução: 4 meses");
      expect(saida).toContain("Página 1 de 1");
      expect(saida).toContain("Fulano de Tal");
    },
    LIMITE_PDF
  );

  it(
    "12 meses que cabem na largura: sem quebra horizontal",
    () => {
      const { etapas, cronograma } = muitas(3, [8, 8, 8, 8, 8, 8, 8, 8, 9, 9, 9, 9]);
      const { fn, chamadas } = espiao();
      const doc = gerarPdfCronograma(dados({ etapas, cronograma }), { jsPDF, autoTable: fn });
      expect(chamadas[0].horizontalPageBreak).toBe(false);
      expect(doc.getNumberOfPages()).toBe(1);
      expect(doc.output()).toContain("Mês 12");
    },
    LIMITE_PDF
  );

  it(
    "18 meses: quebra na horizontal repetindo Item e Etapa, mais de uma página numerada",
    () => {
      const { etapas, cronograma } = muitas(3, LINHA_18);
      const { fn, chamadas } = espiao();
      const doc = gerarPdfCronograma(dados({ etapas, cronograma }), { jsPDF, autoTable: fn });
      expect(chamadas[0].horizontalPageBreak).toBe(true);
      expect(chamadas[0].horizontalPageBreakRepeat).toEqual([0, 1]);
      const n = doc.getNumberOfPages();
      expect(n).toBeGreaterThan(1);
      const saida = doc.output();
      expect(saida).toContain("Mês 18");
      expect(saida).toContain(`Página ${n} de ${n}`);
      // o cabeçalho "Etapa" sai de novo na página dos meses seguintes
      expect(saida.match(/\(Etapa\) Tj/g).length).toBeGreaterThanOrEqual(2);
      // a última célula absorve os centavos: 17 × 55,50 + 56,50 = 1.000,00
      expect(chamadas[0].body[0][4 + 17]).toBe("56,50\n5,65%");
    },
    LIMITE_PDF
  );

  it(
    "60 meses e muitas etapas: gera sem erro",
    () => {
      const linha = [...new Array(59).fill(1.69), 0.29];
      const { etapas, cronograma } = muitas(40, linha);
      const doc = gerarPdfCronograma(dados({ etapas, cronograma }), { jsPDF, autoTable });
      const n = doc.getNumberOfPages();
      expect(n).toBeGreaterThan(4);
      expect(doc.output()).toContain(`Página ${n} de ${n}`);
    },
    LIMITE_PDF
  );

  it(
    "não lança com caracteres fora da fonte do PDF",
    () => {
      const etapas = [{ numero: "1", descricao: "Etapa ≤ 3 Ω 😀", centavos: 100_000 }];
      const doc = gerarPdfCronograma(
        dados({ etapas, cronograma: { meses: 1, pct: { 1: [100] } } }),
        { jsPDF, autoTable }
      );
      expect(doc.output()).toContain("Etapa <= 3 ohm ?");
    },
    LIMITE_PDF
  );
});
