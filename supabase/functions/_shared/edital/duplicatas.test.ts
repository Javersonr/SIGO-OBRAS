// node --test supabase/functions/_shared/edital/duplicatas.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  candidatasDuplicata,
  chaveNumeroAno,
  mesmoLocal,
  numerosAnoDoTexto,
  textoNormalizado,
  type OportunidadeResumo,
} from "./duplicatas.ts";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function op(n: number, campos: Partial<OportunidadeResumo>): OportunidadeResumo {
  return {
    id: id(n),
    nome: null,
    descricao: null,
    licitacao_numero: null,
    licitacao_processo: null,
    orgao: null,
    cidade: null,
    estado: null,
    status_nome: "Em análise",
    licitacao_data: null,
    created_at: `2026-01-${String(n).padStart(2, "0")}T12:00:00Z`,
    ...campos,
  };
}

const EDITAL = {
  numero_edital: "12/2026",
  numero_processo: null,
  orgao: "Prefeitura Municipal de Joanópolis",
  local: { cidade: "Joanópolis", uf: "SP", endereco: null },
};

test("numerosAnoDoTexto: separadores / . -, sem zeros à esquerda, sem repetir", () => {
  assert.deepEqual(numerosAnoDoTexto("PE 012/2026 e 12-2026, proc. 45.2026"), [
    { numero: 12, ano: 2026 },
    { numero: 45, ano: 2026 },
  ]);
  assert.deepEqual(numerosAnoDoTexto("Concorrência 112 / 2026"), [{ numero: 112, ano: 2026 }]);
  assert.deepEqual(numerosAnoDoTexto("CAT 1234567/2026"), []);
  assert.deepEqual(numerosAnoDoTexto(null), []);
  assert.deepEqual(chaveNumeroAno("Pregão nº 007/2025"), { numero: 7, ano: 2025 });
  assert.equal(chaveNumeroAno("sem número"), null);
  assert.equal(textoNormalizado("  JOANÓPOLIS   /SP "), "joanopolis /sp");
});

test("casa 012 ↔ 12 pelo nome antigo com a cidade no texto", () => {
  const c = candidatasDuplicata(EDITAL, [
    op(1, { nome: "PE 012/2026 - Iluminação Pública - Pref. Mun. de Joanópolis/SP" }),
  ]);
  assert.equal(c.length, 1);
  assert.equal(c[0].motivo, "numero_no_texto_e_local");
  assert.equal(c[0].link, `https://www.sigoobras.com.br/Oportunidades?openId=${id(1)}`);
});

test("casa por '.' e com a cidade sem acento; outro nº não casa", () => {
  const c = candidatasDuplicata(EDITAL, [
    op(2, { nome: "Concorrência 12.2026 Joanopolis" }),
    op(3, { nome: "Pregão 13/2026 Joanópolis" }),
    op(4, { nome: "Pregão 112/2026 Joanópolis" }),
  ]);
  assert.deepEqual(
    c.map((x) => x.id),
    [id(2)]
  );
});

test("órgão por jaccard quando falta a cidade; 'Prefeitura Municipal' sozinho não basta", () => {
  const semCidade = { ...EDITAL, local: { cidade: null, uf: null, endereco: null } };
  const mesma = op(5, { licitacao_numero: "012/2026", orgao: "Pref. Mun. de Joanópolis" });
  const outra = op(6, { licitacao_numero: "012/2026", orgao: "Prefeitura Municipal de Piracaia" });
  assert.equal(mesmoLocal(semCidade, mesma), true);
  assert.equal(mesmoLocal(semCidade, outra), false);
  assert.deepEqual(
    candidatasDuplicata(semCidade, [mesma, outra]).map((x) => [x.id, x.motivo]),
    [[id(5), "numero_e_local"]]
  );
});

test("outra cidade não casa, mesmo com o mesmo nº e 'Prefeitura Municipal' no órgão", () => {
  const c = candidatasDuplicata(EDITAL, [
    op(7, {
      licitacao_numero: "12/2026",
      cidade: "Piracaia",
      orgao: "Prefeitura Municipal de Piracaia",
      nome: "PE 12/2026 Iluminação",
    }),
  ]);
  assert.deepEqual(c, []);
});

test("sem nº no edital, lista vazia", () => {
  const sem = { ...EDITAL, numero_edital: "Pregão eletrônico", numero_processo: null };
  assert.deepEqual(candidatasDuplicata(sem, [op(8, { nome: "PE 12/2026 Joanópolis" })]), []);
});

test("nº do processo também vale; (a) antes de (b), depois a mais nova; teto de 10", () => {
  const edital = { ...EDITAL, numero_edital: null, numero_processo: "Processo 12/2026" };
  const ops = [
    ...Array.from({ length: 8 }, (_, i) => op(10 + i, { nome: `PE 12/2026 Joanópolis ${i}` })),
    op(30, { licitacao_numero: "12/2026", cidade: "Joanópolis" }),
    op(31, { licitacao_processo: "PA 12/2026", cidade: "JOANOPOLIS" }),
    op(32, { nome: "12/2026 Joanópolis" }),
    op(33, { nome: "12/2026 Joanópolis" }),
  ];
  const c = candidatasDuplicata(edital, ops);
  assert.equal(c.length, 10);
  assert.deepEqual(
    c.slice(0, 3).map((x) => [x.id, x.motivo]),
    [
      [id(31), "numero_e_local"],
      [id(30), "numero_e_local"],
      [id(33), "numero_no_texto_e_local"],
    ]
  );
  assert.ok(c.every((x) => !("_ordem" in x) && !("_criado" in x)));
});
