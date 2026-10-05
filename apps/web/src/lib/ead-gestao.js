/**
 * Regras puras da tela do RH dos treinamentos EAD (T19) — sem DOM e sem rede.
 *
 * Quem usa: components/seguranca/TreinamentosEadTab.jsx (mover aula e matricular). Os testes ficam em
 * ead-gestao.test.js. A tela só liga a rede: aqui se decide o que gravar.
 */

/**
 * Move a aula `aulaId` uma posição na lista (dir = -1 sobe, +1 desce) e devolve a lista renumerada
 * 1..n, que é o que a tela grava. `aulas` vem na ordem em que o RH enxerga (a da coluna `ordem`).
 *
 * - `ids`: os ids na nova ordem.
 * - `mudancas`: só as aulas cuja `ordem` gravada difere da nova posição, na ordem da lista. A
 *   renumeração (e não a troca dos dois valores) também desfaz buracos e empates deixados por aula
 *   removida ou por gravação que parou no meio.
 *
 * Devolve null quando não há o que mover: lista vazia, aula inexistente, sentido diferente de -1/+1
 * ou aula já na ponta.
 */
export function reordenarAulas(aulas, aulaId, dir) {
  if (!Array.isArray(aulas) || (dir !== -1 && dir !== 1)) return null;
  const origem = aulas.findIndex((a) => a?.id === aulaId);
  const destino = origem + dir;
  if (origem < 0 || destino < 0 || destino >= aulas.length) return null;
  const lista = [...aulas];
  [lista[origem], lista[destino]] = [lista[destino], lista[origem]];
  const mudancas = [];
  lista.forEach((a, i) => {
    const ordem = i + 1;
    if (a.ordem !== ordem) mudancas.push({ id: a.id, ordem });
  });
  return { ids: lista.map((a) => a.id), mudancas };
}

/**
 * Matrículas a criar para os funcionários escolhidos num curso. Quem já tem matrícula aberta (não
 * concluída) no curso é ignorado; quem já concluiu pode ser matriculado de novo (renovação). Todas
 * as linhas levam as mesmas chaves, como o `bulkCreate` (um INSERT só) exige.
 */
export function matriculasNovas({ matriculas, cursoId, funcionarioIds, empresaId }) {
  const abertos = new Set(
    (Array.isArray(matriculas) ? matriculas : [])
      .filter((m) => m?.curso_id === cursoId && m.status !== "concluido")
      .map((m) => m.funcionario_id)
  );
  const escolhidos = [...new Set(Array.isArray(funcionarioIds) ? funcionarioIds : [])];
  const novas = escolhidos
    .filter((id) => !abertos.has(id))
    .map((funcionario_id) => ({
      empresa_id: empresaId,
      curso_id: cursoId,
      funcionario_id,
      status: "pendente",
    }));
  return { novas, ignorados: escolhidos.length - novas.length };
}
