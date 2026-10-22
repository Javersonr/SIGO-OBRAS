/**
 * Data da sessão da licitação, para conferir se um documento da habilitação vence antes dela.
 *
 * Duas fontes, nesta ordem:
 *  1. `oportunidade.licitacao_data` (coluna date): é a "Sessão" que a tela mostra e que o usuário edita
 *     (por exemplo, quando a sessão é adiada). Vale mesmo que já tenha passado: quem corrigiu a data sabe
 *     mais do que o edital;
 *  2. `edital_analise.extraido.datas.sessao.data`: o que o Claude leu do edital.
 * Valor que não é uma data real "AAAA-MM-DD" é ignorado (a fonte seguinte vale). Sem nenhuma, ou só com
 * data que já passou, `futura` é null: quem usa a data NÃO pode calar, tem de avisar que não conferiu.
 *
 * Puro: sem Deno e sem import de URL.
 */
import { jsonbComoObjeto } from "../conector/jsonb-objeto.ts";
import { diasAte } from "./documentos-regras.ts";

export type OrigemDaSessao = "oportunidade" | "edital";

export interface SessaoDaOportunidade {
  /** A data escolhida ("AAAA-MM-DD"), mesmo que já tenha passado; null se nenhuma fonte tem data válida. */
  data: string | null;
  origem: OrigemDaSessao | null;
  /** A mesma data, só se é depois de hoje (hoje já não conta); senão null. */
  futura: string | null;
}

/** "AAAA-MM-DD" que existe no calendário (30/02 não passa); qualquer outra coisa → null. */
function dataReal(v: unknown): string | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && diasAte(v, v) !== null
    ? v
    : null;
}

/** A oportunidade como lida do banco: só `licitacao_data` e `edital_analise` interessam. */
export function dataDaSessao(
  oportunidade: { licitacao_data?: unknown; edital_analise?: unknown } | null | undefined,
  hojeISO: string
): SessaoDaOportunidade {
  const daColuna = dataReal(oportunidade?.licitacao_data);
  // deno-lint-ignore no-explicit-any
  const doEdital = dataReal(
    (jsonbComoObjeto(oportunidade?.edital_analise) as any)?.extraido?.datas?.sessao?.data
  );
  const data = daColuna ?? doEdital;
  const origem: OrigemDaSessao | null = daColuna ? "oportunidade" : doEdital ? "edital" : null;
  return { data, origem, futura: data !== null && data > hojeISO ? data : null };
}
