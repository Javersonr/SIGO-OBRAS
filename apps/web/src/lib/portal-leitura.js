/**
 * Leituras e atividades no portal do aluno (A5) — regras puras, sem DOM e sem rede.
 *
 * Texto, apostila em PDF e tarefa de estudo concluem quando o aluno CHEGA AO FIM do conteúdo: o botão de
 * concluir fica desligado até lá e então acende. Não há relógio (contagem regressiva, "faltam X min"): o
 * tempo de tela continua contando com a tela aberta, só para a trilha. Questionário e caso têm tela
 * própria (QuestionarioPortal, CasoPortal) e concluem pelas ações deles, no servidor.
 * Quem usa: components/portal-funcionario/CursoPortal.jsx. Testes em portal-leitura.test.js.
 */

/** Tipos de aula que concluem pelo botão, depois de o aluno chegar ao fim do conteúdo. */
export const TIPOS_DE_LEITURA = ["pdf", "texto", "tarefa"];

export const ROTULO_LIDA = "Marcar como lida — li e compreendi";
export const ROTULO_TAREFA = "Fiz a atividade";

/** Aviso da prévia do RT no lugar da conclusão (na prévia nada é gravado). */
export const MSG_PREVIA_CONCLUSAO =
  "Prévia: aqui a aula seria concluída para o aluno. Nada foi gravado.";

const DICA_ATE_O_FIM = {
  pdf: "Role a apostila até o fim da última página para liberar o botão.",
  texto: "Role o texto até o fim para liberar o botão.",
  tarefa: "Leia as instruções até o fim para liberar o botão.",
};
const DICA_PREVIA = "Prévia: o clique não conclui a aula nem grava nada.";

/** A aula conclui pelo botão de leitura (PDF, texto ou tarefa)? */
export function ehLeitura(tipo) {
  return TIPOS_DE_LEITURA.includes(tipo);
}

/**
 * O botão de concluir uma leitura: null quando não aparece (outro tipo de aula, aula já concluída,
 * apostila indisponível); senão o rótulo, se está habilitado (só com o fim alcançado) e a dica de baixo.
 * Na prévia do RT o botão aparece e acende do mesmo jeito, mas o clique não grava nada.
 *
 * @param {{ tipo?: string, chegouAoFim?: boolean, concluida?: boolean, previa?: boolean,
 *   indisponivel?: boolean }} [p]
 * @returns {{ rotulo: string, habilitado: boolean, dica: string } | null}
 */
export function botaoDeLeitura({
  tipo,
  chegouAoFim = false,
  concluida = false,
  previa = false,
  indisponivel = false,
} = {}) {
  if (!ehLeitura(tipo) || concluida === true || indisponivel === true) return null;
  const habilitado = chegouAoFim === true;
  return {
    rotulo: tipo === "tarefa" ? ROTULO_TAREFA : ROTULO_LIDA,
    habilitado,
    dica: !habilitado ? DICA_ATE_O_FIM[tipo] : previa ? DICA_PREVIA : "",
  };
}

/**
 * Chave do painel da aula aberta: o id da aula, só no modo das aulas (null com a prova aberta ou sem aula).
 * O painel da aula e a lista de aulas ficam empilhados na mesma página; quando a chave muda (o aluno abriu
 * OUTRA aula, ou voltou da prova para as aulas) o CursoPortal leva o topo do painel ao topo da janela. Sem
 * isso a página continua rolada para baixo e o marcador do fim da aula nova (raiz = janela) já nasce à
 * vista, acendendo o botão sem leitura (A5). A mesma aula com os dados refeitos mantém a chave: a página
 * não rola no meio da leitura.
 *
 * @param {{ aulaId?: string|number|null, modo?: string }} [p]
 * @returns {string | null}
 */
export function chaveDoPainelDaAula({ aulaId, modo } = {}) {
  if (modo !== "aulas" || aulaId === null || aulaId === undefined || aulaId === "") return null;
  return String(aulaId);
}

const ROTULO_NA_LISTA = {
  questionario: "questionário",
  caso: "estudo de caso",
  tarefa: "atividade de estudo",
};

/** Rótulo pequeno do tipo na lista de aulas: só os tipos de atividade; vídeo, PDF e texto ficam como antes. */
export function rotuloDoTipoNaLista(tipo) {
  return ROTULO_NA_LISTA[tipo] ?? "";
}

/** "35 min", "1 h", "1 h 10 min" a partir do tempo cadastrado da aula (segundos); null sem tempo válido. */
export function tempoPrevisto(duracaoSeg) {
  const s = Number(duracaoSeg);
  if (!Number.isFinite(s) || s <= 0) return null;
  const minutos = Math.max(1, Math.round(s / 60));
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  if (!horas) return `${resto} min`;
  return resto ? `${horas} h ${resto} min` : `${horas} h`;
}

/**
 * Aviso depois de uma atividade concluir a aula pela ação própria (questionário aprovado, caso concluído).
 * `dados` é a resposta da ação `dados` buscada de novo (null = a busca falhou: a tela só afirma o que o
 * servidor confirmou). A resposta do questionário não diz se falta a prova final: a conta sai das aulas
 * buscadas de novo.
 */
export function avisoDeAulaConcluida({ resposta, dados, matriculaId } = {}) {
  const item = dados?.cursos?.find?.((c) => c?.matricula?.id === matriculaId) ?? null;
  if (!item) return "Aula concluída.";
  if (resposta?.curso_concluido === true || item.matricula?.status === "concluido") {
    return "Curso concluído!";
  }
  const aulas = Array.isArray(item.aulas) ? item.aulas.filter(Boolean) : [];
  const todas = aulas.length > 0 && aulas.every((a) => a.concluida === true);
  const faltaProva =
    resposta?.precisa_avaliacao === true ||
    (todas && item.curso?.tem_avaliacao === true && item.matricula?.avaliacao_aprovada !== true);
  if (faltaProva) return "Todas as aulas concluídas — agora faça a avaliação final.";
  return todas ? "Aula concluída." : "Aula concluída — a próxima já está liberada.";
}
