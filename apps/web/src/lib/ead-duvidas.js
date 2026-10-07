/**
 * Dúvidas dos alunos ao tutor, do lado do RH (T21): o que está sem resposta, os filtros por curso e por aluno e o
 * número que aparece no gatilho da aba "Treinamentos" de RH & Segurança. Lógica pura, para ser testada.
 *
 * "Sem resposta" é a mesma conta em todo lugar (cartão de dúvidas, contador da aba): a coluna `resposta` nula,
 * vazia ou só com espaços. O banco só deixa o RH gravar a resposta (trigger `duvida_so_resposta`, 0130).
 */

const SEM_NOME_DO_CURSO = "Curso removido";
const SEM_NOME_DO_ALUNO = "Aluno não encontrado";
// o gatilho da aba é pequeno: acima disto mostra "99+"
const TETO_DO_CONTADOR = 99;

/** Dúvida que ainda não tem resposta. */
export function ehPendente(duvida) {
  return !String(duvida?.resposta ?? "").trim();
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
