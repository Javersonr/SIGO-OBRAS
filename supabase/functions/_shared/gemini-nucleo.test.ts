// Roda com Node 23.6+ (type stripping):  node --test supabase/functions/_shared/gemini-nucleo.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { criarChamarGemini, URL_GEMINI } from "./gemini-nucleo.ts";

type Chamada = { url: string; init: RequestInit; corpo: Record<string, unknown> };

/** fetch falso: devolve as respostas na ordem ({status, json} ou um erro para lançar) */
function fetchFalso(respostas: ({ status: number; json: unknown } | Error)[]) {
  const chamadas: Chamada[] = [];
  const fetch = async (url: string, init: RequestInit) => {
    chamadas.push({ url, init, corpo: JSON.parse(String(init.body)) });
    const r = respostas[chamadas.length - 1];
    if (!r) throw new Error("fetch chamado vezes demais");
    if (r instanceof Error) throw r;
    return new Response(JSON.stringify(r.json), { status: r.status });
  };
  return { fetch, chamadas };
}

const ARQUIVOS: Record<string, { nome: string; mime: string; bytes: Uint8Array }> = {
  "comprovantes/e1/nota.pdf": {
    nome: "nota.pdf",
    mime: "application/pdf",
    bytes: new TextEncoder().encode("%PDF-1"),
  },
  "comprovantes/e1/p.docx": {
    nome: "p.docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    bytes: new Uint8Array([80, 75]),
  },
};
const baixarRef = async (ref: string) => {
  const a = ARQUIVOS[ref];
  if (!a) throw new Error(`download falhou (${ref})`);
  return a;
};

const OK_JSON = {
  status: 200,
  json: {
    candidates: [{ finishReason: "STOP", content: { parts: [{ text: '{"valor_total":10}' }] } }],
    usageMetadata: {
      promptTokenCount: 900,
      candidatesTokenCount: 40,
      thoughtsTokenCount: 10,
      totalTokenCount: 950,
    },
  },
};
const BASE = { modelo: "gemini-3.5-flash-lite", apiKey: "chave-teste-123" };

test("chamada: URL do modelo, chave no header, PDF + extras antes do prompt, resposta com provedor", async () => {
  const f = fetchFalso([OK_JSON]);
  const chamar = criarChamarGemini({ baixarRef, fetch: f.fetch });
  const r = await chamar({
    ...BASE,
    prompt: "Leia",
    fileRefs: ["comprovantes/e1/nota.pdf"],
    inputsExtras: [{ type: "input_text", text: "=== PÁGINA 1 ===" }],
    jsonSchema: { type: "object" },
    maxOutputTokens: 8000,
    esforco: "low",
  });
  assert.equal(f.chamadas.length, 1);
  assert.equal(f.chamadas[0].url, `${URL_GEMINI}/gemini-3.5-flash-lite:generateContent`);
  assert.equal(
    f.chamadas[0].url,
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent"
  );
  assert.equal(f.chamadas[0].init.method, "POST");
  assert.equal(
    (f.chamadas[0].init.headers as Record<string, string>)["x-goog-api-key"],
    "chave-teste-123"
  );
  assert.ok(!f.chamadas[0].url.includes("chave-teste-123"), "chave nunca na URL");
  const partes = (f.chamadas[0].corpo.contents as { parts: unknown[] }[])[0].parts;
  assert.deepEqual(partes, [
    {
      inlineData: { mimeType: "application/pdf", data: Buffer.from("%PDF-1").toString("base64") },
      mediaResolution: { level: "MEDIA_RESOLUTION_MEDIUM" },
    },
    { text: "=== PÁGINA 1 ===" },
    { text: "Leia" },
  ]);
  assert.deepEqual(
    (f.chamadas[0].corpo.generationConfig as Record<string, unknown>).thinkingConfig,
    {
      thinkingLevel: "low",
    }
  );
  assert.equal(f.chamadas[0].corpo.store, false);
  assert.equal(r.ok, true);
  assert.equal(r.provedor, "gemini");
  assert.equal(r.modelo, "gemini-3.5-flash-lite");
  assert.deepEqual(r.ok && r.resultado, { valor_total: 10 });
  assert.deepEqual(r.usage, { input_tokens: 900, output_tokens: 50, total_tokens: 950 });
  assert.equal(typeof r.ms, "number");
});

test("400 no responseFormat: repete UMA vez no formato legado", async () => {
  const erroCampo = {
    status: 400,
    json: {
      error: {
        code: 400,
        message:
          "Invalid JSON payload received. Unknown name \"responseFormat\" at 'generation_config': Cannot find field.",
      },
    },
  };
  const f = fetchFalso([erroCampo, OK_JSON]);
  const r = await criarChamarGemini({ baixarRef, fetch: f.fetch })({
    ...BASE,
    prompt: "p",
    jsonSchema: { type: "object" },
  });
  assert.equal(f.chamadas.length, 2);
  const g2 = f.chamadas[1].corpo.generationConfig as Record<string, unknown>;
  assert.equal(g2.responseMimeType, "application/json");
  assert.deepEqual(g2.responseJsonSchema, { type: "object" });
  assert.equal(g2.responseFormat, undefined);
  assert.equal(r.ok, true);

  const f2 = fetchFalso([erroCampo, erroCampo, OK_JSON]);
  const r2 = await criarChamarGemini({ baixarRef, fetch: f2.fetch })({
    ...BASE,
    prompt: "p",
    jsonSchema: { type: "object" },
  });
  assert.equal(f2.chamadas.length, 2, "não repete a 2ª vez");
  assert.equal(r2.ok, false);
  assert.equal(!r2.ok && r2.motivo, "http");
  assert.equal(r2.provedor, "gemini");
});

test("erros: 429 sem crédito (http), 503 (rede), falha de rede, tempo esgotado", async () => {
  const chamar = (resp: { status: number; json: unknown } | Error) =>
    criarChamarGemini({ baixarRef, fetch: fetchFalso([resp]).fetch })({
      ...BASE,
      prompt: "p",
      timeoutMs: 60_000,
    });
  const semCredito = await chamar({
    status: 429,
    json: { error: { status: "RESOURCE_EXHAUSTED" } },
  });
  assert.equal(!semCredito.ok && semCredito.motivo, "http");
  assert.match(!semCredito.ok ? semCredito.erro : "", /sem crédito ou limite/);
  const fora = await chamar({ status: 503, json: {} });
  assert.equal(!fora.ok && fora.motivo, "rede");
  const rede = await chamar(new TypeError("fetch failed"));
  assert.equal(!rede.ok && rede.motivo, "rede");
  assert.match(!rede.ok ? rede.erro : "", /Falha de rede com o Google/);
  const tempo = await chamar(new DOMException("tempo", "TimeoutError"));
  assert.equal(!tempo.ok && tempo.motivo, "timeout");
  assert.match(!tempo.ok ? tempo.erro : "", /não respondeu em 60 s/);
  assert.equal(tempo.provedor, "gemini");
  assert.equal(tempo.modelo, "gemini-3.5-flash-lite");
});

test("403 com a chave suspensa: a mensagem do Google nunca devolve a chave (R-1)", async () => {
  const chaveReal = "AIzaSyFAKE1234567890EXEMPLOCHAVE";
  const f = fetchFalso([
    {
      status: 403,
      json: {
        error: {
          message: `Permission denied: Consumer 'api_key:${chaveReal}' has been suspended.`,
        },
      },
    },
  ]);
  const r = await criarChamarGemini({ baixarRef, fetch: f.fetch })({
    modelo: "gemini-3.5-flash-lite",
    apiKey: chaveReal,
    prompt: "p",
  });
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.motivo, "http");
  const bruto = JSON.stringify(r);
  assert.ok(!bruto.includes(chaveReal), `resposta não pode conter a chave: ${bruto}`);
  assert.ok(!bruto.includes("api_key:AIza"), `resposta não pode conter api_key:<token>: ${bruto}`);
  assert.match(!r.ok ? r.erro : "", /Chave do Gemini sem permissão/);
});

test("400 legado com a chave na mensagem: o aviso do console também mascara (R-1)", async () => {
  const chaveReal = "AIzaSyOUTRAFAKE9876543210EXEMPLO";
  const erroCampo = {
    status: 400,
    json: {
      error: {
        code: 400,
        message: `Invalid JSON payload received. Unknown name "responseFormat" (api_key:${chaveReal}).`,
      },
    },
  };
  const f = fetchFalso([erroCampo, OK_JSON]);
  const avisos: unknown[][] = [];
  const warnOriginal = console.warn;
  console.warn = (...args: unknown[]) => avisos.push(args);
  try {
    const r = await criarChamarGemini({ baixarRef, fetch: f.fetch })({
      modelo: "gemini-3.5-flash-lite",
      apiKey: chaveReal,
      prompt: "p",
      jsonSchema: { type: "object" },
    });
    assert.equal(r.ok, true);
  } finally {
    console.warn = warnOriginal;
  }
  assert.equal(avisos.length, 1);
  const textoAviso = JSON.stringify(avisos[0]);
  assert.ok(!textoAviso.includes(chaveReal), `aviso não pode conter a chave: ${textoAviso}`);
  assert.ok(!textoAviso.includes("api_key:AIza"), `aviso não pode conter api_key:<token>`);
});

test("arquivo ou entrada que o Gemini não lê: falha 'config' sem chamar o Google", async () => {
  const f = fetchFalso([OK_JSON]);
  const chamar = criarChamarGemini({ baixarRef, fetch: f.fetch });
  const docx = await chamar({ ...BASE, prompt: "p", fileRefs: ["comprovantes/e1/p.docx"] });
  assert.equal(!docx.ok && docx.motivo, "config");
  assert.match(!docx.ok ? docx.erro : "", /p\.docx/);
  const url = await chamar({
    ...BASE,
    prompt: "p",
    inputsExtras: [{ type: "input_image", image_url: "https://x/y.jpg" }],
  });
  assert.equal(!url.ok && url.motivo, "config");
  assert.equal(f.chamadas.length, 0);
  // download que falha continua lançando (igual ao openai.ts)
  await assert.rejects(
    chamar({ ...BASE, prompt: "p", fileRefs: ["comprovantes/e1/nao-existe.pdf"] }),
    /download falhou/
  );
});
