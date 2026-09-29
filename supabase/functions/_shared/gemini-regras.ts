/**
 * gemini-regras — regras PURAS do cliente Gemini (generateContent, v1beta):
 * modelos permitidos, conversão do JSON Schema, montagem do corpo, leitura
 * da resposta e tradução dos erros HTTP. Sem imports de URL e sem Deno:
 * testável com node --test (gemini-regras.test.ts). A chamada em si fica em
 * gemini-nucleo.ts (orquestração) e gemini.ts (ligação com Deno/Storage).
 */
import type { Esforco, UsoIA } from "./ia-tipos.ts";

/** modelos aceitos no SaaS Admin (padrão = 1º da lista) */
export const MODELOS_GEMINI_PADRAO: readonly string[] = [
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-3.8-flash",
];
export const MODELOS_GEMINI_FORTE: readonly string[] = [
  "gemini-3.8-flash",
  "gemini-3.1-pro-preview",
];
export const GEMINI_MODELO_PADRAO = "gemini-3.5-flash-lite";
export const GEMINI_MODELO_FORTE = "gemini-3.8-flash";

const LIMITE_TEXTO_ARQUIVO = 200_000; // caracteres de arquivo de texto puro (igual ao openai.ts)

export type ParteGemini =
  | { text: string }
  | {
      inlineData: { mimeType: string; data: string };
      mediaResolution?: { level: "MEDIA_RESOLUTION_MEDIUM" };
    };

// ---------------------------------------------------------------- schema

/** palavras do JSON Schema que o Gemini não aceita (ou ignora mal) */
const CHAVES_REMOVIDAS = new Set([
  "$schema",
  "pattern",
  "minLength",
  "maxLength",
  "multipleOf",
  "uniqueItems",
  "default",
  "examples",
  "not",
  "if",
  "then",
  "else",
]);
/** chaves cujo valor é um MAPA nome → schema (os nomes não são palavras do schema) */
const MAPAS_DE_SCHEMAS = new Set(["properties", "$defs", "definitions", "patternProperties"]);
/** chaves cujo valor é uma LISTA de schemas */
const LISTAS_DE_SCHEMAS = new Set(["anyOf", "oneOf", "allOf", "prefixItems"]);

const ehObjeto = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/**
 * JSON Schema (formato OpenAI estrito) → subconjunto aceito pelo Gemini.
 * Enum que aceita null vira anyOf [enum sem null, {type:"null"}]. Não muda o original.
 */
export function paraSchemaGemini(schema: unknown): unknown {
  if (!ehObjeto(schema)) return schema;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema)) {
    if (CHAVES_REMOVIDAS.has(k)) continue;
    if (MAPAS_DE_SCHEMAS.has(k) && ehObjeto(v)) {
      out[k] = Object.fromEntries(
        Object.entries(v).map(([nome, sub]) => [nome, paraSchemaGemini(sub)])
      );
    } else if (LISTAS_DE_SCHEMAS.has(k) && Array.isArray(v)) {
      out[k] = v.map(paraSchemaGemini);
    } else if ((k === "items" || k === "additionalProperties") && ehObjeto(v)) {
      out[k] = paraSchemaGemini(v);
    } else {
      out[k] = v; // type, enum, required, description, maxItems... ficam como estão
    }
  }
  if (Array.isArray(out.enum) && out.enum.includes(null)) {
    const { enum: valores, type, ...resto } = out;
    const tipos = (Array.isArray(type) ? type : type === undefined ? [] : [type]).filter(
      (t) => t !== "null"
    );
    const opcao: Record<string, unknown> = {};
    if (tipos.length) opcao.type = tipos.length === 1 ? tipos[0] : tipos;
    opcao.enum = (valores as unknown[]).filter((v) => v !== null);
    return { ...resto, anyOf: [opcao, { type: "null" }] };
  }
  return out;
}

// ---------------------------------------------------------------- pensamento

/** modelos em que thinkingLevel "minimal" dá erro 400 (usa "low") */
const SEM_MINIMAL = /gemini-3\.[78]-flash|gemini-[\d.]+-pro/;

export function nivelDePensamento(modelo: string, esforco?: Esforco): Esforco | undefined {
  if (!esforco) return undefined;
  if (esforco === "minimal" && SEM_MINIMAL.test(modelo)) return "low";
  return esforco;
}

// ---------------------------------------------------------------- partes

export function bytesParaBase64(bytes: Uint8Array): string {
  let bin = "";
  const CH = 32768;
  for (let i = 0; i < bytes.length; i += CH) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CH));
  }
  return btoa(bin);
}

/** arquivo baixado (baixarRef) → parte do Gemini; tipo que o Gemini não lê lança erro */
export function arquivoParaParte(a: {
  nome: string;
  mime: string;
  bytes: Uint8Array;
}): ParteGemini {
  const mime = (a.mime || "").toLowerCase();
  if (mime.startsWith("text/") || mime === "application/json" || mime === "application/xml") {
    const texto = new TextDecoder("utf-8").decode(a.bytes).slice(0, LIMITE_TEXTO_ARQUIVO);
    return { text: `=== ARQUIVO: ${a.nome} ===\n${texto}` };
  }
  if (mime === "application/pdf") {
    return {
      inlineData: { mimeType: mime, data: bytesParaBase64(a.bytes) },
      mediaResolution: { level: "MEDIA_RESOLUTION_MEDIUM" },
    };
  }
  if (mime.startsWith("image/")) {
    return { inlineData: { mimeType: mime, data: bytesParaBase64(a.bytes) } };
  }
  throw new Error(`O Gemini não lê arquivos do tipo ${mime || "desconhecido"} (${a.nome})`);
}

/** item de inputsExtras no formato da OpenAI → parte do Gemini (null = não convertível) */
export function inputExtraParaParte(x: Record<string, unknown>): ParteGemini | null {
  if (x?.type === "input_text" && typeof x.text === "string") return { text: x.text };
  if (x?.type === "input_image" && typeof x.image_url === "string") {
    const url = x.image_url;
    const virgula = url.indexOf(",");
    const cab =
      virgula > 0
        ? /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64$/i.exec(url.slice(0, virgula))
        : null;
    if (cab)
      return { inlineData: { mimeType: cab[1].toLowerCase(), data: url.slice(virgula + 1) } };
  }
  return null;
}

// ---------------------------------------------------------------- corpo

/**
 * Corpo do generateContent. Partes na ordem recebida e o prompt por ÚLTIMO;
 * store:false; nunca temperature/topP/topK. formatoLegado = superfície antiga
 * da API (responseMimeType + responseJsonSchema e sem mediaResolution por parte),
 * usada só na 2ª tentativa quando o Google recusa os campos novos (e sem store,
 * que a superfície antiga pode não conhecer).
 */
export function montarCorpoGemini(o: {
  prompt: string;
  partes: ParteGemini[];
  jsonSchema?: unknown;
  maxOutputTokens?: number;
  pensamento?: Esforco;
  formatoLegado?: boolean;
}): Record<string, unknown> {
  const partes: ParteGemini[] = o.formatoLegado
    ? o.partes.map((p) => ("inlineData" in p ? { inlineData: p.inlineData } : p))
    : o.partes;
  const generationConfig: Record<string, unknown> = {};
  if (o.jsonSchema) {
    const schema = paraSchemaGemini(o.jsonSchema);
    if (o.formatoLegado) {
      generationConfig.responseMimeType = "application/json";
      generationConfig.responseJsonSchema = schema;
    } else {
      generationConfig.responseFormat = { text: { mimeType: "application/json", schema } };
    }
  }
  if (o.maxOutputTokens) generationConfig.maxOutputTokens = o.maxOutputTokens;
  if (o.pensamento) generationConfig.thinkingConfig = { thinkingLevel: o.pensamento };
  const corpo: Record<string, unknown> = {
    contents: [{ role: "user", parts: [...partes, { text: o.prompt }] }],
  };
  if (Object.keys(generationConfig).length) corpo.generationConfig = generationConfig;
  if (!o.formatoLegado) corpo.store = false;
  return corpo;
}

// ---------------------------------------------------------------- resposta

const FIM_RECUSA = new Set(["SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII"]);

const inteiro = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));

export function lerRespostaGemini(
  json: unknown,
  comSchema: boolean
):
  | { ok: true; resultado: unknown; usage: UsoIA }
  | { ok: false; erro: string; motivo: "cortada" | "recusa" | "json" | "http"; usage?: UsoIA } {
  // deno-lint-ignore no-explicit-any
  const j: any = ehObjeto(json) ? json : {};
  const um = ehObjeto(j.usageMetadata) ? j.usageMetadata : {};
  const entrada = inteiro(um.promptTokenCount);
  const saida = inteiro(um.candidatesTokenCount) + inteiro(um.thoughtsTokenCount);
  const usage: UsoIA = {
    input_tokens: entrada,
    output_tokens: saida,
    total_tokens: inteiro(um.totalTokenCount) || entrada + saida,
  };

  const bloqueio = j.promptFeedback?.blockReason;
  if (bloqueio) {
    return { ok: false, erro: `IA recusou o conteúdo (${bloqueio})`, motivo: "recusa", usage };
  }
  // deno-lint-ignore no-explicit-any
  const cand: any = Array.isArray(j.candidates) ? j.candidates[0] : undefined;
  if (!cand || typeof cand !== "object") {
    return { ok: false, erro: "IA não devolveu resposta", motivo: "http", usage };
  }
  const fim = typeof cand.finishReason === "string" ? cand.finishReason : "";
  if (fim === "MAX_TOKENS") {
    return {
      ok: false,
      erro: "Resposta da IA cortada: atingiu o limite de tokens de saída — divida o documento em partes menores",
      motivo: "cortada",
      usage,
    };
  }
  if (FIM_RECUSA.has(fim))
    return { ok: false, erro: `IA recusou: ${fim}`, motivo: "recusa", usage };

  // deno-lint-ignore no-explicit-any
  const partes: any[] = Array.isArray(cand.content?.parts) ? cand.content.parts : [];
  const texto = partes
    .filter((p) => p && p.thought !== true && typeof p.text === "string")
    .map((p) => p.text)
    .join("");
  if (comSchema) {
    try {
      return { ok: true, resultado: JSON.parse(texto), usage };
    } catch {
      return { ok: false, erro: "IA devolveu JSON inválido", motivo: "json", usage };
    }
  }
  if (!texto && fim && fim !== "STOP") {
    return { ok: false, erro: `IA encerrou sem resposta (${fim})`, motivo: "http", usage };
  }
  return { ok: true, resultado: texto, usage };
}

// ---------------------------------------------------------------- erros HTTP

function detalhesGoogle(corpo: unknown): { mensagem: string; razoes: string[] } {
  // deno-lint-ignore no-explicit-any
  const e: any = ehObjeto(corpo) && ehObjeto(corpo.error) ? corpo.error : {};
  const mensagem = typeof e.message === "string" ? e.message : "";
  const razoes = (Array.isArray(e.details) ? e.details : [])
    // deno-lint-ignore no-explicit-any
    .map((d: any) => d?.reason)
    .filter((r: unknown): r is string => typeof r === "string");
  return { mensagem, razoes };
}

const chaveInvalida = (d: { mensagem: string; razoes: string[] }) =>
  d.razoes.includes("API_KEY_INVALID") || /api key not valid/i.test(d.mensagem);

/** status + corpo de erro do Google → mensagem, motivo e se vale repetir no formato legado */
export function erroHttpGemini(
  status: number,
  corpo: unknown
): { erro: string; motivo: "http" | "rede"; tentarFormatoLegado: boolean } {
  const d = detalhesGoogle(corpo);
  const sufixo = d.mensagem ? `: ${d.mensagem.slice(0, 300)}` : "";
  if (status >= 500) {
    return {
      erro: `Google indisponível (código ${status})${sufixo}`,
      motivo: "rede",
      tentarFormatoLegado: false,
    };
  }
  if (status === 402 || status === 429) {
    return {
      erro: `Gemini sem crédito ou limite atingido (código ${status})`,
      motivo: "http",
      tentarFormatoLegado: false,
    };
  }
  if (status === 400 && chaveInvalida(d)) {
    return {
      erro: "Chave do Gemini inválida — confira no SaaS Admin → Integrações",
      motivo: "http",
      tentarFormatoLegado: false,
    };
  }
  if (status === 401 || status === 403) {
    return {
      erro: `Chave do Gemini sem permissão (código ${status})${sufixo}`,
      motivo: "http",
      tentarFormatoLegado: false,
    };
  }
  // 400 apontando os campos novos (responseFormat / mediaResolution / store): repetir no formato legado
  const legado =
    status === 400 &&
    /response_?format|media_?resolution|\\?"store\\?"/i.test(JSON.stringify(corpo ?? ""));
  return {
    erro: `Gemini recusou o pedido (código ${status})${sufixo}`,
    motivo: "http",
    tentarFormatoLegado: legado,
  };
}

/** resultado do GET /v1beta/models/<modelo> → texto do botão "Testar" do SaaS Admin */
export function mensagemTesteGemini(
  status: number,
  corpo: unknown
): { ok: boolean; mensagem: string } {
  if (status >= 200 && status < 300) return { ok: true, mensagem: "Gemini respondeu" };
  if (status === 400 && chaveInvalida(detalhesGoogle(corpo)))
    return { ok: false, mensagem: "Chave inválida" };
  if (status === 403) return { ok: false, mensagem: "Chave sem permissão" };
  if (status === 402 || status === 429)
    return { ok: false, mensagem: "Sem crédito ou limite atingido" };
  if (status === 404)
    return { ok: false, mensagem: "Modelo não encontrado no Google (código 404)" };
  return { ok: false, mensagem: `Google indisponível (código ${status})` };
}
