/**
 * Janelas flutuantes (ex.: visualizador de anexos) ficam FORA das gavetas e
 * diálogos Radix. Sem isto, clicar nelas conta como "clique fora" e fecha a
 * gaveta/diálogo que está aberto por baixo.
 */
export const ATRIBUTO_JANELA_FLUTUANTE = "data-janela-flutuante";

export function dentroDeJanelaFlutuante(evento) {
  const alvo = evento?.target || evento?.detail?.originalEvent?.target;
  return !!(alvo && typeof alvo.closest === "function" && alvo.closest(`[${ATRIBUTO_JANELA_FLUTUANTE}]`));
}

/** Envolve o handler do Radix: ignora interações vindas de janela flutuante. */
export function ignorarJanelaFlutuante(handler) {
  return (evento) => {
    if (dentroDeJanelaFlutuante(evento)) {
      evento.preventDefault();
      return;
    }
    handler?.(evento);
  };
}

/**
 * Esc com janela flutuante aberta fecha SÓ a janela: ela marca o evento
 * (`fechouJanelaFlutuante`, antes do Radix, em captura na window) e aqui a
 * gaveta/diálogo de baixo ignora esse Esc — senão fecharia junto e a edição
 * em andamento se perderia.
 */
export function ignorarEscDaJanelaFlutuante(handler) {
  return (evento) => {
    if (evento?.fechouJanelaFlutuante) {
      evento.preventDefault();
      return;
    }
    handler?.(evento);
  };
}
