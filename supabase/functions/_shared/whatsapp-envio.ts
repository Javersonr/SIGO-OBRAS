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

export async function enviarWhatsAppTexto(numero: string, texto: string): Promise<void> {
  const url = Deno.env.get("EVOLUTION_URL")?.replace(/\/+$/, "");
  const instancia = Deno.env.get("EVOLUTION_INSTANCE");
  const apikey = Deno.env.get("EVOLUTION_APIKEY");
  if (!url || !instancia || !apikey) throw new CanalNaoConfiguradoError();

  const endpoint = `${url}/message/sendText/${encodeURIComponent(instancia)}`;
  const headers = { "Content-Type": "application/json", apikey };

  // Evolution v2 usa { number, text }; v1 usa { number, textMessage: { text } }.
  // Tenta v2 e, num 400, refaz no formato v1.
  let resp = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ number: numero, text: texto }),
  });
  if (resp.status === 400) {
    resp = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ number: numero, textMessage: { text: texto } }),
    });
  }
  if (!resp.ok) {
    const corpo = await resp.text().catch(() => "");
    throw new Error(`Evolution ${resp.status}: ${corpo.slice(0, 300)}`);
  }
}
