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
