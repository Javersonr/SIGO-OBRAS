/**
 * Pedaços que as ferramentas NOVAS da habilitação repetiam (ferramentas-habilitacao.ts e
 * ferramentas-documentos.ts): o esquema do id da oportunidade, as anotações das ferramentas que gravam, o nome
 * do usuário no histórico, o plural, a mensagem de erro sem caminho nem número e o log do erro inesperado.
 * Uma definição só. As ferramentas anteriores à branch (edital, acervo, orçamento) ficam como estão. Puro
 * (importável no Node).
 */
import type { DepsFerramenta } from "./registro.ts";

export const ID_OPORTUNIDADE = { type: "string", description: "UUID da oportunidade" };

/** Anotações das ferramentas que gravam: não apagam nada e repetir a chamada dá o mesmo resultado. */
export const GRAVACAO = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

/** O nome que vai no histórico da oportunidade: quem pediu, pelo Claude. */
export const nomeDoUsuario = (deps: DepsFerramenta): string =>
  `${deps.ctx.usuario.nome} (via Claude)`;

/** "1 documento", "2 documentos". */
export const plural = (n: number, um: string, varios: string): string =>
  `${n} ${n === 1 ? um : varios}`;

/**
 * A mensagem do erro sem nada que pareça URL, ref ou caminho do Storage, e sem número longo (CPF, CNPJ: uma
 * biblioteca pode repetir um texto do documento na mensagem de erro). Corta em 300 caracteres.
 */
export const mensagemSemCaminho = (e: unknown): string =>
  (e instanceof Error ? e.message : String(e))
    .replace(/\S*\/\S*/g, "[caminho]")
    .replace(/\d(?:[.\-\s]?\d){9,}/g, "[numero]")
    .slice(0, 300);

/** Log de um erro inesperado: nome do erro e mensagem sem caminho nem número. Nunca a ref nem dado do documento. */
export function logarErro(ferramenta: string, onde: string, e: unknown): void {
  const nome = e instanceof Error ? e.name : typeof e;
  console.error(`[conector] ${ferramenta}: ${onde}: ${nome}: ${mensagemSemCaminho(e)}`);
}
