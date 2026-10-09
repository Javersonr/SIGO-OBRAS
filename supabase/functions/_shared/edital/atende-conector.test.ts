// node --test supabase/functions/_shared/edital/atende-conector.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  atendeParaConector,
  ocultarValores,
  valoresEconomicos,
  VALOR_OCULTO,
} from "./atende-conector.ts";
import {
  apelidarAtestados,
  brl,
  fmtNum,
  montarAtende,
  sanearEdital,
  type Acervo,
  type AcervoPerfil,
} from "./edital-regras.ts";

const PERFIL: AcervoPerfil = {
  porte: "EPP",
  capital_social: 500000,
  patrimonio_liquido: "1234567.89",
  ccl: 345678.9,
  liquidez_corrente: 1.85,
  liquidez_geral: 2.37,
  solvencia_geral: 3.12,
  endividamento_geral: 0.41,
  exercicio_balanco: 2025,
  faturamento: [{ ano: 2025, receita_bruta: 3456789.01 }],
  alertas: ["PL de R$ 1.234.567,89 no balanço de 2025"],
};

function resultado(economica: Record<string, unknown>[]) {
  const extraido = sanearEdital({
    valor_estimado: null,
    habilitacao: {
      tecnica_operacional: [{ id: "op1", descricao: "Postes de concreto", quantidade: 10 }],
      economica,
    },
  });
  const acervo: Acervo = { perfil: PERFIL, profissionais: [], atestados: [], quantitativos: [] };
  return montarAtende({
    extraido,
    acervo,
    apelidos: apelidarAtestados([]),
    empresa: { id: "00000000-0000-4000-8000-000000000001", nome: "Empresa Teste", uf: "MG" },
    resposta: {
      itens: [
        {
          exigencia_id: "op1",
          status: "nao_atende",
          comprovacao: null,
          atestados: [],
          justificativa: "Sem atestado de 10 postes.",
        },
      ],
      cats_anexar: [],
      pendencias: [],
      riscos: [],
    },
    modelo: "teste",
    agoraISO: "2026-10-08T12:00:00.000Z",
    hojeISO: "2026-10-08",
  });
}

test("valoresEconomicos: só números > 0 do perfil, inclusive o faturamento", () => {
  assert.deepEqual(
    valoresEconomicos(PERFIL).sort((a, b) => a - b),
    [0.41, 1.85, 2.37, 3.12, 345678.9, 500000, 1234567.89, 3456789.01]
  );
  assert.deepEqual(valoresEconomicos(null), []);
  assert.deepEqual(valoresEconomicos({ capital_social: 0, faturamento: "x" }), []);
});

test("ocultarValores: troca brl e fmtNum, sem pegar pedaço de outro número", () => {
  const v = [1234567.89, 1.85];
  assert.equal(
    ocultarValores(`PL: ${brl(1234567.89)}; índice ${fmtNum(1.85)}; item 11,85; op1,85`, v),
    `PL: ${VALOR_OCULTO}; índice ${VALOR_OCULTO}; item 11,85; op1,85`
  );
  assert.equal(ocultarValores(null, v), null);
  assert.equal(ocultarValores("sem valores", []), "sem valores");
});

test("item econômico nao_atende: nem o PL nem o 'Faltam' saem para o Claude", () => {
  const r = resultado([{ id: "ec1", tipo: "patrimonio_liquido", valor_minimo: 2000000 }]);
  const completo = JSON.stringify(r);
  assert.ok(completo.includes(brl(1234567.89))); // o gravado para a tela tem o valor
  assert.ok(completo.includes(`Faltam ${brl(765432.11)}`));
  const saida = atendeParaConector(r, valoresEconomicos(PERFIL))!;
  const json = JSON.stringify(saida);
  for (const proibido of [brl(1234567.89), fmtNum(1234567.89), brl(765432.11), brl(3456789.01)]) {
    assert.equal(json.includes(proibido), false, proibido);
  }
  const ec = saida.itens.find((i) => i.exigencia_id === "ec1")!;
  assert.equal(ec.status, "nao_atende");
  assert.match(ec.justificativa, /Exigido R\$\s2\.000\.000,00/); // o mínimo do edital continua
  assert.match(ec.justificativa, /Faltam \[valor da empresa\]/);
  assert.match(saida.alertas[0], /PL de \[valor da empresa\]/);
});

test("teto 'até R$ x' (mínimo em % sem valor estimado) e índices também saem", () => {
  const r = resultado([
    { id: "ec1", tipo: "patrimonio_liquido", percentual_do_estimado: 10 },
    { id: "ec2", tipo: "liquidez_corrente", valor_minimo: 1 },
    { id: "ec3", tipo: "faturamento", valor_minimo: 1000000 },
  ]);
  const json = JSON.stringify(atendeParaConector(r, valoresEconomicos(PERFIL)));
  for (const proibido of [
    brl(12345678.9), // teto = PL × 100 / 10
    `${fmtNum(1.85)} ≥`,
    brl(3456789.01),
  ]) {
    assert.equal(json.includes(proibido), false, proibido);
  }
  assert.ok(json.includes(`de até ${VALOR_OCULTO}`));
});

test("itens técnicos ficam iguais; null passa", () => {
  const r = resultado([{ id: "ec1", tipo: "capital_social", valor_minimo: 100000 }]);
  const saida = atendeParaConector(r, valoresEconomicos(PERFIL))!;
  assert.deepEqual(
    saida.itens.find((i) => i.exigencia_id === "op1"),
    r.itens.find((i) => i.exigencia_id === "op1")
  );
  assert.equal(saida.veredito, r.veredito);
  assert.equal(atendeParaConector(null, [1]), null);
});
