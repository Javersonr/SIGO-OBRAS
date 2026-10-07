/**
 * Lista de presença da sessão prática presencial (T12). Substitui a lista antiga do EAD (uma folha por dia com
 * 10 h fixas, das 07:00 às 18:00, e o texto "modalidade EAD"), que declarava um horário que não houve e não
 * gravava nada. Agora a lista é a ficha de UMA sessão registrada pelo RH: a data, o horário, a carga, o local e o
 * instrutor reais, o texto de treinamento presencial e as assinaturas do instrutor e do responsável técnico. O
 * modelo oficial da lista é a decisão D13 (o Javerson pode trocar os textos aqui).
 *
 * Puro em relação ao app: recebe o `doc` do jsPDF já criado e devolve o mesmo `doc` (quem chama baixa); o logo
 * vem carregado e quem o desenha é `desenharLogo` (de `lib/pdf-empresa.js`), passado por parâmetro para o teste não
 * carregar o cliente do backend.
 */
import { formatarHoras } from "./ead-requisitos.js";

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const fmtDia = (dia) =>
  typeof dia === "string" && DIA.test(dia) ? dia.split("-").reverse().join("/") : "—";
const horaCurta = (hora) => {
  const m = typeof hora === "string" ? /^(\d{2}:\d{2})/.exec(hora.trim()) : null;
  return m ? m[1] : "—";
};
const texto = (v) => (typeof v === "string" ? v.trim() : "");

/** As linhas de texto da lista (sem desenho), para o PDF e para o teste. */
export function textosDaListaDePresenca({ sessao, curso, empresa }) {
  const teorica = Number(curso?.carga_teorica_horas);
  const pratica = Number(curso?.carga_pratica_horas);
  const divisao =
    teorica > 0 && pratica > 0
      ? ` (teoria a distância: ${formatarHoras(teorica)}; prática presencial: ${formatarHoras(pratica)})`
      : "";
  const total =
    Number(curso?.carga_horaria_horas) > 0 ? formatarHoras(curso.carga_horaria_horas) : "—";
  const qualificacao = texto(sessao?.instrutor_qualificacao);
  const rt = texto(curso?.responsavel_tecnico_nome);
  const cnpj = texto(empresa?.cnpj);
  return {
    titulo: "LISTA DE PRESENÇA — TREINAMENTO PRESENCIAL (PARTE PRÁTICA)",
    empresa:
      `${texto(empresa?.razao_social) || texto(empresa?.nome)}${cnpj ? ` — CNPJ ${cnpj}` : ""}` +
      `${texto(empresa?.endereco) ? ` — ${texto(empresa.endereco)}` : ""}`,
    treinamento:
      `Treinamento: ${texto(curso?.nome)}${texto(curso?.codigo) ? ` (${texto(curso.codigo)})` : ""} — ` +
      `Carga horária total: ${total}${divisao}`,
    sessao:
      `Data: ${fmtDia(sessao?.data)} — Horário: ${horaCurta(sessao?.hora_inicio)} às ${horaCurta(sessao?.hora_fim)}` +
      ` — Carga desta sessão: ${Number(sessao?.carga_horas) > 0 ? formatarHoras(sessao.carga_horas) : "—"}`,
    local: `Local: ${texto(sessao?.local) || "—"}`,
    instrutor: `Instrutor: ${texto(sessao?.instrutor_nome) || "—"}${qualificacao ? ` — ${qualificacao}` : ""}`,
    declaracao:
      "Declaramos que os participantes que assinaram acima participaram da parte prática presencial deste " +
      "treinamento, na data, no horário e no local indicados, sob a orientação do instrutor.",
    assinaturaInstrutor: `Instrutor: ${texto(sessao?.instrutor_nome) || "—"}`,
    assinaturaRt: rt ? `Responsável técnico: ${rt}` : "Responsável técnico",
    registroRt: texto(curso?.responsavel_tecnico_registro) || null,
  };
}

/** "Lista_Presenca_<curso>_<DD-MM-AAAA>.pdf" */
export function nomeDoArquivoDaLista(curso, sessao) {
  const nome = (texto(curso?.nome) || "curso").replace(/[^\p{L}\p{N}]+/gu, "_");
  return `Lista_Presenca_${nome}_${fmtDia(sessao?.data).replaceAll("/", "-")}.pdf`;
}

/**
 * Desenha a lista no `doc` (A4 retrato, mm): cabeçalho com os dados da sessão, uma linha por participante (nome,
 * CPF, função e espaço para assinar) e, no fim, a declaração e as assinaturas do instrutor e do responsável
 * técnico. `participantes` = `[{ nome, cpf, funcao }]`, na ordem em que saem.
 */
export function desenharListaDePresenca(
  doc,
  { sessao, curso, empresa, participantes = [], logo = null, desenharLogo = null }
) {
  const t = textosDaListaDePresenca({ sessao, curso, empresa });
  const W = doc.internal.pageSize.getWidth();
  const ALTURA_UTIL = 262;

  let y = desenharLogo ? desenharLogo(doc, logo, 10) : 10;
  if (!logo) y = 16;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(t.titulo, W / 2, y + 2, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  y += 9;
  for (const linha of [t.empresa, t.treinamento, t.sessao, t.local, t.instrutor]) {
    const partes = doc.splitTextToSize(linha, W - 30);
    doc.text(partes, 15, y);
    y += partes.length * 4.5 + 1.5;
  }
  y += 3;

  const cabecalho = () => {
    doc.setFont("helvetica", "bold");
    doc.text("Nº", 15, y);
    doc.text("Nome", 24, y);
    doc.text("CPF", 92, y);
    doc.text("Função", 124, y);
    doc.text("Assinatura", 158, y);
    doc.setFont("helvetica", "normal");
    y += 2.5;
    doc.line(15, y, W - 15, y);
    y += 7;
  };
  cabecalho();
  participantes.forEach((p, i) => {
    if (y > ALTURA_UTIL) {
      doc.addPage();
      y = 20;
      cabecalho();
    }
    doc.text(String(i + 1), 15, y);
    doc.text(texto(p.nome).slice(0, 38), 24, y);
    doc.text(texto(p.cpf) || "-", 92, y);
    doc.text((texto(p.funcao) || "-").slice(0, 20), 124, y, { maxWidth: 32 });
    doc.line(158, y + 1, W - 15, y + 1);
    y += 9;
  });

  // declaração e assinaturas: no pé da última página (ou numa página nova, se a lista encheu a página)
  y = Math.max(y + 8, 236);
  if (y > ALTURA_UTIL - 14) {
    doc.addPage();
    y = 40;
  }
  doc.setFontSize(8);
  doc.text(doc.splitTextToSize(t.declaracao, W - 30), 15, y);
  doc.setFontSize(9);
  y += 16;
  doc.line(15, y, 95, y);
  doc.text(doc.splitTextToSize(t.assinaturaInstrutor, 80), 15, y + 5);
  doc.line(115, y, W - 15, y);
  doc.text(doc.splitTextToSize(t.assinaturaRt, W - 130), 115, y + 5);
  if (t.registroRt) doc.text(t.registroRt, 115, y + 10, { maxWidth: W - 130 });
  return doc;
}
