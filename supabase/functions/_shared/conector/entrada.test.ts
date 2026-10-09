// node --test supabase/functions/_shared/conector/entrada.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  booleanoOuNull,
  camposForaDoSchema,
  inteiroNaFaixa,
  LIMITE_JSON_ENTRADA,
  semObrigatorios,
  textoCurto,
  UUID_RE,
  uuidOuNull,
} from "./entrada.ts";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["edital"],
  properties: {
    oportunidade_id: { type: "string" },
    edital: {
      type: "object",
      additionalProperties: false,
      required: ["local"],
      properties: {
        local: {
          type: "object",
          additionalProperties: false,
          required: ["cidade"],
          properties: { cidade: { type: ["string", "null"] } },
        },
        extras: { type: "object", properties: {} }, // sem additionalProperties:false
      },
    },
    linhas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["item"],
        properties: { item: { type: "string" }, required: { type: "boolean" } },
      },
    },
  },
};

test("camposForaDoSchema: caminhos aninhados e de lista, na ordem de encontro", () => {
  const valor = {
    oportunidade_id: "x",
    empresa_id: "outra",
    edital: { local: { cidade: "A", bairro: "B" }, extras: { livre: 1 } },
    linhas: [
      { item: "1" },
      { item: "1.1", bdi: 25 },
      "não é objeto",
      { item: "2", required: true },
    ],
  };
  assert.deepEqual(camposForaDoSchema(valor, SCHEMA), [
    "empresa_id",
    "edital.local.bairro",
    "linhas[1].bdi",
  ]);
});

test("camposForaDoSchema: objeto sem additionalProperties:false não acusa; ausentes não acusam", () => {
  assert.deepEqual(camposForaDoSchema({ edital: { extras: { a: 1, b: { c: 2 } } } }, SCHEMA), []);
  assert.deepEqual(camposForaDoSchema({}, SCHEMA), []);
  assert.deepEqual(camposForaDoSchema(null, SCHEMA), []);
  assert.deepEqual(camposForaDoSchema({ a: 1 }, { type: "object" }), []);
  assert.deepEqual(camposForaDoSchema({ a: 1 }, { type: "object", additionalProperties: false }), [
    "a",
  ]);
});

test("semObrigatorios: tira os required em todos os níveis e não muda o original", () => {
  const copia = semObrigatorios(SCHEMA);
  assert.equal("required" in copia, false);
  const edital = (copia.properties as Record<string, Record<string, unknown>>).edital;
  assert.equal("required" in edital, false);
  const local = (edital.properties as Record<string, Record<string, unknown>>).local;
  assert.equal("required" in local, false);
  const itens = (copia.properties as Record<string, Record<string, unknown>>).linhas
    .items as Record<string, unknown>;
  assert.equal("required" in itens, false);
  // um CAMPO chamado "required" continua lá
  assert.deepEqual((itens.properties as Record<string, unknown>).required, { type: "boolean" });
  assert.deepEqual(SCHEMA.required, ["edital"]);
  assert.deepEqual(SCHEMA.properties.edital.required, ["local"]);
  assert.equal(copia.additionalProperties, false);
});

test("uuidOuNull: minúsculas, aparado; o resto é null", () => {
  const u = "00000000-0000-4000-8000-0000000000AB";
  assert.equal(uuidOuNull(` ${u} `), u.toLowerCase());
  assert.equal(uuidOuNull("00000000-0000-4000-8000-00000000000"), null);
  assert.equal(uuidOuNull(42), null);
  assert.equal(uuidOuNull(null), null);
  assert.ok(UUID_RE.test(u));
});

test("textoCurto, inteiroNaFaixa e booleanoOuNull", () => {
  assert.equal(textoCurto("  abc  ", 10), "abc");
  assert.equal(textoCurto("abcdef", 3), "abc");
  assert.equal(textoCurto("   ", 3), null);
  assert.equal(textoCurto(5, 3), null);
  assert.equal(inteiroNaFaixa(5, 1, 60), 5);
  assert.equal(inteiroNaFaixa("12", 1, 60), 12);
  assert.equal(inteiroNaFaixa(0, 1, 60), null);
  assert.equal(inteiroNaFaixa(61, 1, 60), null);
  assert.equal(inteiroNaFaixa(1.5, 1, 60), null);
  assert.equal(inteiroNaFaixa("1.5", 1, 60), null);
  assert.equal(inteiroNaFaixa(null, 1, 60), null);
  assert.equal(booleanoOuNull(true), true);
  assert.equal(booleanoOuNull(false), false);
  assert.equal(booleanoOuNull("true"), null);
  assert.equal(LIMITE_JSON_ENTRADA, 3_000_000);
});
