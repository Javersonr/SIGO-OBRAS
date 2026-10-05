/**
 * Arquivos da proposta de preços a partir de DadosProposta
 * (lib/proposta-orcamento.js → montarDadosProposta):
 *   - Excel (SheetJS): aba "Proposta" com fórmulas E o valor já calculado;
 *   - PDF (jsPDF + jspdf-autotable): A4 paisagem, etapas em negrito, "Página X de Y".
 * Spec: docs/superpowers/specs/2026-09-29-orcamento-planilha-prefeitura-design.md §9.
 *
 * O SheetJS 0.18.5 (versão gratuita) não grava estilo: no Excel a etapa sai com
 * a descrição em MAIÚSCULAS e o subtotal; o negrito fica só no PDF.
 */
import * as XLSX from "xlsx";
import { totalLinha } from "./orcamento-desconto";

const ABA = "Proposta";
const CABECALHO = [
  "Item",
  "Código",
  "Fonte",
  "Descrição",
  "Unid.",
  "Qtd.",
  "Preço unit. (R$)",
  "Total (R$)",
];
const FMT_MOEDA = "#,##0.00";
const FMT_UNIT = "#,##0.00##";
const FMT_QTD = "#,##0.00#";

const somaCentavos = (valores) =>
  valores.reduce((s, v) => s + Math.round((Number(v) || 0) * 100), 0) / 100;

/**
 * Última linha (índice em `linhas`) do bloco da etapa `i`: as linhas logo abaixo
 * cujo número começa com "<número da etapa>.". Numa planilha bem formada é o
 * mesmo que "até a próxima etapa de nível ≤ o dela", e bate com subtotaisEtapas.
 * Devolve `i` quando a etapa não tem nada embaixo.
 */
function fimDoBloco(linhas, i) {
  const prefixo = `${linhas[i].numero}.`;
  let j = i;
  while (j + 1 < linhas.length && String(linhas[j + 1].numero).startsWith(prefixo)) j++;
  return j;
}

export function cabecalhoDoDocumento(dados) {
  const emp = dados.empresa || {};
  const referencia = [
    dados.dataBase ? `Data-base: ${dados.dataBase}` : "",
    dados.bdi ? `BDI de referência: ${dados.bdi}` : "",
  ]
    .filter(Boolean)
    .join(" | ");
  return {
    empresa: [emp.nome, emp.cnpj ? `CNPJ: ${emp.cnpj}` : "", emp.endereco, emp.contato].filter(
      Boolean
    ),
    licitacao: [
      dados.orgao ? `Órgão: ${dados.orgao}` : "",
      dados.objeto ? `Objeto: ${dados.objeto}` : "",
      dados.edital ? `Edital/Processo: ${dados.edital}` : "",
      referencia,
    ].filter(Boolean),
  };
}

export function linhasAssinatura(rep) {
  return [rep?.nome || "", rep?.cargo || "", rep?.cpf ? `CPF: ${rep.cpf}` : ""].filter(Boolean);
}

// ------------------------------------------------- layout em comum (Excel)
// Usado pela proposta e pelo cronograma físico-financeiro (lib/cronograma-export.js):
// o que muda no cabeçalho, no rodapé ou na assinatura vale para os dois documentos.

/**
 * Escritor da planilha: `ws` (a aba), `r` (próxima linha, 0-based), `gravar(linha, coluna,
 * celula)` e `linhaDeTexto(valor)` (texto na coluna A; valor vazio só pula a linha).
 */
export function criarPlanilha() {
  const pl = {
    ws: {},
    r: 0,
    gravar(linha, coluna, celula) {
      pl.ws[XLSX.utils.encode_cell({ r: linha, c: coluna })] = celula;
    },
    linhaDeTexto(valor) {
      if (valor) pl.gravar(pl.r, 0, { t: "s", v: String(valor) });
      pl.r++;
    },
  };
  return pl;
}

/** Topo: empresa, título em maiúsculas e dados da licitação (`cab` = cabecalhoDoDocumento). */
export function escreverTopoPlanilha(pl, cab, titulo) {
  cab.empresa.forEach(pl.linhaDeTexto);
  pl.r++;
  pl.linhaDeTexto(String(titulo).toUpperCase());
  cab.licitacao.forEach(pl.linhaDeTexto);
  pl.r++;
}

/** Linha de assinatura e as do representante, 2 linhas abaixo da última escrita. */
export function escreverAssinaturaPlanilha(pl, representante) {
  pl.r += 2;
  pl.linhaDeTexto("_______________________________________");
  linhasAssinatura(representante).forEach(pl.linhaDeTexto);
}

// ------------------------------------------------------------------ Excel

/**
 * Pasta de trabalho com a aba "Proposta": cabeçalho da empresa e da licitação,
 * a tabela (Item · Código · Fonte · Descrição · Unid. · Qtd. · Preço unit. · Total),
 * o valor global, o extenso, a validade, local/data e a assinatura.
 *
 * Fórmulas, sempre com o valor em cache (`v`), para abrir certo mesmo sem recalcular:
 *   - total do item: ROUND(Fn*Gn,2) — só quando confere com o total gravado; item antigo
 *     com BDI/imposto por linha sai com o valor fixo, para o Excel bater com o PDF;
 *   - subtotal da etapa: SUBTOTAL(9,H<i>:H<j>) sobre o bloco da etapa;
 *   - total geral: SUBTOTAL(9,H<primeira>:H<última>), que ignora os SUBTOTAL de dentro
 *     do intervalo (as etapas aninhadas não contam duas vezes).
 */
export function montarPlanilhaProposta(dados) {
  const pl = criarPlanilha();
  const { ws, gravar, linhaDeTexto } = pl;
  escreverTopoPlanilha(pl, cabecalhoDoDocumento(dados), dados.titulo || "Proposta de preços");

  CABECALHO.forEach((h, c) => gravar(pl.r, c, { t: "s", v: h }));
  pl.r++;

  const linhas = dados.linhas || [];
  const primeira = pl.r;
  linhas.forEach((l, i) => {
    const lin = primeira + i;
    const n = lin + 1; // número da linha no Excel
    gravar(lin, 0, { t: "s", v: String(l.numero ?? "") });
    if (l.codigo) gravar(lin, 1, { t: "s", v: String(l.codigo) });
    if (l.fonte) gravar(lin, 2, { t: "s", v: String(l.fonte) });
    const descricao = String(l.descricao ?? "");
    gravar(lin, 3, { t: "s", v: l.tipo === "etapa" ? descricao.toUpperCase() : descricao });

    if (l.tipo === "etapa") {
      const fim = fimDoBloco(linhas, i);
      if (fim === i) {
        gravar(lin, 7, { t: "n", v: 0, z: FMT_MOEDA });
      } else {
        const valor = somaCentavos(
          linhas
            .slice(i + 1, fim + 1)
            .filter((x) => x.tipo !== "etapa")
            .map((x) => x.total)
        );
        gravar(lin, 7, {
          t: "n",
          v: valor,
          f: `SUBTOTAL(9,H${n + 1}:H${primeira + fim + 1})`,
          z: FMT_MOEDA,
        });
      }
      return;
    }

    if (l.unidade) gravar(lin, 4, { t: "s", v: String(l.unidade) });
    if (l.quantidade != null) gravar(lin, 5, { t: "n", v: l.quantidade, z: FMT_QTD });
    if (l.valorUnitario != null) gravar(lin, 6, { t: "n", v: l.valorUnitario, z: FMT_UNIT });
    const confere = totalLinha(l.quantidade, l.valorUnitario) === l.total;
    gravar(
      lin,
      7,
      confere
        ? { t: "n", v: l.total, f: `ROUND(F${n}*G${n},2)`, z: FMT_MOEDA }
        : { t: "n", v: l.total, z: FMT_MOEDA }
    );
  });
  pl.r = primeira + linhas.length;

  gravar(pl.r, 3, { t: "s", v: "VALOR GLOBAL DA PROPOSTA (R$)" });
  gravar(
    pl.r,
    7,
    linhas.length
      ? {
          t: "n",
          v: dados.totalGeral,
          f: `SUBTOTAL(9,H${primeira + 1}:H${primeira + linhas.length})`,
          z: FMT_MOEDA,
        }
      : { t: "n", v: dados.totalGeral, z: FMT_MOEDA }
  );
  pl.r += 2;
  linhaDeTexto(`Valor global por extenso: ${dados.totalExtenso}`);
  linhaDeTexto(dados.validade);
  linhaDeTexto(dados.localData);
  escreverAssinaturaPlanilha(pl, dados.representante);

  ws["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: Math.max(pl.r - 1, 0), c: 7 },
  });
  ws["!cols"] = [
    { wch: 10 },
    { wch: 12 },
    { wch: 10 },
    { wch: 70 },
    { wch: 8 },
    { wch: 12 },
    { wch: 16 },
    { wch: 18 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, ABA);
  return wb;
}

// -------------------------------------------------------------------- PDF

// Fontes padrão do PDF (helvetica) só têm WinAnsi: o jsPDF embaralha a linha
// inteira quando aparece outro caractere. Troca os comuns e o resto vira "?".
const EXTRAS_WINANSI = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
const TROCAS_PDF = { "≤": "<=", "≥": ">=", Ω: "ohm", "⌀": "Ø", "′": "'", "″": '"', "\t": " " };

export function textoPdf(valor) {
  return Array.from(String(valor ?? "").normalize("NFC"))
    .map((ch) => {
      if (TROCAS_PDF[ch] !== undefined) return TROCAS_PDF[ch];
      const c = ch.codePointAt(0);
      if (ch === "\n" || ch === "\r") return " ";
      if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || EXTRAS_WINANSI.includes(ch)) {
        return ch;
      }
      return "?";
    })
    .join("");
}

// --------------------------------------------------- layout em comum (PDF)
// Usado pela proposta e pelo cronograma físico-financeiro (lib/cronograma-export.js).

/** Espaço (mm) entre linhas de texto: o `entre` padrão do escritor. */
export const ENTRE_LINHAS_PDF = 4.2;
/** O escritor abre página nova quando a linha cairia abaixo de `alt - RODAPE_PDF` (mm). */
const RODAPE_PDF = 16;
/** Espaço (mm) entre o traço da assinatura e a primeira linha do representante. */
const ESPACO_TRACO_PDF = 5;

/**
 * Documento A4 paisagem e o escritor de linhas de texto: `doc`, `larg`, `alt`, `M` (margem),
 * `util` (largura útil), `y` (posição da próxima linha, em mm) e `escrever(texto, opcoes)`,
 * que avança o `y` e abre página nova perto do rodapé.
 */
export function criarPdf(jsPDF) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const larg = doc.internal.pageSize.getWidth();
  const alt = doc.internal.pageSize.getHeight();
  const M = 12;
  const pdf = {
    doc,
    larg,
    alt,
    M,
    util: larg - 2 * M,
    y: 14,
    escrever(
      texto,
      { tamanho = 9, negrito = false, alinhar = "left", entre = ENTRE_LINHAS_PDF } = {}
    ) {
      doc.setFont("helvetica", negrito ? "bold" : "normal");
      doc.setFontSize(tamanho);
      const partes = doc.splitTextToSize(textoPdf(texto), pdf.util);
      const x = alinhar === "center" ? larg / 2 : M;
      partes.forEach((p) => {
        if (pdf.y > alt - RODAPE_PDF) {
          doc.addPage();
          pdf.y = 14;
        }
        doc.text(p, x, pdf.y, { align: alinhar });
        pdf.y += entre;
      });
    },
  };
  return pdf;
}

/** Topo: empresa, título em maiúsculas e dados da licitação (`cab` = cabecalhoDoDocumento). */
export function escreverTopoPdf(pdf, cab, titulo) {
  cab.empresa.forEach((t, i) =>
    pdf.escrever(t, i === 0 ? { tamanho: 12, negrito: true, entre: 5.5 } : { tamanho: 8.5 })
  );
  pdf.y += 3;
  pdf.escrever(String(titulo).toUpperCase(), {
    tamanho: 13,
    negrito: true,
    alinhar: "center",
    entre: 7,
  });
  cab.licitacao.forEach((t) => pdf.escrever(t, { tamanho: 9 }));
  pdf.y += 2;
}

/** Altura (mm) que `escreverAssinaturaPdf` ocupa a partir do `y`, com o mesmo `espacoAntes`. */
export function alturaAssinaturaPdf(representante, { espacoAntes = 18 } = {}) {
  return espacoAntes + ESPACO_TRACO_PDF + linhasAssinatura(representante).length * ENTRE_LINHAS_PDF;
}

/**
 * Abre página nova se um bloco de `mm` de altura, a partir do `y`, não couber acima do
 * rodapé: o bloco inteiro vai para a página seguinte, em vez de se partir no meio.
 */
export function garantirEspaco(pdf, mm) {
  if (pdf.y + mm > pdf.alt - RODAPE_PDF) {
    pdf.doc.addPage();
    pdf.y = 20;
  }
}

/** Traço e linhas do representante; `espacoAntes` (mm) é o espaço para assinar. */
export function escreverAssinaturaPdf(pdf, representante, { espacoAntes = 18 } = {}) {
  pdf.y += espacoAntes;
  pdf.doc.setDrawColor(60);
  pdf.doc.setLineWidth(0.3);
  pdf.doc.line(pdf.larg / 2 - 45, pdf.y, pdf.larg / 2 + 45, pdf.y);
  pdf.y += ESPACO_TRACO_PDF;
  linhasAssinatura(representante).forEach((t, i) =>
    pdf.escrever(t, { tamanho: 9, negrito: i === 0, alinhar: "center" })
  );
}

/** Rodapé de todas as páginas: nome da empresa e "Página X de Y". */
export function numerarPaginasPdf(pdf, nomeEmpresa) {
  const { doc, larg, alt, M } = pdf;
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(textoPdf(nomeEmpresa || ""), M, alt - 7);
    doc.text(`Página ${p} de ${total}`, larg - M, alt - 7, { align: "right" });
    doc.setTextColor(0);
  }
}

const fmt = (v, min, max) =>
  v == null || v === ""
    ? ""
    : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: min, maximumFractionDigits: max });

/**
 * PDF da proposta (A4 paisagem). `jsPDF` e `autoTable` vêm de fora (import
 * dinâmico no navegador; import normal no teste).
 */
export function gerarPdfProposta(dados, { jsPDF, autoTable }) {
  const pdf = criarPdf(jsPDF);
  const { doc, M, alt, escrever } = pdf;
  escreverTopoPdf(pdf, cabecalhoDoDocumento(dados), dados.titulo || "Proposta de preços");

  const linhas = dados.linhas || [];
  autoTable(doc, {
    startY: pdf.y,
    head: [CABECALHO],
    body: linhas.map((l) => [
      textoPdf(l.numero),
      textoPdf(l.codigo),
      textoPdf(l.fonte),
      textoPdf(l.tipo === "etapa" ? String(l.descricao ?? "").toUpperCase() : l.descricao),
      textoPdf(l.unidade),
      fmt(l.quantidade, 2, 3),
      fmt(l.valorUnitario, 2, 4),
      fmt(l.total, 2, 2),
    ]),
    theme: "grid",
    margin: { left: M, right: M, bottom: 16 },
    styles: { font: "helvetica", fontSize: 7.5, cellPadding: 1.2, overflow: "linebreak" },
    headStyles: { fillColor: [226, 232, 240], textColor: 20, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 16 },
      1: { cellWidth: 18 },
      2: { cellWidth: 16 },
      3: { cellWidth: "auto" },
      4: { cellWidth: 12, halign: "center" },
      5: { cellWidth: 20, halign: "right" },
      6: { cellWidth: 26, halign: "right" },
      7: { cellWidth: 28, halign: "right" },
    },
    didParseCell: (data) => {
      if (data.section === "head" && data.column.index >= 4) {
        data.cell.styles.halign = data.column.index === 4 ? "center" : "right";
      }
      if (data.section === "body" && linhas[data.row.index]?.tipo === "etapa") {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [241, 245, 249];
      }
    },
  });

  pdf.y = (doc.lastAutoTable?.finalY ?? pdf.y) + 7;
  // bloco final (total, extenso, validade, local/data, assinatura) não se parte
  if (pdf.y > alt - 70) {
    doc.addPage();
    pdf.y = 20;
  }
  escrever(`Valor global da proposta: R$ ${fmt(dados.totalGeral, 2, 2)}`, {
    tamanho: 10,
    negrito: true,
    entre: 5,
  });
  escrever(`(${dados.totalExtenso})`, { tamanho: 9, entre: 4.5 });
  pdf.y += 2;
  escrever(dados.validade, { tamanho: 9 });
  if (dados.localData) escrever(dados.localData, { tamanho: 9 });

  escreverAssinaturaPdf(pdf, dados.representante);
  numerarPaginasPdf(pdf, dados.empresa?.nome);
  return doc;
}

// -------------------------------------------------------------- downloads

/**
 * jsPDF e jspdf-autotable carregados só no clique (import dinâmico). Também
 * usado pelo cronograma físico-financeiro (lib/cronograma-export.js).
 */
export async function carregarJsPdf() {
  const [{ jsPDF }, modAutoTable] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  // o pacote é UMD/CommonJS: conforme o empacotador, a função vem em
  // `default` ou em `default.default`
  const autoTable =
    typeof modAutoTable.default === "function"
      ? modAutoTable.default
      : modAutoTable.default?.default;
  if (typeof autoTable !== "function") throw new Error("jspdf-autotable não carregou");
  return { jsPDF, autoTable };
}

/** Gera e baixa o PDF. */
export async function baixarPropostaPdf(dados, nomeArquivo) {
  gerarPdfProposta(dados, await carregarJsPdf()).save(nomeArquivo);
}

/** Gera e baixa o Excel. */
export async function baixarPropostaExcel(dados, nomeArquivo) {
  XLSX.writeFile(montarPlanilhaProposta(dados), nomeArquivo);
}
