import React from "react";
import { Button } from "@/components/ui/button";
import { Download, FileSpreadsheet } from "lucide-react";

export function exportarCSV(colunas, linhas, nomeArquivo) {
  const csv = [colunas, ...linhas]
    .map((row) => row.map((c) => `"${c ?? ""}"`).join(";"))
    .join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${nomeArquivo}_${new Date().toISOString().split("T")[0]}.csv`;
  link.click();
}

export async function exportarPDF(titulo, colunas, linhas, nomeArquivo) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: linhas.length > 5 ? "landscape" : "portrait" });

  doc.setFillColor(245, 158, 11);
  doc.rect(0, 0, doc.internal.pageSize.width, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont(undefined, "bold");
  doc.text(titulo, 14, 14);

  doc.setFontSize(8);
  doc.setFont(undefined, "normal");
  doc.text(
    `Gerado em: ${new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}`,
    doc.internal.pageSize.width - 14,
    14,
    { align: "right" }
  );

  const colW = (doc.internal.pageSize.width - 28) / colunas.length;
  let y = 32;

  // Header
  doc.setFillColor(241, 245, 249);
  doc.rect(14, y - 5, doc.internal.pageSize.width - 28, 8, "F");
  doc.setTextColor(71, 85, 105);
  doc.setFontSize(8);
  doc.setFont(undefined, "bold");
  colunas.forEach((col, i) => doc.text(String(col), 14 + i * colW, y));
  y += 8;

  doc.setFont(undefined, "normal");
  doc.setTextColor(30, 41, 59);
  linhas.forEach((row, ri) => {
    if (y > doc.internal.pageSize.height - 20) {
      doc.addPage();
      y = 20;
    }
    if (ri % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(14, y - 5, doc.internal.pageSize.width - 28, 8, "F");
    }
    row.forEach((cell, i) => doc.text(String(cell ?? ""), 14 + i * colW, y));
    y += 8;
  });

  doc.save(`${nomeArquivo}_${new Date().toISOString().split("T")[0]}.pdf`);
}

export default function ExportButtons({ onCSV, onPDF, loading }) {
  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={onCSV} disabled={loading}>
        <FileSpreadsheet className="w-4 h-4 mr-1.5" />
        Excel
      </Button>
      <Button variant="outline" size="sm" onClick={onPDF} disabled={loading}>
        <Download className="w-4 h-4 mr-1.5" />
        PDF
      </Button>
    </div>
  );
}
