/**
 * Oportunidade ganha (botão do troféu ou arrastar para a coluna Ganho): vira obra em Projetos e sai
 * do funil arquivada, como a perdida. Quem chama só arquiva DEPOIS de a obra existir: se a criação
 * falhar, o status volta e nada é arquivado.
 */

/** O novo status leva a oportunidade para Projetos e a arquiva. */
export function arquivaAoMudarPara(statusNovo) {
  return statusNovo?.tipo === "ganho";
}

/** Linha do histórico da oportunidade quando ela é arquivada ao ganhar. */
export function descricaoArquivadaAoGanhar(nomeObra) {
  const nome = String(nomeObra ?? "").trim();
  return nome
    ? `Oportunidade ganha: obra "${nome}" em Projetos e oportunidade arquivada`
    : "Oportunidade ganha: obra criada em Projetos e oportunidade arquivada";
}
