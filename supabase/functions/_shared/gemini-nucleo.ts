/**
 * gemini-nucleo — orquestração de UMA chamada ao Gemini (generateContent),
 * com o download e o fetch injetados: testável com node --test
 * (gemini-nucleo.test.ts). gemini.ts liga isto ao Storage e ao fetch do Deno.
 *
 *   - arquivos (fileRefs) e inputsExtras viram partes; o prompt vai por último;
 *   - tipo que o Gemini não lê (Office, imagem por URL) → ok:false motivo
 *     "config" SEM chamar o Google (a porta ia.ts cai para o OpenAI);
 *   - timeoutMs vale para a chamada inteira (inclui a repetição);
 *   - 400 apontando responseFormat/mediaResolution → repete UMA vez no formato legado.
 */
import type { OpcoesIA, RespostaIA } from "./ia-tipos.ts";
import type { ParteGemini } from "./gemini-regras.ts";
import {
  arquivoParaParte,
  erroHttpGemini,
  inputExtraParaParte,
  lerRespostaGemini,
  montarCorpoGemini,
  nivelDePensamento,
} from "./gemini-regras.ts";

export const URL_GEMINI = "https://generativelanguage.googleapis.com/v1beta/models";

export interface DepsGemini {
  baixarRef(ref: string): Promise<{ nome: string; mime: string; bytes: Uint8Array }>;
  fetch(url: string, init: RequestInit): Promise<Response>;
}

function ehTimeout(e: unknown): boolean {
  const nome = (e as Error)?.name;
  return nome === "TimeoutError" || nome === "AbortError";
}

export function criarChamarGemini(deps: DepsGemini) {
  return async function chamarGemini(
    o: OpcoesIA & { modelo: string; apiKey: string }
  ): Promise<RespostaIA> {
    const modelo = o.modelo;
    const semSuporte = (erro: string): RespostaIA => ({
      ok: false,
      erro,
      motivo: "config",
      modelo,
      provedor: "gemini",
    });

    const partes: ParteGemini[] = [];
    for (const ref of o.fileRefs ?? []) {
      const arquivo = await deps.baixarRef(ref); // erro de download lança (igual ao openai.ts)
      try {
        partes.push(arquivoParaParte(arquivo));
      } catch (e) {
        return semSuporte((e as Error).message);
      }
    }
    for (const extra of o.inputsExtras ?? []) {
      const parte = inputExtraParaParte(extra);
      if (!parte) return semSuporte(`O Gemini não lê a entrada "${String(extra?.type ?? "?")}"`);
      partes.push(parte);
    }

    const pensamento = nivelDePensamento(modelo, o.esforco);
    const url = `${URL_GEMINI}/${encodeURIComponent(modelo)}:generateContent`;
    const inicio = Date.now();
    const sinal = o.timeoutMs ? AbortSignal.timeout(o.timeoutMs) : undefined;
    const segundos = Math.ceil((o.timeoutMs ?? 0) / 1000);
    const falha = (erro: string, motivo: string): RespostaIA => ({
      ok: false,
      erro,
      motivo,
      modelo,
      provedor: "gemini",
      ms: Date.now() - inicio,
    });
    const erroTimeout = () =>
      falha(`IA (${modelo}) não respondeu em ${segundos} s — tempo esgotado`, "timeout");

    let legado = false;
    for (;;) {
      const corpo = montarCorpoGemini({
        prompt: o.prompt,
        partes,
        jsonSchema: o.jsonSchema,
        maxOutputTokens: o.maxOutputTokens,
        pensamento,
        formatoLegado: legado,
      });
      let r: Response;
      try {
        r = await deps.fetch(url, {
          method: "POST",
          headers: { "x-goog-api-key": o.apiKey, "Content-Type": "application/json" },
          body: JSON.stringify(corpo),
          signal: sinal,
        });
      } catch (e) {
        if (ehTimeout(e)) return erroTimeout();
        return falha(`Falha de rede com o Google: ${(e as Error)?.message || e}`, "rede");
      }
      let j: unknown = {};
      try {
        j = await r.json();
      } catch (e) {
        // o corpo também corre sob o mesmo AbortSignal
        if (ehTimeout(e)) return erroTimeout();
        j = {};
      }
      if (!r.ok) {
        const e = erroHttpGemini(r.status, j);
        if (e.tentarFormatoLegado && !legado) {
          console.warn(
            `[gemini] 400 nos campos novos (${modelo}) — repetindo no formato legado:`,
            e.erro
          );
          legado = true;
          continue;
        }
        return falha(e.erro, e.motivo);
      }
      const lido = lerRespostaGemini(j, Boolean(o.jsonSchema));
      const ms = Date.now() - inicio;
      return lido.ok
        ? { ok: true, resultado: lido.resultado, modelo, provedor: "gemini", usage: lido.usage, ms }
        : {
            ok: false,
            erro: lido.erro,
            motivo: lido.motivo,
            modelo,
            provedor: "gemini",
            usage: lido.usage,
            ms,
          };
    }
  };
}
