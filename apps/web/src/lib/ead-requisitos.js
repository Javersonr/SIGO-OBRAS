export const MIN_QUESTOES = 5;
// Modalidade do curso (coluna treinamento_curso.modalidade, migração 0136). Só "ead" emite certificado:
// "apoio" é material de estudo do treinamento presencial (nunca emite) e "semipresencial" só passa a
// emitir quando a etapa prática for registrada (T12). Espelho do servidor (portal-funcionario/
// requisitos.ts); requisitos.test.ts confere que os dois dizem a mesma coisa.
export const MODALIDADES = ["ead", "semipresencial", "apoio"];
// A coluna; curso sem ela (lido antes da migração) vale "ead". Nome e código NÃO decidem.
export function modalidadeDoCurso(curso) {
  const m = String(curso?.modalidade ?? "").trim();
  return m === "" ? "ead" : m;
}
export function emiteCertificado(modalidade) {
  return (modalidade || "ead") === "ead";
}
export function motivoSemCertificado(modalidade) {
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
export function tempoObrigatorioSeg(aulas = []) {
  return aulas
    .filter((a) => !a.deleted_at)
    .reduce((total, a) => total + Math.max(0, Number(a.duracao_seg) || 0), 0);
}
export function requisitosDoCurso({ curso = {}, aulas = [], questoes = [] } = {}) {
  const ativas = aulas.filter((a) => !a.deleted_at);
  const carga = Number(curso.carga_horaria_horas) || 0;
  const lastro = tempoObrigatorioSeg(ativas);
  const arquivo = (a) =>
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
