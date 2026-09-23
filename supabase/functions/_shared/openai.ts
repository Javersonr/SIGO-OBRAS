/**
 * openai — núcleo de chamadas à OpenAI Responses API.
 *
 * Chave: env OPENAI_API_KEY > saas_config.openai_api_key (painel SaaS Admin).
 * Arquivos: refs "bucket/caminho" do Storage (mesma convenção do
 * resolveStorageUrl do frontend), baixados via service role e enviados
 * embutidos em base64 (input_file p/ PDF, input_image p/ imagem).
 */
import { createAdminClient } from "./supabase-admin.ts";

const LIMITE_ARQUIVO = 15 * 1024 * 1024; // 15MB por arquivo

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

/** Baixa um ref "bucket/caminho" e devolve o item de input pra OpenAI. */
export async function refParaInput(ref: string): Promise<Record<string, unknown>> {
  const slash = ref.indexOf("/");
  if (slash < 1) throw new Error(`ref inválido: ${ref}`);
  const bucket = ref.slice(0, slash);
  const path = ref.slice(slash + 1);
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) throw new Error(`download falhou (${ref}): ${error?.message ?? "vazio"}`);
  const buf = new Uint8Array(await data.arrayBuffer());
  if (buf.byteLength > LIMITE_ARQUIVO) throw new Error(`arquivo ${ref} acima de 15MB`);
  let bin = "";
  const CH = 32768;
  for (let i = 0; i < buf.length; i += CH) {
    bin += String.fromCharCode(...buf.subarray(i, i + CH));
  }
  const b64 = btoa(bin);
  const nome = path.split("/").pop() || "arquivo";
  const ext = (nome.split(".").pop() || "").toLowerCase();
  if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) {
    const mime = ext === "jpg" ? "jpeg" : ext;
    return { type: "input_image", image_url: `data:image/${mime};base64,${b64}` };
  }
  return { type: "input_file", filename: nome, file_data: `data:application/pdf;base64,${b64}` };
}

export async function chamarOpenAI(opts: {
  prompt: string;
  fileRefs?: string[];
  jsonSchema?: unknown;
  modelo?: string;
}): Promise<{ ok: true; resultado: unknown } | { ok: false; erro: string }> {
  const { apiKey, modelo } = await lerConfigOpenAI();
  if (!apiKey) return { ok: false, erro: "IA_NAO_CONFIGURADA" };

  const conteudo: unknown[] = [{ type: "input_text", text: opts.prompt }];
  for (const ref of opts.fileRefs ?? []) conteudo.push(await refParaInput(ref));

  const body: Record<string, unknown> = {
    model: opts.modelo || modelo,
    input: [{ role: "user", content: conteudo }],
  };
  if (opts.jsonSchema) {
    body.text = {
      format: { type: "json_schema", name: "resposta", schema: opts.jsonSchema, strict: false },
    };
  }

  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  // deno-lint-ignore no-explicit-any
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, erro: j?.error?.message || `OpenAI HTTP ${r.status}` };

  const texto: string =
    j.output_text ??
    (j.output ?? [])
      // deno-lint-ignore no-explicit-any
      .flatMap((o: any) => o.content ?? [])
      // deno-lint-ignore no-explicit-any
      .filter((c: any) => c.type === "output_text")
      // deno-lint-ignore no-explicit-any
      .map((c: any) => c.text)
      .join("") ??
    "";

  if (opts.jsonSchema) {
    try {
      return { ok: true, resultado: JSON.parse(texto) };
    } catch {
      return { ok: false, erro: "IA devolveu JSON inválido" };
    }
  }
  return { ok: true, resultado: texto };
}
