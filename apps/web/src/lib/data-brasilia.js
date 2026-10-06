/**
 * Data e hora no fuso de Brasília (America/Sao_Paulo), para o que o certificado EAD mostra da assinatura.
 * Sem `timeZone`, `toLocaleString` usa o fuso do APARELHO: o PDF e a página de validação mostrariam
 * horas diferentes conforme quem abre (MT, AM, AC ou um aparelho em UTC, onde uma assinatura às 23h30 de
 * Brasília sairia já no dia seguinte). Brasília não tem horário de verão desde 2019.
 * Puro (sem DOM, sem sigoClient). Aceita texto ISO, `Date` ou número; vazio ou inválido vira "—".
 */
export function dataHoraBrasilia(valor) {
  if (valor === null || valor === undefined || valor === "") return "—";
  const data = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(data.getTime())) return "—";
  return data.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}
