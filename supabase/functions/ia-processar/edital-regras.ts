/**
 * Reexport: as regras do edital moraram aqui até o Plano 2 do conector e agora ficam em
 * _shared/edital/ (o conector do Claude usa as mesmas). Mantido para os imports antigos
 * (escalonamento.ts e financeiro-ler.ts usam contarPreenchidos).
 */
export * from "../_shared/edital/edital-regras.ts";
