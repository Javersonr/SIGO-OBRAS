export function modelosDeTreinamento(treinamentos = []) {
  return treinamentos.filter(
    (t) => !t.funcao_id && !t.modelo_treinamento_id && !t.deleted_at && t.ativo !== false
  );
}

export function dadosCursoDoModelo(modelo) {
  return {
    modelo_treinamento_id: modelo.id,
    nome: modelo.nome,
    codigo: modelo.codigo || "",
    carga_horaria_horas: modelo.carga_horaria ?? "",
    validade_meses: modelo.validade_meses ?? "",
    conteudo_programatico: modelo.conteudo_programatico || "",
  };
}

export function modelosSemCurso(treinamentos, cursos) {
  const vinculados = new Set(cursos.map((c) => c.modelo_treinamento_id).filter(Boolean));
  return modelosDeTreinamento(treinamentos).filter((t) => !vinculados.has(t.id));
}

/**
 * O formulário do curso EAD ainda precisa de um treinamento do cadastro central para ser salvo?
 * Curso NOVO exige o vínculo. Curso ANTIGO, gravado sem vínculo (criado antes da 0131), pode ser salvo sem
 * ele, para o RH despublicar, preencher o instrutor e marcar a modalidade sem mexer em carga, validade e
 * conteúdo (decisão C4 do Javerson, 06/10/2026). Curso que já está ligado não pode ser desligado ao salvar.
 */
export function faltaModeloCentral(form, gravado) {
  if (form?.modelo_treinamento_id) return false;
  return !(gravado?.id && !gravado.modelo_treinamento_id);
}

/** Texto da tela do curso EAD quando ele não está ligado a um treinamento do cadastro central. */
export const TEXTO_CURSO_SEM_VINCULO =
  "Este curso não está vinculado a um treinamento do cadastro central e pode ser salvo sem o " +
  "vínculo: nome, código, carga horária, validade e conteúdo seguem editáveis aqui.";

/**
 * Mostra o aviso acima? Só para curso JÁ gravado (tem id) e sem vínculo, nem no formulário nem no banco:
 * vale para qualquer curso nessa situação (criado antes do cadastro central, ou depois por fora da tela,
 * como no `tools/ead-sync-cursos.py`). Curso novo exige o vínculo para salvar (`faltaModeloCentral`), e
 * o aviso some assim que o RH escolhe o treinamento.
 */
export function mostrarAvisoDeCursoSemVinculo(form, gravado) {
  return !!form?.id && !form.modelo_treinamento_id && !gravado?.modelo_treinamento_id;
}
