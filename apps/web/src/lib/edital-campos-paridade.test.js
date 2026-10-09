/* global structuredClone */
import { describe, it, expect } from "vitest";
import { camposOportunidadeDoEdital as doFront } from "@/lib/edital-ia";
import {
  camposOportunidadeDoEdital as doServidor,
  COLUNAS_OPORTUNIDADE_EDITAL,
} from "../../../../supabase/functions/_shared/edital/campos-oportunidade.ts";
import FIXTURE from "../../../../supabase/functions/_shared/edital/fixtures/edital-consolidado.json";

// Paridade edital → colunas: a tela (LerEditalSheet) e o conector do Claude gravam as mesmas
// colunas para o mesmo edital (spec 25/09 §10.3). Mudou edital-ia.js? Porte a mudança para
// supabase/functions/_shared/edital/campos-oportunidade.ts (ou o contrário).

const base = () => structuredClone(FIXTURE);
const VARIACOES = [
  ["fixture", base()],
  ["título sugerido curto", { ...base(), titulo_sugerido: "  Iluminação LED — Exemplo/MG " }],
  [
    "visita obrigatória e garantia não informada",
    {
      ...base(),
      datas: {
        ...base().datas,
        visita_tecnica: { obrigatoria: true, data: "6/10/2026", hora: "14h", descricao: null },
      },
      garantia_proposta: { exigida: null },
    },
  ],
  ["modalidade e forma inválidas", { ...base(), modalidade: "leilao", forma: "hibrida" }],
  [
    "valor em milhar, UF por sigla e data com um dígito",
    {
      ...base(),
      valor_estimado: "213.148",
      local: { cidade: "São Paulo", uf: "sp", endereco: null },
      datas: { ...base().datas, sessao: { data: "5/3/2026", hora: "8.30" } },
    },
  ],
  [
    "valor numérico e hora inválida",
    { ...base(), valor_estimado: 1234.5, datas: { sessao: { hora: "25:00" } } },
  ],
  ["vazio", {}],
  [
    "campos em branco, local nulo e datas texto",
    { orgao: "   ", local: null, datas: "x", objeto: " " },
  ],
  [
    "valor sem número e visita só com descrição",
    {
      valor_estimado: "abc",
      datas: { visita_tecnica: { obrigatoria: false, descricao: "Visita facultativa" } },
    },
  ],
];

describe("paridade: camposOportunidadeDoEdital da tela × do servidor", () => {
  it.each(VARIACOES)("%s", (_nome, extraido) => {
    expect(doServidor(extraido)).toEqual(doFront(extraido));
  });

  it("entradas que não são objeto dão {} nos dois", () => {
    for (const v of [null, undefined, "edital", 12]) {
      expect(doServidor(v)).toEqual({});
      expect(doFront(v)).toEqual({});
    }
  });

  it("toda coluna que a tela grava está na lista fechada do servidor", () => {
    for (const [, extraido] of VARIACOES) {
      for (const k of Object.keys(doFront(extraido))) {
        expect(COLUNAS_OPORTUNIDADE_EDITAL).toContain(k);
      }
    }
  });
});
