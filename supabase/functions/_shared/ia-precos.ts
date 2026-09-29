/**
 * ia-precos — custo ESTIMADO (US$) de uma chamada de IA, pelo modelo e pelos
 * tokens (tabela da spec 2026-09-25 "Gemini como IA padrão", US$ por 1 milhão
 * de tokens). Usado pelo registro de consumo (ia-processar/ia-uso.ts).
 *
 *   - modelo fora da tabela → null (ia_uso.custo_usd fica null);
 *   - sufixo de versão ("-preview", "-001", data) casa com o modelo base;
 *     "-lite" e "-mini" são OUTROS modelos (linha própria ou null);
 *   - gemini-3.6/3.7/3.8-flash sobem de preço em 01/01/2027 (UTC);
 *   - gemini-3.1-pro: prompt > 200 mil tokens de entrada usa a faixa cara;
 *   - resultado arredondado em micro-dólar (6 casas = numeric(12,6)).
 *
 * Puro (sem imports, sem Deno): testado com node --test.
 */

export interface PrecoModelo {
  /** US$ por 1M tokens de entrada */
  entrada: number;
  /** US$ por 1M tokens de saída (inclui os de pensamento) */
  saida: number;
}

/** a partir deste instante o gemini-3.x-flash (não lite) custa o dobro */
export const REAJUSTE_GEMINI_FLASH = new Date("2027-01-01T00:00:00Z");
/** acima disto (tokens de entrada DA CHAMADA) o gemini-3.1-pro usa a faixa cara */
export const LIMITE_PROMPT_PRO = 200_000;

type Regra = { re: RegExp; preco: (tokensEntrada: number, quando: Date) => PrecoModelo };

// o primeiro que casar vence
const REGRAS: Regra[] = [
  { re: /^gemini-3\.5-flash-lite(-|$)/, preco: () => ({ entrada: 0.3, saida: 2.5 }) },
  { re: /^gemini-3\.1-flash-lite(-|$)/, preco: () => ({ entrada: 0.25, saida: 1.5 }) },
  {
    re: /^gemini-3\.[678]-flash(-(?!lite)|$)/,
    preco: (_t, quando) =>
      quando < REAJUSTE_GEMINI_FLASH
        ? { entrada: 0.75, saida: 3.75 }
        : { entrada: 1.5, saida: 7.5 },
  },
  {
    re: /^gemini-3\.1-pro(-|$)/,
    preco: (t) => (t > LIMITE_PROMPT_PRO ? { entrada: 4, saida: 18 } : { entrada: 2, saida: 12 }),
  },
  { re: /^gpt-4o-mini(-|$)/, preco: () => ({ entrada: 0.15, saida: 0.6 }) },
  { re: /^gpt-4o(-|$)/, preco: () => ({ entrada: 2.5, saida: 10 }) },
];

const tokens = (v: unknown): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** preço do modelo (null = fora da tabela) */
export function precoDoModelo(
  modelo: string | undefined,
  tokensEntrada = 0,
  quando: Date = new Date()
): PrecoModelo | null {
  const nome = String(modelo ?? "")
    .trim()
    .toLowerCase()
    .replace(/^models\//, "");
  if (!nome) return null;
  const regra = REGRAS.find((r) => r.re.test(nome));
  return regra ? regra.preco(tokensEntrada, quando) : null;
}

/** custo estimado em US$ de UMA chamada (null = modelo sem preço conhecido) */
export function custoUsd(
  modelo: string | undefined,
  uso: { input_tokens?: number; output_tokens?: number } | undefined,
  quando: Date = new Date()
): number | null {
  const entrada = tokens(uso?.input_tokens);
  const saida = tokens(uso?.output_tokens);
  const p = precoDoModelo(modelo, entrada, quando);
  if (!p) return null;
  // tokens × (US$ / 1M tokens) = micro-dólares → arredonda e volta para US$
  return Math.round(entrada * p.entrada + saida * p.saida) / 1_000_000;
}
