/**
 * Endereços do conector do Claude: a URL do recurso (uma só para o mcp e o mcp-oauth) e os links do
 * site devolvidos pelas ferramentas. Puro.
 */
import { recursoCanonico } from "./redirect.ts";

export const URL_SITE = "https://www.sigoobras.com.br";

/** recursoCanonico(`${url}/functions/v1/mcp`); URL nula ou inválida lança (a função não sobe sem ela). */
export function recursoDoConector(supabaseUrl: string | null | undefined): string {
  const base = String(supabaseUrl ?? "").replace(/\/+$/, "");
  const r = base ? recursoCanonico(`${base}/functions/v1/mcp`) : null;
  if (!r) throw new Error("SUPABASE_URL inválida para o recurso do conector");
  return r;
}

export function linkOportunidade(id: string): string {
  return `${URL_SITE}/Oportunidades?openId=${encodeURIComponent(id)}`;
}

export function linkPaginaEnvio(linkId: string): string {
  return `${URL_SITE}/EnviarArquivos?link=${encodeURIComponent(linkId)}`;
}
