// Regra espelhada no front; requisitos.test.ts confere os mesmos casos.
// deno-lint-ignore-file no-explicit-any
export const MIN_QUESTOES = 5;
/**
 * Modalidade do curso (coluna `treinamento_curso.modalidade`, migração 0136; CHECK no banco).
 * Só `ead` emite certificado hoje: `apoio` é material de estudo do treinamento presencial e nunca
 * emite; `semipresencial` (teoria EAD + prática presencial) só passa a emitir quando a etapa prática
 * for registrada (T12).
 */
export const MODALIDADES = ["ead", "semipresencial", "apoio"] as const;
/** A coluna; ausente (curso lido antes da migração 0136) vale "ead". Nome e código NÃO decidem. */
export function modalidadeDoCurso(curso: any): string {
  const m = String(curso?.modalidade ?? "").trim();
  return m === "" ? "ead" : m;
}
export function emiteCertificado(modalidade: string | null | undefined): boolean {
  return (modalidade || "ead") === "ead";
}
/** Por que a modalidade não emite certificado (para EAD, só o texto neutro do requisito). */
export function motivoSemCertificado(modalidade: string | null | undefined): string {
  const m = modalidade || "ead";
  if (m === "ead") return "Modalidade EAD: emite certificado";
  if (m === "apoio") return "Curso de apoio ao treinamento presencial: não emite certificado";
  if (m === "semipresencial")
    return (
      "Curso semipresencial: o certificado só poderá ser emitido depois do registro da " +
      "prática presencial (ainda não disponível)"
    );
  return "Modalidade do curso não reconhecida: o certificado não pode ser emitido";
}
/**
 * Resposta 409 da emissão pela modalidade, ou null se a modalidade emite. `apoio` e `semipresencial`
 * têm código próprio (a tela e o roteiro de teste distinguem); a T12 troca o do semipresencial pela
 * checagem real da prática.
 */
export function bloqueioDeEmissaoPorModalidade(
  modalidade: string | null | undefined
): { codigo: string; mensagem: string } | null {
  if (emiteCertificado(modalidade)) return null;
  const m = modalidade || "ead";
  const codigo =
    m === "apoio"
      ? "CURSO_DE_APOIO"
      : m === "semipresencial"
        ? "PRATICA_PENDENTE"
        : "MODALIDADE_INVALIDA";
  return { codigo, mensagem: motivoSemCertificado(m) };
}
/** Somente a duração cadastrada pelo RH pode creditar tempo de vídeo. */
export function duracaoParaProgresso(
  aula: { tipo?: string; duracao_seg?: unknown },
  padraoLeitura = 60
) {
  const duracao = Number(aula.duracao_seg);
  if (Number.isFinite(duracao) && duracao > 0) return duracao;
  return !aula.tipo || aula.tipo === "video" ? null : padraoLeitura;
}
export function tempoObrigatorioSeg(aulas: any[] = []) {
  return aulas
    .filter((a) => !a.deleted_at)
    .reduce((total, a) => total + Math.max(0, Number(a.duracao_seg) || 0), 0);
}
export function requisitosDoCurso({
  curso = {},
  aulas = [],
  questoes = [],
}: { curso?: any; aulas?: any[]; questoes?: any[] } = {}) {
  const ativas = aulas.filter((a) => !a.deleted_at);
  const carga = Number(curso.carga_horaria_horas) || 0;
  const lastro = tempoObrigatorioSeg(ativas);
  const arquivo = (a: any) =>
    a.tipo === "pdf"
      ? a.arquivo_ref
      : a.tipo === "texto"
        ? a.conteudo_texto?.trim()
        : a.fonte === "upload"
          ? a.video_ref
          : a.youtube_id;
  const itens = [
    ["AULAS", ativas.length > 0, "Adicione pelo menos uma aula"],
    [
      "CONTEUDO",
      ativas.length > 0 && ativas.every((a) => arquivo(a) && Number(a.duracao_seg) > 0),
      "Todas as aulas precisam de conteúdo e duração cadastrada",
    ],
    [
      "QUESTOES",
      questoes.filter((q) => !q.deleted_at).length >= MIN_QUESTOES,
      `Cadastre pelo menos ${MIN_QUESTOES} questões`,
    ],
    ["CARGA", carga > 0, "Defina a carga horária"],
    [
      "LASTRO",
      carga > 0 && carga * 3600 <= lastro,
      "O conteúdo cadastrado não cobre a carga horária declarada",
    ],
    ["INSTRUTOR", !!curso.instrutor_nome?.trim(), "Informe o instrutor"],
    ["RT", !!curso.responsavel_tecnico_nome?.trim(), "Informe o responsável técnico"],
    [
      "MODALIDADE",
      emiteCertificado(modalidadeDoCurso(curso)),
      motivoSemCertificado(modalidadeDoCurso(curso)),
    ],
  ];
  return [
    ...itens.map(([codigo, ok, texto]) => ({ codigo, ok, bloqueia: true, texto })),
    ...[
      ["TUTOR", curso.tutor_telefone, "Defina o contato do tutor"],
      ["PROJETO", curso.projeto_pedagogico_ref, "Anexe o projeto pedagógico"],
      ["PROGRAMA", curso.conteudo_programatico, "Preencha o conteúdo programático"],
      ["VALIDADE", curso.validade_meses, "Confira a validade do treinamento"],
    ].map(([codigo, valor, texto]) => ({ codigo, ok: !!valor, bloqueia: false, texto })),
  ];
}
