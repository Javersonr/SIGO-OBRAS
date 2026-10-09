/**
 * Paridade das contas do orçamento: a lib da tela (orcamento-modelo/desconto/registros.js) e o porte
 * do servidor (supabase/functions/_shared/orcamento/*.ts, usado pelo conector do Claude) dão o MESMO
 * resultado para a mesma entrada, e lançam o mesmo erro com a mesma mensagem (spec 2026-10-08 §3).
 * O Vitest importa o TypeScript do servidor pelo caminho relativo.
 */
import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  ABA_INFORMACOES,
  ABA_ORCAMENTO,
  CABECALHOS_MODELO,
  lerNumeroBR,
  lerPlanilhaModelo,
} from "./orcamento-modelo";
import * as frente from "./orcamento-desconto";
import * as frenteRegistros from "./orcamento-registros";
import { lerNumeroBR as lerNumeroBRServidor } from "../../../../supabase/functions/_shared/orcamento/numeros.ts";
import * as servidor from "../../../../supabase/functions/_shared/orcamento/desconto.ts";
import * as servidorRegistros from "../../../../supabase/functions/_shared/orcamento/registros.ts";
import {
  LINHAS_SINTETICAS,
  orcamentoSintetico,
} from "../../../../supabase/functions/_shared/orcamento/testes/sintetico.ts";

const E = "00000000-0000-4000-8000-000000000001";
const OP = "00000000-0000-4000-8000-000000000011";
const NBSP = String.fromCharCode(0xa0);

/** Resultado ou erro (classe e mensagem), para comparar os dois lados com toEqual. */
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

// O ORC_OK de orcamento-modelo.test.js (Itatinga reduzido) e a aba Informações.
const ORC_OK = [
  CABECALHOS_MODELO,
  ["1", null, null, "SERVIÇOS PRELIMINARES"],
  ["1.1", "93358", "SINAPI", "Escavação manual", "m³", 125.5, 10.48, 1315.24],
  ["1.2", null, null, "Placa de obra", "m²", "2,88", "400,00", "1.152,00"],
  ["2", null, null, "ILUMINAÇÃO"],
  ["2.1", 41210, "SINAPI", "Poste 12/1000", "un", 6, 2827.92, 16967.52],
];
const INFO_OK = [
  ["Órgão", "Prefeitura Municipal de Itatinga"],
  ["Total da prefeitura (R$)", 19434.76],
];

function itensDoOrcOk() {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ORC_OK), ABA_ORCAMENTO);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(INFO_OK), ABA_INFORMACOES);
  const r = lerPlanilhaModelo(wb);
  if (r.erros.length > 0) throw new Error(`ORC_OK com erro: ${r.erros.join(" ")}`);
  return r.itens;
}

const REFS = [0, 0.01, 0.29, 10.48, 2827.92, 3505.49, 1234567.8912, 9999999999.9999];
const PCTS = [0, 0.01, 12.35, 33.33, 50, 99.99];

describe("paridade: lerNumeroBR", () => {
  it("todos os casos de orcamento-modelo.test.js", () => {
    const casos = [
      12.5,
      -3,
      "1.234,56",
      "12,5",
      "1234.56",
      " R$ 1.234,56 ",
      `R$${NBSP}1.234,56`,
      "1.234.567,89",
      "1.234.567",
      "1,234.56",
      "-3,5",
      null,
      undefined,
      "",
      "   ",
      "abc",
      "1,2,3",
      Infinity,
      true,
    ];
    for (const v of casos) mesmo(lerNumeroBR, lerNumeroBRServidor, [v]);
  });
});

describe("paridade: precoComDesconto, totalLinha e validarDesconto", () => {
  it("grade de referência × desconto", () => {
    for (const ref of REFS) {
      for (const pct of PCTS) mesmo(frente.precoComDesconto, servidor.precoComDesconto, [ref, pct]);
    }
  });
  it("erros com a mesma classe e a mesma mensagem (desconto 100 lança RangeError igual)", () => {
    const ruins = [
      [10, 100],
      [10, -1],
      [10, NaN],
      [10, "12,35"],
      [10, null],
      [-10, 10],
      ["10.48", 10],
      [undefined, 10],
    ];
    for (const args of ruins) {
      mesmo(frente.precoComDesconto, servidor.precoComDesconto, args);
      expect(rodar(servidor.precoComDesconto, args).erro).toBe("RangeError");
    }
  });
  it("totalLinha em grade (number, texto estrito, vazio e inválido)", () => {
    const qtds = [0, 0.001, 1, 2.345, 125.5, 99999999999.999, "125.5", "1,5", "", null];
    const unitarios = [0, 0.0001, 0.29, 9.18, 3.3333, 9999999999.9999, "9.18", "abc", null];
    for (const q of qtds)
      for (const u of unitarios) mesmo(frente.totalLinha, servidor.totalLinha, [q, u]);
  });
  it("validarDesconto com 15 entradas", () => {
    const entradas = [
      "12,35",
      "12.350",
      "-0",
      "100",
      "12,345",
      " 7 %",
      "",
      "abc",
      12.35,
      "99,99",
      "0",
      null,
      "1,2,3",
      "-1",
      "99,991",
    ];
    expect(entradas).toHaveLength(15);
    for (const v of entradas) mesmo(frente.validarDesconto, servidor.validarDesconto, [v]);
  });
});

/** Registros com id, como vêm do banco depois da importação; alguns itens sem referência (manuais). */
function comIds(registros, manuaisCada = 0) {
  return registros.map((r, i) => {
    const comId = { ...r, id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}` };
    if (manuaisCada && !r.etapa && i % manuaisCada === 0) {
      return { ...comId, valor_unitario_ref: null, valor_unitario: 7.5, valor_total: 15 };
    }
    return comId;
  });
}

/** Mesma lista em outra ordem, com ordens nulas e repetidas (a tela desempata pelo número). */
function embaralhar(itens) {
  return [...itens]
    .reverse()
    .map((item, i) => ({ ...item, ordem: i % 7 === 0 ? null : Math.floor(item.ordem / 3) }));
}

describe.each([
  ["ORC_OK (Itatinga reduzido)", itensDoOrcOk],
  [`sintético de ${LINHAS_SINTETICAS} linhas`, () => orcamentoSintetico()],
])("paridade sobre %s", (_nome, gerar) => {
  const itensModelo = gerar();

  it("montarRegistrosImportacao com desconto 0, 12,35, nulo, 99,99 e inválido", () => {
    for (const descontoPct of [0, 12.35, null, undefined, 99.99, 100, "12,35"]) {
      const o = { empresaId: E, oportunidadeId: OP, descontoPct };
      mesmo(
        frenteRegistros.montarRegistrosImportacao,
        servidorRegistros.montarRegistrosImportacao,
        [itensModelo, o]
      );
    }
  });

  it("aplicarDesconto, subtotaisEtapas e resumoOrcamento", () => {
    const registros = frenteRegistros.montarRegistrosImportacao(itensModelo, {
      empresaId: E,
      oportunidadeId: OP,
      descontoPct: 12.35,
    });
    for (const itens of [comIds(registros), comIds(registros, 97)]) {
      for (const pct of [...PCTS, 100])
        mesmo(frente.aplicarDesconto, servidor.aplicarDesconto, [itens, pct]);
      mesmo(frente.subtotaisEtapas, servidor.subtotaisEtapas, [itens]);
      mesmo(frente.resumoOrcamento, servidor.resumoOrcamento, [itens]);
      const descontados = itens.map((item) => {
        const novo = frente.aplicarDesconto([item], 33.33)[0];
        return novo ? { ...item, ...novo } : item;
      });
      mesmo(frente.resumoOrcamento, servidor.resumoOrcamento, [descontados]);
    }
  });

  it("emLotes de 200 e de 7", () => {
    for (const tamanho of [200, 7, undefined]) {
      mesmo(frenteRegistros.emLotes, servidorRegistros.emLotes, [itensModelo, tamanho]);
    }
  });

  it("ordenarItensOportunidade e compararNumeroItem", () => {
    const registros = comIds(
      frenteRegistros.montarRegistrosImportacao(itensModelo, { empresaId: E, oportunidadeId: OP })
    );
    mesmo(frenteRegistros.ordenarItensOportunidade, servidorRegistros.ordenarItensOportunidade, [
      embaralhar(registros),
    ]);
    const numeros = embaralhar(registros).map((r) => r.numero);
    for (let i = 0; i + 1 < numeros.length; i += 3) {
      mesmo(frenteRegistros.compararNumeroItem, servidorRegistros.compararNumeroItem, [
        numeros[i],
        numeros[i + 1],
      ]);
    }
  });
});

describe("paridade: âncoras da spec 08/10", () => {
  it("Itatinga com 12,35%: item 1.1 com unitário 3.072,56", () => {
    expect(servidor.precoComDesconto(3505.49, 12.35)).toBe(3072.56);
    expect(frente.precoComDesconto(3505.49, 12.35)).toBe(3072.56);
    expect(servidor.totalLinha(6, 3072.56)).toBe(frente.totalLinha(6, 3072.56));
  });
});
