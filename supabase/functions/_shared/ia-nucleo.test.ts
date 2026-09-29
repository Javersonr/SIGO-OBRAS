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
  assert.deepEqual(
    configDeLinhas([{ chave: "gemini_api_key", valor: "  " }], { GEMINI_API_KEY: "" }),
    {
      gemini: { apiKey: null, modelo: "gemini-3.5-flash-lite", modeloForte: "gemini-3.8-flash" },
      openai: { apiKey: null, modelo: "gpt-4o-mini", modeloForte: "gpt-4o" },
    }
  );
});
