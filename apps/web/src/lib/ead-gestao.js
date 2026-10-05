/**
 * Regras puras da tela do RH dos treinamentos EAD (T19) — sem DOM e sem rede.
 *
 * Quem usa: components/seguranca/TreinamentosEadTab.jsx (mover aula, matricular e remover matrícula
 * — T20). Os testes ficam em ead-gestao.test.js. A tela só liga a rede: aqui se decide o que gravar.
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

/**
 * Mensagem mostrada quando a remoção é bloqueada por `podeRemoverMatricula`. O botão "Revogar" fica
 * nos detalhes da matrícula (MatriculaAuditoriaSheet).
 */
export const MSG_REVOGUE_ANTES =
  "Esta matrícula tem certificado emitido e ainda válido. Revogue o certificado antes de remover " +
  "a matrícula: abra os Detalhes da matrícula (coluna Ações) e use o botão Revogar.";

/**
 * Pode remover a matrícula? Não, enquanto ela tiver um certificado emitido que não foi revogado:
 * remover a matrícula some com o curso do portal e da tela, mas o certificado continuaria válido na
 * consulta pública, sem ninguém para revogá-lo.
 *
 * `certificado` é a linha de `treinamento_certificado` da matrícula (no máximo uma: `matricula_id` é
 * único) ou vazio quando não há. Sem certificado pode: curso em andamento, ou concluído e ainda sem
 * assinatura do aluno. Revogado também pode (já não vale mais nada). Sem matrícula, não há o que
 * remover (false).
 */
export function podeRemoverMatricula(matricula, certificado) {
  if (!matricula) return false;
  if (!certificado) return true;
  return !!certificado.revogado_em;
}

/**
 * Texto da confirmação de remoção. Descreve o que de fato acontece: a exclusão é lógica (a matrícula
 * ganha `deleted_at`), então o aluno perde o curso no portal e a tela deixa de mostrar a matrícula,
 * mas progresso, tentativas e trilha continuam no banco como registro de auditoria. Rematricular
 * cria uma matrícula nova, que começa do zero. Só vale para matrícula que `podeRemoverMatricula`
 * liberou.
 */
export function textoConfirmarRemocao({ matricula, certificado, nomeFuncionario, nomeCurso }) {
  const de = nomeFuncionario ? `de ${nomeFuncionario}` : "deste funcionário";
  const em = nomeCurso ? `no curso "${nomeCurso}"` : "neste curso";

  let situacao;
  if (certificado?.revogado_em) {
    situacao =
      "O certificado dele já está revogado e continua aparecendo como revogado na consulta pública.";
  } else if (matricula?.status === "concluido") {
    situacao =
      "O funcionário concluiu o curso, mas ainda não assinou o certificado: a conclusão deixa de " +
      "valer e ele não poderá mais assinar nem emitir o certificado.";
  } else if (matricula?.status === "em_andamento") {
    situacao = "O curso está em andamento.";
  } else {
    situacao = "O funcionário ainda não iniciou o curso.";
  }

  return [
    `Remover a matrícula ${de} ${em}?`,
    "",
    situacao,
    "",
    "• O funcionário deixa de ver o curso no Portal do Funcionário.",
    "• O progresso nas aulas, as tentativas da prova e a trilha de acessos ficam guardados como " +
      "registro de auditoria, mas não aparecem mais nesta tela.",
    "• Se for matriculado de novo, o curso recomeça do zero (aulas, tempo assistido e tentativas).",
  ].join("\n");
}
