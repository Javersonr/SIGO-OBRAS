/**
 * Arquivos do cronograma físico-financeiro no servidor (Excel e PDF) — porte linha a linha de
 * apps/web/src/lib/cronograma-export.js (spec 2026-10-09 §3), com as bibliotecas INJETADAS (jsPDF,
 * jspdf-autotable e SheetJS nas mesmas versões da tela). Os dados (`montarDadosCronograma`) e o
 * nome do arquivo (`nomeArquivoCronograma`) estão em dados-cronograma.ts; o cabeçalho e o esqueleto
 * dos arquivos (topo, assinatura, rodapé "Página X de Y", escritor de linhas) são os da proposta de
 * preços (proposta-export.ts). A paridade com a tela (mesmas células e o mesmo PDF, byte a byte) é
 * conferida em apps/web/src/lib/documentos-paridade.test.js.
 *
 *   - Excel (SheetJS): aba "Cronograma", 2 linhas por etapa (R$ em cima, % embaixo) e o
 *     rodapé (total do mês, % do mês e acumulados) em fórmula, com o valor em cache;
 *   - PDF (jsPDF + jspdf-autotable): A4 paisagem; com mais de 12 meses, quebra na
 *     horizontal repetindo Item e Etapa; "Página X de Y".
 */
import { TITULO_CRONOGRAMA, type DadosCronograma } from "./dados-cronograma.ts";
import {
  ENTRE_LINHAS_PDF,
  alturaAssinaturaPdf,
  cabecalhoDoDocumento,
  criarPdf,
  criarPlanilha,
  escreverAssinaturaPdf,
  escreverAssinaturaPlanilha,
  escreverTopoPdf,
  escreverTopoPlanilha,
  garantirEspaco,
  numerarPaginasPdf,
  textoPdf,
  type LibsDocumentos,
} from "./proposta-export.ts";

const ABA = "Cronograma";
const FMT_MOEDA = "#,##0.00";
const FMT_PCT = "0.00%";
const ROTULOS_RODAPE = ["Total do mês (R$)", "% do mês", "Acumulado (R$)", "Acumulado (%)"];
// colunas antes dos meses: Item, Etapa, Valor da etapa, % do total
const COL_MES = 4;
// o Excel aceita até 255 argumentos numa função
const MAX_ARGS = 255;

// ------------------------------------------------------ partes em comum

function cabecalhoTabela(meses: number): string[] {
  const colunas = ["Item", "Etapa", "Valor da etapa (R$)", "% do total"];
  for (let j = 1; j <= meses; j++) colunas.push(`Mês ${j}`);
  return colunas;
}

/** Linhas do topo: as da proposta (empresa, órgão, objeto, edital) e o prazo. */
function linhasDoTopo(dados: DadosCronograma): { empresa: string[]; licitacao: string[] } {
  const cab = cabecalhoDoDocumento(dados);
  const n = Number(dados.prazoMeses) || 0;
  return {
    empresa: cab.empresa,
    licitacao: [...cab.licitacao, `Prazo de execução: ${n} ${n === 1 ? "mês" : "meses"}`],
  };
}

// ------------------------------------------------------------------ Excel

/** SUM das células da coluna nas linhas dadas; acima de 255, SUM de SUMs. */
function somaDasCelulas(coluna: string, linhas: number[]): string {
  const refs = linhas.map((n) => `${coluna}${n}`);
  if (refs.length <= MAX_ARGS) return `SUM(${refs.join(",")})`;
  const grupos = [];
  for (let i = 0; i < refs.length; i += MAX_ARGS) {
    grupos.push(`SUM(${refs.slice(i, i + MAX_ARGS).join(",")})`);
  }
  return `SUM(${grupos.join(",")})`;
}

/**
 * Pasta de trabalho com a aba "Cronograma": cabeçalho da empresa e da licitação, o prazo,
 * a tabela (Item · Etapa · Valor da etapa (R$) · % do total · Mês 1 … Mês N), local/data e
 * a assinatura.
 *
 * - Cada etapa ocupa 2 linhas: R$ em cima (com o valor e o peso da etapa) e % embaixo;
 *   Item, Etapa, Valor e % do total mesclados nas duas. Mês com 0% fica em branco.
 * - % gravado como fração com formato 0.00% (20% = 0,2), como o Excel trata porcentagem.
 * - Rodapé, sempre com o valor em cache (`v`), para abrir certo sem recalcular:
 *   Total do mês = SUM das linhas de R$ (a coluna C leva o total das etapas);
 *   % do mês = total do mês ÷ total das etapas; Acumulado (R$) e Acumulado (%) = SUM do
 *   1º mês até o mês.
 */
// deno-lint-ignore no-explicit-any
export function montarPlanilhaCronograma(dados: DadosCronograma, XLSX: any): unknown {
  const pl = criarPlanilha(XLSX);
  const { ws, gravar, linhaDeTexto } = pl;
  escreverTopoPlanilha(pl, linhasDoTopo(dados), dados.titulo || TITULO_CRONOGRAMA);

  const resumo = dados.resumo || { linhas: [], meses: [], totalCentavos: 0 };
  const nMeses = resumo.meses.length;
  cabecalhoTabela(nMeses).forEach((h, c) => gravar(pl.r, c, { t: "s", v: h }));
  pl.r++;

  const linhasReais: number[] = []; // número (1-based) da linha de R$ de cada etapa
  const mesclas: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [];
  resumo.linhas.forEach((l) => {
    const lr = pl.r; // R$
    const lp = pl.r + 1; // %
    linhasReais.push(lr + 1);
    for (let c = 0; c < COL_MES; c++) mesclas.push({ s: { r: lr, c }, e: { r: lp, c } });
    gravar(lr, 0, { t: "s", v: String(l.numero ?? "") });
    gravar(lr, 1, { t: "s", v: String(l.descricao ?? "") });
    gravar(lr, 2, { t: "n", v: l.centavos / 100, z: FMT_MOEDA });
    gravar(lr, 3, { t: "n", v: (Number(l.peso) || 0) / 100, z: FMT_PCT });
    l.pct.forEach((p, j) => {
      if (!p) return;
      gravar(lr, COL_MES + j, { t: "n", v: l.valores[j] / 100, z: FMT_MOEDA });
      gravar(lp, COL_MES + j, { t: "n", v: p / 100, z: FMT_PCT });
    });
    pl.r += 2;
  });

  // rodapé: 4 linhas, a partir de `f` (0-based); nF = número da linha "Total do mês"
  const f = pl.r;
  const nF = f + 1;
  const mes1 = XLSX.utils.encode_col(COL_MES); // coluna do Mês 1 ("E")
  const temEtapas = linhasReais.length > 0;
  ROTULOS_RODAPE.forEach((rotulo, k) => gravar(f + k, 1, { t: "s", v: rotulo }));
  gravar(
    f,
    2,
    temEtapas
      ? {
          t: "n",
          v: resumo.totalCentavos / 100,
          f: somaDasCelulas("C", linhasReais),
          z: FMT_MOEDA,
        }
      : { t: "n", v: 0, z: FMT_MOEDA }
  );
  resumo.meses.forEach((m, j) => {
    const c = COL_MES + j;
    const col = XLSX.utils.encode_col(c);
    // deno-lint-ignore no-explicit-any
    const total: Record<string, any> = { t: "n", v: m.centavos / 100, z: FMT_MOEDA };
    if (temEtapas) total.f = somaDasCelulas(col, linhasReais);
    gravar(f, c, total);
    gravar(f + 1, c, {
      t: "n",
      v: (Number(m.pct) || 0) / 100,
      f: `IF($C$${nF}=0,0,${col}${nF}/$C$${nF})`,
      z: FMT_PCT,
    });
    gravar(f + 2, c, {
      t: "n",
      v: m.acumCentavos / 100,
      f: `SUM($${mes1}$${nF}:${col}${nF})`,
      z: FMT_MOEDA,
    });
    gravar(f + 3, c, {
      t: "n",
      v: (Number(m.acumPct) || 0) / 100,
      f: `SUM($${mes1}$${nF + 1}:${col}${nF + 1})`,
      z: FMT_PCT,
    });
  });
  pl.r = f + ROTULOS_RODAPE.length + 1;

  linhaDeTexto(dados.localData);
  escreverAssinaturaPlanilha(pl, dados.representante);

  ws["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: Math.max(pl.r - 1, 0), c: COL_MES - 1 + Math.max(nMeses, 1) },
  });
  if (mesclas.length) ws["!merges"] = mesclas;
  ws["!cols"] = [{ wch: 8 }, { wch: 45 }, { wch: 16 }, { wch: 10 }];
  for (let j = 0; j < nMeses; j++) ws["!cols"].push({ wch: 14 });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, ABA);
  return wb;
}

// -------------------------------------------------------------------- PDF

const FONTE_TABELA = 7;
const PADDING = 1;
// sobra (mm) sobre o texto mais largo da coluna: o autoTable quebra a linha se ele não couber
const FOLGA = 0.5;
// Larguras mínimas (mm) das colunas; cada uma cresce se o maior texto dela pedir mais. Com a
// quebra na horizontal, a etapa fica fixa em `etapa`; sem ela, ocupa o que sobra, no mínimo
// `etapaMin`. Calibradas para 12 meses caberem numa página até R$ 9.999.999,99 de total.
const LARGURA = { item: 8, etapa: 45, etapaMin: 30, valor: 18, peso: 12, mes: 14 };
// espaço (mm) para assinar, entre o local/data e o traço (a proposta usa 18)
const ESPACO_ASSINAR = 16;

const doisDecimais = (v: unknown): string =>
  (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const moeda = (centavos: unknown): string => doisDecimais((Number(centavos) || 0) / 100);
const percentual = (v: unknown): string => `${doisDecimais(v)}%`;

/**
 * Largura (mm) da coluna: a do maior texto em negrito (as linhas das células contam uma a
 * uma), com o padding e a folga; nunca menos que `minimo`.
 */
// deno-lint-ignore no-explicit-any
function larguraDaColuna(doc: any, textos: unknown[], minimo: number): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(FONTE_TABELA);
  const maior = textos
    .flatMap((t) => String(t).split("\n"))
    .reduce<number>((m, t) => Math.max(m, doc.getTextWidth(t)), 0);
  return Math.max(minimo, Math.ceil((maior + 2 * PADDING + FOLGA) * 10) / 10);
}

/**
 * PDF do cronograma (A4 paisagem). `jsPDF` e `autoTable` vêm de fora (import dinâmico no
 * servidor e na tela; import normal no teste).
 *
 * Cada etapa é uma linha da tabela com 2 linhas de texto em cada mês (R$ em cima, %
 * embaixo), para o par nunca se separar numa quebra de página. Com mais de 12 meses (ou
 * se os meses não couberem na largura), a tabela quebra na horizontal repetindo as colunas
 * Item e Etapa (horizontalPageBreak e horizontalPageBreakRepeat).
 */
export function gerarPdfCronograma(
  dados: DadosCronograma,
  { jsPDF, autoTable }: Pick<LibsDocumentos, "jsPDF" | "autoTable">
): unknown {
  const pdf = criarPdf(jsPDF);
  const { doc, M, util } = pdf;
  escreverTopoPdf(pdf, linhasDoTopo(dados), dados.titulo || TITULO_CRONOGRAMA);

  const resumo = dados.resumo || { linhas: [], meses: [], totalCentavos: 0 };
  const n = resumo.meses.length;
  const corpo: string[][] = [];
  const tipos: string[] = [];
  resumo.linhas.forEach((l) => {
    corpo.push([
      textoPdf(l.numero),
      textoPdf(l.descricao),
      moeda(l.centavos),
      percentual(l.peso),
      ...l.pct.map((p, j) => (p ? `${moeda(l.valores[j])}\n${percentual(p)}` : "")),
    ]);
    tipos.push("etapa");
  });
  const rodape: [string, string[]][] = [
    [moeda(resumo.totalCentavos), resumo.meses.map((m) => moeda(m.centavos))],
    ["", resumo.meses.map((m) => percentual(m.pct))],
    ["", resumo.meses.map((m) => moeda(m.acumCentavos))],
    ["", resumo.meses.map((m) => percentual(m.acumPct))],
  ];
  rodape.forEach(([total, valores], k) => {
    corpo.push(["", ROTULOS_RODAPE[k], total, "", ...valores]);
    tipos.push("rodape");
  });

  // larguras pelo maior texto de cada coluna em negrito (o do rodapé), com folga
  const textosDa = (c: number) => corpo.map((linha) => linha[c]);
  const largItem = larguraDaColuna(doc, textosDa(0), LARGURA.item);
  const largValor = larguraDaColuna(doc, textosDa(2), LARGURA.valor);
  const largPeso = larguraDaColuna(doc, textosDa(3), LARGURA.peso);
  const largMes = larguraDaColuna(
    doc,
    corpo.flatMap((linha) => linha.slice(COL_MES)),
    LARGURA.mes
  );
  const quebra = n > 12 || largItem + LARGURA.etapaMin + largValor + largPeso + n * largMes > util;

  // deno-lint-ignore no-explicit-any
  const columnStyles: Record<number, any> = {
    0: { cellWidth: largItem },
    1: quebra
      ? { cellWidth: LARGURA.etapa }
      : { cellWidth: "auto", minCellWidth: LARGURA.etapaMin },
    2: { cellWidth: largValor, halign: "right" },
    3: { cellWidth: largPeso, halign: "right" },
  };
  for (let j = 0; j < n; j++) columnStyles[COL_MES + j] = { cellWidth: largMes, halign: "right" };

  autoTable(doc, {
    startY: pdf.y,
    head: [cabecalhoTabela(n)],
    body: corpo,
    theme: "grid",
    margin: { left: M, right: M, bottom: 16 },
    styles: {
      font: "helvetica",
      fontSize: FONTE_TABELA,
      cellPadding: PADDING,
      overflow: "linebreak",
      valign: "middle",
    },
    headStyles: { fillColor: [226, 232, 240], textColor: 20, fontStyle: "bold" },
    columnStyles,
    rowPageBreak: "avoid",
    horizontalPageBreak: quebra,
    horizontalPageBreakRepeat: [0, 1],
    // deno-lint-ignore no-explicit-any
    didParseCell: (data: any) => {
      if (data.section === "head" && data.column.index >= 2) data.cell.styles.halign = "right";
      if (data.section === "body" && tipos[data.row.index] === "rodape") {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [241, 245, 249];
      }
    },
  });

  pdf.y = (doc.lastAutoTable?.finalY ?? pdf.y) + 8;
  // local/data e assinatura não se partem: sem espaço para o bloco inteiro, vão juntos
  // para a página seguinte
  garantirEspaco(
    pdf,
    (dados.localData ? ENTRE_LINHAS_PDF : 0) +
      alturaAssinaturaPdf(dados.representante, { espacoAntes: ESPACO_ASSINAR })
  );
  if (dados.localData) pdf.escrever(dados.localData, { tamanho: 9 });
  escreverAssinaturaPdf(pdf, dados.representante, { espacoAntes: ESPACO_ASSINAR });
  numerarPaginasPdf(pdf, dados.empresa?.nome);
  return doc;
}
