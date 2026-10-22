/**
 * Dados do cronograma físico-financeiro (cabeçalho, prazo e resumo) — porte linha a linha de
 * apps/web/src/lib/cronograma-export.js (montarDadosCronograma, nomeArquivoCronograma e o título)
 * para o servidor (spec 2026-10-09 §3). A tela continua com a lib dela; a paridade (mesma entrada,
 * mesmo resultado) é conferida no Vitest (apps/web/src/lib/documentos-paridade.test.js).
 * Puro: sem Deno e sem import de URL.
 */
import {
  normalizarCronograma,
  resumoCronograma,
  type EtapaCron,
  type ResumoCronograma,
} from "../orcamento/cronograma.ts";
import {
  montarCabecalhoLicitacao,
  nomeArquivoProposta,
  type CabecalhoLicitacao,
} from "./dados-proposta.ts";

export const TITULO_CRONOGRAMA = "Cronograma físico-financeiro";

export interface DadosCronograma extends CabecalhoLicitacao {
  titulo: string;
  prazoMeses: number;
  resumo: ResumoCronograma;
}

/**
 * DadosCronograma = { empresa: { nome, cnpj, endereco, contato }, titulo, orgao, objeto,
 *   edital, prazoMeses, resumo, localData, representante: { nome, cargo, cpf } }
 *
 * - cabeçalho, local/data e representante: os mesmos da proposta (montarCabecalhoLicitacao);
 * - resumo: resumoCronograma(etapas, cronograma normalizado). Só as etapas do orçamento
 *   entram; linha do cronograma sem etapa (órfã) não sai no arquivo.
 */
export function montarDadosCronograma({
  etapas,
  cronograma,
  info,
  oportunidade,
  empresa,
  representante,
  opcoes,
}: {
  etapas: EtapaCron[];
  cronograma: unknown;
  info?: unknown;
  oportunidade?: unknown;
  empresa?: unknown;
  representante?: unknown;
  opcoes?: { local?: string; dataISO?: string };
}): DadosCronograma {
  const cron = normalizarCronograma(cronograma);
  const cab = montarCabecalhoLicitacao({ info, oportunidade, empresa, representante, opcoes });
  return {
    empresa: cab.empresa,
    titulo: TITULO_CRONOGRAMA,
    orgao: cab.orgao,
    objeto: cab.objeto,
    edital: cab.edital,
    prazoMeses: cron.meses,
    resumo: resumoCronograma(etapas || [], cron),
    localData: cab.localData,
    representante: cab.representante,
  };
}

/** "Cronograma - <nome> - <aaaa-mm-dd>.<ext>", com o mesmo saneamento da proposta. */
export function nomeArquivoCronograma(
  nomeOportunidade: unknown,
  dataISO: unknown,
  ext: string
): string {
  return nomeArquivoProposta(nomeOportunidade, dataISO, ext).replace(
    /^Proposta - /,
    "Cronograma - "
  );
}
