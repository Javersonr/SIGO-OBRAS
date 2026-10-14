// node --test supabase/functions/_shared/habilitacao/lembretes-nucleo.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  esvaziarFila,
  MAX_POR_RODADA,
  RESERVA_MINUTOS,
  type DepsFila,
  type ItemFila,
} from "./lembretes-nucleo.ts";

function montar(itens: ItemFila[], extra: Partial<DepsFila> = {}) {
  const reivindicados: string[] = [];
  const enviados: [string, string][] = [];
  const marcados: string[] = [];
  const erros: [string, string, boolean][] = [];
  const deps: DepsFila = {
    pendentes: async (limite) => itens.slice(0, limite),
    reivindicar: async (i) => (reivindicados.push(i.id), true),
    normalizar: (t) => (/^\d{10,13}$/.test(t) ? `55${t.replace(/^55/, "")}` : null),
    enviar: async (n, t) => void enviados.push([n, t]),
    marcarEnviado: async (id) => void marcados.push(id),
    marcarErro: async (id, e, definitivo) => void erros.push([id, e, definitivo]),
    canalForaDoAr: () => false,
    ...extra,
  };
  return { deps, reivindicados, enviados, marcados, erros };
}

const item = (id: string, telefone = "34999990000"): ItemFila => ({
  id,
  telefone,
  texto: `msg ${id}`,
  tentativas: 0,
});

/** O que foi para o console.error, uma linha por chamada. */
const linhasDe = (espiao: { mock: { calls: { arguments: unknown[] }[] } }) =>
  espiao.mock.calls.map((c) => c.arguments.map(String).join(" "));

test("esvaziarFila: reserva, envia e marca cada pendente uma vez", async () => {
  const m = montar([item("a"), item("b")]);
  assert.deepEqual(await esvaziarFila(m.deps), { lidos: 2, enviados: 2, falhas: 0, parou: false });
  assert.deepEqual(m.reivindicados, ["a", "b"]);
  assert.deepEqual(m.enviados, [
    ["5534999990000", "msg a"],
    ["5534999990000", "msg b"],
  ]);
  assert.deepEqual(m.marcados, ["a", "b"]);
  assert.deepEqual(m.erros, []);
});

test("esvaziarFila: pede no máximo MAX_POR_RODADA, e a reserva vale 10 minutos", async () => {
  let pedido = 0;
  const m = montar([], { pendentes: async (limite) => ((pedido = limite), []) });
  assert.deepEqual(await esvaziarFila(m.deps), { lidos: 0, enviados: 0, falhas: 0, parou: false });
  assert.equal(pedido, MAX_POR_RODADA);
  assert.equal(RESERVA_MINUTOS, 10);
});

test("esvaziarFila: telefone inválido vira erro definitivo, sem reservar e sem enviar", async () => {
  const m = montar([item("a", "abc"), item("b")]);
  assert.deepEqual(await esvaziarFila(m.deps), { lidos: 2, enviados: 1, falhas: 1, parou: false });
  // definitivo = true: o item não volta para a fila (um telefone inválido nunca se resolve sozinho)
  assert.deepEqual(m.erros, [["a", "telefone inválido", true]]);
  assert.deepEqual(m.reivindicados, ["b"]);
  assert.deepEqual(m.enviados, [["5534999990000", "msg b"]]);
  assert.deepEqual(m.marcados, ["b"]);
});

test("esvaziarFila: item que outra execução reservou é pulado, sem enviar", async () => {
  const m = montar([item("a"), item("b")], { reivindicar: async (i) => i.id !== "a" });
  assert.deepEqual(await esvaziarFila(m.deps), { lidos: 2, enviados: 1, falhas: 0, parou: false });
  assert.deepEqual(m.enviados, [["5534999990000", "msg b"]]);
  assert.deepEqual(m.marcados, ["b"]);
  assert.deepEqual(m.erros, []);
});

test("esvaziarFila: falha no envio fica registrada (não definitiva) e a rodada continua", async () => {
  const m = montar([item("a"), item("b")], {
    enviar: async (_n, t) => {
      if (t === "msg a") throw new Error("Evolution 500: fora do ar");
    },
  });
  assert.deepEqual(await esvaziarFila(m.deps), { lidos: 2, enviados: 1, falhas: 1, parou: false });
  // definitivo = false: a reserva é solta e o item volta a ser tentado (até MAX_TENTATIVAS)
  assert.deepEqual(m.erros, [["a", "Evolution 500: fora do ar", false]]);
  assert.deepEqual(m.marcados, ["b"]);
});

test("esvaziarFila: a mensagem de erro é cortada em 300 caracteres; erro que não é Error vira texto", async () => {
  const m = montar([item("a"), item("b")], {
    enviar: async (_n, t) => {
      if (t === "msg a") throw new Error("x".repeat(301));
      throw "falha em texto";
    },
  });
  assert.deepEqual(await esvaziarFila(m.deps), { lidos: 2, enviados: 0, falhas: 2, parou: false });
  assert.deepEqual(m.erros, [
    ["a", "x".repeat(300), false],
    ["b", "falha em texto", false],
  ]);
});

test("esvaziarFila: canal não configurado para a rodada antes de reservar os outros", async () => {
  const m = montar([item("a"), item("b")], {
    enviar: async () => {
      throw new Error("canal");
    },
    canalForaDoAr: () => true,
  });
  assert.deepEqual(await esvaziarFila(m.deps), { lidos: 2, enviados: 0, falhas: 1, parou: true });
  assert.deepEqual(m.reivindicados, ["a"]);
  assert.deepEqual(m.erros, [["a", "canal", false]]);
});

test("esvaziarFila: mensagem enviada cuja gravação falhou conta como enviada e não vira erro", async (t) => {
  const espiao = t.mock.method(console, "error", () => {});
  const marcados: string[] = [];
  const m = montar([item("id-enviado-1"), item("b")], {
    marcarEnviado: async (id) => {
      if (id === "id-enviado-1") throw new Error("banco fora do ar");
      marcados.push(id);
    },
  });
  // a mensagem SAIU: marcar erro devolveria o item à fila e ele seria enviado de novo
  assert.deepEqual(await esvaziarFila(m.deps), { lidos: 2, enviados: 2, falhas: 0, parou: false });
  assert.deepEqual(m.erros, []);
  assert.deepEqual(m.enviados.length, 2);
  assert.deepEqual(marcados, ["b"]); // a rodada seguiu
  // o log leva só o id: nem telefone nem texto
  const linhas = linhasDe(espiao);
  assert.equal(linhas.length, 1);
  assert.match(linhas[0], /id-enviado-1/);
  assert.doesNotMatch(linhas[0], /34999990000|msg/);
});

test("esvaziarFila: falha ao gravar o erro não interrompe a rodada", async (t) => {
  const espiao = t.mock.method(console, "error", () => {});
  const m = montar([item("id-invalido-1", "abc"), item("id-falhou-2"), item("c")], {
    enviar: async (_n, texto) => {
      if (texto === "msg id-falhou-2") throw new Error("Evolution 500");
    },
    marcarErro: async () => {
      throw new Error("banco fora do ar");
    },
  });
  assert.deepEqual(await esvaziarFila(m.deps), { lidos: 3, enviados: 1, falhas: 2, parou: false });
  assert.deepEqual(m.marcados, ["c"]);
  // um log por gravação que falhou, só com o id (a reserva do item expira sozinha)
  const linhas = linhasDe(espiao);
  assert.equal(linhas.length, 2);
  assert.match(linhas[0], /id-invalido-1/);
  assert.match(linhas[1], /id-falhou-2/);
  for (const linha of linhas) assert.doesNotMatch(linha, /34999990000|abc|msg|Evolution/);
});

test("esvaziarFila: canal não configurado para a rodada mesmo se a gravação do erro falhar", async (t) => {
  const espiao = t.mock.method(console, "error", () => {});
  const m = montar([item("a"), item("b")], {
    enviar: async () => {
      throw new Error("canal");
    },
    marcarErro: async () => {
      throw new Error("banco fora do ar");
    },
    canalForaDoAr: () => true,
  });
  assert.deepEqual(await esvaziarFila(m.deps), { lidos: 2, enviados: 0, falhas: 1, parou: true });
  assert.deepEqual(m.reivindicados, ["a"]);
  assert.equal(espiao.mock.callCount(), 1);
});

test("esvaziarFila: erro ao reservar interrompe a rodada sem enviar o item", async () => {
  const m = montar([item("a"), item("b")], {
    reivindicar: async (i) => {
      if (i.id === "b") throw new Error("banco fora do ar");
      return true;
    },
  });
  await assert.rejects(() => esvaziarFila(m.deps), /banco fora do ar/);
  assert.deepEqual(m.enviados, [["5534999990000", "msg a"]]);
  assert.deepEqual(m.marcados, ["a"]);
});
