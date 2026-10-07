// Roda com Node 23.6+ (type stripping):  node --test supabase/functions/_shared/whatsapp-envio.test.ts
//
// T18, M2: o envio ao Evolution tem tempo limite. Sem ele, um Evolution fora do ar fazia o `fetch`
// esperar o timeout de conexão do sistema (minutos) e a revogação do certificado ficava pendurada.
// O `Deno` e o `fetch` são simulados: nenhuma chamada de rede de verdade, nenhum número real.
import { test, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  CanalNaoConfiguradoError,
  TEMPO_LIMITE_ENVIO_MS,
  enviarWhatsAppTexto,
} from "./whatsapp-envio.ts";

type Resposta = { ok: boolean; status: number; text: () => Promise<string> };

const g = globalThis as unknown as { Deno?: unknown; fetch: unknown };
const originais = { Deno: g.Deno, fetch: g.fetch };

function configurar(env: Record<string, string> | null) {
  g.Deno = { env: { get: (k: string) => env?.[k] } };
}
const ENV_OK = {
  EVOLUTION_URL: "https://evolution.exemplo.test/",
  EVOLUTION_INSTANCE: "instancia-teste",
  EVOLUTION_APIKEY: "chave-de-teste",
};

beforeEach(() => configurar(ENV_OK));
afterEach(() => {
  g.Deno = originais.Deno;
  g.fetch = originais.fetch;
});

/** fetch que nunca responde e só termina quando o sinal aborta (como o de verdade). */
function fetchPendurado(chamadas: { url: string; signal?: AbortSignal }[]) {
  return (url: string, init?: { signal?: AbortSignal }) =>
    new Promise<Resposta>((_resolve, rejeitar) => {
      chamadas.push({ url, signal: init?.signal });
      init?.signal?.addEventListener("abort", () => rejeitar(init.signal?.reason));
    });
}

test("o tempo limite padrão do envio é de poucos segundos (nunca minutos)", () => {
  assert.ok(
    TEMPO_LIMITE_ENVIO_MS >= 5_000,
    "tempo para o Evolution responder em condições normais"
  );
  assert.ok(TEMPO_LIMITE_ENVIO_MS <= 20_000, "tempo curto o bastante para não segurar a revogação");
});

test("Evolution que não responde: o envio falha pelo tempo limite, sem esperar minutos", async () => {
  const chamadas: { url: string; signal?: AbortSignal }[] = [];
  g.fetch = fetchPendurado(chamadas);
  const inicio = Date.now();
  await assert.rejects(
    enviarWhatsAppTexto("5538999990000", "oi", { limiteMs: 40 }),
    /tempo esgotado/i
  );
  assert.ok(Date.now() - inicio < 2_000, "falhou depressa");
  assert.equal(chamadas.length, 1);
  assert.ok(chamadas[0].signal, "o fetch recebe o sinal do tempo limite");
  assert.equal(chamadas[0].signal?.aborted, true);
});

test("o tempo limite vale para o envio inteiro (o refazer no formato v1 divide o mesmo prazo)", async () => {
  const chamadas: { url: string; signal?: AbortSignal }[] = [];
  let n = 0;
  g.fetch = (url: string, init?: { signal?: AbortSignal }) => {
    n++;
    if (n === 1) {
      chamadas.push({ url, signal: init?.signal });
      // a v2 recusa com 400 (a Evolution v1 não conhece { text }): o código refaz no formato v1
      return Promise.resolve({ ok: false, status: 400, text: async () => "" });
    }
    return fetchPendurado(chamadas)(url, init);
  };
  await assert.rejects(
    enviarWhatsAppTexto("5538999990000", "oi", { limiteMs: 40 }),
    /tempo esgotado/i
  );
  assert.equal(chamadas.length, 2);
  assert.equal(chamadas[0].signal, chamadas[1].signal, "o mesmo sinal nas duas chamadas");
});

test("envio que responde dentro do prazo continua funcionando (200 e o refazer após 400)", async () => {
  const corpos: unknown[] = [];
  let n = 0;
  g.fetch = (_url: string, init?: { body?: string }) => {
    corpos.push(JSON.parse(init?.body ?? "null"));
    n++;
    return Promise.resolve(
      n === 1
        ? { ok: false, status: 400, text: async () => "" }
        : { ok: true, status: 201, text: async () => "" }
    );
  };
  await enviarWhatsAppTexto("5538999990000", "oi");
  assert.deepEqual(corpos, [
    { number: "5538999990000", text: "oi" },
    { number: "5538999990000", textMessage: { text: "oi" } },
  ]);
});

test("resposta de erro do Evolution continua lançando, com o status (não vira 'tempo esgotado')", async () => {
  g.fetch = () => Promise.resolve({ ok: false, status: 500, text: async () => "falha interna" });
  await assert.rejects(enviarWhatsAppTexto("5538999990000", "oi"), (e: Error) => {
    assert.match(e.message, /Evolution 500/);
    assert.doesNotMatch(e.message, /tempo esgotado/i);
    return true;
  });
});

test("sem configuração do canal, lança CanalNaoConfiguradoError (antes de qualquer chamada)", async () => {
  configurar({});
  let chamou = false;
  g.fetch = () => {
    chamou = true;
    return Promise.resolve({ ok: true, status: 200, text: async () => "" });
  };
  await assert.rejects(enviarWhatsAppTexto("5538999990000", "oi"), CanalNaoConfiguradoError);
  assert.equal(chamou, false);
});
