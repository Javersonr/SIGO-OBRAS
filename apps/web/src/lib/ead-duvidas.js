/**
 * Dúvidas dos alunos ao tutor, do lado do RH (T21): o que está sem resposta, os filtros por curso e por aluno e o
 * número que aparece no gatilho da aba "Treinamentos" de RH & Segurança. Lógica pura, para ser testada.
 *
 * "Sem resposta" é UMA conta só, a do banco (A6): a coluna `resposta` nula ou vazia. O contador do gatilho da
 * aba (página de RH & Segurança) conta no banco com `FILTRO_SEM_RESPOSTA`, e o cartão de dúvidas conta as linhas
 * que carregou com `ehPendente`: as duas dizem a mesma coisa, então o número do gatilho e o número de cartões
 * pendentes não divergem. O banco não sabe separar "só espaços" de uma resposta, e a tela nunca grava resposta
 * em branco (`responder` recusa o texto vazio). O banco só deixa o RH gravar a resposta (trigger
 * `duvida_so_resposta`, 0130).
 */

const SEM_NOME_DO_CURSO = "Curso removido";
const SEM_NOME_DO_ALUNO = "Aluno não encontrado";
// o gatilho da aba é pequeno: acima disto mostra "99+"
const TETO_DO_CONTADOR = 99;

/**
 * O mesmo critério de `ehPendente`, no formato do PostgREST (`.or(...)`): resposta nula ou vazia. Quem conta no
 * banco (`supabase.from("treinamento_duvida").select(...).or(FILTRO_SEM_RESPOSTA)`) usa isto; mudar a conta
 * exige mudar as duas.
 */
export const FILTRO_SEM_RESPOSTA = "resposta.is.null,resposta.eq.";

/** Dúvida que ainda não tem resposta: `resposta` nula, ausente ou vazia (a mesma conta do banco). */
export function ehPendente(duvida) {
  const resposta = duvida?.resposta;
  return resposta === null || resposta === undefined || resposta === "";
}

/**
 * O que fazer com o texto que o RH escreveu para uma dúvida (A6): `nada` (vazio), `fechar_edicao` (a mesma
 * resposta, nada a gravar nem a avisar), `responder` (a primeira resposta: a tela grava direto) ou `editar`
 * (a dúvida em edição: passa pelo servidor, que guarda a versão ANTERIOR na trilha, evento
 * `duvida_resposta_editada`). `editando` é o id da dúvida cuja edição está aberta (ou null): responder A com a B em
 * edição é uma resposta nova de A, não uma edição.
 * @returns {{ acao: "nada" | "fechar_edicao" } | { acao: "responder" | "editar", texto: string }}
 */
export function decidirResposta({ duvida, texto, editando }) {
  const novo = String(texto ?? "").trim();
  if (!novo) return { acao: "nada" };
  const emEdicao = duvida?.id != null && editando === duvida.id;
  if (emEdicao && novo === String(duvida.resposta ?? "").trim()) return { acao: "fechar_edicao" };
  return { acao: emEdicao ? "editar" : "responder", texto: novo };
}

/**
 * Qual edição segue aberta depois de responder a dúvida `duvidaId`: a própria fecha; a de OUTRA dúvida
 * continua (antes responder uma fechava a edição de qualquer uma, e a caixa "avisar de novo" voltava desmarcada).
 */
export function edicaoDepoisDeResponder(editando, duvidaId) {
  return editando === duvidaId ? null : (editando ?? null);
}

const doRecorte = (duvida, { cursoId = "", funcionarioId = "" } = {}) =>
  (!cursoId || duvida.curso_id === cursoId) &&
  (!funcionarioId || duvida.funcionario_id === funcionarioId);

/** Quantas dúvidas estão sem resposta, no recorte pedido (curso e/ou aluno). */
export function contarPendentes(duvidas, recorte = {}) {
  return (Array.isArray(duvidas) ? duvidas : []).filter(
    (d) => ehPendente(d) && doRecorte(d, recorte)
  ).length;
}

/**
 * As dúvidas da lista, da mais nova para a mais antiga. `mostrar`: "pendentes" (o padrão) ou "todas".
 * `cursoId` e `funcionarioId` vazios valem "todos". A lista recebida não é alterada.
 */
export function filtrarDuvidas(
  duvidas,
  { cursoId = "", funcionarioId = "", mostrar = "pendentes" } = {}
) {
  return (Array.isArray(duvidas) ? duvidas : [])
    .filter(
      (d) => doRecorte(d, { cursoId, funcionarioId }) && (mostrar === "todas" || ehPendente(d))
    )
    .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
}

function agrupar(duvidas, campo, nomeDe, semNome) {
  const grupos = new Map();
  for (const d of duvidas) {
    const id = d[campo];
    if (!id) continue;
    const g = grupos.get(id) ?? { id, nome: nomeDe?.(id) || semNome, total: 0, pendentes: 0 };
    g.total += 1;
    if (ehPendente(d)) g.pendentes += 1;
    grupos.set(id, g);
  }
  return [...grupos.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/**
 * O que oferecer nos filtros: só curso e aluno que têm dúvida, com o total e as sem resposta de cada um.
 * `nomeDoCurso(id)` e `nomeDoFuncionario(id)` dão o nome (aluno removido ou curso apagado ganham um rótulo
 * em vez de sumir da lista).
 */
export function opcoesDoFiltro(duvidas, { nomeDoCurso, nomeDoFuncionario } = {}) {
  const lista = Array.isArray(duvidas) ? duvidas : [];
  return {
    cursos: agrupar(lista, "curso_id", nomeDoCurso, SEM_NOME_DO_CURSO),
    alunos: agrupar(lista, "funcionario_id", nomeDoFuncionario, SEM_NOME_DO_ALUNO),
  };
}

/** "3 dúvidas sem resposta", "1 dúvida sem resposta" ou "Nenhuma dúvida sem resposta". */
export function textoPendentes(quantidade) {
  const n = Number(quantidade) || 0;
  if (n <= 0) return "Nenhuma dúvida sem resposta";
  return `${n} ${n === 1 ? "dúvida" : "dúvidas"} sem resposta`;
}

/** O texto do gatilho da aba: "Treinamentos" ou "Treinamentos (3)" (e "99+" para muitas). */
export function rotuloDaAbaTreinamentos(pendentes) {
  const n = Number(pendentes) || 0;
  if (n <= 0) return "Treinamentos";
  return `Treinamentos (${n > TETO_DO_CONTADOR ? `${TETO_DO_CONTADOR}+` : n})`;
}
