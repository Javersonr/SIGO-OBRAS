/**
 * PDF do projeto pedagógico do curso EAD (T25; NR-1, Anexo II, item 3.1) — o modelo (o que o documento diz) é
 * puro e testado; o desenho usa o jsPDF, que entra por parâmetro (no app vem do import dinâmico; no teste, do
 * pacote). Quem usa: TreinamentosEadTab.jsx ("Gerar PDF do projeto", que sobe o arquivo para o bucket
 * `treinamentos` e grava a referência em `projeto_pedagogico_ref`). Testes em ead-projeto-pdf.test.js.
 *
 * O PDF só reproduz o que o RH escreveu nos 15 itens e o que o curso já tinha: o texto do projeto é do
 * responsável técnico (D5), este arquivo não acrescenta conteúdo pedagógico nenhum. Item vazio sai como "Não
 * preenchido." e o documento leva a tarja de rascunho enquanto faltar item.
 */
import { rotuloDaModalidade } from "./ead-modalidade";
import { ANOS_ENTRE_REVISOES, gatilhosDoCurso, montarProjeto } from "./ead-projeto";

const fmtData = (dia) => (dia ? String(dia).slice(0, 10).split("-").reverse().join("/") : "");
const texto = (v) => String(v ?? "").trim();

// ------------------------------------------------------------------------------- texto da fonte do PDF

// Fontes padrão do PDF (helvetica) só têm WinAnsi: o jsPDF embaralha a linha inteira quando aparece outro
// caractere. Troca os comuns e o resto vira "?" (mesma regra do PDF da proposta).
const EXTRAS_WINANSI = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
const TROCAS_PDF = { "≤": "<=", "≥": ">=", Ω: "ohm", "⌀": "Ø", "′": "'", "″": '"', "\t": " " };

/** O texto como a fonte do PDF consegue escrever (acentos do português ficam; o resto vira "?"). */
export function textoParaPdf(valor) {
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

/** "projeto-pedagogico-<nome-do-curso>.pdf", sem acento nem espaço. */
export function nomeDoArquivoDoProjeto(curso) {
  const slug = String(curso?.nome ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return `projeto-pedagogico-${slug || "curso"}.pdf`;
}

// ----------------------------------------------------------------------------------------------- modelo

/**
 * O que o PDF diz, sem desenhar nada: título, identificação, os 15 itens (`itens: [{ rotulo, linhas,
 * preenchido }]`), a validação do 3.3, a assinatura do responsável técnico e a tarja de rascunho (`rascunho`,
 * ou null quando os 15 itens estão preenchidos).
 * @param {{ curso?: object, aulas?: object[], questoes?: object[], empresa?: object, geradoEm?: string }} dados
 */
export function modeloDoPdfDoProjeto({ curso, aulas, questoes, empresa, geradoEm } = {}) {
  const c = curso || {};
  const projeto = montarProjeto({ curso: c, aulas, questoes });
  const nomeDoCurso = texto(c.nome) || "(curso sem nome)";

  const identificacao = [
    ["Empresa", texto(empresa?.razao_social) || texto(empresa?.nome) || "—"],
    ...(texto(empresa?.cnpj) ? [["CNPJ", texto(empresa.cnpj)]] : []),
    ["Curso", texto(c.codigo) ? `${nomeDoCurso} (${texto(c.codigo)})` : nomeDoCurso],
    ["Modalidade", rotuloDaModalidade(c.modalidade)],
    ...(Number(c.validade_meses) > 0
      ? [["Validade do treinamento", `${Number(c.validade_meses)} meses`]]
      : []),
    ["Gerado em", fmtData(geradoEm) || "—"],
  ];

  const itens = projeto.itens.map((i) => ({
    rotulo: `${i.letra}) ${i.titulo}`,
    linhas: i.preenchido ? i.linhas : ["Não preenchido."],
    preenchido: i.preenchido,
  }));

  // validação (Anexo II, 3.3)
  const validadoEm = texto(c.projeto_validado_em);
  const validadoPor = texto(c.projeto_validado_por);
  const validado = !!validadoEm && !!validadoPor;
  const linhasDaValidacao = validado
    ? [
        `Validado por ${validadoPor} em ${fmtData(validadoEm)}.`,
        ...(texto(c.proxima_revisao) ? [`Próxima revisão até ${fmtData(c.proxima_revisao)}.`] : []),
      ]
    : ["Este projeto ainda não foi validado pelo responsável técnico."];
  linhasDaValidacao.push(
    `O projeto é validado a cada ${ANOS_ENTRE_REVISOES} anos ou quando a norma do curso mudar.`
  );
  for (const g of gatilhosDoCurso(c)) {
    linhasDaValidacao.push(`${g.norma}, a partir de ${fmtData(g.data)}: ${g.texto}`);
  }

  return {
    titulo: "PROJETO PEDAGÓGICO",
    subtitulo: "Curso a distância (EAD) — NR-1, Anexo II, item 3.1",
    identificacao,
    rascunho: projeto.completo
      ? null
      : `Rascunho: faltam ${projeto.faltam.length} de ${projeto.total} itens (${projeto.faltam.join(", ")}).`,
    itens,
    validacao: { validado, linhas: linhasDaValidacao },
    assinatura: {
      nome: texto(c.responsavel_tecnico_nome) || "Responsável técnico",
      registro: texto(c.responsavel_tecnico_registro),
    },
    nomeDoCurso,
    geradoEm: fmtData(geradoEm),
  };
}

// ---------------------------------------------------------------------------------------------- desenho

const MARGEM = 18;
const ALTURA_DA_LINHA = 4.6;

/**
 * Desenha o modelo num PDF A4 retrato e devolve o documento do jsPDF (quem chama escolhe `.save()` ou
 * `.output("blob")`). `logo` (opcional) é `{ dataUrl, w, h }` como o de `logoParaPdf`; imagem que o PDF recusar
 * é ignorada.
 * @param {ReturnType<typeof modeloDoPdfDoProjeto>} modelo
 * @param {{ jsPDF: any, logo?: { dataUrl: string, w: number, h: number } | null }} opcoes
 */
export function gerarPdfDoProjeto(modelo, { jsPDF, logo = null }) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const L = doc.internal.pageSize.getWidth();
  const A = doc.internal.pageSize.getHeight();
  const util = L - 2 * MARGEM;
  const limiteInferior = A - 20;
  let y = MARGEM;

  const quebrarPaginaSe = (altura) => {
    if (y + altura > limiteInferior) {
      doc.addPage();
      y = MARGEM;
    }
  };
  const paragrafo = (
    valor,
    { negrito = false, tamanho = 9.5, recuo = 0, cor = [30, 41, 59] } = {}
  ) => {
    doc.setFont("helvetica", negrito ? "bold" : "normal");
    doc.setFontSize(tamanho);
    doc.setTextColor(...cor);
    for (const linha of doc.splitTextToSize(textoParaPdf(valor), util - recuo)) {
      quebrarPaginaSe(ALTURA_DA_LINHA);
      doc.text(linha, MARGEM + recuo, y);
      y += ALTURA_DA_LINHA;
    }
  };

  if (logo?.dataUrl) {
    try {
      const altura = 14;
      const largura = Math.min(55, (logo.w / logo.h) * altura);
      doc.addImage(logo.dataUrl, "PNG", MARGEM, y - 4, largura, altura);
      y += altura + 2;
    } catch {
      /* logo recusado pelo PDF: o documento sai sem ele */
    }
  }

  paragrafo(modelo.titulo, { negrito: true, tamanho: 15 });
  paragrafo(modelo.subtitulo, { tamanho: 9, cor: [71, 85, 105] });
  y += 2;
  if (modelo.rascunho) {
    paragrafo(modelo.rascunho, { negrito: true, tamanho: 9.5, cor: [180, 83, 9] });
    y += 1;
  }
  for (const [rotulo, valor] of modelo.identificacao) {
    paragrafo(`${rotulo}: ${valor}`, { tamanho: 9.5 });
  }
  y += 3;

  for (const item of modelo.itens) {
    quebrarPaginaSe(ALTURA_DA_LINHA * 3);
    paragrafo(item.rotulo, { negrito: true, tamanho: 10.5 });
    for (const linha of item.linhas) {
      paragrafo(linha, {
        recuo: 3,
        cor: item.preenchido ? [30, 41, 59] : [148, 163, 184],
      });
    }
    y += 2.5;
  }

  quebrarPaginaSe(ALTURA_DA_LINHA * 8);
  paragrafo("Validação do projeto (item 3.3)", { negrito: true, tamanho: 10.5 });
  for (const linha of modelo.validacao.linhas) paragrafo(linha, { recuo: 3 });

  quebrarPaginaSe(30);
  y += 14;
  doc.setDrawColor(100, 116, 139);
  doc.line(MARGEM, y, MARGEM + 80, y);
  y += 4.5;
  paragrafo(modelo.assinatura.nome, { negrito: true });
  if (modelo.assinatura.registro) paragrafo(modelo.assinatura.registro);
  paragrafo("Responsável técnico", { tamanho: 8.5, cor: [71, 85, 105] });

  // rodapé em todas as páginas, depois de saber quantas são
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      textoParaPdf(`Projeto pedagógico — ${modelo.nomeDoCurso}`.slice(0, 90)),
      MARGEM,
      A - 10
    );
    doc.text(`Página ${p} de ${total}`, L - MARGEM, A - 10, { align: "right" });
  }
  return doc;
}

/**
 * O PDF do projeto como `Blob`, carregando o jsPDF só no clique (é grande). `opcoes.jsPDF` e `opcoes.logo`
 * existem para o teste e para o logo da empresa.
 */
export async function pdfDoProjetoComoBlob(dados, opcoes = {}) {
  const jsPDF = opcoes.jsPDF || (await import("jspdf")).jsPDF;
  const doc = gerarPdfDoProjeto(modeloDoPdfDoProjeto(dados), { jsPDF, logo: opcoes.logo ?? null });
  return doc.output("blob");
}
