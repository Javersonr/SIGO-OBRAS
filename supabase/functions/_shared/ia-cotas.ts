/**
 * ia-cotas — constantes e funções PURAS das cotas diárias de IA por empresa (sem Deno e sem
 * imports): testáveis com node --test (ia-cotas.test.ts).
 *
 * Fonte única para quem cobra a cota (ia-processar/ia-uso.ts, que reexporta tudo daqui) e para
 * quem só mostra/edita os limites (saas-config/regras.ts) — assim as duas funções, que são
 * publicadas separadamente, nunca discordam dos padrões, das chaves ou da lista de ações.
 *
 * DUAS cotas por dia (fuso de Brasília), cada uma contando só as suas ações (uma requisição
 * conta numa cota só):
 *   · edital_*  → saas_config 'ia_cota_edital_dia', padrão COTA_EDITAL_PADRAO (400);
 *   · llm, extrair_documentos, validar_exames_pcmso e financeiro_ler_documento →
 *     saas_config 'ia_cota_geral_dia', padrão COTA_GERAL_PADRAO (300).
 * O padrão do painel do SaaS Admin (apps/web/src/lib/integracoes-ia.js) repete estes valores.
 */

export const COTA_EDITAL_PADRAO = 400;
export const CHAVE_COTA_EDITAL = "ia_cota_edital_dia";
export const ACOES_EDITAL = ["edital_extrair_parte", "edital_consolidar", "edital_atende"] as const;
export type AcaoEdital = (typeof ACOES_EDITAL)[number];

export const ehAcaoEdital = (acao: unknown): acao is AcaoEdital =>
  typeof acao === "string" && (ACOES_EDITAL as readonly string[]).includes(acao);

export const COTA_GERAL_PADRAO = 300;
export const CHAVE_COTA_GERAL = "ia_cota_geral_dia";
/** as demais ações de IA da ia-processar (o edital tem cota própria) */
export const ACOES_GERAIS = [
  "llm",
  "extrair_documentos",
  "validar_exames_pcmso",
  "financeiro_ler_documento",
] as const;

export const ehAcaoGeral = (acao: unknown): boolean =>
  typeof acao === "string" && (ACOES_GERAIS as readonly string[]).includes(acao);

/** valor de saas_config → cota (inteiro ≥ 1); ausente/inválido → padrão */
export function lerCota(valor: unknown, padrao = COTA_EDITAL_PADRAO): number {
  const n = typeof valor === "number" ? valor : Number(String(valor ?? "").trim());
  return Number.isInteger(n) && n >= 1 ? n : padrao;
}
