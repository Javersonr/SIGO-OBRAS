// Roda com Node 23.6+ (type stripping): node --test supabase/functions/_shared/localizacao.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { lerLocalizacao, linkMapa, textoLocalizacao } from "./localizacao.ts";

test("lerLocalizacao: coordenada concedida, arredondada, com precisão", () => {
  assert.deepEqual(
    lerLocalizacao({
      status: "concedida",
      lat: -19.5931234567,
      lng: -46.9405123456,
      precisao_m: 14.6,
      capturada_em: "2026-09-25T13:00:00.000Z",
    }),
    {
      status: "concedida",
      origem: "aparelho",
      lat: -19.593123,
      lng: -46.940512,
      precisao_m: 15,
      capturada_em: "2026-09-25T13:00:00.000Z",
    }
  );
});

test("lerLocalizacao: coordenada fora da faixa ou não numérica → descartada", () => {
  assert.equal(lerLocalizacao({ status: "concedida", lat: 91, lng: 0 }), null);
  assert.equal(lerLocalizacao({ status: "concedida", lat: 0, lng: -181 }), null);
  assert.equal(lerLocalizacao({ status: "concedida", lat: "x", lng: 1 }), null);
  assert.equal(lerLocalizacao({ status: "concedida", lat: Number.NaN, lng: 1 }), null);
});

test("lerLocalizacao: precisão absurda ou data inválida viram null", () => {
  const l = lerLocalizacao({
    status: "concedida",
    lat: 1,
    lng: 2,
    precisao_m: -5,
    capturada_em: "ontem",
  });
  assert.equal(l?.status === "concedida" && l.precisao_m, null);
  assert.equal(l?.status === "concedida" && l.capturada_em, null);
});

test("lerLocalizacao: recusa, indisponível e sem resposta ficam registradas", () => {
  assert.deepEqual(lerLocalizacao({ status: "negada" }), { status: "negada", origem: "aparelho" });
  assert.deepEqual(lerLocalizacao({ status: "indisponivel" }), {
    status: "indisponivel",
    origem: "aparelho",
  });
  assert.deepEqual(lerLocalizacao({ status: "sem_resposta" }), {
    status: "sem_resposta",
    origem: "aparelho",
  });
  assert.equal(lerLocalizacao({ status: "qualquer" }), null);
  assert.equal(lerLocalizacao(null), null);
  assert.equal(lerLocalizacao("texto"), null);
});

test("textoLocalizacao e linkMapa: o que vai no PDF", () => {
  const l = lerLocalizacao({ status: "concedida", lat: -19.5, lng: -46.9, precisao_m: 15 });
  assert.equal(textoLocalizacao(l), "-19.500000, -46.900000 (±15 m) — informada pelo aparelho");
  assert.equal(linkMapa(l), "https://maps.google.com/?q=-19.500000,-46.900000");
  assert.equal(
    textoLocalizacao(lerLocalizacao({ status: "negada" })),
    "não autorizada por quem confirmou"
  );
  assert.equal(
    textoLocalizacao(lerLocalizacao({ status: "indisponivel" })),
    "aparelho sem localização disponível"
  );
  assert.equal(
    textoLocalizacao(lerLocalizacao({ status: "sem_resposta" })),
    "não obtida (o aparelho não respondeu a tempo)"
  );
  assert.equal(textoLocalizacao(null), "—");
  assert.equal(linkMapa(null), null);
});
