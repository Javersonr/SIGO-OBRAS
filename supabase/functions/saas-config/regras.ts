/**
 * saas-config/regras — regras PURAS da função saas-config (sem Deno e sem
 * imports de URL): testáveis com node --test (regras.test.ts).
 *
 *   - validarDefinir: corpo do { acao:"definir" } → linhas de saas_config ou
 *     o erro (um campo inválido recusa o pedido inteiro);
 *   - statusGemini: linhas de saas_config + env → status do card do Gemini.
 *     Usa o mesmo configDeLinhas da porta de IA (ia-nucleo.ts), então o que o
 *     SaaS Admin mostra é exatamente o que o chamarIA vai usar. A chave nunca
 *     sai daqui: só os 4 últimos caracteres.
 */
import { configDeLinhas } from "../_shared/ia-nucleo.ts";
import { MODELOS_GEMINI_FORTE, MODELOS_GEMINI_PADRAO } from "../_shared/gemini-regras.ts";

export const MODELOS_OPENAI: readonly string[] = ["gpt-4o-mini", "gpt-4o"];

export interface CorpoDefinir {
  chave_openai?: unknown;
  modelo?: unknown;
  chave_gemini?: unknown;
  gemini_modelo?: unknown;
  gemini_modelo_forte?: unknown;
}

export type LinhaConfig = { chave: string; valor: string };

export interface StatusGemini {
  configurada: boolean;
  final: string | null;
  origem: "secret" | "painel" | null;
  modelo: string;
  modelo_forte: string;
}

const textoAparado = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const textoExato = (v: unknown): string => (typeof v === "string" ? v : "");

export function validarDefinir(
  body: CorpoDefinir
): { ok: true; linhas: LinhaConfig[] } | { ok: false; erro: string } {
  const linhas: LinhaConfig[] = [];

  if (body.chave_openai !== undefined) {
    const chave = textoAparado(body.chave_openai);
    if (!chave.startsWith("sk-") || chave.length < 20) {
      return { ok: false, erro: "Chave OpenAI inválida (deve começar com sk-)" };
    }
    linhas.push({ chave: "openai_api_key", valor: chave });
  }
  if (body.modelo !== undefined) {
    const modelo = textoExato(body.modelo);
    if (!MODELOS_OPENAI.includes(modelo)) {
      return { ok: false, erro: `Modelo deve ser um de: ${MODELOS_OPENAI.join(", ")}` };
    }
    linhas.push({ chave: "openai_modelo", valor: modelo });
  }

  if (body.chave_gemini !== undefined) {
    // sem checar prefixo: o Google já trocou o formato das chaves mais de uma vez
    const chave = textoAparado(body.chave_gemini);
    if (chave.length < 20 || /\s/.test(chave)) {
      return {
        ok: false,
        erro: "Chave do Gemini inválida (sem espaços, com 20 caracteres ou mais)",
      };
    }
    linhas.push({ chave: "gemini_api_key", valor: chave });
  }
  if (body.gemini_modelo !== undefined) {
    const modelo = textoExato(body.gemini_modelo);
    if (!MODELOS_GEMINI_PADRAO.includes(modelo)) {
      return {
        ok: false,
        erro: `Modelo padrão do Gemini deve ser um de: ${MODELOS_GEMINI_PADRAO.join(", ")}`,
      };
    }
    linhas.push({ chave: "gemini_modelo", valor: modelo });
  }
  if (body.gemini_modelo_forte !== undefined) {
    const modelo = textoExato(body.gemini_modelo_forte);
    if (!MODELOS_GEMINI_FORTE.includes(modelo)) {
      return {
        ok: false,
        erro: `Modelo forte do Gemini deve ser um de: ${MODELOS_GEMINI_FORTE.join(", ")}`,
      };
    }
    linhas.push({ chave: "gemini_modelo_forte", valor: modelo });
  }

  if (linhas.length === 0) return { ok: false, erro: "Nada para definir" };
  return { ok: true, linhas };
}

export function statusGemini(
  linhas: { chave: string; valor: unknown }[],
  env: { GEMINI_API_KEY?: string }
): StatusGemini {
  const g = configDeLinhas(linhas, { GEMINI_API_KEY: env.GEMINI_API_KEY }).gemini;
  const chave = g.apiKey ?? "";
  return {
    configurada: chave.length > 0,
    final: chave ? chave.slice(-4) : null,
    origem: env.GEMINI_API_KEY?.trim() ? "secret" : chave ? "painel" : null,
    modelo: g.modelo,
    modelo_forte: g.modeloForte,
  };
}
