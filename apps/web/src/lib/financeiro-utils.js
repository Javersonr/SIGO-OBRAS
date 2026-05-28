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
