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

/**
 * A linha "Local de realização" resumida para quando os locais da prática não cabem em duas linhas (A6, T12 N4):
 * o primeiro local (cortado em 40 caracteres) e "e mais N local(is) (ver o verso)", porque o verso lista a
 * sessão de cada dia com o seu local. Devolve null quando não há mais de um local diferente nas sessões (nada a
 * resumir: o texto normal já é o do único local) ou o certificado não é de semipresencial.
 */
export function textoDoLocalResumido(d) {
  const locais = [
    ...new Set(
      (d?.pratica?.sessoes ?? [])
        .map((sessao) => String(sessao?.local ?? "").trim())
        .filter(Boolean)
    ),
  ];
  if (locais.length < 2) return null;
  const plataforma = String(d?.local?.ambiente ?? "").split(" — ")[0];
  const primeiro = locais[0].length > 40 ? `${locais[0].slice(0, 37)}...` : locais[0];
  const outros = locais.length - 1;
  return (
    `Local de realização: teoria a distância na ${plataforma}; prática presencial em ${primeiro} ` +
    `e mais ${outros} ${outros === 1 ? "local" : "locais"} (ver o verso)`
  );
}

const fmtHoras = (h) => `${String(Math.round((Number(h) || 0) * 100) / 100).replace(".", ",")} h`;

/** "05/10/2026, das 08:00 às 17:00 (8 h), em Local. Instrutor: Nome, qualificação." de uma sessão congelada. */
function textoDaSessaoPratica(sessao) {
  const horario =
    sessao.hora_inicio && sessao.hora_fim
      ? `, das ${sessao.hora_inicio} às ${sessao.hora_fim}`
      : "";
  const carga = Number(sessao.carga_horas) > 0 ? ` (${fmtHoras(sessao.carga_horas)})` : "";
  const instrutor = sessao.instrutor?.nome
    ? ` Instrutor: ${sessao.instrutor.nome}${sessao.instrutor.qualificacao ? `, ${sessao.instrutor.qualificacao}` : ""}.`
    : "";
  return `${fmtData(sessao.data)}${horario}${carga}, em ${sessao.local || "—"}.${instrutor}`;
}

/**
 * O texto da parte prática no verso do certificado semipresencial (T12), a partir de `dados.pratica` (as sessões
 * que valeram, congeladas na emissão): uma lista de parágrafos, ou null sem prática. Uma sessão, uma linha; a
 * prática de vários dias traz uma linha por sessão, com a carga somada.
 */
export function textoDaPraticaNoVerso(pratica) {
  const sessoes = Array.isArray(pratica?.sessoes) ? pratica.sessoes : [];
  if (!sessoes.length) return null;
  const resultado =
    pratica.resultado === "satisfatorio" ? "satisfatório" : pratica.resultado || "—";
  if (sessoes.length === 1) {
    return [`Realizada em ${textoDaSessaoPratica(sessoes[0])} Resultado: ${resultado}.`];
  }
  const total =
    Number(pratica.carga_horas) > 0 ? ` (${fmtHoras(pratica.carga_horas)} no total)` : "";
  return [
    `Realizada em ${sessoes.length} sessões presenciais${total}:`,
    ...sessoes.map((s) => `• ${textoDaSessaoPratica(s)}`),
    `Resultado: ${resultado} em todas as sessões.`,
  ];
}

// -------------------------------------------------------------------------------- o verso: conteúdo programático

/** Altura de uma linha de texto do conteúdo (mm) com a fonte inteira; as escalas abaixo a reduzem junto com a fonte. */
const LINHA_DO_VERSO = 4.4;
/** De onde o conteúdo começa no verso (mm, abaixo do título e da linha do curso). */
const Y_DO_CONTEUDO = 40;
/**
 * Fontes do conteúdo, da inteira à menor: a que couber é a usada. Passando da menor, o conteúdo segue numa página
 * a mais (o texto nunca cobre o que está no pé do verso).
 */
const ESCALAS_DO_VERSO = [1, 0.92, 0.85, 0.78];

/**
 * Distribui os blocos do conteúdo programático (um módulo com as suas aulas, ou o texto corrido) pelas colunas e
 * páginas do verso. `doc` só mede (fonte e `splitTextToSize`); quem desenha é quem chama, com o que sai daqui.
 * Um bloco inteiro fica na mesma coluna quando cabe numa coluna vazia; o que é mais alto que uma coluna (o texto
 * corrido do cadastro central não tem módulos) é partido por linha, para usar a 2ª coluna e depois a página
 * seguinte. Tenta a fonte inteira com 1 coluna (se o conteúdo é curto) ou 2 e, não cabendo na página, fontes
 * menores; só então abre página nova.
 *
 * @param {object} doc jsPDF (medição)
 * @param {string[][]} blocos linhas por bloco; "# " no começo da linha marca o título do módulo
 * @param {{ colunasBase: 1|2, limite: number, largura: number }} cfg `limite` = y máximo do conteúdo (mm) em
 *   toda página; `largura` = largura útil da página (mm)
 * @returns {{ escala: number, colunas: number, larguraCol: number, paginas: number,
 *   itens: { pagina: number, col: number, y: number, partes: string[], titulo: boolean }[] }}
 */
export function distribuirConteudo(doc, blocos, { colunasBase, limite, largura }) {
  const tentar = (escala, colunas, podeAbrirPagina) => {
    const larguraCol = (largura - 40) / colunas;
    const linha = LINHA_DO_VERSO * escala;
    const medir = (l) => {
      const titulo = l.startsWith("# ");
      doc.setFont("helvetica", titulo ? "bold" : "normal");
      doc.setFontSize((titulo ? 9.5 : 9) * escala);
      return { titulo, partes: doc.splitTextToSize(titulo ? l.slice(2) : l, larguraCol - 4) };
    };
    const capacidade = limite - Y_DO_CONTEUDO;
    const itens = [];
    let pagina = 0;
    let col = 0;
    let y = Y_DO_CONTEUDO;
    // próxima coluna, ou próxima página; false se não há (e não pode abrir página)
    const avancar = () => {
      col++;
      if (col >= colunas) {
        if (!podeAbrirPagina) return false;
        col = 0;
        pagina++;
      }
      y = Y_DO_CONTEUDO;
      return true;
    };
    const colocar = (m) => {
      let restantes = m.partes;
      while (restantes.length) {
        let cabem = Math.floor((limite - y + 1e-6) / linha);
        // última tentativa (a que abre páginas): uma coluna vazia sempre recebe ao menos uma linha, senão um limite
        // absurdo (bloco da prática gigante) faria o laço virar páginas vazias para sempre
        if (cabem < 1 && y === Y_DO_CONTEUDO && podeAbrirPagina) cabem = 1;
        const inteiroCabeNumaColunaVazia = restantes.length * linha <= capacidade;
        if (
          cabem < 1 ||
          (cabem < restantes.length && y > Y_DO_CONTEUDO && inteiroCabeNumaColunaVazia)
        ) {
          if (!avancar()) return false;
          continue;
        }
        const parte = restantes.slice(0, cabem);
        itens.push({ pagina, col, y, partes: parte, titulo: m.titulo });
        y += parte.length * linha + (m.titulo && parte.length === restantes.length ? 0.6 : 0);
        restantes = restantes.slice(parte.length);
        if (restantes.length && !avancar()) return false;
      }
      return true;
    };
    for (const bloco of blocos) {
      const medidas = bloco.map(medir);
      const altura = medidas.reduce((s, m) => s + m.partes.length * linha + 0.6, 0);
      if (y + altura > limite && y > Y_DO_CONTEUDO && altura <= capacidade && !avancar())
        return null;
      for (const m of medidas) if (!colocar(m)) return null;
    }
    return { escala, colunas, larguraCol, paginas: pagina + 1, itens };
  };

  const colunasPossiveis = colunasBase === 1 ? [1, 2] : [2];
  for (const escala of ESCALAS_DO_VERSO) {
    for (const colunas of colunasPossiveis) {
      const cabe = tentar(escala, colunas, false);
      if (cabe) return cabe;
    }
  }
  // nem a menor fonte cabe numa página: segue em páginas a mais, em 2 colunas, com a menor fonte
  return tentar(ESCALAS_DO_VERSO[ESCALAS_DO_VERSO.length - 1], 2, true);
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
    // vários locais longos: mesmo na menor fonte passam de duas linhas e chegariam às imagens das assinaturas.
    // A frente resume ("e mais N locais, ver o verso") e o verso lista cada sessão com o seu local (A6).
    if (partes.length > 2) {
      const resumido = textoDoLocalResumido(d);
      if (resumido) partes = doc.splitTextToSize(resumido, W - 60);
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
  // semipresencial (T12): a parte prática ocupa o pé do verso (uma linha por sessão que valeu), então o conteúdo
  // para acima dela. O bloco cresce para cima conforme as linhas (a fonte diminui até 6,5 pt, mas nunca corta
  // texto) e o limite do conteúdo acompanha: o último baseline fica em H - 36,5, acima da nota do pé (H - 30).
  const paragrafosDaPratica = textoDaPraticaNoVerso(d.pratica);
  let linhasDaPratica = [];
  let tamanhoDaPratica = 8.5;
  if (paragrafosDaPratica) {
    for (const tamanho of [8.5, 7.5, 6.5]) {
      tamanhoDaPratica = tamanho;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(tamanho);
      linhasDaPratica = paragrafosDaPratica.flatMap((p) => doc.splitTextToSize(p, W - 36 - 52));
      if (linhasDaPratica.length <= 8) break;
    }
  }
  // 0,3528 mm por pt e o espaçamento padrão de 1,15 do jsPDF
  const passoDaPratica = tamanhoDaPratica * 0.3528 * 1.15;
  const yPrimeiraDaPratica = H - 36.5 - (linhasDaPratica.length - 1) * passoDaPratica;
  const yTituloDaPratica = yPrimeiraDaPratica - 4.5;
  const LIMITE = paragrafosDaPratica ? yTituloDaPratica - 6 : H - 48;

  const cabecalhoDoVerso = (continuacao) => {
    moldura();
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text(continuacao ? "CONTEÚDO PROGRAMÁTICO (continuação)" : "CONTEÚDO PROGRAMÁTICO", 18, 24);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(71, 85, 105);
    doc.text(
      `${d.curso?.nome || ""} · ${d.curso?.carga_horaria_horas || "—"} h · ${d.curso?.modalidade || "EAD"}`,
      18,
      30
    );
  };

  // blocos = módulo + suas aulas (o módulo fica numa coluna só quando cabe); texto corrido, sem módulos, é um bloco
  // só e é partido por linha. A distribuição decide colunas, fonte e páginas para nada passar do LIMITE.
  const linhas = linhasConteudo(d.curso);
  const blocos = [];
  for (const l of linhas) {
    if (l.startsWith("# ") || !blocos.length) blocos.push([]);
    blocos[blocos.length - 1].push(l);
  }
  const distribuicao = distribuirConteudo(doc, blocos, {
    colunasBase: linhas.length > 22 ? 2 : 1,
    limite: LIMITE,
    largura: W - 36,
  });
  doc.addPage();
  cabecalhoDoVerso(false);
  doc.setTextColor(15, 23, 42);
  for (let pagina = 0; pagina < distribuicao.paginas; pagina++) {
    if (pagina > 0) {
      // o conteúdo seguiu: página a mais com o mesmo cabeçalho, o código e o QR (a prática fica na última)
      rodape();
      doc.addPage();
      cabecalhoDoVerso(true);
      doc.setTextColor(15, 23, 42);
    }
    for (const item of distribuicao.itens.filter((i) => i.pagina === pagina)) {
      doc.setFont("helvetica", item.titulo ? "bold" : "normal");
      doc.setFontSize((item.titulo ? 9.5 : 9) * distribuicao.escala);
      doc.text(item.partes, 18 + item.col * distribuicao.larguraCol, item.y);
    }
  }

  // parte prática presencial (T12): dia, horário, carga, local e instrutor de cada sessão que valeu, congelados na
  // emissão. À esquerda do QR (que começa em W - 44) e acima da nota do pé.
  if (paragrafosDaPratica) {
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("PARTE PRÁTICA PRESENCIAL", 18, yTituloDaPratica);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(tamanhoDaPratica);
    doc.text(linhasDaPratica, 18, yPrimeiraDaPratica);
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  if (paragrafosDaPratica) {
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
