// Roda com Node 23.6+ (type stripping):  node --test supabase/functions/_shared/gemini-regras.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  arquivoParaParte,
  bytesParaBase64,
  erroHttpGemini,
  GEMINI_MODELO_FORTE,
  GEMINI_MODELO_PADRAO,
  inputExtraParaParte,
  lerRespostaGemini,
  mensagemTesteGemini,
  montarCorpoGemini,
  MODELOS_GEMINI_FORTE,
  MODELOS_GEMINI_PADRAO,
  nivelDePensamento,
  paraSchemaGemini,
} from "./gemini-regras.ts";

const bytes = (s: string) => new TextEncoder().encode(s);

test("modelos permitidos e padrões", () => {
  assert.deepEqual(
    [...MODELOS_GEMINI_PADRAO],
    ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.8-flash"]
  );
  assert.deepEqual([...MODELOS_GEMINI_FORTE], ["gemini-3.8-flash", "gemini-3.1-pro-preview"]);
  assert.equal(GEMINI_MODELO_PADRAO, "gemini-3.5-flash-lite");
  assert.equal(GEMINI_MODELO_FORTE, "gemini-3.8-flash");
  assert.ok(MODELOS_GEMINI_PADRAO.includes(GEMINI_MODELO_PADRAO));
  assert.ok(MODELOS_GEMINI_FORTE.includes(GEMINI_MODELO_FORTE));
});

test("paraSchemaGemini: tira $schema e palavras não aceitas, recursivo", () => {
  const entrada = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    additionalProperties: false,
    required: ["pattern", "lista"],
    properties: {
      // propriedade CHAMADA "pattern": o nome fica, o "pattern" de dentro sai
      pattern: {
        type: ["string", "null"],
        pattern: "^\\d+$",
        minLength: 1,
        maxLength: 9,
        description: "código",
      },
      lista: {
        type: "array",
        maxItems: 5,
        uniqueItems: true,
        default: [],
        items: { type: "number", multipleOf: 0.01, examples: [1] },
      },
      talvez: { anyOf: [{ type: "string", not: { const: "x" } }, { type: "null" }] },
      cond: { type: "object", if: {}, then: {}, else: {}, properties: {} },
    },
  };
  assert.deepEqual(paraSchemaGemini(entrada), {
    type: "object",
    additionalProperties: false,
    required: ["pattern", "lista"],
    properties: {
      pattern: { type: ["string", "null"], description: "código" },
      lista: { type: "array", maxItems: 5, items: { type: "number" } },
      talvez: { anyOf: [{ type: "string" }, { type: "null" }] },
      cond: { type: "object", properties: {} },
    },
  });
  // não muda o original
  assert.equal(entrada.$schema, "https://json-schema.org/draft/2020-12/schema");
});

test("paraSchemaGemini: enum que aceita null vira anyOf [enum sem null, null]", () => {
  assert.deepEqual(
    paraSchemaGemini({ type: ["string", "null"], enum: ["a", "b", null], description: "situação" }),
    {
      description: "situação",
      anyOf: [{ type: "string", enum: ["a", "b"] }, { type: "null" }],
    }
  );
  // enum sem null fica como está
  assert.deepEqual(paraSchemaGemini({ type: "string", enum: ["a", "b"] }), {
    type: "string",
    enum: ["a", "b"],
  });
  // dentro de items também
  assert.deepEqual(
    paraSchemaGemini({ type: "array", items: { type: ["string", "null"], enum: ["x", null] } }),
    {
      type: "array",
      items: { anyOf: [{ type: "string", enum: ["x"] }, { type: "null" }] },
    }
  );
});

test("nivelDePensamento: sem esforço não manda; minimal vira low nos 3.7/3.8-flash e no pro", () => {
  assert.equal(nivelDePensamento("gemini-3.5-flash-lite"), undefined);
  assert.equal(nivelDePensamento("gemini-3.5-flash-lite", "minimal"), "minimal");
  assert.equal(nivelDePensamento("gemini-3.8-flash", "minimal"), "low");
  assert.equal(nivelDePensamento("gemini-3.7-flash", "minimal"), "low");
  assert.equal(nivelDePensamento("gemini-3.1-pro-preview", "minimal"), "low");
  assert.equal(nivelDePensamento("gemini-3.8-flash", "high"), "high");
  assert.equal(nivelDePensamento("gemini-3.1-flash-lite", "medium"), "medium");
});

test("bytesParaBase64: igual ao Buffer, inclusive acima de 32 KB", () => {
  const pequeno = new Uint8Array([0, 1, 2, 250, 255]);
  assert.equal(bytesParaBase64(pequeno), Buffer.from(pequeno).toString("base64"));
  const grande = new Uint8Array(100_000).map((_, i) => (i * 7) % 256);
  assert.equal(bytesParaBase64(grande), Buffer.from(grande).toString("base64"));
});

test("arquivoParaParte: texto vira texto; PDF e imagem viram inlineData", () => {
  assert.deepEqual(
    arquivoParaParte({ nome: "nota.xml", mime: "application/xml", bytes: bytes("<a>é</a>") }),
    {
      text: "=== ARQUIVO: nota.xml ===\n<a>é</a>",
    }
  );
  const longo = arquivoParaParte({
    nome: "x.txt",
    mime: "text/plain",
    bytes: bytes("a".repeat(250_000)),
  });
  assert.equal(
    (longo as { text: string }).text.length,
    "=== ARQUIVO: x.txt ===\n".length + 200_000
  );
  assert.deepEqual(
    arquivoParaParte({ nome: "d.pdf", mime: "application/pdf", bytes: bytes("%PDF-1") }),
    {
      inlineData: { mimeType: "application/pdf", data: Buffer.from("%PDF-1").toString("base64") },
      mediaResolution: { level: "MEDIA_RESOLUTION_MEDIUM" },
    }
  );
  assert.deepEqual(
    arquivoParaParte({ nome: "f.jpg", mime: "image/jpeg", bytes: new Uint8Array([255, 216, 255]) }),
    {
      inlineData: { mimeType: "image/jpeg", data: "/9j/" },
    }
  );
  assert.throws(
    () =>
      arquivoParaParte({
        nome: "p.docx",
        mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        bytes: bytes("PK"),
      }),
    /Gemini não lê arquivos do tipo .*p\.docx/
  );
});

test("inputExtraParaParte: input_text e input_image com data URL; o resto é null", () => {
  assert.deepEqual(inputExtraParaParte({ type: "input_text", text: "=== PÁGINA 3 ===" }), {
    text: "=== PÁGINA 3 ===",
  });
  assert.deepEqual(
    inputExtraParaParte({
      type: "input_image",
      image_url: "data:image/JPEG;base64,/9j/AAA=",
      detail: "high",
    }),
    { inlineData: { mimeType: "image/jpeg", data: "/9j/AAA=" } }
  );
  assert.equal(inputExtraParaParte({ type: "input_image", image_url: "https://x/y.jpg" }), null);
  assert.equal(
    inputExtraParaParte({ type: "input_file", file_data: "data:application/pdf;base64,AA" }),
    null
  );
});

test("montarCorpoGemini: mídias antes, prompt por último, store:false, sem temperature", () => {
  const pdf = {
    inlineData: { mimeType: "application/pdf", data: "AA==" },
    mediaResolution: { level: "MEDIA_RESOLUTION_MEDIUM" as const },
  };
  const schema = {
    $schema: "x",
    type: "object",
    properties: { a: { type: "string", pattern: "x" } },
  };
  const corpo = montarCorpoGemini({
    prompt: "Leia o documento",
    partes: [pdf, { text: "extra" }],
    jsonSchema: schema,
    maxOutputTokens: 8000,
    pensamento: "low",
  });
  assert.deepEqual(corpo, {
    contents: [{ role: "user", parts: [pdf, { text: "extra" }, { text: "Leia o documento" }] }],
    generationConfig: {
      responseFormat: {
        text: {
          mimeType: "application/json",
          schema: { type: "object", properties: { a: { type: "string" } } },
        },
      },
      maxOutputTokens: 8000,
      thinkingConfig: { thinkingLevel: "low" },
    },
    store: false,
  });
  assert.ok(!JSON.stringify(corpo).match(/temperature|topP|topK/));
});

test("montarCorpoGemini: sem schema nem opções não manda generationConfig", () => {
  assert.deepEqual(montarCorpoGemini({ prompt: "oi", partes: [] }), {
    contents: [{ role: "user", parts: [{ text: "oi" }] }],
    store: false,
  });
});

test("montarCorpoGemini: formato legado usa responseMimeType + responseJsonSchema, tira mediaResolution e não manda store", () => {
  const corpo = montarCorpoGemini({
    prompt: "p",
    partes: [
      {
        inlineData: { mimeType: "application/pdf", data: "AA==" },
        mediaResolution: { level: "MEDIA_RESOLUTION_MEDIUM" },
      },
    ],
    jsonSchema: { type: "object" },
    formatoLegado: true,
  });
  assert.deepEqual(corpo, {
    contents: [
      {
        role: "user",
        parts: [{ inlineData: { mimeType: "application/pdf", data: "AA==" } }, { text: "p" }],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseJsonSchema: { type: "object" },
    },
  });
});

const uso = {
  promptTokenCount: 1000,
  candidatesTokenCount: 200,
  thoughtsTokenCount: 50,
  totalTokenCount: 1250,
};

test("lerRespostaGemini: STOP junta o texto, ignora pensamento e soma pensamento na saída", () => {
  const r = lerRespostaGemini(
    {
      candidates: [
        {
          finishReason: "STOP",
          content: {
            parts: [{ text: "rascunho", thought: true }, { text: '{"a":' }, { text: "1}" }],
          },
        },
      ],
      usageMetadata: uso,
    },
    true
  );
  assert.deepEqual(r, {
    ok: true,
    resultado: { a: 1 },
    usage: { input_tokens: 1000, output_tokens: 250, total_tokens: 1250 },
  });
  const t = lerRespostaGemini(
    { candidates: [{ finishReason: "STOP", content: { parts: [{ text: "olá" }] } }] },
    false
  );
  assert.deepEqual(t, {
    ok: true,
    resultado: "olá",
    usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
  });
});

test("lerRespostaGemini: MAX_TOKENS = cortada; bloqueios = recusa; JSON ruim = json", () => {
  const cortada = lerRespostaGemini(
    {
      candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: '{"a"' }] } }],
      usageMetadata: uso,
    },
    true
  );
  assert.equal(cortada.ok, false);
  assert.equal(!cortada.ok && cortada.motivo, "cortada");
  assert.equal(!cortada.ok && cortada.usage?.output_tokens, 250);
  for (const fim of ["SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII"]) {
    const r = lerRespostaGemini(
      { candidates: [{ finishReason: fim, content: { parts: [] } }] },
      true
    );
    assert.equal(!r.ok && r.motivo, "recusa", fim);
  }
  const bloqueio = lerRespostaGemini(
    { promptFeedback: { blockReason: "SAFETY" }, usageMetadata: uso },
    true
  );
  assert.equal(!bloqueio.ok && bloqueio.motivo, "recusa");
  assert.match(!bloqueio.ok ? bloqueio.erro : "", /SAFETY/);
  const ruim = lerRespostaGemini(
    { candidates: [{ finishReason: "STOP", content: { parts: [{ text: "não é json" }] } }] },
    true
  );
  assert.equal(!ruim.ok && ruim.motivo, "json");
  const vazio = lerRespostaGemini({}, false);
  assert.equal(!vazio.ok && vazio.motivo, "http");
});

test("erroHttpGemini: chave inválida, sem crédito, 5xx = rede, 400 do responseFormat pede formato legado", () => {
  const chave = erroHttpGemini(400, {
    error: {
      code: 400,
      message: "API key not valid.",
      status: "INVALID_ARGUMENT",
      details: [{ reason: "API_KEY_INVALID" }],
    },
  });
  assert.deepEqual(chave, {
    erro: "Chave do Gemini inválida — confira no SaaS Admin → Integrações",
    motivo: "http",
    tentarFormatoLegado: false,
  });
  for (const s of [402, 429]) {
    const e = erroHttpGemini(s, { error: { status: "RESOURCE_EXHAUSTED" } });
    assert.equal(e.motivo, "http");
    assert.match(e.erro, /sem crédito ou limite/);
  }
  const negado = erroHttpGemini(403, {
    error: { message: "Permission denied", status: "PERMISSION_DENIED" },
  });
  assert.equal(negado.motivo, "http");
  assert.match(negado.erro, /sem permissão/);
  assert.equal(erroHttpGemini(503, {}).motivo, "rede");
  assert.match(erroHttpGemini(500, null).erro, /Google indisponível \(código 500\)/);
  const legado = erroHttpGemini(400, {
    error: {
      message:
        "Invalid JSON payload received. Unknown name \"responseFormat\" at 'generation_config': Cannot find field.",
      details: [{ fieldViolations: [{ field: "generation_config.response_format" }] }],
    },
  });
  assert.equal(legado.tentarFormatoLegado, true);
  assert.equal(legado.motivo, "http");
  assert.equal(
    erroHttpGemini(400, {
      error: { message: "Unknown name \"mediaResolution\" at 'contents[0].parts[0]'" },
    }).tentarFormatoLegado,
    true
  );
  assert.equal(
    erroHttpGemini(400, {
      error: { message: 'Invalid JSON payload received. Unknown name "store": Cannot find field.' },
    }).tentarFormatoLegado,
    true
  );
  assert.equal(
    erroHttpGemini(400, { error: { message: "Request contains an invalid argument." } })
      .tentarFormatoLegado,
    false
  );
});

test("mensagemTesteGemini: textos do botão Testar", () => {
  assert.deepEqual(mensagemTesteGemini(200, { name: "models/gemini-3.5-flash-lite" }), {
    ok: true,
    mensagem: "Gemini respondeu",
  });
  assert.deepEqual(
    mensagemTesteGemini(400, { error: { details: [{ reason: "API_KEY_INVALID" }] } }),
    {
      ok: false,
      mensagem: "Chave inválida",
    }
  );
  assert.deepEqual(mensagemTesteGemini(403, {}), { ok: false, mensagem: "Chave sem permissão" });
  assert.deepEqual(mensagemTesteGemini(429, {}), {
    ok: false,
    mensagem: "Sem crédito ou limite atingido",
  });
  assert.deepEqual(mensagemTesteGemini(402, null), {
    ok: false,
    mensagem: "Sem crédito ou limite atingido",
  });
  assert.deepEqual(mensagemTesteGemini(404, {}), {
    ok: false,
    mensagem: "Modelo não encontrado no Google (código 404)",
  });
  assert.deepEqual(mensagemTesteGemini(500, {}), {
    ok: false,
    mensagem: "Google indisponível (código 500)",
  });
});
