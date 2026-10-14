// node --test supabase/functions/_shared/habilitacao/lembretes-nucleo.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { esvaziarFila, MAX_POR_RODADA, type DepsFila, type ItemFila } from "./lembretes-nucleo.ts";

function montar(itens: ItemFila[], extra: Partial<DepsFila> = {}) {
  const enviados: [string, string][] = [];
  const marcados: string[] = [];
  const erros: [string, string][] = [];
  const deps: DepsFila = {
    pendentes: async (limite) => itens.slice(0, limite),
    reivindicar: async () => true,
    normalizar: (t) => (/^\d{10,13}$/.test(t) ? `55${t.replace(/^55/, "")}` : null),
    enviar: async (n, t) => void enviados.push([n, t]),
    marcarEnviado: async (id) => void marcados.push(id),
    marcarErro: async (id, e) => void erros.push([id, e]),
    canalForaDoAr: () => false,
    ...extra,
  };
  return { deps, enviados, marcados, erros };
}

const item = (id: string, telefone = "34999990000"): ItemFila => ({
  id,
  telefone,
  texto: `msg ${id}`,
  tentativas: 0,
});

test("esvaziarFila: envia cada pendente uma vez e marca como enviado", async () => {
  const m = montar([item("a"), item("b")]);
  assert.deepEqual(await esvaziarFila(m.deps), { lidos: 2, enviados: 2, falhas: 0, parou: false });
  assert.deepEqual(m.enviados, [
    ["5534999990000", "msg a"],
    ["5534999990000", "msg b"],
  ]);
  assert.deepEqual(m.marcados, ["a", "b"]);
});

test("esvaziarFila: pede no máximo MAX_POR_RODADA", async () => {
  let pedido = 0;
  const m = montar([], { pendentes: async (limite) => ((pedido = limite), []) });
  await esvaziarFila(m.deps);
  assert.equal(pedido, MAX_POR_RODADA);
});

test("esvaziarFila: telefone inválido vira erro sem enviar", async () => {
  const m = montar([item("a", "abc"), item("b")]);
  assert.deepEqual(await esvaziarFila(m.deps), { lidos: 2, enviados: 1, falhas: 1, parou: false });
  assert.deepEqual(m.erros, [["a", "telefone inválido"]]);
  assert.deepEqual(m.marcados, ["b"]);
});

test("esvaziarFila: item que outro processo pegou é pulado", async () => {
  const m = montar([item("a"), item("b")], { reivindicar: async (i) => i.id !== "a" });
  assert.deepEqual(await esvaziarFila(m.deps), { lidos: 2, enviados: 1, falhas: 0, parou: false });
  assert.deepEqual(m.marcados, ["b"]);
});

test("esvaziarFila: falha no envio fica registrada e a rodada continua", async () => {
  const m = montar([item("a"), item("b")], {
    enviar: async (_n, t) => {
      if (t === "msg a") throw new Error("Evolution 500: fora do ar");
    },
  });
  assert.deepEqual(await esvaziarFila(m.deps), { lidos: 2, enviados: 1, falhas: 1, parou: false });
  assert.deepEqual(m.erros, [["a", "Evolution 500: fora do ar"]]);
});

test("esvaziarFila: canal não configurado para a rodada antes de reivindicar os outros", async () => {
  const reivindicados: string[] = [];
  const m = montar([item("a"), item("b")], {
    reivindicar: async (i) => (reivindicados.push(i.id), true),
    enviar: async () => {
      throw new Error("canal");
    },
    canalForaDoAr: () => true,
  });
  assert.deepEqual(await esvaziarFila(m.deps), { lidos: 2, enviados: 0, falhas: 1, parou: true });
  assert.deepEqual(reivindicados, ["a"]);
});
