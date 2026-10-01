export const MIN_QUESTOES = 5;
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
      (curso.modalidade || "ead") === "ead" &&
        !/\bNR[\s-]*35\b/i.test(`${curso.codigo || ""} ${curso.nome || ""}`),
      "Este curso precisa de validação da etapa presencial antes de emitir certificado",
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
