/**
 * Pedidos de confirmação das telas do RH, no lugar de `window.confirm` (que some no celular, não
 * combina com o resto da tela e não deixa explicar o que acontece). Lógica pura: quem desenha o
 * diálogo é `components/shared/ConfirmarDialog.jsx`, que liga `aoMudar` ao estado do React.
 *
 *   const c = criarConfirmacoes(setPedido);
 *   if (!(await c.pedir({ titulo, texto, rotuloConfirmar, destrutivo }))) return;
 *
 * `pedir` devolve uma promessa que resolve `true` só quando o RH confirma; cancelar, Esc, clicar fora,
 * um pedido novo por cima ou a tela sumir resolvem `false` (na dúvida, não faz a ação).
 */
export function criarConfirmacoes(aoMudar) {
  let pendente = null; // `resolve` da promessa do pedido que está na tela

  function encerrar(resposta, avisarTela) {
    const resolve = pendente;
    pendente = null;
    if (!resolve) return;
    if (avisarTela) aoMudar(null);
    resolve(resposta);
  }

  return {
    /** Mostra o pedido. Um pedido anterior ainda aberto é cancelado (`false`). */
    pedir(config) {
      encerrar(false, false);
      return new Promise((resolve) => {
        pendente = resolve;
        aoMudar({ ...config });
      });
    },
    /** Resposta do RH. Só `true` confirma. Sem pedido aberto, ou 2ª resposta, não faz nada. */
    responder(resposta) {
      encerrar(resposta === true, true);
    },
    /** A tela foi desmontada: cancela o que estava aberto sem mexer no estado. */
    descartar() {
      encerrar(false, false);
    },
  };
}
