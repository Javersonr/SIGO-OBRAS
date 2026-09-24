/**
 * PDF do certificado EAD (frente + verso) a partir do registro emitido pelo
 * servidor (treinamento_certificado). Os dados vêm congelados no `dados` do
 * certificado — o PDF é só a apresentação; a prova é o código + hash, que
 * qualquer pessoa confere em /ValidarCertificado.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { QRCodeCanvas } from "qrcode.react";
import { urlPublica } from "@/lib/url-publica";

export const urlValidacao = (codigo) =>
  urlPublica(`/ValidarCertificado?codigo=${encodeURIComponent(codigo)}`);

const fmtData = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "—");
const fmtCpf = (cpf) => {
  const d = (cpf || "").replace(/\D/g, "");
  return d.length === 11
    ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
    : cpf || "—";
};
const fmtCnpj = (cnpj) => {
  const d = (cnpj || "").replace(/\D/g, "");
  return d.length === 14
    ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
    : cnpj || "";
};

async function qrPng(texto) {
  const div = document.createElement("div");
  div.style.cssText = "position:fixed;left:-9999px;top:0";
  document.body.appendChild(div);
  const root = createRoot(div);
  root.render(
    React.createElement(QRCodeCanvas, { value: texto, size: 240, level: "M", marginSize: 1 })
  );
  // o QRCodeCanvas desenha num efeito; espera o canvas ficar pronto
  let png = null;
  for (let i = 0; i < 20 && !png; i++) {
    await new Promise((r) => setTimeout(r, 25));
    const c = div.querySelector("canvas");
    if (c && c.width) png = c.toDataURL("image/png");
  }
  root.unmount();
  div.remove();
  return png;
}

/** Linhas do conteúdo programático: texto do curso ou aulas por módulo. */
function linhasConteudo(curso) {
  if (curso?.conteudo_programatico) {
    return curso.conteudo_programatico
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
  }
  const linhas = [];
  let moduloAtual = null;
  for (const a of curso?.aulas || []) {
    if (a.modulo && a.modulo !== moduloAtual) {
      moduloAtual = a.modulo;
      linhas.push(`# ${a.modulo}`);
    }
    linhas.push(`${a.modulo ? "   " : ""}• ${a.titulo}`);
  }
  return linhas;
}

/**
 * @param {object} cert { codigo, dados, assinatura_aluno, emitido_em, hash_sha256, revogado }
 * @param {{ logo?: {dataUrl, formato, w, h} }} [opcoes]
 */
export async function baixarCertificadoPdf(cert, opcoes = {}) {
  const { jsPDF } = await import("jspdf");
  const d = cert.dados || {};
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const W = 297;
  const H = 210;
  const url = urlValidacao(cert.codigo);
  const qr = await qrPng(url);

  const moldura = () => {
    doc.setDrawColor(30, 41, 59);
    doc.setLineWidth(1.2);
    doc.rect(8, 8, W - 16, H - 16);
    doc.setLineWidth(0.3);
    doc.rect(11, 11, W - 22, H - 22);
  };
  const rodape = () => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(`Código de autenticidade: ${cert.codigo}`, 18, H - 22);
    doc.text(`Confira em: ${url}`, 18, H - 17.5);
    doc.setFontSize(6);
    doc.text(`SHA-256: ${cert.hash_sha256 || ""}`, 18, H - 13.5);
    // alias "qr" = mesma imagem nas duas páginas (o jsPDF grava uma vez só)
    if (qr) doc.addImage(qr, "PNG", W - 44, H - 44, 28, 28, "qr", "FAST");
  };

  // ------------------------------------------------------------------ frente
  moldura();
  if (opcoes.logo?.dataUrl) {
    const h = 16;
    const w = Math.min(50, (opcoes.logo.w / opcoes.logo.h) * h || 40);
    doc.addImage(opcoes.logo.dataUrl, opcoes.logo.formato || "PNG", 18, 16, w, h);
  }
  if (cert.revogado) {
    doc.setTextColor(220, 38, 38);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("CERTIFICADO REVOGADO", W / 2, 20, { align: "center" });
  }
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(30);
  doc.text("CERTIFICADO", W / 2, 38, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(71, 85, 105);
  doc.text("de conclusão de treinamento", W / 2, 46, { align: "center" });

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(12.5);
  const corpo =
    `Certificamos que ${d.aluno?.nome || "—"}, CPF ${fmtCpf(d.aluno?.cpf)}, concluiu o treinamento ` +
    `"${d.curso?.nome || "—"}"${d.curso?.codigo ? ` (${d.curso.codigo})` : ""}, na modalidade ` +
    `${d.curso?.modalidade || "EAD"}, com carga horária de ${d.curso?.carga_horaria_horas || "—"} horas, ` +
    `no período de ${fmtData(d.periodo?.inicio)} a ${fmtData(d.periodo?.conclusao)}` +
    (d.avaliacao?.nota != null ? `, com aproveitamento de ${d.avaliacao.nota}% na avaliação` : "") +
    `, promovido por ${d.empresa?.nome || "—"}${d.empresa?.cnpj ? `, CNPJ ${fmtCnpj(d.empresa.cnpj)}` : ""}.`;
  doc.text(doc.splitTextToSize(corpo, W - 60), W / 2, 64, {
    align: "center",
    lineHeightFactor: 1.6,
  });
  if (d.periodo?.validade) {
    doc.setFontSize(10.5);
    doc.text(`Validade: até ${fmtData(d.periodo.validade)}`, W / 2, 104, { align: "center" });
  }

  // assinaturas
  const ass = cert.assinatura_aluno || {};
  const colunas = [
    {
      nome: d.aluno?.nome,
      papel: "Participante",
      extra: ass.assinado_em
        ? `Assinado eletronicamente em ${new Date(ass.assinado_em).toLocaleString("pt-BR")}`
        : "",
      extra2: ass.ip ? `IP ${ass.ip} · login pessoal` : "",
    },
    {
      nome: d.instrutor?.nome,
      papel: "Instrutor",
      extra: d.instrutor?.qualificacao || "",
    },
    {
      nome: d.responsavel_tecnico?.nome,
      papel: "Responsável técnico",
      extra: d.responsavel_tecnico?.registro || "",
    },
  ];
  const yLinha = 142;
  colunas.forEach((c, i) => {
    const x = 18 + (i + 0.5) * ((W - 36) / 3);
    doc.setDrawColor(100, 116, 139);
    doc.line(x - 36, yLinha, x + 36, yLinha);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text(doc.splitTextToSize(c.nome || "________________", 72)[0], x, yLinha + 5, {
      align: "center",
    });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(c.papel, x, yLinha + 9.5, { align: "center" });
    if (c.extra)
      doc.text(doc.splitTextToSize(c.extra, 76)[0], x, yLinha + 13.5, { align: "center" });
    if (c.extra2) doc.text(c.extra2, x, yLinha + 17.5, { align: "center" });
  });
  rodape();

  // ------------------------------------------------------------------- verso
  doc.addPage();
  moldura();
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("CONTEÚDO PROGRAMÁTICO", 18, 24);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `${d.curso?.nome || ""} · ${d.curso?.carga_horaria_horas || "—"} h · ${d.curso?.modalidade || "EAD"}`,
    18,
    30
  );

  // blocos = módulo + suas aulas; um módulo não é partido entre colunas
  const linhas = linhasConteudo(d.curso);
  const colunasVerso = linhas.length > 22 ? 2 : 1;
  const larguraCol = (W - 36 - 40) / colunasVerso;
  const blocos = [];
  for (const l of linhas) {
    if (l.startsWith("# ") || !blocos.length) blocos.push([]);
    blocos[blocos.length - 1].push(l);
  }
  const medir = (l) => {
    const titulo = l.startsWith("# ");
    doc.setFont("helvetica", titulo ? "bold" : "normal");
    doc.setFontSize(titulo ? 9.5 : 9);
    return doc.splitTextToSize(titulo ? l.slice(2) : l, larguraCol - 4);
  };
  const LINHA = 4.4;
  const LIMITE = H - 48;
  let col = 0;
  let y = 40;
  doc.setTextColor(15, 23, 42);
  for (const bloco of blocos) {
    const altura = bloco.reduce((s, l) => s + medir(l).length * LINHA + 0.6, 0);
    if (y + altura > LIMITE && y > 40 && col < colunasVerso - 1) {
      col++;
      y = 40;
    }
    for (const l of bloco) {
      const partes = medir(l);
      doc.text(partes, 18 + col * larguraCol, y);
      y += partes.length * LINHA + (l.startsWith("# ") ? 0.6 : 0);
    }
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(
    "Treinamento a distância com registro individual de acessos, atividades e avaliação (NR-1, item 1.7 e Anexo II).",
    18,
    H - 30
  );
  rodape();

  const nome = (d.aluno?.nome || "certificado").replace(/[^\p{L}\p{N}]+/gu, "_");
  doc.save(`Certificado_${nome}_${cert.codigo}.pdf`);
}
