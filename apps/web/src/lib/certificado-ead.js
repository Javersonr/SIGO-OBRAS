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
import { dataHoraBrasilia } from "@/lib/data-brasilia";
import { formatoDaImagem, posicaoDaAssinatura } from "@/lib/ead-assinatura";
import { linhasDoTipoNoCertificado } from "@/lib/ead-tipo-matricula";
import {
  ErroCertificado,
  MSG_QR_FALHOU,
  MSG_SEM_BIBLIOTECA_PDF,
  aguardarResultado,
  pngDoQrSePronto,
} from "@/lib/certificado-ead-falhas";

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

/**
 * PNG (data URL) do QR, ou null se não ficou pronto em ~3 s. O QRCodeCanvas só desenha num efeito
 * do React, depois de criar o canvas; a conferência de "já foi desenhado" (sem ela saía um QR em
 * branco) é `pngDoQrSePronto`, em certificado-ead-falhas.js, com teste.
 */
async function qrPng(texto) {
  const div = document.createElement("div");
  div.style.cssText = "position:fixed;left:-9999px;top:0";
  document.body.appendChild(div);
  const root = createRoot(div);
  try {
    root.render(
      React.createElement(QRCodeCanvas, { value: texto, size: 240, level: "M", marginSize: 1 })
    );
    return await aguardarResultado(() => pngDoQrSePronto(div.querySelector("canvas")));
  } finally {
    root.unmount();
    div.remove();
  }
}

/**
 * A linha "Local de realização" da frente. No EAD, o ambiente gravado (a plataforma e o endereço). No semipresencial
 * (T12, `local.pratica`), a teoria na plataforma (só o nome, sem a URL, que o QR e o rodapé já levam) e o local da
 * prática presencial.
 */
export function textoDoLocal(local) {
  if (!local?.pratica) return `Local de realização: ${local?.ambiente ?? ""}`;
  const plataforma = String(local.ambiente ?? "").split(" — ")[0];
  return `Local de realização: teoria a distância na ${plataforma}; prática presencial em ${local.pratica}`;
}

const fmtHoras = (h) => `${String(Math.round((Number(h) || 0) * 100) / 100).replace(".", ",")} h`;

/** O texto da parte prática no verso do certificado semipresencial (T12), a partir de `dados.pratica`. */
export function textoDaPraticaNoVerso(pratica) {
  if (!pratica) return null;
  const horario =
    pratica.hora_inicio && pratica.hora_fim
      ? `, das ${pratica.hora_inicio} às ${pratica.hora_fim}`
      : "";
  const carga = Number(pratica.carga_horas) > 0 ? ` (${fmtHoras(pratica.carga_horas)})` : "";
  const instrutor = pratica.instrutor?.nome
    ? ` Instrutor: ${pratica.instrutor.nome}${pratica.instrutor.qualificacao ? `, ${pratica.instrutor.qualificacao}` : ""}.`
    : "";
  const resultado =
    pratica.resultado === "satisfatorio" ? "satisfatório" : pratica.resultado || "—";
  return (
    `Realizada em ${fmtData(pratica.data)}${horario}${carga}, em ${pratica.local || "—"}.` +
    `${instrutor} Resultado: ${resultado}.`
  );
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
 * Gera e baixa o PDF. Falha prevista = `ErroCertificado` (mensagem pronta para o aluno): o gerador de
 * PDF não carregou ou o QR de validação não ficou pronto (o PDF NUNCA sai sem o QR em silêncio).
 * Quem chama mostra `mensagemFalhaCertificado(erro)`. O logo é só enfeite: se o PDF não o aceitar,
 * o certificado sai sem ele e o retorno diz (`logoDesenhado`). A imagem da assinatura do instrutor e do
 * responsável técnico (T29) é igual: quem chama carrega as imagens (`lib/ead-assinatura.js`) e passa em
 * `assinaturas`; a que o PDF não aceitar fica de fora e o retorno diz quais saíram (`assinaturasDesenhadas`).
 * Sem imagem o certificado sai só com o nome e o registro, como sempre saiu.
 *
 * @param {object} cert { codigo, dados, assinatura_aluno, emitido_em, hash_sha256, revogado }
 * @param {{ logo?: {dataUrl, formato, w, h},
 *   assinaturas?: { instrutor?: {dataUrl, w, h}|null, responsavel_tecnico?: {dataUrl, w, h}|null },
 *   gerarQr?: (url: string) => Promise<string|null>,
 *   salvar?: (doc: object, nome: string) => void }} [opcoes] `gerarQr` e `salvar` existem para o teste
 *   (sem DOM e sem disco); no app valem o QR do navegador e o download do jsPDF.
 * @returns {Promise<{ logoDesenhado: boolean, assinaturasDesenhadas: string[] }>}
 */
export async function baixarCertificadoPdf(cert, opcoes = {}) {
  let jsPDF;
  try {
    ({ jsPDF } = await import("jspdf"));
  } catch (e) {
    console.error("[certificado] não carregou o gerador de PDF:", e);
    throw new ErroCertificado(MSG_SEM_BIBLIOTECA_PDF, "SEM_BIBLIOTECA");
  }
  const d = cert.dados || {};
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const W = 297;
  const H = 210;
  const url = urlValidacao(cert.codigo);
  let qr = null;
  try {
    qr = await (opcoes.gerarQr || qrPng)(url);
  } catch (e) {
    console.error("[certificado] erro ao gerar o QR:", e);
  }
  if (!qr) throw new ErroCertificado(MSG_QR_FALHOU, "QR_FALHOU");

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
    doc.addImage(qr, "PNG", W - 44, H - 44, 28, 28, "qr", "FAST");
  };

  // ------------------------------------------------------------------ frente
  moldura();
  let logoDesenhado = false;
  if (opcoes.logo?.dataUrl) {
    try {
      const h = 16;
      const w = Math.min(50, (opcoes.logo.w / opcoes.logo.h) * h || 40);
      doc.addImage(opcoes.logo.dataUrl, opcoes.logo.formato || "PNG", 18, 16, w, h);
      logoDesenhado = true;
    } catch (e) {
      console.error("[certificado] o PDF não aceitou o logo da empresa:", e);
    }
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
  // linhas de rodapé do texto: tipo do treinamento (NR-1, 1.7.1.2; T23), validade e local de realização
  // (NR-1, 1.7.1.1). O certificado emitido antes da T8 não tem local e o de antes da T23 não tem tipo: saem sem a
  // linha. Tipo e validade dividem a primeira linha (o certificado não ganha altura); o motivo do eventual
  // (até 200 caracteres) vem numa linha própria, que pode quebrar em duas, e por isso o bloco sobe um pouco: as
  // imagens das assinaturas começam em y = 122,5 e nada do bloco pode chegar lá.
  const [linhaDoTipo, linhaDoMotivo] = linhasDoTipoNoCertificado(d);
  let yDetalhe = linhaDoMotivo ? 98 : 104;
  const tipoEValidade = [
    linhaDoTipo,
    d.periodo?.validade ? `Validade: até ${fmtData(d.periodo.validade)}` : null,
  ]
    .filter(Boolean)
    .join("  ·  ");
  if (tipoEValidade) {
    doc.setFontSize(10.5);
    doc.text(doc.splitTextToSize(tipoEValidade, W - 60), W / 2, yDetalhe, { align: "center" });
    yDetalhe += 7;
  }
  if (linhaDoMotivo) {
    doc.setFontSize(10.5);
    const partes = doc.splitTextToSize(linhaDoMotivo, W - 60);
    doc.text(partes, W / 2, yDetalhe, { align: "center" });
    yDetalhe += partes.length * 4.6 + 2.4;
  }
  if (d.local?.ambiente) {
    // semipresencial (T12): o local da prática vem junto, e a fonte diminui se for preciso para o local (até 120
    // caracteres) caber em duas linhas sem chegar nas imagens das assinaturas
    const texto = textoDoLocal(d.local);
    let partes = [];
    for (const tamanho of [10.5, 9.5, 8.5]) {
      doc.setFontSize(tamanho);
      partes = doc.splitTextToSize(texto, W - 60);
      if (partes.length <= 2) break;
    }
    doc.text(partes, W / 2, yDetalhe, { align: "center" });
  }

  // assinaturas
  const ass = cert.assinatura_aluno || {};
  const colunas = [
    {
      chave: "participante", // o aluno assina eletronicamente (senha), sem imagem
      nome: d.aluno?.nome,
      papel: "Participante",
      extra: ass.assinado_em
        ? `Assinado eletronicamente em ${dataHoraBrasilia(ass.assinado_em)}`
        : "",
      extra2: ass.ip ? `IP ${ass.ip} · login pessoal` : "",
    },
    {
      chave: "instrutor",
      nome: d.instrutor?.nome,
      papel: "Instrutor",
      extra: d.instrutor?.qualificacao || "",
    },
    {
      chave: "responsavel_tecnico",
      nome: d.responsavel_tecnico?.nome,
      papel: "Responsável técnico",
      extra: d.responsavel_tecnico?.registro || "",
    },
  ];
  const yLinha = 142;
  const assinaturasDesenhadas = [];
  colunas.forEach((c, i) => {
    const x = 18 + (i + 0.5) * ((W - 36) / 3);
    // imagem da assinatura (T29) sobre a linha; se o PDF não a aceitar, a linha segue com o nome e o registro
    const imagem = opcoes.assinaturas?.[c.chave];
    const caixa = imagem?.dataUrl ? posicaoDaAssinatura(x, yLinha, imagem) : null;
    if (caixa) {
      try {
        doc.addImage(
          imagem.dataUrl,
          formatoDaImagem(imagem.dataUrl),
          caixa.x,
          caixa.y,
          caixa.w,
          caixa.h,
          `assinatura-${c.chave}`,
          "FAST"
        );
        assinaturasDesenhadas.push(c.chave);
      } catch (e) {
        console.error(`[certificado] o PDF não aceitou a assinatura (${c.chave}):`, e);
      }
    }
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
  // semipresencial (T12): a parte prática ocupa o pé do verso, então o conteúdo para mais acima
  const textoPratica = textoDaPraticaNoVerso(d.pratica);
  const LIMITE = textoPratica ? H - 66 : H - 48;
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

  // parte prática presencial (T12): dia, horário, carga, local, instrutor e resultado, congelados na emissão. À
  // esquerda do QR (que começa em W - 44) e acima da nota do pé; a fonte diminui se o texto passar de 7 linhas.
  if (textoPratica) {
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("PARTE PRÁTICA PRESENCIAL", 18, H - 62);
    doc.setFont("helvetica", "normal");
    let partes = [];
    for (const tamanho of [8.5, 7.5, 6.5]) {
      doc.setFontSize(tamanho);
      partes = doc.splitTextToSize(textoPratica, W - 36 - 52);
      if (partes.length <= 7) break;
    }
    doc.text(partes.slice(0, 7), 18, H - 57.5);
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  if (textoPratica) {
    doc.text(
      doc.splitTextToSize(
        "Teoria a distância com registro individual de acessos, atividades e avaliação (NR-1, item 1.7 e Anexo II); " +
          "prática presencial registrada pela empresa, com a presença e o resultado de cada participante.",
        W - 36 - 52
      ),
      18,
      H - 30
    );
  } else {
    doc.text(
      "Treinamento a distância com registro individual de acessos, atividades e avaliação (NR-1, item 1.7 e Anexo II).",
      18,
      H - 30
    );
  }
  rodape();

  const nome = (d.aluno?.nome || "certificado").replace(/[^\p{L}\p{N}]+/gu, "_");
  const arquivo = `Certificado_${nome}_${cert.codigo}.pdf`;
  if (opcoes.salvar) opcoes.salvar(doc, arquivo);
  else doc.save(arquivo);
  return { logoDesenhado, assinaturasDesenhadas };
}
