/**
 * Cronograma físico-financeiro da proposta, a partir das etapas do orçamento e do
 * cronograma_ff da oportunidade:
 *   - montarDadosCronograma: tudo o que o PDF e o Excel mostram, já calculado;
 *   - Excel (SheetJS): aba "Cronograma", 2 linhas por etapa (R$ em cima, % embaixo) e o
 *     rodapé (total do mês, % do mês e acumulados) em fórmula, com o valor em cache;
 *   - PDF (jsPDF + jspdf-autotable): A4 paisagem; com mais de 12 meses, quebra na
 *     horizontal repetindo Item e Etapa; "Página X de Y".
 * Spec: docs/superpowers/specs/2026-10-05-cronograma-fisico-financeiro-design.md §7.
 *
 * O cabeçalho (empresa, órgão, objeto, edital, local/data e representante), o nome do
 * arquivo e o carregamento do jsPDF são os da proposta de preços. Este módulo importa
 * o xlsx: no navegador, entra só por import dinâmico (no clique do "Gerar").
 */
import * as XLSX from "xlsx";
import { normalizarCronograma, resumoCronograma } from "./cronograma-ff";
import { montarCabecalhoLicitacao, nomeArquivoProposta } from "./proposta-orcamento";
import { cabecalhoDoDocumento, carregarJsPdf, linhasAssinatura, textoPdf } from "./proposta-export";

export const TITULO_CRONOGRAMA = "Cronograma físico-financeiro";
const ABA = "Cronograma";
const FMT_MOEDA = "#,##0.00";
const FMT_PCT = "0.00%";
const ROTULOS_RODAPE = ["Total do mês (R$)", "% do mês", "Acumulado (R$)", "Acumulado (%)"];
// colunas antes dos meses: Item, Etapa, Valor da etapa, % do total
const COL_MES = 4;
// o Excel aceita até 255 argumentos numa função
const MAX_ARGS = 255;

// ------------------------------------------------------------------ dados

/**
 * DadosCronograma = { empresa: { nome, cnpj, endereco, contato }, titulo, orgao, objeto,
 *   edital, prazoMeses, resumo, localData, representante: { nome, cargo, cpf } }
 *
 * - cabeçalho, local/data e representante: os mesmos da proposta (montarCabecalhoLicitacao);
 * - resumo: resumoCronograma(etapas, cronograma normalizado). Só as etapas do orçamento
 *   entram; linha do cronograma sem etapa (órfã) não sai no arquivo.
 */
export function montarDadosCronograma({
  etapas,
  cronograma,
  info,
  oportunidade,
  empresa,
  representante,
  opcoes,
}) {
  const cron = normalizarCronograma(cronograma);
  const cab = montarCabecalhoLicitacao({ info, oportunidade, empresa, representante, opcoes });
  return {
    empresa: cab.empresa,
    titulo: TITULO_CRONOGRAMA,
    orgao: cab.orgao,
    objeto: cab.objeto,
    edital: cab.edital,
    prazoMeses: cron.meses,
    resumo: resumoCronograma(etapas || [], cron),
    localData: cab.localData,
    representante: cab.representante,
  };
}

/** "Cronograma - <nome> - <aaaa-mm-dd>.<ext>", com o mesmo saneamento da proposta. */
export function nomeArquivoCronograma(nomeOportunidade, dataISO, ext) {
  return nomeArquivoProposta(nomeOportunidade, dataISO, ext).replace(
    /^Proposta - /,
    "Cronograma - "
  );
}

// ------------------------------------------------------ partes em comum

function cabecalhoTabela(meses) {
  const colunas = ["Item", "Etapa", "Valor da etapa (R$)", "% do total"];
  for (let j = 1; j <= meses; j++) colunas.push(`Mês ${j}`);
  return colunas;
}

/** Linhas do topo: as da proposta (empresa, órgão, objeto, edital) e o prazo. */
function linhasDoTopo(dados) {
  const cab = cabecalhoDoDocumento(dados);
  const n = Number(dados.prazoMeses) || 0;
  return {
    empresa: cab.empresa,
    licitacao: [...cab.licitacao, `Prazo de execução: ${n} ${n === 1 ? "mês" : "meses"}`],
  };
}

// ------------------------------------------------------------------ Excel

/** SUM das células da coluna nas linhas dadas; acima de 255, SUM de SUMs. */
function somaDasCelulas(coluna, linhas) {
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
export function montarPlanilhaCronograma(dados) {
  const ws = {};
  let r = 0; // próxima linha (0-based)
  const gravar = (linha, coluna, celula) => {
    ws[XLSX.utils.encode_cell({ r: linha, c: coluna })] = celula;
  };
  const linhaDeTexto = (valor) => {
    if (valor) gravar(r, 0, { t: "s", v: String(valor) });
    r++;
  };

  const topo = linhasDoTopo(dados);
  topo.empresa.forEach(linhaDeTexto);
  r++;
  linhaDeTexto(String(dados.titulo || TITULO_CRONOGRAMA).toUpperCase());
  topo.licitacao.forEach(linhaDeTexto);
  r++;

  const resumo = dados.resumo || { linhas: [], meses: [], totalCentavos: 0 };
  const nMeses = resumo.meses.length;
  cabecalhoTabela(nMeses).forEach((h, c) => gravar(r, c, { t: "s", v: h }));
  r++;

  const linhasReais = []; // número (1-based) da linha de R$ de cada etapa
  const mesclas = [];
  resumo.linhas.forEach((l) => {
    const lr = r; // R$
    const lp = r + 1; // %
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
    r += 2;
  });

  // rodapé: 4 linhas, a partir de `f` (0-based); nF = número da linha "Total do mês"
  const f = r;
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
    const total = { t: "n", v: m.centavos / 100, z: FMT_MOEDA };
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
  r = f + ROTULOS_RODAPE.length + 1;

  linhaDeTexto(dados.localData);
  r += 2;
  linhaDeTexto("_______________________________________");
  linhasAssinatura(dados.representante).forEach(linhaDeTexto);

  ws["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: Math.max(r - 1, 0), c: COL_MES - 1 + Math.max(nMeses, 1) },
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
const LARGURA = { item: 12, etapa: 45, etapaMin: 40, valor: 24, peso: 15, mesMin: 14 };

const doisDecimais = (v) =>
  (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const moeda = (centavos) => doisDecimais((Number(centavos) || 0) / 100);
const percentual = (v) => `${doisDecimais(v)}%`;

/**
 * PDF do cronograma (A4 paisagem). `jsPDF` e `autoTable` vêm de fora (carregarJsPdf no
 * navegador; import normal no teste).
 *
 * Cada etapa é uma linha da tabela com 2 linhas de texto em cada mês (R$ em cima, %
 * embaixo), para o par nunca se separar numa quebra de página. Com mais de 12 meses (ou
 * se os meses não couberem na largura), a tabela quebra na horizontal repetindo as colunas
 * Item e Etapa (horizontalPageBreak e horizontalPageBreakRepeat).
 */
export function gerarPdfCronograma(dados, { jsPDF, autoTable }) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const larg = doc.internal.pageSize.getWidth();
  const alt = doc.internal.pageSize.getHeight();
  const M = 12;
  const util = larg - 2 * M;
  let y = 14;

  const escrever = (
    texto,
    { tamanho = 9, negrito = false, alinhar = "left", entre = 4.2 } = {}
  ) => {
    doc.setFont("helvetica", negrito ? "bold" : "normal");
    doc.setFontSize(tamanho);
    const partes = doc.splitTextToSize(textoPdf(texto), util);
    const x = alinhar === "center" ? larg / 2 : M;
    partes.forEach((p) => {
      if (y > alt - 16) {
        doc.addPage();
        y = 14;
      }
      doc.text(p, x, y, { align: alinhar });
      y += entre;
    });
  };

  const topo = linhasDoTopo(dados);
  topo.empresa.forEach((t, i) =>
    escrever(t, i === 0 ? { tamanho: 12, negrito: true, entre: 5.5 } : { tamanho: 8.5 })
  );
  y += 3;
  escrever(String(dados.titulo || TITULO_CRONOGRAMA).toUpperCase(), {
    tamanho: 13,
    negrito: true,
    alinhar: "center",
    entre: 7,
  });
  topo.licitacao.forEach((t) => escrever(t, { tamanho: 9 }));
  y += 2;

  const resumo = dados.resumo || { linhas: [], meses: [], totalCentavos: 0 };
  const n = resumo.meses.length;
  const corpo = [];
  const tipos = [];
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
  const rodape = [
    [moeda(resumo.totalCentavos), resumo.meses.map((m) => moeda(m.centavos))],
    ["", resumo.meses.map((m) => percentual(m.pct))],
    ["", resumo.meses.map((m) => moeda(m.acumCentavos))],
    ["", resumo.meses.map((m) => percentual(m.acumPct))],
  ];
  rodape.forEach(([total, valores], k) => {
    corpo.push(["", ROTULOS_RODAPE[k], total, "", ...valores]);
    tipos.push("rodape");
  });

  // largura de um mês: o maior texto dos meses em negrito (o do rodapé), com folga
  doc.setFont("helvetica", "bold");
  doc.setFontSize(FONTE_TABELA);
  const maiorTexto = corpo.reduce(
    (max, linha) =>
      linha
        .slice(COL_MES)
        .flatMap((t) => String(t).split("\n"))
        .reduce((m, t) => Math.max(m, doc.getTextWidth(t)), max),
    0
  );
  const largMes = Math.max(LARGURA.mesMin, Math.ceil((maiorTexto + 2 * PADDING + 1) * 10) / 10);
  const quebra =
    n > 12 || LARGURA.item + LARGURA.etapaMin + LARGURA.valor + LARGURA.peso + n * largMes > util;

  const columnStyles = {
    0: { cellWidth: LARGURA.item },
    1: quebra
      ? { cellWidth: LARGURA.etapa }
      : { cellWidth: "auto", minCellWidth: LARGURA.etapaMin },
    2: { cellWidth: LARGURA.valor, halign: "right" },
    3: { cellWidth: LARGURA.peso, halign: "right" },
  };
  for (let j = 0; j < n; j++) columnStyles[COL_MES + j] = { cellWidth: largMes, halign: "right" };

  autoTable(doc, {
    startY: y,
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
    didParseCell: (data) => {
      if (data.section === "head" && data.column.index >= 2) data.cell.styles.halign = "right";
      if (data.section === "body" && tipos[data.row.index] === "rodape") {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [241, 245, 249];
      }
    },
  });

  y = (doc.lastAutoTable?.finalY ?? y) + 8;
  // local/data e assinatura não se partem
  if (y > alt - 45) {
    doc.addPage();
    y = 20;
  }
  if (dados.localData) escrever(dados.localData, { tamanho: 9 });
  y += 16;
  doc.setDrawColor(60);
  doc.setLineWidth(0.3);
  doc.line(larg / 2 - 45, y, larg / 2 + 45, y);
  y += 5;
  linhasAssinatura(dados.representante).forEach((t, i) =>
    escrever(t, { tamanho: 9, negrito: i === 0, alinhar: "center" })
  );

  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(textoPdf(dados.empresa?.nome || ""), M, alt - 7);
    doc.text(`Página ${p} de ${total}`, larg - M, alt - 7, { align: "right" });
    doc.setTextColor(0);
  }
  return doc;
}

// -------------------------------------------------------------- downloads

/** Gera e baixa o PDF (jspdf e jspdf-autotable carregados só no clique). */
export async function baixarCronogramaPdf(dados, nomeArquivo) {
  gerarPdfCronograma(dados, await carregarJsPdf()).save(nomeArquivo);
}

/** Gera e baixa o Excel. */
export async function baixarCronogramaExcel(dados, nomeArquivo) {
  XLSX.writeFile(montarPlanilhaCronograma(dados), nomeArquivo);
}
