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
