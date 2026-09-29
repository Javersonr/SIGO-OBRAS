/**
 * gemini — cliente do Google Gemini para as Edge Functions (Deno).
 *
 * Regras puras em gemini-regras.ts e orquestração em gemini-nucleo.ts (ambos
 * testados com node --test); aqui só a ligação com o Storage (baixarRef do
 * openai.ts: validarRef, service role, 15MB) e com o fetch do Deno.
 * A chave vai só no header x-goog-api-key — nunca na URL nem em log.
 */
import { criarChamarGemini, URL_GEMINI } from "./gemini-nucleo.ts";
import { mensagemTesteGemini } from "./gemini-regras.ts";
import { baixarRef } from "./openai.ts";

/** chamarGemini({ ...OpcoesIA, modelo, apiKey }) → RespostaIA com provedor "gemini" */
export const chamarGemini = criarChamarGemini({
  baixarRef,
  fetch: (url, init) => fetch(url, init),
});

/** botão "Testar" do SaaS Admin: GET do modelo com a chave, 10 s de limite */
export async function testarChaveGemini(
  apiKey: string,
  modelo: string
): Promise<{ ok: boolean; mensagem: string }> {
  let r: Response;
  try {
    r = await fetch(`${URL_GEMINI}/${encodeURIComponent(modelo)}`, {
      headers: { "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    const nome = (e as Error)?.name;
    return {
      ok: false,
      mensagem:
        nome === "TimeoutError" || nome === "AbortError"
          ? "Google não respondeu em 10 s"
          : `Falha de rede com o Google: ${(e as Error)?.message || e}`,
    };
  }
  let corpo: unknown = null;
  try {
    corpo = await r.json();
  } catch {
    corpo = null;
  }
  return mensagemTesteGemini(r.status, corpo);
}
