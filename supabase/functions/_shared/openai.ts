/**
 * openai — núcleo de chamadas à OpenAI Responses API.
 *
 * Chave: env OPENAI_API_KEY > saas_config.openai_api_key (painel SaaS Admin).
 * Arquivos: refs "bucket/caminho" do Storage (mesma convenção do
 * resolveStorageUrl do frontend), baixados via service role e enviados
 * embutidos em base64 (input_file p/ PDF/Office, input_image p/ imagem,
 * input_text p/ texto puro). O tipo sai da assinatura dos bytes; a extensão
 * só é usada quando os bytes não dizem nada.
 *
 * Opções de chamarOpenAI (todas opcionais — as ações antigas seguem iguais):
 *   strict (false)    → JSON Schema estrito (additionalProperties:false e tudo required)
 *   timeoutMs         → corta a chamada (AbortSignal.timeout) com erro claro
 *   maxOutputTokens   → teto da resposta; se estourar, erro "resposta cortada"
 *   inputsExtras      → itens de input prontos (input_text / input_image)
 *   modelo            → força o modelo (padrão: saas_config.openai_modelo)
 *   esforco           → reasoning.effort, só aplicado em modelos de raciocínio
 */
import { createAdminClient } from "./supabase-admin.ts";

const LIMITE_ARQUIVO = 15 * 1024 * 1024; // 15MB por arquivo
const LIMITE_TEXTO_ARQUIVO = 200_000; // caracteres de arquivo de texto puro

/** Modelo usado quando o econômico não dá conta (escalonamento / análises críticas). */
export const MODELO_FORTE = "gpt-4o";

export async function lerConfigOpenAI() {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("saas_config")
    .select("chave, valor")
    .in("chave", ["openai_api_key", "openai_modelo"]);
  const mapa = new Map((data ?? []).map((r) => [r.chave, r.valor]));
  const apiKey = Deno.env.get("OPENAI_API_KEY") || mapa.get("openai_api_key") || null;
  const modelo = mapa.get("openai_modelo") || "gpt-4o-mini";
  return { apiKey, modelo };
}

const MIME_POR_EXTENSAO: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  txt: "text/plain",
  csv: "text/csv",
  md: "text/markdown",
  json: "application/json",
  xml: "application/xml",
  htm: "text/html",
  html: "text/html",
  rtf: "application/rtf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
};

/** MIME pela assinatura dos bytes (ref sem extensão ou com extensão errada). */
function mimePelosBytes(buf: Uint8Array): string | null {
  const b = (i: number) => buf[i] ?? -1;
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return "image/png";
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return "image/jpeg";
  if (b(0) === 0x47 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x38) return "image/gif";
  if (
    b(0) === 0x52 &&
    b(1) === 0x49 &&
    b(2) === 0x46 &&
    b(3) === 0x46 && // RIFF
    b(8) === 0x57 &&
    b(9) === 0x45 &&
    b(10) === 0x42 &&
    b(11) === 0x50 // WEBP
  ) {
    return "image/webp";
  }
  // "%PDF-" pode vir depois de lixo no início (até 1KB, como os leitores aceitam)
  const cabeca = String.fromCharCode(...buf.subarray(0, 1024));
  if (cabeca.includes("%PDF-")) return "application/pdf";
  return null;
}

function paraBase64(buf: Uint8Array): string {
  let bin = "";
  const CH = 32768;
  for (let i = 0; i < buf.length; i += CH) {
    bin += String.fromCharCode(...buf.subarray(i, i + CH));
  }
  return btoa(bin);
}

/**
 * Ref "bucket/<empresa_id>/.../arquivo" ESTRITA. O download é feito com a
 * SERVICE ROLE montando a URL por concatenação — "..", "%2e%2e", "?" ou "#"
 * no caminho fariam o fetch sair do Storage (ex.: /rest/v1/<tabela>) ou ir
 * para a pasta de outra empresa. Qualquer coisa fora do formato é recusada.
 */
const RE_BUCKET = /^[a-z0-9][a-z0-9-]{1,62}$/;
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// eslint-disable-next-line no-control-regex
const RE_PROIBIDO = /[?#%\\\u0000-\u001f\u007f]/;

export function validarRef(ref: unknown): { bucket: string; path: string; empresaId: string } {
  if (typeof ref !== "string" || ref.length > 1024 || RE_PROIBIDO.test(ref)) {
    throw new Error("ref inválido");
  }
  const segs = ref.split("/");
  if (segs.length < 3 || segs.some((s) => !s || s === "." || s === ".." || s.trim() !== s)) {
    throw new Error("ref inválido");
  }
  if (!RE_BUCKET.test(segs[0]) || !RE_UUID.test(segs[1])) throw new Error("ref inválido");
  return { bucket: segs[0], path: segs.slice(1).join("/"), empresaId: segs[1].toLowerCase() };
}

/** Baixa um ref "bucket/caminho" e devolve o item de input pra OpenAI. */
export async function refParaInput(ref: string): Promise<Record<string, unknown>> {
  const { bucket, path } = validarRef(ref);
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) throw new Error(`download falhou (${ref}): ${error?.message ?? "vazio"}`);
  const buf = new Uint8Array(await data.arrayBuffer());
  if (buf.byteLength > LIMITE_ARQUIVO) throw new Error(`arquivo ${ref} acima de 15MB`);
  const nome = path.split("/").pop() || "arquivo";
  const ext = nome.includes(".") ? (nome.split(".").pop() || "").toLowerCase() : "";
  const mime =
    mimePelosBytes(buf) || MIME_POR_EXTENSAO[ext] || data.type || "application/octet-stream";

  if (mime.startsWith("image/")) {
    return { type: "input_image", image_url: `data:${mime};base64,${paraBase64(buf)}` };
  }
  // texto puro vai como texto (input_file só entende documentos)
  if (mime.startsWith("text/") || mime === "application/json" || mime === "application/xml") {
    const texto = new TextDecoder("utf-8").decode(buf).slice(0, LIMITE_TEXTO_ARQUIVO);
    return { type: "input_text", text: `=== ARQUIVO: ${nome} ===\n${texto}` };
  }
  return {
    type: "input_file",
    filename: nome,
    file_data: `data:${mime};base64,${paraBase64(buf)}`,
  };
}

export interface OpcoesOpenAI {
  prompt: string;
  fileRefs?: string[];
  jsonSchema?: unknown;
  /** nome do schema no response_format (só letras, números, _ e -) */
  nomeSchema?: string;
  modelo?: string;
  /** JSON Schema estrito (padrão false, como as ações antigas) */
  strict?: boolean;
  /** corta a chamada após N ms com erro "tempo esgotado" */
  timeoutMs?: number;
  maxOutputTokens?: number;
  /** itens de input já montados (input_text / input_image), após prompt e arquivos */
  inputsExtras?: Record<string, unknown>[];
  /** reasoning.effort — ignorado em modelos sem raciocínio (gpt-4o etc.) */
  esforco?: "minimal" | "low" | "medium" | "high";
}

export interface UsoOpenAI {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
}

export type RespostaOpenAI =
  | { ok: true; resultado: unknown; modelo: string; usage?: UsoOpenAI; ms: number }
  | {
      ok: false;
      erro: string;
      /** config | timeout | rede | http | cortada | recusa | json */
      motivo?: string;
      modelo?: string;
      usage?: UsoOpenAI;
      ms?: number;
    };

const MODELO_RACIOCINIO = /^(o\d|gpt-5)/i;

// deno-lint-ignore no-explicit-any
function lerUso(j: any): UsoOpenAI | undefined {
  if (!j?.usage) return undefined;
  return {
    input_tokens: Number(j.usage.input_tokens) || 0,
    output_tokens: Number(j.usage.output_tokens) || 0,
    total_tokens: Number(j.usage.total_tokens) || 0,
  };
}

function ehTimeout(e: unknown): boolean {
  const nome = (e as Error)?.name;
  return nome === "TimeoutError" || nome === "AbortError";
}

export async function chamarOpenAI(opts: OpcoesOpenAI): Promise<RespostaOpenAI> {
  const { apiKey, modelo: modeloPadrao } = await lerConfigOpenAI();
  if (!apiKey) return { ok: false, erro: "IA_NAO_CONFIGURADA", motivo: "config" };
  const modelo = opts.modelo || modeloPadrao;

  const conteudo: unknown[] = [{ type: "input_text", text: opts.prompt }];
  for (const ref of opts.fileRefs ?? []) conteudo.push(await refParaInput(ref));
  for (const extra of opts.inputsExtras ?? []) conteudo.push(extra);

  const body: Record<string, unknown> = {
    model: modelo,
    input: [{ role: "user", content: conteudo }],
    store: false,
  };
  if (opts.jsonSchema) {
    body.text = {
      format: {
        type: "json_schema",
        name: opts.nomeSchema || "resposta",
        schema: opts.jsonSchema,
        strict: opts.strict ?? false,
      },
    };
  }
  if (opts.maxOutputTokens) body.max_output_tokens = opts.maxOutputTokens;
  if (opts.esforco && MODELO_RACIOCINIO.test(modelo)) body.reasoning = { effort: opts.esforco };

  const inicio = Date.now();
  const segundos = Math.ceil((opts.timeoutMs ?? 0) / 1000);
  const erroTimeout = () => ({
    ok: false as const,
    erro: `IA (${modelo}) não respondeu em ${segundos} s — tempo esgotado`,
    motivo: "timeout",
    modelo,
    ms: Date.now() - inicio,
  });

  let r: Response;
  // deno-lint-ignore no-explicit-any
  let j: any = {};
  try {
    r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: opts.timeoutMs ? AbortSignal.timeout(opts.timeoutMs) : undefined,
    });
  } catch (e) {
    if (ehTimeout(e)) return erroTimeout();
    return {
      ok: false,
      erro: `Falha de rede com a OpenAI: ${(e as Error)?.message || e}`,
      motivo: "rede",
      modelo,
      ms: Date.now() - inicio,
    };
  }
  try {
    j = await r.json();
  } catch (e) {
    // o corpo também corre sob o mesmo AbortSignal
    if (ehTimeout(e)) return erroTimeout();
    j = {};
  }
  const ms = Date.now() - inicio;
  const usage = lerUso(j);

  if (!r.ok) {
    return {
      ok: false,
      erro: j?.error?.message || `OpenAI HTTP ${r.status}`,
      motivo: "http",
      modelo,
      ms,
    };
  }
  if (j?.status === "failed") {
    return {
      ok: false,
      erro: j?.error?.message || "IA falhou ao gerar a resposta",
      motivo: "http",
      modelo,
      usage,
      ms,
    };
  }
  if (j?.status === "incomplete") {
    const razao = j?.incomplete_details?.reason;
    const erro =
      razao === "max_output_tokens"
        ? `Resposta da IA cortada: atingiu o limite de ${opts.maxOutputTokens ?? "?"} tokens de saída — divida o documento em partes menores`
        : razao === "content_filter"
          ? "Resposta da IA cortada pelo filtro de conteúdo"
          : `Resposta da IA cortada (${razao || "incompleta"})`;
    return { ok: false, erro, motivo: "cortada", modelo, usage, ms };
  }

  // Texto = output[] do tipo "message" → content[] do tipo "output_text".
  // (output_text "achatado" só existe nos SDKs; itens de raciocínio não têm texto)
  // deno-lint-ignore no-explicit-any
  const partes: any[] = (Array.isArray(j?.output) ? j.output : [])
    // deno-lint-ignore no-explicit-any
    .filter((o: any) => !o?.type || o.type === "message")
    // deno-lint-ignore no-explicit-any
    .flatMap((o: any) => (Array.isArray(o?.content) ? o.content : []));
  const texto =
    partes
      .filter((c) => c?.type === "output_text" && typeof c.text === "string")
      .map((c) => c.text)
      .join("") || (typeof j?.output_text === "string" ? j.output_text : "");
  const recusa = partes.find((c) => c?.type === "refusal");
  if (!texto && recusa) {
    return {
      ok: false,
      erro: `IA recusou: ${recusa.refusal || "sem motivo"}`,
      motivo: "recusa",
      modelo,
      usage,
      ms,
    };
  }

  if (opts.jsonSchema) {
    try {
      return { ok: true, resultado: JSON.parse(texto), modelo, usage, ms };
    } catch {
      return { ok: false, erro: "IA devolveu JSON inválido", motivo: "json", modelo, usage, ms };
    }
  }
  return { ok: true, resultado: texto, modelo, usage, ms };
}
