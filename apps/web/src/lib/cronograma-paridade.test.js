/**
 * Paridade do cronograma e da proposta: as contas de cronograma-ff.js e o porte do servidor
 * (supabase/functions/_shared/orcamento/cronograma.ts) dão o mesmo resultado; o JSON do conector
 * (validarCronogramaConector) e a aba Cronograma da tela (lerAbaCronograma) dão o mesmo
 * cronograma, erros, avisos e resumo; e a versão da proposta é a mesma do Exportar proposta
 * (spec 2026-10-08 §2 e §3). Cada caso monta a aba com aoa_to_sheet:
 * [cabecalhoCronograma(meses), ...[item, null, ...pct]].
 */
import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import * as frente from "./cronograma-ff";
import { ABA_CRONOGRAMA, cabecalhoCronograma, lerAbaCronograma } from "./cronograma-modelo";
import { montarRegistrosImportacao } from "./orcamento-registros";
import { descricaoVersaoProposta, montarDadosProposta } from "./proposta-orcamento";
import * as servidor from "../../../../supabase/functions/_shared/orcamento/cronograma.ts";
import * as servidorProposta from "../../../../supabase/functions/_shared/orcamento/proposta.ts";
import { orcamentoSintetico } from "../../../../supabase/functions/_shared/orcamento/testes/sintetico.ts";

const E = "00000000-0000-4000-8000-000000000001";
const OP = "00000000-0000-4000-8000-000000000011";

function rodar(f, args) {
  try {
    return { ok: f(...args) };
  } catch (e) {
    return { erro: e.constructor.name, mensagem: e.message };
  }
}

function mesmo(f, g, args) {
  expect(rodar(g, args), JSON.stringify(args)).toEqual(rodar(f, args));
}

/** Aba Cronograma com as mesmas células que o JSON (só as colunas Mês 1…Mês meses). */
function workbook(meses, linhas) {
  const corpo = linhas.map((l) => [
    l?.item ?? null,
    null,
    ...Array.from({ length: meses }, (_, j) => l?.pct?.[j] ?? null),
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([cabecalhoCronograma(meses), ...corpo]),
    ABA_CRONOGRAMA
  );
  return wb;
}

function confere(meses, linhas, etapas) {
  const tela = lerAbaCronograma(workbook(meses, linhas), etapas);
  const { naoEtapas, ...conector } = servidor.validarCronogramaConector(meses, linhas, etapas);
  expect(Array.isArray(naoEtapas)).toBe(true);
  expect(conector).toEqual(tela);
  return { tela, naoEtapas };
}

/** Orçamento importado (registros com id) a partir de itens do modelo, com 12,35% de desconto. */
function importado(itensModelo) {
  return montarRegistrosImportacao(itensModelo, {
    empresaId: E,
    oportunidadeId: OP,
    descontoPct: 12.35,
  }).map((r, i) => ({ ...r, id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}` }));
}

/** Itens sintéticos do modelo: etapas de nível 1 com `porEtapa` itens cada. */
function modeloSintetico(etapas, porEtapa) {
  const itens = [];
  let s = 4242;
  const proximo = () => (s = (s * 16807) % 2147483647);
  for (const [numero, descricao] of etapas) {
    itens.push({ linha: 0, numero, etapa: true, descricao, codigo: null, fonte: null });
    for (let k = 1; k <= porEtapa; k++) {
      itens.push({
        linha: 0,
        numero: `${numero}.${k}`,
        etapa: false,
        codigo: null,
        fonte: "SINAPI",
        descricao: `Item sintético ${numero}.${k}`,
        unidade: "un",
        quantidade: (1 + (proximo() % 99999)) / 1000,
        valor_unitario_ref: (proximo() % 10000000) / 10000,
        total_informado: null,
      });
    }
  }
  return itens;
}

describe("paridade das contas de cronograma-ff.js", () => {
  it("âncora da spec 08/10: 20/35/30/15 sobre R$ 1.417.472,96", () => {
    const esperado = [28349459, 49611554, 42524189, 21262094];
    expect(servidor.valoresDaLinha([20, 35, 30, 15], 141747296)).toEqual(esperado);
    expect(frente.valoresDaLinha([20, 35, 30, 15], 141747296)).toEqual(esperado);
  });
  it("lerPercentual, somaCentesimos e linhaFecha em grade", () => {
    const entradas = [20, "12,5", "12.5", " 12,5 % ", ",5", "", "%", null, undefined, "abc"];
    entradas.push("1.234,5", "-5", "+5", "100,01", 101, -0.5, NaN, Infinity, {}, "33,335");
    entradas.push(1.005, "100,004", 100.004, 100.005, -0.004, -0.006, "5 0", "\t12,5 %\n");
    for (const v of entradas) mesmo(frente.lerPercentual, servidor.lerPercentual, [v]);
    const linhas = [[33.33, 33.33, 33.34], [0.1, 0.2], [], undefined, [20, 35, 30, 14.99]];
    for (const l of linhas) {
      mesmo(frente.somaCentesimos, servidor.somaCentesimos, [l]);
      mesmo(frente.linhaFecha, servidor.linhaFecha, [l ?? []]);
    }
  });
  it("valoresDaLinha em grade (linhas × subtotais, inclusive negativos e acima de 2^53)", () => {
    const linhas = [
      [20, 35, 30, 15],
      [33.33, 33.33, 33.34],
      [50, 50, 0],
      [0, 25, 25, 50, 0],
      [33.33, 33.33],
      [60, 50],
      [16.67, 16.67, 16.67, 16.67, 16.67, 16.65],
      [...new Array(11).fill(9.05), 0.45],
      [],
      [0, 0],
    ];
    const subtotais = [0, 1, 3, 6, 105, 99999, 100001, 141747296, -3, 900000000000001, "12"];
    for (const l of linhas) {
      for (const c of subtotais) mesmo(frente.valoresDaLinha, servidor.valoresDaLinha, [l, c]);
    }
  });
  it("normalizarCronograma", () => {
    const casos = [
      {},
      null,
      "x",
      [1, 2],
      { meses: "abc" },
      { meses: 99, pct: {} },
      { meses: -2, pct: { 1: [10] } },
      { meses: 2.7, pct: { 1: [10, 20, 30] } },
      { meses: 1, pct: [], origem: "outra" },
      {
        meses: 3,
        pct: { 1: [20, 35, 30, 15], 2: [50], 3: [-1, 101, "20"], 4: "x", 5: [33.333, null, 0] },
        origem: "importado",
        arquivo_nome: "via Claude",
        atualizado_em: "2026-10-08T12:00:00.000Z",
      },
    ];
    for (const c of casos) mesmo(frente.normalizarCronograma, servidor.normalizarCronograma, [c]);
  });
});

describe("paridade da validação do cronograma (JSON × aba Cronograma)", () => {
  it("formato de Itatinga: 1 etapa e 56 itens, 4 meses 20/35/30/15", () => {
    const itens = importado(modeloSintetico([["1", "SERVIÇOS DE ELÉTRICA"]], 56));
    expect(itens).toHaveLength(57);
    const etapasTela = frente.etapasDoOrcamento(itens);
    expect(servidor.etapasDoOrcamento(itens)).toEqual(etapasTela);
    const linhas = [{ item: "1", pct: [20, 35, 30, 15] }];
    const { tela } = confere(
      4,
      linhas,
      etapasTela.map((e) => e.numero)
    );
    expect(tela.erros).toEqual([]);
    mesmo(frente.resumoCronograma, servidor.resumoCronograma, [etapasTela, tela.cronograma]);
  });
  it("formato de Imbé: 6 etapas e 36 itens, 12 meses com só 5 parcelas (as 7 últimas vazias)", () => {
    const etapas = [1, 2, 3, 4, 5, 6].map((n) => [String(n), `ETAPA ${n}`]);
    const itens = importado(modeloSintetico(etapas, 6));
    expect(itens).toHaveLength(42);
    const etapasTela = frente.etapasDoOrcamento(itens);
    expect(servidor.etapasDoOrcamento(itens)).toEqual(etapasTela);
    const parcelas = [
      [20, 20, 20, 20, 20],
      [10, 30, 30, 20, 10],
      ["15,5", "24,5", 20, 20, 20],
      [0, 0, 50, 50, 0],
      [33.33, 33.33, 33.34, 0, 0],
      [5, 10, 15, 30, 40],
    ];
    const linhas = parcelas.map((p, i) => ({
      item: String(i + 1),
      pct: [...p, ...new Array(7).fill(i % 2 ? "" : null)],
    }));
    const { tela } = confere(
      12,
      linhas,
      etapasTela.map((e) => e.numero)
    );
    expect(tela.erros).toEqual([]);
    expect(tela.cronograma.pct["1"]).toHaveLength(12);
    mesmo(frente.resumoCronograma, servidor.resumoCronograma, [etapasTela, tela.cronograma]);
  });
  it("% como número e como texto pt-BR; vazio = 0; mais de 2 casas; 100,004 e −0,004", () => {
    confere(4, [{ item: "1", pct: ["12,5", "12.5%", " 25 % ", null] }, { item: "2" }], ["1", "2"]);
    confere(4, [{ item: "1", pct: [33.333, "33,3333", 33.334, "0,000"] }], ["1"]);
    confere(4, [{ item: "1", pct: ["12,345", 12.345, "37,655", 37.655] }], ["1"]);
    confere(
      4,
      [
        { item: "1", pct: [100.004, -0.004, 0, 0] },
        { item: "2", pct: [] },
      ],
      ["1", "2"]
    );
    confere(4, [{ item: "1", pct: ["%", " % ", "", "  "] }], ["1"]);
  });
  it("erros: negativo, acima de 100, texto, sinal, espaço no meio, booleano e repetido", () => {
    confere(
      4,
      [
        { item: "1", pct: [-5, 120, "abc", "-3"] },
        { item: "2", pct: ["5 0", "12, 5", 100.005, -0.006] },
        { item: "1", pct: [100, 0, 0, 0] },
      ],
      ["1", "2"]
    );
    confere(2, [{ item: "1", pct: [true, 100] }], ["1"]);
  });
  it("avisos: não fecha 100,00%, item que não é etapa e etapa sem linha (naoEtapas para o conector)", () => {
    confere(
      4,
      [
        { item: "1", pct: [20, 35, 30, 14.99] },
        { item: "2", pct: [50, 50, 10, 0] },
      ],
      ["1", "2"]
    );
    const { naoEtapas } = confere(
      4,
      [
        { item: "1", pct: [100, 0, 0, 0] },
        { item: "1.1", pct: [100, 0, 0, 0] },
        { item: 9, pct: [0, 0, 0, 0] },
      ],
      ["1", "2", "3"]
    );
    expect(naoEtapas).toEqual(["1.1", "9"]);
  });
  it("linhas vazias, linha sem Item, aba sem linhas e sem nenhuma etapa", () => {
    confere(
      2,
      [{}, { item: null, pct: [] }, { item: "", pct: [10, 0] }, { item: "1", pct: [50, 50] }],
      ["1"]
    );
    confere(3, [], ["1"]);
    confere(3, [{ item: " ", pct: [null, ""] }], ["1"]);
    confere(3, [{ item: "7", pct: [100] }], ["1", "2"]);
  });
  it("60 meses", () => {
    const pct = [...new Array(59).fill(1.67), 1.47];
    const { tela } = confere(60, [{ item: "1", pct }], ["1"]);
    expect(tela.cronograma.pct["1"][59]).toBe(1.47);
  });
});

describe("paridade sobre o orçamento sintético de 3000 linhas", () => {
  it("etapasDoOrcamento e resumoCronograma (10 etapas, 12 meses)", () => {
    const itens = importado(orcamentoSintetico());
    const etapasTela = frente.etapasDoOrcamento(itens);
    expect(etapasTela).toHaveLength(10);
    expect(servidor.etapasDoOrcamento(itens)).toEqual(etapasTela);
    const pct = {};
    etapasTela.forEach((e, i) => {
      const linha = new Array(12).fill(0);
      linha[i] = 40;
      linha[i + 1] = 35.55;
      linha[i + 2] = i % 3 === 0 ? 24.44 : 24.45; // algumas linhas não fecham 100,00%
      pct[e.numero] = linha;
    });
    pct["99"] = new Array(12).fill(0); // órfã
    const cron = { meses: 12, pct, origem: "importado" };
    mesmo(frente.resumoCronograma, servidor.resumoCronograma, [etapasTela, cron]);
  });
});

describe("paridade da proposta (Registrar como nova versão)", () => {
  it("descricaoVersaoProposta", () => {
    const casos = [
      { descontoPct: 12.35, descontoReal: 12.4, qtdItens: 57 },
      { descontoPct: 0, descontoReal: 0, qtdItens: 1 },
      { descontoPct: "12.35", descontoReal: null, qtdItens: "3" },
      { descontoPct: 99.99, descontoReal: 99.999, qtdItens: 2960 },
    ];
    for (const c of casos) {
      mesmo(descricaoVersaoProposta, servidorProposta.descricaoVersaoProposta, [c]);
    }
  });
  it("totalDaProposta = montarDadosProposta(...).totalGeral", () => {
    for (const itens of [
      importado(orcamentoSintetico()),
      importado(modeloSintetico([["1", "SERVIÇOS DE ELÉTRICA"]], 56)),
      [],
    ]) {
      const { totalGeral } = montarDadosProposta({
        itens,
        info: {},
        oportunidade: {},
        empresa: {},
      });
      expect(servidorProposta.totalDaProposta(itens)).toBe(totalGeral);
    }
  });
});
