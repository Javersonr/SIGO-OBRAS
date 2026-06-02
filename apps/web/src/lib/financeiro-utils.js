/**
 * Helpers compartilhados pra parsing/formatação financeira.
 *
 * Re-export estável de utils que originalmente viviam em
 * `components/financeiro/utils.jsx`. Qualquer módulo que precise dessas
 * funções (relatórios, dashboards, importadores) deve importar daqui em
 * vez de acoplar com a pasta /financeiro.
 */
export { parseData, parseValor, formatCurrency } from "@/components/financeiro/utils";

/**
 * Status financeiro normalizado.
 *
 * Histórico: o sistema misturava "pago" / "Pago" / "Realizado" / "Realizada"
 * em filtros espalhados, fazendo registros sumirem de relatórios.
 * Use SEMPRE essas constantes em comparações e checagens defensivas.
 */
export const STATUS_FINANCEIRO = {
  EM_ABERTO: "em_aberto",
  PENDENTE: "pendente",
  PAGO: "pago",
  REALIZADO: "realizado",
  ATRASADO: "atrasado",
  CANCELADO: "cancelado",
  AGENDADO: "agendado",
};

/**
 * Considera "encerrado" um lançamento que não deve mais aparecer em alertas
 * de vencimento (já saiu do fluxo aberto).
 */
const STATUS_ENCERRADOS = new Set([
  STATUS_FINANCEIRO.PAGO,
  STATUS_FINANCEIRO.REALIZADO,
  STATUS_FINANCEIRO.CANCELADO,
]);

export function isStatusEncerrado(status) {
  return STATUS_ENCERRADOS.has(String(status || "").toLowerCase());
}

export function normalizeStatus(status) {
  return String(status || "")
    .toLowerCase()
    .trim();
}

/**
 * Tipo de transação ("Receita"/"Despesa") normalizado — usado em DRE,
 * Balanço e qualquer agregação. Antes os filtros usavam comparação
 * case-sensitive direta, perdendo registros gravados em minúsculas.
 */
export function normalizeTipo(tipo) {
  return String(tipo || "")
    .toLowerCase()
    .trim();
}
export function isReceita(t) {
  return normalizeTipo(t?.tipo) === "receita";
}
export function isDespesa(t) {
  return normalizeTipo(t?.tipo) === "despesa";
}

/**
 * "Pago" considerando os 2 sinônimos histórios "pago" e "realizado"
 * (no Brasil, contabilidade usa "realizado" em alguns sistemas).
 */
const STATUS_PAGOS = new Set([STATUS_FINANCEIRO.PAGO, STATUS_FINANCEIRO.REALIZADO]);
export function isStatusPago(status) {
  return STATUS_PAGOS.has(normalizeStatus(status));
}

/**
 * "Em aberto" (não pago, não cancelado, não agendado pra futuro) — usado
 * em contas a receber/pagar do Balanço Patrimonial.
 */
const STATUS_PENDENTES = new Set([
  STATUS_FINANCEIRO.EM_ABERTO,
  STATUS_FINANCEIRO.PENDENTE,
  STATUS_FINANCEIRO.ATRASADO,
]);
export function isStatusPendente(status) {
  return STATUS_PENDENTES.has(normalizeStatus(status));
}
