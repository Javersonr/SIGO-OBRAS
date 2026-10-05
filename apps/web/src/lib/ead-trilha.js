// Trilha de auditoria do EAD (tela do RH). Função pura: sem importar @/api/sigoClient.

/** Texto do selo nos eventos que o navegador do aluno relatou (e não o servidor). */
export const ROTULO_ORIGEM_NAVEGADOR = "informado pelo navegador";

/**
 * Origem do evento da trilha (`treinamento_evento.origem`, migração 0135): "navegador" quando o
 * navegador do aluno INFORMOU o que aconteceu (abriu a aula, play, pausa, saiu da aba...; o servidor
 * só carimba hora e IP) e "servidor" quando o servidor viu e decidiu (login, aula concluída, prova,
 * certificado...). Qualquer outro valor, ou a falta dele, vale "servidor": só "navegador" é selo.
 */
export function origemDoEvento(evento) {
  return evento?.origem === "navegador" ? "navegador" : "servidor";
}

/** O evento leva o selo "informado pelo navegador"? */
export function eventoInformadoPeloNavegador(evento) {
  return origemDoEvento(evento) === "navegador";
}
