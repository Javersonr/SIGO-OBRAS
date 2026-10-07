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

/**
 * Data e hora SEM segundos ("05/10/2026 23:30") no fuso de Brasília (A6, T35). `toLocaleString` sem `timeZone` usa o
 * fuso do aparelho: a mesma declaração aparecia com horas diferentes conforme quem abria a tela. Inválido ou vazio
 * vira "" (quem chama esconde o campo).
 */
export function dataHoraCurtaBrasilia(valor) {
  if (valor === null || valor === undefined || valor === "") return "";
  const data = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(data.getTime())) return "";
  return data
    .toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
    .replace(", ", " "); // o ICU novo põe vírgula entre a data e a hora
}

/**
 * Só o DIA (DD/MM/AAAA) no fuso de Brasília, para um timestamp do banco (A6). Cortar o texto ISO com `slice(0, 10)`
 * dá o dia em UTC, e um lançamento feito depois das 21h de Brasília aparecia com a data do dia seguinte. Aceita
 * texto ISO, `Date` ou número; vazio ou inválido vira "—".
 */
export function diaBrasilia(valor) {
  if (valor === null || valor === undefined || valor === "") return "—";
  const data = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(data.getTime())) return "—";
  return data.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}
