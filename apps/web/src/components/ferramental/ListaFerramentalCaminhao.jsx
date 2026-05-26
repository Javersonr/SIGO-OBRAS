import { jsPDF } from "jspdf";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export const gerarListaFerramentalCaminhao = (caminhao, ferramentas, empresa) => {
  const doc = new jsPDF({ orientation: "landscape" });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 12;

  // ── Cabeçalho ──────────────────────────────────────────────────────────────
  doc.setFillColor(30, 41, 59); // slate-800
  doc.rect(0, 0, pageW, 28, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont(undefined, "bold");
  doc.text("LISTA DE FERRAMENTAL", margin, 11);

  doc.setFontSize(10);
  doc.setFont(undefined, "normal");
  doc.text(`Veículo / Local: ${caminhao}`, margin, 18);

  // Empresa + data no canto direito
  doc.setFontSize(8);
  const nomeEmpresa = empresa?.razao_social || empresa?.nome || "";
  doc.text(nomeEmpresa, pageW - margin, 11, { align: "right" });
  doc.text(
    `Emitido em: ${format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR })}`,
    pageW - margin,
    18,
    { align: "right" }
  );

  // ── Linha separadora ───────────────────────────────────────────────────────
  let y = 34;

  // ── Resumo rápido ──────────────────────────────────────────────────────────
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(8);
  doc.setFont(undefined, "normal");
  const total = ferramentas.length;
  const valorTotal = ferramentas.reduce((s, f) => s + (f.valor_unitario || 0), 0);
  const disponiveis = ferramentas.filter((f) => f.status === "Disponível").length;

  doc.text(
    `Total de itens: ${total}   |   Disponíveis: ${disponiveis}   |   Valor total: R$ ${valorTotal.toFixed(2)}`,
    margin,
    y
  );
  y += 8;

  // ── Cabeçalho da tabela ────────────────────────────────────────────────────
  const cols = [
    { label: "Código", x: margin, w: 32 },
    { label: "Descrição", x: margin + 32, w: 68 },
    { label: "Marca", x: margin + 100, w: 28 },
    { label: "N° de Série", x: margin + 128, w: 34 },
    { label: "N° Laudo", x: margin + 162, w: 28 },
    { label: "Venc. Laudo", x: margin + 190, w: 28 },
    { label: "Status", x: margin + 218, w: 26 },
    { label: "Valor", x: margin + 244, w: 24 },
  ];

  const rowH = 7;
  const headerH = 8;

  doc.setFillColor(245, 158, 11); // amber-500
  doc.rect(margin, y, pageW - margin * 2, headerH, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7.5);
  doc.setFont(undefined, "bold");
  cols.forEach((col) => {
    doc.text(col.label, col.x + 1, y + 5.5);
  });

  y += headerH;

  // ── Linhas de dados ────────────────────────────────────────────────────────
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  ferramentas.forEach((ferr, idx) => {
    // Nova página se necessário
    if (y + rowH > pageH - 20) {
      doc.addPage({ orientation: "landscape" });
      y = 12;

      // Re-desenhar cabeçalho da tabela
      doc.setFillColor(245, 158, 11);
      doc.rect(margin, y, pageW - margin * 2, headerH, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(7.5);
      doc.setFont(undefined, "bold");
      cols.forEach((col) => doc.text(col.label, col.x + 1, y + 5.5));
      y += headerH;
    }

    // Fundo alternado
    if (idx % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y, pageW - margin * 2, rowH, "F");
    }

    // Verificar se laudo vencido ou a vencer em 30 dias
    let alertaLaudo = false;
    let vencido = false;
    if (ferr.data_vencimento_laudo) {
      const dataVenc = new Date(ferr.data_vencimento_laudo);
      const em30dias = new Date(hoje.getTime() + 30 * 24 * 60 * 60 * 1000);
      if (dataVenc < hoje) {
        vencido = true;
        doc.setFillColor(254, 226, 226); // red-100
        doc.rect(margin, y, pageW - margin * 2, rowH, "F");
      } else if (dataVenc <= em30dias) {
        alertaLaudo = true;
        doc.setFillColor(255, 251, 235); // yellow-50
        doc.rect(margin, y, pageW - margin * 2, rowH, "F");
      }
    }

    doc.setTextColor(30, 41, 59);
    doc.setFontSize(7);
    doc.setFont(undefined, "normal");

    const truncate = (str, maxLen) => {
      if (!str) return "-";
      return str.length > maxLen ? str.substring(0, maxLen - 1) + "…" : str;
    };

    doc.text(truncate(ferr.codigo, 14), cols[0].x + 1, y + 4.8);
    doc.text(truncate(ferr.descricao, 32), cols[1].x + 1, y + 4.8);
    doc.text(truncate(ferr.marca, 13), cols[2].x + 1, y + 4.8);
    doc.text(truncate(ferr.numero_serie, 16), cols[3].x + 1, y + 4.8);
    doc.text(truncate(ferr.numero_laudo, 13), cols[4].x + 1, y + 4.8);

    // Vencimento com cor de alerta
    if (ferr.data_vencimento_laudo) {
      if (vencido) doc.setTextColor(220, 38, 38);
      else if (alertaLaudo) doc.setTextColor(217, 119, 6);
      doc.text(format(new Date(ferr.data_vencimento_laudo), "dd/MM/yyyy"), cols[5].x + 1, y + 4.8);
      doc.setTextColor(30, 41, 59);
    } else {
      doc.text("-", cols[5].x + 1, y + 4.8);
    }

    doc.text(truncate(ferr.status, 12), cols[6].x + 1, y + 4.8);
    doc.text(`R$ ${(ferr.valor_unitario || 0).toFixed(0)}`, cols[7].x + 1, y + 4.8);

    // Linha divisória
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y + rowH, pageW - margin, y + rowH);

    y += rowH;
  });

  // ── Rodapé ──────────────────────────────────────────────────────────────────
  y += 10;
  if (y > pageH - 30) {
    doc.addPage({ orientation: "landscape" });
    y = 20;
  }

  doc.setDrawColor(203, 213, 225);
  doc.line(margin, y, pageW - margin, y);
  y += 8;

  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text("Responsável pelo Veículo / Local", margin + 30, y, { align: "center" });
  doc.text("Conferido por", pageW / 2, y, { align: "center" });
  doc.text("Aprovado por", pageW - margin - 30, y, { align: "center" });

  y += 14;
  doc.setDrawColor(148, 163, 184);
  doc.line(margin, y, margin + 60, y);
  doc.line(pageW / 2 - 30, y, pageW / 2 + 30, y);
  doc.line(pageW - margin - 60, y, pageW - margin, y);

  // Legenda
  y += 8;
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.setFillColor(254, 226, 226);
  doc.rect(margin, y - 3.5, 5, 4, "F");
  doc.text("Laudo vencido", margin + 6, y);
  doc.setFillColor(255, 251, 235);
  doc.rect(margin + 35, y - 3.5, 5, 4, "F");
  doc.text("Vence em 30 dias", margin + 41, y);

  const nomeArquivo = `lista_ferramental_${caminhao.replace(/\s+/g, "_")}_${format(new Date(), "ddMMyyyy")}`;
  doc.save(`${nomeArquivo}.pdf`);
};
