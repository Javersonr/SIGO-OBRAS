/**
 * Dúvidas ao tutor na tela do aluno (T21): em que aula cada uma foi feita, quantas já têm resposta e o texto do
 * aviso depois de enviar. Regras puras, sem DOM e sem rede (testes em portal-duvidas.test.js). Sem emoji: o texto
 * da tela do portal usa ícone do `lucide-react` (T36, sem-emoji.test.js).
 */

/**
 * "Aula 2: Título" para a dúvida feita numa aula; null quando a dúvida é do curso todo ou a aula já não está
 * na lista (apagada pelo RH): nesse caso a tela mostra só a pergunta.
 */
export function rotuloDaAulaDaDuvida(duvida, aulas) {
  if (!duvida?.aula_id || !Array.isArray(aulas)) return null;
  const aula = aulas.find((a) => a?.id === duvida.aula_id);
  if (!aula?.titulo) return null;
  return aula.numero ? `Aula ${aula.numero}: ${aula.titulo}` : aula.titulo;
}

/** Quantas dúvidas já têm resposta e quantas ainda aguardam (resposta vazia ou só com espaços aguarda). */
export function resumoDasDuvidas(duvidas) {
  const lista = Array.isArray(duvidas) ? duvidas : [];
  const respondidas = lista.filter((d) => String(d?.resposta ?? "").trim()).length;
  return { total: lista.length, respondidas, aguardando: lista.length - respondidas };
}

/**
 * O aviso depois de enviar a dúvida. O aluno só vê a resposta quando o RH ou o tutor a grava, e a tela não
 * consulta sozinha: por isso o texto manda para o botão "Atualizar", que traz a resposta sem sair do curso.
 * `tutorAvisado` vem do servidor (só é verdadeiro quando o aviso ao WhatsApp do tutor saiu).
 */
export function mensagemDuvidaEnviada(tutorAvisado) {
  return (
    (tutorAvisado ? "Dúvida enviada: o tutor foi avisado. " : "Dúvida enviada. ") +
    'Quando houver resposta, ela aparece aqui; use o botão "Atualizar" para conferir.'
  );
}

/** "3 dúvidas: 2 respondidas, 1 aguardando"; null quando o aluno ainda não fez nenhuma. */
export function textoDoResumo(resumo) {
  const { total = 0, respondidas = 0, aguardando = 0 } = resumo ?? {};
  if (!total) return null;
  const partes = [];
  if (respondidas === 0) partes.push("nenhuma respondida");
  else partes.push(`${respondidas} ${respondidas === 1 ? "respondida" : "respondidas"}`);
  if (aguardando > 0) partes.push(`${aguardando} aguardando`);
  return `${total} ${total === 1 ? "dúvida" : "dúvidas"}: ${partes.join(", ")}`;
}
