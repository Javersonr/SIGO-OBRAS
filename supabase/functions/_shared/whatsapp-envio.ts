/**
 * whatsapp-envio — canal de envio de mensagens 1:1 do SIGO.
 *
 * Implementação atual: Evolution API (instância própria, texto livre — não
 * exige template aprovado). O chamador não sabe qual canal está por trás;
 * se um dia migrarmos pro Cloud API oficial da Meta, só este arquivo muda.
 *
 * Secrets (supabase secrets set ...):
 *   EVOLUTION_URL      ex.: https://evo.exemplo.com  (sem barra no final)
 *   EVOLUTION_INSTANCE nome da instância conectada
 *   EVOLUTION_APIKEY   chave da instância
 */

export class CanalNaoConfiguradoError extends Error {
  constructor() {
    super("Canal WhatsApp não configurado (EVOLUTION_URL/INSTANCE/APIKEY)");
    this.name = "CanalNaoConfiguradoError";
  }
}

/** Normaliza telefone BR pra formato E.164 sem "+" (ex.: 5538999448281). */
export function normalizarTelefoneBR(bruto: string): string | null {
  const d = (bruto || "").replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) return d;
  if (d.length === 10 || d.length === 11) return "55" + d;
  return null; // formato irreconhecível — melhor não enviar pro número errado
}

export function configEvolution(): { url: string; instancia: string; apikey: string } {
  const url = Deno.env.get("EVOLUTION_URL")?.replace(/\/+$/, "");
  const instancia = Deno.env.get("EVOLUTION_INSTANCE");
  const apikey = Deno.env.get("EVOLUTION_APIKEY");
  if (!url || !instancia || !apikey) throw new CanalNaoConfiguradoError();
  return { url, instancia, apikey };
}

/** Chamada autenticada à Evolution; `caminho` recebe "{i}" = instância. */
export async function evolutionApi(
  caminho: string,
  init: { method?: string; body?: unknown } = {}
): Promise<{ status: number; json: any }> {
  const { url, instancia, apikey } = configEvolution();
  const resp = await fetch(url + caminho.replace("{i}", encodeURIComponent(instancia)), {
    method: init.method ?? "GET",
    headers: { "Content-Type": "application/json", apikey },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const json = await resp.json().catch(() => null);
  return { status: resp.status, json };
}

/**
 * Tempo máximo (ms) de UM envio de texto, somando a tentativa no formato v2 e o refazer no v1. Sem limite,
 * um Evolution fora do ar deixava o `fetch` esperar o timeout de conexão do sistema (minutos), e quem
 * esperava a resposta (a revogação de certificado, a recuperação de senha) ficava pendurado. Passou do
 * prazo, o envio LANÇA: o chamador trata como falha do canal.
 */
export const TEMPO_LIMITE_ENVIO_MS = 12_000;

export async function enviarWhatsAppTexto(
  numero: string,
  texto: string,
  opcoes: { limiteMs?: number } = {}
): Promise<void> {
  const { url, instancia, apikey } = configEvolution();

  const endpoint = `${url}/message/sendText/${encodeURIComponent(instancia)}`;
  const headers = { "Content-Type": "application/json", apikey };
  const limiteMs = opcoes.limiteMs ?? TEMPO_LIMITE_ENVIO_MS;
  // um sinal só para o envio inteiro: a segunda chamada não ganha prazo novo
  const signal = AbortSignal.timeout(limiteMs);

  try {
    // Evolution v2 usa { number, text }; v1 usa { number, textMessage: { text } }.
    // Tenta v2 e, num 400, refaz no formato v1.
    let resp = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ number: numero, text: texto }),
      signal,
    });
    if (resp.status === 400) {
      resp = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({ number: numero, textMessage: { text: texto } }),
        signal,
      });
    }
    if (!resp.ok) {
      const corpo = await resp.text().catch(() => "");
      throw new Error(`Evolution ${resp.status}: ${corpo.slice(0, 300)}`);
    }
  } catch (e) {
    // o prazo estourou (o fetch rejeita com TimeoutError/AbortError): erro com o motivo claro
    if (signal.aborted) {
      throw new Error(
        `Evolution: tempo esgotado (sem resposta em ${Math.round(limiteMs / 1000)} s)`
      );
    }
    throw e;
  }
}
