/**
 * ia-nucleo — regra da porta única de IA, PURA (config e chamadores
 * injetados): testável com node --test (ia-nucleo.test.ts). ia.ts liga isto
 * ao banco (saas_config), ao Gemini e ao OpenAI.
 *
 *   1. Gemini, se houver chave;
 *   2. OpenAI, se houver chave e o Gemini falhou (qualquer ok:false) ou não
 *      está configurado — EXCETO quando timeoutMs existe e o Gemini já gastou
 *      mais da metade dele (aí devolve o erro do Gemini); o OpenAI recebe só o
 *      tempo que sobrou;
 *   3. nenhuma chave → IA_NAO_CONFIGURADA (motivo "config"), sem chamar ninguém.
 *
 * O modelo sai do nível ("padrao" | "forte"). A resposta final traz provedor
 * e tentativas (todas as respostas, na ordem) para o registro de uso.
 */
import type { OpcoesIA, RespostaIA } from "./ia-tipos.ts";
import {
  GEMINI_MODELO_FORTE,
  GEMINI_MODELO_PADRAO,
  MODELOS_GEMINI_FORTE,
  MODELOS_GEMINI_PADRAO,
} from "./gemini-regras.ts";

export interface ConfigIA {
  gemini: { apiKey: string | null; modelo: string; modeloForte: string };
  openai: { apiKey: string | null; modelo: string; modeloForte: string };
}

export interface DepsIA {
  lerConfig(): Promise<ConfigIA>;
  chamarGemini(o: OpcoesIA & { modelo: string; apiKey: string }): Promise<RespostaIA>;
  chamarOpenAI(o: OpcoesIA & { modelo: string }): Promise<RespostaIA>;
}

/** chaves de saas_config lidas por lerConfigIA (uma consulta só) */
export const CHAVES_CONFIG_IA = [
  "gemini_api_key",
  "gemini_modelo",
  "gemini_modelo_forte",
  "openai_api_key",
  "openai_modelo",
];
export const OPENAI_MODELO_PADRAO = "gpt-4o-mini";
/** igual a MODELO_FORTE de openai.ts (aqui sem importar: openai.ts usa Deno/esm.sh) */
export const OPENAI_MODELO_FORTE = "gpt-4o";

/**
 * Linhas de saas_config + env → ConfigIA. Env (GEMINI_API_KEY / OPENAI_API_KEY)
 * vence o banco; chave vazia = não configurada; modelo do Gemini fora da lista
 * permitida volta ao padrão.
 */
export function configDeLinhas(
  linhas: { chave: string; valor: unknown }[],
  env: { GEMINI_API_KEY?: string; OPENAI_API_KEY?: string }
): ConfigIA {
  const mapa = new Map(
    linhas.map((l) => [l.chave, typeof l.valor === "string" ? l.valor.trim() : ""])
  );
  const gModelo = mapa.get("gemini_modelo") ?? "";
  const gForte = mapa.get("gemini_modelo_forte") ?? "";
  return {
    gemini: {
      apiKey: env.GEMINI_API_KEY?.trim() || mapa.get("gemini_api_key") || null,
      modelo: MODELOS_GEMINI_PADRAO.includes(gModelo) ? gModelo : GEMINI_MODELO_PADRAO,
      modeloForte: MODELOS_GEMINI_FORTE.includes(gForte) ? gForte : GEMINI_MODELO_FORTE,
    },
    openai: {
      apiKey: env.OPENAI_API_KEY?.trim() || mapa.get("openai_api_key") || null,
      modelo: mapa.get("openai_modelo") || OPENAI_MODELO_PADRAO,
      modeloForte: OPENAI_MODELO_FORTE,
    },
  };
}

export function criarChamarIA(deps: DepsIA): (o: OpcoesIA) => Promise<RespostaIA> {
  return async function chamarIA(o: OpcoesIA): Promise<RespostaIA> {
    const cfg = await deps.lerConfig();
    const forte = o.nivel === "forte";
    const inicio = Date.now();
    const tentativas: RespostaIA[] = [];
    const final = (r: RespostaIA): RespostaIA => ({ ...r, tentativas });

    if (cfg.gemini.apiKey) {
      const modelo = forte ? cfg.gemini.modeloForte : cfg.gemini.modelo;
      const r = await deps.chamarGemini({ ...o, modelo, apiKey: cfg.gemini.apiKey });
      const g: RespostaIA = { ...r, modelo: r.modelo || modelo, provedor: "gemini" };
      tentativas.push(g);
      if (g.ok) return final(g);
      const gasto = Date.now() - inicio;
      if (o.timeoutMs && gasto > o.timeoutMs / 2) return final(g);
    }

    if (cfg.openai.apiKey) {
      const modelo = forte ? cfg.openai.modeloForte : cfg.openai.modelo;
      const opcoes: OpcoesIA & { modelo: string } = { ...o, modelo };
      if (o.timeoutMs) opcoes.timeoutMs = Math.max(1, o.timeoutMs - (Date.now() - inicio));
      const r = await deps.chamarOpenAI(opcoes);
      const oa: RespostaIA = { ...r, modelo: r.modelo || modelo, provedor: "openai" };
      tentativas.push(oa);
      return final(oa);
    }

    if (tentativas.length) return final(tentativas[tentativas.length - 1]);
    return { ok: false, erro: "IA_NAO_CONFIGURADA", motivo: "config" };
  };
}
