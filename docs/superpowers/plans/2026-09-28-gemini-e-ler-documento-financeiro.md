# Gemini como IA padrão + "Ler documento" no Financeiro — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O Gemini (chave no SaaS Admin) vira a IA padrão do SIGO com o ChatGPT de reserva e custo por empresa, e a nova despesa e a nova receita ganham o botão "Ler documento" (XML sem IA; PDF/foto com IA), que preenche o formulário para conferência.

**Architecture:** Parte A — lógica pura testável (`_shared/gemini-regras.ts`, `gemini-nucleo.ts`, `ia-nucleo.ts`, `ia-precos.ts`) com adaptadores Deno finos (`gemini.ts`, `ia.ts`); todas as ações da `ia-processar` passam por `chamarIA` (Gemini → OpenAI) e registram uso/custo em `ia_uso` (migração 0123); a `saas-config` e o `IntegracoesTab` ganham o card do Gemini. Parte B — `DocumentoFiscal` como formato comum: `lib/nfe-xml.js` (XML no navegador, sem IA), `ia-processar/financeiro-documento.ts` + ação `financeiro_ler_documento` (PDF/foto), `lib/documento-financeiro.js` (monta o patch do formulário) e o `LerDocumentoButton` nas telas de despesa e receita.

**Tech Stack:** Supabase Edge Functions (Deno, imports por esm.sh), Gemini API v1beta `generateContent` via fetch, OpenAI Responses (reserva), React 18 + Vite, vitest (node), `node --test` (Node 24).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-25-gemini-e-ler-documento-financeiro-design.md` (aprovada em 25/09/2026). Contrato de nomes/formatos entre as tasks: seções "Interfaces" de cada task (idênticas ao contrato usado na redação).
- Chave do Gemini **só no SaaS Admin** (`saas_config.gemini_api_key`, `gemini_modelo`, `gemini_modelo_forte`; env `GEMINI_API_KEY` tem prioridade); só o super admin grava e testa; a chave nunca volta ao navegador (status mostra só os 4 finais). O Javerson cola a chave — nunca digitar chaves.
- Modelos: padrão `gemini-3.5-flash-lite` (lista: `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`, `gemini-3.8-flash`); forte `gemini-3.8-flash` (lista: `gemini-3.8-flash`, `gemini-3.1-pro-preview`). OpenAI: `openai_modelo` (padrão `gpt-4o-mini`) / forte `gpt-4o`.
- Chamada ao Gemini: `store:false` (exceto no formato legado), nunca `temperature/topP/topK`; `thinkingLevel` `minimal` vira `low` nos modelos 3.7/3.8-flash e pro; PDF com `mediaResolution` MEDIUM; limite de 15 MB por arquivo.
- Ordem: Gemini (se houver chave) → OpenAI (se houver chave e o Gemini falhou), sem fallback quando já passou da metade do `timeoutMs`. Sem nenhuma chave: `IA_NAO_CONFIGURADA` → "IA não configurada — defina a chave no SaaS Admin → Integrações".
- Uso: toda ação de IA registra em `ia_uso` (`provedor`, `custo_usd`); a cota diária continua só para `edital_*`.
- `DocumentoFiscal` (origem xml|ia) é o formato comum de front e back; nada é salvo sem o usuário clicar em Salvar; a leitura sobrescreve só os campos que o documento trouxe; chave de NF-e da IA só com DV módulo 11 válido.
- XML de NF-e/NFS-e **sem IA** (`lerXmlFiscal`, sem DOMParser; `textoDoXml` respeita o encoding do cabeçalho); PDF/JPEG/PNG/WEBP pela IA (HEIC recusado com "tire a foto em JPEG").
- Migração nova: `0123_ia_uso_provedor_custo.sql` (a 0124 já existe e foi aplicada — é do conector). Migrações com `supabase db query --linked -f` (nunca db push), idempotentes, terminando em `select 'ok' as res;`.
- Deploy: `ia-processar` e `saas-config` têm **verify_jwt=true** em produção → publicar SEM `--no-verify-jwt`: `npx supabase@2.118.0 functions deploy <nome> --project-ref fpyvdwpvxrubrkdwrqbs --use-api`. O deploy publica a working tree da função e do `_shared`: conferir `git status` antes.
- Commits: `git add <caminhos explícitos>` (nunca -A/-a); mensagem em português (`feat(ia): …`, `feat(financeiro): …`) terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Produção** (migração, deploy, push): pedir o OK do Javerson imediatamente antes de cada passo.
- **Edição dos arquivos existentes:** os arquivos do repositório estão com CRLF (core.autocrlf=true) e as âncoras deste plano com LF — aplicar as trocas antigo→novo com a ferramenta Edit (que lida com isso); se for por script, normalizar `\r\n`→`\n` antes de procurar o trecho antigo.
- Testes: backend `node --test supabase/functions/_shared/*.test.ts supabase/functions/ia-processar/*.test.ts supabase/functions/saas-config/*.test.ts` (em 28/09 a linha de base de `_shared` + `ia-processar` é 47 testes); front `cd apps/web && npx vitest run` (linha de base 14 arquivos / 128 testes); o build do front não imprime nada quando dá certo (`npm run build > /dev/null && echo BUILD_OK`).

## Decisões registradas na redação (aceitas)

- `mensagemTesteGemini`: 404 → "Modelo não encontrado no Google (código 404)".
- `chamarIA` lê o `saas_config` a cada chamada (uma consulta leve), não uma vez por requisição.
- `systemInstruction` não é usado (o `OpcoesIA` não tem esse campo).
- Formato legado (2ª tentativa) também quando o 400 citar `store`, e sem `store` no corpo.
- `lerXmlFiscal` usa um mini-leitor em árvore (sem DOMParser), lê também a NFS-e nacional e trata `tPag` 20 como PIX.
- `numero_documento` usa a chave de 44 dígitos quando existir (a Nota de Devolução procura por ela), senão o número.
- `documentoFraco(doc, tipo?)`; `chaveNfeValida` também confere UF e modelo 55/65; itens da IA limitados a 40 (com aviso); a leitura por IA escolhe a leitura não fraca entre padrão e forte (sem reaproveitar o `chamarComEscalonamento`).
- Pré-lançamento e reconciliação (outros pais do `DespesaModal`) ficam sem o botão novo — confirmar com o Javerson na Task 16.

---

## Parte A — motor de IA (Tasks 1 a 3)

Todos os comandos rodam na raiz do repositório (`/c/Users/javer/sigoobras-base`, Git Bash). Linha de base antes da Task 1: `node --test supabase/functions/_shared/*.test.ts supabase/functions/ia-processar/*.test.ts` → `ℹ tests 47`, `ℹ fail 0`. Estas três tasks só criam ou alteram código em `supabase/functions/_shared/`; nada é publicado aqui (produção é a Task 8).

### Task 1: Tipos comuns da IA e regras puras do Gemini

**Files:**

- Create: `supabase/functions/_shared/ia-tipos.ts` (~50 linhas, só tipos)
- Create: `supabase/functions/_shared/gemini-regras.ts` (~330 linhas)
- Test: `supabase/functions/_shared/gemini-regras.test.ts` (~380 linhas)

**Interfaces:**

- Consumes: nada (primeira task).
- Produces:
  - `ia-tipos.ts`: `Esforco`, `NivelIA`, `ProvedorIA`, `UsoIA`, `OpcoesIA`, `RespostaIA`, exatamente como no contrato (sem imports; importar sempre com `import type`).
  - `gemini-regras.ts`: `MODELOS_GEMINI_PADRAO: readonly string[]`, `MODELOS_GEMINI_FORTE: readonly string[]`, `GEMINI_MODELO_PADRAO = "gemini-3.5-flash-lite"`, `GEMINI_MODELO_FORTE = "gemini-3.8-flash"`, `type ParteGemini`, `paraSchemaGemini(schema: unknown): unknown`, `nivelDePensamento(modelo: string, esforco?: Esforco): Esforco | undefined`, `bytesParaBase64(bytes: Uint8Array): string`, `arquivoParaParte(a: { nome: string; mime: string; bytes: Uint8Array }): ParteGemini`, `inputExtraParaParte(x: Record<string, unknown>): ParteGemini | null`, `montarCorpoGemini(o): Record<string, unknown>`, `lerRespostaGemini(json, comSchema)`, `erroHttpGemini(status, corpo)`, `mensagemTesteGemini(status, corpo)`, com as assinaturas do contrato.
  - Detalhes que o contrato não fixava: as listas são `readonly string[]` (não `as const`), para `MODELOS_GEMINI_PADRAO.includes(valorDoCorpo)` compilar na Task 6; `arquivoParaParte` **lança** `Error("O Gemini não lê arquivos do tipo <mime> (<nome>)")` para Office/RTF etc.; `nivelDePensamento` também troca `minimal` por `low` nos modelos `*-pro*`; o `formatoLegado` de `montarCorpoGemini` também tira o `mediaResolution` das partes, e `erroHttpGemini` pede o formato legado quando o 400 cita `responseFormat` **ou** `mediaResolution`.

- [ ] **Step 1: Criar os tipos comuns**

Criar `supabase/functions/_shared/ia-tipos.ts`:

```ts
/**
 * ia-tipos — tipos comuns da porta de IA (Gemini padrão, OpenAI reserva).
 * Só tipos: sem imports e sem código, pode ser importado com `import type`
 * em qualquer módulo (inclusive os testados com node --test).
 */

export type Esforco = "minimal" | "low" | "medium" | "high";
export type NivelIA = "padrao" | "forte";
export type ProvedorIA = "gemini" | "openai";

export interface UsoIA {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
}

export interface OpcoesIA {
  prompt: string;
  fileRefs?: string[];
  jsonSchema?: unknown;
  nomeSchema?: string;
  strict?: boolean;
  timeoutMs?: number;
  maxOutputTokens?: number;
  inputsExtras?: Record<string, unknown>[];
  esforco?: Esforco;
  /** padrão "padrao" */
  nivel?: NivelIA;
}

export type RespostaIA =
  | {
      ok: true;
      resultado: unknown;
      modelo: string;
      provedor: ProvedorIA;
      usage?: UsoIA;
      ms: number;
      tentativas?: RespostaIA[];
    }
  | {
      ok: false;
      erro: string;
      /** config | timeout | rede | http | cortada | recusa | json */
      motivo?: string;
      modelo?: string;
      provedor?: ProvedorIA;
      usage?: UsoIA;
      ms?: number;
      tentativas?: RespostaIA[];
    };
```

- [ ] **Step 2: Escrever o teste que falha**

Criar `supabase/functions/_shared/gemini-regras.test.ts`:

```ts
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
  assert.deepEqual([...MODELOS_GEMINI_PADRAO], ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.8-flash"]);
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
  assert.deepEqual(paraSchemaGemini({ type: ["string", "null"], enum: ["a", "b", null], description: "situação" }), {
    description: "situação",
    anyOf: [{ type: "string", enum: ["a", "b"] }, { type: "null" }],
  });
  // enum sem null fica como está
  assert.deepEqual(paraSchemaGemini({ type: "string", enum: ["a", "b"] }), {
    type: "string",
    enum: ["a", "b"],
  });
  // dentro de items também
  assert.deepEqual(paraSchemaGemini({ type: "array", items: { type: ["string", "null"], enum: ["x", null] } }), {
    type: "array",
    items: { anyOf: [{ type: "string", enum: ["x"] }, { type: "null" }] },
  });
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
  assert.deepEqual(arquivoParaParte({ nome: "nota.xml", mime: "application/xml", bytes: bytes("<a>é</a>") }), {
    text: "=== ARQUIVO: nota.xml ===\n<a>é</a>",
  });
  const longo = arquivoParaParte({
    nome: "x.txt",
    mime: "text/plain",
    bytes: bytes("a".repeat(250_000)),
  });
  assert.equal((longo as { text: string }).text.length, "=== ARQUIVO: x.txt ===\n".length + 200_000);
  assert.deepEqual(arquivoParaParte({ nome: "d.pdf", mime: "application/pdf", bytes: bytes("%PDF-1") }), {
    inlineData: { mimeType: "application/pdf", data: Buffer.from("%PDF-1").toString("base64") },
    mediaResolution: { level: "MEDIA_RESOLUTION_MEDIUM" },
  });
  assert.deepEqual(arquivoParaParte({ nome: "f.jpg", mime: "image/jpeg", bytes: new Uint8Array([255, 216, 255]) }), {
    inlineData: { mimeType: "image/jpeg", data: "/9j/" },
  });
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
  assert.equal(inputExtraParaParte({ type: "input_file", file_data: "data:application/pdf;base64,AA" }), null);
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
  const t = lerRespostaGemini({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "olá" }] } }] }, false);
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
    const r = lerRespostaGemini({ candidates: [{ finishReason: fim, content: { parts: [] } }] }, true);
    assert.equal(!r.ok && r.motivo, "recusa", fim);
  }
  const bloqueio = lerRespostaGemini({ promptFeedback: { blockReason: "SAFETY" }, usageMetadata: uso }, true);
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
    erroHttpGemini(400, { error: { message: "Request contains an invalid argument." } }).tentarFormatoLegado,
    false
  );
});

test("mensagemTesteGemini: textos do botão Testar", () => {
  assert.deepEqual(mensagemTesteGemini(200, { name: "models/gemini-3.5-flash-lite" }), {
    ok: true,
    mensagem: "Gemini respondeu",
  });
  assert.deepEqual(mensagemTesteGemini(400, { error: { details: [{ reason: "API_KEY_INVALID" }] } }), {
    ok: false,
    mensagem: "Chave inválida",
  });
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
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `node --test supabase/functions/_shared/gemini-regras.test.ts`
Expected (FAIL, o módulo ainda não existe):

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '...\supabase\functions\_shared\gemini-regras.ts' imported from ...\supabase\functions\_shared\gemini-regras.test.ts
ℹ tests 1
ℹ pass 0
ℹ fail 1
```

- [ ] **Step 4: Implementar as regras**

Criar `supabase/functions/_shared/gemini-regras.ts`:

```ts
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
export const MODELOS_GEMINI_FORTE: readonly string[] = ["gemini-3.8-flash", "gemini-3.1-pro-preview"];
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

const ehObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

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
      out[k] = Object.fromEntries(Object.entries(v).map(([nome, sub]) => [nome, paraSchemaGemini(sub)]));
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
    const tipos = (Array.isArray(type) ? type : type === undefined ? [] : [type]).filter((t) => t !== "null");
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
export function arquivoParaParte(a: { nome: string; mime: string; bytes: Uint8Array }): ParteGemini {
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
    const cab = virgula > 0 ? /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64$/i.exec(url.slice(0, virgula)) : null;
    if (cab) return { inlineData: { mimeType: cab[1].toLowerCase(), data: url.slice(virgula + 1) } };
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
  if (FIM_RECUSA.has(fim)) return { ok: false, erro: `IA recusou: ${fim}`, motivo: "recusa", usage };

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
    status === 400 && /response_?format|media_?resolution|\\?"store\\?"/i.test(JSON.stringify(corpo ?? ""));
  return {
    erro: `Gemini recusou o pedido (código ${status})${sufixo}`,
    motivo: "http",
    tentarFormatoLegado: legado,
  };
}

/** resultado do GET /v1beta/models/<modelo> → texto do botão "Testar" do SaaS Admin */
export function mensagemTesteGemini(status: number, corpo: unknown): { ok: boolean; mensagem: string } {
  if (status >= 200 && status < 300) return { ok: true, mensagem: "Gemini respondeu" };
  if (status === 400 && chaveInvalida(detalhesGoogle(corpo))) return { ok: false, mensagem: "Chave inválida" };
  if (status === 403) return { ok: false, mensagem: "Chave sem permissão" };
  if (status === 402 || status === 429) return { ok: false, mensagem: "Sem crédito ou limite atingido" };
  if (status === 404) return { ok: false, mensagem: "Modelo não encontrado no Google (código 404)" };
  return { ok: false, mensagem: `Google indisponível (código ${status})` };
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `node --test supabase/functions/_shared/gemini-regras.test.ts`
Expected (PASS):

```
✔ modelos permitidos e padrões
✔ paraSchemaGemini: tira $schema e palavras não aceitas, recursivo
...
✔ mensagemTesteGemini: textos do botão Testar
ℹ tests 14
ℹ pass 14
ℹ fail 0
```

- [ ] **Step 6: Regressão do backend**

Run: `node --test supabase/functions/_shared/*.test.ts supabase/functions/ia-processar/*.test.ts`
Expected: `ℹ tests 61`, `ℹ pass 61`, `ℹ fail 0`.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/_shared/ia-tipos.ts supabase/functions/_shared/gemini-regras.ts supabase/functions/_shared/gemini-regras.test.ts
git commit -F - <<'EOF'
feat(ia): tipos comuns da IA e regras puras do cliente Gemini

Schema para o Gemini, corpo do generateContent (store:false, prompt por
último, responseFormat ou formato legado), leitura da resposta (pensamento,
cortada, recusa, JSON) e tradução dos erros HTTP e do botão Testar.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log --oneline -1
```

Expected: o lint-staged roda o prettier nos 3 arquivos e o commit sai; `git log` mostra `feat(ia): tipos comuns da IA e regras puras do cliente Gemini`.

### Task 2: `baixarRef` no openai.ts e cliente Gemini (`gemini-nucleo.ts` + `gemini.ts`)

**Files:**

- Modify: `supabase/functions/_shared/openai.ts` (linhas ~120-131: o download, o limite de 15 MB e o MIME saem de `refParaInput` para `baixarRef`)
- Create: `supabase/functions/_shared/gemini-nucleo.ts` (~130 linhas; orquestração com download e fetch injetados, testável no Node)
- Create: `supabase/functions/_shared/gemini.ts` (~47 linhas; Deno)
- Test: `supabase/functions/_shared/gemini-nucleo.test.ts`

**Interfaces:**

- Consumes (Task 1): `OpcoesIA`, `RespostaIA` (ia-tipos.ts); `ParteGemini`, `arquivoParaParte`, `inputExtraParaParte`, `montarCorpoGemini`, `nivelDePensamento`, `lerRespostaGemini`, `erroHttpGemini`, `mensagemTesteGemini` (gemini-regras.ts). Já existentes: `validarRef`, `mimePelosBytes`, `MIME_POR_EXTENSAO`, `LIMITE_ARQUIVO` (openai.ts) e `createAdminClient` (supabase-admin.ts).
- Produces:
  - `openai.ts`: `baixarRef(ref: string): Promise<{ nome: string; mime: string; bytes: Uint8Array }>`. `refParaInput` passa a usá-la, e a OpenAI recebe exatamente o mesmo input de hoje.
  - `gemini-nucleo.ts` (acréscimo ao contrato, só para testar a chamada no Node): `URL_GEMINI = "https://generativelanguage.googleapis.com/v1beta/models"`, `interface DepsGemini { baixarRef(ref); fetch(url, init) }` e `criarChamarGemini(deps: DepsGemini): (o: OpcoesIA & { modelo: string; apiKey: string }) => Promise<RespostaIA>`.
  - `gemini.ts`: `chamarGemini(o: OpcoesIA & { modelo: string; apiKey: string }): Promise<RespostaIA>` e `testarChaveGemini(apiKey: string, modelo: string): Promise<{ ok: boolean; mensagem: string }>` (GET `…/v1beta/models/<modelo>`, timeout de 10 s).
  - Comportamento garantido:
    - toda resposta traz `provedor: "gemini"` e `modelo`;
    - arquivo ou entrada que o Gemini não lê (Office, `input_image` por URL) → `{ ok:false, motivo:"config" }` **sem chamar o Google**: a porta da Task 3 cai para o OpenAI, e o medidor da Task 4 não conta a tentativa;
    - erro de download **lança**, igual ao `chamarOpenAI`;
    - `timeoutMs` vale para a chamada toda, inclusive a repetição;
    - um 400 que cita `responseFormat`/`mediaResolution` é repetido 1 vez no formato legado.

- [ ] **Step 1: Escrever o teste que falha**

Criar `supabase/functions/_shared/gemini-nucleo.test.ts`:

```ts
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
  assert.equal((f.chamadas[0].init.headers as Record<string, string>)["x-goog-api-key"], "chave-teste-123");
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
  assert.deepEqual((f.chamadas[0].corpo.generationConfig as Record<string, unknown>).thinkingConfig, {
    thinkingLevel: "low",
  });
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
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test supabase/functions/_shared/gemini-nucleo.test.ts`
Expected (FAIL):

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '...\supabase\functions\_shared\gemini-nucleo.ts' imported from ...\supabase\functions\_shared\gemini-nucleo.test.ts
ℹ tests 1
ℹ pass 0
ℹ fail 1
```

- [ ] **Step 3: Implementar a orquestração**

Criar `supabase/functions/_shared/gemini-nucleo.ts`:

```ts
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
  return async function chamarGemini(o: OpcoesIA & { modelo: string; apiKey: string }): Promise<RespostaIA> {
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
    const erroTimeout = () => falha(`IA (${modelo}) não respondeu em ${segundos} s — tempo esgotado`, "timeout");

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
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test supabase/functions/_shared/gemini-nucleo.test.ts`
Expected (PASS):

```
✔ chamada: URL do modelo, chave no header, PDF + extras antes do prompt, resposta com provedor
✔ 400 no responseFormat: repete UMA vez no formato legado
✔ erros: 429 sem crédito (http), 503 (rede), falha de rede, tempo esgotado
✔ arquivo ou entrada que o Gemini não lê: falha 'config' sem chamar o Google
ℹ tests 4
ℹ pass 4
ℹ fail 0
```

- [ ] **Step 5: Extrair `baixarRef` no openai.ts**

Em `supabase/functions/_shared/openai.ts`, trocar o trecho abaixo (único no arquivo, linhas ~120-131):

```ts
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
```

por:

```ts
/**
 * Baixa um ref "bucket/caminho" (validarRef + service role) e devolve nome,
 * MIME (assinatura dos bytes > extensão > tipo do Storage) e bytes. Acima de
 * 15MB lança. Usado pela OpenAI (refParaInput) e pelo Gemini (gemini.ts).
 */
export async function baixarRef(
  ref: string
): Promise<{ nome: string; mime: string; bytes: Uint8Array }> {
  const { bucket, path } = validarRef(ref);
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) throw new Error(`download falhou (${ref}): ${error?.message ?? "vazio"}`);
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (bytes.byteLength > LIMITE_ARQUIVO) throw new Error(`arquivo ${ref} acima de 15MB`);
  const nome = path.split("/").pop() || "arquivo";
  const ext = nome.includes(".") ? (nome.split(".").pop() || "").toLowerCase() : "";
  const mime =
    mimePelosBytes(bytes) || MIME_POR_EXTENSAO[ext] || data.type || "application/octet-stream";
  return { nome, mime, bytes };
}

/** Baixa um ref "bucket/caminho" e devolve o item de input pra OpenAI. */
export async function refParaInput(ref: string): Promise<Record<string, unknown>> {
  const { nome, mime, bytes: buf } = await baixarRef(ref);
```

O resto de `refParaInput` (a partir de `if (mime.startsWith("image/")) {`) fica igual, porque continua usando `buf`, `nome` e `mime`.

- [ ] **Step 6: Criar o cliente Deno**

Criar `supabase/functions/_shared/gemini.ts`:

```ts
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
export async function testarChaveGemini(apiKey: string, modelo: string): Promise<{ ok: boolean; mensagem: string }> {
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
```

- [ ] **Step 7: Conferir a sintaxe dos arquivos Deno e rodar a regressão**

Run:

```bash
node --check supabase/functions/_shared/openai.ts && node --check supabase/functions/_shared/gemini.ts && echo SINTAXE_OK
grep -n "baixarRef" supabase/functions/_shared/openai.ts
node --test supabase/functions/_shared/*.test.ts supabase/functions/ia-processar/*.test.ts
```

Expected:

```
SINTAXE_OK
125:export async function baixarRef(
143:  const { nome, mime, bytes: buf } = await baixarRef(ref);
...
ℹ tests 65
ℹ pass 65
ℹ fail 0
```

(`node --check` só valida a sintaxe TS: os arquivos Deno importam esm.sh e não rodam no Node. A lógica está coberta por `gemini-nucleo.test.ts` e `gemini-regras.test.ts`.)

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/_shared/openai.ts supabase/functions/_shared/gemini-nucleo.ts supabase/functions/_shared/gemini-nucleo.test.ts supabase/functions/_shared/gemini.ts
git commit -F - <<'EOF'
feat(ia): cliente Gemini (generateContent) e baixarRef compartilhado

baixarRef sai de refParaInput (mesma validação, 15MB e MIME) para o Gemini
usar o mesmo download. chamarGemini: arquivos em inlineData, prompt por
último, timeout na chamada toda e 1 repetição no formato legado quando o
Google recusa responseFormat/mediaResolution. testarChaveGemini para o SaaS Admin.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log --oneline -1
```

Expected: commit criado; `git log` mostra `feat(ia): cliente Gemini (generateContent) e baixarRef compartilhado`.

### Task 3: Porta única `chamarIA` (`ia-nucleo.ts` + `ia.ts`)

**Files:**

- Create: `supabase/functions/_shared/ia-nucleo.ts` (~105 linhas; puro)
- Create: `supabase/functions/_shared/ia.ts` (~35 linhas; Deno)
- Test: `supabase/functions/_shared/ia-nucleo.test.ts`

**Interfaces:**

- Consumes: da Task 1, `OpcoesIA`, `RespostaIA`, `MODELOS_GEMINI_PADRAO`, `MODELOS_GEMINI_FORTE`, `GEMINI_MODELO_PADRAO` e `GEMINI_MODELO_FORTE`; da Task 2, `chamarGemini` (gemini.ts). Já existentes: `chamarOpenAI` (openai.ts) e `createAdminClient` (supabase-admin.ts).
- Produces:
  - `ia-nucleo.ts`: `interface ConfigIA`, `interface DepsIA` e `criarChamarIA(deps: DepsIA): (o: OpcoesIA) => Promise<RespostaIA>`, exatamente como no contrato. Acréscimos: `CHAVES_CONFIG_IA` (as 5 chaves de `saas_config`), `OPENAI_MODELO_PADRAO = "gpt-4o-mini"`, `OPENAI_MODELO_FORTE = "gpt-4o"` e `configDeLinhas(linhas: { chave: string; valor: unknown }[], env: { GEMINI_API_KEY?: string; OPENAI_API_KEY?: string }): ConfigIA`.
  - `ia.ts`: `lerConfigIA(): Promise<ConfigIA>` e `chamarIA(o: OpcoesIA): Promise<RespostaIA>`; reexporta os tipos `ConfigIA`, `OpcoesIA` e `RespostaIA`.
  - Garantias para as Tasks 4, 5 e 12:
    - toda tentativa traz `provedor` e `modelo`, mesmo em erro;
    - a resposta final traz `tentativas`: lista plana, na ordem, sem `tentativas` aninhadas;
    - sem chave nenhuma, a resposta é exatamente `{ ok:false, erro:"IA_NAO_CONFIGURADA", motivo:"config" }`, sem `tentativas`;
    - erro de download de `fileRefs` lança, como hoje;
    - `r.modelo` passa a ser o nome do modelo do Gemini ou do OpenAI. Quem precisa saber se foi o forte usa o `nivel` que pediu, em vez de comparar com `MODELO_FORTE`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `supabase/functions/_shared/ia-nucleo.test.ts`:

```ts
// Roda com Node 23.6+ (type stripping):  node --test supabase/functions/_shared/ia-nucleo.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { CHAVES_CONFIG_IA, configDeLinhas, criarChamarIA, type ConfigIA } from "./ia-nucleo.ts";
import type { OpcoesIA, RespostaIA } from "./ia-tipos.ts";

const CFG: ConfigIA = {
  gemini: { apiKey: "g-chave", modelo: "gemini-3.5-flash-lite", modeloForte: "gemini-3.8-flash" },
  openai: { apiKey: "o-chave", modelo: "gpt-4o-mini", modeloForte: "gpt-4o" },
};
const semChave = (c: ConfigIA, qual: "gemini" | "openai"): ConfigIA => ({
  ...c,
  [qual]: { ...c[qual], apiKey: null },
});

const OK = (provedor: "gemini" | "openai", modelo: string): RespostaIA => ({
  ok: true,
  resultado: { de: provedor },
  modelo,
  provedor,
  usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
  ms: 1,
});
const FALHA = (provedor: "gemini" | "openai", modelo: string): RespostaIA => ({
  ok: false,
  erro: `${provedor} caiu`,
  motivo: "http",
  modelo,
  provedor,
  ms: 1,
});

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** chamadores falsos que registram o que receberam */
function montar(
  cfg: ConfigIA,
  gemini: (o: OpcoesIA & { modelo: string; apiKey: string }) => Promise<RespostaIA>,
  openai: (o: OpcoesIA & { modelo: string }) => Promise<RespostaIA>
) {
  const log: {
    g: (OpcoesIA & { modelo: string; apiKey: string })[];
    o: (OpcoesIA & { modelo: string })[];
  } = { g: [], o: [] };
  const chamarIA = criarChamarIA({
    lerConfig: async () => cfg,
    chamarGemini: async (o) => {
      log.g.push(o);
      return gemini(o);
    },
    chamarOpenAI: async (o) => {
      log.o.push(o);
      return openai(o);
    },
  });
  return { chamarIA, log };
}

test("Gemini configurado e ok: só o Gemini, modelo padrão, chave repassada", async () => {
  const { chamarIA, log } = montar(
    CFG,
    async (o) => OK("gemini", o.modelo),
    async (o) => OK("openai", o.modelo)
  );
  const r = await chamarIA({ prompt: "p", jsonSchema: { type: "object" }, esforco: "low" });
  assert.equal(log.g.length, 1);
  assert.equal(log.o.length, 0);
  assert.equal(log.g[0].modelo, "gemini-3.5-flash-lite");
  assert.equal(log.g[0].apiKey, "g-chave");
  assert.equal(log.g[0].prompt, "p");
  assert.equal(log.g[0].esforco, "low");
  assert.equal(r.ok, true);
  assert.equal(r.provedor, "gemini");
  assert.equal(r.modelo, "gemini-3.5-flash-lite");
  assert.equal(r.tentativas?.length, 1);
  assert.equal(r.tentativas?.[0].provedor, "gemini");
});

test("nivel forte usa o modelo forte de cada provedor", async () => {
  const { chamarIA, log } = montar(
    CFG,
    async (o) => FALHA("gemini", o.modelo),
    async (o) => OK("openai", o.modelo)
  );
  const r = await chamarIA({ prompt: "p", nivel: "forte" });
  assert.equal(log.g[0].modelo, "gemini-3.8-flash");
  assert.equal(log.o[0].modelo, "gpt-4o");
  assert.equal(r.modelo, "gpt-4o");
});

test("Gemini falha: cai para o OpenAI; tentativas na ordem", async () => {
  const { chamarIA, log } = montar(
    CFG,
    async (o) => FALHA("gemini", o.modelo),
    async (o) => OK("openai", o.modelo)
  );
  const r = await chamarIA({ prompt: "p" });
  assert.equal(log.o.length, 1);
  assert.equal(log.o[0].modelo, "gpt-4o-mini");
  assert.equal(r.ok, true);
  assert.equal(r.provedor, "openai");
  assert.deepEqual(
    r.tentativas?.map((t) => [t.provedor, t.ok]),
    [
      ["gemini", false],
      ["openai", true],
    ]
  );
  assert.equal(r.tentativas?.[0].tentativas, undefined, "tentativa não aninha tentativas");
});

test("sem chave do Gemini: direto no OpenAI (comportamento de hoje)", async () => {
  const { chamarIA, log } = montar(
    semChave(CFG, "gemini"),
    async (o) => OK("gemini", o.modelo),
    async (o) => OK("openai", o.modelo)
  );
  const r = await chamarIA({ prompt: "p" });
  assert.equal(log.g.length, 0);
  assert.equal(r.provedor, "openai");
  assert.equal(r.tentativas?.length, 1);
});

test("sem nenhuma chave: IA_NAO_CONFIGURADA sem chamar ninguém", async () => {
  const { chamarIA, log } = montar(
    semChave(semChave(CFG, "gemini"), "openai"),
    async (o) => OK("gemini", o.modelo),
    async (o) => OK("openai", o.modelo)
  );
  const r = await chamarIA({ prompt: "p" });
  assert.deepEqual(r, { ok: false, erro: "IA_NAO_CONFIGURADA", motivo: "config" });
  assert.equal(log.g.length + log.o.length, 0);
});

test("Gemini falha e não há OpenAI: devolve o erro do Gemini", async () => {
  const { chamarIA } = montar(
    semChave(CFG, "openai"),
    async (o) => FALHA("gemini", o.modelo),
    async (o) => OK("openai", o.modelo)
  );
  const r = await chamarIA({ prompt: "p" });
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.erro, "gemini caiu");
  assert.equal(r.provedor, "gemini");
  assert.equal(r.tentativas?.length, 1);
});

test("provedor e modelo garantidos mesmo se o chamador não informar", async () => {
  const { chamarIA } = montar(
    CFG,
    async () => ({ ok: false, erro: "x", motivo: "config" }) as RespostaIA,
    async () => ({ ok: true, resultado: 1, ms: 1 }) as RespostaIA
  );
  const r = await chamarIA({ prompt: "p" });
  assert.deepEqual(
    r.tentativas?.map((t) => [t.provedor, t.modelo]),
    [
      ["gemini", "gemini-3.5-flash-lite"],
      ["openai", "gpt-4o-mini"],
    ]
  );
});

test("timeout: o OpenAI recebe só o tempo que sobrou", async () => {
  const { chamarIA, log } = montar(
    CFG,
    async (o) => FALHA("gemini", o.modelo),
    async (o) => OK("openai", o.modelo)
  );
  await chamarIA({ prompt: "p", timeoutMs: 60_000 });
  const t = log.o[0].timeoutMs ?? 0;
  assert.ok(t > 59_000 && t <= 60_000, `restante ${t}`);
  // sem timeoutMs, o fallback também vai sem
  const b = montar(
    CFG,
    async (o) => FALHA("gemini", o.modelo),
    async (o) => OK("openai", o.modelo)
  );
  await b.chamarIA({ prompt: "p" });
  assert.equal(b.log.o[0].timeoutMs, undefined);
});

test("timeout: Gemini gastou mais da metade → devolve o erro, sem OpenAI", async () => {
  const { chamarIA, log } = montar(
    CFG,
    async (o) => {
      await espera(80);
      return FALHA("gemini", o.modelo);
    },
    async (o) => OK("openai", o.modelo)
  );
  const r = await chamarIA({ prompt: "p", timeoutMs: 100 });
  assert.equal(log.o.length, 0);
  assert.equal(r.ok, false);
  assert.equal(r.provedor, "gemini");
  assert.equal(r.tentativas?.length, 1);
});

test("configDeLinhas: env vence o banco; padrões; modelo fora da lista volta ao padrão", () => {
  assert.deepEqual(CHAVES_CONFIG_IA, [
    "gemini_api_key",
    "gemini_modelo",
    "gemini_modelo_forte",
    "openai_api_key",
    "openai_modelo",
  ]);
  const linhas = [
    { chave: "gemini_api_key", valor: " g-banco " },
    { chave: "gemini_modelo", valor: "gemini-3.1-flash-lite" },
    { chave: "gemini_modelo_forte", valor: "gemini-9-ultra" },
    { chave: "openai_api_key", valor: "o-banco" },
    { chave: "openai_modelo", valor: "gpt-4.1-mini" },
  ];
  assert.deepEqual(configDeLinhas(linhas, {}), {
    gemini: { apiKey: "g-banco", modelo: "gemini-3.1-flash-lite", modeloForte: "gemini-3.8-flash" },
    openai: { apiKey: "o-banco", modelo: "gpt-4.1-mini", modeloForte: "gpt-4o" },
  });
  const env = configDeLinhas(linhas, { GEMINI_API_KEY: "g-env", OPENAI_API_KEY: "o-env" });
  assert.equal(env.gemini.apiKey, "g-env");
  assert.equal(env.openai.apiKey, "o-env");
  assert.deepEqual(configDeLinhas([{ chave: "gemini_api_key", valor: "  " }], { GEMINI_API_KEY: "" }), {
    gemini: { apiKey: null, modelo: "gemini-3.5-flash-lite", modeloForte: "gemini-3.8-flash" },
    openai: { apiKey: null, modelo: "gpt-4o-mini", modeloForte: "gpt-4o" },
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test supabase/functions/_shared/ia-nucleo.test.ts`
Expected (FAIL):

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '...\supabase\functions\_shared\ia-nucleo.ts' imported from ...\supabase\functions\_shared\ia-nucleo.test.ts
ℹ tests 1
ℹ pass 0
ℹ fail 1
```

- [ ] **Step 3: Implementar o núcleo**

Criar `supabase/functions/_shared/ia-nucleo.ts`:

```ts
/**
 * ia-nucleo — regra da porta única de IA, PURA (config e chamadores
 * injetados): testável com node --test (ia-nucleo.test.ts). ia.ts liga isto
 * ao banco (saas_config), ao Gemini e ao OpenAI.
 *
 *   1. Gemini, se houver chave;
 *   2. OpenAI, se houver chave e o Gemini falhou (qualquer ok:false) ou não
 *      está configurado — EXCETO quando timeoutMs existe e o Gemini já gastou
 *      mais da metade dele (aí devolve o erro do Gemini); o OpenAI recebe só o
 *      tempo que sobrou;
 *   3. nenhuma chave → IA_NAO_CONFIGURADA (motivo "config"), sem chamar ninguém.
 *
 * O modelo sai do nível ("padrao" | "forte"). A resposta final traz provedor
 * e tentativas (todas as respostas, na ordem) para o registro de uso.
 */
import type { OpcoesIA, RespostaIA } from "./ia-tipos.ts";
import {
  GEMINI_MODELO_FORTE,
  GEMINI_MODELO_PADRAO,
  MODELOS_GEMINI_FORTE,
  MODELOS_GEMINI_PADRAO,
} from "./gemini-regras.ts";

export interface ConfigIA {
  gemini: { apiKey: string | null; modelo: string; modeloForte: string };
  openai: { apiKey: string | null; modelo: string; modeloForte: string };
}

export interface DepsIA {
  lerConfig(): Promise<ConfigIA>;
  chamarGemini(o: OpcoesIA & { modelo: string; apiKey: string }): Promise<RespostaIA>;
  chamarOpenAI(o: OpcoesIA & { modelo: string }): Promise<RespostaIA>;
}

/** chaves de saas_config lidas por lerConfigIA (uma consulta só) */
export const CHAVES_CONFIG_IA = [
  "gemini_api_key",
  "gemini_modelo",
  "gemini_modelo_forte",
  "openai_api_key",
  "openai_modelo",
];
export const OPENAI_MODELO_PADRAO = "gpt-4o-mini";
/** igual a MODELO_FORTE de openai.ts (aqui sem importar: openai.ts usa Deno/esm.sh) */
export const OPENAI_MODELO_FORTE = "gpt-4o";

/**
 * Linhas de saas_config + env → ConfigIA. Env (GEMINI_API_KEY / OPENAI_API_KEY)
 * vence o banco; chave vazia = não configurada; modelo do Gemini fora da lista
 * permitida volta ao padrão.
 */
export function configDeLinhas(
  linhas: { chave: string; valor: unknown }[],
  env: { GEMINI_API_KEY?: string; OPENAI_API_KEY?: string }
): ConfigIA {
  const mapa = new Map(linhas.map((l) => [l.chave, typeof l.valor === "string" ? l.valor.trim() : ""]));
  const gModelo = mapa.get("gemini_modelo") ?? "";
  const gForte = mapa.get("gemini_modelo_forte") ?? "";
  return {
    gemini: {
      apiKey: env.GEMINI_API_KEY?.trim() || mapa.get("gemini_api_key") || null,
      modelo: MODELOS_GEMINI_PADRAO.includes(gModelo) ? gModelo : GEMINI_MODELO_PADRAO,
      modeloForte: MODELOS_GEMINI_FORTE.includes(gForte) ? gForte : GEMINI_MODELO_FORTE,
    },
    openai: {
      apiKey: env.OPENAI_API_KEY?.trim() || mapa.get("openai_api_key") || null,
      modelo: mapa.get("openai_modelo") || OPENAI_MODELO_PADRAO,
      modeloForte: OPENAI_MODELO_FORTE,
    },
  };
}

export function criarChamarIA(deps: DepsIA): (o: OpcoesIA) => Promise<RespostaIA> {
  return async function chamarIA(o: OpcoesIA): Promise<RespostaIA> {
    const cfg = await deps.lerConfig();
    const forte = o.nivel === "forte";
    const inicio = Date.now();
    const tentativas: RespostaIA[] = [];
    const final = (r: RespostaIA): RespostaIA => ({ ...r, tentativas });

    if (cfg.gemini.apiKey) {
      const modelo = forte ? cfg.gemini.modeloForte : cfg.gemini.modelo;
      const r = await deps.chamarGemini({ ...o, modelo, apiKey: cfg.gemini.apiKey });
      const g: RespostaIA = { ...r, modelo: r.modelo || modelo, provedor: "gemini" };
      tentativas.push(g);
      if (g.ok) return final(g);
      const gasto = Date.now() - inicio;
      if (o.timeoutMs && gasto > o.timeoutMs / 2) return final(g);
    }

    if (cfg.openai.apiKey) {
      const modelo = forte ? cfg.openai.modeloForte : cfg.openai.modelo;
      const opcoes: OpcoesIA & { modelo: string } = { ...o, modelo };
      if (o.timeoutMs) opcoes.timeoutMs = Math.max(1, o.timeoutMs - (Date.now() - inicio));
      const r = await deps.chamarOpenAI(opcoes);
      const oa: RespostaIA = { ...r, modelo: r.modelo || modelo, provedor: "openai" };
      tentativas.push(oa);
      return final(oa);
    }

    if (tentativas.length) return final(tentativas[tentativas.length - 1]);
    return { ok: false, erro: "IA_NAO_CONFIGURADA", motivo: "config" };
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test supabase/functions/_shared/ia-nucleo.test.ts`
Expected (PASS; o teste do "mais da metade" espera ~80 ms de propósito):

```
✔ Gemini configurado e ok: só o Gemini, modelo padrão, chave repassada
✔ nivel forte usa o modelo forte de cada provedor
✔ Gemini falha: cai para o OpenAI; tentativas na ordem
✔ sem chave do Gemini: direto no OpenAI (comportamento de hoje)
✔ sem nenhuma chave: IA_NAO_CONFIGURADA sem chamar ninguém
✔ Gemini falha e não há OpenAI: devolve o erro do Gemini
✔ provedor e modelo garantidos mesmo se o chamador não informar
✔ timeout: o OpenAI recebe só o tempo que sobrou
✔ timeout: Gemini gastou mais da metade → devolve o erro, sem OpenAI
✔ configDeLinhas: env vence o banco; padrões; modelo fora da lista volta ao padrão
ℹ tests 10
ℹ pass 10
ℹ fail 0
```

- [ ] **Step 5: Criar a porta Deno**

Criar `supabase/functions/_shared/ia.ts`:

```ts
/**
 * ia — porta única de IA das Edge Functions: Gemini (padrão) → OpenAI (reserva).
 *
 * Regra (ordem, nível → modelo, fallback, tempo) em ia-nucleo.ts, testada com
 * node --test; aqui só a ligação com o banco e os dois clientes.
 *   - lerConfigIA: UMA consulta a saas_config (chaves e modelos dos dois);
 *     env GEMINI_API_KEY / OPENAI_API_KEY têm prioridade.
 *   - chamarIA({ ...OpcoesIA, nivel }) → RespostaIA com provedor, modelo e
 *     tentativas; sem nenhuma chave → { ok:false, erro:"IA_NAO_CONFIGURADA" }.
 */
import { chamarGemini } from "./gemini.ts";
import { CHAVES_CONFIG_IA, configDeLinhas, criarChamarIA, type ConfigIA } from "./ia-nucleo.ts";
import type { OpcoesIA, RespostaIA } from "./ia-tipos.ts";
import { chamarOpenAI } from "./openai.ts";
import { createAdminClient } from "./supabase-admin.ts";

export type { ConfigIA, OpcoesIA, RespostaIA };

export async function lerConfigIA(): Promise<ConfigIA> {
  const { data } = await createAdminClient().from("saas_config").select("chave, valor").in("chave", CHAVES_CONFIG_IA);
  return configDeLinhas(data ?? [], {
    GEMINI_API_KEY: Deno.env.get("GEMINI_API_KEY"),
    OPENAI_API_KEY: Deno.env.get("OPENAI_API_KEY"),
  });
}

export const chamarIA: (o: OpcoesIA) => Promise<RespostaIA> = criarChamarIA({
  lerConfig: lerConfigIA,
  chamarGemini,
  chamarOpenAI: async (o) => ({ ...(await chamarOpenAI(o)), provedor: "openai" as const }),
});
```

`chamarOpenAI` continua lendo a própria config por dentro. Isso custa 1 consulta leve a mais só quando o OpenAI é chamado, e como a chave e o modelo vêm das mesmas fontes, o resultado nunca diverge de `lerConfigIA`.

- [ ] **Step 6: Conferir a sintaxe e rodar a regressão**

Run:

```bash
node --check supabase/functions/_shared/ia.ts && echo SINTAXE_OK
node --test supabase/functions/_shared/*.test.ts supabase/functions/ia-processar/*.test.ts
```

Expected:

```
SINTAXE_OK
...
ℹ tests 75
ℹ pass 75
ℹ fail 0
```

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/_shared/ia-nucleo.ts supabase/functions/_shared/ia-nucleo.test.ts supabase/functions/_shared/ia.ts
git commit -F - <<'EOF'
feat(ia): porta única chamarIA com Gemini padrão e OpenAI de reserva

Lê saas_config uma vez (env tem prioridade), escolhe o modelo pelo nível,
cai para o OpenAI em qualquer falha do Gemini (salvo se já passou da metade
do timeout; o OpenAI recebe o tempo que sobrou) e devolve provedor e
tentativas para o registro de uso. Sem nenhuma chave: IA_NAO_CONFIGURADA.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log --oneline -1
```

Expected: commit criado; `git log` mostra `feat(ia): porta única chamarIA com Gemini padrão e OpenAI de reserva`.

### Task 4: Custo estimado por modelo + `ia_uso` com provedor e custo (migração 0123)

**Files:**

- Create: `supabase/functions/_shared/ia-precos.ts`
- Test (create): `supabase/functions/_shared/ia-precos.test.ts`
- Modify: `supabase/functions/ia-processar/ia-uso.ts` (cabeçalho l. 1–15; `MedidorUso`/`novoMedidor`/`contabilizar` l. 31–67; `registrarUso` l. 128–144)
- Test (modify): `supabase/functions/ia-processar/ia-uso.test.ts` (teste do `contabilizar` l. 64–81; teste do `registrarUso` l. 150–161)
- Create: `supabase/migrations/0123_ia_uso_provedor_custo.sql`

**Interfaces:**

- Consumes: nada de código das Tasks 1–3. O `ia-uso.ts` continua sem depender de `ia-tipos.ts`: usa uma interface estrutural local (`RespostaComUso`) que aceita qualquer `RespostaIA` (campos `provedor?` e `tentativas?`).
- Produces:
  - `_shared/ia-precos.ts`: `custoUsd(modelo: string | undefined, uso: { input_tokens?: number; output_tokens?: number } | undefined, quando?: Date): number | null`; também `precoDoModelo(modelo: string | undefined, tokensEntrada?: number, quando?: Date): PrecoModelo | null`, `interface PrecoModelo { entrada: number; saida: number }`, `REAJUSTE_GEMINI_FLASH` (2027-01-01T00:00:00Z) e `LIMITE_PROMPT_PRO` (200 000).
  - `ia-processar/ia-uso.ts`: `MedidorUso` ganha `provedores: string[]`, `custo_usd: number`, `custo_conhecido: boolean`; `contabilizar(m, r, modeloPedido?)` soma cada item de `r.tentativas` (ou a própria `r`), sem somar a resposta final duas vezes; `registrarUso` grava `provedor` (`provedores.join(",")` ou null) e `custo_usd` (null quando nenhum custo é conhecido).
  - Banco: `public.ia_uso.provedor text`, `public.ia_uso.custo_usd numeric(12,6)` (check ≥ 0).

Todos os comandos rodam no Git Bash, na raiz do repositório (`/c/Users/javer/sigoobras-base`).

- [ ] **Step 1: Escrever o teste da tabela de preços (vai falhar)**

Criar `supabase/functions/_shared/ia-precos.test.ts`:

```ts
// Roda com Node 23.6+ (type stripping):  node --test supabase/functions/_shared/ia-precos.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { custoUsd, precoDoModelo, REAJUSTE_GEMINI_FLASH } from "./ia-precos.ts";

const EM_2026 = new Date("2026-12-31T23:59:59Z");
const EM_2027 = new Date("2027-01-01T00:00:00Z");
const uso = (input_tokens: number, output_tokens: number) => ({ input_tokens, output_tokens });

test("flash-lite: preço fixo por 1M tokens", () => {
  assert.equal(custoUsd("gemini-3.5-flash-lite", uso(1_000_000, 1_000_000), EM_2026), 2.8);
  // 2000 × 0,25 + 1000 × 1,50 = 2000 micro-US$
  assert.equal(custoUsd("gemini-3.1-flash-lite", uso(2000, 1000), EM_2026), 0.002);
});

test("gemini-3.8-flash muda de preço em 01/01/2027 (UTC)", () => {
  assert.equal(REAJUSTE_GEMINI_FLASH.toISOString(), "2027-01-01T00:00:00.000Z");
  // 10000 × 0,75 + 2000 × 3,75 = 15000 micro-US$
  assert.equal(custoUsd("gemini-3.8-flash", uso(10_000, 2000), EM_2026), 0.015);
  // 10000 × 1,50 + 2000 × 7,50 = 30000 micro-US$
  assert.equal(custoUsd("gemini-3.8-flash", uso(10_000, 2000), EM_2027), 0.03);
  // 3.7 e 3.6-flash seguem a mesma tabela; sufixo de versão casa com o base
  assert.equal(custoUsd("gemini-3.7-flash", uso(10_000, 2000), EM_2027), 0.03);
  assert.equal(custoUsd("gemini-3.6-flash-preview", uso(10_000, 2000), EM_2026), 0.015);
  // "-lite" é OUTRO modelo (sem preço na tabela)
  assert.equal(custoUsd("gemini-3.8-flash-lite", uso(10_000, 2000), EM_2026), null);
});

test("gemini-3.1-pro-preview: faixa cara acima de 200 mil tokens de entrada", () => {
  // 200000 × 2 + 1000 × 12 = 412000 micro-US$
  assert.equal(custoUsd("gemini-3.1-pro-preview", uso(200_000, 1000), EM_2026), 0.412);
  // 200001 × 4 + 1000 × 18 = 818004 micro-US$
  assert.equal(custoUsd("gemini-3.1-pro-preview", uso(200_001, 1000), EM_2026), 0.818004);
  assert.deepEqual(precoDoModelo("gemini-3.1-pro-preview", 250_000), { entrada: 4, saida: 18 });
});

test("OpenAI: mini não é confundido com o gpt-4o; versão datada casa", () => {
  assert.equal(custoUsd("gpt-4o-mini", uso(1000, 1000)), 0.00075);
  assert.equal(custoUsd("gpt-4o-mini-2024-07-18", uso(1000, 1000)), 0.00075);
  assert.equal(custoUsd("gpt-4o", uso(1000, 1000)), 0.0125);
  assert.equal(custoUsd("gpt-4o-2024-08-06", uso(1000, 1000)), 0.0125);
});

test("normaliza o nome (maiúsculas, espaços, prefixo models/)", () => {
  assert.equal(custoUsd(" GPT-4o ", uso(1000, 1000)), 0.0125);
  assert.equal(custoUsd("models/gemini-3.5-flash-lite", uso(1000, 0), EM_2026), 0.0003);
});

test("modelo desconhecido → null; sem uso ou tokens inválidos → 0", () => {
  assert.equal(custoUsd("gpt-5", uso(1000, 1000)), null);
  assert.equal(custoUsd("gemini-2.5-flash", uso(1000, 1000)), null);
  assert.equal(custoUsd(undefined, uso(1000, 1000)), null);
  assert.equal(custoUsd("", uso(1000, 1000)), null);
  assert.equal(precoDoModelo("claude-x"), null);
  assert.equal(custoUsd("gpt-4o", undefined), 0);
  assert.equal(custoUsd("gpt-4o", { input_tokens: -5, output_tokens: Number.NaN }), 0);
});

test("arredonda em micro-dólar (6 casas, igual ao numeric(12,6))", () => {
  // 7 × 2,5 + 3 × 10 = 47,5 micro-US$ → 48
  assert.equal(custoUsd("gpt-4o", uso(7, 3)), 0.000048);
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd /c/Users/javer/sigoobras-base && node --test supabase/functions/_shared/ia-precos.test.ts
```

Esperado: falha ao carregar o módulo, com `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '...\supabase\functions\_shared\ia-precos.ts'` e `ℹ fail 1`.

- [ ] **Step 3: Implementar `ia-precos.ts`**

Criar `supabase/functions/_shared/ia-precos.ts`:

```ts
/**
 * ia-precos — custo ESTIMADO (US$) de uma chamada de IA, pelo modelo e pelos
 * tokens (tabela da spec 2026-09-25 "Gemini como IA padrão", US$ por 1 milhão
 * de tokens). Usado pelo registro de consumo (ia-processar/ia-uso.ts).
 *
 *   - modelo fora da tabela → null (ia_uso.custo_usd fica null);
 *   - sufixo de versão ("-preview", "-001", data) casa com o modelo base;
 *     "-lite" e "-mini" são OUTROS modelos (linha própria ou null);
 *   - gemini-3.6/3.7/3.8-flash sobem de preço em 01/01/2027 (UTC);
 *   - gemini-3.1-pro: prompt > 200 mil tokens de entrada usa a faixa cara;
 *   - resultado arredondado em micro-dólar (6 casas = numeric(12,6)).
 *
 * Puro (sem imports, sem Deno): testado com node --test.
 */

export interface PrecoModelo {
  /** US$ por 1M tokens de entrada */
  entrada: number;
  /** US$ por 1M tokens de saída (inclui os de pensamento) */
  saida: number;
}

/** a partir deste instante o gemini-3.x-flash (não lite) custa o dobro */
export const REAJUSTE_GEMINI_FLASH = new Date("2027-01-01T00:00:00Z");
/** acima disto (tokens de entrada DA CHAMADA) o gemini-3.1-pro usa a faixa cara */
export const LIMITE_PROMPT_PRO = 200_000;

type Regra = { re: RegExp; preco: (tokensEntrada: number, quando: Date) => PrecoModelo };

// o primeiro que casar vence
const REGRAS: Regra[] = [
  { re: /^gemini-3\.5-flash-lite(-|$)/, preco: () => ({ entrada: 0.3, saida: 2.5 }) },
  { re: /^gemini-3\.1-flash-lite(-|$)/, preco: () => ({ entrada: 0.25, saida: 1.5 }) },
  {
    re: /^gemini-3\.[678]-flash(-(?!lite)|$)/,
    preco: (_t, quando) =>
      quando < REAJUSTE_GEMINI_FLASH ? { entrada: 0.75, saida: 3.75 } : { entrada: 1.5, saida: 7.5 },
  },
  {
    re: /^gemini-3\.1-pro(-|$)/,
    preco: (t) => (t > LIMITE_PROMPT_PRO ? { entrada: 4, saida: 18 } : { entrada: 2, saida: 12 }),
  },
  { re: /^gpt-4o-mini(-|$)/, preco: () => ({ entrada: 0.15, saida: 0.6 }) },
  { re: /^gpt-4o(-|$)/, preco: () => ({ entrada: 2.5, saida: 10 }) },
];

const tokens = (v: unknown): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** preço do modelo (null = fora da tabela) */
export function precoDoModelo(
  modelo: string | undefined,
  tokensEntrada = 0,
  quando: Date = new Date()
): PrecoModelo | null {
  const nome = String(modelo ?? "")
    .trim()
    .toLowerCase()
    .replace(/^models\//, "");
  if (!nome) return null;
  const regra = REGRAS.find((r) => r.re.test(nome));
  return regra ? regra.preco(tokensEntrada, quando) : null;
}

/** custo estimado em US$ de UMA chamada (null = modelo sem preço conhecido) */
export function custoUsd(
  modelo: string | undefined,
  uso: { input_tokens?: number; output_tokens?: number } | undefined,
  quando: Date = new Date()
): number | null {
  const entrada = tokens(uso?.input_tokens);
  const saida = tokens(uso?.output_tokens);
  const p = precoDoModelo(modelo, entrada, quando);
  if (!p) return null;
  // tokens × (US$ / 1M tokens) = micro-dólares → arredonda e volta para US$
  return Math.round(entrada * p.entrada + saida * p.saida) / 1_000_000;
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd /c/Users/javer/sigoobras-base && node --test supabase/functions/_shared/ia-precos.test.ts
```

Esperado: `ℹ tests 7`, `ℹ pass 7`, `ℹ fail 0`.

- [ ] **Step 5: Commit da tabela de preços**

```bash
cd /c/Users/javer/sigoobras-base && git add supabase/functions/_shared/ia-precos.ts supabase/functions/_shared/ia-precos.test.ts && git commit -F - <<'EOF'
feat(ia): custo estimado por modelo e por chamada (ia-precos)

- tabela US$/1M tokens da spec: gemini-3.5/3.1-flash-lite, gemini-3.x-flash
  (dobra em 01/01/2027 UTC), gemini-3.1-pro (faixa cara acima de 200 mil
  tokens de entrada), gpt-4o-mini e gpt-4o; modelo desconhecido = null
- sufixo de versão casa com o modelo base; resultado em micro-dólar (6 casas)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

Esperado: o hook do prettier passa sem mudar nada e o commit é criado.

- [ ] **Step 6: Atualizar os testes do `ia-uso` (vão falhar)**

Em `supabase/functions/ia-processar/ia-uso.test.ts`, aplicar as duas edições abaixo (trechos literais do arquivo atual; os números de linha citados são os de antes das edições).

Edição 1 — teste do contabilizar (medidor com provedor e custo) + tentativas + modelo sem preço (`supabase/functions/ia-processar/ia-uso.test.ts`)

Trocar (literal):

```ts
test("contabilizar soma tokens/modelos e ignora 'sem chave'", () => {
  const m = novoMedidor();
  contabilizar(m, {
    ok: true,
    modelo: "gpt-4o-mini",
    usage: { input_tokens: 100, output_tokens: 10 },
  });
  contabilizar(m, { ok: false, motivo: "timeout", modelo: "gpt-4o" });
  contabilizar(m, { ok: true, modelo: "gpt-4o", usage: { input_tokens: 50, output_tokens: 5 } });
  contabilizar(m, { ok: false, motivo: "config" });
  assert.deepEqual(m, {
    chamadas: 3,
    tokens_entrada: 150,
    tokens_saida: 15,
    modelos: ["gpt-4o-mini", "gpt-4o"],
  });
  contabilizar(undefined, { ok: true }); // sem medidor: não quebra
});
```

por:

```ts
test("contabilizar soma tokens/modelos/custo e ignora 'sem chave'", () => {
  const m = novoMedidor();
  contabilizar(m, {
    ok: true,
    provedor: "openai",
    modelo: "gpt-4o-mini",
    usage: { input_tokens: 100, output_tokens: 10 },
  });
  contabilizar(m, { ok: false, motivo: "timeout", provedor: "openai", modelo: "gpt-4o" });
  contabilizar(m, {
    ok: true,
    provedor: "openai",
    modelo: "gpt-4o",
    usage: { input_tokens: 50, output_tokens: 5 },
  });
  contabilizar(m, { ok: false, motivo: "config" });
  assert.deepEqual(m, {
    chamadas: 3,
    tokens_entrada: 150,
    tokens_saida: 15,
    modelos: ["gpt-4o-mini", "gpt-4o"],
    provedores: ["openai"],
    // 100×0,15 + 10×0,60 = 21 µUS$; timeout sem usage = 0; 50×2,50 + 5×10 = 175 µUS$
    custo_usd: 0.000196,
    custo_conhecido: true,
  });
  contabilizar(undefined, { ok: true }); // sem medidor: não quebra
});

test("contabilizar percorre as tentativas do chamarIA (Gemini falhou → OpenAI)", () => {
  const m = novoMedidor();
  const openai = {
    ok: true,
    provedor: "openai",
    modelo: "gpt-4o-mini",
    usage: { input_tokens: 1000, output_tokens: 100 },
  };
  contabilizar(m, {
    ...openai,
    tentativas: [
      {
        ok: false,
        motivo: "http",
        provedor: "gemini",
        modelo: "gemini-3.5-flash-lite",
        usage: { input_tokens: 2000, output_tokens: 0 },
      },
      openai,
    ],
  });
  // a resposta final NÃO é somada de novo (ela já está nas tentativas)
  assert.deepEqual(m, {
    chamadas: 2,
    tokens_entrada: 3000,
    tokens_saida: 100,
    modelos: ["gemini-3.5-flash-lite", "gpt-4o-mini"],
    provedores: ["gemini", "openai"],
    // 2000×0,30 = 600 µUS$ + (1000×0,15 + 100×0,60) = 210 µUS$
    custo_usd: 0.00081,
    custo_conhecido: true,
  });
  // tentativas vazias ou só "sem chave": nada é somado
  const vazio = novoMedidor();
  contabilizar(vazio, { ok: false, motivo: "config", tentativas: [] });
  contabilizar(vazio, { ok: false, tentativas: [{ ok: false, motivo: "config" }] });
  assert.deepEqual(vazio, novoMedidor());
});

test("contabilizar: modelo sem preço não inventa custo", () => {
  const m = novoMedidor();
  contabilizar(m, {
    ok: true,
    provedor: "openai",
    modelo: "gpt-5",
    usage: { input_tokens: 10, output_tokens: 1 },
  });
  assert.equal(m.chamadas, 1);
  assert.equal(m.custo_usd, 0);
  assert.equal(m.custo_conhecido, false);
});
```

Edição 2 — teste do registrarUso: grava provedor e custo_usd (null sem preço) (`supabase/functions/ia-processar/ia-uso.test.ts`)

Trocar (literal):

```ts
contabilizar(m, { ok: true, modelo: "gpt-4o", usage: { input_tokens: 7, output_tokens: 3 } });
await registrarUso(f.cliente, usuario, "edital_atende", m);
assert.deepEqual(f.inserts, [
  {
    empresa_id: "emp-1",
    usuario_email: "a@b.com",
    acao: "edital_atende",
    modelo: "gpt-4o",
    tokens_entrada: 7,
    tokens_saida: 3,
  },
]);
```

por:

```ts
contabilizar(m, {
  ok: true,
  provedor: "gemini",
  modelo: "gemini-3.5-flash-lite",
  usage: { input_tokens: 1000, output_tokens: 100 },
});
contabilizar(m, {
  ok: true,
  provedor: "openai",
  modelo: "gpt-4o",
  usage: { input_tokens: 1000, output_tokens: 100 },
});
await registrarUso(f.cliente, usuario, "edital_atende", m);
assert.deepEqual(f.inserts, [
  {
    empresa_id: "emp-1",
    usuario_email: "a@b.com",
    acao: "edital_atende",
    provedor: "gemini,openai",
    modelo: "gemini-3.5-flash-lite,gpt-4o",
    tokens_entrada: 2000,
    tokens_saida: 200,
    // (1000×0,30 + 100×2,50) + (1000×2,50 + 100×10) = 550 + 3500 µUS$
    custo_usd: 0.00405,
  },
]);

// nenhum modelo com preço → custo_usd null (não 0); sem provedor → null
const semPreco = novoMedidor();
contabilizar(semPreco, {
  ok: true,
  modelo: "gpt-5",
  usage: { input_tokens: 5, output_tokens: 5 },
});
f = clienteFalso({});
await registrarUso(f.cliente, usuario, "llm", semPreco);
assert.deepEqual(f.inserts, [
  {
    empresa_id: "emp-1",
    usuario_email: "a@b.com",
    acao: "llm",
    provedor: null,
    modelo: "gpt-5",
    tokens_entrada: 5,
    tokens_saida: 5,
    custo_usd: null,
  },
]);
```

- [ ] **Step 7: Rodar e ver falhar**

```bash
cd /c/Users/javer/sigoobras-base && node --test supabase/functions/ia-processar/ia-uso.test.ts
```

Esperado: `ℹ tests 8`, `ℹ pass 4`, `ℹ fail 4`. Falham `contabilizar soma tokens/modelos/custo e ignora 'sem chave'`, `contabilizar percorre as tentativas do chamarIA (Gemini falhou → OpenAI)`, `contabilizar: modelo sem preço não inventa custo` e `registrarUso: grava a soma; sem chamada não grava; erro não propaga` (o medidor ainda não tem `provedores`/`custo_usd`/`custo_conhecido` e o insert não tem `provedor`/`custo_usd`).

- [ ] **Step 8: Implementar no `ia-uso.ts`**

Em `supabase/functions/ia-processar/ia-uso.ts`, aplicar as três edições abaixo (números de linha de antes das edições).

Edição 1 — cabeçalho + import do ia-precos (linhas 1–15) (`supabase/functions/ia-processar/ia-uso.ts`)

Trocar (literal):

```ts
/**
 * ia-uso — consumo da IA e cota diária das ações edital_* (tabela public.ia_uso,
 * migração 0114_ia_uso_cota.sql).
 *
 *   - 1 linha por requisição edital_* que chegou a chamar a OpenAI, com os
 *     tokens de TODAS as chamadas da requisição somados (escalonamento etc.);
 *   - ANTES de chamar a OpenAI: linhas da empresa no dia (fuso de Brasília)
 *     ≥ cota → a ação é recusada (429 COTA_IA). Cota = saas_config
 *     'ia_cota_edital_dia' (inteiro ≥ 1) ou COTA_EDITAL_PADRAO. Super admin
 *     isento (mas o uso dele também é gravado).
 *   - Falha ao ler a cota/contar (ex.: migração ainda não aplicada) libera a
 *     ação; falha ao gravar só vai para o log — nunca derruba a ação.
 *
 * Sem imports: o cliente (service role) vem de quem chama — testável em Node.
 */
```

por:

```ts
/**
 * ia-uso — consumo da IA e cota diária das ações edital_* (tabela public.ia_uso,
 * migrações 0114_ia_uso_cota.sql e 0123_ia_uso_provedor_custo.sql).
 *
 *   - 1 linha por requisição que chegou a chamar a IA (Gemini e/ou OpenAI),
 *     com os tokens de TODAS as chamadas da requisição somados (fallback de
 *     provedor, escalonamento etc.), o(s) provedor(es), o(s) modelo(s) e o
 *     custo estimado em US$ (ia-precos.ts; null se nenhum modelo tem preço);
 *   - ANTES de chamar a IA nas ações edital_*: linhas edital_* da empresa no
 *     dia (fuso de Brasília) ≥ cota → a ação é recusada (429 COTA_IA). Cota =
 *     saas_config 'ia_cota_edital_dia' (inteiro ≥ 1) ou COTA_EDITAL_PADRAO.
 *     Super admin isento (mas o uso dele também é gravado).
 *   - Falha ao ler a cota/contar (ex.: migração ainda não aplicada) libera a
 *     ação; falha ao gravar só vai para o log — nunca derruba a ação.
 *
 * Só importa ../_shared/ia-precos.ts (puro); o cliente (service role) vem de
 * quem chama — testável em Node.
 */
import { custoUsd } from "../_shared/ia-precos.ts";
```

Edição 2 — MedidorUso, novoMedidor, RespostaComUso e contabilizar (linhas 31–67) (`supabase/functions/ia-processar/ia-uso.ts`)

Trocar (literal):

```ts
export interface MedidorUso {
  /** chamadas à OpenAI que chegaram a sair (inclui erro/timeout) */
  chamadas: number;
  tokens_entrada: number;
  tokens_saida: number;
  modelos: string[];
}

export const novoMedidor = (): MedidorUso => ({
  chamadas: 0,
  tokens_entrada: 0,
  tokens_saida: 0,
  modelos: [],
});

/** o que interessa de RespostaOpenAI (ok ou não) */
interface RespostaComUso {
  ok: boolean;
  motivo?: string;
  modelo?: string;
  usage?: { input_tokens: number; output_tokens: number };
}

/** soma uma resposta ao medidor; "config" (sem chave) não chegou a chamar a OpenAI */
export function contabilizar(m: MedidorUso | undefined, r: RespostaComUso, modeloPedido?: string): void {
  if (!m) return;
  if (!r.ok && r.motivo === "config") return;
  m.chamadas++;
  m.tokens_entrada += Math.max(0, Math.round(Number(r.usage?.input_tokens) || 0));
  m.tokens_saida += Math.max(0, Math.round(Number(r.usage?.output_tokens) || 0));
  const modelo = r.modelo || modeloPedido;
  if (modelo && !m.modelos.includes(modelo)) m.modelos.push(modelo);
}
```

por:

```ts
export interface MedidorUso {
  /** chamadas a um provedor de IA que chegaram a sair (inclui erro/timeout) */
  chamadas: number;
  tokens_entrada: number;
  tokens_saida: number;
  modelos: string[];
  /** provedores chamados, na ordem ("gemini", "openai") */
  provedores: string[];
  /** soma do custo estimado (US$) das chamadas com preço conhecido */
  custo_usd: number;
  /** false = nenhuma chamada tinha preço conhecido → grava custo_usd null */
  custo_conhecido: boolean;
}

export const novoMedidor = (): MedidorUso => ({
  chamadas: 0,
  tokens_entrada: 0,
  tokens_saida: 0,
  modelos: [],
  provedores: [],
  custo_usd: 0,
  custo_conhecido: false,
});

/** o que interessa de RespostaIA (ok ou não) — ver _shared/ia-tipos.ts */
interface RespostaComUso {
  ok: boolean;
  motivo?: string;
  modelo?: string;
  provedor?: string;
  usage?: { input_tokens: number; output_tokens: number };
  /** chamarIA: TODAS as respostas da chamada (Gemini e reserva), na ordem */
  tentativas?: RespostaComUso[];
}

/**
 * Soma uma resposta ao medidor. Com `tentativas` (chamarIA), soma cada uma
 * delas — a resposta final já está na lista e não é somada de novo; sem,
 * soma a própria resposta. "config" (sem chave) não chegou a chamar a IA.
 */
export function contabilizar(m: MedidorUso | undefined, r: RespostaComUso, modeloPedido?: string): void {
  if (!m) return;
  const lista = r.tentativas?.length ? r.tentativas : [r];
  for (const t of lista) {
    if (!t.ok && t.motivo === "config") continue;
    m.chamadas++;
    const entrada = Math.max(0, Math.round(Number(t.usage?.input_tokens) || 0));
    const saida = Math.max(0, Math.round(Number(t.usage?.output_tokens) || 0));
    m.tokens_entrada += entrada;
    m.tokens_saida += saida;
    const modelo = t.modelo || modeloPedido;
    if (modelo && !m.modelos.includes(modelo)) m.modelos.push(modelo);
    if (t.provedor && !m.provedores.includes(t.provedor)) m.provedores.push(t.provedor);
    const custo = custoUsd(modelo, { input_tokens: entrada, output_tokens: saida });
    if (custo !== null) {
      // soma em micro-dólar para não acumular erro de ponto flutuante
      m.custo_usd = Math.round((m.custo_usd + custo) * 1_000_000) / 1_000_000;
      m.custo_conhecido = true;
    }
  }
}
```

Edição 3 — registrarUso grava provedor e custo_usd (linhas 128–144) (`supabase/functions/ia-processar/ia-uso.ts`)

Trocar (literal):

```ts
/** grava o consumo da requisição (só se chamou a OpenAI); erro vai só para o log */
export async function registrarUso(
  admin: Cliente,
  u: UsuarioUso,
  acao: string,
  m: MedidorUso
): Promise<void> {
  if (!m.chamadas) return;
  try {
    const { error } = await admin.from("ia_uso").insert({
      empresa_id: u.empresa_id,
      usuario_email: u.email,
      acao,
      modelo: m.modelos.join(",").slice(0, 200) || null,
      tokens_entrada: m.tokens_entrada,
      tokens_saida: m.tokens_saida,
    });
```

por:

```ts
/** grava o consumo da requisição (só se chamou a IA); erro vai só para o log */
export async function registrarUso(
  admin: Cliente,
  u: UsuarioUso,
  acao: string,
  m: MedidorUso
): Promise<void> {
  if (!m.chamadas) return;
  try {
    const { error } = await admin.from("ia_uso").insert({
      empresa_id: u.empresa_id,
      usuario_email: u.email,
      acao,
      provedor: m.provedores.join(",").slice(0, 100) || null,
      modelo: m.modelos.join(",").slice(0, 200) || null,
      tokens_entrada: m.tokens_entrada,
      tokens_saida: m.tokens_saida,
      custo_usd: m.custo_conhecido ? m.custo_usd : null,
    });
```

- [ ] **Step 9: Rodar e ver passar**

```bash
cd /c/Users/javer/sigoobras-base && node --test supabase/functions/ia-processar/ia-uso.test.ts supabase/functions/_shared/ia-precos.test.ts
```

Esperado: `ℹ tests 15`, `ℹ pass 15`, `ℹ fail 0`.

- [ ] **Step 10: Criar a migração 0123 (NÃO aplicar aqui — a Task 8 aplica, com OK do Javerson)**

Criar `supabase/migrations/0123_ia_uso_provedor_custo.sql`:

```sql
-- ============================================================================
-- 0123_ia_uso_provedor_custo.sql — provedor e custo estimado no consumo da IA
--
-- A Edge Function ia-processar passa a usar o Gemini como IA padrão (OpenAI de
-- reserva) e a gravar 1 linha em ia_uso para TODAS as ações de IA (llm,
-- extrair_documentos, validar_exames_pcmso, edital_*, financeiro_ler_documento),
-- não só as edital_*. Cada linha ganha:
--   * provedor  — quem foi chamado na requisição, na ordem: 'gemini', 'openai'
--                 ou 'gemini,openai' (o Gemini falhou e a reserva respondeu);
--   * custo_usd — custo ESTIMADO em US$ de todas as chamadas da requisição
--                 (tabela em supabase/functions/_shared/ia-precos.ts);
--                 null = nenhum modelo usado tem preço na tabela.
-- A cota diária continua contando só acao in (edital_extrair_parte,
-- edital_consolidar, edital_atende).
--
-- Aditivo e idempotente. RLS e privilégios da 0114 continuam valendo (as
-- colunas novas herdam o select da tabela; escrita só service role). Enquanto
-- não for aplicada, a gravação da função nova falha → só log (nada quebra).
-- ============================================================================

alter table public.ia_uso add column if not exists provedor text;
alter table public.ia_uso add column if not exists custo_usd numeric(12,6);

do $chk$
begin
  alter table public.ia_uso
    add constraint ia_uso_custo_usd_nao_negativo check (custo_usd is null or custo_usd >= 0);
exception when duplicate_object then null;
end $chk$;

comment on column public.ia_uso.provedor is
  'Provedor(es) de IA chamados na requisição, na ordem: gemini, openai ou gemini,openai (fallback).';
comment on column public.ia_uso.custo_usd is
  'Custo estimado em US$ de todas as chamadas da requisição (supabase/functions/_shared/ia-precos.ts); null = modelo sem preço.';
comment on column public.ia_uso.acao is
  'Ação da ia-processar: llm, extrair_documentos, validar_exames_pcmso, edital_* ou financeiro_ler_documento. A cota diária conta só edital_*.';
comment on table public.ia_uso is
  'Consumo da IA (Gemini/OpenAI) por requisição da ia-processar: tokens somados de todas as chamadas, provedor, modelo e custo estimado. Base da cota diária das ações edital_* (saas_config ia_cota_edital_dia). Escrita só service role.';

select 'ok' as res;
```

Conferir o fim do arquivo:

```bash
cd /c/Users/javer/sigoobras-base && tail -n 1 supabase/migrations/0123_ia_uso_provedor_custo.sql
```

Esperado: `select 'ok' as res;`

Observação para a Task 8: aplicar a 0123 **antes** de publicar a `ia-processar` nova. Se a função nova sair antes, o insert com `provedor`/`custo_usd` falha e esse consumo se perde (só vai para o log; a ação do usuário não quebra).

- [ ] **Step 11: Commit do registro de uso**

```bash
cd /c/Users/javer/sigoobras-base && git add supabase/functions/ia-processar/ia-uso.ts supabase/functions/ia-processar/ia-uso.test.ts supabase/migrations/0123_ia_uso_provedor_custo.sql && git commit -F - <<'EOF'
feat(ia): ia_uso com provedor e custo estimado (migração 0123)

- MedidorUso soma cada tentativa do chamarIA (fallback Gemini → OpenAI) sem
  contar a resposta final duas vezes; guarda provedores e custo em US$
- registrarUso grava provedor ("gemini", "openai" ou "gemini,openai") e
  custo_usd (null quando nenhum modelo usado tem preço)
- 0123: colunas ia_uso.provedor e ia_uso.custo_usd numeric(12,6) >= 0

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: `ia-processar` usa `chamarIA` (nível padrão/forte) e registra o uso de TODAS as ações de IA

**Files:**

- Create: `supabase/functions/ia-processar/escalonamento.ts` (o `chamarComEscalonamento` sai do `index.ts` e vira módulo puro, testável)
- Test (create): `supabase/functions/ia-processar/escalonamento.test.ts`
- Modify: `supabase/functions/ia-processar/edital.ts` (cabeçalho/imports l. 8–18; `falhaIA` l. 78; laço do `edital_extrair_parte` l. 216–256; `edital_consolidar` l. 347–357; `edital_atende` l. 561–571)
- Modify: `supabase/functions/ia-processar/index.ts` (cabeçalho l. 2, 22 e 40–54; imports + `chamarComEscalonamento` local l. 58–93; handler l. 267–378)

**Interfaces:**

- Consumes:
  - Task 1: `import type { NivelIA, OpcoesIA, ProvedorIA, RespostaIA } from "../_shared/ia-tipos.ts"`.
  - Task 3: `chamarIA(o: OpcoesIA): Promise<RespostaIA>` de `../_shared/ia.ts` (Gemini → OpenAI; sem chave nenhuma → `{ ok:false, erro:"IA_NAO_CONFIGURADA", motivo:"config" }`; fallback dentro do `timeoutMs`; `tentativas` com todas as respostas).
  - Task 2: `validarRef` continua exportado por `../_shared/openai.ts`.
  - Task 4: `novoMedidor()`, `contabilizar(m, r, modeloPedido?)`, `registrarUso(admin, u, acao, m)`, `type MedidorUso` de `./ia-uso.ts`.
- Produces:
  - `ia-processar/escalonamento.ts`: `type ChamarIA = (o: OpcoesIA) => Promise<RespostaIA>`; `type RespostaEscalonada = { ok: true; resultado: unknown; modelo: string; provedor: ProvedorIA; nivel: NivelIA } | { ok: false; erro: string }`; `chamarComEscalonamento(chamar: ChamarIA, opts: Omit<OpcoesIA, "nivel">, estaFraco?: (resultado: any) => boolean, medidor?: MedidorUso): Promise<RespostaEscalonada>` (padrão → forte quando fraco ou erro; fica com o mais completo por `contarPreenchidos`; para na 1ª com `IA_NAO_CONFIGURADA`; soma toda tentativa no medidor).
  - `ia-processar/edital.ts`: `export function falhaIA(r: { erro: string }): Response` (503 "IA não configurada — defina a chave no SaaS Admin → Integrações" ou 502 com o erro).
  - `ia-processar/index.ts`: no handler, `const admin = createAdminClient()` e `const medidor = novoMedidor()` ficam ANTES do `try` da cadeia de ações, e o `finally` desse `try` chama `registrarUso(admin, usuario, String(body.acao ?? ""), medidor)`. Uma ação nova (Task 12, `financeiro_ler_documento`) só acrescenta um `if (body.acao === "...") { ... }` na cadeia (antes de `if (ehAcaoEdital(body.acao)) {`) e soma no `medidor`: `contabilizar(medidor, r)` após cada `chamarIA`, ou `chamarComEscalonamento(chamarIA, opts, fraco, medidor)`. O uso é gravado sozinho. A cota continua só para `edital_*`.

- [ ] **Step 1: Conferir os pré-requisitos (Tasks 1–4 feitas)**

```bash
cd /c/Users/javer/sigoobras-base && ls supabase/functions/_shared/ia-tipos.ts supabase/functions/_shared/ia.ts supabase/functions/_shared/ia-precos.ts && grep -c "chamarIA" supabase/functions/_shared/ia.ts && grep -n "custo_conhecido" supabase/functions/ia-processar/ia-uso.ts | head -n 1
```

Esperado: os três caminhos listados, um número ≥ 1 e uma linha com `custo_conhecido`. Se faltar algo, pare e termine a Task correspondente.

- [ ] **Step 2: Escrever o teste do escalonamento (vai falhar)**

Criar `supabase/functions/ia-processar/escalonamento.test.ts`:

```ts
// Roda com Node 23.6+ (type stripping):  node --test supabase/functions/ia-processar/escalonamento.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { chamarComEscalonamento } from "./escalonamento.ts";
import { novoMedidor } from "./ia-uso.ts";

type Obj = Record<string, unknown>;

/** chamarIA falso: devolve as respostas na ordem e guarda as opções recebidas */
function chamadorFalso(respostas: Obj[]) {
  const pedidos: Obj[] = [];
  const chamar = async (o: Obj) => {
    pedidos.push(o);
    const r = respostas[pedidos.length - 1];
    if (!r) throw new Error("chamada a mais");
    return r;
  };
  // deno-lint-ignore no-explicit-any
  return { chamar: chamar as any, pedidos };
}

const ok = (resultado: unknown, extra: Obj = {}) => ({
  ok: true,
  resultado,
  modelo: "gemini-3.5-flash-lite",
  provedor: "gemini",
  ms: 10,
  ...extra,
});
const opts = { prompt: "p", fileRefs: ["comprovantes/x/a.pdf"], jsonSchema: { type: "object" } };
// deno-lint-ignore no-explicit-any
const semCpf = (r: any) => !r?.cpf;

test("resultado bom no nível padrão: não escala", async () => {
  const f = chamadorFalso([ok({ nome: "Ana", cpf: "1" })]);
  const r = await chamarComEscalonamento(f.chamar, opts, semCpf);
  assert.deepEqual(r, {
    ok: true,
    resultado: { nome: "Ana", cpf: "1" },
    modelo: "gemini-3.5-flash-lite",
    provedor: "gemini",
    nivel: "padrao",
  });
  assert.equal(f.pedidos.length, 1);
  assert.deepEqual(f.pedidos[0], { ...opts, nivel: "padrao" });
});

test("sem heurística de fraco: uma chamada só", async () => {
  const f = chamadorFalso([ok({ a: null })]);
  const r = await chamarComEscalonamento(f.chamar, opts);
  assert.equal(r.ok, true);
  assert.equal(f.pedidos.length, 1);
});

test("fraco no padrão: refaz no forte e fica com o mais completo", async () => {
  const f = chamadorFalso([
    ok({ nome: "Ana", cpf: null }),
    ok({ nome: "Ana", cpf: "123" }, { modelo: "gemini-3.8-flash" }),
  ]);
  const r = await chamarComEscalonamento(f.chamar, opts, semCpf);
  assert.deepEqual(
    f.pedidos.map((p) => p.nivel),
    ["padrao", "forte"]
  );
  assert.deepEqual(r, {
    ok: true,
    resultado: { nome: "Ana", cpf: "123" },
    modelo: "gemini-3.8-flash",
    provedor: "gemini",
    nivel: "forte",
  });
});

test("forte menos completo que o padrão: fica com o padrão", async () => {
  const f = chamadorFalso([ok({ a: 1, b: 2, cpf: null }), ok({ a: 1 }, { modelo: "gemini-3.8-flash" })]);
  const r = await chamarComEscalonamento(f.chamar, opts, semCpf);
  assert.equal(r.ok && r.nivel, "padrao");
  assert.deepEqual(r.ok && r.resultado, { a: 1, b: 2, cpf: null });
});

test("erro no padrão: tenta o forte", async () => {
  const f = chamadorFalso([
    { ok: false, erro: "Google indisponível", motivo: "rede", provedor: "gemini" },
    ok({ cpf: "9" }, { modelo: "gpt-4o", provedor: "openai" }),
  ]);
  const r = await chamarComEscalonamento(f.chamar, opts, semCpf);
  assert.deepEqual(r, {
    ok: true,
    resultado: { cpf: "9" },
    modelo: "gpt-4o",
    provedor: "openai",
    nivel: "forte",
  });
});

test("sem chave nenhuma: para na 1ª chamada com IA_NAO_CONFIGURADA", async () => {
  const f = chamadorFalso([{ ok: false, erro: "IA_NAO_CONFIGURADA", motivo: "config" }]);
  const m = novoMedidor();
  const r = await chamarComEscalonamento(f.chamar, opts, semCpf, m);
  assert.deepEqual(r, { ok: false, erro: "IA_NAO_CONFIGURADA" });
  assert.equal(f.pedidos.length, 1);
  assert.equal(m.chamadas, 0);
});

test("os dois níveis falham: devolve o último erro", async () => {
  const f = chamadorFalso([
    { ok: false, erro: "e1", motivo: "http" },
    { ok: false, erro: "e2", motivo: "timeout" },
  ]);
  assert.deepEqual(await chamarComEscalonamento(f.chamar, opts, semCpf), { ok: false, erro: "e2" });
});

test("medidor soma todas as chamadas, inclusive o fallback de provedor", async () => {
  const openai = ok(
    { cpf: null },
    { modelo: "gpt-4o-mini", provedor: "openai", usage: { input_tokens: 1000, output_tokens: 100 } }
  );
  const f = chamadorFalso([
    {
      ...openai,
      tentativas: [
        {
          ok: false,
          erro: "Google indisponível",
          motivo: "rede",
          provedor: "gemini",
          modelo: "gemini-3.5-flash-lite",
          usage: { input_tokens: 500, output_tokens: 0 },
        },
        openai,
      ],
    },
    ok({ cpf: "1" }, { modelo: "gemini-3.1-pro-preview", usage: { input_tokens: 2000, output_tokens: 200 } }),
  ]);
  const m = novoMedidor();
  await chamarComEscalonamento(f.chamar, opts, semCpf, m);
  assert.deepEqual(m, {
    chamadas: 3,
    tokens_entrada: 3500,
    tokens_saida: 300,
    modelos: ["gemini-3.5-flash-lite", "gpt-4o-mini", "gemini-3.1-pro-preview"],
    provedores: ["gemini", "openai"],
    // 500×0,30 = 150 + (1000×0,15 + 100×0,60) = 210 + (2000×2 + 200×12) = 6400 µUS$
    custo_usd: 0.00676,
    custo_conhecido: true,
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

```bash
cd /c/Users/javer/sigoobras-base && node --test supabase/functions/ia-processar/escalonamento.test.ts
```

Esperado: `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '...\supabase\functions\ia-processar\escalonamento.ts'` e `ℹ fail 1`.

- [ ] **Step 4: Implementar `escalonamento.ts`**

Criar `supabase/functions/ia-processar/escalonamento.ts`:

```ts
/**
 * escalonamento — "trocar automático os modelos quando tiver dificuldade"
 * (pedido do dono): chama a IA no nível PADRÃO; se o resultado vier fraco
 * (heurística da ação) ou com erro, refaz no nível FORTE e devolve a resposta
 * mais completa (mais campos preenchidos). Sem chave nenhuma, para na 1ª.
 *
 * O provedor e o modelo de cada nível são decididos pelo chamarIA
 * (_shared/ia.ts: Gemini e, se falhar, OpenAI). Toda chamada — inclusive
 * erro e fallback de provedor — entra no medidor de uso.
 *
 * Puro: o chamarIA vem por parâmetro (o index passa o de _shared/ia.ts) —
 * testável em Node.
 */
import type { NivelIA, OpcoesIA, ProvedorIA, RespostaIA } from "../_shared/ia-tipos.ts";
import { contarPreenchidos } from "./edital-regras.ts";
import { contabilizar, type MedidorUso } from "./ia-uso.ts";

export type ChamarIA = (o: OpcoesIA) => Promise<RespostaIA>;

export type RespostaEscalonada =
  | { ok: true; resultado: unknown; modelo: string; provedor: ProvedorIA; nivel: NivelIA }
  | { ok: false; erro: string };

const NIVEIS: NivelIA[] = ["padrao", "forte"];

export async function chamarComEscalonamento(
  chamar: ChamarIA,
  opts: Omit<OpcoesIA, "nivel">,
  // deno-lint-ignore no-explicit-any
  estaFraco?: (resultado: any) => boolean,
  medidor?: MedidorUso
): Promise<RespostaEscalonada> {
  let melhor: {
    resultado: unknown;
    pontos: number;
    modelo: string;
    provedor: ProvedorIA;
    nivel: NivelIA;
  } | null = null;
  let ultimoErro = "IA indisponível";
  for (const nivel of NIVEIS) {
    const r = await chamar({ ...opts, nivel });
    contabilizar(medidor, r);
    if (!r.ok) {
      ultimoErro = r.erro;
      if (r.erro === "IA_NAO_CONFIGURADA") return { ok: false, erro: r.erro };
      continue; // erro/JSON inválido → tenta o nível forte
    }
    const pontos = contarPreenchidos(r.resultado);
    if (!melhor || pontos > melhor.pontos) {
      melhor = { resultado: r.resultado, pontos, modelo: r.modelo, provedor: r.provedor, nivel };
    }
    if (!estaFraco || !estaFraco(r.resultado)) break; // bom o suficiente, para aqui
  }
  if (!melhor) return { ok: false, erro: ultimoErro };
  const { pontos: _p, ...resposta } = melhor;
  return { ok: true, ...resposta };
}
```

- [ ] **Step 5: Rodar e ver passar**

```bash
cd /c/Users/javer/sigoobras-base && node --test supabase/functions/ia-processar/escalonamento.test.ts
```

Esperado: `ℹ tests 8`, `ℹ pass 8`, `ℹ fail 0`.

- [ ] **Step 6: Commit do escalonamento**

```bash
cd /c/Users/javer/sigoobras-base && git add supabase/functions/ia-processar/escalonamento.ts supabase/functions/ia-processar/escalonamento.test.ts && git commit -F - <<'EOF'
refactor(ia): escalonamento padrão → forte por nível em módulo testável

- chamarComEscalonamento recebe o chamarIA por parâmetro, pede nivel
  "padrao" e, se vier fraco ou com erro, "forte"; fica com o mais completo
- toda tentativa (inclusive o fallback de provedor) entra no MedidorUso

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

- [ ] **Step 7: Migrar o `edital.ts` para `chamarIA` (mesmos tempos 100/110/120 s)**

Em `supabase/functions/ia-processar/edital.ts`, aplicar as seis edições abaixo (números de linha de antes das edições). As constantes `ORCAMENTO_MS` (120 s), `TIMEOUT_1A_MS` (100 s), `ESCALONA_ATE_MS` (60 s) e `TIMEOUT_UNICA_MS` (110 s) **não mudam**.

Edição 1 — cabeçalho e imports (linhas 8–18): sai o openai.ts, entra chamarIA (`supabase/functions/ia-processar/edital.ts`)

Trocar (literal):

```ts
 * Consumo: cada ação recebe um MedidorUso (ia-uso.ts) e soma nele o usage de
 * TODA chamada à OpenAI (ok ou não); o index grava em ia_uso e aplica a cota.
 */
import { fail, ok } from "../_shared/cors.ts";
import {
  chamarOpenAI,
  lerConfigOpenAI,
  MODELO_FORTE,
  type RespostaOpenAI,
} from "../_shared/openai.ts";
import { createAdminClient } from "../_shared/supabase-admin.ts";
```

por:

```ts
 * Consumo: cada ação recebe um MedidorUso (ia-uso.ts) e soma nele o usage de
 * TODA chamada à IA (ok ou não, Gemini e reserva OpenAI); o index grava em
 * ia_uso e aplica a cota.
 *
 * Motor: chamarIA (_shared/ia.ts) com nível "padrao" ou "forte" — provedor e
 * modelo de cada nível vêm do SaaS Admin. O fallback Gemini → OpenAI acontece
 * DENTRO do timeoutMs de cada chamada, então o orçamento acima vale igual.
 */
import { fail, ok } from "../_shared/cors.ts";
import { chamarIA } from "../_shared/ia.ts";
import type { NivelIA, RespostaIA } from "../_shared/ia-tipos.ts";
import { createAdminClient } from "../_shared/supabase-admin.ts";
```

Edição 2 — falhaIA passa a ser exportada (o index reaproveita) (linha 78) (`supabase/functions/ia-processar/edital.ts`)

Trocar (literal):

```ts
function falhaIA(r: { erro: string }) {
```

por:

```ts
/** erro da IA → resposta HTTP (sem chave nenhuma = 503 com a orientação) */
export function falhaIA(r: { erro: string }) {
```

Edição 3 — edital_extrair_parte: escalonamento por nível, mesmos tempos (linhas 216–245) (`supabase/functions/ia-processar/edital.ts`)

Trocar (literal):

```ts
  // escalonamento: econômico → forte, dentro do orçamento de tempo
  const { modelo } = await lerConfigOpenAI();
  const cadeia = [...new Set([modelo, MODELO_FORTE])];
  const inicio = Date.now();
  let melhor: { ed: EditalConsolidado; pontos: number; modelo: string } | null = null;
  let ultimoErro: RespostaOpenAI | null = null;
  // "fraca" que o modelo FORTE também devolveu (lista vazia confirmada): não
  // vira aviso de leitura incompleta — a menção no texto não era exigência
  const confirmadosForte = new Set<MotivoFraca>();
  for (let i = 0; i < cadeia.length; i++) {
    const decorrido = Date.now() - inicio;
    if (i > 0 && decorrido > ESCALONA_ATE_MS) break; // o 1º já comeu o tempo
    const r = await chamarOpenAI({
      prompt,
      inputsExtras,
      jsonSchema: schemaEdital(),
      nomeSchema: "edital_parcial",
      strict: true,
      modelo: cadeia[i],
      timeoutMs: i === 0 ? TIMEOUT_1A_MS : Math.min(TIMEOUT_1A_MS, ORCAMENTO_MS - decorrido),
      maxOutputTokens: 12_000,
      esforco: "low",
    });
    contabilizar(medidor, r, cadeia[i]);
    if (!r.ok) {
      if (r.erro === "IA_NAO_CONFIGURADA") return falhaIA(r);
      ultimoErro = r;
      console.warn("[ia-processar] edital_extrair_parte", cadeia[i], r.erro);
      continue; // erro/timeout/cortada → tenta o forte, se der tempo
    }
```

por:

```ts
  // escalonamento: nível padrão → forte, dentro do orçamento de tempo
  const niveis: NivelIA[] = ["padrao", "forte"];
  const inicio = Date.now();
  let melhor: { ed: EditalConsolidado; pontos: number; modelo: string } | null = null;
  let ultimoErro: Extract<RespostaIA, { ok: false }> | null = null;
  // "fraca" que o nível FORTE também devolveu (lista vazia confirmada): não
  // vira aviso de leitura incompleta — a menção no texto não era exigência
  const confirmadosForte = new Set<MotivoFraca>();
  for (let i = 0; i < niveis.length; i++) {
    const decorrido = Date.now() - inicio;
    if (i > 0 && decorrido > ESCALONA_ATE_MS) break; // o 1º já comeu o tempo
    const r = await chamarIA({
      prompt,
      inputsExtras,
      jsonSchema: schemaEdital(),
      nomeSchema: "edital_parcial",
      strict: true,
      nivel: niveis[i],
      timeoutMs: i === 0 ? TIMEOUT_1A_MS : Math.min(TIMEOUT_1A_MS, ORCAMENTO_MS - decorrido),
      maxOutputTokens: 12_000,
      esforco: "low",
    });
    contabilizar(medidor, r);
    if (!r.ok) {
      if (r.erro === "IA_NAO_CONFIGURADA") return falhaIA(r);
      ultimoErro = r;
      console.warn("[ia-processar] edital_extrair_parte", niveis[i], r.modelo ?? "?", r.erro);
      continue; // erro/timeout/cortada → tenta o forte, se der tempo
    }
```

Edição 4 — "confirmado pelo forte" passa a ser pelo nível, não pelo nome do modelo (linha 252) (`supabase/functions/ia-processar/edital.ts`)

Trocar (literal):

```ts
    if (r.modelo === MODELO_FORTE) {
```

por:

```ts
    if (niveis[i] === "forte") {
```

Edição 5 — edital_consolidar: nível forte, mesmo timeout de 110 s (linhas 347–357) (`supabase/functions/ia-processar/edital.ts`)

Trocar (literal):

```ts
const r = await chamarOpenAI({
  prompt,
  jsonSchema: schemaEdital({ semItens: true }),
  nomeSchema: "edital_consolidado",
  strict: true,
  modelo: MODELO_FORTE,
  timeoutMs: TIMEOUT_UNICA_MS,
  maxOutputTokens: 12_000,
  esforco: "low",
});
contabilizar(medidor, r, MODELO_FORTE);
```

por:

```ts
const r = await chamarIA({
  prompt,
  jsonSchema: schemaEdital({ semItens: true }),
  nomeSchema: "edital_consolidado",
  strict: true,
  nivel: "forte",
  timeoutMs: TIMEOUT_UNICA_MS,
  maxOutputTokens: 12_000,
  esforco: "low",
});
contabilizar(medidor, r);
```

Edição 6 — edital_atende: nível forte, mesmo timeout de 110 s (linhas 561–571) (`supabase/functions/ia-processar/edital.ts`)

Trocar (literal):

```ts
const r = await chamarOpenAI({
  prompt,
  jsonSchema: SCHEMA_ATENDE_TECNICO,
  nomeSchema: "atende_tecnico",
  strict: true,
  modelo: MODELO_FORTE,
  timeoutMs: TIMEOUT_UNICA_MS,
  maxOutputTokens: 8_000,
  esforco: "low",
});
contabilizar(medidor, r, MODELO_FORTE);
```

por:

```ts
const r = await chamarIA({
  prompt,
  jsonSchema: SCHEMA_ATENDE_TECNICO,
  nomeSchema: "atende_tecnico",
  strict: true,
  nivel: "forte",
  timeoutMs: TIMEOUT_UNICA_MS,
  maxOutputTokens: 8_000,
  esforco: "low",
});
contabilizar(medidor, r);
```

- [ ] **Step 8: Migrar o `index.ts` e registrar o uso de todas as ações**

Em `supabase/functions/ia-processar/index.ts`, aplicar as oito edições abaixo (números de linha de antes das edições). `SCHEMA_EXTRACAO`, `SCHEMA_PCMSO`, `Body`, a validação das refs e os prompts **não mudam**.

Edição 1 — cabeçalho (linha 2) (`supabase/functions/ia-processar/index.ts`)

Trocar (literal):

```ts
 * ia-processar — ponte de IA do SIGO (OpenAI, chave global do SaaS).
```

por:

```ts
 * ia-processar — ponte de IA do SIGO: Gemini como padrão e OpenAI de reserva
 * (chaves globais do SaaS Admin; porta única chamarIA em _shared/ia.ts).
```

Edição 2 — doc do edital_extrair_parte (linha 22) (`supabase/functions/ia-processar/index.ts`)

Trocar (literal):

```ts
 *     escaneadas); modelo econômico e, se vier fraco/erro, o forte — até ~120 s.
```

por:

```ts
 *     escaneadas); nível padrão e, se vier fraco/erro, o forte — até ~120 s.
```

Edição 3 — doc de consumo/cota (linhas 40–54): consumo de TODAS as ações, cota só edital (`supabase/functions/ia-processar/index.ts`)

Trocar (literal):

```ts
 * COTA E CONSUMO das ações edital_* (ia-uso.ts; tabela ia_uso, migração 0114):
 *   - ANTES de chamar a OpenAI, conta as requisições edital_* da empresa do
 *     token no dia (fuso de Brasília; sem empresa → as do próprio usuário).
 *     Chegou na cota → 429 { codigo:"COTA_IA", cota, usadas }. Cota = saas_config
 *     'ia_cota_edital_dia' (inteiro ≥ 1; ausente/inválido → 400). Super admin
 *     é isento. Contagem "confere e depois age": requisições em paralelo
 *     podem passar a cota em poucas unidades.
 *   - Depois da ação (sucesso, erro ou exceção), grava 1 linha em ia_uso com os
 *     tokens de entrada/saída de TODAS as chamadas à OpenAI da requisição
 *     (escalonamento incluído) e o(s) modelo(s). Requisição que não chamou a
 *     OpenAI (validação, consolidação só em código) não grava nem conta.
 *   - Falha ao ler/contar (ex.: tabela ainda não criada) libera a ação; falha
 *     ao gravar vai só para o log — nunca derruba a ação.
 *
 * Sem chave configurada → 503 "IA não configurada".
 */
```

por:

```ts
 * CONSUMO de TODAS as ações de IA (ia-uso.ts; tabela ia_uso, migrações 0114/0123):
 *   - Depois da ação (sucesso, erro ou exceção), grava 1 linha em ia_uso com os
 *     tokens de entrada/saída de TODAS as chamadas à IA da requisição
 *     (fallback Gemini → OpenAI e escalonamento padrão → forte incluídos),
 *     o(s) provedor(es), o(s) modelo(s) e o custo estimado em US$
 *     (_shared/ia-precos.ts; null se nenhum modelo tem preço). Requisição que
 *     não chamou a IA (validação, consolidação só em código) não grava.
 *
 * COTA só das ações edital_*:
 *   - ANTES de chamar a IA, conta as requisições edital_* da empresa do
 *     token no dia (fuso de Brasília; sem empresa → as do próprio usuário).
 *     Chegou na cota → 429 { codigo:"COTA_IA", cota, usadas }. Cota = saas_config
 *     'ia_cota_edital_dia' (inteiro ≥ 1; ausente/inválido → 400). Super admin
 *     é isento. Contagem "confere e depois age": requisições em paralelo
 *     podem passar a cota em poucas unidades.
 *   - Falha ao ler/contar (ex.: tabela ainda não criada) libera a ação; falha
 *     ao gravar vai só para o log — nunca derruba a ação.
 *
 * Sem chave nenhuma (nem Gemini nem OpenAI) → 503 "IA não configurada".
 */
```

Edição 4 — imports + remoção do chamarComEscalonamento local (linhas 58–93; ele vai para escalonamento.ts) (`supabase/functions/ia-processar/index.ts`)

Trocar (literal):

```ts
import { chamarOpenAI, lerConfigOpenAI, MODELO_FORTE, validarRef } from "../_shared/openai.ts";
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { contarPreenchidos } from "./edital-regras.ts";
import { editalAtende, editalConsolidar, editalExtrairParte } from "./edital.ts";
import { ehAcaoEdital, novoMedidor, registrarUso, verificarCotaEdital } from "./ia-uso.ts";

/**
 * ESCALONAMENTO AUTOMÁTICO: tenta o modelo configurado (econômico); se o
 * resultado vier fraco (heurística por ação) ou com erro, refaz no modelo
 * forte e devolve a resposta mais completa. Pedido do dono: "trocar
 * automático os modelos quando tiver dificuldade".
 */
async function chamarComEscalonamento(
  opts: { prompt: string; fileRefs?: string[]; jsonSchema?: unknown },
  // deno-lint-ignore no-explicit-any
  estaFraco?: (resultado: any) => boolean
): Promise<{ ok: true; resultado: unknown; modelo: string } | { ok: false; erro: string }> {
  const { modelo } = await lerConfigOpenAI();
  const cadeia = [...new Set([modelo, MODELO_FORTE])];
  let melhor: { resultado: unknown; pontos: number; modelo: string } | null = null;
  let ultimoErro = "IA indisponível";
  for (const m of cadeia) {
    const r = await chamarOpenAI({ ...opts, modelo: m });
    if (!r.ok) {
      ultimoErro = r.erro;
      if (r.erro === "IA_NAO_CONFIGURADA") return r;
      continue; // erro/JSON inválido → tenta o próximo modelo
    }
    const pontos = contarPreenchidos(r.resultado);
    if (!melhor || pontos > melhor.pontos) melhor = { resultado: r.resultado, pontos, modelo: m };
    if (!estaFraco || !estaFraco(r.resultado)) break; // bom o suficiente, para aqui
  }
  return melhor ? { ok: true, resultado: melhor.resultado, modelo: melhor.modelo } : { ok: false, erro: ultimoErro };
}
```

por:

```ts
import { validarRef } from "../_shared/openai.ts";
import { chamarIA } from "../_shared/ia.ts";
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { editalAtende, editalConsolidar, editalExtrairParte, falhaIA } from "./edital.ts";
import { chamarComEscalonamento } from "./escalonamento.ts";
import { contabilizar, ehAcaoEdital, novoMedidor, registrarUso, verificarCotaEdital } from "./ia-uso.ts";
```

Edição 5 — medidor da requisição + ação llm (linhas 267–281) (`supabase/functions/ia-processar/index.ts`)

Trocar (literal):

```ts
    try {
      if (body.acao === "llm") {
        if (!body.prompt) return fail("prompt é obrigatório", 400);
        const r = await chamarOpenAI({
          prompt: body.prompt,
          jsonSchema: body.json_schema,
          fileRefs: body.file_refs,
        });
        if (!r.ok) {
          return r.erro === "IA_NAO_CONFIGURADA"
            ? fail("IA não configurada — defina a chave no SaaS Admin → Integrações", 503)
            : fail(r.erro, 502);
        }
        return ok({ resultado: r.resultado });
      }
```

por:

```ts
    // consumo: toda chamada à IA desta requisição soma no medidor, gravado no
    // finally (ok, erro ou exceção); sem chamada à IA não grava nada
    const admin = createAdminClient();
    const medidor = novoMedidor();

    try {
      if (body.acao === "llm") {
        if (!body.prompt) return fail("prompt é obrigatório", 400);
        const r = await chamarIA({
          prompt: body.prompt,
          jsonSchema: body.json_schema,
          fileRefs: body.file_refs,
        });
        contabilizar(medidor, r);
        if (!r.ok) return falhaIA(r);
        return ok({ resultado: r.resultado });
      }
```

Edição 6 — extrair_documentos (linhas 313–321) (`supabase/functions/ia-processar/index.ts`)

Trocar (literal):

```ts
const r = await chamarComEscalonamento(
  { prompt, fileRefs: body.file_refs, jsonSchema: SCHEMA_EXTRACAO },
  extracaoFraca
);
if (!r.ok) {
  return r.erro === "IA_NAO_CONFIGURADA"
    ? fail("IA não configurada — defina a chave no SaaS Admin → Integrações", 503)
    : fail(r.erro, 502);
}
```

por:

```ts
const r = await chamarComEscalonamento(
  chamarIA,
  { prompt, fileRefs: body.file_refs, jsonSchema: SCHEMA_EXTRACAO },
  extracaoFraca,
  medidor
);
if (!r.ok) return falhaIA(r);
```

Edição 7 — validar_exames_pcmso (linhas 340–348) (`supabase/functions/ia-processar/index.ts`)

Trocar (literal):

```ts
const r = await chamarComEscalonamento(
  { prompt, fileRefs: [body.pcmso_ref, ...body.exames_refs], jsonSchema: SCHEMA_PCMSO },
  parecerFraco
);
if (!r.ok) {
  return r.erro === "IA_NAO_CONFIGURADA"
    ? fail("IA não configurada — defina a chave no SaaS Admin → Integrações", 503)
    : fail(r.erro, 502);
}
```

por:

```ts
const r = await chamarComEscalonamento(
  chamarIA,
  { prompt, fileRefs: [body.pcmso_ref, ...body.exames_refs], jsonSchema: SCHEMA_PCMSO },
  parecerFraco,
  medidor
);
if (!r.ok) return falhaIA(r);
```

Edição 8 — edital\_\* usa o medidor da requisição; registrarUso vai para o finally (linhas 352–378) (`supabase/functions/ia-processar/index.ts`)

Trocar (literal):

```ts
      if (ehAcaoEdital(body.acao)) {
        const acao = body.acao;
        const admin = createAdminClient();
        const estouro = await verificarCotaEdital(admin, usuario);
        if (estouro) {
          return fail(
            `Limite diário da IA na leitura de editais atingido para esta empresa (${estouro.usadas} de ${estouro.cota} chamadas hoje) — tente amanhã ou fale com o suporte do SIGO.`,
            429,
            { codigo: "COTA_IA", cota: estouro.cota, usadas: estouro.usadas }
          );
        }
        const medidor = novoMedidor();
        const dados = body as Record<string, unknown>;
        try {
          if (acao === "edital_extrair_parte") return await editalExtrairParte(dados, medidor);
          if (acao === "edital_consolidar") return await editalConsolidar(dados, medidor);
          return await editalAtende(dados, usuario, medidor);
        } finally {
          await registrarUso(admin, usuario, acao, medidor);
        }
      }

      return fail("Ação desconhecida", 400);
    } catch (e) {
      console.error("[ia-processar]", (e as Error)?.message);
      return fail((e as Error)?.message || "Erro interno", 500);
    }
```

por:

```ts
      if (ehAcaoEdital(body.acao)) {
        const acao = body.acao;
        const estouro = await verificarCotaEdital(admin, usuario);
        if (estouro) {
          return fail(
            `Limite diário da IA na leitura de editais atingido para esta empresa (${estouro.usadas} de ${estouro.cota} chamadas hoje) — tente amanhã ou fale com o suporte do SIGO.`,
            429,
            { codigo: "COTA_IA", cota: estouro.cota, usadas: estouro.usadas }
          );
        }
        const dados = body as Record<string, unknown>;
        if (acao === "edital_extrair_parte") return await editalExtrairParte(dados, medidor);
        if (acao === "edital_consolidar") return await editalConsolidar(dados, medidor);
        return await editalAtende(dados, usuario, medidor);
      }

      return fail("Ação desconhecida", 400);
    } catch (e) {
      console.error("[ia-processar]", (e as Error)?.message);
      return fail((e as Error)?.message || "Erro interno", 500);
    } finally {
      // TODA ação de IA grava o consumo; registrarUso ignora medidor sem chamada
      await registrarUso(admin, usuario, String(body.acao ?? ""), medidor);
    }
```

- [ ] **Step 9: Conferir que não sobrou nada do motor antigo em `ia-processar`**

```bash
cd /c/Users/javer/sigoobras-base && grep -n "chamarOpenAI\|MODELO_FORTE\|lerConfigOpenAI\|RespostaOpenAI" supabase/functions/ia-processar/*.ts; echo "sobras=$?"
```

Esperado: nenhuma linha listada e `sobras=1` (o grep não achou nada).

- [ ] **Step 10: Rodar todos os testes do backend**

```bash
cd /c/Users/javer/sigoobras-base && node --test supabase/functions/ia-processar/*.test.ts supabase/functions/_shared/*.test.ts
```

Esperado: `ℹ fail 0` (o total inclui os testes das Tasks 1–4).

- [ ] **Step 11: Checar imports/exports da função inteira (bundle sem rede)**

```bash
cd /c/Users/javer/sigoobras-base && npx esbuild supabase/functions/ia-processar/index.ts --bundle --format=esm --platform=neutral "--external:https://*" --log-level=warning > /dev/null && echo BUNDLE_OK
```

Esperado: `BUNDLE_OK` e nenhum `No matching export` (pega, por exemplo, `falhaIA` não exportada ou `chamarIA` com outro nome).

- [ ] **Step 12: Checar tipos do `ia-processar` (tsc com shims dos imports por URL e do `Deno`)**

```bash
cd /c/Users/javer/sigoobras-base && T=$(mktemp -d) && cat > "$T/shims.d.ts" <<'EOF'
declare module "https://*" {
  const x: any;
  export default x;
  export const createClient: any;
  export const PDFDocument: any;
  export const StandardFonts: any;
  export const rgb: any;
}
declare const Deno: any;
EOF
npx tsc --noEmit --allowImportingTsExtensions --target es2022 --module esnext --moduleResolution bundler --strict --skipLibCheck --lib es2022,dom "$T/shims.d.ts" supabase/functions/ia-processar/index.ts 2>&1 | grep "error TS" | grep "ia-processar/"; echo "erros_ia_processar=$(npx tsc --noEmit --allowImportingTsExtensions --target es2022 --module esnext --moduleResolution bundler --strict --skipLibCheck --lib es2022,dom "$T/shims.d.ts" supabase/functions/ia-processar/index.ts 2>&1 | grep "error TS" | grep -c "ia-processar/")"; rm -rf "$T"
```

Esperado: `erros_ia_processar=0`. Erros em `_shared/*.ts` são efeito dos shims (`any`) e não contam. Se aparecer erro em `ia-processar/`, corrija antes do commit.

- [ ] **Step 13: Commit da migração do `ia-processar`**

```bash
cd /c/Users/javer/sigoobras-base && git add supabase/functions/ia-processar/index.ts supabase/functions/ia-processar/edital.ts && git commit -F - <<'EOF'
feat(ia): ia-processar usa chamarIA por nível e registra o uso de todas as ações

- llm, extrair_documentos, validar_exames_pcmso e edital_* chamam chamarIA
  (Gemini padrão, OpenAI reserva) com nivel "padrao"/"forte" em vez de nome
  de modelo; edital mantém os tempos 100/110/120 s e o escalonamento padrão
  → forte quando a leitura vem fraca
- consumo (tokens, provedor, modelo, custo) gravado em ia_uso no finally do
  handler para TODA ação de IA; a cota diária continua só para edital_*
- falhaIA exportada do edital.ts e reaproveitada no index

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

- [ ] **Step 14: Não publicar aqui**

A `ia-processar` só vai para produção na Task 8, **depois** da migração 0123 e com OK do Javerson. Comando daquela Task (verify_jwt continua ligado, então **sem** `--no-verify-jwt`):

```bash
npx supabase@2.118.0 functions deploy ia-processar --project-ref fpyvdwpvxrubrkdwrqbs --use-api
```

Sem a chave do Gemini salva, o `chamarIA` usa só o OpenAI e o comportamento fica igual ao de hoje. A diferença é que o uso de `llm`, `extrair_documentos` e `validar_exames_pcmso` também passa a ser gravado em `ia_uso`.

## Parte A — SaaS Admin e produção (Tasks 6 a 8)

Todos os comandos rodam na raiz do repositório (`/c/Users/javer/sigoobras-base`, Git Bash); os do front usam um subshell `(cd apps/web && …)` para não mudar a pasta dos passos seguintes. As Tasks 6 e 7 só mexem em código; a Task 8 é a única que toca produção, e cada passo de produção começa pedindo OK ao Javerson.

### Task 6: `saas-config` — status, definir e testar do Gemini

**Files:**

- Create: `supabase/functions/saas-config/regras.ts` (~105 linhas; puro)
- Test: `supabase/functions/saas-config/regras.test.ts`
- Modify: `supabase/functions/saas-config/index.ts` (cabeçalho e imports, linhas ~1-18; tipo do corpo, linha ~78; `status`, linhas ~99-114; `definir`, linhas ~116-133)

**Interfaces:**

- Consumes:
  - Task 1 (`_shared/gemini-regras.ts`): `MODELOS_GEMINI_PADRAO: readonly string[]` e `MODELOS_GEMINI_FORTE: readonly string[]`;
  - Task 2 (`_shared/gemini.ts`): `testarChaveGemini(apiKey: string, modelo: string): Promise<{ ok: boolean; mensagem: string }>`;
  - Task 3 (`_shared/ia-nucleo.ts`): `CHAVES_CONFIG_IA` e `configDeLinhas(linhas: { chave: string; valor: unknown }[], env: { GEMINI_API_KEY?: string; OPENAI_API_KEY?: string }): ConfigIA`; (`_shared/ia.ts`): `lerConfigIA(): Promise<ConfigIA>`;
  - Já existentes: `createAdminClient`, `ok`/`fail`/`withCors`/`preflightResponse`, `usuarioDaRequisicao`, `evolutionApi`/`CanalNaoConfiguradoError`.
- Produces:
  - `saas-config/regras.ts`:
    - `MODELOS_OPENAI: readonly string[]` (`["gpt-4o-mini", "gpt-4o"]`, sai do `MODELOS_PERMITIDOS` do index.ts);
    - `interface CorpoDefinir { chave_openai?; modelo?; chave_gemini?; gemini_modelo?; gemini_modelo_forte? }` (todos `unknown`);
    - `type LinhaConfig = { chave: string; valor: string }`;
    - `validarDefinir(body: CorpoDefinir): { ok: true; linhas: LinhaConfig[] } | { ok: false; erro: string }`;
    - `interface StatusGemini { configurada: boolean; final: string | null; origem: "secret" | "painel" | null; modelo: string; modelo_forte: string }`;
    - `statusGemini(linhas: { chave: string; valor: unknown }[], env: { GEMINI_API_KEY?: string }): StatusGemini`.
  - HTTP (só super admin; a Task 7 consome):
    - `{ acao:"status" }` → `{ success, openai:{configurada, final, origem, modelo}, gemini:{configurada, final, origem, modelo, modelo_forte} }`;
    - `{ acao:"definir", chave_openai?, modelo?, chave_gemini?, gemini_modelo?, gemini_modelo_forte? }` → `{ success, message }` ou 400 com o erro de `validarDefinir`;
    - `{ acao:"testar_gemini" }` → `{ success, gemini_teste:{ ok, mensagem } }` (sem chave: `ok:false`, "Nenhuma chave do Gemini salva").
  - Garantias:
    - o status usa o mesmo `configDeLinhas` do `chamarIA`: modelo salvo fora da lista aparece (e é usado) como o padrão;
    - o teste usa `lerConfigIA()`: a mesma chave (env `GEMINI_API_KEY` > painel) e o mesmo modelo padrão que as leituras vão usar;
    - as chaves nunca voltam (só os 4 últimos caracteres);
    - o comportamento do OpenAI no `definir` é o de hoje (mesmas mensagens).

- [ ] **Step 1: Escrever o teste que falha**

Criar `supabase/functions/saas-config/regras.test.ts`:

```ts
// Roda com Node 23.6+ (type stripping):  node --test supabase/functions/saas-config/regras.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { MODELOS_OPENAI, statusGemini, validarDefinir } from "./regras.ts";

const CHAVE_GEMINI = "AIzaSyTESTE0000000000000000000000001234";

test("definir: chave do Gemini aparada e aceita sem checar prefixo", () => {
  assert.deepEqual(validarDefinir({ chave_gemini: `  ${CHAVE_GEMINI}\n` }), {
    ok: true,
    linhas: [{ chave: "gemini_api_key", valor: CHAVE_GEMINI }],
  });
  // prefixo diferente de AIza também vale (o Google muda o formato das chaves)
  assert.equal(validarDefinir({ chave_gemini: "AQ.Ab8RN6K_teste_chave_nova_42" }).ok, true);
});

test("definir: chave do Gemini curta, com espaço no meio ou que não é texto é recusada", () => {
  const erro = "Chave do Gemini inválida (sem espaços, com 20 caracteres ou mais)";
  assert.deepEqual(validarDefinir({ chave_gemini: "AIzaSy123" }), { ok: false, erro });
  assert.deepEqual(validarDefinir({ chave_gemini: "AIzaSyTESTE 0000000000000000001234" }), {
    ok: false,
    erro,
  });
  assert.deepEqual(validarDefinir({ chave_gemini: 12345678901234567890 }), { ok: false, erro });
  assert.deepEqual(validarDefinir({ chave_gemini: null }), { ok: false, erro });
});

test("definir: modelos do Gemini só das listas permitidas", () => {
  assert.deepEqual(
    validarDefinir({
      gemini_modelo: "gemini-3.8-flash",
      gemini_modelo_forte: "gemini-3.1-pro-preview",
    }),
    {
      ok: true,
      linhas: [
        { chave: "gemini_modelo", valor: "gemini-3.8-flash" },
        { chave: "gemini_modelo_forte", valor: "gemini-3.1-pro-preview" },
      ],
    }
  );
  assert.deepEqual(validarDefinir({ gemini_modelo: "gemini-3.1-pro-preview" }), {
    ok: false,
    erro: "Modelo padrão do Gemini deve ser um de: gemini-3.5-flash-lite, gemini-3.1-flash-lite, gemini-3.8-flash",
  });
  assert.deepEqual(validarDefinir({ gemini_modelo_forte: "gemini-3.5-flash-lite" }), {
    ok: false,
    erro: "Modelo forte do Gemini deve ser um de: gemini-3.8-flash, gemini-3.1-pro-preview",
  });
});

test("definir: OpenAI mantém as regras de hoje", () => {
  assert.deepEqual([...MODELOS_OPENAI], ["gpt-4o-mini", "gpt-4o"]);
  assert.deepEqual(validarDefinir({ chave_openai: " sk-teste000000000000000000 ", modelo: "gpt-4o" }), {
    ok: true,
    linhas: [
      { chave: "openai_api_key", valor: "sk-teste000000000000000000" },
      { chave: "openai_modelo", valor: "gpt-4o" },
    ],
  });
  assert.deepEqual(validarDefinir({ chave_openai: "chave-sem-prefixo-0000000000" }), {
    ok: false,
    erro: "Chave OpenAI inválida (deve começar com sk-)",
  });
  assert.deepEqual(validarDefinir({ modelo: "gpt-5" }), {
    ok: false,
    erro: "Modelo deve ser um de: gpt-4o-mini, gpt-4o",
  });
});

test("definir: tudo junto sai na ordem; corpo vazio é recusado", () => {
  const r = validarDefinir({
    chave_openai: "sk-teste000000000000000000",
    modelo: "gpt-4o-mini",
    chave_gemini: CHAVE_GEMINI,
    gemini_modelo: "gemini-3.1-flash-lite",
    gemini_modelo_forte: "gemini-3.8-flash",
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.ok && r.linhas.map((l) => l.chave), [
    "openai_api_key",
    "openai_modelo",
    "gemini_api_key",
    "gemini_modelo",
    "gemini_modelo_forte",
  ]);
  assert.deepEqual(validarDefinir({}), { ok: false, erro: "Nada para definir" });
});

test("definir: um campo inválido recusa o pedido inteiro (nada é gravado)", () => {
  assert.deepEqual(validarDefinir({ chave_gemini: CHAVE_GEMINI, gemini_modelo: "gemini-9" }), {
    ok: false,
    erro: "Modelo padrão do Gemini deve ser um de: gemini-3.5-flash-lite, gemini-3.1-flash-lite, gemini-3.8-flash",
  });
});

test("statusGemini: painel, secret, não configurada e modelo fora da lista; nunca devolve a chave", () => {
  const linhas = [
    { chave: "gemini_api_key", valor: CHAVE_GEMINI },
    { chave: "gemini_modelo", valor: "gemini-3.1-flash-lite" },
    { chave: "openai_api_key", valor: "sk-teste000000000000000000" },
  ];
  const painel = statusGemini(linhas, {});
  assert.deepEqual(painel, {
    configurada: true,
    final: "1234",
    origem: "painel",
    modelo: "gemini-3.1-flash-lite",
    modelo_forte: "gemini-3.8-flash",
  });
  assert.ok(!JSON.stringify(painel).includes("AIzaSy"));

  assert.deepEqual(statusGemini(linhas, { GEMINI_API_KEY: "AIzaSySECRET000000000000000009876" }), {
    configurada: true,
    final: "9876",
    origem: "secret",
    modelo: "gemini-3.1-flash-lite",
    modelo_forte: "gemini-3.8-flash",
  });

  assert.deepEqual(
    statusGemini([{ chave: "gemini_modelo_forte", valor: "gemini-9-ultra" }], {
      GEMINI_API_KEY: "",
    }),
    {
      configurada: false,
      final: null,
      origem: null,
      modelo: "gemini-3.5-flash-lite",
      modelo_forte: "gemini-3.8-flash",
    }
  );
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test supabase/functions/saas-config/regras.test.ts`
Expected (FAIL, o módulo ainda não existe):

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../supabase/functions/saas-config/regras.ts' imported from .../supabase/functions/saas-config/regras.test.ts
✖ supabase\functions\saas-config\regras.test.ts
ℹ tests 1
ℹ pass 0
ℹ fail 1
```

- [ ] **Step 3: Implementar as regras puras**

Criar `supabase/functions/saas-config/regras.ts`:

```ts
/**
 * saas-config/regras — regras PURAS da função saas-config (sem Deno e sem
 * imports de URL): testáveis com node --test (regras.test.ts).
 *
 *   - validarDefinir: corpo do { acao:"definir" } → linhas de saas_config ou
 *     o erro (um campo inválido recusa o pedido inteiro);
 *   - statusGemini: linhas de saas_config + env → status do card do Gemini.
 *     Usa o mesmo configDeLinhas da porta de IA (ia-nucleo.ts), então o que o
 *     SaaS Admin mostra é exatamente o que o chamarIA vai usar. A chave nunca
 *     sai daqui: só os 4 últimos caracteres.
 */
import { configDeLinhas } from "../_shared/ia-nucleo.ts";
import { MODELOS_GEMINI_FORTE, MODELOS_GEMINI_PADRAO } from "../_shared/gemini-regras.ts";

export const MODELOS_OPENAI: readonly string[] = ["gpt-4o-mini", "gpt-4o"];

export interface CorpoDefinir {
  chave_openai?: unknown;
  modelo?: unknown;
  chave_gemini?: unknown;
  gemini_modelo?: unknown;
  gemini_modelo_forte?: unknown;
}

export type LinhaConfig = { chave: string; valor: string };

export interface StatusGemini {
  configurada: boolean;
  final: string | null;
  origem: "secret" | "painel" | null;
  modelo: string;
  modelo_forte: string;
}

const textoAparado = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const textoExato = (v: unknown): string => (typeof v === "string" ? v : "");

export function validarDefinir(body: CorpoDefinir): { ok: true; linhas: LinhaConfig[] } | { ok: false; erro: string } {
  const linhas: LinhaConfig[] = [];

  if (body.chave_openai !== undefined) {
    const chave = textoAparado(body.chave_openai);
    if (!chave.startsWith("sk-") || chave.length < 20) {
      return { ok: false, erro: "Chave OpenAI inválida (deve começar com sk-)" };
    }
    linhas.push({ chave: "openai_api_key", valor: chave });
  }
  if (body.modelo !== undefined) {
    const modelo = textoExato(body.modelo);
    if (!MODELOS_OPENAI.includes(modelo)) {
      return { ok: false, erro: `Modelo deve ser um de: ${MODELOS_OPENAI.join(", ")}` };
    }
    linhas.push({ chave: "openai_modelo", valor: modelo });
  }

  if (body.chave_gemini !== undefined) {
    // sem checar prefixo: o Google já trocou o formato das chaves mais de uma vez
    const chave = textoAparado(body.chave_gemini);
    if (chave.length < 20 || /\s/.test(chave)) {
      return {
        ok: false,
        erro: "Chave do Gemini inválida (sem espaços, com 20 caracteres ou mais)",
      };
    }
    linhas.push({ chave: "gemini_api_key", valor: chave });
  }
  if (body.gemini_modelo !== undefined) {
    const modelo = textoExato(body.gemini_modelo);
    if (!MODELOS_GEMINI_PADRAO.includes(modelo)) {
      return {
        ok: false,
        erro: `Modelo padrão do Gemini deve ser um de: ${MODELOS_GEMINI_PADRAO.join(", ")}`,
      };
    }
    linhas.push({ chave: "gemini_modelo", valor: modelo });
  }
  if (body.gemini_modelo_forte !== undefined) {
    const modelo = textoExato(body.gemini_modelo_forte);
    if (!MODELOS_GEMINI_FORTE.includes(modelo)) {
      return {
        ok: false,
        erro: `Modelo forte do Gemini deve ser um de: ${MODELOS_GEMINI_FORTE.join(", ")}`,
      };
    }
    linhas.push({ chave: "gemini_modelo_forte", valor: modelo });
  }

  if (linhas.length === 0) return { ok: false, erro: "Nada para definir" };
  return { ok: true, linhas };
}

export function statusGemini(
  linhas: { chave: string; valor: unknown }[],
  env: { GEMINI_API_KEY?: string }
): StatusGemini {
  const g = configDeLinhas(linhas, { GEMINI_API_KEY: env.GEMINI_API_KEY }).gemini;
  const chave = g.apiKey ?? "";
  return {
    configurada: chave.length > 0,
    final: chave ? chave.slice(-4) : null,
    origem: env.GEMINI_API_KEY?.trim() ? "secret" : chave ? "painel" : null,
    modelo: g.modelo,
    modelo_forte: g.modeloForte,
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test supabase/functions/saas-config/regras.test.ts`
Expected (PASS; o aviso `MODULE_TYPELESS_PACKAGE_JSON` do Node é normal neste repo):

```
✔ definir: chave do Gemini aparada e aceita sem checar prefixo
✔ definir: chave do Gemini curta, com espaço no meio ou que não é texto é recusada
✔ definir: modelos do Gemini só das listas permitidas
✔ definir: OpenAI mantém as regras de hoje
✔ definir: tudo junto sai na ordem; corpo vazio é recusado
✔ definir: um campo inválido recusa o pedido inteiro (nada é gravado)
✔ statusGemini: painel, secret, não configurada e modelo fora da lista; nunca devolve a chave
ℹ tests 7
ℹ pass 7
ℹ fail 0
```

- [ ] **Step 5: Ligar as regras e o teste na função**

Em `supabase/functions/saas-config/index.ts`, trocar:

```ts
 * Só SUPER ADMIN. Ações:
 *   { acao: "status" }  → { success, openai: { configurada, final, modelo } }
 *   { acao: "definir", chave_openai?, modelo? } → { success }
 *   { acao: "whatsapp_status" | "whatsapp_qr" | "whatsapp_desconectar" }
 *        → { success, whatsapp: { configurado, estado, numero?, nome?, qr? } }
 *
 * A chave NUNCA é retornada (só "configurada" + últimos 4 dígitos).
 * Precedência de leitura: env OPENAI_API_KEY > tabela saas_config.
 */
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { preflightResponse, ok, fail, withCors } from "../_shared/cors.ts";
import { usuarioDaRequisicao } from "../_shared/usuario-request.ts";
import { evolutionApi, CanalNaoConfiguradoError } from "../_shared/whatsapp-envio.ts";

const MODELOS_PERMITIDOS = ["gpt-4o-mini", "gpt-4o"];
```

por:

```ts
 * Só SUPER ADMIN. Ações:
 *   { acao: "status" }
 *        → { success, openai: { configurada, final, origem, modelo },
 *            gemini: { configurada, final, origem, modelo, modelo_forte } }
 *   { acao: "definir", chave_openai?, modelo?, chave_gemini?, gemini_modelo?,
 *     gemini_modelo_forte? } → { success }   (validação em regras.ts)
 *   { acao: "testar_gemini" } → { success, gemini_teste: { ok, mensagem } }
 *        (GET do modelo padrão com a chave em uso — env ou painel —, 10 s)
 *   { acao: "whatsapp_status" | "whatsapp_qr" | "whatsapp_desconectar" }
 *        → { success, whatsapp: { configurado, estado, numero?, nome?, qr? } }
 *
 * As chaves NUNCA são retornadas (só "configurada" + últimos 4 dígitos).
 * Precedência de leitura: env OPENAI_API_KEY / GEMINI_API_KEY > tabela saas_config.
 */
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { preflightResponse, ok, fail, withCors } from "../_shared/cors.ts";
import { usuarioDaRequisicao } from "../_shared/usuario-request.ts";
import { evolutionApi, CanalNaoConfiguradoError } from "../_shared/whatsapp-envio.ts";
import { testarChaveGemini } from "../_shared/gemini.ts";
import { lerConfigIA } from "../_shared/ia.ts";
import { CHAVES_CONFIG_IA } from "../_shared/ia-nucleo.ts";
import { statusGemini, validarDefinir, type CorpoDefinir } from "./regras.ts";
```

Em `supabase/functions/saas-config/index.ts`, trocar:

```ts
let body: { acao?: string; chave_openai?: string; modelo?: string };
```

por:

```ts
let body: { acao?: string } & CorpoDefinir;
```

Em `supabase/functions/saas-config/index.ts`, trocar:

```ts
        .in("chave", ["openai_api_key", "openai_modelo"]);
      const mapa = new Map((data ?? []).map((r) => [r.chave, r.valor]));
      const chave = Deno.env.get("OPENAI_API_KEY") || mapa.get("openai_api_key") || "";
      return ok({
        openai: {
          configurada: chave.length > 0,
          final: chave ? chave.slice(-4) : null,
          origem: Deno.env.get("OPENAI_API_KEY") ? "secret" : chave ? "painel" : null,
          modelo: mapa.get("openai_modelo") || "gpt-4o-mini",
        },
      });
    }
```

por:

```ts
        .in("chave", CHAVES_CONFIG_IA);
      const linhas = data ?? [];
      const mapa = new Map(linhas.map((r) => [r.chave, r.valor]));
      const chave = Deno.env.get("OPENAI_API_KEY") || mapa.get("openai_api_key") || "";
      return ok({
        openai: {
          configurada: chave.length > 0,
          final: chave ? chave.slice(-4) : null,
          origem: Deno.env.get("OPENAI_API_KEY") ? "secret" : chave ? "painel" : null,
          modelo: mapa.get("openai_modelo") || "gpt-4o-mini",
        },
        gemini: statusGemini(linhas, { GEMINI_API_KEY: Deno.env.get("GEMINI_API_KEY") }),
      });
    }

    if (body.acao === "testar_gemini") {
      // mesma chave e mesmo modelo que o chamarIA vai usar (env > painel)
      const cfg = await lerConfigIA();
      if (!cfg.gemini.apiKey) {
        return ok({ gemini_teste: { ok: false, mensagem: "Nenhuma chave do Gemini salva" } });
      }
      return ok({ gemini_teste: await testarChaveGemini(cfg.gemini.apiKey, cfg.gemini.modelo) });
    }
```

Em `supabase/functions/saas-config/index.ts`, trocar:

```ts
    if (body.acao === "definir") {
      const upserts: { chave: string; valor: string; updated_at: string }[] = [];
      const agora = new Date().toISOString();
      if (body.chave_openai !== undefined) {
        const chave = (body.chave_openai ?? "").trim();
        if (!chave.startsWith("sk-") || chave.length < 20) {
          return fail("Chave OpenAI inválida (deve começar com sk-)", 400);
        }
        upserts.push({ chave: "openai_api_key", valor: chave, updated_at: agora });
      }
      if (body.modelo !== undefined) {
        if (!MODELOS_PERMITIDOS.includes(body.modelo ?? "")) {
          return fail(`Modelo deve ser um de: ${MODELOS_PERMITIDOS.join(", ")}`, 400);
        }
        upserts.push({ chave: "openai_modelo", valor: body.modelo!, updated_at: agora });
      }
      if (upserts.length === 0) return fail("Nada para definir", 400);
      const { error } = await supabase.from("saas_config").upsert(upserts, { onConflict: "chave" });
```

por:

```ts
    if (body.acao === "definir") {
      const validado = validarDefinir(body);
      if (!validado.ok) return fail(validado.erro, 400);
      const agora = new Date().toISOString();
      const upserts = validado.linhas.map((l) => ({ ...l, updated_at: agora }));
      const { error } = await supabase.from("saas_config").upsert(upserts, { onConflict: "chave" });
```

(O restante do `definir` — o log de erro e o `ok({ message: "Configuração salva" })` — fica igual.)

- [ ] **Step 6: Conferir a sintaxe e rodar a regressão do backend**

Run:

```bash
node --check supabase/functions/saas-config/index.ts && node --check supabase/functions/saas-config/regras.ts && echo SINTAXE_OK
grep -n "MODELOS_PERMITIDOS\|testar_gemini\|statusGemini(\|validarDefinir(" supabase/functions/saas-config/index.ts
node --test supabase/functions/_shared/*.test.ts supabase/functions/ia-processar/*.test.ts supabase/functions/saas-config/*.test.ts
```

Expected:

```
SINTAXE_OK
<n>: *   { acao: "testar_gemini" } → { success, gemini_teste: { ok, mensagem } }
<n>:        gemini: statusGemini(linhas, { GEMINI_API_KEY: Deno.env.get("GEMINI_API_KEY") }),
<n>:    if (body.acao === "testar_gemini") {
<n>:      const validado = validarDefinir(body);
...
ℹ fail 0
```

(nenhuma linha com `MODELOS_PERMITIDOS`; o total de testes é o da regressão da Task 5 + 7. `node --check` só valida a sintaxe TS: o index.ts importa esm.sh indiretamente e não roda no Node; a lógica nova está em `regras.ts`, coberta pelo teste.)

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/saas-config/regras.ts supabase/functions/saas-config/regras.test.ts supabase/functions/saas-config/index.ts
git commit -F - <<'EOF'
feat(ia): saas-config com status, definir e teste da chave do Gemini

status devolve gemini {configurada, final, origem, modelo, modelo_forte}
pelo mesmo configDeLinhas do chamarIA; definir aceita chave_gemini (sem
espaços, 20+ caracteres, sem checar prefixo) e os modelos padrão/forte da
lista; testar_gemini faz o GET do modelo com a chave em uso. Validação do
corpo em regras.ts, testada com node --test.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log --oneline -1
```

Expected: o lint-staged roda o prettier nos 3 arquivos e o commit sai; `git log` mostra `feat(ia): saas-config com status, definir e teste da chave do Gemini`.

### Task 7: SaaS Admin → Integrações — card "Google Gemini (IA padrão)"

**Files:**

- Create: `apps/web/src/lib/integracoes-ia.js` (~50 linhas; puro)
- Test: `apps/web/src/lib/integracoes-ia.test.js`
- Modify: `apps/web/src/components/saas/IntegracoesTab.jsx` (imports, linhas ~15-17; card novo + estado, linhas ~19-26; `carregar`, linhas ~37-38; título do card OpenAI, linhas ~76-85)
- Modify: `apps/web/src/pages/SaasAdmin.jsx` (comentário da aba, linha ~827)

**Interfaces:**

- Consumes (Task 6, HTTP via `sigo.functions.invoke("saasConfig", …)`, que nunca lança: erro vem em `data.success === false` + `data.error`):
  - `{ acao:"status" }` → `data.openai` e `data.gemini` (`{configurada, final, origem, modelo, modelo_forte}`);
  - `{ acao:"definir", chave_gemini?, gemini_modelo?, gemini_modelo_forte? }`;
  - `{ acao:"testar_gemini" }` → `data.gemini_teste` (`{ok, mensagem}`).
- Produces:
  - `apps/web/src/lib/integracoes-ia.js`:
    - `GEMINI_MODELO_PADRAO = "gemini-3.5-flash-lite"`, `GEMINI_MODELO_FORTE = "gemini-3.8-flash"`;
    - `OPCOES_GEMINI_PADRAO` e `OPCOES_GEMINI_FORTE`: `{ valor, rotulo }[]`, mesmos valores e ordem de `MODELOS_GEMINI_PADRAO`/`MODELOS_GEMINI_FORTE` do servidor (quem valida é o servidor);
    - `payloadGemini({ novaChave, modelo, modeloForte, status })` → `{ acao:"definir", ...só o que mudou }` ou `null` (nada a salvar);
    - `resultadoTesteGemini(data)` → `{ ok: boolean, mensagem: string }`.
  - Tela: card Gemini acima do card OpenAI (que passa a "OpenAI (reserva)"), com chave (senha), modelo padrão, modelo forte, Salvar, Testar (só com chave salva e sem chave digitada pendente) e o aviso fixo de chave nova com faturamento.

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/web/src/lib/integracoes-ia.test.js`:

```js
import { describe, it, expect } from "vitest";
import {
  GEMINI_MODELO_FORTE,
  GEMINI_MODELO_PADRAO,
  OPCOES_GEMINI_FORTE,
  OPCOES_GEMINI_PADRAO,
  payloadGemini,
  resultadoTesteGemini,
} from "./integracoes-ia";

const STATUS = {
  configurada: true,
  final: "1234",
  origem: "painel",
  modelo: "gemini-3.5-flash-lite",
  modelo_forte: "gemini-3.8-flash",
};

describe("modelos do Gemini no SaaS Admin", () => {
  it("as opções são as que o servidor aceita, com o padrão primeiro", () => {
    expect(OPCOES_GEMINI_PADRAO.map((o) => o.valor)).toEqual([
      "gemini-3.5-flash-lite",
      "gemini-3.1-flash-lite",
      "gemini-3.8-flash",
    ]);
    expect(OPCOES_GEMINI_FORTE.map((o) => o.valor)).toEqual(["gemini-3.8-flash", "gemini-3.1-pro-preview"]);
    expect(GEMINI_MODELO_PADRAO).toBe(OPCOES_GEMINI_PADRAO[0].valor);
    expect(GEMINI_MODELO_FORTE).toBe(OPCOES_GEMINI_FORTE[0].valor);
    for (const o of [...OPCOES_GEMINI_PADRAO, ...OPCOES_GEMINI_FORTE]) {
      expect(o.rotulo.startsWith(o.valor)).toBe(true);
    }
  });
});

describe("payloadGemini (botão Salvar do card)", () => {
  it("nada mudou → null (Salvar desabilitado)", () => {
    expect(
      payloadGemini({
        novaChave: "",
        modelo: "gemini-3.5-flash-lite",
        modeloForte: "gemini-3.8-flash",
        status: STATUS,
      })
    ).toBeNull();
    expect(
      payloadGemini({
        novaChave: "   ",
        modelo: GEMINI_MODELO_PADRAO,
        modeloForte: GEMINI_MODELO_FORTE,
        status: null,
      })
    ).toBeNull();
    expect(payloadGemini()).toBeNull();
  });

  it("chave nova vai aparada e sozinha", () => {
    expect(
      payloadGemini({
        novaChave: "  AIzaSyTESTE000000000000001234 \n",
        modelo: "gemini-3.5-flash-lite",
        modeloForte: "gemini-3.8-flash",
        status: STATUS,
      })
    ).toEqual({ acao: "definir", chave_gemini: "AIzaSyTESTE000000000000001234" });
  });

  it("só os modelos que mudaram", () => {
    expect(
      payloadGemini({
        novaChave: "",
        modelo: "gemini-3.8-flash",
        modeloForte: "gemini-3.8-flash",
        status: STATUS,
      })
    ).toEqual({ acao: "definir", gemini_modelo: "gemini-3.8-flash" });
    expect(
      payloadGemini({
        novaChave: "",
        modelo: "gemini-3.5-flash-lite",
        modeloForte: "gemini-3.1-pro-preview",
        status: STATUS,
      })
    ).toEqual({ acao: "definir", gemini_modelo_forte: "gemini-3.1-pro-preview" });
  });

  it("sem status (servidor antigo ou falha ao carregar) compara com os padrões", () => {
    expect(
      payloadGemini({
        novaChave: "",
        modelo: "gemini-3.1-flash-lite",
        modeloForte: GEMINI_MODELO_FORTE,
        status: null,
      })
    ).toEqual({ acao: "definir", gemini_modelo: "gemini-3.1-flash-lite" });
  });
});

describe("resultadoTesteGemini (botão Testar)", () => {
  it("lê o gemini_teste do servidor", () => {
    expect(
      resultadoTesteGemini({
        success: true,
        gemini_teste: { ok: true, mensagem: "Gemini respondeu" },
      })
    ).toEqual({ ok: true, mensagem: "Gemini respondeu" });
    expect(
      resultadoTesteGemini({
        success: true,
        gemini_teste: { ok: false, mensagem: "Chave inválida" },
      })
    ).toEqual({ ok: false, mensagem: "Chave inválida" });
  });

  it("erro da função ou resposta estranha vira falha com mensagem", () => {
    expect(resultadoTesteGemini({ success: false, error: "Acesso restrito ao super admin" })).toEqual({
      ok: false,
      mensagem: "Acesso restrito ao super admin",
    });
    expect(resultadoTesteGemini({ success: false })).toEqual({
      ok: false,
      mensagem: "Não foi possível testar a chave",
    });
    expect(resultadoTesteGemini(null)).toEqual({
      ok: false,
      mensagem: "Não foi possível testar a chave",
    });
    expect(resultadoTesteGemini({ success: true })).toEqual({
      ok: false,
      mensagem: "Resposta inesperada do servidor",
    });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `(cd apps/web && npx vitest run src/lib/integracoes-ia.test.js)`
Expected (FAIL, o módulo ainda não existe):

```
FAIL  src/lib/integracoes-ia.test.js [ src/lib/integracoes-ia.test.js ]
Error: Cannot find module './integracoes-ia' imported from '.../apps/web/src/lib/integracoes-ia.test.js'
Test Files  1 failed (1)
```

- [ ] **Step 3: Implementar as regras do card**

Criar `apps/web/src/lib/integracoes-ia.js`:

```js
/**
 * integracoes-ia — regras puras do card "Google Gemini (IA padrão)" do SaaS
 * Admin (components/saas/IntegracoesTab.jsx). Testado com vitest em node.
 *
 * As listas repetem MODELOS_GEMINI_PADRAO / MODELOS_GEMINI_FORTE do servidor
 * (supabase/functions/_shared/gemini-regras.ts): quem valida é a função
 * saas-config; aqui é só o que aparece no seletor.
 */

export const GEMINI_MODELO_PADRAO = "gemini-3.5-flash-lite";
export const GEMINI_MODELO_FORTE = "gemini-3.8-flash";

export const OPCOES_GEMINI_PADRAO = [
  { valor: "gemini-3.5-flash-lite", rotulo: "gemini-3.5-flash-lite (recomendado)" },
  { valor: "gemini-3.1-flash-lite", rotulo: "gemini-3.1-flash-lite (mais barato)" },
  { valor: "gemini-3.8-flash", rotulo: "gemini-3.8-flash (mais preciso)" },
];

export const OPCOES_GEMINI_FORTE = [
  { valor: "gemini-3.8-flash", rotulo: "gemini-3.8-flash (recomendado)" },
  { valor: "gemini-3.1-pro-preview", rotulo: "gemini-3.1-pro-preview (mais caro)" },
];

/**
 * Corpo do "Salvar" do card do Gemini, só com o que mudou em relação ao
 * status do servidor (sem status, compara com os padrões). null = nada a salvar.
 */
export function payloadGemini({ novaChave = "", modelo, modeloForte, status } = {}) {
  const payload = { acao: "definir" };
  const chave = String(novaChave ?? "").trim();
  if (chave) payload.chave_gemini = chave;
  if (modelo && modelo !== (status?.modelo || GEMINI_MODELO_PADRAO)) {
    payload.gemini_modelo = modelo;
  }
  if (modeloForte && modeloForte !== (status?.modelo_forte || GEMINI_MODELO_FORTE)) {
    payload.gemini_modelo_forte = modeloForte;
  }
  return Object.keys(payload).length > 1 ? payload : null;
}

/** resposta do saasConfig { acao:"testar_gemini" } → { ok, mensagem } para a tela */
export function resultadoTesteGemini(data) {
  if (!data || data.success === false) {
    return { ok: false, mensagem: data?.error || "Não foi possível testar a chave" };
  }
  const t = data.gemini_teste;
  if (!t || typeof t.mensagem !== "string") {
    return { ok: false, mensagem: "Resposta inesperada do servidor" };
  }
  return { ok: t.ok === true, mensagem: t.mensagem };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `(cd apps/web && npx vitest run src/lib/integracoes-ia.test.js)`
Expected (PASS):

```
✓ src/lib/integracoes-ia.test.js (7 tests)
Test Files  1 passed (1)
     Tests  7 passed (7)
```

- [ ] **Step 5: Card do Gemini na tela**

Em `apps/web/src/components/saas/IntegracoesTab.jsx`, trocar:

```jsx
import { Bot, Loader2, Save, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import WhatsAppConexaoCard from "./WhatsAppConexaoCard";
```

por:

```jsx
import { AlertTriangle, Bot, CheckCircle2, Loader2, PlugZap, RefreshCw, Save, Sparkles, XCircle } from "lucide-react";
import { toast } from "sonner";
import WhatsAppConexaoCard from "./WhatsAppConexaoCard";
import {
  GEMINI_MODELO_FORTE,
  GEMINI_MODELO_PADRAO,
  OPCOES_GEMINI_FORTE,
  OPCOES_GEMINI_PADRAO,
  payloadGemini,
  resultadoTesteGemini,
} from "@/lib/integracoes-ia";
```

Em `apps/web/src/components/saas/IntegracoesTab.jsx`, trocar:

```jsx
/**
 * Integrações do SaaS (só Sinergia Digital / super admin).
 * Gerencia a chave global da OpenAI usada pelo ia-processar e a conexão do
 * WhatsApp dos envios automáticos.
 * A chave nunca volta do servidor — só status + últimos 4 dígitos.
 */
export default function IntegracoesTab() {
  const [status, setStatus] = useState(null);
```

por:

```jsx
/**
 * Card do Google Gemini (IA padrão). Salvar manda só o que mudou; "Testar"
 * chama o Google com a chave SALVA (por isso fica desabilitado enquanto há
 * uma chave digitada e não salva).
 */
function CardGemini({ status, carregando, onSalvo }) {
  const [novaChave, setNovaChave] = useState("");
  const [modelo, setModelo] = useState(GEMINI_MODELO_PADRAO);
  const [modeloForte, setModeloForte] = useState(GEMINI_MODELO_FORTE);
  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState(false);
  const [teste, setTeste] = useState(null);

  useEffect(() => {
    setModelo(status?.modelo || GEMINI_MODELO_PADRAO);
    setModeloForte(status?.modelo_forte || GEMINI_MODELO_FORTE);
  }, [status]);

  const payload = payloadGemini({ novaChave, modelo, modeloForte, status });
  const chaveDigitada = novaChave.trim().length > 0;

  const salvar = async () => {
    if (!payload) return;
    setSalvando(true);
    try {
      const { data } = await sigo.functions.invoke("saasConfig", payload);
      if (data?.success !== false) {
        toast.success("Gemini salvo");
        setNovaChave("");
        setTeste(null);
        onSalvo();
      } else {
        toast.error(data?.error || "Erro ao salvar o Gemini");
      }
    } catch (e) {
      toast.error("Erro ao salvar o Gemini");
      console.error(e);
    } finally {
      setSalvando(false);
    }
  };

  const testar = async () => {
    setTestando(true);
    setTeste(null);
    try {
      const { data } = await sigo.functions.invoke("saasConfig", { acao: "testar_gemini" });
      const r = resultadoTesteGemini(data);
      setTeste(r);
      if (r.ok) toast.success(r.mensagem);
      else toast.error(r.mensagem);
    } catch (e) {
      setTeste({ ok: false, mensagem: "Não foi possível testar a chave" });
      console.error(e);
    } finally {
      setTestando(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Sparkles className="w-5 h-5 text-blue-600" /> Google Gemini (IA padrão)
        </CardTitle>
        <CardDescription>
          Usado primeiro em todas as ações de IA, para todas as empresas: leitura de documentos,
          editais, exames (PCMSO) e assistentes. Sem chave ou com falha, o sistema usa a OpenAI
          (reserva).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>
            Use uma chave <strong>nova</strong> do Google AI Studio, criada num projeto com{" "}
            <strong>faturamento ativo</strong>. Sem faturamento, o Google usa os dados enviados para
            melhorar os produtos dele, e documentos de clientes não podem ir assim.
          </p>
        </div>

        {carregando ? (
          <div className="flex items-center gap-2 text-slate-500 py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-600">Status:</span>
              {status?.configurada ? (
                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
                  ● Configurada (final ...{status.final})
                  {status.origem === "secret" ? " · via secret" : ""}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-slate-500">
                  ○ Não configurada
                </Badge>
              )}
            </div>

            <div>
              <Label>Nova chave da API do Gemini</Label>
              <Input
                type="password"
                value={novaChave}
                onChange={(e) => setNovaChave(e.target.value)}
                placeholder={
                  status?.configurada ? "Deixe vazio para manter a atual" : "Cole a chave aqui"
                }
                className="mt-1 font-mono"
                autoComplete="off"
              />
              <p className="text-xs text-slate-400 mt-1">
                A chave é gravada no servidor e nunca volta para o navegador.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Modelo padrão</Label>
                <Select value={modelo} onValueChange={setModelo}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OPCOES_GEMINI_PADRAO.map((o) => (
                      <SelectItem key={o.valor} value={o.valor}>
                        {o.rotulo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-400 mt-1">Leituras do dia a dia.</p>
              </div>
              <div>
                <Label>Modelo forte</Label>
                <Select value={modeloForte} onValueChange={setModeloForte}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OPCOES_GEMINI_FORTE.map((o) => (
                      <SelectItem key={o.valor} value={o.valor}>
                        {o.rotulo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-400 mt-1">
                  Usado quando a leitura com o padrão vem incompleta.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={salvar}
                disabled={salvando || !payload}
                className="bg-slate-900 hover:bg-slate-800"
              >
                {salvando ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Salvar
              </Button>
              <Button
                variant="outline"
                onClick={testar}
                disabled={testando || !status?.configurada || chaveDigitada}
                title={
                  chaveDigitada ? "Salve a chave antes de testar" : "Testa a chave salva no Google"
                }
              >
                {testando ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <PlugZap className="w-4 h-4 mr-2" />
                )}
                Testar
              </Button>
            </div>

            {teste && (
              <p
                className={`flex items-center gap-1.5 text-sm ${
                  teste.ok ? "text-emerald-700" : "text-red-600"
                }`}
              >
                {teste.ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                {teste.mensagem}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Integrações do SaaS (só Sinergia Digital / super admin).
 * Gerencia as chaves globais de IA usadas pelo ia-processar — Gemini (padrão)
 * e OpenAI (reserva) — e a conexão do WhatsApp dos envios automáticos.
 * As chaves nunca voltam do servidor — só status + últimos 4 dígitos.
 */
export default function IntegracoesTab() {
  const [status, setStatus] = useState(null);
  const [statusGemini, setStatusGemini] = useState(null);
```

Em `apps/web/src/components/saas/IntegracoesTab.jsx`, trocar:

```jsx
setStatus(data.openai);
setModelo(data.openai?.modelo || "gpt-4o-mini");
```

por:

```jsx
setStatus(data.openai);
setModelo(data.openai?.modelo || "gpt-4o-mini");
setStatusGemini(data.gemini || null);
```

Em `apps/web/src/components/saas/IntegracoesTab.jsx`, trocar:

```jsx
    <div className="max-w-2xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Bot className="w-5 h-5 text-violet-600" /> OpenAI (IA do sistema)
          </CardTitle>
          <CardDescription>
            Chave global usada por todas as empresas: leitura de documentos na contratação,
            validação de exames (PCMSO) e assistentes de IA.
          </CardDescription>
```

por:

```jsx
    <div className="max-w-2xl space-y-4">
      <CardGemini status={statusGemini} carregando={carregando} onSalvo={carregar} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Bot className="w-5 h-5 text-violet-600" /> OpenAI (reserva)
          </CardTitle>
          <CardDescription>
            Usada quando o Gemini não tem chave ou falha. Chave global, vale para todas as empresas.
          </CardDescription>
```

Em `apps/web/src/pages/SaasAdmin.jsx`, trocar:

```jsx
{
  /* Integrações (chave OpenAI global) */
}
```

por:

```jsx
{
  /* Integrações (IA: Gemini padrão + OpenAI reserva; WhatsApp) */
}
```

- [ ] **Step 6: Lint, testes do front e build**

Run:

```bash
(cd apps/web && npx eslint src/components/saas/IntegracoesTab.jsx src/pages/SaasAdmin.jsx --quiet && echo LINT_OK)
(cd apps/web && npx vitest run)
(cd apps/web && npm run build > /dev/null && echo BUILD_OK)
```

Expected:

- `LINT_OK` (sem erros);
- vitest: todos os arquivos passam, `integracoes-ia.test.js` incluído, nenhuma falha;
- build: imprime `BUILD_OK` (o vite.config usa logLevel "error" e não mostra nada quando dá certo).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/integracoes-ia.js apps/web/src/lib/integracoes-ia.test.js apps/web/src/components/saas/IntegracoesTab.jsx apps/web/src/pages/SaasAdmin.jsx
git commit -F - <<'EOF'
feat(ia): card do Google Gemini (IA padrão) no SaaS Admin

Chave (só no servidor), modelo padrão e forte, Salvar só com o que mudou
e Testar com a chave salva. Aviso fixo: chave nova com faturamento ativo.
O card da OpenAI passa a "OpenAI (reserva)".

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log --oneline -1
```

Expected: o lint-staged roda o prettier nos 4 arquivos e o commit sai; `git log` mostra `feat(ia): card do Google Gemini (IA padrão) no SaaS Admin`.

### Task 8: Produção da Parte A (com OK do Javerson)

**Files:** nenhum arquivo do repositório muda. As consultas de conferência vão em arquivos temporários em `$TEMP` (fora do repo).

**Interfaces:**

- Consumes: tudo das Tasks 1 a 7 — migração `supabase/migrations/0123_ia_uso_provedor_custo.sql` (Task 4); funções `ia-processar` (Tasks 4 e 5) e `saas-config` (Task 6); front (Task 7).
- Produces: Parte A no ar. Sem a chave do Gemini, o SIGO segue pelo OpenAI como hoje, agora registrando `provedor` e `custo_usd` em `ia_uso` em todas as ações de IA. Com a chave colada e testada, as ações passam pelo Gemini.
- Ordem obrigatória: migração → `ia-processar` → `saas-config` → front. A `ia-processar` nova grava as colunas da 0123, e o front novo chama o `testar_gemini`.

- [ ] **Step 1: Suíte completa e formato (local)**

Run:

```bash
node --test supabase/functions/_shared/*.test.ts supabase/functions/ia-processar/*.test.ts supabase/functions/saas-config/*.test.ts
(cd apps/web && npx vitest run && npm run lint)
git fetch -q origin
npx prettier --check --ignore-unknown $(git diff --name-only --diff-filter=d origin/master..master)
```

Expected:

- node: `ℹ fail 0`;
- vitest: nenhuma falha; lint sem erros;
- prettier: `All matched files use Prettier code style!` (o CI roda `format:check`; o `--ignore-unknown` pula o `.sql` da 0123, como no CI).

- [ ] **Step 2: Conferir o que vai subir**

O deploy de função publica a **working tree** da pasta da função e do `_shared`, e não o commit. Por isso, confira antes:

Run:

```bash
git status --short supabase/functions supabase/migrations/0123_ia_uso_provedor_custo.sql
git log --oneline origin/master..master
```

Expected:

- `git status`: nenhuma linha (tudo commitado);
- `git log`: os commits da Parte A (Tasks 1 a 7), mais os de outras sessões, se houver. Mostre a lista ao Javerson.

- [ ] **Step 3: Pedir OK ao Javerson e aplicar a migração 0123**

Pergunte: "Posso aplicar a migração 0123 (colunas `provedor` e `custo_usd` em `ia_uso`) em produção?". Só com o "sim":

Run: `supabase db query --linked -f supabase/migrations/0123_ia_uso_provedor_custo.sql`
Expected: `"res": "ok"`.

Conferir:

```bash
cat > "$TEMP/conferir_0123.sql" <<'EOF'
select column_name, data_type, numeric_precision, numeric_scale
  from information_schema.columns
 where table_schema = 'public' and table_name = 'ia_uso'
   and column_name in ('provedor', 'custo_usd')
 order by column_name;
EOF
supabase db query --linked -f "$TEMP/conferir_0123.sql"
```

Expected: 2 linhas, `custo_usd | numeric | 12 | 6` e `provedor | text | null | null`.

- [ ] **Step 4: Pedir OK ao Javerson e publicar `ia-processar` e `saas-config`**

Pergunte: "Posso publicar as funções `ia-processar` e `saas-config` em produção? Sem a chave do Gemini, a IA continua pelo OpenAI como hoje." Só com o "sim":

As duas hoje têm `verify_jwt = true`. Publique **sem** `--no-verify-jwt`:

Run:

```bash
npx supabase@2.118.0 functions deploy ia-processar --project-ref fpyvdwpvxrubrkdwrqbs --use-api
npx supabase@2.118.0 functions deploy saas-config --project-ref fpyvdwpvxrubrkdwrqbs --use-api
```

Expected: cada uma termina com `Deployed Functions on project fpyvdwpvxrubrkdwrqbs: <nome>`.

Conferir que o `verify_jwt` continua ligado (chamada sem token é barrada pelo gateway, antes da função):

```bash
for f in ia-processar saas-config; do curl -s -X POST -H "content-type: application/json" -d '{}' "https://fpyvdwpvxrubrkdwrqbs.supabase.co/functions/v1/$f"; echo; done
```

Expected, duas vezes: `{"code":"UNAUTHORIZED_NO_AUTH_HEADER","message":"Missing authorization header"}`. Se vier `{"success":false,"error":"Sessão inválida"}`, o `verify_jwt` foi desligado: republique sem a flag.

- [ ] **Step 5: Pedir OK ao Javerson e publicar o front (push em master)**

Run: `git fetch -q origin && git status -sb | head -1 && git log --oneline origin/master..master`
Mostre os commits que vão subir e pergunte: "Posso publicar o front (push em master)?". Só com o "sim":

Run: `git push origin master`

Acompanhe: `gh run list --limit 2` e `gh run watch <id do Deploy frontend> --exit-status`
Expected: "Deploy frontend to Hostgator" e "CI" concluídos com sucesso.

- [ ] **Step 6: Conferência sem a chave do Gemini (comportamento de hoje)**

Com o Javerson logado em https://www.sigoobras.com.br (atualizar com Ctrl+F5):

1. SaaS Admin → **Integrações**:
   - card "Google Gemini (IA padrão)" com "○ Não configurada", o aviso amarelo e o botão **Testar** desabilitado;
   - card "OpenAI (reserva)" com "● Configurada".
2. Dashboard → **Analisar com IA** (ação `llm` da `ia-processar`).

Conferir o registro:

```bash
cat > "$TEMP/ia_uso_ultimos.sql" <<'EOF'
select criado_em, acao, provedor, modelo, tokens_entrada, tokens_saida, custo_usd
  from public.ia_uso
 order by criado_em desc
 limit 3;
EOF
supabase db query --linked -f "$TEMP/ia_uso_ultimos.sql"
```

Expected: a linha mais nova tem `acao = llm`, `provedor = openai`, `modelo = gpt-4o-mini` (ou o `openai_modelo` salvo), tokens > 0 e `custo_usd` > 0.

- [ ] **Step 7: O Javerson cria e cola a chave do Gemini**

Ninguém além do Javerson digita a chave: nem no chat, nem no terminal.

1. No Google AI Studio (https://aistudio.google.com/apikey), ele cria uma chave **nova** num projeto do Google Cloud com **faturamento ativo**.
2. SaaS Admin → Integrações → "Google Gemini (IA padrão)":
   - cola em "Nova chave da API do Gemini";
   - deixa os modelos padrão (`gemini-3.5-flash-lite` e `gemini-3.8-flash`);
   - clica em **Salvar**, depois em **Testar**.

Expected:

- badge "● Configurada (final ...XXXX)";
- abaixo dos botões, em verde: "Gemini respondeu".

Se vier outra mensagem:

- "Chave inválida": a chave foi colada incompleta. Colar de novo e salvar.
- "Chave sem permissão": a Generative Language API está desligada no projeto, ou a chave tem restrição de API/IP. Ajustar no Google Cloud.
- "Sem crédito ou limite atingido": ver o faturamento do projeto.
- "Modelo não encontrado no Google (código 404)": trocar o modelo padrão por outro da lista, salvar e testar de novo.

- [ ] **Step 8: Leitura de prova pelo Gemini e registro em `ia_uso`**

O Javerson clica de novo em Dashboard → **Analisar com IA**.

Run: `supabase db query --linked -f "$TEMP/ia_uso_ultimos.sql"`
Expected: a linha mais nova tem `acao = llm`, `provedor = gemini`, `modelo = gemini-3.5-flash-lite`, tokens > 0 e `custo_usd` > 0 (fração de centavo de dólar).

Se vier `provedor = gemini,openai` (ou só `openai`), o Gemini falhou e a reserva respondeu. Veja o erro da tentativa do Gemini nos logs da `ia-processar` (painel do Supabase → Edge Functions → ia-processar → Logs) antes de seguir para a Parte B.

- [ ] **Step 9: Plano de volta (só se o Javerson pedir)**

Para voltar a usar só o OpenAI, sem novo deploy: a `chamarIA` lê a configuração a cada requisição, então basta apagar a chave do Gemini. Pergunte: "Posso apagar a chave do Gemini do `saas_config` para a IA voltar ao OpenAI?". Só com o "sim":

```bash
cat > "$TEMP/desligar_gemini.sql" <<'EOF'
delete from public.saas_config where chave = 'gemini_api_key';
select 'ok' as res;
EOF
supabase db query --linked -f "$TEMP/desligar_gemini.sql"
```

Expected: `"res": "ok"`; o card volta a "○ Não configurada" e a próxima leitura sai com `provedor = openai`. (Se a chave estiver no secret `GEMINI_API_KEY`, o secret vence o banco: remova-o no painel do Supabase.)

## Parte B — XML sem IA e preenchimento do formulário (Tasks 9 e 10)

Todos os comandos rodam no Git Bash, a partir da raiz do repositório (`/c/Users/javer/sigoobras-base`); os de teste entram em `apps/web`. As duas tasks só criam funções puras em `apps/web/src/lib/` (mais a troca de lugar de duas funções do `CategoriasFornecedorSelect`); nenhuma tela muda aqui — quem usa `lerXmlFiscal` e `montarPreenchimento` são as Tasks 13, 14 e 15. Linha de base do vitest em 25/09: `Test Files 14 passed (14)`, `Tests 128 passed (128)` (em 28/09; a Task 7 soma +1 arquivo e +7 testes antes da Task 9).

### Task 9: Leitor único de XML fiscal (`lib/nfe-xml.js`)

**Files:**

- Create: `apps/web/src/lib/nfe-xml.js` (~460 linhas)
- Test: `apps/web/src/lib/nfe-xml.test.js` (~380 linhas, amostras inline)

**Interfaces:**

- Consumes: só o formato `DocumentoFiscal` do contrato (nenhuma função de task anterior).
- Produces: `export function lerXmlFiscal(texto: string): DocumentoFiscal | null` — `origem: "xml"`, `duvidosos: []` sempre; `null` para texto vazio/não-string, XML malformado ou XML que não seja NF-e/NFC-e/NFS-e. Usado pelas Tasks 13 (botão "Ler documento"), 14 e 15 (importação pela lista).
- Decisões que o contrato não fixava:
  - Sem `DOMParser` e **sem regex por tag**: um mini-leitor monta a árvore do XML (tags, atributos, texto, CDATA, comentários, entidades `&amp;`/`&#231;`/`&#xC1;`) e lança em XML malformado. Regex solta erra em tags aninhadas com o mesmo nome (ABRASF tem `Endereco/Endereco`, e `Numero` aparece na nota, no RPS e no endereço); com a árvore, "filho direto" resolve.
  - Nome de tag comparado sem prefixo de namespace e sem diferenciar maiúsculas (`ns2:InfNfse` = `infnfse`; `Cnpj`/`CNPJ`).
  - `tPag`: 01 dinheiro, 03/04 cartao, 15 boleto, 16/18 transferencia, 17 **e 20** (PIX estático) pix; demais (90 sem pagamento, 99…) → sem forma. Com vários `detPag`, vale o de maior `vPag` que tenha forma conhecida. NF-e 3.10 (vários `<pag>` com `tPag` direto) também funciona.
  - NFS-e do **padrão nacional** (`NFSe/infNFSe`, obrigatória desde 2026) também é lida (`tipo:"nfse"`, `chave:null` — a chave dela tem 50 dígitos e não cabe em `chave_nfe`).
  - `avisos`: XML sem `protNFe`; `tpAmb` 2 (homologação); soma das duplicatas diferente de `vNF` em mais de R$ 0,05; NFS-e com `NfseCancelamento`.
  - `descricao`: `natOp` na NF-e; `Discriminacao`/`xDescServ` na NFS-e (até 500 caracteres). `valor_total` da NFS-e = `ValorServicos`/`vServ` (bruto), como os parsers antigos.
  - `emitente.endereco` numa linha só (`"RUA X, 100 - SALA 2 - CENTRO - CIDADE/UF - CEP 00000-000"`), porque vira o `endereco` do `pessoaSugerida` → `dadosIniciais` do cadastro de fornecedor.
  - Os 3 parsers antigos continuam onde estão; as Tasks 14 e 15 é que trocam as telas para `lerXmlFiscal`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/web/src/lib/nfe-xml.test.js`:

```js
import { describe, it, expect } from "vitest";
import { lerXmlFiscal, textoDoXml } from "./nfe-xml";

// Amostras no leiaute oficial de cada documento, anonimizadas (CNPJ/CPF de exemplo, nomes fictícios).

const NFE_40_COM_DUPLICATAS = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">
  <NFe xmlns="http://www.portalfiscal.inf.br/nfe">
    <infNFe Id="NFe35260911222333000181550010000012341123456787" versao="4.00">
      <ide>
        <cUF>35</cUF><cNF>12345678</cNF><natOp>VENDA DE MERCADORIA</natOp><mod>55</mod>
        <serie>1</serie><nNF>1234</nNF><dhEmi>2026-09-10T10:15:00-03:00</dhEmi>
        <tpNF>1</tpNF><tpAmb>1</tpAmb>
      </ide>
      <emit>
        <CNPJ>11222333000181</CNPJ>
        <xNome>ELETRICA M&amp;M LTDA</xNome>
        <xFant>M&amp;M</xFant>
        <enderEmit>
          <xLgr>RUA DAS FLORES</xLgr><nro>100</nro><xBairro>CENTRO</xBairro>
          <cMun>3550308</cMun><xMun>SAO PAULO</xMun><UF>SP</UF><CEP>01001000</CEP>
        </enderEmit>
        <IE>123456789110</IE><CRT>3</CRT>
      </emit>
      <dest>
        <CNPJ>11444777000161</CNPJ>
        <xNome>CONSTRUTORA EXEMPLO LTDA</xNome>
        <indIEDest>1</indIEDest>
      </dest>
      <det nItem="1">
        <prod>
          <cProd>CAB-25</cProd><cEAN>7891234567895</cEAN><xProd>CABO FLEXIVEL 2,5MM</xProd>
          <NCM>85444900</NCM><CFOP>5102</CFOP><uCom>RL</uCom><qCom>2.0000</qCom>
          <vUnCom>150.0000000000</vUnCom><vProd>300.00</vProd>
        </prod>
        <imposto><ICMS><ICMS00><orig>0</orig><CST>00</CST><vICMS>54.00</vICMS></ICMS00></ICMS></imposto>
      </det>
      <det nItem="2">
        <prod>
          <cProd>DIS-20</cProd><cEAN>SEM GTIN</cEAN><xProd>DISJUNTOR 20A</xProd>
          <NCM>85362000</NCM><CFOP>5102</CFOP><uCom>UN</uCom><qCom>10.0000</qCom>
          <vUnCom>0.0100000000</vUnCom><vProd>0.10</vProd>
        </prod>
      </det>
      <total><ICMSTot><vBC>300.10</vBC><vICMS>54.00</vICMS><vProd>300.10</vProd><vNF>300.10</vNF></ICMSTot></total>
      <cobr>
        <fat><nFat>1234</nFat><vOrig>300.10</vOrig><vDesc>0.00</vDesc><vLiq>300.10</vLiq></fat>
        <dup><nDup>002</nDup><dVenc>2026-11-10</dVenc><vDup>100.00</vDup></dup>
        <dup><nDup>001</nDup><dVenc>2026-10-10</dVenc><vDup>100.10</vDup></dup>
        <dup><nDup>003</nDup><dVenc>2026-12-10</dVenc><vDup>100.00</vDup></dup>
      </cobr>
      <pag>
        <detPag><tPag>90</tPag><vPag>0.00</vPag></detPag>
        <detPag><indPag>1</indPag><tPag>15</tPag><vPag>300.10</vPag></detPag>
      </pag>
    </infNFe>
  </NFe>
  <protNFe versao="4.00">
    <infProt>
      <tpAmb>1</tpAmb><chNFe>35260911222333000181550010000012341123456787</chNFe>
      <nProt>135260000000001</nProt><cStat>100</cStat>
    </infProt>
  </protNFe>
</nfeProc>`;

// NF-e só com o <NFe> (sem nfeProc/protNFe), com PREFIXO de namespace e destinatário CPF
const NFE_SEM_PROTOCOLO = `<ns0:NFe xmlns:ns0="http://www.portalfiscal.inf.br/nfe">
  <ns0:infNFe versao="4.00" Id="NFe31260911444777000161550010000000771876543213">
    <ns0:ide><ns0:mod>55</ns0:mod><ns0:nNF>77</ns0:nNF><ns0:dhEmi>2026-09-01T08:00:00-03:00</ns0:dhEmi><ns0:tpAmb>2</ns0:tpAmb></ns0:ide>
    <ns0:emit><ns0:CNPJ>11444777000161</ns0:CNPJ><ns0:xNome>FERRAGENS &#xC1;GUIA LTDA</ns0:xNome><ns0:IE>ISENTO</ns0:IE></ns0:emit>
    <ns0:dest><ns0:CPF>12345678909</ns0:CPF><ns0:xNome>Jos&#233; da Silva</ns0:xNome></ns0:dest>
    <ns0:total><ns0:ICMSTot><ns0:vNF>89.90</ns0:vNF></ns0:ICMSTot></ns0:total>
    <ns0:cobr><ns0:dup><ns0:nDup>001</ns0:nDup><ns0:dVenc>2026-10-01</ns0:dVenc><ns0:vDup>50.00</ns0:vDup></ns0:dup></ns0:cobr>
    <ns0:pag><ns0:detPag><ns0:tPag>17</ns0:tPag><ns0:vPag>89.90</ns0:vPag></ns0:detPag></ns0:pag>
  </ns0:infNFe>
</ns0:NFe>`;

// NF-e 2.0: data em <dEmi>, sem <pag>, <cEAN/> vazio, com comentário
const NFE_20 = `<?xml version="1.0" encoding="UTF-8"?>
<!-- exportado pelo emissor antigo -->
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="2.00">
  <NFe><infNFe Id="NFe31120511222333000181550010000004561000004564" versao="2.00">
    <ide><mod>55</mod><nNF>456</nNF><dEmi>2012-05-10</dEmi><indPag>0</indPag></ide>
    <emit><CNPJ>11222333000181</CNPJ><xNome>DISTRIBUIDORA ANTIGA LTDA</xNome></emit>
    <det nItem="1"><prod><cProd>1</cProd><cEAN/><xProd>LAMPADA 100W</xProd><uCom>PC</uCom><qCom>5</qCom><vUnCom>10</vUnCom><vProd>50.00</vProd></prod></det>
    <total><ICMSTot><vNF>50.00</vNF></ICMSTot></total>
  </infNFe></NFe>
  <protNFe versao="2.00"><infProt><chNFe>31120511222333000181550010000004561000004564</chNFe></infProt></protNFe>
</nfeProc>`;

// NFC-e (modelo 65), pago no cartão, sem destinatário
const NFCE = `<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe><infNFe Id="NFe31260911222333000181650010000098761111122229" versao="4.00">
    <ide><mod>65</mod><nNF>9876</nNF><dhEmi>2026-09-15T18:40:00-03:00</dhEmi></ide>
    <emit><CNPJ>11222333000181</CNPJ><xNome>POSTO EXEMPLO LTDA</xNome></emit>
    <det nItem="1"><prod><cProd>GAS</cProd><cEAN>SEM GTIN</cEAN><xProd>GASOLINA COMUM</xProd><NCM>27101259</NCM><uCom>L</uCom><qCom>40.0000</qCom><vUnCom>6.2900000000</vUnCom><vProd>251.60</vProd></prod></det>
    <total><ICMSTot><vNF>251.60</vNF></ICMSTot></total>
    <pag><detPag><tPag>03</tPag><vPag>251.60</vPag><card><tpIntegra>2</tpIntegra></card></detPag></pag>
  </infNFe>
  <infNFeSupl><qrCode><![CDATA[https://portalsped.fazenda.mg.gov.br/portalnfce/sistema/qrcode.xhtml?p=3126]]></qrCode></infNFeSupl>
  </NFe>
  <protNFe versao="4.00"><infProt><chNFe>31260911222333000181650010000098761111122229</chNFe></infProt></protNFe>
</nfeProc>`;

// NFS-e ABRASF 1.0: Endereco dentro de Endereco e <Numero> também no RPS
const NFSE_ABRASF_1 = `<?xml version="1.0" encoding="utf-8"?>
<CompNfse xmlns="http://www.abrasf.org.br/nfse.xsd">
  <Nfse versao="1.00">
    <InfNfse Id="nfse2026123">
      <Numero>2026000000123</Numero>
      <CodigoVerificacao>AB12CD34</CodigoVerificacao>
      <DataEmissao>2026-09-12T14:30:00</DataEmissao>
      <IdentificacaoRps><Numero>45</Numero><Serie>A</Serie><Tipo>1</Tipo></IdentificacaoRps>
      <Servico>
        <Valores><ValorServicos>1500.00</ValorServicos><ValorIss>75.00</ValorIss><ValorLiquidoNfse>1425.00</ValorLiquidoNfse></Valores>
        <ItemListaServico>7.02</ItemListaServico>
        <Discriminacao>Manuten&#231;&#227;o de ilumina&#231;&#227;o p&#250;blica - setembro/2026</Discriminacao>
      </Servico>
      <PrestadorServico>
        <IdentificacaoPrestador><Cnpj>11.222.333/0001-81</Cnpj><InscricaoMunicipal>12345</InscricaoMunicipal></IdentificacaoPrestador>
        <RazaoSocial>SERVICOS ELETRICOS EXEMPLO LTDA</RazaoSocial>
        <Endereco><Endereco>AV BRASIL</Endereco><Numero>500</Numero><Complemento>SALA 2</Complemento><Bairro>CENTRO</Bairro><CodigoMunicipio>3104007</CodigoMunicipio><Uf>MG</Uf><Cep>38183000</Cep></Endereco>
      </PrestadorServico>
      <TomadorServico>
        <IdentificacaoTomador><CpfCnpj><Cnpj>11444777000161</Cnpj></CpfCnpj></IdentificacaoTomador>
        <RazaoSocial>MUNICIPIO DE EXEMPLO</RazaoSocial>
      </TomadorServico>
    </InfNfse>
  </Nfse>
</CompNfse>`;

// NFS-e ABRASF 2.x: CNPJ do prestador só em DeclaracaoPrestacaoServico/Prestador; nota cancelada
const NFSE_ABRASF_2 = `<ConsultarNfseResposta xmlns="http://www.abrasf.org.br/nfse.xsd"><ListaNfse><CompNfse>
  <Nfse versao="2.02"><InfNfse Id="N55">
    <Numero>55</Numero><DataEmissao>2026-08-30T09:00:00</DataEmissao>
    <PrestadorServico><RazaoSocial>CONSULTORIA MODELO LTDA</RazaoSocial></PrestadorServico>
    <DeclaracaoPrestacaoServico><InfDeclaracaoPrestacaoServico>
      <Servico><Valores><ValorServicos>800.5</ValorServicos></Valores><Discriminacao>Projeto</Discriminacao></Servico>
      <Prestador><CpfCnpj><Cnpj>11222333000181</Cnpj></CpfCnpj></Prestador>
      <Tomador><IdentificacaoTomador><CpfCnpj><Cpf>12345678909</Cpf></CpfCnpj></IdentificacaoTomador><RazaoSocial>JOSE DA SILVA</RazaoSocial></Tomador>
    </InfDeclaracaoPrestacaoServico></DeclaracaoPrestacaoServico>
  </InfNfse></Nfse>
  <NfseCancelamento><Confirmacao><DataHora>2026-08-31T10:00:00</DataHora></Confirmacao></NfseCancelamento>
</CompNfse></ListaNfse></ConsultarNfseResposta>`;

// NFS-e do padrão nacional (Emissor Nacional / SPED)
const NFSE_NACIONAL = `<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00">
  <infNFSe Id="NFS31040072211222333000181000000000001226090000000000">
    <xLocEmi>Araxá</xLocEmi><nNFSe>12</nNFSe><dhProc>2026-09-20T11:00:00-03:00</dhProc>
    <emit><CNPJ>11222333000181</CNPJ><xNome>ENGENHARIA EXEMPLO LTDA</xNome>
      <enderNac><xLgr>RUA A</xLgr><nro>10</nro><xBairro>CENTRO</xBairro><cMun>3104007</cMun><UF>MG</UF><CEP>38183000</CEP></enderNac>
    </emit>
    <valores><vLiq>1900.00</vLiq></valores>
    <DPS versao="1.00"><infDPS Id="DPS1">
      <dhEmi>2026-09-19T16:00:00-03:00</dhEmi>
      <toma><CNPJ>11444777000161</CNPJ><xNome>CLIENTE NACIONAL LTDA</xNome></toma>
      <serv><cServ><cTribNac>070201</cTribNac><xDescServ>Laudo técnico</xDescServ></cServ></serv>
      <valores><vServPrest><vServ>2000.00</vServ></vServPrest></valores>
    </infDPS></DPS>
  </infNFSe>
</NFSe>`;

describe("lerXmlFiscal — NF-e 4.0 completa", () => {
  const doc = lerXmlFiscal(NFE_40_COM_DUPLICATAS);

  it("cabeçalho, emitente (com entidade decodificada), destinatário e total", () => {
    expect(doc).toMatchObject({
      origem: "xml",
      tipo: "nfe",
      numero: "1234",
      chave: "35260911222333000181550010000012341123456787",
      data_emissao: "2026-09-10",
      valor_total: 300.1,
      emitente: {
        nome: "ELETRICA M&M LTDA",
        documento: "11222333000181",
        ie: "123456789110",
        endereco: "RUA DAS FLORES, 100 - CENTRO - SAO PAULO/SP - CEP 01001-000",
      },
      destinatario: { nome: "CONSTRUTORA EXEMPLO LTDA", documento: "11444777000161" },
      descricao: "VENDA DE MERCADORIA",
      avisos: [],
      duvidosos: [],
    });
  });

  it("duplicatas viram vencimentos em ordem de data", () => {
    expect(doc.vencimentos).toEqual([
      { numero: "001", data: "2026-10-10", valor: 100.1 },
      { numero: "002", data: "2026-11-10", valor: 100 },
      { numero: "003", data: "2026-12-10", valor: 100 },
    ]);
  });

  it("forma de pagamento pelo detPag de maior valor (15 = boleto; 90 é ignorado)", () => {
    expect(doc.forma_pagamento).toBe("boleto");
  });

  it("itens det/prod com EAN (SEM GTIN vira null) e NCM", () => {
    expect(doc.itens).toEqual([
      {
        descricao: "CABO FLEXIVEL 2,5MM",
        codigo: "CAB-25",
        ean: "7891234567895",
        ncm: "85444900",
        unidade: "RL",
        quantidade: 2,
        valor_unitario: 150,
        valor_total: 300,
      },
      {
        descricao: "DISJUNTOR 20A",
        codigo: "DIS-20",
        ean: null,
        ncm: "85362000",
        unidade: "UN",
        quantidade: 10,
        valor_unitario: 0.01,
        valor_total: 0.1,
      },
    ]);
  });
});

describe("lerXmlFiscal — outras NF-e", () => {
  it("sem protNFe e com prefixo de namespace: chave pelo Id, avisos de protocolo, homologação e duplicatas", () => {
    const doc = lerXmlFiscal(NFE_SEM_PROTOCOLO);
    expect(doc).toMatchObject({
      tipo: "nfe",
      numero: "77",
      chave: "31260911444777000161550010000000771876543213",
      data_emissao: "2026-09-01",
      valor_total: 89.9,
      emitente: {
        nome: "FERRAGENS ÁGUIA LTDA",
        documento: "11444777000161",
        ie: "ISENTO",
        endereco: null,
      },
      destinatario: { nome: "José da Silva", documento: "12345678909" },
      vencimentos: [{ numero: "001", data: "2026-10-01", valor: 50 }],
      forma_pagamento: "pix",
      itens: [],
    });
    expect(doc.avisos).toEqual([
      "XML sem o protocolo de autorização da SEFAZ: confira se a nota foi autorizada.",
      "Nota emitida em ambiente de homologação (sem valor fiscal).",
      "A soma das duplicatas (R$ 50,00) é diferente do total da nota (R$ 89,90).",
    ]);
  });

  it("NF-e 2.0 com dEmi, sem pag e com cEAN vazio", () => {
    const doc = lerXmlFiscal(NFE_20);
    expect(doc).toMatchObject({
      tipo: "nfe",
      numero: "456",
      chave: "31120511222333000181550010000004561000004564",
      data_emissao: "2012-05-10",
      valor_total: 50,
      emitente: { nome: "DISTRIBUIDORA ANTIGA LTDA", documento: "11222333000181", ie: null },
      destinatario: { nome: null, documento: null },
      vencimentos: [],
      forma_pagamento: null,
      avisos: [],
    });
    expect(doc.itens).toEqual([
      {
        descricao: "LAMPADA 100W",
        codigo: "1",
        ean: null,
        ncm: null,
        unidade: "PC",
        quantidade: 5,
        valor_unitario: 10,
        valor_total: 50,
      },
    ]);
  });

  it("NFC-e (modelo 65) no cartão, com CDATA no QR Code", () => {
    const doc = lerXmlFiscal(NFCE);
    expect(doc).toMatchObject({
      tipo: "nfce",
      numero: "9876",
      chave: "31260911222333000181650010000098761111122229",
      data_emissao: "2026-09-15",
      valor_total: 251.6,
      emitente: { nome: "POSTO EXEMPLO LTDA", documento: "11222333000181" },
      destinatario: { nome: null, documento: null },
      forma_pagamento: "cartao",
    });
    expect(doc.itens).toHaveLength(1);
    expect(doc.itens[0]).toMatchObject({ descricao: "GASOLINA COMUM", ean: null, quantidade: 40 });
  });
});

describe("lerXmlFiscal — NFS-e", () => {
  it("ABRASF 1.0: número da nota (não o do RPS), prestador e tomador", () => {
    const doc = lerXmlFiscal(NFSE_ABRASF_1);
    expect(doc).toEqual({
      origem: "xml",
      tipo: "nfse",
      numero: "2026000000123",
      chave: null,
      data_emissao: "2026-09-12",
      valor_total: 1500,
      emitente: {
        nome: "SERVICOS ELETRICOS EXEMPLO LTDA",
        documento: "11222333000181",
        ie: null,
        endereco: "AV BRASIL, 500 - SALA 2 - CENTRO - MG - CEP 38183-000",
      },
      destinatario: { nome: "MUNICIPIO DE EXEMPLO", documento: "11444777000161" },
      vencimentos: [],
      forma_pagamento: null,
      descricao: "Manutenção de iluminação pública - setembro/2026",
      itens: [],
      avisos: [],
      duvidosos: [],
    });
  });

  it("ABRASF 2.x: CNPJ do prestador na declaração, tomador CPF e aviso de cancelada", () => {
    const doc = lerXmlFiscal(NFSE_ABRASF_2);
    expect(doc).toMatchObject({
      tipo: "nfse",
      numero: "55",
      data_emissao: "2026-08-30",
      valor_total: 800.5,
      emitente: { nome: "CONSULTORIA MODELO LTDA", documento: "11222333000181", endereco: null },
      destinatario: { nome: "JOSE DA SILVA", documento: "12345678909" },
      descricao: "Projeto",
      avisos: ["Esta NFS-e consta como CANCELADA no XML."],
    });
  });

  it("padrão nacional: nNFSe, emitente, tomador e valor do serviço", () => {
    const doc = lerXmlFiscal(NFSE_NACIONAL);
    expect(doc).toMatchObject({
      tipo: "nfse",
      numero: "12",
      chave: null,
      data_emissao: "2026-09-19",
      valor_total: 2000,
      emitente: {
        nome: "ENGENHARIA EXEMPLO LTDA",
        documento: "11222333000181",
        endereco: "RUA A, 10 - CENTRO - MG - CEP 38183-000",
      },
      destinatario: { nome: "CLIENTE NACIONAL LTDA", documento: "11444777000161" },
      descricao: "Laudo técnico",
      avisos: [],
    });
  });
});

describe("textoDoXml", () => {
  it("respeita o encoding ISO-8859-1 do cabeçalho e lê UTF-8 sem cabeçalho", async () => {
    const codigos = (t) => [...t].map((c) => c.charCodeAt(0));
    const latin1 = Uint8Array.from([
      ...codigos('<?xml version="1.0" encoding="ISO-8859-1"?><x>S'),
      0xe3,
      ...codigos("o Paulo</x>"),
    ]);
    const arquivo = (bytes) => ({ arrayBuffer: async () => bytes.buffer });
    expect(await textoDoXml(arquivo(latin1))).toContain("<x>São Paulo</x>");
    const utf8 = new TextEncoder().encode("<x>São Paulo</x>");
    expect(await textoDoXml(arquivo(utf8))).toBe("<x>São Paulo</x>");
  });
});

describe("lerXmlFiscal — entradas inválidas", () => {
  it.each([
    ["vazio", ""],
    ["null", null],
    ["texto que não é XML", "isto não é um XML"],
    ["tag sem fechamento", "<nfeProc><NFe><infNFe></NFe></nfeProc>"],
    ["XML truncado", NFE_40_COM_DUPLICATAS.slice(0, 900)],
    ["duas raízes", "<a/><b/>"],
    [
      "XML de outro tipo (evento)",
      "<procEventoNFe><evento><infEvento><chNFe>1</chNFe></infEvento></evento></procEventoNFe>",
    ],
  ])("%s → null", (_nome, entrada) => {
    expect(lerXmlFiscal(entrada)).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd apps/web && npx vitest run src/lib/nfe-xml.test.js`
Expected (FAIL, o módulo ainda não existe):

```
 FAIL  src/lib/nfe-xml.test.js [ src/lib/nfe-xml.test.js ]
Error: Cannot find module './nfe-xml' imported from '.../apps/web/src/lib/nfe-xml.test.js'
 Test Files  1 failed (1)
      Tests  no tests
```

- [ ] **Step 3: Implementar o leitor**

Criar `apps/web/src/lib/nfe-xml.js`:

```js
/**
 * nfe-xml — leitura de XML fiscal SEM IA e SEM DOMParser (os testes rodam no
 * Node): NF-e 4.0/2.0 (modelo 55), NFC-e (modelo 65), NFS-e ABRASF (1.x e
 * 2.x) e NFS-e do padrão nacional.
 *
 * `lerXmlFiscal(texto)` devolve o `DocumentoFiscal` comum (o mesmo formato
 * que a leitura por IA devolve, ver documento-financeiro.js) ou null quando o
 * arquivo não é XML bem formado ou não é de um desses tipos — quem chama avisa.
 *
 * Os nomes de tag são comparados sem o prefixo de namespace e sem diferenciar
 * maiúsculas ("ns2:InfNfse" = "infnfse"): cada prefeitura/emissor gera de um
 * jeito.
 */

// ---------------------------------------------------------------------------
// Mini-leitor de XML: árvore { nome, qnome, attrs, filhos, texto }
// ---------------------------------------------------------------------------

const ENTIDADES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodificar(s) {
  return s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const hex = e[1] === "x" || e[1] === "X";
      const cp = hex ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    }
    const k = e.toLowerCase();
    return Object.prototype.hasOwnProperty.call(ENTIDADES, k) ? ENTIDADES[k] : m;
  });
}

const semPrefixo = (nome) => nome.slice(nome.indexOf(":") + 1);

/** Índice do ">" que fecha a tag (ignora ">" dentro de valores de atributo). */
function fimDaTag(s, desde) {
  let aspas = "";
  for (let j = desde; j < s.length; j++) {
    const c = s[j];
    if (aspas) {
      if (c === aspas) aspas = "";
    } else if (c === '"' || c === "'") {
      aspas = c;
    } else if (c === ">") {
      return j;
    }
  }
  return -1;
}

function depoisDe(s, marca, desde) {
  const f = s.indexOf(marca, desde);
  if (f === -1) throw new Error(`XML sem "${marca}"`);
  return f + marca.length;
}

function lerAtributos(s) {
  const attrs = {};
  const re = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(s))) attrs[semPrefixo(m[1]).toLowerCase()] = decodificar(m[2] ?? m[3]);
  return attrs;
}

/** Lê o XML e devolve o elemento raiz. Lança em XML malformado. */
function lerArvore(texto) {
  const s = texto.replace(/^﻿/, "");
  const documento = { nome: "#documento", qnome: "", attrs: {}, filhos: [], texto: "" };
  const pilha = [documento];
  const atual = () => pilha[pilha.length - 1];
  let i = 0;
  while (i < s.length) {
    const lt = s.indexOf("<", i);
    const fimTexto = lt === -1 ? s.length : lt;
    if (fimTexto > i) atual().texto += decodificar(s.slice(i, fimTexto));
    if (lt === -1) break;
    if (s.startsWith("<!--", lt)) {
      i = depoisDe(s, "-->", lt + 4);
    } else if (s.startsWith("<![CDATA[", lt)) {
      i = depoisDe(s, "]]>", lt + 9);
      atual().texto += s.slice(lt + 9, i - 3);
    } else if (s.startsWith("<?", lt)) {
      i = depoisDe(s, "?>", lt + 2);
    } else if (s.startsWith("<!", lt)) {
      i = depoisDe(s, ">", lt + 2); // DOCTYPE simples
    } else {
      const gt = fimDaTag(s, lt + 1);
      if (gt === -1) throw new Error("tag sem fim");
      let corpo = s.slice(lt + 1, gt);
      i = gt + 1;
      if (corpo[0] === "/") {
        const qnome = corpo.slice(1).trim();
        const topo = pilha.pop();
        if (pilha.length === 0 || topo.qnome !== qnome) {
          throw new Error(`fechamento inesperado </${qnome}>`);
        }
        continue;
      }
      const vazio = corpo.endsWith("/");
      if (vazio) corpo = corpo.slice(0, -1);
      const m = /^([^\s/<>"'=]+)([\s\S]*)$/.exec(corpo);
      if (!m) throw new Error("tag inválida");
      const el = {
        nome: semPrefixo(m[1]).toLowerCase(),
        qnome: m[1],
        attrs: lerAtributos(m[2]),
        filhos: [],
        texto: "",
      };
      atual().filhos.push(el);
      if (!vazio) pilha.push(el);
    }
  }
  if (pilha.length !== 1) throw new Error("tag sem fechamento");
  if (documento.filhos.length !== 1 || documento.texto.trim()) {
    throw new Error("não é um documento XML");
  }
  return documento.filhos[0];
}

// ---------------------------------------------------------------------------
// Navegação e conversão de valores
// ---------------------------------------------------------------------------

/** 1º filho direto com esse nome. */
function filho(el, nome) {
  if (!el) return null;
  const n = nome.toLowerCase();
  return el.filhos.find((f) => f.nome === n) || null;
}

function filhos(el, nome) {
  if (!el) return [];
  const n = nome.toLowerCase();
  return el.filhos.filter((f) => f.nome === n);
}

/** 1º descendente (em ordem de documento) com esse nome. */
function busca(el, nome) {
  if (!el) return null;
  const n = nome.toLowerCase();
  const pendentes = [...el.filhos].reverse();
  while (pendentes.length) {
    const f = pendentes.pop();
    if (f.nome === n) return f;
    for (let k = f.filhos.length - 1; k >= 0; k--) pendentes.push(f.filhos[k]);
  }
  return null;
}

/** O próprio elemento, se tiver o nome, senão o 1º descendente. */
const achar = (el, nome) => (el.nome === nome.toLowerCase() ? el : busca(el, nome));

/** Texto do caminho de filhos diretos (espaços colapsados); null se faltar ou vazio. */
function txt(el, ...caminho) {
  let a = el;
  for (const n of caminho) a = filho(a, n);
  const t = a ? a.texto.replace(/\s+/g, " ").trim() : "";
  return t || null;
}

const soDigitos = (v) => String(v ?? "").replace(/\D/g, "");

function numero(v) {
  if (v == null) return null;
  let s = String(v).trim();
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Valor em reais: número ≥ 0 com 2 casas, ou null. */
function valor(v) {
  const n = numero(v);
  return n != null && n >= 0 ? Math.round(n * 100) / 100 : null;
}

/** AAAA-MM-DD (aceita também DD/MM/AAAA e data-hora ISO); null se inválida. */
function dataIso(v) {
  const s = String(v ?? "").trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  const br = iso ? null : /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s);
  if (!iso && !br) return null;
  const [a, m, d] = iso ? [iso[1], iso[2], iso[3]] : [br[3], br[2], br[1]];
  const dt = new Date(Date.UTC(Number(a), Number(m) - 1, Number(d)));
  const ok = dt.getUTCFullYear() === Number(a) && dt.getUTCMonth() === Number(m) - 1 && dt.getUTCDate() === Number(d);
  return ok ? `${a}-${m}-${d}` : null;
}

/** CPF (11) ou CNPJ (14) só com dígitos; senão null. */
function documentoDe(v) {
  const d = soDigitos(v);
  return d.length === 11 || d.length === 14 ? d : null;
}

function montarEndereco({ logradouro, numero: nro, complemento, bairro, cidade, uf, cep }) {
  const rua = [logradouro, nro].filter(Boolean).join(", ");
  const cepDig = soDigitos(cep);
  const cepFmt = cepDig.length === 8 ? `CEP ${cepDig.slice(0, 5)}-${cepDig.slice(5)}` : null;
  const local = [cidade, uf].filter(Boolean).join("/");
  const partes = [rua, complemento, bairro, local, cepFmt].filter(Boolean);
  return partes.length ? partes.join(" - ") : null;
}

const reais = (n) => `R$ ${n.toFixed(2).replace(".", ",")}`;

function documentoVazio() {
  return {
    origem: "xml",
    tipo: "outro",
    numero: null,
    chave: null,
    data_emissao: null,
    valor_total: null,
    emitente: { nome: null, documento: null, ie: null, endereco: null },
    destinatario: { nome: null, documento: null },
    vencimentos: [],
    forma_pagamento: null,
    descricao: null,
    itens: [],
    avisos: [],
    duvidosos: [],
  };
}

// ---------------------------------------------------------------------------
// NF-e / NFC-e
// ---------------------------------------------------------------------------

// tPag da NF-e → forma de pagamento da tela (demais códigos: sem forma)
const FORMA_POR_TPAG = {
  "01": "dinheiro",
  "03": "cartao",
  "04": "cartao",
  15: "boleto",
  16: "transferencia",
  17: "pix",
  18: "transferencia",
  20: "pix",
};

/** Forma do pagamento de maior valor que tenha correspondência (pag/detPag/tPag). */
function formaDePagamento(infNFe) {
  let melhor = null;
  for (const pag of filhos(infNFe, "pag")) {
    // 4.0: pag/detPag/tPag · 3.10: vários <pag> com tPag direto
    const dets = filhos(pag, "detPag").length ? filhos(pag, "detPag") : [pag];
    for (const det of dets) {
      const forma = FORMA_POR_TPAG[(txt(det, "tPag") || "").padStart(2, "0")];
      const v = valor(txt(det, "vPag")) ?? 0;
      if (forma && (!melhor || v > melhor.v)) melhor = { forma, v };
    }
  }
  return melhor ? melhor.forma : null;
}

function lerNfe(raiz, inf) {
  const ide = filho(inf, "ide");
  const emit = filho(inf, "emit");
  const dest = filho(inf, "dest");
  const ender = filho(emit, "enderEmit");
  const chave =
    [soDigitos(txt(busca(raiz, "infProt"), "chNFe")), soDigitos(inf.attrs.id)].find((c) => c.length === 44) || null;

  const vencimentos = filhos(filho(inf, "cobr"), "dup")
    .map((d) => ({
      numero: txt(d, "nDup"),
      data: dataIso(txt(d, "dVenc")),
      valor: valor(txt(d, "vDup")),
    }))
    .filter((d) => d.data && d.valor != null)
    .sort((a, b) => a.data.localeCompare(b.data));

  const itens = filhos(inf, "det")
    .map((det) => {
      const p = filho(det, "prod");
      return {
        descricao: txt(p, "xProd") || "",
        codigo: txt(p, "cProd"),
        ean: soDigitos(txt(p, "cEAN")) || null,
        ncm: txt(p, "NCM"),
        unidade: txt(p, "uCom"),
        quantidade: numero(txt(p, "qCom")),
        valor_unitario: numero(txt(p, "vUnCom")),
        valor_total: valor(txt(p, "vProd")),
      };
    })
    .filter((item) => item.descricao);

  const valorTotal = valor(txt(busca(inf, "ICMSTot"), "vNF"));

  const avisos = [];
  if (!busca(raiz, "protNFe")) {
    avisos.push("XML sem o protocolo de autorização da SEFAZ: confira se a nota foi autorizada.");
  }
  if (txt(ide, "tpAmb") === "2") {
    avisos.push("Nota emitida em ambiente de homologação (sem valor fiscal).");
  }
  if (vencimentos.length && valorTotal != null) {
    const soma = vencimentos.reduce((s, v) => s + v.valor, 0);
    if (Math.abs(soma - valorTotal) > 0.05) {
      avisos.push(`A soma das duplicatas (${reais(soma)}) é diferente do total da nota (${reais(valorTotal)}).`);
    }
  }

  return {
    ...documentoVazio(),
    tipo: txt(ide, "mod") === "65" ? "nfce" : "nfe",
    numero: txt(ide, "nNF"),
    chave,
    data_emissao: dataIso(txt(ide, "dhEmi") || txt(ide, "dEmi")),
    valor_total: valorTotal,
    emitente: {
      nome: txt(emit, "xNome"),
      documento: documentoDe(txt(emit, "CNPJ") || txt(emit, "CPF")),
      ie: txt(emit, "IE"),
      endereco: montarEndereco({
        logradouro: txt(ender, "xLgr"),
        numero: txt(ender, "nro"),
        complemento: txt(ender, "xCpl"),
        bairro: txt(ender, "xBairro"),
        cidade: txt(ender, "xMun"),
        uf: txt(ender, "UF"),
        cep: txt(ender, "CEP"),
      }),
    },
    destinatario: {
      nome: txt(dest, "xNome"),
      documento: documentoDe(txt(dest, "CNPJ") || txt(dest, "CPF")),
    },
    vencimentos,
    forma_pagamento: formaDePagamento(inf),
    descricao: txt(ide, "natOp"),
    itens,
    avisos,
  };
}

// ---------------------------------------------------------------------------
// NFS-e
// ---------------------------------------------------------------------------

/** 1º valor não vazio de fn(el) entre os elementos. */
function primeiro(els, fn) {
  for (const el of els) {
    const v = fn(el);
    if (v) return v;
  }
  return null;
}

const cnpjOuCpf = (el) => documentoDe(txt(busca(el, "Cnpj")) || txt(busca(el, "Cpf")));

function lerNfseAbrasf(raiz, inf) {
  // 1.x: InfNfse/PrestadorServico (com IdentificacaoPrestador/Cnpj)
  // 2.x: o CNPJ fica em .../InfDeclaracaoPrestacaoServico/Prestador/CpfCnpj
  const prestadores = [busca(inf, "PrestadorServico"), busca(inf, "Prestador")].filter(Boolean);
  const tomadores = [busca(inf, "TomadorServico"), busca(inf, "Tomador")].filter(Boolean);
  const end = primeiro(prestadores, (p) => filho(p, "Endereco"));
  const comp = achar(raiz, "CompNfse") || raiz;
  const descricao = txt(busca(inf, "Discriminacao"));

  return {
    ...documentoVazio(),
    tipo: "nfse",
    numero: txt(inf, "Numero"),
    data_emissao: dataIso(txt(inf, "DataEmissao") || txt(busca(inf, "DataEmissao"))),
    valor_total: valor(txt(busca(inf, "ValorServicos"))),
    emitente: {
      nome: primeiro(prestadores, (p) => txt(p, "RazaoSocial")),
      documento: primeiro(prestadores, cnpjOuCpf),
      ie: null,
      endereco: end
        ? montarEndereco({
            logradouro: txt(end, "Endereco"),
            numero: txt(end, "Numero"),
            complemento: txt(end, "Complemento"),
            bairro: txt(end, "Bairro"),
            cidade: null,
            uf: txt(end, "Uf"),
            cep: txt(end, "Cep"),
          })
        : null,
    },
    destinatario: {
      nome: primeiro(tomadores, (t) => txt(t, "RazaoSocial")),
      documento: primeiro(tomadores, cnpjOuCpf),
    },
    descricao: descricao ? descricao.slice(0, 500) : null,
    avisos: busca(comp, "NfseCancelamento") ? ["Esta NFS-e consta como CANCELADA no XML."] : [],
  };
}

/** NFS-e do padrão nacional (NFSe/infNFSe, com a DPS dentro). */
function lerNfseNacional(inf) {
  const emit = filho(inf, "emit");
  const ender = filho(emit, "enderNac");
  const dps = busca(inf, "infDPS");
  const toma = filho(dps, "toma");
  const descricao = txt(busca(dps, "xDescServ"));

  return {
    ...documentoVazio(),
    tipo: "nfse",
    numero: txt(inf, "nNFSe"),
    data_emissao: dataIso(txt(dps, "dhEmi") || txt(inf, "dhProc")),
    valor_total: valor(txt(busca(dps, "vServPrest"), "vServ")),
    emitente: {
      nome: txt(emit, "xNome"),
      documento: documentoDe(txt(emit, "CNPJ") || txt(emit, "CPF")),
      ie: null,
      endereco: montarEndereco({
        logradouro: txt(ender, "xLgr"),
        numero: txt(ender, "nro"),
        complemento: txt(ender, "xCpl"),
        bairro: txt(ender, "xBairro"),
        cidade: null,
        uf: txt(ender, "UF"),
        cep: txt(ender, "CEP"),
      }),
    },
    destinatario: {
      nome: txt(toma, "xNome"),
      documento: documentoDe(txt(toma, "CNPJ") || txt(toma, "CPF")),
    },
    descricao: descricao ? descricao.slice(0, 500) : null,
  };
}

// ---------------------------------------------------------------------------

/**
 * Lê o texto de um XML fiscal e devolve o DocumentoFiscal (origem "xml"),
 * ou null se não for NF-e, NFC-e ou NFS-e legível.
 * @param {string} texto
 */
/**
 * Texto do arquivo XML respeitando o encoding do cabeçalho
 * (<?xml … encoding="ISO-8859-1"?>, comum em NFS-e de prefeituras). Sem cabeçalho
 * ou com encoding desconhecido, lê como UTF-8. `arquivo` é um File/Blob.
 */
export async function textoDoXml(arquivo) {
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const cabeca = new TextDecoder("latin1").decode(bytes.slice(0, 200));
  const m = /encoding=["']([\w.:-]+)["']/i.exec(cabeca);
  const encoding = (m?.[1] || "utf-8").toLowerCase();
  try {
    return new TextDecoder(encoding).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

export function lerXmlFiscal(texto) {
  if (typeof texto !== "string" || !texto.trim()) return null;
  try {
    const raiz = lerArvore(texto);
    const infNFe = achar(raiz, "infNFe");
    if (infNFe) return lerNfe(raiz, infNFe);
    const infNfse = achar(raiz, "InfNfse"); // também casa o infNFSe do padrão nacional
    if (infNfse) {
      return filho(infNfse, "nNFSe") ? lerNfseNacional(infNfse) : lerNfseAbrasf(raiz, infNfse);
    }
    return null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd apps/web && npx vitest run src/lib/nfe-xml.test.js`
Expected (PASS):

```
 ✓ src/lib/nfe-xml.test.js (18 tests)
 Test Files  1 passed (1)
      Tests  18 passed (18)
```

- [ ] **Step 5: Regressão do front**

Run: `cd apps/web && npx vitest run`
Expected: nenhuma falha; +1 arquivo e +18 testes em relação à contagem anterior (em 28/09: `Test Files 16 passed (16)`, `Tests 153 passed (153)`, já contando a Task 7).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/nfe-xml.js apps/web/src/lib/nfe-xml.test.js
git commit -F - <<'EOF'
feat(financeiro): leitor único de XML fiscal (NF-e, NFC-e e NFS-e) sem DOMParser

lerXmlFiscal devolve o DocumentoFiscal comum: NF-e 4.0/2.0, NFC-e (mod 65),
NFS-e ABRASF 1.x/2.x e do padrão nacional; duplicatas viram vencimentos,
tPag vira forma de pagamento, itens det/prod, avisos (sem protocolo,
homologação, duplicatas x total, NFS-e cancelada). XML inválido → null.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log --oneline -1
```

Expected: o lint-staged roda o prettier nos 2 arquivos e o commit sai; `git log` mostra `feat(financeiro): leitor único de XML fiscal (NF-e, NFC-e e NFS-e) sem DOMParser`.

### Task 10: Categorias do fornecedor na lib e `montarPreenchimento`

**Files:**

- Create: `apps/web/src/lib/categorias-fornecedor.js` (~45 linhas)
- Test: `apps/web/src/lib/categorias-fornecedor.test.js` (~45 linhas)
- Modify: `apps/web/src/components/fornecedores/CategoriasFornecedorSelect.jsx` (linha 3 e linhas 18–46)
- Create: `apps/web/src/lib/documento-financeiro.js` (~190 linhas)
- Test: `apps/web/src/lib/documento-financeiro.test.js` (~300 linhas)

**Interfaces:**

- Consumes: o formato `DocumentoFiscal` (produzido por `lerXmlFiscal` da Task 9 e, pela IA, pela Task 12); `normalizarTexto` de `apps/web/src/lib/busca.js`; `limparCnpj` de `apps/web/src/lib/cnpj.js`.
- Produces:
  - `lib/categorias-fornecedor.js`: `chaveCategoria(nome): string`, `listaCategorias(valor): string[]`, `categoriaDoFornecedor(fornecedor, categorias): object | null` — mesmo código e comportamento de hoje. O `CategoriasFornecedorSelect.jsx` importa de lá e **reexporta** `listaCategorias` e `categoriaDoFornecedor` (o `import { categoriaDoFornecedor } from "@/components/fornecedores/CategoriasFornecedorSelect"` do `DespesaModal.jsx`, linha 34, continua valendo; a Task 14 pode trocar para a lib).
  - `lib/documento-financeiro.js`:
    - `montarPreenchimento(doc, { tipo, pessoas = [], categorias = [] })` → `{ patch, parcelas, itens, pessoaSugerida, avisos }` (contrato). `pessoas` = fornecedores (despesa, CPF/CNPJ em `cnpj`) ou clientes (receita, em `documento`); `categorias` = CategoriaFinanceira (só as de tipo Despesa são usadas; sem `tipo` conta como despesa).
    - `acharPessoa(pessoas, { nome, documento }, campoDocumento: "cnpj" | "documento")` → pessoa | null (dígitos primeiro, depois `normalizarTexto` do `nome_razao` com espaços colapsados) — exportado para as importações pela lista das Tasks 14 e 15.
  - Chaves que o `patch` pode trazer (só as que o documento preencheu; a tela faz `setForm(prev => ({ ...prev, ...patch }))`):
    - despesa: `valor` ("1234.56"), `data_competencia`, `data_vencimento`, `forma_pagamento` (dinheiro|pix|transferencia|boleto|cartao), `descricao`, `chave_nfe`, `numero_documento`, `fornecedor_id`, `fornecedor_nome`, `categoria_id`, `categoria_nome`;
    - receita: `valor`, `data_competencia`, `data_vencimento`, `forma_pagamento` (só dinheiro|pix|transferencia|boleto), `descricao`, `cliente_id`, `cliente_nome`.
  - `parcelas` só com 2+ vencimentos (despesa `data_pagamento: null`, receita `""`; `valor` número); `itens` no formato que o `AssociarMateriaisModal` já recebe (`""`/`"UN"`/`0` no lugar de null); `avisos` = cópia de `doc.avisos` (os `duvidosos` a tela lê direto de `doc.duvidosos`).
- Decisões que o contrato não fixava:
  - `numero_documento` = **chave, senão número** (o spec diz "número ou chave", mas a `NotaDevolucaoModal` procura despesas com `numero_documento` de 44 dígitos para referenciar a NF-e, como o importador atual grava).
  - Pessoa não achada → `fornecedor_id: ""` + `fornecedor_nome: <nome lido>` (receita: `cliente_id`/`cliente_nome`) + `pessoaSugerida`. Tira a seleção de outra pessoa que estivesse no formulário e, se o usuário salvar sem cadastrar, o nome lido fica gravado (como a importação antiga de receita fazia).
  - Categoria entra no patch sempre que o fornecedor achado tiver uma que exista em Configurações; se a tela quiser respeitar uma categoria já escolhida (como o combobox faz hoje), é a Task 14 que filtra.
  - Sem `valor_total` (boleto lido pela IA), `valor` = soma dos vencimentos; sem `forma_pagamento`, `tipo:"boleto"` → boleto e `tipo:"comprovante_pix"` → pix.
  - `descricao` = `"<rótulo> <número> - <nome da pessoa>"` (rótulos NF-e, NFC-e, NFS-e, Recibo, Cupom fiscal, Boleto, PIX, Documento); sem nome, usa `doc.descricao`; sem número nem nome nem descrição, não mexe.
  - A receita não recebe `chave_nfe`/`numero_documento` (o `handleSave` da receita não grava esses campos).

- [ ] **Step 1: Escrever o teste das categorias (falha)**

Criar `apps/web/src/lib/categorias-fornecedor.test.js`:

```js
import { describe, it, expect } from "vitest";
import { categoriaDoFornecedor, chaveCategoria, listaCategorias } from "./categorias-fornecedor";

describe("listaCategorias", () => {
  it("aceita lista, JSON em texto e texto separado por vírgula", () => {
    expect(listaCategorias(["Material", "", null, "Serviço"])).toEqual(["Material", "Serviço"]);
    expect(listaCategorias('["Material","Frete"]')).toEqual(["Material", "Frete"]);
    expect(listaCategorias("Material, Frete ,")).toEqual(["Material", "Frete"]);
  });

  it("vazio ou tipo estranho → lista vazia", () => {
    expect(listaCategorias(null)).toEqual([]);
    expect(listaCategorias("   ")).toEqual([]);
    expect(listaCategorias(42)).toEqual([]);
  });
});

describe("categoriaDoFornecedor", () => {
  const categorias = [
    { id: "c1", nome: "Combustível" },
    { id: "c2", nome: "Material Elétrico " },
  ];

  it("1ª categoria do fornecedor que existe em Configurações (sem acento/espaço)", () => {
    const fornecedor = { categorias: '["Frete","material eletrico","Combustivel"]' };
    expect(categoriaDoFornecedor(fornecedor, categorias)).toEqual(categorias[1]);
  });

  it("nenhuma correspondência, fornecedor nulo ou sem categorias → null", () => {
    expect(categoriaDoFornecedor({ categorias: ["Frete"] }, categorias)).toBeNull();
    expect(categoriaDoFornecedor(null, categorias)).toBeNull();
    expect(categoriaDoFornecedor({ categorias: ["Combustível"] }, undefined)).toBeNull();
  });

  it("chaveCategoria normaliza para comparar nomes", () => {
    expect(chaveCategoria("  Pedágio ")).toBe("pedagio");
    expect(chaveCategoria(null)).toBe("");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd apps/web && npx vitest run src/lib/categorias-fornecedor.test.js`
Expected (FAIL):

```
 FAIL  src/lib/categorias-fornecedor.test.js [ src/lib/categorias-fornecedor.test.js ]
Error: Cannot find module './categorias-fornecedor' imported from '.../apps/web/src/lib/categorias-fornecedor.test.js'
 Test Files  1 failed (1)
      Tests  no tests
```

- [ ] **Step 3: Criar a lib das categorias (código movido do componente)**

Criar `apps/web/src/lib/categorias-fornecedor.js`:

```js
/**
 * Categorias do fornecedor ↔ Categorias Financeiras de despesa.
 * Funções puras (sem React), usadas pelo CategoriasFornecedorSelect, pela
 * nova despesa e pelo preenchimento do "Ler documento".
 */
import { normalizarTexto } from "./busca";

/** Chave de comparação de nome de categoria (minúsculas, sem acento, sem espaço nas pontas). */
export const chaveCategoria = (nome) => normalizarTexto(String(nome || "").trim());

/** `categorias` do fornecedor como lista (aceita o legado em texto). */
export function listaCategorias(valor) {
  if (Array.isArray(valor)) return valor.filter(Boolean);
  if (typeof valor === "string" && valor.trim()) {
    try {
      const v = JSON.parse(valor);
      if (Array.isArray(v)) return v.filter(Boolean);
    } catch {
      /* texto separado por vírgula */
    }
    return valor
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
  }
  return [];
}

/** 1ª categoria financeira (de `categorias`) que bate com as do fornecedor. */
export function categoriaDoFornecedor(fornecedor, categorias) {
  const porChave = new Map((categorias || []).map((c) => [chaveCategoria(c.nome), c]));
  for (const nome of listaCategorias(fornecedor?.categorias)) {
    const c = porChave.get(chaveCategoria(nome));
    if (c) return c;
  }
  return null;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd apps/web && npx vitest run src/lib/categorias-fornecedor.test.js`
Expected: `✓ src/lib/categorias-fornecedor.test.js (5 tests)`, `Tests  5 passed (5)`.

- [ ] **Step 5: O componente passa a usar a lib (e reexporta)**

Em `apps/web/src/components/fornecedores/CategoriasFornecedorSelect.jsx`, trocar a linha 3:

```jsx
import { normalizarTexto } from "@/lib/busca";
```

por:

```jsx
import { chaveCategoria as chave, listaCategorias } from "@/lib/categorias-fornecedor";
```

E trocar o bloco das linhas 18–46 (de `const chave = ...` até o `}` de `categoriaDoFornecedor`, logo antes do comentário `/** Categorias do fornecedor vinculadas ... */` do componente):

```jsx
const chave = (nome) => normalizarTexto(String(nome || "").trim());

/** `categorias` do fornecedor como lista (aceita o legado em texto). */
export function listaCategorias(valor) {
  if (Array.isArray(valor)) return valor.filter(Boolean);
  if (typeof valor === "string" && valor.trim()) {
    try {
      const v = JSON.parse(valor);
      if (Array.isArray(v)) return v.filter(Boolean);
    } catch {
      /* texto separado por vírgula */
    }
    return valor
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
  }
  return [];
}

/** 1ª categoria financeira (de `categorias`) que bate com as do fornecedor. */
export function categoriaDoFornecedor(fornecedor, categorias) {
  const porChave = new Map((categorias || []).map((c) => [chave(c.nome), c]));
  for (const nome of listaCategorias(fornecedor?.categorias)) {
    const c = porChave.get(chave(nome));
    if (c) return c;
  }
  return null;
}
```

por:

```jsx
// funções puras movidas para lib/categorias-fornecedor.js (reexportadas p/ quem já importa daqui)
export { categoriaDoFornecedor, listaCategorias } from "@/lib/categorias-fornecedor";
```

O resto do componente continua usando `chave(...)` e `listaCategorias(...)` como antes (agora vindos do import).

- [ ] **Step 6: Conferir o componente**

Run: `cd apps/web && npx eslint src/components/fornecedores/CategoriasFornecedorSelect.jsx && grep -n "categorias-fornecedor\|normalizarTexto" src/components/fornecedores/CategoriasFornecedorSelect.jsx`
Expected: o eslint não imprime nada (sem import sobrando); o grep mostra só:

```
3:import { chaveCategoria as chave, listaCategorias } from "@/lib/categorias-fornecedor";
18:// funções puras movidas para lib/categorias-fornecedor.js (reexportadas p/ quem já importa daqui)
19:export { categoriaDoFornecedor, listaCategorias } from "@/lib/categorias-fornecedor";
```

- [ ] **Step 7: Escrever o teste do preenchimento (falha)**

Criar `apps/web/src/lib/documento-financeiro.test.js`:

```js
import { describe, it, expect } from "vitest";
import { acharPessoa, montarPreenchimento } from "./documento-financeiro";

/** DocumentoFiscal completo (formato do contrato) com os campos sobrescritos. */
function doc(extra = {}) {
  return {
    origem: "xml",
    tipo: "nfe",
    numero: "1234",
    chave: "35260911222333000181550010000012341123456787",
    data_emissao: "2026-09-10",
    valor_total: 300.1,
    emitente: {
      nome: "ELETRICA M&M LTDA",
      documento: "11222333000181",
      ie: "123456789110",
      endereco: "RUA DAS FLORES, 100 - CENTRO - SAO PAULO/SP - CEP 01001-000",
    },
    destinatario: { nome: "CONSTRUTORA EXEMPLO LTDA", documento: "11444777000161" },
    vencimentos: [],
    forma_pagamento: null,
    descricao: "VENDA DE MERCADORIA",
    itens: [],
    avisos: [],
    duvidosos: [],
    ...extra,
  };
}

const categorias = [
  { id: "r1", nome: "Material Elétrico", tipo: "Receita" },
  { id: "d1", nome: "Material Elétrico", tipo: "Despesa" },
  { id: "d2", nome: "Combustível", tipo: "Despesa" },
];

const fornecedores = [
  { id: "f1", nome_razao: "ELETRICA M&M LTDA", cnpj: "99.888.777/0001-66" },
  {
    id: "f2",
    nome_razao: "Elétrica MM (matriz)",
    cnpj: "11.222.333/0001-81",
    categorias: '["Material Eletrico"]',
  },
  { id: "f3", nome_razao: "José da Silva", cnpj: "" },
];

describe("montarPreenchimento — despesa", () => {
  it("NF-e: fornecedor pelos DÍGITOS do CNPJ (antes do nome), categoria de despesa, parcelas e itens", () => {
    const r = montarPreenchimento(
      doc({
        forma_pagamento: "boleto",
        vencimentos: [
          { numero: "002", data: "2026-11-10", valor: 100 },
          { numero: "001", data: "2026-10-10", valor: 100.1 },
          { numero: "003", data: "2026-12-10", valor: 100 },
        ],
        itens: [
          {
            descricao: "CABO 2,5MM",
            codigo: "CAB-25",
            ean: null,
            ncm: "85444900",
            unidade: null,
            quantidade: 2,
            valor_unitario: 150,
            valor_total: 300,
          },
        ],
      }),
      { tipo: "despesa", pessoas: fornecedores, categorias }
    );
    expect(r.patch).toEqual({
      valor: "300.10",
      data_competencia: "2026-09-10",
      data_vencimento: "2026-10-10",
      forma_pagamento: "boleto",
      descricao: "NF-e 1234 - ELETRICA M&M LTDA",
      chave_nfe: "35260911222333000181550010000012341123456787",
      numero_documento: "35260911222333000181550010000012341123456787",
      fornecedor_id: "f2",
      fornecedor_nome: "Elétrica MM (matriz)",
      categoria_id: "d1",
      categoria_nome: "Material Elétrico",
    });
    expect(r.parcelas).toEqual([
      {
        numero: 1,
        valor: 100.1,
        data_vencimento: "2026-10-10",
        data_pagamento: null,
        status: "em_aberto",
      },
      {
        numero: 2,
        valor: 100,
        data_vencimento: "2026-11-10",
        data_pagamento: null,
        status: "em_aberto",
      },
      {
        numero: 3,
        valor: 100,
        data_vencimento: "2026-12-10",
        data_pagamento: null,
        status: "em_aberto",
      },
    ]);
    expect(r.itens).toEqual([
      {
        descricao: "CABO 2,5MM",
        codigo: "CAB-25",
        ean: "",
        ncm: "85444900",
        unidade: "UN",
        quantidade: 2,
        valor_unitario: 150,
        valor_total: 300,
      },
    ]);
    expect(r.pessoaSugerida).toBeNull();
    expect(r.avisos).toEqual([]);
  });

  it("recibo sem CPF/CNPJ: fornecedor pelo NOME normalizado; vencimento lido; sem parcelas", () => {
    const r = montarPreenchimento(
      doc({
        origem: "ia",
        tipo: "recibo",
        numero: null,
        chave: null,
        valor_total: 450,
        emitente: { nome: "JOSE  DA SILVA", documento: null, ie: null, endereco: null },
        vencimentos: [{ numero: null, data: "2026-09-20", valor: 450 }],
        forma_pagamento: "dinheiro",
      }),
      { tipo: "despesa", pessoas: fornecedores, categorias }
    );
    expect(r.patch).toEqual({
      valor: "450.00",
      data_competencia: "2026-09-10",
      data_vencimento: "2026-09-20",
      forma_pagamento: "dinheiro",
      descricao: "Recibo - JOSE DA SILVA",
      fornecedor_id: "f3",
      fornecedor_nome: "José da Silva",
    });
    expect(r.parcelas).toEqual([]);
  });

  it("sem vencimento: data de vencimento = emissão; número do documento sem chave", () => {
    const r = montarPreenchimento(doc({ tipo: "cupom", chave: null, numero: "55" }), {
      tipo: "despesa",
      pessoas: fornecedores,
    });
    expect(r.patch).toMatchObject({
      data_competencia: "2026-09-10",
      data_vencimento: "2026-09-10",
      descricao: "Cupom fiscal 55 - ELETRICA M&M LTDA",
      numero_documento: "55",
    });
    expect(r.patch).not.toHaveProperty("chave_nfe");
  });

  it("fornecedor não cadastrado: sugere o cadastro e limpa a seleção anterior", () => {
    const r = montarPreenchimento(
      doc({
        emitente: {
          nome: "NOVO FORNECEDOR LTDA",
          documento: "11444777000161",
          ie: null,
          endereco: "RUA B, 1 - CENTRO",
        },
        avisos: ["XML sem o protocolo de autorização da SEFAZ: confira se a nota foi autorizada."],
      }),
      { tipo: "despesa", pessoas: fornecedores, categorias }
    );
    expect(r.patch).toMatchObject({ fornecedor_id: "", fornecedor_nome: "NOVO FORNECEDOR LTDA" });
    expect(r.patch).not.toHaveProperty("categoria_id");
    expect(r.pessoaSugerida).toEqual({
      nome: "NOVO FORNECEDOR LTDA",
      documento: "11444777000161",
      endereco: "RUA B, 1 - CENTRO",
    });
    expect(r.avisos).toEqual(["XML sem o protocolo de autorização da SEFAZ: confira se a nota foi autorizada."]);
  });

  it("boleto sem total: valor pela soma dos vencimentos e forma boleto pelo tipo", () => {
    const r = montarPreenchimento(
      doc({
        origem: "ia",
        tipo: "boleto",
        numero: null,
        chave: null,
        data_emissao: null,
        valor_total: null,
        emitente: { nome: null, documento: null, ie: null, endereco: null },
        vencimentos: [{ numero: null, data: "2026-10-05", valor: 89.9 }],
        descricao: "Mensalidade internet",
      }),
      { tipo: "despesa", pessoas: fornecedores }
    );
    expect(r.patch).toEqual({
      valor: "89.90",
      data_vencimento: "2026-10-05",
      forma_pagamento: "boleto",
      descricao: "Boleto - Mensalidade internet",
    });
    expect(r.pessoaSugerida).toBeNull();
  });

  it("documento nulo → nada a preencher", () => {
    expect(montarPreenchimento(null, { tipo: "despesa" })).toEqual({
      patch: {},
      parcelas: [],
      itens: [],
      pessoaSugerida: null,
      avisos: [],
    });
  });
});

describe("montarPreenchimento — receita", () => {
  const clientes = [
    { id: "c1", nome_razao: "Construtora Exemplo", documento: "11.444.777/0001-61" },
    { id: "c2", nome_razao: "ELETRICA M&M LTDA", documento: "11222333000181" },
  ];

  it("cliente = destinatário por dígitos; sem chave/categoria; cartão não entra; parcelas de receita", () => {
    const r = montarPreenchimento(
      doc({
        tipo: "nfse",
        numero: "2026000000123",
        chave: null,
        forma_pagamento: "cartao",
        vencimentos: [
          { numero: "1", data: "2026-10-10", valor: 150.05 },
          { numero: "2", data: "2026-11-10", valor: 150.05 },
        ],
      }),
      { tipo: "receita", pessoas: clientes, categorias }
    );
    expect(r.patch).toEqual({
      valor: "300.10",
      data_competencia: "2026-09-10",
      data_vencimento: "2026-10-10",
      descricao: "NFS-e 2026000000123 - CONSTRUTORA EXEMPLO LTDA",
      cliente_id: "c1",
      cliente_nome: "Construtora Exemplo",
    });
    expect(r.parcelas).toEqual([
      {
        numero: 1,
        valor: 150.05,
        data_vencimento: "2026-10-10",
        data_pagamento: "",
        status: "em_aberto",
      },
      {
        numero: 2,
        valor: 150.05,
        data_vencimento: "2026-11-10",
        data_pagamento: "",
        status: "em_aberto",
      },
    ]);
  });

  it("cliente não cadastrado → pessoaSugerida com o documento do destinatário", () => {
    const r = montarPreenchimento(
      doc({
        destinatario: { nome: "PREFEITURA DE EXEMPLO", documento: "12345678909" },
        forma_pagamento: "pix",
      }),
      { tipo: "receita", pessoas: clientes }
    );
    expect(r.patch).toMatchObject({
      cliente_id: "",
      cliente_nome: "PREFEITURA DE EXEMPLO",
      forma_pagamento: "pix",
    });
    expect(r.pessoaSugerida).toEqual({
      nome: "PREFEITURA DE EXEMPLO",
      documento: "12345678909",
      endereco: null,
    });
  });
});

describe("acharPessoa", () => {
  it("dígitos primeiro, nome (sem acento/caixa/espaços extras) depois, senão null", () => {
    const alvo = (nome, documento) => ({ nome, documento });
    expect(acharPessoa(fornecedores, alvo("x", "11222333000181"), "cnpj")?.id).toBe("f2");
    expect(acharPessoa(fornecedores, alvo(" jose da  silva ", null), "cnpj")?.id).toBe("f3");
    expect(acharPessoa(fornecedores, alvo("Outro", "12345678909"), "cnpj")).toBeNull();
    expect(acharPessoa([], alvo(null, null), "cnpj")).toBeNull();
  });
});
```

- [ ] **Step 8: Rodar e ver falhar**

Run: `cd apps/web && npx vitest run src/lib/documento-financeiro.test.js`
Expected (FAIL):

```
 FAIL  src/lib/documento-financeiro.test.js [ src/lib/documento-financeiro.test.js ]
Error: Cannot find module './documento-financeiro' imported from '.../apps/web/src/lib/documento-financeiro.test.js'
 Test Files  1 failed (1)
      Tests  no tests
```

- [ ] **Step 9: Implementar o preenchimento**

Criar `apps/web/src/lib/documento-financeiro.js`:

```js
/**
 * documento-financeiro — transforma o `DocumentoFiscal` lido ("Ler documento":
 * XML pelo nfe-xml.js ou PDF/foto pela IA) no preenchimento do formulário de
 * NOVA despesa ou NOVA receita. Puro: não salva nada, só devolve o que a tela
 * aplica para o usuário conferir.
 *
 * DocumentoFiscal: { origem, tipo, numero, chave, data_emissao, valor_total,
 *   emitente: { nome, documento, ie, endereco }, destinatario: { nome, documento },
 *   vencimentos: [{ numero, data, valor }], forma_pagamento, descricao,
 *   itens: [{ descricao, codigo, ean, ncm, unidade, quantidade, valor_unitario, valor_total }],
 *   avisos: string[], duvidosos: string[] }
 */
import { normalizarTexto } from "./busca";
import { limparCnpj } from "./cnpj";
import { categoriaDoFornecedor } from "./categorias-fornecedor";

const ROTULOS = {
  nfe: "NF-e",
  nfce: "NFC-e",
  nfse: "NFS-e",
  recibo: "Recibo",
  cupom: "Cupom fiscal",
  boleto: "Boleto",
  comprovante_pix: "PIX",
  outro: "Documento",
};

// opções do Select "Forma de pagamento" de cada tela
const FORMAS_DESPESA = ["dinheiro", "pix", "transferencia", "boleto", "cartao"];
const FORMAS_RECEITA = ["dinheiro", "pix", "transferencia", "boleto"];

/** Texto com espaços colapsados; null se vazio. */
const limpo = (s) =>
  String(s ?? "")
    .replace(/\s+/g, " ")
    .trim() || null;

const chaveNome = (s) => normalizarTexto(limpo(s) || "");

/**
 * Pessoa cadastrada (fornecedor ou cliente) do documento: primeiro pelos
 * DÍGITOS do CPF/CNPJ (o cadastro pode ter pontuação), depois pelo nome
 * (sem acento, sem diferença de maiúsculas e espaços).
 * @param {Array<object>} pessoas fornecedores ou clientes (com `nome_razao`)
 * @param {{ nome?: string|null, documento?: string|null }} alvo
 * @param {"cnpj"|"documento"} campoDocumento campo do cadastro com o CPF/CNPJ
 */
export function acharPessoa(pessoas, alvo, campoDocumento) {
  const lista = pessoas || [];
  const digitos = limparCnpj(alvo?.documento);
  if (digitos) {
    const porDocumento = lista.find((p) => limparCnpj(p?.[campoDocumento]) === digitos);
    if (porDocumento) return porDocumento;
  }
  const nome = chaveNome(alvo?.nome);
  if (!nome) return null;
  return lista.find((p) => chaveNome(p?.nome_razao) === nome) || null;
}

const ehCategoriaDeDespesa = (c) => normalizarTexto(c?.tipo || "Despesa") === "despesa";

/**
 * Monta o preenchimento do formulário a partir do documento lido.
 * Só traz no `patch` os campos que o documento trouxe (a tela mescla com
 * `setForm(prev => ({ ...prev, ...patch }))` e mantém o resto).
 *
 * @param {object|null} doc DocumentoFiscal
 * @param {{ tipo: "despesa"|"receita", pessoas?: object[], categorias?: object[] }} opcoes
 *   pessoas = fornecedores (despesa) ou clientes (receita); categorias = CategoriaFinanceira
 * @returns {{ patch: object, parcelas: object[], itens: object[],
 *   pessoaSugerida: { nome: string|null, documento: string|null, endereco: string|null } | null,
 *   avisos: string[] }}
 */
export function montarPreenchimento(doc, { tipo, pessoas = [], categorias = [] } = {}) {
  const vazio = { patch: {}, parcelas: [], itens: [], pessoaSugerida: null, avisos: [] };
  if (!doc) return vazio;

  const despesa = tipo !== "receita";
  const patch = {};

  const vencimentos = (doc.vencimentos || [])
    .filter((v) => v && v.data && Number.isFinite(v.valor))
    .sort((a, b) => a.data.localeCompare(b.data));

  // valor: total do documento; sem total (boleto lido pela IA), a soma dos vencimentos
  const valor = Number.isFinite(doc.valor_total)
    ? doc.valor_total
    : vencimentos.length
      ? vencimentos.reduce((s, v) => s + v.valor, 0)
      : null;
  if (valor != null) patch.valor = valor.toFixed(2);

  if (doc.data_emissao) patch.data_competencia = doc.data_emissao;
  const vencimento = vencimentos[0]?.data || doc.data_emissao;
  if (vencimento) patch.data_vencimento = vencimento;

  const forma =
    doc.forma_pagamento || (doc.tipo === "boleto" ? "boleto" : doc.tipo === "comprovante_pix" ? "pix" : null);
  if (forma && (despesa ? FORMAS_DESPESA : FORMAS_RECEITA).includes(forma)) {
    patch.forma_pagamento = forma;
  }

  // despesa: a pessoa é quem vendeu/prestou (emitente); receita: quem paga (destinatário/tomador)
  const pessoaDoc = (despesa ? doc.emitente : doc.destinatario) || {};
  const nomeDoc = limpo(pessoaDoc.nome);
  const documentoDoc = limpo(pessoaDoc.documento);

  const rotulo = [ROTULOS[doc.tipo] || ROTULOS.outro, limpo(doc.numero)].filter(Boolean).join(" ");
  const complemento = nomeDoc || limpo(doc.descricao);
  if (limpo(doc.numero) || complemento) {
    patch.descricao = [rotulo, complemento].filter(Boolean).join(" - ");
  }

  if (despesa) {
    if (doc.chave) patch.chave_nfe = doc.chave;
    // chave primeiro: a Nota de Devolução procura despesas com numero_documento de 44 dígitos
    const numeroDocumento = limpo(doc.chave) || limpo(doc.numero);
    if (numeroDocumento) patch.numero_documento = numeroDocumento;
  }

  let pessoaSugerida = null;
  if (nomeDoc || documentoDoc) {
    const [campoId, campoNome] = despesa ? ["fornecedor_id", "fornecedor_nome"] : ["cliente_id", "cliente_nome"];
    const achada = acharPessoa(pessoas, { nome: nomeDoc, documento: documentoDoc }, despesa ? "cnpj" : "documento");
    if (achada) {
      patch[campoId] = achada.id;
      patch[campoNome] = achada.nome_razao || nomeDoc || "";
      if (despesa) {
        const categoria = categoriaDoFornecedor(achada, (categorias || []).filter(ehCategoriaDeDespesa));
        if (categoria) {
          patch.categoria_id = categoria.id;
          patch.categoria_nome = categoria.nome;
        }
      }
    } else {
      // documento de outra pessoa: tira a seleção anterior e guarda o nome lido
      patch[campoId] = "";
      patch[campoNome] = nomeDoc || "";
      pessoaSugerida = {
        nome: nomeDoc,
        documento: documentoDoc,
        endereco: limpo(pessoaDoc.endereco),
      };
    }
  }

  const parcelas =
    vencimentos.length > 1
      ? vencimentos.map((v, i) => ({
          numero: i + 1,
          valor: v.valor,
          data_vencimento: v.data,
          data_pagamento: despesa ? null : "",
          status: "em_aberto",
        }))
      : [];

  // mesmo formato que o AssociarMateriaisModal recebia do importador de XML antigo
  const itens = (doc.itens || [])
    .filter((i) => i && limpo(i.descricao))
    .map((i) => ({
      descricao: limpo(i.descricao),
      codigo: i.codigo || "",
      ean: i.ean || "",
      ncm: i.ncm || "",
      unidade: i.unidade || "UN",
      quantidade: i.quantidade ?? 0,
      valor_unitario: i.valor_unitario ?? 0,
      valor_total: i.valor_total ?? 0,
    }));

  return { patch, parcelas, itens, pessoaSugerida, avisos: [...(doc.avisos || [])] };
}
```

- [ ] **Step 10: Rodar e ver passar**

Run: `cd apps/web && npx vitest run src/lib/documento-financeiro.test.js src/lib/categorias-fornecedor.test.js`
Expected (PASS):

```
 ✓ src/lib/categorias-fornecedor.test.js (5 tests)
 ✓ src/lib/documento-financeiro.test.js (9 tests)
 Test Files  2 passed (2)
      Tests  14 passed (14)
```

- [ ] **Step 11: Regressão do front**

Run: `cd apps/web && npx vitest run && npm run lint`
Expected: vitest sem falhas, +2 arquivos e +14 testes em relação ao fim da Task 9 (na linha de base de 25/09: `Test Files 18 passed (18)`, `Tests 167 passed (167)`); o `npm run lint` (eslint `--quiet`) termina sem erros.

- [ ] **Step 12: Commit**

```bash
git add apps/web/src/lib/categorias-fornecedor.js apps/web/src/lib/categorias-fornecedor.test.js apps/web/src/components/fornecedores/CategoriasFornecedorSelect.jsx apps/web/src/lib/documento-financeiro.js apps/web/src/lib/documento-financeiro.test.js
git commit -F - <<'EOF'
feat(financeiro): preenchimento da despesa/receita a partir do documento lido

montarPreenchimento transforma o DocumentoFiscal (XML ou IA) no patch do
formulário: pessoa casada pelos dígitos do CPF/CNPJ e depois pelo nome,
categoria do fornecedor, parcelas das duplicatas, itens para associar
materiais e sugestão de cadastro quando a pessoa não existe. As funções
de categoria do fornecedor saem do componente para lib/categorias-fornecedor
(o componente reexporta; mesmo comportamento).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log --oneline -1
```

Expected: o lint-staged roda o prettier nos 5 arquivos e o commit sai; `git log` mostra `feat(financeiro): preenchimento da despesa/receita a partir do documento lido`.

## Parte B — leitura de PDF/foto pela IA no servidor (Tasks 11 e 12)

Todos os comandos rodam no Git Bash, na raiz do repositório (`/c/Users/javer/sigoobras-base`). As duas tasks mexem só em `supabase/functions/ia-processar/`: a Task 11 cria o módulo puro do documento fiscal (formato, schema, prompt, normalização) e a Task 12 liga a ação `financeiro_ler_documento` no `index.ts`. Nada é publicado aqui (produção da Parte B é a Task 16). Na montagem deste plano, a suíte do backend ao fim da Task 5 tinha 92 testes (`node --test supabase/functions/ia-processar/*.test.ts supabase/functions/_shared/*.test.ts`); estas tasks somam 15 + 11.

### Task 11: Documento fiscal da IA — schema estrito, prompt e normalização (`financeiro-documento.ts`)

**Files:**

- Create: `supabase/functions/ia-processar/financeiro-documento.ts` (~450 linhas, sem imports)
- Test (create): `supabase/functions/ia-processar/financeiro-documento.test.ts` (~345 linhas)

**Interfaces:**

- Consumes:
  - Task 1: `paraSchemaGemini(schema: unknown): unknown` de `../_shared/gemini-regras.ts` — **só no teste**, para garantir que o schema estrito vira um schema aceito pelo Gemini (enum anulável → `anyOf`). O módulo em si não importa nada.
- Produces (`supabase/functions/ia-processar/financeiro-documento.ts`, puro, sem imports, sem Deno):
  - `type TipoLancamento = "despesa" | "receita"`
  - `TIPOS_DOCUMENTO` (`"nfe" | "nfce" | "nfse" | "recibo" | "cupom" | "boleto" | "comprovante_pix" | "outro"`) e `FORMAS_PAGAMENTO` (`"pix" | "boleto" | "cartao" | "dinheiro" | "transferencia"`), ambos `as const`; `type TipoDocumento`, `type FormaPagamento`, `interface VencimentoDocumento`, `interface ItemDocumento`, `interface DocumentoFiscal` (exatamente o formato do contrato)
  - `MAX_ITENS_DOCUMENTO = 40`
  - `SCHEMA_DOCUMENTO_FISCAL` — o `DocumentoFiscal` **sem `origem`** (quem põe `"ia"` é o servidor); estrito: todo objeto com `additionalProperties:false` e todas as chaves em `required`; opcionais como `type:["x","null"]`; `forma_pagamento` com `enum` incluindo `null`; `tipo` obrigatório (`"outro"` quando não reconhecer)
  - `promptDocumento(tipo: TipoLancamento): string`
  - `chaveNfeValida(chave: unknown): boolean`
  - `normalizarDocumento(bruto: unknown): DocumentoFiscal` (`origem: "ia"`)
  - `documentoFraco(doc: DocumentoFiscal, tipo: TipoLancamento = "despesa"): boolean`
- Decisões que o contrato não fixava:
  - `documentoFraco` ganha o 2º parâmetro **opcional** `tipo`: o contrato pede "sem `destinatario.nome` na receita", o que só dá para saber com o tipo. Chamado com 1 argumento, vale a regra da despesa (igual ao contrato).
  - `chaveNfeValida` exige, além de 44 dígitos e DV módulo 11 (pesos 2..9 da direita para a esquerda sobre os 43 primeiros; resto = soma % 11; DV = resto < 2 ? 0 : 11 − resto), **UF IBGE válida** e **modelo 55 ou 65**: `"000…0"` passa no DV, e chave de CT-e (57) não é chave de NF-e (o campo é `chave_nfe`). Recebe a chave já sem formatação; `normalizarDocumento` tira espaços/pontos antes.
  - Chave lida e descartada → aviso; CPF/CNPJ lido com quantidade errada de dígitos, data que não existe ou valor negativo → `null` e o campo entra em `duvidosos` (a tela destaca).
  - `numero` só com dígitos/pontos perde pontos e zeros à esquerda (`"000.001.234"` → `"1234"`, igual ao `nNF` do XML); `"123/2026"` fica igual.
  - Itens limitados a 40 (no prompt e na normalização, com aviso "use o XML"): a resposta tem teto de 8 000 tokens e uma DANFE de material elétrico passa fácil de 100 itens.
  - Um único vencimento sem valor (boleto) recebe o `valor_total`; vencimento sem data ou valor é descartado com aviso.
  - Limites de texto: nomes 200, endereço 300, descrição 200, número 60, avisos 10 × 300, duvidosos 30 × 60 (saída da IA é dado, não confiável).

- [ ] **Step 1: Conferir o pré-requisito (Task 1 feita)**

```bash
cd /c/Users/javer/sigoobras-base && grep -c "export function paraSchemaGemini" supabase/functions/_shared/gemini-regras.ts
```

Esperado: `1`. Se o arquivo não existir, pare e termine a Task 1.

- [ ] **Step 2: Escrever o teste (vai falhar)**

Criar `supabase/functions/ia-processar/financeiro-documento.test.ts`:

```ts
// Roda com Node 23.6+ (type stripping):  node --test supabase/functions/ia-processar/financeiro-documento.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { paraSchemaGemini } from "../_shared/gemini-regras.ts";
import {
  chaveNfeValida,
  documentoFraco,
  MAX_ITENS_DOCUMENTO,
  normalizarDocumento,
  promptDocumento,
  SCHEMA_DOCUMENTO_FISCAL,
} from "./financeiro-documento.ts";

type Obj = Record<string, unknown>;

// chaves com DV calculado à mão (pesos 2..9 da direita p/ esquerda, módulo 11)
const CHAVE = "31260911222333000181550010000012341123456788"; // MG, NF-e 55, DV 8
const CHAVE_NFCE = "35260911222333000181650010000098761111222338"; // SP, NFC-e 65, DV 8
const CHAVE_RESTO_0 = "31260911222333000181550010000012341000000050"; // resto 0 → DV 0
const CHAVE_RESTO_1 = "31260911222333000181550010000012341000000000"; // resto 1 → DV 0

test("chaveNfeValida: DV módulo 11 (resto < 2 → 0)", () => {
  assert.equal(chaveNfeValida(CHAVE), true);
  assert.equal(chaveNfeValida(CHAVE_NFCE), true);
  assert.equal(chaveNfeValida(CHAVE_RESTO_0), true);
  assert.equal(chaveNfeValida(CHAVE_RESTO_1), true);
  // DV trocado
  assert.equal(chaveNfeValida(CHAVE.slice(0, 43) + "7"), false);
  assert.equal(chaveNfeValida(CHAVE_RESTO_0.slice(0, 43) + "1"), false);
  // um dígito do meio trocado muda o DV esperado
  assert.equal(chaveNfeValida("31260911222333000181550010000012351123456788"), false);
});

test("chaveNfeValida: formato, UF e modelo", () => {
  assert.equal(chaveNfeValida(CHAVE.slice(0, 43)), false); // 43 dígitos
  assert.equal(chaveNfeValida(CHAVE + "0"), false); // 45 dígitos
  assert.equal(chaveNfeValida(CHAVE.replace(/(\d{4})/g, "$1 ").trim()), false); // com espaços
  assert.equal(chaveNfeValida("0".repeat(44)), false); // DV "bate", mas UF 00 não existe
  assert.equal(chaveNfeValida("99260911222333000181550010000012341123456784"), false); // UF 99
  assert.equal(chaveNfeValida("31260911222333000181570010000012341123456785"), false); // CT-e (57)
  assert.equal(chaveNfeValida(Number(CHAVE)), false);
  assert.equal(chaveNfeValida(null), false);
  assert.equal(chaveNfeValida(undefined), false);
});

/** percorre o schema e devolve todos os nós (com o caminho) */
function nos(s: unknown, caminho = "$"): [string, Obj][] {
  if (!s || typeof s !== "object") return [];
  const o = s as Obj;
  const out: [string, Obj][] = [[caminho, o]];
  for (const [k, v] of Object.entries((o.properties as Obj) ?? {})) {
    out.push(...nos(v, `${caminho}.${k}`));
  }
  if (o.items) out.push(...nos(o.items, `${caminho}[]`));
  for (const v of (o.anyOf as unknown[]) ?? []) out.push(...nos(v, `${caminho}|`));
  return out;
}

test("SCHEMA_DOCUMENTO_FISCAL é estrito e espelha o DocumentoFiscal (sem origem)", () => {
  const s = SCHEMA_DOCUMENTO_FISCAL as Obj;
  assert.deepEqual(Object.keys(s.properties as Obj), [
    "tipo",
    "numero",
    "chave",
    "data_emissao",
    "valor_total",
    "emitente",
    "destinatario",
    "vencimentos",
    "forma_pagamento",
    "descricao",
    "itens",
    "avisos",
    "duvidosos",
  ]);
  const objetos = nos(s).filter(([, n]) => n.type === "object");
  assert.equal(objetos.length, 5); // raiz, emitente, destinatario, vencimento, item
  for (const [caminho, n] of objetos) {
    assert.equal(n.additionalProperties, false, caminho);
    assert.deepEqual(n.required, Object.keys(n.properties as Obj), caminho);
  }
  for (const [caminho, n] of nos(s)) {
    if (Array.isArray(n.enum) && n.enum.includes(null)) {
      assert.ok((n.type as string[]).includes("null"), caminho);
    }
  }
  const props = s.properties as Obj;
  assert.deepEqual((props.tipo as Obj).type, "string");
  assert.deepEqual((props.forma_pagamento as Obj).enum, ["pix", "boleto", "cartao", "dinheiro", "transferencia", null]);
});

test("schema convertido para o Gemini: enum anulável vira anyOf e nada de null em enum", () => {
  const g = paraSchemaGemini(SCHEMA_DOCUMENTO_FISCAL);
  for (const [caminho, n] of nos(g)) {
    if (Array.isArray(n.enum)) assert.ok(!n.enum.includes(null), caminho);
  }
  const forma = ((g as Obj).properties as Obj).forma_pagamento as Obj;
  assert.deepEqual(forma.anyOf, [
    { type: "string", enum: ["pix", "boleto", "cartao", "dinheiro", "transferencia"] },
    { type: "null" },
  ]);
});

test("prompt: pessoa certa por tipo de lançamento e regras de leitura", () => {
  const despesa = promptDocumento("despesa");
  const receita = promptDocumento("receita");
  assert.match(despesa, /DESPESA/);
  assert.match(despesa, /em emitente o emitente da nota, o prestador/);
  assert.match(receita, /RECEITA/);
  assert.match(receita, /em destinatario o destinatário da nota, o tomador/);
  assert.notEqual(despesa, receita);
  for (const p of [despesa, receita]) {
    assert.match(p, /NUNCA invente/);
    assert.match(p, /= null/);
    assert.match(p, /AAAA-MM-DD/);
    assert.match(p, /SOMENTE se estiver impressa/);
    assert.match(p, /no boleto, a data de vencimento/);
    assert.match(p, /duvidosos/);
    assert.match(p, new RegExp(`no máximo ${MAX_ITENS_DOCUMENTO}`));
  }
});

test("normalizarDocumento: DANFE completo", () => {
  const doc = normalizarDocumento({
    tipo: "nfe",
    numero: "000.001.234",
    chave: "3126 0911 2223 3300 0181 5500 1000 0012 3411 2345 6788",
    data_emissao: "2026-09-10",
    valor_total: 1500.5,
    emitente: {
      nome: "  ELETRICA   M&M LTDA ",
      documento: "11.222.333/0001-81",
      ie: "0012345670011",
      endereco: "Rua A, 10 - Centro - Araxá/MG",
    },
    destinatario: { nome: "SINERGIA CONSTRUCOES", documento: "28.182.842/0001-20" },
    vencimentos: [
      { numero: "002", data: "2026-11-10", valor: 750.25 },
      { numero: "001", data: "2026-10-10", valor: 750.25 },
    ],
    forma_pagamento: "boleto",
    descricao: "Materiais elétricos",
    itens: [
      {
        descricao: "CABO FLEXIVEL 2,5MM",
        codigo: "123",
        ean: "SEM GTIN",
        ncm: "8544.49.00",
        unidade: "M",
        quantidade: 100,
        valor_unitario: 3.456789,
        valor_total: 345.68,
      },
      { descricao: "  ", codigo: "X" },
    ],
    avisos: [],
    duvidosos: ["vencimentos"],
  });
  assert.deepEqual(doc, {
    origem: "ia",
    tipo: "nfe",
    numero: "1234",
    chave: CHAVE,
    data_emissao: "2026-09-10",
    valor_total: 1500.5,
    emitente: {
      nome: "ELETRICA M&M LTDA",
      documento: "11222333000181",
      ie: "0012345670011",
      endereco: "Rua A, 10 - Centro - Araxá/MG",
    },
    destinatario: { nome: "SINERGIA CONSTRUCOES", documento: "28182842000120" },
    vencimentos: [
      { numero: "001", data: "2026-10-10", valor: 750.25 },
      { numero: "002", data: "2026-11-10", valor: 750.25 },
    ],
    forma_pagamento: "boleto",
    descricao: "Materiais elétricos",
    itens: [
      {
        descricao: "CABO FLEXIVEL 2,5MM",
        codigo: "123",
        ean: null,
        ncm: "85444900",
        unidade: "M",
        quantidade: 100,
        valor_unitario: 3.4568,
        valor_total: 345.68,
      },
    ],
    avisos: [],
    duvidosos: ["vencimentos"],
  });
});

test("normalizarDocumento: chave com DV errado vira null com aviso", () => {
  const doc = normalizarDocumento({ tipo: "nfe", chave: CHAVE.slice(0, 43) + "1" });
  assert.equal(doc.chave, null);
  assert.deepEqual(doc.avisos, [
    "A chave de acesso lida não é uma chave de NF-e válida (dígito verificador) e foi descartada — confira no documento.",
  ]);
  // sem chave nenhuma: sem aviso
  assert.deepEqual(normalizarDocumento({ tipo: "recibo", chave: null }).avisos, []);
});

test("normalizarDocumento: CPF/CNPJ só com 11 ou 14 dígitos; senão null e em dúvida", () => {
  const doc = normalizarDocumento({
    emitente: { nome: "JOSE", documento: "123.456.789-01" },
    destinatario: { nome: "X", documento: "11.222.333/0001" },
  });
  assert.equal(doc.emitente.documento, "12345678901");
  assert.equal(doc.destinatario.documento, null);
  assert.deepEqual(doc.duvidosos, ["destinatario.documento"]);
});

test("normalizarDocumento: datas reais em AAAA-MM-DD", () => {
  assert.equal(normalizarDocumento({ data_emissao: "31/12/2026" }).data_emissao, "2026-12-31");
  assert.equal(normalizarDocumento({ data_emissao: "2026-09-01T10:30:00-03:00" }).data_emissao, "2026-09-01");
  const invalida = normalizarDocumento({ data_emissao: "2026-02-30" });
  assert.equal(invalida.data_emissao, null);
  assert.deepEqual(invalida.duvidosos, ["data_emissao"]);
  assert.equal(normalizarDocumento({ data_emissao: "setembro" }).data_emissao, null);
  assert.deepEqual(normalizarDocumento({ data_emissao: null }).duvidosos, []);
});

test("normalizarDocumento: valores ≥ 0 com 2 casas; texto brasileiro aceito", () => {
  assert.equal(normalizarDocumento({ valor_total: "R$ 1.234,56" }).valor_total, 1234.56);
  assert.equal(normalizarDocumento({ valor_total: 99.999 }).valor_total, 100);
  assert.equal(normalizarDocumento({ valor_total: 0 }).valor_total, 0);
  const negativo = normalizarDocumento({ valor_total: -10 });
  assert.equal(negativo.valor_total, null);
  assert.deepEqual(negativo.duvidosos, ["valor_total"]);
  assert.equal(normalizarDocumento({ valor_total: "abc" }).valor_total, null);
});

test("normalizarDocumento: boleto com um vencimento sem valor usa o total", () => {
  const doc = normalizarDocumento({
    tipo: "boleto",
    valor_total: 320,
    vencimentos: [{ numero: null, data: "2026-10-05", valor: null }],
  });
  assert.deepEqual(doc.vencimentos, [{ numero: null, data: "2026-10-05", valor: 320 }]);
  assert.deepEqual(doc.avisos, []);
});

test("normalizarDocumento: vencimento ilegível é ignorado; soma ≠ total vira aviso", () => {
  const doc = normalizarDocumento({
    valor_total: 1000,
    vencimentos: [
      { numero: "2", data: "2026-11-10", valor: 400 },
      { numero: "1", data: "2026-10-10", valor: 400 },
      { numero: "3", data: null, valor: 200 },
    ],
  });
  assert.deepEqual(
    doc.vencimentos.map((v) => v.numero),
    ["1", "2"]
  );
  assert.deepEqual(doc.avisos, [
    "1 vencimento(s) sem data ou valor legível foram ignorados — confira as parcelas.",
    "A soma das parcelas (R$ 800,00) difere do valor total (R$ 1.000,00) — confira.",
  ]);
  // diferença de até R$ 0,05 não avisa
  const quase = normalizarDocumento({
    valor_total: 1000.04,
    vencimentos: [{ data: "2026-10-10", valor: 1000 }],
  });
  assert.deepEqual(quase.avisos, []);
});

test("normalizarDocumento: itens limitados ao máximo, com aviso", () => {
  const itens = Array.from({ length: MAX_ITENS_DOCUMENTO + 5 }, (_, i) => ({
    descricao: `ITEM ${i + 1}`,
  }));
  const doc = normalizarDocumento({ itens });
  assert.equal(doc.itens.length, MAX_ITENS_DOCUMENTO);
  assert.equal(doc.itens[MAX_ITENS_DOCUMENTO - 1].descricao, `ITEM ${MAX_ITENS_DOCUMENTO}`);
  assert.deepEqual(doc.avisos, [
    `Só os ${MAX_ITENS_DOCUMENTO} primeiros itens foram lidos — para trazer todos, use o XML da nota.`,
  ]);
});

test("normalizarDocumento: lixo vira documento vazio (tipo outro), sem lançar", () => {
  const vazio = {
    origem: "ia",
    tipo: "outro",
    numero: null,
    chave: null,
    data_emissao: null,
    valor_total: null,
    emitente: { nome: null, documento: null, ie: null, endereco: null },
    destinatario: { nome: null, documento: null },
    vencimentos: [],
    forma_pagamento: null,
    descricao: null,
    itens: [],
    avisos: [],
    duvidosos: [],
  };
  for (const lixo of [null, undefined, "texto", 42, [1, 2], {}]) {
    assert.deepEqual(normalizarDocumento(lixo), vazio);
  }
  const d = normalizarDocumento({
    tipo: "fatura",
    forma_pagamento: "credito",
    numero: "123/2026",
    avisos: [" Imagem  borrada ", "Imagem borrada", 7, null],
    duvidosos: "valor_total",
  });
  assert.equal(d.tipo, "outro");
  assert.equal(d.forma_pagamento, null);
  assert.equal(d.numero, "123/2026");
  assert.deepEqual(d.avisos, ["Imagem borrada", "7"]);
  assert.deepEqual(d.duvidosos, []);
});

test("documentoFraco: sem valor total ou sem a pessoa do lançamento", () => {
  const base = normalizarDocumento({
    valor_total: 10,
    emitente: { nome: "LOJA" },
    destinatario: { nome: "CLIENTE" },
  });
  assert.equal(documentoFraco(base), false);
  assert.equal(documentoFraco(base, "despesa"), false);
  assert.equal(documentoFraco(base, "receita"), false);
  assert.equal(documentoFraco({ ...base, valor_total: null }), true);
  assert.equal(documentoFraco({ ...base, valor_total: 0 }), false);
  const semEmitente = { ...base, emitente: { ...base.emitente, nome: null } };
  assert.equal(documentoFraco(semEmitente), true);
  assert.equal(documentoFraco(semEmitente, "receita"), false);
  const semDestinatario = { ...base, destinatario: { nome: null, documento: null } };
  assert.equal(documentoFraco(semDestinatario, "despesa"), false);
  assert.equal(documentoFraco(semDestinatario, "receita"), true);
});
```

As chaves do teste têm o DV calculado com a regra acima (ex.: `3126091122233300018155001000001234112345678` → soma % 11 = 3 → DV 8); `CHAVE_RESTO_0`/`CHAVE_RESTO_1` cobrem o caso "resto < 2 → DV 0".

- [ ] **Step 3: Rodar e ver falhar**

```bash
cd /c/Users/javer/sigoobras-base && node --test supabase/functions/ia-processar/financeiro-documento.test.ts
```

Esperado: `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '...\supabase\functions\ia-processar\financeiro-documento.ts'` e `ℹ fail 1`.

- [ ] **Step 4: Implementar `financeiro-documento.ts`**

Criar `supabase/functions/ia-processar/financeiro-documento.ts`:

```ts
/**
 * financeiro-documento — "Ler documento" do Financeiro pela IA (ação
 * financeiro_ler_documento da ia-processar): o formato comum DocumentoFiscal
 * (o mesmo que o front monta do XML em apps/web/src/lib/nfe-xml.js), o JSON
 * Schema ESTRITO pedido à IA, o prompt e a normalização da resposta.
 *
 * A saída da IA é DADO, não verdade — tudo passa por normalizarDocumento:
 *   - CPF/CNPJ só dígitos, com 11 ou 14 dígitos (senão null e o campo vai
 *     para duvidosos);
 *   - chave de acesso só com 44 dígitos, UF e modelo (55/65) de NF-e/NFC-e e
 *     DV módulo 11 válido (chave inventada bateria no índice único de
 *     chave_nfe) — senão null com aviso;
 *   - datas reais em AAAA-MM-DD; valores ≥ 0;
 *   - vencimentos ordenados; soma ≠ total (> R$ 0,05) vira aviso.
 *
 * Estrito = todo objeto com additionalProperties:false e TODAS as chaves em
 * required; "opcional" é tipo ["x","null"] (enum anulável inclui null).
 *
 * Puro (sem imports, sem Deno): testado com node --test.
 */

// ─── Tipos do formato comum ─────────────────────────────────────────────────

export type TipoLancamento = "despesa" | "receita";

export const TIPOS_DOCUMENTO = [
  "nfe",
  "nfce",
  "nfse",
  "recibo",
  "cupom",
  "boleto",
  "comprovante_pix",
  "outro",
] as const;
export const FORMAS_PAGAMENTO = ["pix", "boleto", "cartao", "dinheiro", "transferencia"] as const;

export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];
export type FormaPagamento = (typeof FORMAS_PAGAMENTO)[number];

export interface VencimentoDocumento {
  numero: string | null;
  /** AAAA-MM-DD */
  data: string;
  valor: number;
}

export interface ItemDocumento {
  descricao: string;
  codigo: string | null;
  ean: string | null;
  ncm: string | null;
  unidade: string | null;
  quantidade: number | null;
  valor_unitario: number | null;
  valor_total: number | null;
}

export interface DocumentoFiscal {
  origem: "xml" | "ia";
  tipo: TipoDocumento;
  numero: string | null;
  /** 44 dígitos (DV conferido) */
  chave: string | null;
  /** AAAA-MM-DD */
  data_emissao: string | null;
  valor_total: number | null;
  emitente: {
    nome: string | null;
    /** só dígitos (11 ou 14) */
    documento: string | null;
    ie: string | null;
    endereco: string | null;
  };
  destinatario: { nome: string | null; documento: string | null };
  vencimentos: VencimentoDocumento[];
  forma_pagamento: FormaPagamento | null;
  descricao: string | null;
  itens: ItemDocumento[];
  avisos: string[];
  duvidosos: string[];
}

/** itens pedidos à IA (a resposta tem teto de tokens; o XML traz todos) */
export const MAX_ITENS_DOCUMENTO = 40;

// ─── Schema estrito pedido à IA ─────────────────────────────────────────────

type Schema = Record<string, unknown>;

const comDescricao = (s: Schema, description?: string): Schema => (description ? { ...s, description } : s);
const texto = (d?: string) => comDescricao({ type: ["string", "null"] }, d);
const numero = (d?: string) => comDescricao({ type: ["number", "null"] }, d);
const lista = (items: Schema, d?: string) => comDescricao({ type: "array", items }, d);
const opcoes = (valores: readonly string[], d?: string) =>
  comDescricao({ type: ["string", "null"], enum: [...valores, null] }, d);
const opcoesObrig = (valores: readonly string[], d?: string) => comDescricao({ type: "string", enum: [...valores] }, d);
function objeto(properties: Record<string, Schema>, d?: string): Schema {
  return comDescricao(
    { type: "object", additionalProperties: false, required: Object.keys(properties), properties },
    d
  );
}

const DOC_PESSOA = texto("CNPJ ou CPF, só dígitos");

/** O que a IA devolve: o DocumentoFiscal sem `origem` (quem põe é o servidor). */
export const SCHEMA_DOCUMENTO_FISCAL: Schema = objeto({
  tipo: opcoesObrig(
    TIPOS_DOCUMENTO,
    "nfe = DANFE de NF-e; nfce = NFC-e; nfse = nota de serviço; cupom; recibo; boleto; comprovante_pix = PIX ou transferência; outro"
  ),
  numero: texto("número da nota, do recibo ou do documento do boleto (sem a série)"),
  chave: texto("chave de acesso de 44 dígitos da NF-e/NFC-e, SOMENTE se impressa; senão null"),
  data_emissao: texto("AAAA-MM-DD (no comprovante de PIX, a data do pagamento)"),
  valor_total: numero("valor total do documento em R$ (número, ex.: 1234.56)"),
  emitente: objeto(
    {
      nome: texto("razão social ou nome"),
      documento: DOC_PESSOA,
      ie: texto("inscrição estadual"),
      endereco: texto("endereço completo em uma linha"),
    },
    "quem emitiu o documento / recebeu o pagamento"
  ),
  destinatario: objeto(
    { nome: texto("razão social ou nome"), documento: DOC_PESSOA },
    "destinatário / tomador / pagador"
  ),
  vencimentos: lista(
    objeto({
      numero: texto("nº da duplicata/parcela"),
      data: texto("AAAA-MM-DD"),
      valor: numero("R$"),
    }),
    "duplicatas/parcelas (quadro FATURA do DANFE) ou o vencimento do boleto"
  ),
  forma_pagamento: opcoes(FORMAS_PAGAMENTO, "só se o documento disser"),
  descricao: texto("resumo curto do que foi comprado/vendido ou do serviço (até 120 caracteres)"),
  itens: lista(
    objeto({
      descricao: texto(),
      codigo: texto("código do produto"),
      ean: texto("GTIN/EAN"),
      ncm: texto(),
      unidade: texto(),
      quantidade: numero(),
      valor_unitario: numero(),
      valor_total: numero(),
    }),
    `produtos/serviços discriminados (no máximo ${MAX_ITENS_DOCUMENTO})`
  ),
  avisos: lista({ type: "string" }, "problemas de leitura: ilegível, cortado, mais de um documento"),
  duvidosos: lista({ type: "string" }, "campos lidos com dúvida, ex.: valor_total, data_emissao, emitente.documento"),
});

// ─── Prompt ─────────────────────────────────────────────────────────────────

export function promptDocumento(tipo: TipoLancamento): string {
  const papel =
    tipo === "receita"
      ? [
          "Este documento é de uma RECEITA da empresa (dinheiro que ENTRA). A pessoa que interessa é quem PAGA:",
          "ponha em destinatario o destinatário da nota, o tomador do serviço (NFS-e), de quem foi recebido (recibo), o pagador/sacado do boleto ou quem enviou o PIX;",
          "em emitente vai quem emitiu o documento ou recebeu o pagamento (normalmente a própria empresa).",
        ]
      : [
          "Este documento é de uma DESPESA da empresa (dinheiro que SAI). A pessoa que interessa é quem VENDEU ou PRESTOU o serviço:",
          "ponha em emitente o emitente da nota, o prestador (NFS-e), quem assina o recibo, o beneficiário/cedente do boleto ou quem recebeu o PIX (favorecido);",
          "em destinatario vai quem comprou/pagou (normalmente a própria empresa).",
        ];
  return [
    "Você é especialista em documentos fiscais e financeiros brasileiros: DANFE de NF-e, NFC-e, NFS-e, cupom fiscal, recibo, boleto e comprovante de PIX/transferência.",
    "Leia o documento anexado e preencha o JSON pedido. NUNCA invente: o que não estiver no documento = null (listas vazias quando não houver).",
    ...papel,
    "Regras:",
    "- Datas em AAAA-MM-DD. Valores em número com ponto decimal, sem R$ (R$ 1.234,56 → 1234.56).",
    "- valor_total: o total a pagar do documento (VALOR TOTAL DA NOTA no DANFE, valor do documento no boleto, valor pago no recibo/PIX).",
    "- CNPJ/CPF só com dígitos.",
    "- numero: número da nota, do recibo ou do documento do boleto, sem a série.",
    "- chave: a chave de acesso de 44 dígitos da NF-e/NFC-e SOMENTE se estiver impressa no documento; senão null. A linha digitável do boleto NÃO é chave.",
    "- vencimentos: as duplicatas/parcelas (quadro FATURA/DUPLICATAS do DANFE) ou, no boleto, a data de vencimento com o valor — cada uma com número, data e valor.",
    "- forma_pagamento: pix, boleto, cartao, dinheiro ou transferencia, só se o documento disser; senão null.",
    `- itens: os produtos/serviços discriminados, no máximo ${MAX_ITENS_DOCUMENTO}; se houver mais, liste os ${MAX_ITENS_DOCUMENTO} primeiros e diga em avisos.`,
    "- duvidosos: nomes dos campos lidos com dúvida (borrado, cortado, manuscrito), como valor_total, data_emissao, emitente.documento, vencimentos.",
    "- avisos: problemas do documento (ilegível, incompleto, mais de um documento na mesma imagem).",
  ].join("\n");
}

// ─── Chave de acesso da NF-e ────────────────────────────────────────────────

/** códigos IBGE das UFs (2 primeiros dígitos da chave) */
const UFS_IBGE = new Set("11 12 13 14 15 16 17 21 22 23 24 25 26 27 28 29 31 32 33 35 41 42 43 50 51 52 53".split(" "));

/**
 * Chave de 44 dígitos (sem espaços) com UF válida, modelo 55 (NF-e) ou 65
 * (NFC-e) e DV módulo 11: pesos 2..9 da direita para a esquerda sobre os 43
 * primeiros dígitos; resto = soma % 11; DV = resto < 2 ? 0 : 11 − resto.
 */
export function chaveNfeValida(chave: unknown): boolean {
  if (typeof chave !== "string" || !/^\d{44}$/.test(chave)) return false;
  if (!UFS_IBGE.has(chave.slice(0, 2))) return false;
  const modelo = chave.slice(20, 22);
  if (modelo !== "55" && modelo !== "65") return false;
  let soma = 0;
  let peso = 2;
  for (let i = 42; i >= 0; i--) {
    soma += Number(chave[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  const dv = resto < 2 ? 0 : 11 - resto;
  return dv === Number(chave[43]);
}

// ─── Normalização ───────────────────────────────────────────────────────────

type Obj = Record<string, unknown>;

const MAX_AVISOS_IA = 10;
const MAX_DUVIDOSOS = 30;
const TOLERANCIA_SOMA = 0.05;

const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});

/** texto de uma linha, aparado e limitado; vazio/não texto → null */
function textoLimpo(v: unknown, max: number): string | null {
  const s = typeof v === "number" && Number.isFinite(v) ? String(v) : v;
  if (typeof s !== "string") return null;
  const t = s.replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
}

const soDigitos = (v: unknown): string =>
  typeof v === "string" || typeof v === "number" ? String(v).replace(/\D/g, "") : "";

/** "000.001.234" → "1234" (só quando é número puro); "123/2026" fica igual */
function numeroDocumento(v: unknown): string | null {
  const t = textoLimpo(v, 60);
  if (!t || !/^\d[\d. ]*$/.test(t)) return t;
  return t.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
}

/** número ≥ 0 (aceita "1.234,56" e "R$ 10"), arredondado em `casas` */
function numeroNaoNegativo(v: unknown, casas: number): number | null {
  let n: number;
  if (typeof v === "number") {
    n = v;
  } else if (typeof v === "string") {
    let s = v.replace(/[R$\s]/g, "");
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
    n = Number(s);
  } else {
    return null;
  }
  if (!Number.isFinite(n) || n < 0) return null;
  const f = 10 ** casas;
  return Math.round(n * f) / f;
}

/** "AAAA-MM-DD" (ou com hora) / "DD/MM/AAAA" → AAAA-MM-DD de uma data que existe */
function dataIso(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/.exec(s);
  const br = iso ? null : /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (!iso && !br) return null;
  const [a, m, d] = iso ? [iso[1], iso[2], iso[3]] : [br![3], br![2], br![1]];
  const ano = Number(a);
  const mes = Number(m);
  const dia = Number(d);
  if (ano < 1900 || ano > 2100) return null;
  const dt = new Date(Date.UTC(ano, mes - 1, dia));
  if (dt.getUTCFullYear() !== ano || dt.getUTCMonth() !== mes - 1 || dt.getUTCDate() !== dia) {
    return null;
  }
  return `${a}-${m}-${d}`;
}

const umDe = <T extends string>(valores: readonly T[], v: unknown): T | null =>
  typeof v === "string" && (valores as readonly string[]).includes(v) ? (v as T) : null;

/** GTIN com 8, 12, 13 ou 14 dígitos ("SEM GTIN" → null) */
function ean(v: unknown): string | null {
  const d = soDigitos(v);
  return [8, 12, 13, 14].includes(d.length) ? d : null;
}

/** NCM tem 8 dígitos ("8544.49.00" → "85444900") */
function ncm(v: unknown): string | null {
  const d = soDigitos(v);
  return d.length === 8 ? d : null;
}

/** R$ 1.234,56 */
function brl(n: number): string {
  const [inteiro, centavos] = n.toFixed(2).split(".");
  return `R$ ${inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${centavos}`;
}

function listaDeTextos(v: unknown, maxItens: number, maxTexto: number): string[] {
  const out: string[] = [];
  for (const x of Array.isArray(v) ? v : []) {
    const t = textoLimpo(x, maxTexto);
    if (t && !out.includes(t)) out.push(t);
    if (out.length >= maxItens) break;
  }
  return out;
}

/** resposta bruta da IA → DocumentoFiscal (origem "ia") com as regras acima */
export function normalizarDocumento(bruto: unknown): DocumentoFiscal {
  const b = obj(bruto);
  const emit = obj(b.emitente);
  const dest = obj(b.destinatario);
  const avisos = listaDeTextos(b.avisos, MAX_AVISOS_IA, 300);
  const duvidosos = listaDeTextos(b.duvidosos, MAX_DUVIDOSOS, 60);
  const duvida = (campo: string) => {
    if (!duvidosos.includes(campo)) duvidosos.push(campo);
  };

  // CPF/CNPJ: 11 ou 14 dígitos; lido mas fora disso → null e campo em dúvida
  const pessoa = (v: unknown, campo: string): string | null => {
    const d = soDigitos(v);
    if (d.length === 11 || d.length === 14) return d;
    if (d) duvida(campo);
    return null;
  };

  const chaveLida = soDigitos(b.chave);
  let chave: string | null = null;
  if (chaveNfeValida(chaveLida)) chave = chaveLida;
  else if (chaveLida) {
    avisos.push(
      "A chave de acesso lida não é uma chave de NF-e válida (dígito verificador) e foi descartada — confira no documento."
    );
  }

  const data_emissao = dataIso(b.data_emissao);
  if (!data_emissao && textoLimpo(b.data_emissao, 40)) duvida("data_emissao");

  const valor_total = numeroNaoNegativo(b.valor_total, 2);
  if (valor_total === null && b.valor_total !== null && b.valor_total !== undefined) {
    duvida("valor_total");
  }

  // vencimentos: só os com data real e valor > 0; um só sem valor = o total
  const brutos = (Array.isArray(b.vencimentos) ? b.vencimentos : []).map(obj);
  const vencimentos: VencimentoDocumento[] = [];
  for (const v of brutos) {
    const data = dataIso(v.data);
    const valor = numeroNaoNegativo(v.valor, 2) ?? (brutos.length === 1 ? valor_total : null);
    if (data && valor !== null && valor > 0) {
      vencimentos.push({ numero: textoLimpo(v.numero, 30), data, valor });
    }
  }
  vencimentos.sort(
    (x, y) => x.data.localeCompare(y.data) || (x.numero ?? "").localeCompare(y.numero ?? "", "pt-BR", { numeric: true })
  );
  const ignorados = brutos.length - vencimentos.length;
  if (ignorados > 0) {
    avisos.push(`${ignorados} vencimento(s) sem data ou valor legível foram ignorados — confira as parcelas.`);
  }
  if (vencimentos.length && valor_total !== null) {
    const soma = Math.round(vencimentos.reduce((s, v) => s + v.valor, 0) * 100) / 100;
    if (Math.abs(soma - valor_total) > TOLERANCIA_SOMA) {
      avisos.push(`A soma das parcelas (${brl(soma)}) difere do valor total (${brl(valor_total)}) — confira.`);
    }
  }

  const itens: ItemDocumento[] = [];
  let itensDescartados = 0;
  for (const i of (Array.isArray(b.itens) ? b.itens : []).map(obj)) {
    const descricao = textoLimpo(i.descricao, 300);
    if (!descricao) continue;
    if (itens.length >= MAX_ITENS_DOCUMENTO) {
      itensDescartados++;
      continue;
    }
    itens.push({
      descricao,
      codigo: textoLimpo(i.codigo, 60),
      ean: ean(i.ean),
      ncm: ncm(i.ncm),
      unidade: textoLimpo(i.unidade, 10),
      quantidade: numeroNaoNegativo(i.quantidade, 4),
      valor_unitario: numeroNaoNegativo(i.valor_unitario, 4),
      valor_total: numeroNaoNegativo(i.valor_total, 2),
    });
  }
  if (itensDescartados > 0) {
    avisos.push(`Só os ${MAX_ITENS_DOCUMENTO} primeiros itens foram lidos — para trazer todos, use o XML da nota.`);
  }

  return {
    origem: "ia",
    tipo: umDe(TIPOS_DOCUMENTO, b.tipo) ?? "outro",
    numero: numeroDocumento(b.numero),
    chave,
    data_emissao,
    valor_total,
    emitente: {
      nome: textoLimpo(emit.nome, 200),
      documento: pessoa(emit.documento, "emitente.documento"),
      ie: textoLimpo(emit.ie, 30),
      endereco: textoLimpo(emit.endereco, 300),
    },
    destinatario: {
      nome: textoLimpo(dest.nome, 200),
      documento: pessoa(dest.documento, "destinatario.documento"),
    },
    vencimentos,
    forma_pagamento: umDe(FORMAS_PAGAMENTO, b.forma_pagamento),
    descricao: textoLimpo(b.descricao, 200),
    itens,
    avisos,
    duvidosos,
  };
}

/**
 * Leitura fraca (vale escalar para o nível forte): sem valor total ou sem o
 * nome da pessoa do lançamento — emitente na despesa (padrão), destinatário
 * na receita.
 */
export function documentoFraco(doc: DocumentoFiscal, tipo: TipoLancamento = "despesa"): boolean {
  const pessoa = tipo === "receita" ? doc.destinatario.nome : doc.emitente.nome;
  return doc.valor_total === null || !pessoa;
}
```

- [ ] **Step 5: Rodar e ver passar**

```bash
cd /c/Users/javer/sigoobras-base && node --test supabase/functions/ia-processar/financeiro-documento.test.ts
```

Esperado: `ℹ tests 15`, `ℹ pass 15`, `ℹ fail 0`.

- [ ] **Step 6: Rodar a suíte do backend (nada quebrou)**

```bash
cd /c/Users/javer/sigoobras-base && node --test supabase/functions/ia-processar/*.test.ts supabase/functions/_shared/*.test.ts
```

Esperado: `ℹ fail 0` (na montagem do plano: `ℹ tests 107`).

- [ ] **Step 7: Commit**

```bash
cd /c/Users/javer/sigoobras-base && git add supabase/functions/ia-processar/financeiro-documento.ts supabase/functions/ia-processar/financeiro-documento.test.ts && git commit -F - <<'EOF'
feat(financeiro): documento fiscal lido pela IA — schema estrito, prompt e normalização

- DocumentoFiscal (mesmo formato do XML do front), SCHEMA_DOCUMENTO_FISCAL
  estrito (OpenAI strict e Gemini) e prompt por tipo de lançamento
  (despesa = emitente/prestador; receita = destinatário/tomador/pagador)
- normalizarDocumento: CPF/CNPJ só dígitos (11/14), chave de NF-e só com UF,
  modelo 55/65 e DV módulo 11 válidos, datas reais, valores ≥ 0, vencimentos
  ordenados e aviso quando a soma diverge do total
- documentoFraco decide o escalonamento para o nível forte

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

### Task 12: Ação `financeiro_ler_documento` na `ia-processar`

**Files:**

- Create: `supabase/functions/ia-processar/financeiro-ler.ts` (~130 linhas; a lógica da ação fica fora do `index.ts` para ser testada em Node, como o `escalonamento.ts` da Task 5)
- Test (create): `supabase/functions/ia-processar/financeiro-ler.test.ts` (~220 linhas)
- Modify: `supabase/functions/ia-processar/index.ts` — números de linha do arquivo **depois** da Task 5: doc do cabeçalho (l. 14–17), imports (l. 67), `interface Body` (l. 84–85), guarda das refs (l. 226–230), cadeia de ações antes de `if (ehAcaoEdital(body.acao)) {` (l. 331)

**Interfaces:**

- Consumes:
  - Task 1: `import type { NivelIA, ProvedorIA } from "../_shared/ia-tipos.ts"`.
  - Task 3: `chamarIA(o: OpcoesIA): Promise<RespostaIA>` de `../_shared/ia.ts` (o `index.ts` já importa desde a Task 5).
  - Task 4: `contabilizar(m, r)` e `type MedidorUso` de `./ia-uso.ts` (`novoMedidor()` no teste).
  - Task 5: `type ChamarIA = (o: OpcoesIA) => Promise<RespostaIA>` de `./escalonamento.ts`; no `index.ts`: `admin` e `medidor` criados antes do `try`, `registrarUso(admin, usuario, String(body.acao ?? ""), medidor)` no `finally` (o uso desta ação é gravado sozinho, com `acao = "financeiro_ler_documento"`), `falhaIA` de `./edital.ts`.
  - Task 11: `SCHEMA_DOCUMENTO_FISCAL`, `promptDocumento`, `normalizarDocumento`, `documentoFraco`, `type DocumentoFiscal`, `type TipoLancamento`.
  - Já existente: `contarPreenchidos` de `./edital-regras.ts`; `validarRef` de `../_shared/openai.ts` (guarda das refs no `index.ts`).
- Produces:
  - `supabase/functions/ia-processar/financeiro-ler.ts`: `EXTENSOES_DOCUMENTO = ["pdf","jpg","jpeg","png","webp"]`, `TEMPO_LEITURA_MS = 60_000`, `MAX_TOKENS_LEITURA = 8_000`, `erroArquivoDocumento(ref: string): string | null`, `type ResultadoLeitura = { ok: true; documento: DocumentoFiscal; modelo: string; provedor: ProvedorIA; nivel: NivelIA } | { ok: false; erro: string; entrada: boolean }`, `lerDocumentoFinanceiro(chamar: ChamarIA, entrada: { file_ref?: unknown; tipo?: unknown }, medidor?: MedidorUso): Promise<ResultadoLeitura>`.
  - Ação HTTP (a Task 13 consome): `sigo.functions.invoke("iaProcessar", { acao: "financeiro_ler_documento", file_ref, tipo })` → `{ success: true, documento: DocumentoFiscal }`. Erros (`success:false`, `error`): 400 `file_ref é obrigatório` / `tipo deve ser "despesa" ou "receita"` / formato não aceito / HEIC ("… tire a foto em JPEG …"); 403 ref inválida ou de outra empresa; 503 "IA não configurada — defina a chave no SaaS Admin → Integrações"; 502 falha da IA nos dois níveis; 500 download falhou ou arquivo acima de 15 MB. Sem cota diária.
- Decisões que o contrato não fixava:
  - O escalonamento **não** reaproveita o `chamarComEscalonamento` da Task 5: ele escolhe só por quantidade de campos (`contarPreenchidos`), e aqui uma leitura do padrão com muitos itens e sem `valor_total` venceria a do forte com o total. `lerDocumentoFinanceiro` prefere a leitura **não fraca**; entre duas iguais, a mais completa (sem contar `avisos`/`duvidosos`). Se as duas vierem fracas, devolve a melhor com o aviso "Leitura incompleta: não encontrei …".
  - Formato conferido pela **extensão da ref** (o `UploadFile` guarda `<uuid>-<nome original>`): sem extensão também é recusado ("envie PDF, JPG, PNG ou WEBP"). A Task 13 deve manter o nome original do arquivo no upload.
  - A guarda das refs do `index.ts` passa a incluir `body.file_ref` (senão o download com service role leria arquivo de outra empresa).
  - A resposta é só `{ documento }`, como no contrato (modelo e provedor ficam no `ia_uso`).
  - Tempo: 60 s por nível (o fallback Gemini → OpenAI acontece dentro deles) → no máximo ~120 s, o mesmo orçamento da leitura de edital.

- [ ] **Step 1: Conferir os pré-requisitos (Tasks 5 e 11 feitas)**

```bash
cd /c/Users/javer/sigoobras-base && ls supabase/functions/ia-processar/escalonamento.ts supabase/functions/ia-processar/financeiro-documento.ts && grep -c 'registrarUso(admin, usuario, String(body.acao ?? ""), medidor)' supabase/functions/ia-processar/index.ts
```

Esperado: os dois caminhos listados e `1`. Se faltar algo, pare e termine a Task correspondente.

- [ ] **Step 2: Escrever o teste da ação (vai falhar)**

Criar `supabase/functions/ia-processar/financeiro-ler.test.ts`:

```ts
// Roda com Node 23.6+ (type stripping):  node --test supabase/functions/ia-processar/financeiro-ler.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { promptDocumento, SCHEMA_DOCUMENTO_FISCAL } from "./financeiro-documento.ts";
import { erroArquivoDocumento, lerDocumentoFinanceiro } from "./financeiro-ler.ts";
import { novoMedidor } from "./ia-uso.ts";

type Obj = Record<string, unknown>;

const REF = "comprovantes/11111111-2222-3333-4444-555555555555/2026/09/abc-danfe.pdf";

/** chamarIA falso: devolve as respostas na ordem e guarda as opções recebidas */
function chamadorFalso(respostas: Obj[]) {
  const pedidos: Obj[] = [];
  const chamar = async (o: Obj) => {
    pedidos.push(o);
    const r = respostas[pedidos.length - 1];
    if (!r) throw new Error("chamada a mais");
    return r;
  };
  // deno-lint-ignore no-explicit-any
  return { chamar: chamar as any, pedidos };
}

const ok = (resultado: unknown, extra: Obj = {}) => ({
  ok: true,
  resultado,
  modelo: "gemini-3.5-flash-lite",
  provedor: "gemini",
  ms: 10,
  ...extra,
});

const COMPLETO = {
  tipo: "nfe",
  numero: "123",
  valor_total: 150.5,
  emitente: { nome: "ELETRO LTDA", documento: "11222333000181" },
  destinatario: { nome: "SINERGIA", documento: null },
};
const SEM_VALOR = { ...COMPLETO, valor_total: null };

test("erroArquivoDocumento: PDF, JPG, JPEG, PNG e WEBP passam; HEIC pede JPEG; resto recusa", () => {
  for (const nome of ["a.pdf", "b.JPG", "c.jpeg", "d.png", "e.WebP"]) {
    assert.equal(erroArquivoDocumento(`comprovantes/x/${nome}`), null, nome);
  }
  assert.match(erroArquivoDocumento("comprovantes/x/IMG_0001.HEIC") ?? "", /tire a foto em JPEG/);
  assert.match(erroArquivoDocumento("comprovantes/x/foto.heif") ?? "", /tire a foto em JPEG/);
  assert.equal(erroArquivoDocumento("comprovantes/x/nota.docx"), "Formato não aceito — envie PDF, JPG, PNG ou WEBP.");
  assert.equal(
    erroArquivoDocumento("comprovantes/x/sem-extensao"),
    "Formato não aceito — envie PDF, JPG, PNG ou WEBP."
  );
});

test("entrada inválida: 400 sem chamar a IA", async () => {
  const f = chamadorFalso([]);
  assert.deepEqual(await lerDocumentoFinanceiro(f.chamar, { tipo: "despesa" }), {
    ok: false,
    erro: "file_ref é obrigatório",
    entrada: true,
  });
  assert.deepEqual(await lerDocumentoFinanceiro(f.chamar, { file_ref: REF, tipo: "compra" }), {
    ok: false,
    erro: 'tipo deve ser "despesa" ou "receita"',
    entrada: true,
  });
  const heic = await lerDocumentoFinanceiro(f.chamar, {
    file_ref: "comprovantes/x/IMG_0001.heic",
    tipo: "despesa",
  });
  assert.equal(heic.ok, false);
  assert.equal(!heic.ok && heic.entrada, true);
  assert.match((!heic.ok && heic.erro) || "", /tire a foto em JPEG/);
  assert.equal(f.pedidos.length, 0);
});

test("leitura boa no nível padrão: uma chamada com schema estrito, 60 s e 8000 tokens", async () => {
  const f = chamadorFalso([ok(COMPLETO)]);
  const r = await lerDocumentoFinanceiro(f.chamar, { file_ref: REF, tipo: "despesa" });
  assert.deepEqual(f.pedidos, [
    {
      prompt: promptDocumento("despesa"),
      fileRefs: [REF],
      jsonSchema: SCHEMA_DOCUMENTO_FISCAL,
      nomeSchema: "documento_fiscal",
      strict: true,
      timeoutMs: 60_000,
      maxOutputTokens: 8_000,
      esforco: "low",
      nivel: "padrao",
    },
  ]);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.nivel, "padrao");
  assert.equal(r.provedor, "gemini");
  assert.equal(r.modelo, "gemini-3.5-flash-lite");
  assert.equal(r.documento.origem, "ia");
  assert.equal(r.documento.valor_total, 150.5);
  assert.equal(r.documento.emitente.nome, "ELETRO LTDA");
  assert.deepEqual(r.documento.avisos, []);
});

test("fraco no padrão (sem valor): refaz no forte e fica com o forte", async () => {
  const f = chamadorFalso([ok(SEM_VALOR), ok(COMPLETO, { modelo: "gemini-3.8-flash" })]);
  const r = await lerDocumentoFinanceiro(f.chamar, { file_ref: REF, tipo: "despesa" });
  assert.deepEqual(
    f.pedidos.map((p) => p.nivel),
    ["padrao", "forte"]
  );
  assert.equal(r.ok && r.nivel, "forte");
  assert.equal(r.ok && r.modelo, "gemini-3.8-flash");
  assert.equal(r.ok && r.documento.valor_total, 150.5);
});

test("forte não fraco vence o padrão fraco mesmo com menos campos", async () => {
  const padraoCheio = {
    ...SEM_VALOR,
    descricao: "Materiais elétricos",
    itens: [
      { descricao: "CABO", quantidade: 1, valor_total: 10 },
      { descricao: "FITA", quantidade: 2, valor_total: 5 },
    ],
  };
  const f = chamadorFalso([ok(padraoCheio), ok({ valor_total: 15, emitente: { nome: "LOJA" } })]);
  const r = await lerDocumentoFinanceiro(f.chamar, { file_ref: REF, tipo: "despesa" });
  assert.equal(r.ok && r.nivel, "forte");
  assert.equal(r.ok && r.documento.emitente.nome, "LOJA");
});

test("fraco nos dois níveis: fica com o mais completo (avisos não contam) e avisa o que faltou", async () => {
  const f = chamadorFalso([
    ok({ numero: "9", avisos: ["borrado", "cortado", "torto", "escuro"] }),
    ok({ numero: "9", descricao: "Serviço", data_emissao: "2026-09-01" }),
  ]);
  const r = await lerDocumentoFinanceiro(f.chamar, { file_ref: REF, tipo: "despesa" });
  assert.equal(r.ok && r.nivel, "forte");
  assert.deepEqual(r.ok && r.documento.avisos, [
    "Leitura incompleta: não encontrei o valor total nem o nome do fornecedor — confira o documento e preencha à mão.",
  ]);
});

test("receita: prompt de receita e a pessoa fraca é o destinatário", async () => {
  const f = chamadorFalso([
    ok({ valor_total: 900, emitente: { nome: "SINERGIA" }, destinatario: { nome: null } }),
    ok({ valor_total: 900, emitente: { nome: "SINERGIA" }, destinatario: { nome: null } }),
  ]);
  const r = await lerDocumentoFinanceiro(f.chamar, { file_ref: REF, tipo: "receita" });
  assert.equal(f.pedidos[0].prompt, promptDocumento("receita"));
  assert.equal(f.pedidos.length, 2);
  assert.deepEqual(r.ok && r.documento.avisos, [
    "Leitura incompleta: não encontrei o nome do cliente — confira o documento e preencha à mão.",
  ]);
});

test("erro no padrão: tenta o forte", async () => {
  const f = chamadorFalso([
    { ok: false, erro: "Resposta cortada", motivo: "cortada", provedor: "gemini" },
    ok(COMPLETO, { modelo: "gpt-4o", provedor: "openai" }),
  ]);
  const r = await lerDocumentoFinanceiro(f.chamar, { file_ref: REF, tipo: "despesa" });
  assert.equal(r.ok && r.provedor, "openai");
  assert.equal(r.ok && r.nivel, "forte");
});

test("sem chave nenhuma: para na 1ª chamada, erro da IA (503 no index)", async () => {
  const f = chamadorFalso([{ ok: false, erro: "IA_NAO_CONFIGURADA", motivo: "config" }]);
  const m = novoMedidor();
  const r = await lerDocumentoFinanceiro(f.chamar, { file_ref: REF, tipo: "despesa" }, m);
  assert.deepEqual(r, { ok: false, erro: "IA_NAO_CONFIGURADA", entrada: false });
  assert.equal(f.pedidos.length, 1);
  assert.equal(m.chamadas, 0);
});

test("os dois níveis falham: devolve o último erro", async () => {
  const f = chamadorFalso([
    { ok: false, erro: "e1", motivo: "http" },
    { ok: false, erro: "e2", motivo: "timeout" },
  ]);
  assert.deepEqual(await lerDocumentoFinanceiro(f.chamar, { file_ref: REF, tipo: "despesa" }), {
    ok: false,
    erro: "e2",
    entrada: false,
  });
});

test("medidor soma as duas chamadas do escalonamento (com o fallback de provedor)", async () => {
  const openai = ok(SEM_VALOR, {
    modelo: "gpt-4o-mini",
    provedor: "openai",
    usage: { input_tokens: 1000, output_tokens: 100 },
  });
  const f = chamadorFalso([
    {
      ...openai,
      tentativas: [
        {
          ok: false,
          erro: "Google indisponível",
          motivo: "rede",
          provedor: "gemini",
          modelo: "gemini-3.5-flash-lite",
          usage: { input_tokens: 500, output_tokens: 0 },
        },
        openai,
      ],
    },
    ok(COMPLETO, { modelo: "gemini-3.8-flash", usage: { input_tokens: 1000, output_tokens: 200 } }),
  ]);
  const m = novoMedidor();
  await lerDocumentoFinanceiro(f.chamar, { file_ref: REF, tipo: "despesa" }, m);
  assert.equal(m.chamadas, 3);
  assert.equal(m.tokens_entrada, 2500);
  assert.equal(m.tokens_saida, 300);
  assert.deepEqual(m.modelos, ["gemini-3.5-flash-lite", "gpt-4o-mini", "gemini-3.8-flash"]);
  assert.deepEqual(m.provedores, ["gemini", "openai"]);
});
```

- [ ] **Step 3: Rodar e ver falhar**

```bash
cd /c/Users/javer/sigoobras-base && node --test supabase/functions/ia-processar/financeiro-ler.test.ts
```

Esperado: `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '...\supabase\functions\ia-processar\financeiro-ler.ts'` e `ℹ fail 1`.

- [ ] **Step 4: Implementar `financeiro-ler.ts`**

Criar `supabase/functions/ia-processar/financeiro-ler.ts`:

```ts
/**
 * financeiro-ler — ação financeiro_ler_documento da ia-processar: lê um PDF ou
 * foto (DANFE, NFS-e, cupom, recibo, boleto, comprovante de PIX) e devolve o
 * DocumentoFiscal normalizado (financeiro-documento.ts) para o front
 * preencher a nova despesa/receita. Nada é gravado aqui.
 *
 *   - a ref já foi validada no index (validarRef + mesma empresa do token);
 *     aqui: tipo do lançamento e formato (PDF/JPG/JPEG/PNG/WEBP pela
 *     extensão; HEIC é recusado — a reserva OpenAI não lê HEIC);
 *   - nível "padrao" e, se o documento vier fraco (sem valor total ou sem a
 *     pessoa do lançamento), "forte" — 60 s por nível (≤ 120 s, como a
 *     leitura de edital); fica com o não fraco ou, empatados, com o mais
 *     completo; fraco no fim → aviso para o usuário conferir;
 *   - toda chamada (inclusive o fallback Gemini → OpenAI) soma no medidor.
 *
 * Puro: o chamarIA vem por parâmetro (o index passa o de _shared/ia.ts) —
 * testável em Node.
 */
import type { NivelIA, ProvedorIA } from "../_shared/ia-tipos.ts";
import { contarPreenchidos } from "./edital-regras.ts";
import type { ChamarIA } from "./escalonamento.ts";
import {
  documentoFraco,
  normalizarDocumento,
  promptDocumento,
  SCHEMA_DOCUMENTO_FISCAL,
  type DocumentoFiscal,
  type TipoLancamento,
} from "./financeiro-documento.ts";
import { contabilizar, type MedidorUso } from "./ia-uso.ts";

export const EXTENSOES_DOCUMENTO = ["pdf", "jpg", "jpeg", "png", "webp"] as const;
/** por nível: padrão + forte cabem em ~120 s, como a leitura de edital */
export const TEMPO_LEITURA_MS = 60_000;
export const MAX_TOKENS_LEITURA = 8_000;

const NIVEIS: NivelIA[] = ["padrao", "forte"];

/** null = formato aceito; senão a mensagem para o usuário (HTTP 400) */
export function erroArquivoDocumento(ref: string): string | null {
  const nome = ref.split("/").pop() ?? "";
  const ext = nome.includes(".") ? (nome.split(".").pop() ?? "").toLowerCase() : "";
  if (ext === "heic" || ext === "heif") {
    return "Foto em HEIC (padrão do iPhone) não é aceita — tire a foto em JPEG (iPhone: Ajustes → Câmera → Formatos → Mais Compatível) ou envie o PDF.";
  }
  if (!(EXTENSOES_DOCUMENTO as readonly string[]).includes(ext)) {
    return "Formato não aceito — envie PDF, JPG, PNG ou WEBP.";
  }
  return null;
}

export type ResultadoLeitura =
  | { ok: true; documento: DocumentoFiscal; modelo: string; provedor: ProvedorIA; nivel: NivelIA }
  /** entrada=true → 400 com a mensagem; false → falha da IA (falhaIA no index) */
  | { ok: false; erro: string; entrada: boolean };

const ehTipoLancamento = (v: unknown): v is TipoLancamento => v === "despesa" || v === "receita";

/** campos preenchidos, sem contar avisos/duvidosos (não são dado do documento) */
const pontosDe = (doc: DocumentoFiscal) => contarPreenchidos({ ...doc, avisos: [], duvidosos: [] });

function avisoIncompleto(doc: DocumentoFiscal, tipo: TipoLancamento): string {
  const faltas: string[] = [];
  if (doc.valor_total === null) faltas.push("o valor total");
  const pessoa = tipo === "receita" ? doc.destinatario.nome : doc.emitente.nome;
  if (!pessoa) faltas.push(tipo === "receita" ? "o nome do cliente" : "o nome do fornecedor");
  return `Leitura incompleta: não encontrei ${faltas.join(" nem ")} — confira o documento e preencha à mão.`;
}

export async function lerDocumentoFinanceiro(
  chamar: ChamarIA,
  entrada: { file_ref?: unknown; tipo?: unknown },
  medidor?: MedidorUso
): Promise<ResultadoLeitura> {
  const { file_ref: ref, tipo } = entrada;
  if (typeof ref !== "string" || !ref) {
    return { ok: false, erro: "file_ref é obrigatório", entrada: true };
  }
  if (!ehTipoLancamento(tipo)) {
    return { ok: false, erro: 'tipo deve ser "despesa" ou "receita"', entrada: true };
  }
  const erroArquivo = erroArquivoDocumento(ref);
  if (erroArquivo) return { ok: false, erro: erroArquivo, entrada: true };

  let melhor: {
    documento: DocumentoFiscal;
    fraco: boolean;
    pontos: number;
    modelo: string;
    provedor: ProvedorIA;
    nivel: NivelIA;
  } | null = null;
  let ultimoErro = "IA indisponível";
  for (const nivel of NIVEIS) {
    const r = await chamar({
      prompt: promptDocumento(tipo),
      fileRefs: [ref],
      jsonSchema: SCHEMA_DOCUMENTO_FISCAL,
      nomeSchema: "documento_fiscal",
      strict: true,
      timeoutMs: TEMPO_LEITURA_MS,
      maxOutputTokens: MAX_TOKENS_LEITURA,
      esforco: "low",
      nivel,
    });
    contabilizar(medidor, r);
    if (!r.ok) {
      if (r.erro === "IA_NAO_CONFIGURADA") return { ok: false, erro: r.erro, entrada: false };
      ultimoErro = r.erro;
      continue; // erro/timeout/cortada → tenta o forte
    }
    const documento = normalizarDocumento(r.resultado);
    const fraco = documentoFraco(documento, tipo);
    const pontos = pontosDe(documento);
    if (!melhor || (melhor.fraco && !fraco) || (melhor.fraco === fraco && pontos > melhor.pontos)) {
      melhor = { documento, fraco, pontos, modelo: r.modelo, provedor: r.provedor, nivel };
    }
    if (!fraco) break; // bom o suficiente
  }
  if (!melhor) return { ok: false, erro: ultimoErro, entrada: false };
  if (melhor.fraco) melhor.documento.avisos.push(avisoIncompleto(melhor.documento, tipo));
  return {
    ok: true,
    documento: melhor.documento,
    modelo: melhor.modelo,
    provedor: melhor.provedor,
    nivel: melhor.nivel,
  };
}
```

- [ ] **Step 5: Rodar e ver passar**

```bash
cd /c/Users/javer/sigoobras-base && node --test supabase/functions/ia-processar/financeiro-ler.test.ts
```

Esperado: `ℹ tests 11`, `ℹ pass 11`, `ℹ fail 0`.

- [ ] **Step 6: Commit do módulo da ação**

```bash
cd /c/Users/javer/sigoobras-base && git add supabase/functions/ia-processar/financeiro-ler.ts supabase/functions/ia-processar/financeiro-ler.test.ts && git commit -F - <<'EOF'
feat(financeiro): leitura de PDF/foto do documento fiscal com escalonamento padrão → forte

- lerDocumentoFinanceiro: aceita PDF/JPG/JPEG/PNG/WEBP (HEIC pede JPEG),
  chama a IA com o schema estrito do DocumentoFiscal (60 s, 8000 tokens,
  esforço low) e, se a leitura vier fraca, repete no nível forte
- fica com a leitura não fraca (ou a mais completa) e avisa quando faltou
  o valor total ou a pessoa do lançamento
- toda chamada (inclusive o fallback Gemini → OpenAI) soma no MedidorUso

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

- [ ] **Step 7: Ligar a ação no `index.ts`**

Em `supabase/functions/ia-processar/index.ts` (já com a Task 5), aplicar as cinco edições abaixo.

Edição 1 — documentação da ação nova no cabeçalho (`supabase/functions/ia-processar/index.ts`)

Trocar (literal):

```ts
 *   { acao:"validar_exames_pcmso", pcmso_ref, exames_refs, funcao }
 *     → { success, resultado: { aprovado, pendencias[], resumo } }
 *
 * Leitura de edital (Oportunidades) — ver edital.ts / edital-schemas.ts:
```

por:

```ts
 *   { acao:"validar_exames_pcmso", pcmso_ref, exames_refs, funcao }
 *     → { success, resultado: { aprovado, pendencias[], resumo } }
 *
 * Financeiro — "Ler documento" (financeiro-ler.ts / financeiro-documento.ts):
 *
 *   { acao:"financeiro_ler_documento", file_ref, tipo:"despesa"|"receita" }
 *     → { success, documento: DocumentoFiscal }  (origem "ia"; nada é gravado)
 *     PDF, JPG, JPEG, PNG ou WEBP da empresa do token (HEIC → 400 pedindo
 *     JPEG). Nível padrão e, se vier fraco (sem valor total ou sem a pessoa
 *     do lançamento), o forte — 60 s por nível. Saída normalizada no servidor
 *     (CPF/CNPJ, chave de NF-e com DV, datas, valores, parcelas). Sem cota.
 *
 * Leitura de edital (Oportunidades) — ver edital.ts / edital-schemas.ts:
```

Edição 2 — import do módulo da ação (`supabase/functions/ia-processar/index.ts`)

Trocar (literal):

```ts
import { chamarComEscalonamento } from "./escalonamento.ts";
```

por:

```ts
import { chamarComEscalonamento } from "./escalonamento.ts";
import { lerDocumentoFinanceiro } from "./financeiro-ler.ts";
```

Edição 3 — campos da ação no corpo da requisição (`supabase/functions/ia-processar/index.ts`)

Trocar (literal):

```ts
  funcao?: string;
  // edital_* (validados em edital.ts)
```

por:

```ts
  funcao?: string;
  // financeiro_ler_documento (validados em financeiro-ler.ts)
  file_ref?: unknown;
  tipo?: unknown;
  // edital_* (validados em edital.ts)
```

Edição 4 — a ref da ação passa pela mesma guarda de empresa (`supabase/functions/ia-processar/index.ts`)

Trocar (literal):

```ts
      ...(body.exames_refs ?? []),
    ];
```

por:

```ts
      ...(body.exames_refs ?? []),
      ...(body.file_ref ? [body.file_ref] : []),
    ];
```

Edição 5 — a ação na cadeia, antes das de edital (`supabase/functions/ia-processar/index.ts`)

Trocar (literal):

```ts
      if (ehAcaoEdital(body.acao)) {
        const acao = body.acao;
```

por:

```ts
      if (body.acao === "financeiro_ler_documento") {
        // ref já conferida acima (mesma empresa do token); formato, tipo e
        // escalonamento padrão → forte em financeiro-ler.ts; uso gravado no finally
        const r = await lerDocumentoFinanceiro(
          chamarIA,
          { file_ref: body.file_ref, tipo: body.tipo },
          medidor
        );
        if (!r.ok) return r.entrada ? fail(r.erro, 400) : falhaIA(r);
        return ok({ documento: r.documento });
      }

      if (ehAcaoEdital(body.acao)) {
        const acao = body.acao;
```

Conferência rápida:

```bash
cd /c/Users/javer/sigoobras-base && grep -n 'financeiro_ler_documento\|lerDocumentoFinanceiro\|body\.file_ref\b' supabase/functions/ia-processar/index.ts
```

Esperado: 7 linhas (o `\b` deixa `body.file_refs` de fora) — cabeçalho (`acao:"financeiro_ler_documento"`), import, comentário do `Body`, guarda (`...(body.file_ref ? [body.file_ref] : [])`), o `if` da ação, a chamada `lerDocumentoFinanceiro(` e `{ file_ref: body.file_ref, tipo: body.tipo }`.

- [ ] **Step 8: Checar imports/exports da função inteira (bundle sem rede)**

```bash
cd /c/Users/javer/sigoobras-base && npx esbuild supabase/functions/ia-processar/index.ts --bundle --format=esm --platform=neutral "--external:https://*" --log-level=warning > /dev/null && echo BUNDLE_OK
```

Esperado: `BUNDLE_OK` e nenhum `No matching export`.

- [ ] **Step 9: Checar tipos do `ia-processar` (tsc com shims dos imports por URL e do `Deno`)**

```bash
cd /c/Users/javer/sigoobras-base && T=$(mktemp -d) && cat > "$T/shims.d.ts" <<'EOF'
declare module "https://*" {
  const x: any;
  export default x;
  export const createClient: any;
  export const PDFDocument: any;
  export const StandardFonts: any;
  export const rgb: any;
}
declare const Deno: any;
EOF
echo "erros_ia_processar=$(npx tsc --noEmit --allowImportingTsExtensions --target es2022 --module esnext --moduleResolution bundler --strict --skipLibCheck --lib es2022,dom "$T/shims.d.ts" supabase/functions/ia-processar/index.ts 2>&1 | grep "error TS" | grep -c "ia-processar/")"; rm -rf "$T"
```

Esperado: `erros_ia_processar=0`. Erros em `_shared/*.ts` são efeito dos shims (`any`) e não contam. Se aparecer erro em `ia-processar/`, liste com o mesmo `npx tsc …` sem o `grep -c` e corrija antes do commit.

- [ ] **Step 10: Rodar todos os testes do backend**

```bash
cd /c/Users/javer/sigoobras-base && node --test supabase/functions/ia-processar/*.test.ts supabase/functions/_shared/*.test.ts
```

Esperado: `ℹ fail 0` (na montagem do plano: `ℹ tests 118`).

- [ ] **Step 11: Commit do `index.ts`**

```bash
cd /c/Users/javer/sigoobras-base && git add supabase/functions/ia-processar/index.ts && git commit -F - <<'EOF'
feat(financeiro): ação financeiro_ler_documento na ia-processar

- { acao:"financeiro_ler_documento", file_ref, tipo } → { documento }
  (DocumentoFiscal normalizado, origem "ia"); nada é gravado
- file_ref passa pela mesma guarda das outras refs (validarRef + empresa
  do token); formato/tipo inválidos → 400, IA sem chave → 503
- uso gravado em ia_uso pelo finally da Task 5; sem cota diária

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

- [ ] **Step 12: Não publicar aqui**

A `ia-processar` com esta ação só vai para produção na Task 16, **depois** de pedir OK ao Javerson (e depois das telas das Tasks 13–15, que são quem chama a ação). Comando daquela Task (verify_jwt continua ligado, então **sem** `--no-verify-jwt`):

```bash
npx supabase@2.118.0 functions deploy ia-processar --project-ref fpyvdwpvxrubrkdwrqbs --use-api
```

Publicar antes das telas não quebra nada (a ação nova só responde a quem a chama), mas não há motivo para fazê-lo fora da Task 16.

## Parte B — telas: "Ler documento" na nova despesa e na nova receita (Tasks 13 a 16)

Todos os comandos rodam no Git Bash, na raiz do repositório (`/c/Users/javer/sigoobras-base`); os do front usam um subshell `(cd apps/web && …)` para não mudar a pasta dos passos seguintes. As Tasks 13 a 15 só mexem em código e dependem das Tasks 9 (`lerXmlFiscal`), 10 (`montarPreenchimento`, `acharPessoa`, `categoriaDoFornecedor` na lib) e 12 (ação `financeiro_ler_documento`). A lógica nova fica em funções puras testadas com vitest (`lib/ler-documento.js`, `lib/importacao-xml.js`); os componentes não têm teste (vitest roda em node, sem DOM) — neles a verificação é lint (com `no-undef` ligado na linha de comando, porque a config do repo não liga e o build não pega identificador sem import) + build, e a conferência no navegador é a Task 16, com o Javerson. A Task 16 é a única que toca produção, e cada passo de produção começa pedindo OK ao Javerson.

### Task 13: Botão "Ler documento" e cadastro rápido com os dados lidos

**Files:**

- Create: `apps/web/src/lib/ler-documento.js` (~175 linhas)
- Test: `apps/web/src/lib/ler-documento.test.js` (~190 linhas)
- Create: `apps/web/src/components/financeiro/LerDocumentoButton.jsx` (~165 linhas)
- Modify: `apps/web/src/components/fornecedores/NovoFornecedorConfigSheet.jsx` (import ~linha 7; props e efeito ~linhas 46–54)
- Modify: `apps/web/src/components/clientes/NovoClienteModal.jsx` (import ~linha 15; assinatura e estado ~linhas 52–55)

**Interfaces:**

- Consumes:
  - `lerXmlFiscal(texto): DocumentoFiscal | null` (Task 9, `@/lib/nfe-xml`);
  - `limparCnpj(valor): string` (`@/lib/cnpj`, já existe) e `refDoUpload(res): string | null` (`@/lib/anexo-ref`, já existe);
  - `sigo.integrations.Core.UploadFile({ file, fileName, mimeType, bucket })` → `{ ref, bucket, path, file_url, mime_type }` (`shared/sdk/src/integrations.js`);
  - `sigo.functions.invoke("iaProcessar", { acao: "financeiro_ler_documento", file_ref, tipo })` → `{ data }` com `data.success === false` + `data.error` no erro, ou `{ success: true, documento }` (Task 12 responde `ok({ documento })`).
- Produces:
  - `lib/ler-documento.js`:
    - `ACEITAR_DOCUMENTO = ".xml,application/pdf,image/jpeg,image/png,image/webp"`;
    - `classificarArquivo(arquivo) → { ok: true, modo: "xml" | "ia", bucket: "nfe-xml" | "comprovantes", mimeType, nomeArquivo } | { ok: false, erro }`;
    - `rotuloCampo(campo): string` e `listaConferir(duvidosos, avisos) → { campos: string[], avisos: string[] }`;
    - `formatarCpfCnpj(valor): string`;
    - `dadosIniciaisCadastro(pessoaSugerida, "cnpj" | "documento") → { nome_razao, cnpj | documento, endereco } | null`;
    - `mesclarDadosIniciais(formVazio, dadosIniciais, "cnpj" | "documento") → form`.
  - `components/financeiro/LerDocumentoButton.jsx`:
    - `export default function LerDocumentoButton({ tipo, onLido, disabled, className })`, com `onLido({ documento, anexo: { nome, url /* ref "bucket/path" */, tipo /* mime */ } })`;
    - `export function ConferirLeitura({ duvidosos, avisos })` (aviso "Confira os campos destacados"; nada a conferir → não renderiza);
    - `export function PessoaNaoCadastrada({ rotulo, pessoa, onCadastrar })` (faixa "Fornecedor/Cliente não cadastrado: NOME (CNPJ) [Cadastrar]"; `pessoa` nula → não renderiza).
  - `NovoFornecedorConfigSheet` ganha a prop `dadosIniciais` (`{ nome_razao, cnpj, endereco }`) e `NovoClienteModal` ganha `dadosIniciais` (`{ nome_razao, documento, endereco }`); sem a prop, os dois funcionam como hoje.
- Decisões que o contrato não fixava:
  - O mime e o nome do upload saem de `classificarArquivo`: o bucket `nfe-xml` só aceita `text/xml`/`application/xml` e o navegador às vezes manda o `.xml` sem tipo; a `ia-processar` confere a extensão do caminho (pdf/jpg/jpeg/png/webp), então `foto.jfif` sobe como `foto.jfif.jpg`. Os limites dos buckets (10 MB `comprovantes`, 5 MB `nfe-xml`, migração 0015) são checados antes de subir; HEIC é recusado já no navegador com a mesma orientação do servidor.
  - `ConferirLeitura` e `PessoaNaoCadastrada` são exports nomeados do mesmo arquivo para não repetir o JSX nas duas telas (Tasks 14 e 15).
  - `dadosIniciais` precisa ser referência estável (o pai guarda em estado): o efeito que preenche o formulário depende dela. O CPF/CNPJ vem formatado e o tipo de pessoa sai da quantidade de dígitos (11 → PF, 14 → PJ). O endereço lido é uma linha só e vai inteiro no campo "Endereço" (a pessoa ajusta ou usa "Buscar CNPJ").
  - Se a IA falhar depois do upload, o arquivo fica no bucket sem uso (como já acontece com um anexo removido antes de salvar) e o formulário não muda.

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/web/src/lib/ler-documento.test.js`:

```js
import { describe, it, expect } from "vitest";
import {
  ACEITAR_DOCUMENTO,
  classificarArquivo,
  dadosIniciaisCadastro,
  formatarCpfCnpj,
  listaConferir,
  mesclarDadosIniciais,
  rotuloCampo,
} from "./ler-documento";

const MB = 1024 * 1024;
// o input entrega um File; aqui basta o que a função lê
const arq = (name, type, size = 2048) => ({ name, type, size });

describe("classificarArquivo", () => {
  it("XML é lido no navegador e sobe no bucket nfe-xml, mesmo sem tipo", () => {
    expect(classificarArquivo(arq("nota.xml", ""))).toEqual({
      ok: true,
      modo: "xml",
      bucket: "nfe-xml",
      mimeType: "text/xml",
      nomeArquivo: "nota.xml",
    });
    expect(classificarArquivo(arq("35260911.XML", "application/xml"))).toMatchObject({
      ok: true,
      modo: "xml",
      mimeType: "application/xml",
      nomeArquivo: "35260911.XML",
    });
  });

  it("PDF e foto vão para a IA pelo bucket comprovantes", () => {
    expect(classificarArquivo(arq("danfe.pdf", "application/pdf"))).toEqual({
      ok: true,
      modo: "ia",
      bucket: "comprovantes",
      mimeType: "application/pdf",
      nomeArquivo: "danfe.pdf",
    });
    expect(classificarArquivo(arq("recibo.JPG", ""))).toMatchObject({
      ok: true,
      modo: "ia",
      mimeType: "image/jpeg",
      nomeArquivo: "recibo.JPG",
    });
    expect(classificarArquivo(arq("boleto.webp", "image/webp"))).toMatchObject({
      ok: true,
      mimeType: "image/webp",
    });
  });

  it("extensão que a ia-processar não aceita ganha a do tipo", () => {
    expect(classificarArquivo(arq("foto.jfif", "image/jpeg"))).toMatchObject({
      ok: true,
      mimeType: "image/jpeg",
      nomeArquivo: "foto.jfif.jpg",
    });
    expect(classificarArquivo(arq("captura", "image/png"))).toMatchObject({
      ok: true,
      nomeArquivo: "captura.png",
    });
  });

  it("HEIC é recusado pedindo JPEG", () => {
    expect(classificarArquivo(arq("IMG_0001.HEIC", "")).erro).toMatch(/HEIC.*JPEG/);
    expect(classificarArquivo(arq("foto", "image/heif")).ok).toBe(false);
  });

  it("formato fora da lista, arquivo vazio ou grande demais → erro", () => {
    expect(classificarArquivo(arq("planilha.xlsx", "application/vnd.ms-excel"))).toEqual({
      ok: false,
      erro: "Formato não aceito — envie XML, PDF, JPG, PNG ou WEBP.",
    });
    expect(classificarArquivo(arq("vazio.pdf", "application/pdf", 0))).toEqual({
      ok: false,
      erro: "O arquivo está vazio.",
    });
    expect(classificarArquivo(arq("grande.pdf", "application/pdf", 11 * MB))).toEqual({
      ok: false,
      erro: "Arquivo grande demais (11,0 MB) — o limite é 10 MB.",
    });
    expect(classificarArquivo(arq("grande.xml", "text/xml", 6 * MB)).erro).toBe(
      "Arquivo grande demais (6,0 MB) — o limite é 5 MB."
    );
    expect(classificarArquivo(null)).toEqual({ ok: false, erro: "Nenhum arquivo escolhido." });
  });

  it("o accept do input segue a spec", () => {
    expect(ACEITAR_DOCUMENTO).toBe(".xml,application/pdf,image/jpeg,image/png,image/webp");
  });
});

describe("listaConferir", () => {
  it("campos duvidosos viram rótulos sem repetir; avisos sem vazios nem repetidos", () => {
    expect(
      listaConferir(
        ["valor_total", "emitente.documento", "vencimentos[1].data", "vencimentos.0.valor", "valor_total"],
        ["Soma dos vencimentos difere do total.", " ", "Soma dos vencimentos difere do total."]
      )
    ).toEqual({
      campos: ["Valor", "CNPJ/CPF do emitente", "Vencimentos"],
      avisos: ["Soma dos vencimentos difere do total."],
    });
  });

  it("nada a conferir → listas vazias", () => {
    expect(listaConferir(undefined, null)).toEqual({ campos: [], avisos: [] });
  });

  it("campo desconhecido aparece como veio; subcampo desconhecido cai no grupo", () => {
    expect(rotuloCampo("placa_veiculo")).toBe("placa_veiculo");
    expect(rotuloCampo("emitente.cep")).toBe("Emitente");
    expect(rotuloCampo("itens.3.quantidade")).toBe("Itens");
    expect(rotuloCampo("  ")).toBe("");
  });
});

describe("cadastro rápido da pessoa lida", () => {
  it("formatarCpfCnpj formata 14 e 11 dígitos; o resto fica como veio", () => {
    expect(formatarCpfCnpj("11222333000181")).toBe("11.222.333/0001-81");
    expect(formatarCpfCnpj("12345678909")).toBe("123.456.789-09");
    expect(formatarCpfCnpj("123")).toBe("123");
    expect(formatarCpfCnpj(null)).toBe("");
  });

  it("dadosIniciaisCadastro monta a prop do fornecedor (cnpj) e do cliente (documento)", () => {
    const pessoa = {
      nome: "ELETRICA M&M LTDA",
      documento: "11222333000181",
      endereco: "RUA DAS FLORES, 100 - CENTRO - SAO PAULO/SP - CEP 01001-000",
    };
    expect(dadosIniciaisCadastro(pessoa, "cnpj")).toEqual({
      nome_razao: "ELETRICA M&M LTDA",
      cnpj: "11.222.333/0001-81",
      endereco: "RUA DAS FLORES, 100 - CENTRO - SAO PAULO/SP - CEP 01001-000",
    });
    expect(
      dadosIniciaisCadastro({ nome: "JOSE DA SILVA", documento: "12345678909", endereco: null }, "documento")
    ).toEqual({ nome_razao: "JOSE DA SILVA", documento: "123.456.789-09", endereco: "" });
    expect(dadosIniciaisCadastro(null, "cnpj")).toBeNull();
  });

  it("mesclarDadosIniciais preenche só campos do formulário, com o tipo pelos dígitos", () => {
    const vazio = { nome_razao: "", tipo_pessoa: "PJ", cnpj: "", endereco: "", cidade: "" };
    expect(
      mesclarDadosIniciais(
        vazio,
        { nome_razao: " JOSE DA SILVA ", cnpj: "123.456.789-09", endereco: "", extra: "x" },
        "cnpj"
      )
    ).toEqual({
      nome_razao: "JOSE DA SILVA",
      tipo_pessoa: "PF",
      cnpj: "123.456.789-09",
      endereco: "",
      cidade: "",
    });
    expect(mesclarDadosIniciais(vazio, null, "cnpj")).toEqual(vazio);
    expect(mesclarDadosIniciais(vazio, null, "cnpj")).not.toBe(vazio);
    expect(
      mesclarDadosIniciais({ ...vazio, tipo_pessoa: "PF" }, { cnpj: "11.222.333/0001-81" }, "cnpj").tipo_pessoa
    ).toBe("PJ");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `(cd apps/web && npx vitest run src/lib/ler-documento.test.js)`
Expected (FAIL):

```
 FAIL  src/lib/ler-documento.test.js [ src/lib/ler-documento.test.js ]
Error: Cannot find module './ler-documento' imported from '.../apps/web/src/lib/ler-documento.test.js'
 Test Files  1 failed (1)
      Tests  no tests
```

- [ ] **Step 3: Implementar as regras puras**

Criar `apps/web/src/lib/ler-documento.js`:

```js
/**
 * ler-documento — regras puras do botão "Ler documento" (Financeiro → nova
 * despesa / nova receita) e do cadastro rápido da pessoa lida.
 *
 *   - classificarArquivo: XML (NF-e, NFC-e, NFS-e) é lido no navegador e sobe
 *     no bucket nfe-xml; PDF e foto sobem no bucket comprovantes e são lidos
 *     pela IA. Os buckets só aceitam os mimes e tamanhos da migração 0015 e o
 *     navegador às vezes manda o arquivo sem tipo — por isso o mime e o nome
 *     (com a extensão que a ia-processar confere) saem daqui;
 *   - listaConferir: o que o aviso "Confira os campos destacados" mostra;
 *   - dadosIniciaisCadastro / mesclarDadosIniciais: `pessoaSugerida` do
 *     montarPreenchimento → formulário de Novo Fornecedor / Novo Cliente.
 */
import { limparCnpj } from "./cnpj";

/** `accept` do input do botão (lista fixada na spec). */
export const ACEITAR_DOCUMENTO = ".xml,application/pdf,image/jpeg,image/png,image/webp";

const MB = 1024 * 1024;
/** file_size_limit dos buckets (migração 0015) */
const LIMITE_MB = { comprovantes: 10, "nfe-xml": 5 };

const MIME_POR_EXTENSAO = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};
const EXTENSAO_POR_MIME = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const MIMES_XML = ["text/xml", "application/xml"];

const extensaoDe = (nome) => {
  const m = String(nome || "")
    .toLowerCase()
    .match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
};

/**
 * Como o arquivo escolhido é lido e onde ele sobe.
 * @param {{ name?: string, type?: string, size?: number } | null} arquivo File do input
 * @returns {{ ok: true, modo: "xml" | "ia", bucket: "nfe-xml" | "comprovantes",
 *   mimeType: string, nomeArquivo: string } | { ok: false, erro: string }}
 */
export function classificarArquivo(arquivo) {
  if (!arquivo) return { ok: false, erro: "Nenhum arquivo escolhido." };
  const nome = String(arquivo.name || "").trim() || "documento";
  const ext = extensaoDe(nome);
  const tipo = String(arquivo.type || "").toLowerCase();

  if (ext === "heic" || ext === "heif" || /^image\/hei[cf]/.test(tipo)) {
    return {
      ok: false,
      erro: "Foto em HEIC (padrão do iPhone) não é aceita — tire a foto em JPEG (iPhone: Ajustes → Câmera → Formatos → Mais Compatível) ou envie o PDF.",
    };
  }

  let destino;
  if (ext === "xml" || MIMES_XML.includes(tipo)) {
    destino = {
      modo: "xml",
      bucket: "nfe-xml",
      mimeType: MIMES_XML.includes(tipo) ? tipo : "text/xml",
      nomeArquivo: ext === "xml" ? nome : `${nome}.xml`,
    };
  } else {
    const mimeType = EXTENSAO_POR_MIME[tipo] ? tipo : MIME_POR_EXTENSAO[ext];
    if (!mimeType) {
      return { ok: false, erro: "Formato não aceito — envie XML, PDF, JPG, PNG ou WEBP." };
    }
    destino = {
      modo: "ia",
      bucket: "comprovantes",
      mimeType,
      // a ia-processar confere a extensão do caminho (pdf/jpg/jpeg/png/webp)
      nomeArquivo: MIME_POR_EXTENSAO[ext] ? nome : `${nome}.${EXTENSAO_POR_MIME[mimeType]}`,
    };
  }

  const tamanho = Number(arquivo.size) || 0;
  if (tamanho <= 0) return { ok: false, erro: "O arquivo está vazio." };
  const limite = LIMITE_MB[destino.bucket];
  if (tamanho > limite * MB) {
    const mb = (tamanho / MB).toFixed(1).replace(".", ",");
    return { ok: false, erro: `Arquivo grande demais (${mb} MB) — o limite é ${limite} MB.` };
  }
  return { ok: true, ...destino };
}

const ROTULOS_CAMPO = {
  tipo: "Tipo do documento",
  numero: "Número",
  chave: "Chave da NF-e",
  data_emissao: "Data de emissão",
  valor_total: "Valor",
  emitente: "Emitente",
  "emitente.nome": "Nome do emitente",
  "emitente.documento": "CNPJ/CPF do emitente",
  "emitente.ie": "Inscrição estadual do emitente",
  "emitente.endereco": "Endereço do emitente",
  destinatario: "Destinatário",
  "destinatario.nome": "Nome do destinatário",
  "destinatario.documento": "CNPJ/CPF do destinatário",
  vencimentos: "Vencimentos",
  forma_pagamento: "Forma de pagamento",
  descricao: "Descrição",
  itens: "Itens",
};

/**
 * Rótulo do campo que a IA marcou em `duvidosos` ("valor_total",
 * "emitente.documento", "vencimentos[1].data"...). Desconhecido → o próprio texto.
 */
export function rotuloCampo(campo) {
  const bruto = String(campo ?? "").trim();
  if (!bruto) return "";
  // a posição na lista não importa: "vencimentos[1].data" / "itens.2.quantidade" → a lista
  const chave = bruto.replace(/\[\d+\].*$/, "").replace(/\.\d+(\..*)?$/, "");
  return ROTULOS_CAMPO[chave] || ROTULOS_CAMPO[chave.split(".")[0]] || bruto;
}

/**
 * O que o aviso "Confira os campos destacados" lista.
 * @param {string[] | undefined} duvidosos DocumentoFiscal.duvidosos
 * @param {string[] | undefined} avisos DocumentoFiscal.avisos
 * @returns {{ campos: string[], avisos: string[] }} sem repetição e sem vazios
 */
export function listaConferir(duvidosos, avisos) {
  const campos = [];
  for (const c of duvidosos || []) {
    const r = rotuloCampo(c);
    if (r && !campos.includes(r)) campos.push(r);
  }
  const textos = (avisos || []).map((a) => String(a ?? "").trim()).filter(Boolean);
  return { campos, avisos: [...new Set(textos)] };
}

/** CNPJ (14 dígitos) e CPF (11) com pontuação; o resto fica como veio. */
export function formatarCpfCnpj(valor) {
  const d = limparCnpj(valor);
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return String(valor ?? "").trim();
}

/**
 * `pessoaSugerida` ({ nome, documento, endereco }) → prop `dadosIniciais` do
 * cadastro rápido: fornecedor usa `cnpj`, cliente usa `documento`.
 * @param {"cnpj" | "documento"} campoDocumento
 */
export function dadosIniciaisCadastro(pessoa, campoDocumento) {
  if (!pessoa) return null;
  return {
    nome_razao: pessoa.nome || "",
    [campoDocumento]: formatarCpfCnpj(pessoa.documento),
    endereco: pessoa.endereco || "",
  };
}

/**
 * Formulário vazio do cadastro + `dadosIniciais` (só os campos que existem no
 * formulário e vieram preenchidos). CPF (11 dígitos) → PF; CNPJ (14) → PJ.
 * @param {"cnpj" | "documento"} campoDocumento
 */
export function mesclarDadosIniciais(formVazio, dados, campoDocumento) {
  const form = { ...formVazio };
  if (!dados) return form;
  for (const [campo, valor] of Object.entries(dados)) {
    if (campo in formVazio && typeof valor === "string" && valor.trim()) form[campo] = valor.trim();
  }
  if ("tipo_pessoa" in formVazio) {
    const digitos = limparCnpj(form[campoDocumento]);
    if (digitos.length === 11) form.tipo_pessoa = "PF";
    else if (digitos.length === 14) form.tipo_pessoa = "PJ";
  }
  return form;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `(cd apps/web && npx vitest run src/lib/ler-documento.test.js)`
Expected (PASS):

```
 ✓ src/lib/ler-documento.test.js (12 tests)
 Test Files  1 passed (1)
      Tests  12 passed (12)
```

- [ ] **Step 5: Criar o botão**

Criar `apps/web/src/components/financeiro/LerDocumentoButton.jsx`:

```jsx
import React, { useRef, useState } from "react";
import { AlertTriangle, FileSearch, Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { sigo } from "@/api/sigoClient";
import { refDoUpload } from "@/lib/anexo-ref";
import { lerXmlFiscal, textoDoXml } from "@/lib/nfe-xml";
import { ACEITAR_DOCUMENTO, classificarArquivo, formatarCpfCnpj, listaConferir } from "@/lib/ler-documento";

/**
 * "Ler documento" do Financeiro (nova despesa / nova receita).
 *
 *   - XML (NF-e, NFC-e, NFS-e): lido aqui no navegador (lerXmlFiscal, sem IA)
 *     e guardado como anexo no bucket nfe-xml;
 *   - PDF ou foto: sobe no bucket comprovantes e a ia-processar
 *     (acao "financeiro_ler_documento") devolve o DocumentoFiscal.
 *
 * O arquivo sobe UMA vez e vira o anexo. Nada é salvo aqui: a tela recebe
 * onLido({ documento, anexo: { nome, url: ref "bucket/path", tipo } }) e
 * preenche o formulário para o usuário conferir. Erro → toast; o formulário
 * fica como estava.
 *
 * @param {{ tipo: "despesa" | "receita", onLido: Function, disabled?: boolean, className?: string }} props
 */
export default function LerDocumentoButton({ tipo, onLido, disabled, className }) {
  const inputRef = useRef(null);
  const [etapa, setEtapa] = useState(null); // null | "enviando" | "lendo"

  const enviar = async (arquivo, destino) => {
    setEtapa("enviando");
    const ref = refDoUpload(
      await sigo.integrations.Core.UploadFile({
        file: arquivo,
        fileName: destino.nomeArquivo,
        mimeType: destino.mimeType,
        bucket: destino.bucket,
      })
    );
    if (!ref) throw new Error("o arquivo não foi enviado, tente de novo");
    return ref;
  };

  const ler = async (arquivo) => {
    const destino = classificarArquivo(arquivo);
    if (!destino.ok) {
      toast.error(destino.erro);
      return;
    }
    try {
      let documento;
      let ref;
      if (destino.modo === "xml") {
        documento = lerXmlFiscal(await textoDoXml(arquivo));
        if (!documento) {
          toast.error("XML não reconhecido — envie o XML de uma NF-e, NFC-e ou NFS-e.");
          return;
        }
        ref = await enviar(arquivo, destino);
      } else {
        ref = await enviar(arquivo, destino);
        setEtapa("lendo");
        const { data } = await sigo.functions.invoke("iaProcessar", {
          acao: "financeiro_ler_documento",
          file_ref: ref,
          tipo,
        });
        if (data?.success === false) throw new Error(data.error || "IA indisponível");
        documento = data?.documento;
        if (!documento) throw new Error("a leitura não devolveu os dados");
      }
      onLido({ documento, anexo: { nome: arquivo.name, url: ref, tipo: destino.mimeType } });
      toast.success("Documento lido — confira os campos antes de salvar.");
    } catch (err) {
      toast.error("Não foi possível ler o documento: " + (err?.message || "tente de novo"));
    } finally {
      setEtapa(null);
    }
  };

  const ocupado = etapa !== null;
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACEITAR_DOCUMENTO}
        className="hidden"
        onChange={(e) => {
          const arquivo = e.target.files?.[0];
          e.target.value = ""; // deixa escolher o mesmo arquivo de novo
          if (arquivo) ler(arquivo);
        }}
      />
      <Button
        type="button"
        variant="outline"
        className={className}
        disabled={disabled || ocupado}
        onClick={() => inputRef.current?.click()}
        title="XML da nota (sem IA), PDF ou foto: DANFE, NFS-e, cupom, recibo, boleto, PIX"
      >
        {ocupado ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileSearch className="w-4 h-4 mr-2" />}
        {etapa === "lendo"
          ? "Lendo documento…"
          : etapa === "enviando"
            ? "Enviando arquivo…"
            : "Ler documento (XML, PDF ou foto)"}
      </Button>
    </>
  );
}

/** Aviso "Confira os campos destacados": campos lidos com dúvida + avisos da leitura. */
export function ConferirLeitura({ duvidosos, avisos }) {
  const { campos, avisos: textos } = listaConferir(duvidosos, avisos);
  if (campos.length === 0 && textos.length === 0) return null;
  return (
    <div className="p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800">
      <p className="font-semibold flex items-center gap-1">
        <AlertTriangle className="w-4 h-4" />
        Confira os campos destacados
      </p>
      {campos.length > 0 && <p className="mt-1">Lidos com dúvida: {campos.join(", ")}.</p>}
      {textos.length > 0 && (
        <ul className="mt-1 list-disc pl-5 space-y-0.5">
          {textos.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Faixa "Fornecedor/Cliente não cadastrado: NOME (CNPJ) [Cadastrar]". */
export function PessoaNaoCadastrada({ rotulo, pessoa, onCadastrar }) {
  if (!pessoa) return null;
  return (
    <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-sm flex items-center justify-between gap-2">
      <span className="text-amber-800 min-w-0">
        {rotulo} não cadastrado: <strong>{pessoa.nome || "sem nome"}</strong>
        {pessoa.documento ? ` (${formatarCpfCnpj(pessoa.documento)})` : ""}
      </span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="shrink-0 border-amber-300 text-amber-800 hover:bg-amber-100"
        onClick={onCadastrar}
      >
        <UserPlus className="w-4 h-4 mr-1" />
        Cadastrar
      </Button>
    </div>
  );
}
```

- [ ] **Step 6: `dadosIniciais` no cadastro rápido de fornecedor**

Em `apps/web/src/components/fornecedores/NovoFornecedorConfigSheet.jsx` (linha 7), trocar:

```jsx
import { formatarTelefone, mensagemTelefoneInvalido, telefoneValido } from "@/lib/telefone";
import { Input } from "@/components/ui/input";
```

por:

```jsx
import { formatarTelefone, mensagemTelefoneInvalido, telefoneValido } from "@/lib/telefone";
import { mesclarDadosIniciais } from "@/lib/ler-documento";
import { Input } from "@/components/ui/input";
```

Em `apps/web/src/components/fornecedores/NovoFornecedorConfigSheet.jsx` (linhas 46–54), trocar:

```jsx
  empresaAtiva,
  onFornecedorCriado,
}) {
  const [form, setForm] = useState(FORM_VAZIO);
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (open) setForm(FORM_VAZIO);
  }, [open]);
```

por:

```jsx
  empresaAtiva,
  onFornecedorCriado,
  // { nome_razao, cnpj, endereco } lidos de um documento (Financeiro → Ler
  // documento); o pai guarda em estado (referência estável) e passa null no
  // cadastro em branco
  dadosIniciais,
}) {
  const [form, setForm] = useState(FORM_VAZIO);
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (open) setForm(mesclarDadosIniciais(FORM_VAZIO, dadosIniciais, "cnpj"));
  }, [open, dadosIniciais]);
```

- [ ] **Step 7: `dadosIniciais` no cadastro rápido de cliente**

Em `apps/web/src/components/clientes/NovoClienteModal.jsx` (linha 15), trocar:

```jsx
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
```

por:

```jsx
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { mesclarDadosIniciais } from "@/lib/ler-documento";
import { toast } from "sonner";
```

Em `apps/web/src/components/clientes/NovoClienteModal.jsx` (linhas 52–55), trocar:

```jsx
export default function NovoClienteModal({ open, onOpenChange, empresaAtiva, onClienteCriado }) {
  const [form, setForm] = useState(FORM_INICIAL);
  const [saving, setSaving] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);
```

por:

```jsx
export default function NovoClienteModal({
  open,
  onOpenChange,
  empresaAtiva,
  onClienteCriado,
  // { nome_razao, documento, endereco } lidos de um documento (Financeiro →
  // Ler documento); o pai guarda em estado (referência estável)
  dadosIniciais,
}) {
  const [form, setForm] = useState(() =>
    mesclarDadosIniciais(FORM_INICIAL, dadosIniciais, "documento")
  );
  const [saving, setSaving] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);

  React.useEffect(() => {
    if (open && dadosIniciais) {
      setForm(mesclarDadosIniciais(FORM_INICIAL, dadosIniciais, "documento"));
    }
  }, [open, dadosIniciais]);
```

(Os outros usos do `NovoClienteModal` — `ProjetoFormSheet` e `Oportunidades` — não passam a prop e continuam iguais: sem `dadosIniciais`, o efeito não faz nada e o estado inicial é o formulário vazio.)

- [ ] **Step 8: Lint, testes do front e build**

Run:

```bash
(cd apps/web && npx eslint --quiet --rule '{"no-undef":"error","react/jsx-no-undef":"error"}' src/components/financeiro/LerDocumentoButton.jsx src/components/fornecedores/NovoFornecedorConfigSheet.jsx src/components/clientes/NovoClienteModal.jsx && echo LINT_OK)
(cd apps/web && npx vitest run)
(cd apps/web && npm run build > /dev/null && echo BUILD_OK)
```

Expected:

- `LINT_OK` (o `--rule` extra liga `no-undef`, que a config do repo não liga);
- vitest: nenhuma falha, +1 arquivo e +12 testes em relação ao fim da Task 12;
- `BUILD_OK` (o `vite.config.js` usa `logLevel: "error"`, então o build não imprime resumo; o botão ainda não é usado por nenhuma tela — as Tasks 14 e 15 ligam).

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/lib/ler-documento.js apps/web/src/lib/ler-documento.test.js apps/web/src/components/financeiro/LerDocumentoButton.jsx apps/web/src/components/fornecedores/NovoFornecedorConfigSheet.jsx apps/web/src/components/clientes/NovoClienteModal.jsx
git commit -F - <<'EOF'
feat(financeiro): botão "Ler documento" (XML, PDF ou foto) e cadastro rápido com os dados lidos

XML de NF-e/NFC-e/NFS-e é lido no navegador e guardado no bucket nfe-xml;
PDF e foto sobem uma vez no bucket comprovantes e a ia-processar devolve
o DocumentoFiscal. O botão só entrega { documento, anexo } para a tela
conferir; nada é salvo. Novo Fornecedor e Novo Cliente aceitam
dadosIniciais (nome, CPF/CNPJ e endereço lidos).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log --oneline -1
```

Expected: o lint-staged roda o prettier nos 5 arquivos e o commit sai; `git log` mostra `feat(financeiro): botão "Ler documento" (XML, PDF ou foto) e cadastro rápido com os dados lidos`.

### Task 14: "Ler documento" na nova despesa + importação de XML pela lista sem fornecedor duplicado

**Files:**

- Create: `apps/web/src/lib/importacao-xml.js` (~95 linhas)
- Test: `apps/web/src/lib/importacao-xml.test.js` (~205 linhas)
- Modify: `apps/web/src/components/financeiro/DespesaModal.jsx` (imports ~34–35; props ~65–67; estado ~97; `handleImportarXML` ~141–287 → `aplicarDocumentoLido`; topo do formulário ~430–432; fornecedor ~538–543; seção da NF-e ~685–716; `NovoFornecedorConfigSheet` ~1536–1545)
- Modify: `apps/web/src/components/financeiro/DespesasTab.jsx` (import ~36–37; `handleRemoverAnexo` ~241–243; `handleImportarXML` ~343–467; `handleOpen` ~852–855 e ~885–888; `handleSave` ~974–975; render do `DespesaModal` ~2190–2191)

**Interfaces:**

- Consumes:
  - `lerXmlFiscal(texto)` (Task 9); `montarPreenchimento(doc, { tipo, pessoas, categorias }) → { patch, parcelas, itens, pessoaSugerida, avisos }` e `acharPessoa(pessoas, { nome, documento }, "cnpj" | "documento")` (Task 10, `@/lib/documento-financeiro`); `categoriaDoFornecedor(fornecedor, categorias)` (Task 10, `@/lib/categorias-fornecedor`);
  - `LerDocumentoButton`, `ConferirLeitura`, `PessoaNaoCadastrada`, `dadosIniciaisCadastro`, `limparCnpj` e a prop `dadosIniciais` do `NovoFornecedorConfigSheet` (Task 13).
- Produces:
  - `lib/importacao-xml.js` (usado aqui e na Task 15):
    - `lancamentoDoXml(doc, { tipo, pessoa, conta, categorias = [], empresaId, hoje }) → { registro, duplicatas, rotulo }` — `registro` pronto para `TransacaoFinanceira.create` (despesa: `tipo:"Despesa"`, fornecedor, categoria, `chave_nfe`, `numero_documento`; receita: `tipo:"receita"`, cliente), `duplicatas` = nº de parcelas que o `montarPreenchimento` montou (0 com um vencimento só), `rotulo` = "NF-e" | "NFC-e" | "NFS-e";
    - `cadastroDoXml(doc, tipo) → object | null` — campos do `Fornecedor.create` (`nome_razao`, `tipo_pessoa`, `ativo`, `cnpj` só dígitos, `inscricao_estadual`) ou do `Cliente.create` (`documento` só dígitos); receita sem CPF/CNPJ → `null`.
  - `DespesaModal` ganha a prop `adicionarAnexoPronto(anexo)`; `DespesasTab` passa a prop, grava `numero_documento` e importa XML pela lista com `lerXmlFiscal`.
- Decisões que o contrato não fixava:
  - O botão fica no **topo** do formulário (a leitura preenche descrição, valor, datas e fornecedor, que estão lá em cima), e não no lugar do antigo "Importar NFe (XML)" no meio da tela. A seção "Anexar NFe (Opcional)" vira "Nota Fiscal (Opcional)", perde o input de XML e o "NFe #N importada com sucesso" vira "Nota nº N lida do documento". O botão só aparece com `adicionarAnexoPronto` e despesa nova: o pré-lançamento (`EditarPreLancamentoComDespesaModal`) e a reconciliação (`ReconciliacaoComDespesaModal`) não passam a prop, então perdem o import de XML antigo e não ganham o botão (spec §3.5).
  - Categoria lida só entra se o formulário ainda não tem uma (mesma regra do combobox do fornecedor). O `onFornecedorCriado` passa a aplicar a categoria do cadastro novo com a mesma regra.
  - Documento com 0 ou 1 vencimento e valor lido desliga um parcelamento que estivesse ligado (as parcelas na tela eram do valor anterior).
  - O `AssociarMateriaisModal` abre sozinho (e o tipo vira "material") só para `nfe`/`nfce`/`cupom` com itens; itens de recibo, boleto ou NFS-e lidos pela IA só aparecem na lista "Itens da Nota Fiscal" (lá há "Gerenciar Materiais").
  - `sessionStorage["nfe_emit_<chave>"]` (a Nota de Devolução lê) passa a guardar só `cnpj`, `nome` e `ie`: o endereço lido é uma linha só e cairia inteiro no campo logradouro da NF-e de devolução.
  - `handleOpen` passa a carregar `numero_documento` e `chave_nfe` na edição. Sem isso, com o `numero_documento` no `handleSave`, salvar uma edição gravaria os dois como null (a chave já era apagada assim hoje).
  - Importação pela lista: aceita NF-e, NFC-e e NFS-e; confere a chave antes de criar (o índice único `(empresa_id, chave_nfe)` recusaria com erro genérico); **não** parcela — lança no 1º vencimento e avisa quantas duplicatas havia (parcelar pela lista exigiria as linhas de extrato que o formulário cria, cenário 1 do `handleSave`); fornecedor novo sai com CNPJ só dígitos, IE e `ativo:true`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/web/src/lib/importacao-xml.test.js`:

```js
import { describe, it, expect } from "vitest";
import { cadastroDoXml, lancamentoDoXml } from "./importacao-xml";

// DocumentoFiscal como o lerXmlFiscal devolve (dados fictícios)
const NFE = {
  origem: "xml",
  tipo: "nfe",
  numero: "1234",
  chave: "35260911222333000181550010000012341123456787",
  data_emissao: "2026-09-10",
  valor_total: 300.1,
  emitente: {
    nome: "ELETRICA M&M LTDA",
    documento: "11222333000181",
    ie: "123456789110",
    endereco: "RUA DAS FLORES, 100 - CENTRO - SAO PAULO/SP - CEP 01001-000",
  },
  destinatario: { nome: "CONSTRUTORA EXEMPLO LTDA", documento: "11444777000161" },
  vencimentos: [
    { numero: "002", data: "2026-11-10", valor: 100 },
    { numero: "001", data: "2026-10-10", valor: 100.1 },
    { numero: "003", data: "2026-12-10", valor: 100 },
  ],
  forma_pagamento: "boleto",
  descricao: "VENDA DE MERCADORIA",
  itens: [],
  avisos: [],
  duvidosos: [],
};

const NFSE = {
  ...NFE,
  tipo: "nfse",
  numero: "987",
  chave: null,
  valor_total: 1500,
  emitente: {
    nome: "SINERGIA SERVICOS LTDA",
    documento: "11444777000161",
    ie: null,
    endereco: null,
  },
  destinatario: { nome: "PREFEITURA MUNICIPAL DE EXEMPLO", documento: "46523015000135" },
  vencimentos: [],
  forma_pagamento: null,
  descricao: "MANUTENCAO DE ILUMINACAO PUBLICA",
};

const CONTA = { id: "conta-1", nome: "Banco Principal" };

describe("lancamentoDoXml — despesa", () => {
  const fornecedor = {
    id: "f1",
    nome_razao: "Elétrica M&M",
    cnpj: "11.222.333/0001-81",
    categorias: ["Material Elétrico"],
  };
  const categorias = [
    { id: "c1", nome: "Material Elétrico", tipo: "Despesa" },
    { id: "c2", nome: "Vendas", tipo: "Receita" },
  ];

  it("grava fornecedor, categoria, chave, nº do documento e o 1º vencimento", () => {
    const r = lancamentoDoXml(NFE, {
      tipo: "despesa",
      pessoa: fornecedor,
      conta: CONTA,
      categorias,
      empresaId: "emp-1",
      hoje: "2026-09-25",
    });
    expect(r.rotulo).toBe("NF-e");
    expect(r.duplicatas).toBe(3);
    expect(r.registro).toEqual({
      empresa_id: "emp-1",
      tipo: "Despesa",
      conta_id: "conta-1",
      conta_nome: "Banco Principal",
      valor: 300.1,
      data: "2026-09-10",
      data_vencimento: "2026-10-10",
      descricao: "NF-e 1234 - ELETRICA M&M LTDA",
      status: "em_aberto",
      forma_pagamento: "boleto",
      observacoes: "Importado de XML - NF-e 1234",
      fornecedor_id: "f1",
      fornecedor_nome: "Elétrica M&M",
      categoria_id: "c1",
      categoria_nome: "Material Elétrico",
      chave_nfe: "35260911222333000181550010000012341123456787",
      numero_documento: "35260911222333000181550010000012341123456787",
    });
  });

  it("NFS-e sem chave: numero_documento = número; sem vencimentos, vence na emissão", () => {
    const { registro, duplicatas, rotulo } = lancamentoDoXml(NFSE, {
      tipo: "despesa",
      pessoa: { id: "f2", nome_razao: "SINERGIA SERVICOS LTDA", cnpj: "11444777000161" },
      conta: CONTA,
      empresaId: "emp-1",
      hoje: "2026-09-25",
    });
    expect(rotulo).toBe("NFS-e");
    expect(duplicatas).toBe(0);
    expect(registro).toMatchObject({
      valor: 1500,
      data: "2026-09-10",
      data_vencimento: "2026-09-10",
      chave_nfe: null,
      numero_documento: "987",
      categoria_id: null,
      forma_pagamento: null,
      observacoes: "Importado de XML - NFS-e 987",
    });
  });
});

describe("lancamentoDoXml — receita", () => {
  it("a pessoa é o destinatário/tomador; receita não leva chave nem nº do documento", () => {
    const { registro } = lancamentoDoXml(NFSE, {
      tipo: "receita",
      pessoa: { id: "cl1", nome_razao: "Prefeitura de Exemplo", documento: "46.523.015/0001-35" },
      conta: CONTA,
      empresaId: "emp-1",
      hoje: "2026-09-25",
    });
    expect(registro).toEqual({
      empresa_id: "emp-1",
      tipo: "receita",
      conta_id: "conta-1",
      conta_nome: "Banco Principal",
      valor: 1500,
      data: "2026-09-10",
      data_vencimento: "2026-09-10",
      descricao: "NFS-e 987 - PREFEITURA MUNICIPAL DE EXEMPLO",
      status: "em_aberto",
      forma_pagamento: null,
      observacoes: "Importado de XML - NFS-e 987",
      cliente_id: "cl1",
      cliente_nome: "Prefeitura de Exemplo",
    });
  });

  it("sem cliente cadastrado guarda só o nome lido; sem nada, 'Cliente Desconhecido'", () => {
    const opcoes = {
      tipo: "receita",
      pessoa: null,
      conta: CONTA,
      empresaId: "e",
      hoje: "2026-09-25",
    };
    expect(lancamentoDoXml(NFSE, opcoes).registro).toMatchObject({
      cliente_id: null,
      cliente_nome: "PREFEITURA MUNICIPAL DE EXEMPLO",
    });
    const semTomador = {
      ...NFSE,
      numero: null,
      descricao: null,
      destinatario: { nome: null, documento: null },
    };
    expect(lancamentoDoXml(semTomador, opcoes).registro).toMatchObject({
      cliente_id: null,
      cliente_nome: "Cliente Desconhecido",
      descricao: "NFS-e S/N - Cliente Desconhecido",
      observacoes: "Importado de XML - NFS-e S/N",
    });
  });
});

describe("cadastroDoXml", () => {
  it("fornecedor novo com CNPJ só em dígitos e IE; CPF → PF", () => {
    expect(cadastroDoXml(NFE, "despesa")).toEqual({
      nome_razao: "ELETRICA M&M LTDA",
      tipo_pessoa: "PJ",
      ativo: true,
      cnpj: "11222333000181",
      inscricao_estadual: "123456789110",
    });
    const pf = {
      ...NFE,
      emitente: { nome: "JOSE DA SILVA", documento: "123.456.789-09", ie: null },
    };
    expect(cadastroDoXml(pf, "despesa")).toMatchObject({ tipo_pessoa: "PF", cnpj: "12345678909" });
  });

  it("despesa sem emitente ainda cria 'Fornecedor Desconhecido' (como antes)", () => {
    const semEmitente = { ...NFE, emitente: { nome: null, documento: null, ie: null } };
    expect(cadastroDoXml(semEmitente, "despesa")).toEqual({
      nome_razao: "Fornecedor Desconhecido",
      tipo_pessoa: "PJ",
      ativo: true,
      cnpj: "",
      inscricao_estadual: "",
    });
  });

  it("cliente novo só com CPF/CNPJ do tomador", () => {
    expect(cadastroDoXml(NFSE, "receita")).toEqual({
      nome_razao: "PREFEITURA MUNICIPAL DE EXEMPLO",
      tipo_pessoa: "PJ",
      ativo: true,
      documento: "46523015000135",
    });
    const semDocumento = { ...NFSE, destinatario: { nome: "CONSUMIDOR", documento: null } };
    expect(cadastroDoXml(semDocumento, "receita")).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `(cd apps/web && npx vitest run src/lib/importacao-xml.test.js)`
Expected (FAIL):

```
 FAIL  src/lib/importacao-xml.test.js [ src/lib/importacao-xml.test.js ]
Error: Cannot find module './importacao-xml' imported from '.../apps/web/src/lib/importacao-xml.test.js'
 Test Files  1 failed (1)
      Tests  no tests
```

- [ ] **Step 3: Implementar**

Criar `apps/web/src/lib/importacao-xml.js`:

```js
/**
 * importacao-xml — "Importar XML / NF-e" da LISTA de despesas e de receitas:
 * cria o lançamento direto, sem abrir o formulário. Usa o mesmo leitor
 * (lerXmlFiscal) e o mesmo preenchimento (montarPreenchimento) do botão
 * "Ler documento", então descrição, datas, forma de pagamento, chave e
 * categoria saem iguais nos dois caminhos.
 *
 * Puro: quem chama busca/cria a pessoa (casada por acharPessoa, pelos
 * dígitos do CPF/CNPJ) e grava o registro.
 */
import { limparCnpj } from "./cnpj";
import { montarPreenchimento } from "./documento-financeiro";

const ROTULOS = { nfe: "NF-e", nfce: "NFC-e", nfse: "NFS-e" };

/** Pessoa do lançamento: despesa → emitente (quem vendeu); receita → destinatário (quem paga). */
const pessoaDoDocumento = (doc, despesa) => (despesa ? doc?.emitente : doc?.destinatario) || {};

/**
 * Registro de TransacaoFinanceira da importação pela lista.
 * Duplicatas NÃO viram parcelas aqui: o lançamento vence no 1º vencimento
 * (a tela avisa e sugere "Nova → Ler documento" para parcelar).
 *
 * @param {object} doc DocumentoFiscal
 * @param {{ tipo: "despesa" | "receita", pessoa: object | null, conta?: { id, nome },
 *   categorias?: object[], empresaId: string, hoje: string }} opcoes
 *   pessoa = fornecedor/cliente já cadastrado (ou recém-criado); hoje = AAAA-MM-DD
 * @returns {{ registro: object, duplicatas: number, rotulo: string }}
 */
export function lancamentoDoXml(doc, { tipo, pessoa, conta, categorias = [], empresaId, hoje }) {
  const despesa = tipo !== "receita";
  const { patch, parcelas } = montarPreenchimento(doc, {
    tipo,
    pessoas: pessoa ? [pessoa] : [],
    categorias,
  });
  const rotulo = ROTULOS[doc.tipo] || "Nota";
  const numero = doc.numero || "S/N";
  const nome =
    pessoa?.nome_razao ||
    pessoaDoDocumento(doc, despesa).nome ||
    (despesa ? "Fornecedor Desconhecido" : "Cliente Desconhecido");

  const registro = {
    empresa_id: empresaId,
    // mesma grafia do salvar de cada tela
    tipo: despesa ? "Despesa" : "receita",
    conta_id: conta?.id,
    conta_nome: conta?.nome,
    valor: parseFloat(patch.valor) || 0,
    data: patch.data_competencia || hoje,
    data_vencimento: patch.data_vencimento || hoje,
    descricao: patch.descricao || `${rotulo} ${numero} - ${nome}`,
    status: "em_aberto",
    forma_pagamento: patch.forma_pagamento || null,
    observacoes: `Importado de XML - ${rotulo} ${numero}`,
  };
  if (despesa) {
    Object.assign(registro, {
      fornecedor_id: pessoa?.id || null,
      fornecedor_nome: nome,
      categoria_id: patch.categoria_id || null,
      categoria_nome: patch.categoria_nome || null,
      chave_nfe: patch.chave_nfe || null,
      numero_documento: patch.numero_documento || null,
    });
  } else {
    Object.assign(registro, { cliente_id: pessoa?.id || null, cliente_nome: nome });
  }
  return { registro, duplicatas: parcelas.length, rotulo };
}

/**
 * Cadastro criado quando a pessoa do XML não existe.
 * Despesa: sempre cria o fornecedor (como a importação antiga), CNPJ/CPF só
 * dígitos. Receita: só cria o cliente com CPF/CNPJ — sem ele, null (o
 * lançamento guarda só o nome lido).
 * @returns {object | null} campos para Fornecedor.create / Cliente.create (sem empresa_id)
 */
export function cadastroDoXml(doc, tipo) {
  const despesa = tipo !== "receita";
  const p = pessoaDoDocumento(doc, despesa);
  const documento = limparCnpj(p.documento);
  if (!despesa && !documento) return null;
  const base = {
    nome_razao: String(p.nome || "").trim() || (despesa ? "Fornecedor Desconhecido" : "Cliente Desconhecido"),
    tipo_pessoa: documento.length === 11 ? "PF" : "PJ",
    ativo: true,
  };
  return despesa ? { ...base, cnpj: documento, inscricao_estadual: p.ie || "" } : { ...base, documento };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `(cd apps/web && npx vitest run src/lib/importacao-xml.test.js)`
Expected (PASS):

```
 ✓ src/lib/importacao-xml.test.js (7 tests)
 Test Files  1 passed (1)
      Tests  7 passed (7)
```

- [ ] **Step 5: `DespesaModal` — imports, prop e estado**

Em `apps/web/src/components/financeiro/DespesaModal.jsx` (linhas 34–35), trocar:

```jsx
import { categoriaDoFornecedor } from "@/components/fornecedores/CategoriasFornecedorSelect";
import AssociarMateriaisModal from "./AssociarMateriaisModal";
```

por:

```jsx
import { categoriaDoFornecedor } from "@/lib/categorias-fornecedor";
import { montarPreenchimento } from "@/lib/documento-financeiro";
import { dadosIniciaisCadastro } from "@/lib/ler-documento";
import AssociarMateriaisModal from "./AssociarMateriaisModal";
import LerDocumentoButton, { ConferirLeitura, PessoaNaoCadastrada } from "./LerDocumentoButton";
```

Em `apps/web/src/components/financeiro/DespesaModal.jsx` (linhas 65–67), trocar:

```jsx
  onDesfazerConciliacao,
  podeEditar,
}) {
```

por:

```jsx
  onDesfazerConciliacao,
  podeEditar,
  // anexo que já subiu no "Ler documento" ({ nome, url: ref, tipo }). Sem esta
  // prop (pré-lançamento, reconciliação) o botão "Ler documento" não aparece.
  adicionarAnexoPronto,
}) {
```

Em `apps/web/src/components/financeiro/DespesaModal.jsx` (linha 97), trocar:

```jsx
const [showNovoFornecedor, setShowNovoFornecedor] = useState(false);
```

por:

```jsx
const [showNovoFornecedor, setShowNovoFornecedor] = useState(false);
// cadastro rápido com os dados lidos (null = cadastro em branco, pelo "+")
const [dadosNovoFornecedor, setDadosNovoFornecedor] = useState(null);
// última leitura: { pessoaSugerida, duvidosos, avisos }
const [leitura, setLeitura] = useState(null);
```

- [ ] **Step 6: `DespesaModal` — o `handleImportarXML` sai e entra `aplicarDocumentoLido`**

Em `apps/web/src/components/financeiro/DespesaModal.jsx` (linhas 141–287, a função `handleImportarXML` inteira), trocar:

```jsx
const handleImportarXML = async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  try {
    await sigo.integrations.Core.UploadFile({ file }); // upload registra comprovante
    // Processar o XML localmente para extrair dados
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const xmlText = event.target.result;
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");

        // Extrair dados da nota fiscal
        const nfeProc = xmlDoc.getElementsByTagName("nfeProc")[0] || xmlDoc.getElementsByTagName("NFe")[0];
        const infNFe = nfeProc?.getElementsByTagName("infNFe")[0];
        const ide = infNFe?.getElementsByTagName("ide")[0];
        const emit = infNFe?.getElementsByTagName("emit")[0];
        const total = infNFe?.getElementsByTagName("total")[0];
        const ICMSTot = total?.getElementsByTagName("ICMSTot")[0];

        // Preencher dados da nota
        const numeroNota = ide?.getElementsByTagName("nNF")[0]?.textContent || "";
        const dataEmissao = ide?.getElementsByTagName("dhEmi")[0]?.textContent?.split("T")[0] || "";
        const valorTotal = ICMSTot?.getElementsByTagName("vNF")[0]?.textContent || "";
        const cnpjFornecedor = emit?.getElementsByTagName("CNPJ")[0]?.textContent || "";
        const nomeFornecedor = emit?.getElementsByTagName("xNome")[0]?.textContent || "";

        // Buscar fornecedor no sistema
        const fornecedorEncontrado = fornecedores.find(
          (f) => f.cnpj?.replace(/\D/g, "") === cnpjFornecedor.replace(/\D/g, "")
        );

        // Extrair chave NF-e (44 dígitos)
        const protNFe = xmlDoc.getElementsByTagName("protNFe")[0];
        const infProt = protNFe?.getElementsByTagName("infProt")[0];
        const chaveNFe =
          infProt?.getElementsByTagName("chNFe")[0]?.textContent ||
          infNFe?.getAttribute("Id")?.replace("NFe", "") ||
          "";

        // Extrair endereço do emitente para devolução futura
        const enderEmit = emit?.getElementsByTagName("enderEmit")[0];
        const ieEmit = emit?.getElementsByTagName("IE")[0]?.textContent || "";
        const enderecoEmit = {
          cnpj: cnpjFornecedor,
          nome: nomeFornecedor,
          ie: ieEmit,
          logradouro: enderEmit?.getElementsByTagName("xLgr")[0]?.textContent || "",
          numero: enderEmit?.getElementsByTagName("nro")[0]?.textContent || "",
          bairro: enderEmit?.getElementsByTagName("xBairro")[0]?.textContent || "",
          municipio: enderEmit?.getElementsByTagName("xMun")[0]?.textContent || "",
          uf: enderEmit?.getElementsByTagName("UF")[0]?.textContent || "",
          cep: enderEmit?.getElementsByTagName("CEP")[0]?.textContent || "",
        };

        // Salvar dados do emitente para uso na devolução
        sessionStorage.setItem(`nfe_emit_${chaveNFe || numeroNota}`, JSON.stringify(enderecoEmit));

        // Atualizar form com dados da nota
        setNotaFiscal({
          numero: numeroNota,
          chave: chaveNFe,
          dataEmissao: dataEmissao,
          dataEntrada: new Date().toISOString().split("T")[0],
          valorNota: valorTotal,
          statusAprovacao: "pendente",
        });

        setForm((prev) => ({
          ...prev,
          valor: valorTotal,
          fornecedor_id: fornecedorEncontrado?.id || "",
          descricao: `Nota Fiscal ${numeroNota} - ${nomeFornecedor}`,
          numero_documento: chaveNFe || numeroNota,
          chave_nfe: chaveNFe || null,
        }));

        // Verificar duplicidade da chave NFe ANTES de prosseguir
        if (chaveNFe && empresaAtiva?.id) {
          try {
            const existentes = await sigo.entities.TransacaoFinanceira.filter({
              empresa_id: empresaAtiva.id,
              chave_nfe: chaveNFe,
            });
            const naoEhEssa = existentes.filter((t) => t.id !== selectedItem?.id);
            if (naoEhEssa.length > 0) {
              setTransacaoDuplicada(naoEhEssa[0]);
            } else {
              setTransacaoDuplicada(null);
            }
          } catch (err) {
            console.warn("Falha ao verificar duplicidade NFe:", err);
          }
        }

        // Extrair itens da nota (incluindo EAN e NCM)
        const det = infNFe?.getElementsByTagName("det");
        const itens = [];

        if (det) {
          for (let i = 0; i < det.length; i++) {
            const prod = det[i].getElementsByTagName("prod")[0];
            const item = {
              descricao: prod?.getElementsByTagName("xProd")[0]?.textContent || "",
              codigo: prod?.getElementsByTagName("cProd")[0]?.textContent || "",
              ean: prod?.getElementsByTagName("cEAN")[0]?.textContent || "",
              ncm: prod?.getElementsByTagName("NCM")[0]?.textContent || "",
              unidade: prod?.getElementsByTagName("uCom")[0]?.textContent || "UN",
              quantidade: parseFloat(prod?.getElementsByTagName("qCom")[0]?.textContent || 0),
              valor_unitario: parseFloat(prod?.getElementsByTagName("vUnCom")[0]?.textContent || 0),
              valor_total: parseFloat(prod?.getElementsByTagName("vProd")[0]?.textContent || 0),
            };
            itens.push(item);
          }
        }

        setItensNota(itens);

        // Adicionar anexo
        handleAnexoUpload({ target: { files: [file] } });

        // Se for material e tiver itens, abrir modal de associação
        if (itens.length > 0) {
          setTipoDespesa("material");
          setShowAssociarMateriais(true);
        }

        alert("Nota fiscal importada com sucesso!");
      } catch {
        alert("Erro ao processar XML da nota fiscal. Verifique o arquivo.");
      }
    };

    reader.readAsText(file);
  } catch {
    alert("Erro ao importar nota fiscal");
  }
};
```

por:

```jsx
// "Ler documento" (XML sem IA; PDF/foto pela IA): preenche o formulário para
// o usuário conferir — nada é salvo aqui. A leitura sobrescreve os campos
// que o documento trouxe e mantém os demais.
const aplicarDocumentoLido = ({ documento, anexo }) => {
  const {
    patch,
    parcelas: parcelasLidas,
    itens,
    pessoaSugerida,
    avisos,
  } = montarPreenchimento(documento, {
    tipo: "despesa",
    pessoas: fornecedoresLocais,
    categorias,
  });
  const { categoria_id: categoriaId, categoria_nome: categoriaNome, ...resto } = patch;
  setForm((prev) => ({
    ...prev,
    ...resto,
    // categoria já escolhida fica (igual à escolha do fornecedor no combobox)
    ...(categoriaId && !prev.categoria_id ? { categoria_id: categoriaId, categoria_nome: categoriaNome } : {}),
  }));

  // duplicatas/vencimentos → parcelas. O handleNumeroParcelasChange do pai
  // ainda enxerga o form antigo; o setParcelas logo depois é o que vale.
  if (parcelasLidas.length > 1) {
    handleNumeroParcelasChange(parcelasLidas.length);
    setParcelas(parcelasLidas);
    setPermitirParcelamento(true);
    setMostrarParcelas(true);
  } else if (patch.valor && permitirParcelamento) {
    // as parcelas na tela eram do valor anterior
    handleNumeroParcelasChange(1);
    setPermitirParcelamento(false);
    setMostrarParcelas(false);
  }

  if (documento.numero || documento.chave) {
    setNotaFiscal((prev) => ({
      ...prev,
      numero: documento.numero || "",
      chave: documento.chave || "",
      dataEmissao: documento.data_emissao || "",
      dataEntrada: prev.dataEntrada || new Date().toLocaleDateString("en-CA"),
      valorNota: patch.valor || "",
    }));
  }
  // emitente para a Nota de Devolução (ela procura pelo numero_documento = chave)
  if (documento.chave) {
    try {
      sessionStorage.setItem(
        `nfe_emit_${documento.chave}`,
        JSON.stringify({
          cnpj: documento.emitente?.documento || "",
          nome: documento.emitente?.nome || "",
          ie: documento.emitente?.ie || "",
        })
      );
    } catch {
      /* sessionStorage indisponível: a devolução pede os dados à mão */
    }
  }

  // itens de nota de produto → associar materiais (entrada de estoque), como antes
  setItensNota(itens);
  if (itens.length > 0 && ["nfe", "nfce", "cupom"].includes(documento.tipo)) {
    setTipoDespesa("material");
    setShowAssociarMateriais(true);
  }

  adicionarAnexoPronto(anexo);
  setLeitura({ pessoaSugerida, duvidosos: documento.duvidosos || [], avisos });
};
```

- [ ] **Step 7: `DespesaModal` — botão no topo, faixa do fornecedor, seção da nota e cadastro**

Em `apps/web/src/components/financeiro/DespesaModal.jsx` (linhas 430–432), trocar:

```jsx
          <div className="p-6 flex-1 overflow-y-auto">
            <div className="space-y-6">
              {/* INFORMAÇÕES DA DESPESA */}
```

por:

```jsx
          <div className="p-6 flex-1 overflow-y-auto">
            <div className="space-y-6">
              {/* LER DOCUMENTO — só na despesa nova e quando o pai recebe o anexo pronto */}
              {adicionarAnexoPronto && !selectedItem && (
                <div className="space-y-2">
                  <LerDocumentoButton
                    tipo="despesa"
                    onLido={aplicarDocumentoLido}
                    className="w-full border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                  />
                  <p className="text-xs text-slate-500">
                    O XML da nota é lido sem IA; PDF ou foto (DANFE, NFS-e, cupom, recibo, boleto,
                    PIX) é lido pela IA. Nada é salvo antes de você clicar em Salvar.
                  </p>
                  <ConferirLeitura duvidosos={leitura?.duvidosos} avisos={leitura?.avisos} />
                </div>
              )}

              {/* INFORMAÇÕES DA DESPESA */}
```

Em `apps/web/src/components/financeiro/DespesaModal.jsx` (linhas 538–543), trocar:

```jsx
                          onClick={() => setShowNovoFornecedor(true)}
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                      {form.fornecedor_id && (
```

por:

```jsx
                          onClick={() => {
                            setDadosNovoFornecedor(null);
                            setShowNovoFornecedor(true);
                          }}
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                      {!form.fornecedor_id && (
                        <PessoaNaoCadastrada
                          rotulo="Fornecedor"
                          pessoa={leitura?.pessoaSugerida}
                          onCadastrar={() => {
                            setDadosNovoFornecedor(
                              dadosIniciaisCadastro(leitura.pessoaSugerida, "cnpj")
                            );
                            setShowNovoFornecedor(true);
                          }}
                        />
                      )}
                      {form.fornecedor_id && (
```

Em `apps/web/src/components/financeiro/DespesaModal.jsx` (linhas 685–716), trocar:

```jsx
                <h3 className="text-sm font-semibold text-slate-700 uppercase mb-4 pb-2 border-b">
                  Anexar NFe (Opcional)
                </h3>

                <div className="space-y-4">
                  <div>
                    <Label>Nota Fiscal Eletrônica (XML)</Label>
                    <div className="flex gap-2 mt-1.5">
                      <input
                        type="file"
                        accept=".xml"
                        onChange={handleImportarXML}
                        className="hidden"
                        id="import-xml-nfe"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={() => document.getElementById("import-xml-nfe").click()}
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        Importar NFe (XML)
                      </Button>
                    </div>
                    {notaFiscal.numero && (
                      <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-sm">
                        <p className="text-green-700">
                          NFe #{notaFiscal.numero} importada com sucesso
                        </p>
                      </div>
                    )}
```

por:

```jsx
                <h3 className="text-sm font-semibold text-slate-700 uppercase mb-4 pb-2 border-b">
                  Nota Fiscal (Opcional)
                </h3>

                <div className="space-y-4">
                  <div>
                    {/* o XML da NF-e agora entra pelo "Ler documento" no topo */}
                    {notaFiscal.numero && (
                      <div className="p-2 bg-green-50 border border-green-200 rounded text-sm">
                        <p className="text-green-700">
                          Nota nº {notaFiscal.numero} lida do documento
                        </p>
                      </div>
                    )}
```

Em `apps/web/src/components/financeiro/DespesaModal.jsx` (linhas 1536–1545), trocar:

```jsx
          empresaAtiva={empresaAtiva}
          onFornecedorCriado={(fornecedor) => {
            setFornecedoresLocais((prev) => [...prev, fornecedor]);
            setForm((prev) => ({
              ...prev,
              fornecedor_id: fornecedor.id,
              fornecedor_nome: fornecedor.nome_razao,
            }));
            if (onReload) onReload();
          }}
```

por:

```jsx
          empresaAtiva={empresaAtiva}
          dadosIniciais={dadosNovoFornecedor}
          onFornecedorCriado={(fornecedor) => {
            setFornecedoresLocais((prev) => [...prev, fornecedor]);
            // categoria vazia → a do cadastro (igual à escolha no combobox)
            const cat = categoriaDoFornecedor(fornecedor, categoriasOrdenadas);
            setForm((prev) => ({
              ...prev,
              fornecedor_id: fornecedor.id,
              fornecedor_nome: fornecedor.nome_razao,
              ...(cat && !prev.categoria_id && { categoria_id: cat.id, categoria_nome: cat.nome }),
            }));
            setLeitura((prev) => (prev ? { ...prev, pessoaSugerida: null } : prev));
            if (onReload) onReload();
          }}
```

- [ ] **Step 8: `DespesasTab` — anexo pronto, `numero_documento` e importação pela lista**

Em `apps/web/src/components/financeiro/DespesasTab.jsx` (linha 36), trocar:

```jsx
import { refDoUpload } from "@/lib/anexo-ref";
import { baixarReciboQuitado } from "@/lib/recibo-quitado";
```

por:

```jsx
import { refDoUpload } from "@/lib/anexo-ref";
import { lerXmlFiscal, textoDoXml } from "@/lib/nfe-xml";
import { acharPessoa } from "@/lib/documento-financeiro";
import { cadastroDoXml, lancamentoDoXml } from "@/lib/importacao-xml";
import { baixarReciboQuitado } from "@/lib/recibo-quitado";
```

Em `apps/web/src/components/financeiro/DespesasTab.jsx` (linhas 241–243), trocar:

```jsx
const handleRemoverAnexo = (index) => {
  setAnexos(anexos.filter((_, i) => i !== index));
};
```

por:

```jsx
const handleRemoverAnexo = (index) => {
  setAnexos(anexos.filter((_, i) => i !== index));
};

// anexo que já subiu no "Ler documento" (ref "bucket/path"): entra sem novo upload
const adicionarAnexoPronto = (anexo) => {
  if (anexo?.url) setAnexos((prev) => [...prev, anexo]);
};
```

Em `apps/web/src/components/financeiro/DespesasTab.jsx` (linhas 343–467, a função `handleImportarXML` inteira), trocar:

```jsx
const handleImportarXML = async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (evt) => {
    try {
      const xmlText = evt.target.result;
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, "text/xml");

      // Verificar se é NF-e válida - aceitar diversos formatos
      const nfeNode =
        xmlDoc.getElementsByTagName("NFe")[0] ||
        xmlDoc.getElementsByTagName("nfeProc")[0] ||
        xmlDoc.getElementsByTagName("nfe")[0] ||
        xmlDoc.getElementsByTagNameNS("*", "NFe")[0] ||
        xmlDoc.getElementsByTagNameNS("*", "nfeProc")[0];

      const infNFeNode = xmlDoc.getElementsByTagName("infNFe")[0] || xmlDoc.getElementsByTagNameNS("*", "infNFe")[0];

      if (!nfeNode && !infNFeNode) {
        alert(
          "❌ Arquivo XML inválido. Não foi possível identificar como NF-e.\n\nVerifique se o arquivo é uma Nota Fiscal Eletrônica válida."
        );
        return;
      }

      setImportacao({ ativo: true, total: 1, processados: 0, erros: 0 });

      // Extrair dados da NF-e - buscar em múltiplos namespaces
      const getTag = (tagName) => {
        return xmlDoc.getElementsByTagName(tagName)[0] || xmlDoc.getElementsByTagNameNS("*", tagName)[0];
      };

      const infNFe = getTag("infNFe");
      const emit = getTag("emit");
      const total = getTag("total");
      const ICMSTot = getTag("ICMSTot");
      const ide = getTag("ide");

      const fornecedorNome =
        emit?.getElementsByTagName("xNome")[0]?.textContent ||
        emit?.getElementsByTagNameNS("*", "xNome")[0]?.textContent ||
        "Fornecedor Desconhecido";

      const fornecedorCNPJ =
        emit?.getElementsByTagName("CNPJ")[0]?.textContent ||
        emit?.getElementsByTagNameNS("*", "CNPJ")[0]?.textContent ||
        "";

      const dataEmissao = (
        ide?.getElementsByTagName("dhEmi")[0]?.textContent ||
        ide?.getElementsByTagNameNS("*", "dhEmi")[0]?.textContent ||
        ide?.getElementsByTagName("dEmi")[0]?.textContent ||
        ide?.getElementsByTagNameNS("*", "dEmi")[0]?.textContent ||
        new Date().toISOString()
      ).split("T")[0];

      const numeroNFe =
        ide?.getElementsByTagName("nNF")[0]?.textContent ||
        ide?.getElementsByTagNameNS("*", "nNF")[0]?.textContent ||
        "";

      const valorTotal = parseFloat(
        ICMSTot?.getElementsByTagName("vNF")[0]?.textContent ||
          ICMSTot?.getElementsByTagNameNS("*", "vNF")[0]?.textContent ||
          "0"
      );

      // Buscar ou criar fornecedor
      let fornecedores = await sigo.entities.Fornecedor.filter({
        empresa_id: empresaAtiva.id,
        cnpj: fornecedorCNPJ,
      });

      let fornecedor;
      if (fornecedores.length === 0) {
        fornecedor = await sigo.entities.Fornecedor.create({
          empresa_id: empresaAtiva.id,
          nome_razao: fornecedorNome,
          cnpj: fornecedorCNPJ,
          tipo_pessoa: "PJ",
        });
      } else {
        fornecedor = fornecedores[0];
      }

      // Criar despesa
      const despesaData = {
        empresa_id: empresaAtiva.id,
        tipo: "Despesa",
        conta_id: contas[0]?.id,
        conta_nome: contas[0]?.nome,
        fornecedor_id: fornecedor.id,
        fornecedor_nome: fornecedor.nome_razao,
        valor: valorTotal,
        data: dataEmissao,
        data_vencimento: dataEmissao,
        descricao: `NF-e ${numeroNFe} - ${fornecedorNome}`,
        status: "em_aberto",
        observacoes: `Importado de XML - NF-e ${numeroNFe}`,
      };

      await sigo.entities.TransacaoFinanceira.create(despesaData);

      setImportacao({ ativo: false, total: 0, processados: 0, erros: 0 });
      alert(`✅ NF-e importada com sucesso!\n\nFornecedor: ${fornecedorNome}\nValor: ${formatCurrency(valorTotal)}`);
      onReload();
    } catch {
      setImportacao({ ativo: false, total: 0, processados: 0, erros: 0 });
      alert("❌ Erro ao processar arquivo XML. Verifique se é uma NF-e válida.");
    } finally {
      e.target.value = "";
    }
  };
  reader.readAsText(file);
};
```

por:

```jsx
// "Importar XML / NF-e" da lista: cria a despesa direto, sem abrir o
// formulário. Mesmo leitor do "Ler documento" (lerXmlFiscal: NF-e, NFC-e e
// NFS-e); fornecedor casado pelos DÍGITOS do CNPJ/CPF e depois pelo nome (a
// busca exata pelo texto do CNPJ criava fornecedor duplicado); grava chave_nfe.
const handleImportarXML = async (e) => {
  const input = e.target;
  const file = input.files?.[0];
  if (!file) return;

  try {
    const doc = lerXmlFiscal(await textoDoXml(file));
    if (!doc) {
      alert(
        "❌ Arquivo XML não reconhecido.\n\nEnvie o XML de uma NF-e, NFC-e ou NFS-e (baixado da SEFAZ, da prefeitura ou enviado pelo fornecedor)."
      );
      return;
    }
    if (!(doc.valor_total > 0)) {
      alert("⚠️ Nota sem valor total.\n\nVerifique se o XML está completo.");
      return;
    }

    setImportacao({ ativo: true, total: 1, processados: 0, erros: 0 });

    // a mesma NF-e duas vezes seria barrada pelo índice único (empresa, chave_nfe)
    if (doc.chave) {
      const jaLancadas = await sigo.entities.TransacaoFinanceira.filter({
        empresa_id: empresaAtiva.id,
        chave_nfe: doc.chave,
      });
      if (jaLancadas.length > 0) {
        alert(`⚠️ Esta NF-e já foi lançada: ${jaLancadas[0].descricao || "(sem descrição)"}`);
        return;
      }
    }

    const cadastrados = await sigo.entities.Fornecedor.filter({ empresa_id: empresaAtiva.id });
    const fornecedor =
      acharPessoa(cadastrados, doc.emitente, "cnpj") ||
      (await sigo.entities.Fornecedor.create({
        empresa_id: empresaAtiva.id,
        ...cadastroDoXml(doc, "despesa"),
      }));

    const { registro, duplicatas, rotulo } = lancamentoDoXml(doc, {
      tipo: "despesa",
      pessoa: fornecedor,
      conta: contas[0],
      categorias,
      empresaId: empresaAtiva.id,
      hoje: hojeLocalISO(),
    });
    await sigo.entities.TransacaoFinanceira.create(registro);

    alert(
      `✅ ${rotulo} importada com sucesso!\n\nFornecedor: ${registro.fornecedor_nome}\nValor: ${formatCurrency(registro.valor)}` +
        (duplicatas > 1
          ? `\n\nA nota tem ${duplicatas} duplicatas: a despesa foi lançada inteira no 1º vencimento. Para lançar parcelado, use Nova Despesa → Ler documento.`
          : "")
    );
    onReload();
  } catch (err) {
    console.error("[DespesasTab] erro ao importar XML:", err);
    alert("❌ Erro ao importar o XML: " + (err?.message || "tente novamente"));
  } finally {
    setImportacao({ ativo: false, total: 0, processados: 0, erros: 0 });
    input.value = "";
  }
};
```

Em `apps/web/src/components/financeiro/DespesasTab.jsx` (linhas 852–855, `handleOpen` da edição), trocar:

```jsx
        forma_pagamento: item.forma_pagamento || "",
      });

      loadAnexos(item.id);
```

por:

```jsx
        forma_pagamento: item.forma_pagamento || "",
        // sem os dois no form, salvar a edição apagava a chave e o nº do documento
        numero_documento: item.numero_documento || "",
        chave_nfe: item.chave_nfe || "",
      });

      loadAnexos(item.id);
```

Em `apps/web/src/components/financeiro/DespesasTab.jsx` (linhas 885–888, `handleOpen` da despesa nova), trocar:

```jsx
        status: "em_aberto",
        forma_pagamento: "",
      });
      setAnexos([]);
```

por:

```jsx
        status: "em_aberto",
        forma_pagamento: "",
        numero_documento: "",
        chave_nfe: "",
      });
      setAnexos([]);
```

Em `apps/web/src/components/financeiro/DespesasTab.jsx` (linhas 974–975, `dataBase` do `handleSave`), trocar:

```jsx
      chave_nfe: chaveNfe || null,
    };
```

por:

```jsx
      chave_nfe: chaveNfe || null,
      // "Ler documento" preenche: chave da NF-e (44 dígitos) ou o número do documento
      numero_documento: form.numero_documento || null,
    };
```

Em `apps/web/src/components/financeiro/DespesasTab.jsx` (linhas 2190–2191), trocar:

```jsx
handleRemoverAnexo = { handleRemoverAnexo };
handleSave = { handleSave };
```

por:

```jsx
handleRemoverAnexo = { handleRemoverAnexo };
adicionarAnexoPronto = { adicionarAnexoPronto };
handleSave = { handleSave };
```

- [ ] **Step 9: Conferir, lint, testes do front e build**

Run:

```bash
grep -c "handleImportarXML\|import-xml-nfe\|DOMParser" apps/web/src/components/financeiro/DespesaModal.jsx
grep -c "DOMParser" apps/web/src/components/financeiro/DespesasTab.jsx
(cd apps/web && npx eslint --quiet --rule '{"no-undef":"error","react/jsx-no-undef":"error"}' src/components/financeiro/DespesaModal.jsx src/components/financeiro/DespesasTab.jsx && echo LINT_OK)
(cd apps/web && npx vitest run)
(cd apps/web && npm run build > /dev/null && echo BUILD_OK)
```

Expected:

- os dois `grep -c` imprimem `0` (o parser antigo do modal e o da lista saíram);
- `LINT_OK`;
- vitest: nenhuma falha, +1 arquivo e +7 testes em relação ao fim da Task 13;
- `BUILD_OK`.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/lib/importacao-xml.js apps/web/src/lib/importacao-xml.test.js apps/web/src/components/financeiro/DespesaModal.jsx apps/web/src/components/financeiro/DespesasTab.jsx
git commit -F - <<'EOF'
feat(financeiro): "Ler documento" na nova despesa e XML pela lista sem fornecedor duplicado

Na nova despesa, o botão substitui o "Importar NFe (XML)": preenche
descrição, valor, datas, forma, fornecedor (ou a faixa para cadastrar com
os dados lidos), categoria, chave, parcelas das duplicatas, itens e anexo,
e lista o que conferir. O salvar grava numero_documento e a edição não
apaga mais a chave. A importação pela lista usa o mesmo leitor, casa o
fornecedor pelos dígitos do CNPJ, grava chave_nfe e barra NF-e repetida.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log --oneline -1
```

Expected: o lint-staged roda o prettier nos 4 arquivos e o commit sai; `git log` mostra `feat(financeiro): "Ler documento" na nova despesa e XML pela lista sem fornecedor duplicado`.

### Task 15: "Ler documento" na nova receita + importação de XML pela lista com cliente por CPF/CNPJ

**Files:**

- Modify: `apps/web/src/components/financeiro/ReceitasTab.jsx` (imports ~39–40 e ~50; estado ~117; `handleRemoverAnexo` ~253–255; `handleImportarXML` ~348–556; `handleOpen` ~849–850; Sheet ~1440–1453; cliente ~1586–1591; `NovoClienteModal` ~1975–1977)

**Interfaces:**

- Consumes: `lerXmlFiscal` (Task 9); `montarPreenchimento` e `acharPessoa` (Task 10); `LerDocumentoButton`, `ConferirLeitura`, `PessoaNaoCadastrada`, `dadosIniciaisCadastro` e a prop `dadosIniciais` do `NovoClienteModal` (Task 13); `lancamentoDoXml` e `cadastroDoXml` (Task 14).
- Produces: nova receita com "Ler documento" (cliente = destinatário/tomador; parcelas no formato da receita, `data_pagamento: ""`; anexo via `setAnexos`); "Importar XML / NF-e" da lista com `lerXmlFiscal` e cliente casado pelos dígitos.
- Decisões que o contrato não fixava:
  - Sem lógica pura nova (o que é regra está em `montarPreenchimento` e `lancamentoDoXml`, testados nas Tasks 10 e 14), então esta task não tem teste novo: a verificação é lint + regressão do vitest + build, e o navegador na Task 16.
  - O botão só aparece na receita nova (`!selectedItem`) e fica desabilitado enquanto salva; a leitura anterior é limpa no `handleOpen`.
  - Importação pela lista: cliente sem cadastro e sem CPF/CNPJ não é criado (como antes; fica só o nome lido); não parcela (1º vencimento + aviso), como na despesa.

- [ ] **Step 1: Imports e estado**

Em `apps/web/src/components/financeiro/ReceitasTab.jsx` (linhas 39–40), trocar:

```jsx
import { refDoUpload } from "@/lib/anexo-ref";
import * as XLSX from "xlsx";
```

por:

```jsx
import { refDoUpload } from "@/lib/anexo-ref";
import { lerXmlFiscal, textoDoXml } from "@/lib/nfe-xml";
import { acharPessoa, montarPreenchimento } from "@/lib/documento-financeiro";
import { cadastroDoXml, lancamentoDoXml } from "@/lib/importacao-xml";
import { dadosIniciaisCadastro } from "@/lib/ler-documento";
import * as XLSX from "xlsx";
```

Em `apps/web/src/components/financeiro/ReceitasTab.jsx` (linha 50), trocar:

```jsx
import DetalheReceitaModal, { anexosDaReceita } from "./DetalheReceitaModal";
```

por:

```jsx
import DetalheReceitaModal, { anexosDaReceita } from "./DetalheReceitaModal";
import LerDocumentoButton, { ConferirLeitura, PessoaNaoCadastrada } from "./LerDocumentoButton";
```

Em `apps/web/src/components/financeiro/ReceitasTab.jsx` (linha 117), trocar:

```jsx
const [showNovoCliente, setShowNovoCliente] = useState(false);
```

por:

```jsx
const [showNovoCliente, setShowNovoCliente] = useState(false);
// cadastro rápido com os dados lidos (null = cadastro em branco, pelo "+")
const [dadosNovoCliente, setDadosNovoCliente] = useState(null);
// última leitura do "Ler documento": { pessoaSugerida, duvidosos, avisos }
const [leitura, setLeitura] = useState(null);
```

- [ ] **Step 2: `aplicarDocumentoLido` e a limpeza no `handleOpen`**

Em `apps/web/src/components/financeiro/ReceitasTab.jsx` (linhas 253–255), trocar:

```jsx
const handleRemoverAnexo = (index) => {
  setAnexos(anexos.filter((_, i) => i !== index));
};
```

por:

```jsx
const handleRemoverAnexo = (index) => {
  setAnexos(anexos.filter((_, i) => i !== index));
};

// "Ler documento" na nova receita: preenche o formulário para conferir (nada
// é salvo aqui). A pessoa da receita é o destinatário/tomador (quem paga).
const aplicarDocumentoLido = ({ documento, anexo }) => {
  const {
    patch,
    parcelas: parcelasLidas,
    pessoaSugerida,
    avisos,
  } = montarPreenchimento(documento, { tipo: "receita", pessoas: clientesLocais });
  setForm((prev) => ({ ...prev, ...patch }));
  if (parcelasLidas.length > 1) {
    // handleNumeroParcelasChange ainda enxerga o form antigo; o setParcelas
    // logo depois é o que vale
    handleNumeroParcelasChange(parcelasLidas.length);
    setParcelas(parcelasLidas);
  } else if (patch.valor && numeroParcelas > 1) {
    handleNumeroParcelasChange(1); // as parcelas na tela eram do valor anterior
  }
  setAnexos((prev) => [...prev, anexo]);
  setLeitura({ pessoaSugerida, duvidosos: documento.duvidosos || [], avisos });
};
```

Em `apps/web/src/components/financeiro/ReceitasTab.jsx` (linhas 849–850), trocar:

```jsx
  const handleOpen = (item = null) => {
    if (item) {
```

por:

```jsx
  const handleOpen = (item = null) => {
    setLeitura(null);
    if (item) {
```

- [ ] **Step 3: Importação pela lista com o leitor único**

Em `apps/web/src/components/financeiro/ReceitasTab.jsx` (linhas 348–556, a função `handleImportarXML` inteira), trocar:

```jsx
const handleImportarXML = async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (evt) => {
    try {
      const xmlText = evt.target.result;
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, "text/xml");

      // Verificar erros de parsing
      const parserError = xmlDoc.getElementsByTagName("parsererror");
      if (parserError.length > 0) {
        alert("❌ Arquivo XML mal formatado ou corrompido.\n\nO arquivo não pôde ser lido corretamente.");
        e.target.value = "";
        return;
      }

      // Função auxiliar para buscar tags em qualquer namespace
      const getTag = (tagName) => {
        return xmlDoc.getElementsByTagName(tagName)[0] || xmlDoc.getElementsByTagNameNS("*", tagName)[0];
      };

      const getText = (element, tagName) => {
        if (!element) return null;
        const tag = element.getElementsByTagName(tagName)[0] || element.getElementsByTagNameNS("*", tagName)[0];
        return tag?.textContent || null;
      };

      // DETECTAR TIPO DE NOTA
      // 1. Tentar NF-e (Nota Fiscal de Produto)
      let nfeNode = getTag("NFe") || getTag("nfeProc") || getTag("nfe");
      let infNFeNode = getTag("infNFe");

      // 2. Tentar NFS-e (Nota Fiscal de Serviço)
      let nfseNode = getTag("CompNfse") || getTag("Nfse") || getTag("nfse");
      let infNfseNode = getTag("InfNfse") || getTag("infNfse");

      // Verificar se é NF-e
      if (nfeNode || infNFeNode) {
        setImportacao({ ativo: true, total: 1, processados: 0, erros: 0 });

        const ide = getTag("ide");
        const emit = getTag("emit");
        const dest = getTag("dest");
        const ICMSTot = getTag("ICMSTot");

        // IMPORTANTE: Para receita, o DESTINATÁRIO é quem está pagando (cliente)
        const clienteNome = getText(dest, "xNome") || "Cliente Desconhecido";
        const clienteCNPJ = getText(dest, "CNPJ") || getText(dest, "CPF") || "";

        const dataEmissao = (getText(ide, "dhEmi") || getText(ide, "dEmi") || new Date().toISOString()).split("T")[0];
        const numeroNFe = getText(ide, "nNF") || "S/N";
        const valorTotal = parseFloat(getText(ICMSTot, "vNF") || "0");

        if (valorTotal === 0) {
          alert("⚠️ NF-e sem valor total detectado.\n\nVerifique se o XML está completo.");
          setImportacao({ ativo: false, total: 0, processados: 0, erros: 0 });
          e.target.value = "";
          return;
        }

        // Buscar ou criar cliente
        let clientesEncontrados = await sigo.entities.Cliente.filter({
          empresa_id: empresaAtiva.id,
          documento: clienteCNPJ,
        });

        let cliente;
        if (clienteCNPJ && clientesEncontrados.length === 0) {
          cliente = await sigo.entities.Cliente.create({
            empresa_id: empresaAtiva.id,
            nome_razao: clienteNome,
            documento: clienteCNPJ,
            tipo_pessoa: clienteCNPJ.length > 11 ? "PJ" : "PF",
          });
        } else if (clienteCNPJ) {
          cliente = clientesEncontrados[0];
        }

        // Criar receita
        await sigo.entities.TransacaoFinanceira.create({
          empresa_id: empresaAtiva.id,
          tipo: "receita",
          conta_id: contas[0]?.id,
          conta_nome: contas[0]?.nome,
          cliente_id: cliente?.id || null,
          cliente_nome: clienteNome,
          valor: valorTotal,
          data: dataEmissao,
          data_vencimento: dataEmissao,
          descricao: `NF-e ${numeroNFe} - ${clienteNome}`,
          status: "em_aberto",
          observacoes: `Importado de XML - NF-e ${numeroNFe}`,
        });

        setImportacao({ ativo: false, total: 0, processados: 0, erros: 0 });
        alert(
          `✅ NF-e importada com sucesso!\n\nCliente: ${clienteNome}\nNúmero: ${numeroNFe}\nValor: ${formatCurrency(valorTotal)}`
        );
        onReload();
      }
      // Verificar se é NFS-e
      else if (nfseNode || infNfseNode) {
        setImportacao({ ativo: true, total: 1, processados: 0, erros: 0 });

        const infNfse = infNfseNode || nfseNode;
        const tomador = getTag("TomadorServico") || getTag("tomadorServico");
        const servico = getTag("Servico") || getTag("servico");
        const valores = getTag("Valores") || getTag("valores");

        const clienteNome =
          getText(tomador, "RazaoSocial") || getText(tomador, "razaoSocial") || "Cliente Desconhecido";
        const clienteCNPJ =
          getText(tomador, "Cnpj") ||
          getText(tomador, "cnpj") ||
          getText(tomador, "Cpf") ||
          getText(tomador, "cpf") ||
          "";

        const dataEmissao = (
          getText(infNfse, "DataEmissao") ||
          getText(infNfse, "dataEmissao") ||
          new Date().toISOString()
        ).split("T")[0];
        const numeroNFSe = getText(infNfse, "Numero") || getText(infNfse, "numero") || "S/N";
        const valorTotal = parseFloat(getText(valores, "ValorServicos") || getText(valores, "valorServicos") || "0");

        if (valorTotal === 0) {
          alert("⚠️ NFS-e sem valor detectado.\n\nVerifique se o XML está completo.");
          setImportacao({ ativo: false, total: 0, processados: 0, erros: 0 });
          e.target.value = "";
          return;
        }

        // Buscar ou criar cliente
        let clientesEncontrados = await sigo.entities.Cliente.filter({
          empresa_id: empresaAtiva.id,
          documento: clienteCNPJ,
        });

        let cliente;
        if (clienteCNPJ && clientesEncontrados.length === 0) {
          cliente = await sigo.entities.Cliente.create({
            empresa_id: empresaAtiva.id,
            nome_razao: clienteNome,
            documento: clienteCNPJ,
            tipo_pessoa: clienteCNPJ.length > 11 ? "PJ" : "PF",
          });
        } else if (clienteCNPJ) {
          cliente = clientesEncontrados[0];
        }

        // Criar receita
        await sigo.entities.TransacaoFinanceira.create({
          empresa_id: empresaAtiva.id,
          tipo: "receita",
          conta_id: contas[0]?.id,
          conta_nome: contas[0]?.nome,
          cliente_id: cliente?.id || null,
          cliente_nome: clienteNome,
          valor: valorTotal,
          data: dataEmissao,
          data_vencimento: dataEmissao,
          descricao: `NFS-e ${numeroNFSe} - ${clienteNome}`,
          status: "em_aberto",
          observacoes: `Importado de XML - NFS-e ${numeroNFSe}`,
        });

        setImportacao({ ativo: false, total: 0, processados: 0, erros: 0 });
        alert(
          `✅ NFS-e importada com sucesso!\n\nCliente: ${clienteNome}\nNúmero: ${numeroNFSe}\nValor: ${formatCurrency(valorTotal)}`
        );
        onReload();
      } else {
        alert(
          "❌ Arquivo XML não reconhecido.\n\nFormatos aceitos:\n• NF-e (Nota Fiscal Eletrônica de Produto)\n• NFS-e (Nota Fiscal de Serviço Eletrônica)\n\nVerifique se o arquivo foi baixado corretamente da prefeitura ou SEFAZ."
        );
        e.target.value = "";
        return;
      }
    } catch (error) {
      console.error("Erro ao processar XML:", error);
      setImportacao({ ativo: false, total: 0, processados: 0, erros: 0 });
      alert(`❌ Erro ao processar arquivo XML.\n\nDetalhes: ${error.message}\n\nVerifique se o arquivo está correto.`);
    } finally {
      e.target.value = "";
    }
  };
  reader.readAsText(file);
};
```

por:

```jsx
// "Importar XML / NF-e" da lista: cria a receita direto, sem abrir o
// formulário. Mesmo leitor do "Ler documento" (lerXmlFiscal); o cliente é o
// destinatário/tomador, casado pelos DÍGITOS do CPF/CNPJ e depois pelo nome;
// sem cadastro e com CPF/CNPJ → cria o cliente (como antes).
const handleImportarXML = async (e) => {
  const input = e.target;
  const file = input.files?.[0];
  if (!file) return;

  try {
    const doc = lerXmlFiscal(await textoDoXml(file));
    if (!doc) {
      alert(
        "❌ Arquivo XML não reconhecido.\n\nFormatos aceitos:\n• NF-e / NFC-e (Nota Fiscal Eletrônica de Produto)\n• NFS-e (Nota Fiscal de Serviço Eletrônica)\n\nVerifique se o arquivo foi baixado corretamente da prefeitura ou SEFAZ."
      );
      return;
    }
    if (!(doc.valor_total > 0)) {
      alert("⚠️ Nota sem valor total.\n\nVerifique se o XML está completo.");
      return;
    }

    setImportacao({ ativo: true, total: 1, processados: 0, erros: 0 });

    const cadastrados = await sigo.entities.Cliente.filter({ empresa_id: empresaAtiva.id });
    let cliente = acharPessoa(cadastrados, doc.destinatario, "documento");
    const novo = cliente ? null : cadastroDoXml(doc, "receita");
    if (novo) {
      cliente = await sigo.entities.Cliente.create({ empresa_id: empresaAtiva.id, ...novo });
    }

    const { registro, duplicatas, rotulo } = lancamentoDoXml(doc, {
      tipo: "receita",
      pessoa: cliente,
      conta: contas[0],
      empresaId: empresaAtiva.id,
      hoje: hojeLocalISO(),
    });
    await sigo.entities.TransacaoFinanceira.create(registro);

    alert(
      `✅ ${rotulo} importada com sucesso!\n\nCliente: ${registro.cliente_nome}\nNúmero: ${doc.numero || "S/N"}\nValor: ${formatCurrency(registro.valor)}` +
        (duplicatas > 1
          ? `\n\nA nota tem ${duplicatas} duplicatas: a receita foi lançada inteira no 1º vencimento. Para lançar parcelado, use Nova Receita → Ler documento.`
          : "")
    );
    onReload();
  } catch (err) {
    console.error("[ReceitasTab] erro ao importar XML:", err);
    alert("❌ Erro ao importar o XML: " + (err?.message || "tente novamente"));
  } finally {
    setImportacao({ ativo: false, total: 0, processados: 0, erros: 0 });
    input.value = "";
  }
};
```

- [ ] **Step 4: Botão no Sheet, faixa do cliente e cadastro com os dados lidos**

Em `apps/web/src/components/financeiro/ReceitasTab.jsx` (linhas 1440–1453, o "Importar XML ou NF-e" de dentro do Sheet), trocar:

```jsx
          <label
            htmlFor="importar-xml-modal"
            className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center justify-center gap-2 my-4 cursor-pointer hover:bg-blue-100 transition-colors"
          >
            <Upload className="w-4 h-4 text-blue-600" />
            <span className="text-sm text-blue-700 font-medium">Importar XML ou NF-e</span>
          </label>
          <input
            type="file"
            id="importar-xml-modal"
            accept=".xml"
            onChange={handleImportarXML}
            className="hidden"
          />
```

por:

```jsx
{
  /* LER DOCUMENTO — só na receita nova; preenche para conferir, não salva */
}
{
  !selectedItem && (
    <div className="my-4 space-y-2">
      <LerDocumentoButton
        tipo="receita"
        onLido={aplicarDocumentoLido}
        disabled={saving}
        className="w-full border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
      />
      <ConferirLeitura duvidosos={leitura?.duvidosos} avisos={leitura?.avisos} />
    </div>
  );
}
```

Em `apps/web/src/components/financeiro/ReceitasTab.jsx` (linhas 1586–1591), trocar:

```jsx
                      onClick={() => setShowNovoCliente(true)}
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
```

por:

```jsx
                      onClick={() => {
                        setDadosNovoCliente(null);
                        setShowNovoCliente(true);
                      }}
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                  {!form.cliente_id && (
                    <PessoaNaoCadastrada
                      rotulo="Cliente"
                      pessoa={leitura?.pessoaSugerida}
                      onCadastrar={() => {
                        setDadosNovoCliente(
                          dadosIniciaisCadastro(leitura.pessoaSugerida, "documento")
                        );
                        setShowNovoCliente(true);
                      }}
                    />
                  )}
                </div>
```

Em `apps/web/src/components/financeiro/ReceitasTab.jsx` (linhas 1975–1977), trocar:

```jsx
            empresaAtiva={empresaAtiva}
            onClienteCriado={(cliente) => {
              setClientesLocais((prev) => [...prev, cliente]);
```

por:

```jsx
            empresaAtiva={empresaAtiva}
            dadosIniciais={dadosNovoCliente}
            onClienteCriado={(cliente) => {
              setClientesLocais((prev) => [...prev, cliente]);
              setLeitura((prev) => (prev ? { ...prev, pessoaSugerida: null } : prev));
```

- [ ] **Step 5: Conferir, lint, testes do front e build**

Run:

```bash
grep -c "DOMParser\|importar-xml-modal" apps/web/src/components/financeiro/ReceitasTab.jsx
(cd apps/web && npx eslint --quiet --rule '{"no-undef":"error","react/jsx-no-undef":"error"}' src/components/financeiro/ReceitasTab.jsx && echo LINT_OK)
(cd apps/web && npx vitest run && npm run lint)
(cd apps/web && npm run build > /dev/null && echo BUILD_OK)
```

Expected:

- `grep -c` imprime `0`;
- `LINT_OK`;
- vitest: nenhuma falha (mesma contagem do fim da Task 14); `npm run lint` sem erros;
- `BUILD_OK`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/financeiro/ReceitasTab.jsx
git commit -F - <<'EOF'
feat(financeiro): "Ler documento" na nova receita e XML pela lista com cliente por CPF/CNPJ

O botão substitui o "Importar XML ou NF-e" de dentro do formulário (que
criava a receita direto): agora preenche para conferir, com o cliente do
documento (destinatário/tomador), parcelas, anexo e a faixa para cadastrar
o cliente com os dados lidos. A importação pela lista usa o mesmo leitor
e casa o cliente pelos dígitos do CPF/CNPJ.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git log --oneline -1
```

Expected: o lint-staged roda o prettier no arquivo e o commit sai; `git log` mostra `feat(financeiro): "Ler documento" na nova receita e XML pela lista com cliente por CPF/CNPJ`.

### Task 16: Produção da Parte B e teste com o Javerson (com OK)

**Files:** nenhum arquivo do repositório muda. As consultas de conferência vão em arquivos temporários em `$TEMP` (fora do repo).

**Interfaces:**

- Consumes: tudo das Tasks 9 a 15 — `ia-processar` com a ação `financeiro_ler_documento` (Tasks 11 e 12) e o front (Tasks 9, 10, 13, 14 e 15). Pré-requisito: a Parte A no ar (Task 8), com a chave do Gemini salva e testada.
- Produces: Parte B no ar e conferida com documentos reais (critérios de aceite 2 a 6 da spec).
- Ordem obrigatória: `ia-processar` → front. O front novo chama a ação nova; a função nova sozinha não muda nada para o front antigo.

- [ ] **Step 1: Suíte completa e formato (local)**

Run:

```bash
node --test supabase/functions/_shared/*.test.ts supabase/functions/ia-processar/*.test.ts supabase/functions/saas-config/*.test.ts
(cd apps/web && npx vitest run && npm run lint)
git fetch -q origin
npx prettier --check --ignore-unknown $(git diff --name-only --diff-filter=d origin/master..master)
```

Expected:

- node: `ℹ fail 0`;
- vitest: nenhuma falha; lint sem erros;
- prettier: `All matched files use Prettier code style!`.

- [ ] **Step 2: Conferir o que vai subir**

O deploy de função publica a **working tree** da pasta da função e do `_shared`, e não o commit. Por isso, confira antes:

Run:

```bash
git status --short supabase/functions/ia-processar supabase/functions/_shared apps/web/src
git log --oneline origin/master..master
```

Expected:

- `git status`: nenhuma linha. Se aparecer arquivo modificado (há mudanças de outras sessões em `_shared`), **pare** e mostre ao Javerson: elas iriam junto no deploy;
- `git log`: os commits da Parte B (Tasks 9 a 15), mais os de outras sessões, se houver. Mostre a lista ao Javerson.

- [ ] **Step 3: Pedir OK ao Javerson e publicar a `ia-processar`**

Pergunte: "Posso publicar a função `ia-processar` com a leitura de documentos do Financeiro? O que já existe continua igual." Só com o "sim":

A `ia-processar` hoje tem `verify_jwt = true`. Publique **sem** `--no-verify-jwt`:

Run: `npx supabase@2.118.0 functions deploy ia-processar --project-ref fpyvdwpvxrubrkdwrqbs --use-api`
Expected: termina com `Deployed Functions on project fpyvdwpvxrubrkdwrqbs: ia-processar`.

Conferir que o `verify_jwt` continua ligado:

```bash
curl -s -X POST -H "content-type: application/json" -d '{}' "https://fpyvdwpvxrubrkdwrqbs.supabase.co/functions/v1/ia-processar"; echo
```

Expected: `{"code":"UNAUTHORIZED_NO_AUTH_HEADER","message":"Missing authorization header"}`. Se vier `{"success":false,"error":"Sessão inválida"}`, o `verify_jwt` foi desligado: republique sem a flag.

- [ ] **Step 4: Pedir OK ao Javerson e publicar o front (push em master)**

Run: `git fetch -q origin && git status -sb | head -1 && git log --oneline origin/master..master`
Mostre os commits que vão subir e pergunte: "Posso publicar o front (push em master)?". Só com o "sim":

Run: `git push origin master`

Acompanhe: `gh run list --limit 2` e `gh run watch <id do Deploy frontend> --exit-status`
Expected: "Deploy frontend to Hostgator" e "CI" concluídos com sucesso.

- [ ] **Step 5: Teste com o Javerson — nova despesa**

Com o Javerson logado em https://www.sigoobras.com.br (atualizar com Ctrl+F5), em Financeiro → Despesas → **Nova Despesa**, o botão "Ler documento (XML, PDF ou foto)" aparece no topo. Ele usa documentos reais dele:

1. **XML de uma NF-e de compra com duplicatas** (sem IA). Conferir:
   - toast "Documento lido — confira os campos antes de salvar.";
   - Descrição "NF-e <nº> - <FORNECEDOR>", Valor = total da nota, Data de Competência = emissão, Data de Vencimento = 1ª duplicata, Forma de Pagamento (se a nota informar);
   - Fornecedor já cadastrado (mesmo com CNPJ pontuado) vem selecionado, com a categoria do cadastro se a despesa ainda não tinha; se não existir, aparece a faixa "Fornecedor não cadastrado: NOME (CNPJ) [Cadastrar]" — clicar em **Cadastrar** abre o Novo Fornecedor com nome, CNPJ, tipo PJ e endereço; salvar deixa o fornecedor selecionado e a faixa some;
   - "Permitir parcelamento" marcado e a lista de parcelas com as datas e valores das duplicatas;
   - com itens, abre a janela de associar materiais (pode fechar);
   - o XML aparece em "Anexar Comprovantes" e abre no "Visualizar"; a seção "Nota Fiscal (Opcional)" mostra "Nota nº N lida do documento".
     Escolher a conta e **Salvar**.
2. **PDF do DANFE da mesma nota** (IA): o botão mostra "Enviando arquivo…" e depois "Lendo documento…" (até ~1 min). Os mesmos campos vêm preenchidos; se a IA leu a chave impressa no DANFE, aparece o alerta vermelho "NFe já lançada anteriormente" (a chave foi gravada no item 1). **Cancelar**.
3. **Foto de um recibo** (JPG do celular): valor, data e descrição começando por "Recibo"; se quem assinou é pessoa física, a faixa mostra o CPF e o cadastro abre como PF. Se houver campo lido com dúvida, aparece o aviso amarelo "Confira os campos destacados". **Cancelar**.
4. **Boleto em PDF**: Valor, Data de Vencimento = vencimento do boleto, Forma de Pagamento = Boleto. **Cancelar**.
5. (Opcional) uma foto em HEIC do iPhone: toast pedindo JPEG, e nada muda no formulário.

Conferir o que o item 1 gravou:

```bash
cat > "$TEMP/despesa_lida.sql" <<'EOF'
select t.descricao, t.valor, t.data_vencimento, t.fornecedor_nome, t.numero_documento,
       t.chave_nfe, t.parcelado, left(t.parcelas::text, 120) as parcelas,
       a.nome as anexo, a.url as anexo_ref, a.tipo as anexo_tipo
  from public.transacao_financeira t
  left join public.transacao_anexo a on a.transacao_id = t.id and a.deleted_at is null
 where t.tipo = 'Despesa' and t.deleted_at is null
 order by t.created_at desc
 limit 1;
EOF
supabase db query --linked -f "$TEMP/despesa_lida.sql"
```

Expected: a despesa do item 1 com `numero_documento` = `chave_nfe` (44 dígitos), `parcelado = true`, as parcelas das duplicatas e o anexo com `anexo_ref` começando em `nfe-xml/` e `anexo_tipo` `text/xml` (ou `application/xml`).

- [ ] **Step 6: Teste com o Javerson — nova receita**

Em Financeiro → Receitas → **Nova Receita**, "Ler documento" com o **PDF de uma NFS-e emitida pela empresa**. Conferir:

- Descrição "NFS-e <nº> - <TOMADOR>", Valor, datas;
- Cliente = tomador: selecionado se já cadastrado (CNPJ com ou sem pontuação); senão, a faixa "Cliente não cadastrado: NOME (CNPJ) [Cadastrar]" abre o Novo Cliente com os dados lidos;
- o PDF aparece em "Anexos (Recibo, NF, Comprovante)".
  Salvar ou Cancelar, como o Javerson preferir.

- [ ] **Step 7: Registro de uso da IA**

```bash
cat > "$TEMP/ia_uso_leitura.sql" <<'EOF'
select criado_em, acao, provedor, modelo, tokens_entrada, tokens_saida, custo_usd
  from public.ia_uso
 where acao = 'financeiro_ler_documento'
 order by criado_em desc
 limit 6;
EOF
supabase db query --linked -f "$TEMP/ia_uso_leitura.sql"
```

Expected: uma linha por PDF/foto lido nos Steps 5 e 6 (DANFE, recibo, boleto, NFS-e; o XML do item 1 **não** gera linha — foi lido sem IA), com `provedor = gemini`, tokens > 0 e `custo_usd` > 0. `gemini,openai` numa linha = o Gemini falhou e a reserva respondeu (ver os logs da `ia-processar` no painel do Supabase).

- [ ] **Step 8: Importação de XML pela lista**

1. Despesas → Ações → **Importar XML / NF-e** com o **mesmo XML** do Step 5: aparece "⚠️ Esta NF-e já foi lançada: …" e nada é criado.
2. Com o XML de outra NF-e cujo fornecedor já está cadastrado: "✅ NF-e importada com sucesso!" e, se a nota tiver duplicatas, o aviso de que foi lançada no 1º vencimento.

Conferir que a importação não criou fornecedor repetido:

```bash
cat > "$TEMP/fornecedores_novos.sql" <<'EOF'
select nome_razao, cnpj, created_at
  from public.fornecedor
 where created_at > now() - interval '2 hours'
 order by created_at desc;
EOF
supabase db query --linked -f "$TEMP/fornecedores_novos.sql"
```

Expected: só os fornecedores que o Javerson cadastrou pela faixa no Step 5; nenhum criado pela importação do item 2.

- [ ] **Step 9: Plano de volta (só se o Javerson pedir)**

A ação nova da `ia-processar` não muda nada para o front antigo, então a volta é só do front. Pergunte: "Posso desfazer as telas do 'Ler documento' (revert das Tasks 13 a 15) e publicar?". Só com o "sim":

```bash
H15=$(git log --format=%h -1 --grep="\"Ler documento\" na nova receita")
H14=$(git log --format=%h -1 --grep="\"Ler documento\" na nova despesa")
H13=$(git log --format=%h -1 --grep="botão \"Ler documento\"")
echo "$H15 $H14 $H13"   # mostrar ao Javerson antes de reverter
git revert --no-commit "$H15" "$H14" "$H13"
git commit -F - <<'EOF'
revert(financeiro): desfaz o "Ler documento" nas telas de despesa e receita

Volta o "Importar NFe (XML)" antigo; a ação financeiro_ler_documento da
ia-processar fica publicada, sem uso.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git push origin master
```

Expected: um commit `revert(financeiro): desfaz o "Ler documento" nas telas de despesa e receita` e o deploy do front concluído (`gh run watch`); o Financeiro volta ao "Importar NFe (XML)" antigo. As libs das Tasks 9 e 10 ficam sem uso, sem efeito para o usuário.

---

## Adendo de 29/09/2026: Tasks 17 e 18 (executar ANTES da Task 16)

Decisões do Javerson em 29/09, depois da revisão final da Parte B:

- **Cota diária geral de IA:** as ações sem limite (`llm`, `extrair_documentos`, `validar_exames_pcmso` e `financeiro_ler_documento`) ganham um limite por empresa de **300 requisições por dia**. Ele é configurável no SaaS Admin, junto com a cota do edital (400). O pedido veio da sessão de segurança: hoje qualquer usuário usaria a chave do SaaS sem teto.
- **"Ler documento" em todos os usos do `DespesaModal`:** o antigo "Importar NFe (XML)" saiu da edição de despesa, do pré-lançamento e da reconciliação. O botão novo passa a aparecer também nesses lugares, sempre com o aviso "Confira os campos".

Estas duas tasks não trazem o código pronto. Os requisitos abaixo são exatos, e o implementador segue os padrões do código vizinho citado. Nenhuma migração é necessária.

### Task 17: Cota diária geral de IA por empresa (300/dia) e limites no SaaS Admin

**Files:**

- Modify: `supabase/functions/ia-processar/ia-uso.ts` (cota) e `supabase/functions/ia-processar/ia-uso.test.ts`
- Modify: `supabase/functions/ia-processar/index.ts` (checagem antes das 4 ações; doc do cabeçalho)
- Modify: `supabase/functions/saas-config/regras.ts`, `supabase/functions/saas-config/regras.test.ts` e `supabase/functions/saas-config/index.ts` (status e definir das cotas)
- Modify: `apps/web/src/lib/integracoes-ia.js`, `apps/web/src/lib/integracoes-ia.test.js` e `apps/web/src/components/saas/IntegracoesTab.jsx` (card "Limites diários de IA por empresa")

**Interfaces:**

- Produces (`ia-uso.ts`):
  - `export const COTA_GERAL_PADRAO = 300;`
  - `export const CHAVE_COTA_GERAL = "ia_cota_geral_dia";`
  - `export const ACOES_GERAIS = ["llm", "extrair_documentos", "validar_exames_pcmso", "financeiro_ler_documento"] as const;`
  - `export function ehAcaoGeral(acao: unknown): boolean`
  - `export function lerCota(valor: unknown, padrao = COTA_EDITAL_PADRAO): number`: o padrão vira 2º parâmetro; as chamadas antigas continuam iguais.
  - `export async function verificarCotaGeral(admin, u: UsuarioUso, agora = new Date()): Promise<{ cota: number; usadas: number } | null>`
  - `verificarCotaEdital` mantém a assinatura e o comportamento. As duas usam uma função interna comum, `verificarCota(admin, u, { chave, padrao, acoes }, agora)`, sem duplicar a lógica de contar, ler a cota, isentar o super admin e liberar em caso de erro.
- Produces (`saas-config`):
  - `status` devolve também `cotas: { edital_dia: number, geral_dia: number }`, com os valores efetivos. Quando a chave não existe ou é inválida, valem os padrões 400 e 300.
  - `definir` aceita `cota_edital_dia` e `cota_geral_dia`, os dois opcionais, com inteiro de 1 a 100000. Outro valor → 400 com mensagem clara.
  - As cotas são gravadas em `saas_config` (`ia_cota_edital_dia` e `ia_cota_geral_dia`) pelo mesmo upsert das outras chaves.
  - A validação fica pura, em `regras.ts`.
- Produces (front):
  - Em `integracoes-ia.js`: `validarCota(texto): { ok: true, valor } | { ok: false, erro }`. Aceita inteiro de 1 a 100000, com espaços; vazio dá erro "Informe um número inteiro".
  - No `IntegracoesTab.jsx`: um card "Limites diários de IA por empresa", no mesmo estilo dos cards existentes, com:
    - dois campos, "Leitura de editais (por dia)" e "Demais ações de IA (por dia)", preenchidos pelo `status`;
    - o botão Salvar, que chama `definir` só com as cotas.

**Requisitos:**

1. **Checagem no `index.ts`:**
   - Onde: antes da cadeia de ações, depois da autenticação e da validação da empresa.
   - Se `ehAcaoGeral(body.acao)`, chamar `verificarCotaGeral(admin, usuario)`.
   - Estourado → `fail("Limite diário de uso da IA atingido para esta empresa (U de C chamadas hoje) — tente amanhã ou fale com o suporte do SIGO.", 429, { codigo: "COTA_IA", cota, usadas })`, no mesmo formato da cota do edital.
   - Como no edital, o super admin é isento, e um erro ao contar libera a ação.
   - Atualizar o comentário "COTA só das ações edital\_\*" do cabeçalho para descrever as duas cotas.
2. **Contagem da cota geral:**
   - só as linhas de `ia_uso` do dia (fuso de Brasília) com `acao` em `ACOES_GERAIS`;
   - da empresa do token, ou do próprio usuário quando não houver empresa, como o `doDono` atual.
   - A cota do edital continua contando só `ACOES_EDITAL`.
3. **TDD no `ia-uso.test.ts`**, com o mesmo cliente falso dos testes atuais. Casos da cota geral:
   - usa o padrão 300 quando não há chave;
   - lê `ia_cota_geral_dia`;
   - filtra `.in("acao", ACOES_GERAIS)`;
   - estoura quando `usadas >= cota`;
   - isenta o super admin;
   - libera quando a contagem dá erro.

   Os testes atuais da cota do edital continuam passando sem mudança. `ehAcaoGeral` é testada com as 4 ações, com `edital_consolidar` e com lixo.

4. **TDD da validação das cotas:**
   - no `regras.test.ts` da `saas-config`, com 1, 100000, 0, 100001, 12.5, "abc" e ausente (ausente = não mexe);
   - no `integracoes-ia.test.js`, para `validarCota`.
5. **Comandos:**
   - `node --test supabase/functions/_shared/*.test.ts supabase/functions/ia-processar/*.test.ts supabase/functions/saas-config/*.test.ts` (fail 0);
   - `cd apps/web && npx vitest run`;
   - `npx eslint src/components/saas/IntegracoesTab.jsx`;
   - `npm run build > /dev/null && echo BUILD_OK`.
6. **Nada de produção:** a publicação da `ia-processar` e da `saas-config` é na Task 16. Commit: `feat(ia): cota diária de 300 chamadas por empresa nas demais ações de IA, configurável no SaaS Admin`.

### Task 18: "Ler documento" também na edição de despesa, no pré-lançamento e na reconciliação

**Files:**

- Modify: `apps/web/src/components/financeiro/DespesaModal.jsx` (a condição que exibe o botão, hoje `adicionarAnexoPronto && !selectedItem`)
- Modify: os pais do `DespesaModal` que hoje não passam `adicionarAnexoPronto`:
  - `apps/web/src/components/financeiro/PreLancamentosAReconciliar.jsx`;
  - `apps/web/src/components/financeiro/CalendarioFinanceiro.jsx`;
  - `apps/web/src/components/financeiro/HistoricoFechamentosCaixa.jsx`;
  - os modais de pré-lançamento e reconciliação que embrulham o `DespesaModal`, se forem outros arquivos. Confira com `grep -rn "<DespesaModal" apps/web/src`.
- Test: se surgir lógica pura nova (ex.: acrescentar anexo pronto sem duplicar), ela fica em `apps/web/src/lib/`, com teste Vitest.

**Requisitos:**

1. **Exibição do botão:**
   - O botão "Ler documento", com o texto de ajuda e o `ConferirLeitura`, aparece sempre que o pai passa `adicionarAnexoPronto`, **também na edição** (com `selectedItem` preenchido).
   - Na edição, a leitura continua sobrescrevendo só os campos que o documento trouxe.
   - O aviso "Confira os campos" aparece como na despesa nova.
2. **`adicionarAnexoPronto` em todos os pais:**
   - Todos os pais do `DespesaModal` passam a função, no mesmo padrão do `DespesasTab.jsx`.
   - A função recebe `{ nome, url: ref, tipo }` do anexo que já subiu e o acrescenta à lista de anexos do formulário daquele pai.
   - Sem novo upload, e sem duplicar se o mesmo `url` já estiver na lista.
   - Grava sempre o `ref`, nunca a URL assinada.
3. **Gravação:**
   - Nada é gravado antes do Salvar de cada tela.
   - O fluxo de salvar de cada pai (pré-lançamento, reconciliação, calendário, histórico de fechamentos) não muda.
4. **Não quebrar:**
   - a edição de despesa existente;
   - as parcelas;
   - os anexos;
   - a Nota de Devolução;
   - a conciliação e a desconciliação.
5. **Comandos e commit:**
   - `cd apps/web && npx vitest run`;
   - `npx eslint <arquivos .jsx alterados>`;
   - `npm run build > /dev/null && echo BUILD_OK`.

   Nada de produção. Commit: `feat(financeiro): "Ler documento" também na edição, no pré-lançamento e na reconciliação`.

6. **Relatório:** liste cada pai do `DespesaModal` e como ficou (se passa `adicionarAnexoPronto` ou, se não, por quê), para o roteiro de teste da Task 16.
