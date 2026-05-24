/**
 * Hook que calcula as localizações válidas para o filtro de ferramentas.
 * Inclui apenas almoxarifados ativos e placas de caminhões válidos.
 * Exclui localizações de funcionários (campo funcionario_id preenchido).
 */
export function calcularLocalizacoesFiltro(ferramentas, almoxarifados, caminhoes) {
  const placasAtivas = new Set(caminhoes.map(c => c.placa).filter(Boolean));
  
  // Apenas localizações de ferramentas que NÃO estão com funcionário
  const locsNasFerramentas = new Set(
    ferramentas
      .filter(f => !f.funcionario_id)
      .map(f => f.localizacao)
      .filter(Boolean)
  );

  return [
    ...almoxarifados.filter(a => locsNasFerramentas.has(a)),
    ...[...placasAtivas].filter(p => locsNasFerramentas.has(p))
  ];
}