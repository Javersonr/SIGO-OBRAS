/**
 * PDF da declaração de habilitação (spec 2026-10-09 §3): A4 retrato, papel timbrado (logo opcional
 * e dados da empresa), título, destinatário e referência, parágrafos justificados, local e data, e
 * o bloco de assinatura do representante legal (o espaço onde entra a assinatura do gov.br).
 * jsPDF injetado, a mesma versão da tela. Puro.
 */
import {
  caixaDoLogo,
  linhasDaAssinatura,
  linhasDaEmpresa,
  type LogoDocumento,
} from "./declaracao-comum.ts";
import type { DadosDeclaracao } from "./declaracoes.ts";
import { textoPdf, type LibsDocumentos } from "./proposta-export.ts";

const MARGEM_ESQUERDA = 25;
const MARGEM_DIREITA = 20;
const TOPO = 18;
const RODAPE = 20;
/** mm por ponto. */
const MM_POR_PT = 0.3528;
const ENTRELINHA = 1.4;

/** Bloco de assinatura (mm): espaço antes de local e data, espaço para assinar (gov.br ou à mão) e respiro do traço. */
const ESPACO_ANTES_DO_LOCAL = 8;
const ESPACO_PARA_ASSINAR = 22;
const ESPACO_APOS_TRACO = 5;
/** Folga (mm) na conta do bloco, contra o erro de arredondamento da soma de alturas. */
const FOLGA = 0.01;
/** Espaço (mm) que fica depois de cada parágrafo (entre o último e o bloco de assinatura também). */
const ESPACO_ENTRE_PARAGRAFOS = 3;
/** A assinatura nunca fica sozinha na página: leva junto as duas últimas linhas do texto (ou a única, se for uma só). */
const LINHAS_DO_TEXTO_COM_A_ASSINATURA = 2;
/** Largura (mm) do rodapé que fica para "Página X de Y"; o nome da empresa usa o resto da linha. */
const LARGURA_DA_PAGINA_NO_RODAPE = 35;

export function gerarPdfDeclaracao(
  dados: DadosDeclaracao,
  libs: Pick<LibsDocumentos, "jsPDF">,
  logo: LogoDocumento | null = null
): unknown {
  const doc = new libs.jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const larg = doc.internal.pageSize.getWidth();
  const alt = doc.internal.pageSize.getHeight();
  const util = larg - MARGEM_ESQUERDA - MARGEM_DIREITA;
  const centro = MARGEM_ESQUERDA + util / 2;
  let y = TOPO;

  const alturaDaLinha = (tamanho: number) => tamanho * ENTRELINHA * MM_POR_PT;
  const novaPagina = () => {
    doc.addPage();
    y = TOPO + 4;
  };
  const cabe = (mm: number) => y + mm <= alt - RODAPE;

  /**
   * Linhas do texto na largura útil, com a fonte e o tamanho com que serão desenhadas (a medida depende deles).
   * Espaço no fim do texto faz o jsPDF devolver uma última linha em branco: ela não conta (senão a última
   * linha de verdade seria esticada na justificação e "as duas últimas linhas" incluiriam a em branco).
   */
  const quebrar = (texto: string, tamanho: number, negrito = false): string[] => {
    doc.setFont("helvetica", negrito ? "bold" : "normal");
    doc.setFontSize(tamanho);
    const linhas = doc.splitTextToSize(textoPdf(texto), util) as string[];
    while (linhas.length > 1 && linhas[linhas.length - 1].trim() === "") linhas.pop();
    return linhas;
  };

  /** Texto simples, linha a linha, com quebra de página. */
  const escrever = (
    texto: string,
    o: { tamanho?: number; negrito?: boolean; alinhar?: "left" | "center" } = {}
  ) => {
    const tamanho = o.tamanho ?? 11;
    for (const linha of quebrar(texto, tamanho, o.negrito)) {
      if (!cabe(alturaDaLinha(tamanho))) novaPagina();
      doc.text(linha, o.alinhar === "center" ? centro : MARGEM_ESQUERDA, y, {
        align: o.alinhar ?? "left",
      });
      y += alturaDaLinha(tamanho);
    }
  };

  /**
   * Parágrafo justificado, desenhado linha a linha (cada linha na sua posição, com quebra de página
   * entre elas): o jsPDF não quebra de novo o que já coube na largura nem sobrepõe a linha seguinte.
   * `reservaDepois` (mm), no último parágrafo do texto: o que vem depois dele (espaço e bloco de
   * assinatura). As últimas linhas do parágrafo só ficam na página se couberem junto dessa reserva;
   * senão passam para a página seguinte, e a assinatura não fica sozinha. A linha que passa a ser a
   * última antes da quebra continua justificada (não é a última do parágrafo).
   */
  const justificado = (texto: string, reservaDepois = 0) => {
    const tamanho = 11;
    const linhas = quebrar(texto, tamanho);
    const comAAssinatura = Math.min(LINHAS_DO_TEXTO_COM_A_ASSINATURA, linhas.length);
    const reserva = comAAssinatura * alturaDaLinha(tamanho) + reservaDepois + FOLGA;
    // Se nem uma página em branco comporta essas linhas e o bloco (assinatura absurda), não há o que
    // proteger: o parágrafo segue normal e só o bloco quebra, uma vez, antes de começar.
    const reservaCabeEmPaginaVazia = TOPO + 4 + reserva <= alt - RODAPE;
    linhas.forEach((linha, i) => {
      if (!cabe(alturaDaLinha(tamanho))) novaPagina();
      if (
        reservaDepois > 0 &&
        reservaCabeEmPaginaVazia &&
        i === linhas.length - comAAssinatura &&
        !cabe(reserva)
      )
        novaPagina();
      // O jsPDF só estica as linhas de uma lista, menos a última: [linha, ""] faz a linha valer como
      // não final (e o "" zera o espaçamento depois). Fica à esquerda, sem esticar: a última linha do
      // parágrafo; a linha de uma palavra só (não há espaço para esticar: a divisão por zero grava
      // "Infinity Tw" no PDF); e a linha que o jsPDF dividiria de novo em duas.
      const estica =
        i < linhas.length - 1 &&
        linha.trim().includes(" ") &&
        (doc.splitTextToSize(linha, util) as string[]).length === 1;
      if (estica) doc.text([linha, ""], MARGEM_ESQUERDA, y, { align: "justify", maxWidth: util });
      else doc.text(linha, MARGEM_ESQUERDA, y);
      y += alturaDaLinha(tamanho);
    });
  };

  // papel timbrado
  if (logo) {
    const { larguraMm: w, alturaMm: h } = caixaDoLogo(logo);
    try {
      doc.addImage(logo.bytes, logo.formato, MARGEM_ESQUERDA, y - 6, w, h);
      y += h;
    } catch (_e) {
      // logo ilegível: o documento sai sem ele
    }
  }
  linhasDaEmpresa(dados).forEach((t, i) =>
    escrever(t, i === 0 ? { tamanho: 12, negrito: true } : { tamanho: 8.5 })
  );
  doc.setDrawColor(128);
  doc.setLineWidth(0.3);
  doc.line(MARGEM_ESQUERDA, y - 1.5, MARGEM_ESQUERDA + util, y - 1.5);
  y += 14;

  escrever(String(dados.titulo).toUpperCase(), { tamanho: 13, negrito: true, alinhar: "center" });
  y += 8;
  if (dados.destinatario) escrever(dados.destinatario, { negrito: true });
  if (dados.referencia) escrever(dados.referencia);
  if (dados.destinatario || dados.referencia) y += 6;

  // Local e data + assinatura: o bloco inteiro (local e data, traço e linhas do representante) fica na
  // mesma página, e junto com as duas últimas linhas do texto. A altura do bloco é a que ele vai gastar
  // de verdade (as linhas que quebram em duas contam) e é conhecida ANTES de desenhar o texto, porque o
  // último parágrafo precisa dela para saber se a quebra de página deixaria a assinatura sozinha.
  const textoLocalData = dados.localData ? `${dados.localData}.` : "";
  const linhasAssinatura = linhasDaAssinatura(dados);
  const alturaDoBloco =
    ESPACO_ANTES_DO_LOCAL +
    (textoLocalData ? quebrar(textoLocalData, 11).length : 0) * alturaDaLinha(11) +
    ESPACO_PARA_ASSINAR +
    ESPACO_APOS_TRACO +
    linhasAssinatura.reduce((soma, t, i) => soma + quebrar(t, 10, i === 0).length, 0) *
      alturaDaLinha(10);

  dados.paragrafos.forEach((p, i) => {
    const ultimo = i === dados.paragrafos.length - 1;
    justificado(p, ultimo ? ESPACO_ENTRE_PARAGRAFOS + alturaDoBloco : 0);
    y += ESPACO_ENTRE_PARAGRAFOS;
  });

  // Defesa: com texto, o último parágrafo já deixou o bloco inteiro na página; sem texto (nenhum
  // parágrafo, ou um parágrafo sem linhas) ou com uma assinatura que nem uma página em branco
  // comporta, é aqui que o bloco quebra, uma vez, e depois só entre linhas.
  if (!cabe(alturaDoBloco + FOLGA)) novaPagina();
  y += ESPACO_ANTES_DO_LOCAL;
  if (textoLocalData) escrever(textoLocalData);
  y += ESPACO_PARA_ASSINAR;
  doc.setDrawColor(60);
  doc.setLineWidth(0.3);
  doc.line(centro - 45, y, centro + 45, y);
  y += ESPACO_APOS_TRACO;
  linhasAssinatura.forEach((t, i) =>
    escrever(t, { tamanho: 10, negrito: i === 0, alinhar: "center" })
  );

  // rodapé: empresa (cortada para caber ao lado de "Página X de Y") e o número da página
  const total = doc.getNumberOfPages();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const nomeNoRodape =
    (
      doc.splitTextToSize(
        textoPdf(dados.empresa.nome || ""),
        util - LARGURA_DA_PAGINA_NO_RODAPE
      ) as string[]
    )[0] ?? "";
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(nomeNoRodape, MARGEM_ESQUERDA, alt - 9);
    doc.text(`Página ${p} de ${total}`, MARGEM_ESQUERDA + util, alt - 9, { align: "right" });
    doc.setTextColor(0);
  }
  return doc;
}
