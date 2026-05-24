/**
 * Hook utilitário para filtrar dados em Modo Holding (Consolidado)
 * Sem quebrar a estrutura existente de nenhum módulo
 */

export const useHoldingFilter = (dados, empresaSelecionada, isHoldingMode) => {
  if (!isHoldingMode || empresaSelecionada === 'todas') {
    return dados;
  }
  
  // Filtrar apenas pela empresa selecionada
  return dados.filter(item => item.empresa_id === empresaSelecionada);
};

export const preparaFiltroHolding = (empresaSelecionada, isHoldingMode) => {
  // Retorna o filtro a ser usado nas queries
  if (!isHoldingMode || empresaSelecionada === 'todas') {
    return null; // Sem filtro (traz tudo)
  }
  
  return { empresa_id: empresaSelecionada };
};