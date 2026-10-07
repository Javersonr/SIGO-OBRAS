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
      "Teoria a distância no portal e prática presencial, registrada abaixo em Sessões práticas " +
      "(salve o curso antes). O certificado de cada aluno só é emitido com a prática presencial " +
      "satisfatória.",
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
 * A saída que o aviso sugere é só "Apoio ao presencial" (material de estudo, sem certificado): a norma pede
 * o treinamento presencial, então "Semipresencial" não resolveria. Quem decide é a modalidade marcada pelo
 * RH; o nome só serve para lembrá-lo.
 */
export function avisoDaModalidade(curso) {
  if (!curso) return null;
  if (normalizar(curso.modalidade) !== "ead") return null;
  if (!/\bNR[\s-]*35\b/i.test(`${curso.codigo || ""} ${curso.nome || ""}`)) return null;
  return (
    "A NR-35 exige treinamento presencial desde 16/07/2026 (item 35.4.5). Um certificado EAD de " +
    "NR-35 não tem valor: marque Apoio ao presencial (material de estudo, sem certificado)."
  );
}

/**
 * Selo da modalidade na lista de cursos do RH, ou null (EAD, a modalidade comum, não leva selo). O apoio
 * leva um selo NEUTRO "Apoio — sem certificado" (D3): é um curso publicado e matriculável como material de
 * estudo, não um curso "com pendências". Valor que o banco não aceita aparece como está.
 * @returns {{ texto: string, tom: "neutro" } | null}
 */
export function seloDaModalidade(modalidade) {
  const m = normalizar(modalidade);
  if (m === "ead") return null;
  if (m === "apoio") return { texto: "Apoio — sem certificado", tom: "neutro" };
  return { texto: rotuloDaModalidade(m), tom: "neutro" };
}

/**
 * Como a lista de requisitos do curso mostra um requisito ainda não cumprido (`requisitosDoCurso`):
 * "Pendente" (em alerta) quando ele trava publicar e matricular; "Informação" (neutro) quando só trava a
 * emissão, que é o caso do curso de apoio (o motivo é só informativo, D3); "Revisar" (neutro) para o que
 * não trava nada.
 * @returns {{ prefixo: string, tom: "alerta" | "neutro" }}
 */
export function apresentacaoDoRequisito(requisito) {
  if (requisito?.bloqueia) return { prefixo: "Pendente: ", tom: "alerta" };
  if (requisito?.bloqueiaEmissao) return { prefixo: "Informação: ", tom: "neutro" };
  return { prefixo: "Revisar: ", tom: "neutro" };
}
