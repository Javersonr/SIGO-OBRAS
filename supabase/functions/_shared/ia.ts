/**
 * ia — porta única de IA das Edge Functions: Gemini (padrão) → OpenAI (reserva).
 *
 * Regra (ordem, nível → modelo, fallback, tempo) em ia-nucleo.ts, testada com
 * node --test; aqui só a ligação com o banco e os dois clientes.
 *   - lerConfigIA: UMA consulta a saas_config (chaves e modelos dos dois);
 *     env GEMINI_API_KEY / OPENAI_API_KEY têm prioridade.
 *   - chamarIA({ ...OpcoesIA, nivel }) → RespostaIA com provedor, modelo e
 *     tentativas; sem nenhuma chave → { ok:false, erro:"IA_NAO_CONFIGURADA" }.
 */
import { chamarGemini } from "./gemini.ts";
import { CHAVES_CONFIG_IA, configDeLinhas, criarChamarIA, type ConfigIA } from "./ia-nucleo.ts";
import type { OpcoesIA, RespostaIA } from "./ia-tipos.ts";
import { chamarOpenAI } from "./openai.ts";
import { createAdminClient } from "./supabase-admin.ts";

export type { ConfigIA, OpcoesIA, RespostaIA };

export async function lerConfigIA(): Promise<ConfigIA> {
  const { data } = await createAdminClient()
    .from("saas_config")
    .select("chave, valor")
    .in("chave", CHAVES_CONFIG_IA);
  return configDeLinhas(data ?? [], {
    GEMINI_API_KEY: Deno.env.get("GEMINI_API_KEY"),
    OPENAI_API_KEY: Deno.env.get("OPENAI_API_KEY"),
  });
}

export const chamarIA: (o: OpcoesIA) => Promise<RespostaIA> = criarChamarIA({
  lerConfig: lerConfigIA,
  chamarGemini: async (o) => {
    const r = await chamarGemini(o);
    if (!r.ok)
      console.warn(`[ia] Gemini falhou (${r.modelo ?? o.modelo}, ${r.motivo ?? "?"}): ${r.erro}`);
    return r;
  },
  chamarOpenAI: async (o) => ({ ...(await chamarOpenAI(o)), provedor: "openai" as const }),
});
