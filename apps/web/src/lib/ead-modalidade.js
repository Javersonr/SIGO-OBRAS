/**
 * Modalidade do curso EAD na tela do RH (T8): rótulos, explicações e o aviso de NR-35 marcada como EAD.
 * Puro (sem DOM, sem sigoClient). Quem decide se o curso emite certificado é a regra de
 * `ead-requisitos.js` (espelho do servidor); aqui só ficam os textos da tela.
 */

export const OPCOES_MODALIDADE = [
  {
    valor: "ead",
    rotulo: "EAD (a distância)",
    explicacao:
      "Todo o treinamento é feito a distância no portal. Emite certificado (NR-1, Anexo II).",
  },
  {
    valor: "semipresencial",
    rotulo: "Semipresencial",
    explicacao:
      "Teoria a distância no portal e prática presencial. Ainda não emite certificado: " +
      "falta o registro da prática presencial.",
  },
  {
    valor: "apoio",
    rotulo: "Apoio ao presencial",
    explicacao:
      "Material de apoio ao treinamento presencial, que o funcionário estuda no portal. " +
      "Não emite certificado.",
  },
];

/** Modalidade ausente (curso lido antes da migração) vale EAD. */
const normalizar = (modalidade) => (String(modalidade ?? "").trim() === "" ? "ead" : modalidade);

export function rotuloDaModalidade(modalidade) {
  const m = normalizar(modalidade);
  return OPCOES_MODALIDADE.find((o) => o.valor === m)?.rotulo ?? m;
}

export function explicacaoDaModalidade(modalidade) {
  const m = normalizar(modalidade);
  return OPCOES_MODALIDADE.find((o) => o.valor === m)?.explicacao ?? "";
}

/**
 * Aviso (não bloqueia) para curso de NR-35 marcado como EAD: a NR-35 (item 35.4.5, Portaria MTE
 * 1.259/2026) exige treinamento presencial desde 16/07/2026, e um certificado EAD de NR-35 não vale.
 * Quem decide é a modalidade marcada pelo RH; o nome só serve para lembrá-lo.
 */
export function avisoDaModalidade(curso) {
  if (!curso) return null;
  if (normalizar(curso.modalidade) !== "ead") return null;
  if (!/\bNR[\s-]*35\b/i.test(`${curso.codigo || ""} ${curso.nome || ""}`)) return null;
  return (
    "A NR-35 exige treinamento presencial desde 16/07/2026 (item 35.4.5). Um certificado EAD de " +
    "NR-35 não tem valor: marque Semipresencial ou Apoio ao presencial."
  );
}
