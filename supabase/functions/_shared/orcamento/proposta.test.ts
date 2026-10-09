// node --test supabase/functions/_shared/orcamento/proposta.test.ts
// Casos copiados de apps/web/src/lib/proposta-orcamento.test.js (descricaoVersaoProposta).
import { test } from "node:test";
import assert from "node:assert/strict";
import { descricaoVersaoProposta, totalDaProposta } from "./proposta.ts";

test("descricaoVersaoProposta: vírgula decimal e o plural certo", () => {
  assert.equal(
    descricaoVersaoProposta({ descontoPct: 12.35, descontoReal: 12.4, qtdItens: 57 }),
    "Orçamento com desconto de 12,35% (real 12,40%) — 57 itens"
  );
  assert.equal(
    descricaoVersaoProposta({ descontoPct: 0, descontoReal: 0, qtdItens: 1 }),
    "Orçamento com desconto de 0,00% (real 0,00%) — 1 item"
  );
  assert.equal(
    descricaoVersaoProposta({ descontoPct: "12.35", descontoReal: null, qtdItens: "3" }),
    "Orçamento com desconto de 12,35% (real 0,00%) — 3 itens"
  );
});

test("totalDaProposta: Σ valor_total dos itens, em centavos, sem as etapas", () => {
  assert.equal(
    totalDaProposta([
      { numero: "1", etapa: true, valor_total: 999 },
      { numero: "1.1", etapa: false, valor_total: 0.1 },
      { numero: "1.2", etapa: false, valor_total: 0.2 },
      { numero: "1.3", etapa: false, valor_total: "1152.09" },
      { numero: "1.4", etapa: false, valor_total: null },
    ]),
    1152.39
  );
  assert.equal(totalDaProposta([]), 0);
});
