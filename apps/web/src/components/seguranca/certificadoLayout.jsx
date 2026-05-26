import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const NAVY = [15, 40, 85];
const GOLD = [196, 155, 50];

export const loadImage = (url) =>
  new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });

export const parseInstrutor = (instrutor_nome, instrutor_cpf) => {
  try {
    const parsed = JSON.parse(instrutor_nome);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed[0];
  } catch {}
  return { nome: instrutor_nome || "", cpf: instrutor_cpf || "", formacao: "" };
};

export const parseDate = (dateStr) => (dateStr ? new Date(dateStr + "T00:00:00") : null);

async function addLogoWatermark(doc, empresaAtiva, W, H) {
  if (!empresaAtiva?.logo_url) return;
  const img = await loadImage(empresaAtiva.logo_url);
  if (!img) return;
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  ctx.globalAlpha = 0.15;
  ctx.drawImage(img, 0, 0);
  doc.addImage(canvas.toDataURL("image/png"), "PNG", (W - 70) / 2, (H - 70) / 2, 70, 70);
}

async function desenharPaginaCertificado(
  doc,
  W,
  H,
  treinamento,
  funcionario,
  empresaAtiva,
  datasEditadas
) {
  // Fundo branco
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, W, H, "F");

  // === FORMA AZUL SUPERIOR (reduzida) ===
  // Altura reduzida de 72 para 35 mm
  doc.setFillColor(...NAVY);
  doc.lines(
    [
      [W, 0],
      [0, 25],
      [-(W - 100), 10],
      [-100, 0],
    ],
    0,
    0,
    [1, 1],
    "F",
    true
  );

  // === FORMA AZUL INFERIOR (reduzida) ===
  // Altura reduzida de 48 para 25 mm
  doc.setFillColor(...NAVY);
  doc.lines(
    [
      [W, 0],
      [0, -24],
      [-(W - 100), -10],
      [-100, 12],
    ],
    0,
    H,
    [1, 1],
    "F",
    true
  );

  // === FAIXAS DOURADAS (bordas das formas) ===
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(3);
  doc.line(0, 35, 100, 35);
  doc.line(100, 35, W, 25);
  doc.line(0, H - 24, 100, H - 12);
  doc.line(100, H - 12, W, H - 24);

  // Linhas douradas finas no topo e fundo
  doc.setLineWidth(1);
  doc.line(0, 3.5, W, 3.5);
  doc.line(0, H - 3.5, W, H - 3.5);

  // === LOGO MARCA D'ÁGUA ===
  await addLogoWatermark(doc, empresaAtiva, W, H);

  // === TEXTOS ===
  const nomeEmpresa = empresaAtiva.razao_social || empresaAtiva.nome_fantasia || empresaAtiva.nome;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(140, 140, 140);
  doc.text("ESTE CERTIFICADO ORGULHA-SE DE EMITIR", W / 2, 48, { align: "center" });

  doc.setFontSize(42);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...GOLD);
  doc.text("CERTIFICADO", W / 2, 62, { align: "center" });

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(50, 50, 50);
  doc.text("\u2014\u2014  DE PARTICIPAÇÃO  \u2014\u2014", W / 2, 70, { align: "center" });

  doc.setFontSize(10);
  doc.setTextColor(110, 110, 110);
  doc.text(`${nomeEmpresa} confere a:`, W / 2, 77, { align: "center" });

  doc.setFontSize(28);
  doc.setFont("times", "italic");
  doc.setTextColor(...NAVY);
  doc.text(funcionario.nome_completo, W / 2, 91, { align: "center" });

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text(`CPF: ${funcionario.cpf || ""}`, W / 2, 98, { align: "center" });

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(40, 40, 40);
  const textoT = `${treinamento.codigo ? treinamento.codigo + " – " : ""}${treinamento.nome.toUpperCase()}`;
  const linhasT = doc.splitTextToSize(textoT, 195);
  let y = 107;
  linhasT.forEach((l) => {
    doc.text(l, W / 2, y, { align: "center" });
    y += 6;
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(70, 70, 70);
  const aproveitamento = datasEditadas?.aproveitamento || treinamento.aproveitamento || 100;
  const cargaHoraria = treinamento.carga_horaria || 0;
  y += 2;
  doc.text(
    `Aproveitamento: ${aproveitamento}%  |  Carga Horária: ${cargaHoraria} horas/aula`,
    W / 2,
    y,
    { align: "center" }
  );

  y += 6;
  const dataInicioPDF = datasEditadas?.data_inicio || treinamento.data_inicio;
  const dataFimPDF = datasEditadas?.data_fim || treinamento.data_fim;
  if (dataInicioPDF && dataFimPDF) {
    const di = format(new Date(dataInicioPDF + "T00:00:00"), "dd/MM/yyyy");
    const df = format(new Date(dataFimPDF + "T00:00:00"), "dd/MM/yyyy");
    doc.setFontSize(10);
    doc.text(`Período: ${di} a ${df}`, W / 2, y, { align: "center" });
  } else {
    doc.setFontSize(10);
    doc.text(`Data: ${format(new Date(), "dd/MM/yyyy")}`, W / 2, y, { align: "center" });
  }

  y += 6;
  const localEmpresa =
    empresaAtiva.cidade && empresaAtiva.estado
      ? `${empresaAtiva.cidade} – ${empresaAtiva.estado}`
      : "";
  const dataPorExtenso = format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  doc.setFontSize(9);
  doc.setTextColor(110, 110, 110);
  doc.text(localEmpresa ? `${localEmpresa}, ${dataPorExtenso}` : dataPorExtenso, W / 2, y, {
    align: "center",
  });

  // === ASSINATURAS (na parte branca, acima da área azul inferior) ===
  const yAssin = H - 55;
  const largura = 50;
  const instrutorPDF = parseInstrutor(treinamento.instrutor_nome, treinamento.instrutor_cpf);

  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");

  // Assinatura 1 - Instrutor (esquerda)
  const xA1 = 58;
  if (treinamento.instrutor_assinatura_url) {
    const img = await loadImage(treinamento.instrutor_assinatura_url);
    if (img) {
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      c.getContext("2d").drawImage(img, 0, 0);
      doc.addImage(c.toDataURL("image/png"), "PNG", xA1 - largura / 2, yAssin - 11, largura, 11);
    }
  }
  doc.setDrawColor(100, 100, 100);
  doc.setLineWidth(0.5);
  doc.line(xA1 - largura / 2, yAssin, xA1 + largura / 2, yAssin);
  doc.setTextColor(50, 50, 50);
  doc.text(instrutorPDF.nome || "_____________________", xA1, yAssin + 5, { align: "center" });
  doc.text("Instrutor", xA1, yAssin + 9, { align: "center" });
  if (instrutorPDF.cpf) doc.text(`CPF: ${instrutorPDF.cpf}`, xA1, yAssin + 13, { align: "center" });

  // Assinatura 2 - Aluno (centro)
  const xA2 = W / 2;
  doc.setDrawColor(100, 100, 100);
  doc.line(xA2 - largura / 2, yAssin, xA2 + largura / 2, yAssin);
  doc.setTextColor(50, 50, 50);
  doc.text(funcionario.nome_completo, xA2, yAssin + 5, { align: "center" });
  doc.text("Aluno", xA2, yAssin + 9, { align: "center" });
  doc.text(`CPF: ${funcionario.cpf || ""}`, xA2, yAssin + 13, { align: "center" });

  // Assinatura 3 - Responsável Técnico (direita)
  const xA3 = W - 58;
  const assinaturaUrl =
    treinamento.responsavel_tecnico_assinatura_url ||
    treinamento.engenheiro_responsavel_assinatura_url;
  if (assinaturaUrl) {
    const img = await loadImage(assinaturaUrl);
    if (img) {
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      c.getContext("2d").drawImage(img, 0, 0);
      doc.addImage(c.toDataURL("image/png"), "PNG", xA3 - largura / 2, yAssin - 11, largura, 11);
    }
  }
  doc.setDrawColor(100, 100, 100);
  doc.line(xA3 - largura / 2, yAssin, xA3 + largura / 2, yAssin);
  doc.setTextColor(50, 50, 50);
  doc.text(
    treinamento.responsavel_tecnico_nome ||
      treinamento.engenheiro_responsavel_nome ||
      "_____________________",
    xA3,
    yAssin + 5,
    { align: "center" }
  );
  doc.text("Responsável Técnico Empresa", xA3, yAssin + 9, { align: "center" });
  if (treinamento.responsavel_tecnico_criacao || treinamento.engenheiro_responsavel_crea) {
    doc.text(
      `CREA: ${treinamento.responsavel_tecnico_criacao || treinamento.engenheiro_responsavel_crea}`,
      xA3,
      yAssin + 13,
      { align: "center" }
    );
  }
}

async function desenharPaginaConteudo(doc, W, H, treinamento, empresaAtiva) {
  const barraWidth = 35;
  const NAVY_R = NAVY[0],
    NAVY_G = NAVY[1],
    NAVY_B = NAVY[2];

  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, W, H, "F");

  // Barra lateral azul
  for (let i = 0; i < barraWidth; i++) {
    const t = i / barraWidth;
    const r = Math.round(NAVY_R + t * 20);
    const g = Math.round(NAVY_G + t * 30);
    const b = Math.round(NAVY_B + t * 50);
    doc.setFillColor(r, g, b);
    doc.rect(i, 0, 1, H, "F");
  }

  // Linha dourada à direita da barra
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(2.5);
  doc.line(barraWidth, 0, barraWidth, H);

  await addLogoWatermark(doc, empresaAtiva, W, H);

  const margemEsq = barraWidth + 12;
  const colWidth = (W - margemEsq - 12) / 2;

  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...GOLD);
  doc.text("Conteúdo Programático", margemEsq, 20);

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...NAVY);
  doc.text(treinamento.nome, margemEsq, 30);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);
  let yInfo = 37;
  if (treinamento.codigo) {
    doc.text(`Código: ${treinamento.codigo}`, margemEsq, yInfo);
    yInfo += 5;
  }
  if (treinamento.carga_horaria) {
    doc.text(`Carga Horária: ${treinamento.carga_horaria}h`, margemEsq, yInfo);
    yInfo += 5;
  }

  doc.setDrawColor(...GOLD);
  doc.setLineWidth(1);
  doc.line(margemEsq, yInfo + 2, W - 10, yInfo + 2);
  yInfo += 8;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(40, 40, 40);
  const linhasConteudo = doc.splitTextToSize(treinamento.conteudo_programatico, colWidth - 5);
  const alturaUtil = H - yInfo - 10;
  const linhasPorCol = Math.floor(alturaUtil / 5);

  linhasConteudo.slice(0, linhasPorCol).forEach((linha, i) => {
    doc.text(linha, margemEsq, yInfo + i * 5);
  });

  const xCol2 = margemEsq + colWidth + 7;
  linhasConteudo.slice(linhasPorCol, linhasPorCol * 2).forEach((linha, i) => {
    doc.text(linha, xCol2, yInfo + i * 5);
  });

  const restante = linhasConteudo.slice(linhasPorCol * 2);
  if (restante.length > 0) {
    doc.addPage("a4", "landscape");
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, W, H, "F");
    for (let i = 0; i < barraWidth; i++) {
      const t = i / barraWidth;
      doc.setFillColor(
        Math.round(NAVY_R + t * 20),
        Math.round(NAVY_G + t * 30),
        Math.round(NAVY_B + t * 50)
      );
      doc.rect(i, 0, 1, H, "F");
    }
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(2.5);
    doc.line(barraWidth, 0, barraWidth, H);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(40, 40, 40);
    let yR = 15;
    restante.forEach((linha) => {
      doc.text(linha, margemEsq, yR);
      yR += 5;
    });
  }
}

/**
 * Gera o PDF do certificado e retorna o objeto jsPDF.
 */
export async function gerarCertificadoDoc({
  treinamento,
  funcionario,
  empresaAtiva,
  datasEditadas = {},
}) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  await desenharPaginaCertificado(doc, W, H, treinamento, funcionario, empresaAtiva, datasEditadas);

  if (treinamento.conteudo_programatico) {
    doc.addPage("a4", "landscape");
    await desenharPaginaConteudo(doc, W, H, treinamento, empresaAtiva);
  }

  return doc;
}
