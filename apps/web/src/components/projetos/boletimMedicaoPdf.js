import { jsPDF } from "jspdf";
import { calcularValoresMedicao } from "@/lib/medicao-calc";

// Gera o Boletim de Medição em PDF (cliente/CEMIG costumam exigir um documento
// por medição). Layout manual (padrão do projeto — sem jspdf-autotable).
// A matemática (medido → retenção → ISS → INSS → líquido) vem de
// calcularValoresMedicao (fonte única, espelha o backend).

const fmtBRL = (v) =>
  (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtPct = (v) => `${Number(v) || 0}%`;

const fmtComp = (d) => {
  if (!d) return "—";
  const dt = new Date(d + "T12:00:00");
  return dt.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
};

const fmtDataHora = (d) => {
  const dt = d ? new Date(d) : new Date();
  return dt.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

export function gerarBoletimMedicaoPDF(medicao, projeto, empresa) {
  const doc = new jsPDF();
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 15;
  const right = pageW - margin;

  const { faturada, medido, retPct, issPct, inssPct, retencao, iss, inss, liquido } =
    calcularValoresMedicao(medicao);

  // Cabeçalho
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageW, 26, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont(undefined, "bold");
  doc.text("BOLETIM DE MEDIÇÃO", margin, 13);
  doc.setFontSize(10);
  doc.setFont(undefined, "normal");
  doc.text(`Nº ${medicao?.numero ?? "—"}`, margin, 20);
  doc.text(`Emitido em ${fmtDataHora()}`, right, 20, { align: "right" });

  doc.setTextColor(0, 0, 0);
  let y = 36;

  // Prestador (empresa)
  doc.setFontSize(11);
  doc.setFont(undefined, "bold");
  doc.text(empresa?.nome || "Empresa", margin, y);
  doc.setFont(undefined, "normal");
  doc.setFontSize(9);
  if (empresa?.cnpj) {
    y += 5;
    doc.text(`CNPJ: ${empresa.cnpj}`, margin, y);
  }

  // Status (canto direito)
  doc.setFontSize(9);
  doc.setFont(undefined, "bold");
  doc.setTextColor(faturada ? 22 : 180, faturada ? 130 : 120, faturada ? 60 : 0);
  doc.text(faturada ? "FATURADA" : "PENDENTE DE FATURAMENTO", right, 36, { align: "right" });
  if (faturada && medicao?.data_faturamento) {
    doc.setTextColor(100, 100, 100);
    doc.setFont(undefined, "normal");
    doc.text(`em ${fmtDataHora(medicao.data_faturamento)}`, right, 41, { align: "right" });
  }
  doc.setTextColor(0, 0, 0);

  y += 9;
  doc.setDrawColor(220, 220, 220);
  doc.line(margin, y, right, y);
  y += 8;

  // Dados da obra
  const linha = (rotulo, valor) => {
    doc.setFont(undefined, "bold");
    doc.setFontSize(9);
    doc.text(rotulo, margin, y);
    doc.setFont(undefined, "normal");
    doc.text(String(valor ?? "—"), margin + 42, y);
    y += 6;
  };
  linha("Obra / Projeto:", projeto?.nome || projeto?.numero || "—");
  linha("Cliente:", projeto?.cliente_nome || "—");
  if (projeto?.valor_contrato) linha("Valor do contrato:", fmtBRL(projeto.valor_contrato));
  linha("Competência:", fmtComp(medicao?.competencia));
  linha("Avanço físico:", fmtPct(medicao?.percentual_fisico));

  y += 4;

  // Tabela de valores
  const tblX = margin;
  const tblW = right - margin;
  const rowH = 8;
  const valX = right - 2;

  const headerRow = () => {
    doc.setFillColor(241, 245, 249); // slate-100
    doc.rect(tblX, y, tblW, rowH, "F");
    doc.setFont(undefined, "bold");
    doc.setFontSize(9);
    doc.text("Descrição", tblX + 2, y + 5.5);
    doc.text("Valor", valX, y + 5.5, { align: "right" });
    y += rowH;
  };
  const valorRow = (desc, valor, opts = {}) => {
    doc.setFont(undefined, opts.bold ? "bold" : "normal");
    doc.setFontSize(opts.bold ? 11 : 9);
    if (opts.fill) {
      doc.setFillColor(opts.fill[0], opts.fill[1], opts.fill[2]);
      doc.rect(tblX, y, tblW, rowH + 1, "F");
    }
    doc.setTextColor(opts.color?.[0] ?? 0, opts.color?.[1] ?? 0, opts.color?.[2] ?? 0);
    doc.text(desc, tblX + 2, y + 5.5);
    doc.text(valor, valX, y + 5.5, { align: "right" });
    doc.setTextColor(0, 0, 0);
    y += rowH + (opts.bold ? 1 : 0);
  };

  headerRow();
  valorRow("Valor medido no período", fmtBRL(medido));
  if (retencao > 0 || retPct > 0)
    valorRow(`(-) Retenção contratual (${fmtPct(retPct)})`, `- ${fmtBRL(retencao)}`);
  if (iss > 0 || issPct > 0) valorRow(`(-) ISS (${fmtPct(issPct)})`, `- ${fmtBRL(iss)}`);
  if (inss > 0 || inssPct > 0) valorRow(`(-) INSS (${fmtPct(inssPct)})`, `- ${fmtBRL(inss)}`);
  doc.setDrawColor(200, 200, 200);
  doc.line(tblX, y, right, y);
  y += 1;
  valorRow("= Líquido a faturar", fmtBRL(liquido), {
    bold: true,
    fill: [236, 253, 245], // emerald-50
    color: [6, 95, 70],
  });

  // borda externa da tabela
  doc.setDrawColor(220, 220, 220);

  y += 10;

  // Observações
  if (medicao?.observacoes) {
    doc.setFont(undefined, "bold");
    doc.setFontSize(9);
    doc.text("Observações:", margin, y);
    y += 5;
    doc.setFont(undefined, "normal");
    const linhas = doc.splitTextToSize(medicao.observacoes, tblW);
    doc.text(linhas, margin, y);
    y += linhas.length * 5 + 4;
  }

  // Nota da retenção
  if (retencao > 0) {
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(
      `A retenção (caução) de ${fmtBRL(retencao)} fica retida e será liberada conforme contrato.`,
      margin,
      y
    );
    doc.setTextColor(0, 0, 0);
    y += 8;
  }

  // Assinaturas
  y = Math.max(y, 240);
  const colW = (right - margin - 10) / 2;
  doc.setDrawColor(120, 120, 120);
  doc.line(margin, y, margin + colW, y);
  doc.line(margin + colW + 10, y, right, y);
  doc.setFontSize(8);
  doc.text("Responsável / Prestador", margin, y + 5);
  doc.text("Fiscal / Cliente", margin + colW + 10, y + 5);

  const nomeArq = `Boletim_Medicao_${medicao?.numero ?? ""}_${(projeto?.nome || "obra")
    .replace(/[^\w]+/g, "_")
    .slice(0, 30)}.pdf`;
  doc.save(nomeArq);
}
