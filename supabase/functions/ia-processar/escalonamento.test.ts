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
  const f = chamadorFalso([
    ok({ a: 1, b: 2, cpf: null }),
    ok({ a: 1 }, { modelo: "gemini-3.8-flash" }),
  ]);
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
    ok(
      { cpf: "1" },
      { modelo: "gemini-3.1-pro-preview", usage: { input_tokens: 2000, output_tokens: 200 } }
    ),
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
