/**
 * PDF da declaração de habilitação (spec 2026-10-09 §3): A4 retrato, papel timbrado (logo opcional
 * e dados da empresa), título, destinatário e referência, parágrafos justificados, local e data, e
 * o bloco de assinatura do representante legal (o espaço onde entra a assinatura do gov.br).
 * jsPDF injetado, a mesma versão da tela. Puro.
 */
import type { DadosDeclaracao } from "./declaracoes.ts";
import { LOGO_ALTURA_MM, LOGO_LARGURA_MM, type LogoDocumento } from "./declaracao-docx.ts";
import { textoPdf, type LibsDocumentos } from "./proposta-export.ts";

const MARGEM_ESQUERDA = 25;
const MARGEM_DIREITA = 20;
const TOPO = 18;
const RODAPE = 20;
/** mm por ponto. */
const MM_POR_PT = 0.3528;
const ENTRELINHA = 1.4;

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

  /** Texto simples, linha a linha, com quebra de página. */
  const escrever = (
    texto: string,
    o: { tamanho?: number; negrito?: boolean; alinhar?: "left" | "center" } = {}
  ) => {
    const tamanho = o.tamanho ?? 11;
    doc.setFont("helvetica", o.negrito ? "bold" : "normal");
    doc.setFontSize(tamanho);
    for (const linha of doc.splitTextToSize(textoPdf(texto), util) as string[]) {
      if (!cabe(alturaDaLinha(tamanho))) novaPagina();
      doc.text(linha, o.alinhar === "center" ? centro : MARGEM_ESQUERDA, y, {
        align: o.alinhar ?? "left",
      });
      y += alturaDaLinha(tamanho);
    }
  };

  /** Parágrafo justificado; o que não cabe na página segue na próxima. */
  const justificado = (texto: string) => {
    const tamanho = 11;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(tamanho);
    let linhas = doc.splitTextToSize(textoPdf(texto), util) as string[];
    while (linhas.length) {
      let cabem = Math.floor((alt - RODAPE - y) / alturaDaLinha(tamanho));
      if (cabem < 1) {
        novaPagina();
        cabem = Math.floor((alt - RODAPE - y) / alturaDaLinha(tamanho));
      }
      const agora = linhas.slice(0, cabem);
      doc.text(agora.join(" "), MARGEM_ESQUERDA, y, {
        maxWidth: util,
        align: "justify",
        lineHeightFactor: ENTRELINHA,
      });
      y += agora.length * alturaDaLinha(tamanho);
      linhas = linhas.slice(cabem);
    }
  };

  // papel timbrado
  if (logo) {
    const escala = Math.min(LOGO_LARGURA_MM / logo.largura, LOGO_ALTURA_MM / logo.altura);
    const w = logo.largura * escala;
    const h = logo.altura * escala;
    try {
      doc.addImage(logo.bytes, logo.formato, MARGEM_ESQUERDA, y - 6, w, h);
      y += h;
    } catch (_e) {
      // logo ilegível: o documento sai sem ele
    }
  }
  const linhasEmpresa = [
    dados.empresa.nome,
    dados.empresa.cnpj ? `CNPJ: ${dados.empresa.cnpj}` : "",
    dados.empresa.endereco,
    dados.empresa.contato,
  ].filter(Boolean);
  linhasEmpresa.forEach((t, i) =>
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

  for (const p of dados.paragrafos) {
    justificado(p);
    y += 3;
  }

  // local e data + assinatura: o bloco não se parte
  const linhasAssinatura = [
    dados.representante.nome,
    dados.representante.cargo,
    dados.representante.cpf ? `CPF: ${dados.representante.cpf}` : "",
    dados.empresa.nome,
  ].filter(Boolean);
  const alturaDoBloco = 10 + 6 + 22 + linhasAssinatura.length * alturaDaLinha(10);
  if (!cabe(alturaDoBloco)) novaPagina();
  y += 8;
  if (dados.localData) escrever(`${dados.localData}.`);
  y += 22; // espaço para assinar (gov.br ou à mão)
  doc.setDrawColor(60);
  doc.setLineWidth(0.3);
  doc.line(centro - 45, y, centro + 45, y);
  y += 5;
  linhasAssinatura.forEach((t, i) =>
    escrever(t, { tamanho: 10, negrito: i === 0, alinhar: "center" })
  );

  // rodapé: empresa e "Página X de Y"
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(textoPdf(dados.empresa.nome || ""), MARGEM_ESQUERDA, alt - 9);
    doc.text(`Página ${p} de ${total}`, MARGEM_ESQUERDA + util, alt - 9, { align: "right" });
    doc.setTextColor(0);
  }
  return doc;
}
