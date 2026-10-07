/**
 * Tipo do treinamento (inicial, periódico ou eventual) no certificado EAD (T23): módulo PURO.
 *
 * Sem `Deno.*`, sem import de URL e sem banco/rede: o `index.ts` lê a matrícula e chama esta função, que é
 * testada no Node (`tipo-treinamento.test.ts`). Espelho no front: `apps/web/src/lib/ead-tipo-matricula.js`.
 *
 * NR-1, 1.7.1.2 a 1.7.1.2.3.1: o treinamento é inicial (antes de começar a atividade), periódico (no prazo da
 * norma) ou eventual (mudança de ambiente, equipamento ou procedimento, acidente, afastamento longo...). O RH
 * escolhe o tipo ao matricular (coluna `treinamento_matricula.tipo`, migração 0142) e, no eventual, escreve o
 * motivo (`motivo_eventual`, de 3 a 200 caracteres). Na emissão os dois são CONGELADOS em `dados` do
 * certificado, junto do resto, e entram no hash: o certificado e a consulta pública dizem qual foi o tipo.
 */

/** Os três tipos que o banco aceita (CHECK `treinamento_matricula_tipo_chk`). */
export const TIPOS_DE_TREINAMENTO = ["inicial", "periodico", "eventual"] as const;
export type TipoDeTreinamento = (typeof TIPOS_DE_TREINAMENTO)[number];

/** Limites do motivo do treinamento eventual (CHECK `treinamento_matricula_motivo_eventual_chk`). */
export const MOTIVO_EVENTUAL_MIN = 3;
export const MOTIVO_EVENTUAL_MAX = 200;

// Aparar e contar como o CHECK da 0142: `btrim(motivo_eventual, E' \t\r\n\f\x0b')` tira só espaço, tab, CR, LF, FF e VT, e
// `char_length` conta caracteres (o `.length` do JS conta unidades UTF-16: um emoji vale 2). Com regras diferentes,
// um motivo que o banco aceitou saía do certificado sem o tipo (A6, T23).
const ESPACOS_DO_BANCO = /^[ \t\r\n\f\v]+|[ \t\r\n\f\v]+$/g;
const apararMotivo = (v: unknown): string =>
  typeof v === "string" ? v.replace(ESPACOS_DO_BANCO, "") : "";

/** O que entra em `dados` do certificado: o tipo e, só no eventual, o motivo. */
export interface TipoNoCertificado {
  tipo_treinamento?: TipoDeTreinamento;
  motivo_eventual?: string;
}

/**
 * As chaves de `dados` para o tipo da matrícula. Chave que o servidor não sabe afirmar NÃO entra (o certificado
 * sai como saía antes da T23, sem a informação), em vez de virar "inicial" por omissão num documento legal:
 *  - tipo ausente ou desconhecido (a coluna tem CHECK, então só acontece se a matrícula não foi lida com ela);
 *  - eventual sem motivo, ou com motivo fora de 3 a 200 caracteres (o banco também recusa).
 * Inicial e periódico nunca levam motivo.
 */
export function dadosDoTipoNoCertificado(
  mat: { tipo?: unknown; motivo_eventual?: unknown } | null | undefined
): TipoNoCertificado {
  const tipo = mat?.tipo;
  if (tipo === "inicial" || tipo === "periodico") return { tipo_treinamento: tipo };
  if (tipo !== "eventual") return {};
  const motivo = apararMotivo(mat?.motivo_eventual);
  const tamanho = [...motivo].length;
  if (tamanho < MOTIVO_EVENTUAL_MIN || tamanho > MOTIVO_EVENTUAL_MAX) return {};
  return { tipo_treinamento: "eventual", motivo_eventual: motivo };
}
