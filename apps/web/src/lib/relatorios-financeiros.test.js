import { describe, it, expect } from "vitest";
import {
  calcularDRE,
  calcularBalanco,
  calcularIndices,
  calcularComparativoPeriodos,
  diasDoPeriodo,
  periodoAnterior,
  variacaoPercentual,
  resolverIdPorNome,
  traduzirFiltrosIA,
  tipoRelatorioValido,
  resumoParaInsights,
  dataLocalISO,
  dataReferencia,
  expandirParcelas,
  abertoNaData,
  saldoContasNaData,
  contaDisponivel,
} from "./relatorios-financeiros";

// Medição de R$ 1.000 com ISS 5% e INSS 11%: a RPC lança a Receita LÍQUIDA
// (840) e os dois impostos como Despesa "pago" medicao_obra_imposto.
const MEDICAO = [
  {
    tipo: "Receita",
    status: "pago",
    valor: 840,
    projeto_id: "p1",
    referencia_tipo: "medicao_obra",
  },
  {
    tipo: "Despesa",
    status: "pago",
    valor: 50,
    projeto_id: "p1",
    referencia_tipo: "medicao_obra_imposto",
  },
  {
    tipo: "Despesa",
    status: "pago",
    valor: 110,
    projeto_id: "p1",
    referencia_tipo: "medicao_obra_imposto",
  },
];

describe("calcularDRE", () => {
  it("ISS/INSS retidos viram dedução e não são descontados duas vezes", () => {
    const dre = calcularDRE([
      ...MEDICAO,
      { tipo: "despesa", status: "Realizado", valor: 300, projeto_id: "p1" }, // custo de obra
      { tipo: "Despesa", status: "Pago", valor: 100, projeto_id: null }, // administrativa
      { tipo: "Despesa", status: "em_aberto", valor: 999, projeto_id: "p1" }, // não pago
      { tipo: "Receita", status: "Cancelado", valor: 999 }, // cancelada
    ]);
    expect(dre.receitaBruta).toBe(1000);
    expect(dre.deducoes).toBe(160);
    expect(dre.receitaLiquida).toBe(840);
    expect(dre.custosDiretos).toBe(300);
    expect(dre.lucroBruto).toBe(540);
    expect(dre.despesasOperacionais).toBe(100);
    expect(dre.resultadoAntesIR).toBe(440);
    expect(dre.margemAntesIR).toBeCloseTo((440 / 840) * 100, 6);
  });

  it("regime contábil considera só lançamentos com documento fiscal", () => {
    const dre = calcularDRE(
      [
        { tipo: "Receita", status: "pago", valor: 500, numero_documento: "NF 1" },
        { tipo: "Receita", status: "pago", valor: 200 },
        { tipo: "Despesa", status: "pago", valor: 100, numero_documento: "NF 2", projeto_id: "p" },
      ],
      "contabil"
    );
    expect(dre.receitaLiquida).toBe(500);
    expect(dre.custosDiretos).toBe(100);
    expect(dre.resultadoAntesIR).toBe(400);
  });

  it("sem receita, margens ficam em 0", () => {
    const dre = calcularDRE([{ tipo: "Despesa", status: "pago", valor: 10 }]);
    expect(dre.margemBruta).toBe(0);
    expect(dre.resultadoAntesIR).toBe(-10);
  });
});

describe("calcularBalanco", () => {
  const contas = [
    { tipo: "Banco", saldo_inicial: 1000, saldo_atual: 1500.1 },
    { tipo: "Caixa", saldo_inicial: 200, saldo_atual: 50.2 },
  ];
  const transacoes = [
    { tipo: "Receita", status: "em_aberto", valor: 300.3 },
    { tipo: "receita", status: "atrasado", valor: 100 },
    { tipo: "Receita", status: "pago", valor: 999 }, // já no saldo das contas
    { tipo: "Despesa", status: "pendente", valor: 400 },
    { tipo: "Despesa", status: "Cancelado", valor: 999 },
  ];

  it("sempre fecha: Ativo = Passivo + PL, com capital = Σ saldo_inicial", () => {
    const b = calcularBalanco(transacoes, contas);
    expect(b.saldoContas).toBeCloseTo(1550.3, 2);
    expect(b.contasReceber).toBeCloseTo(400.3, 2);
    expect(b.ativoTotal).toBeCloseTo(1950.6, 2);
    expect(b.passivoCirculante).toBe(400);
    expect(b.patrimonioLiquido).toBeCloseTo(1550.6, 2);
    expect(b.capital).toBe(1200);
    expect(b.resultadoAcumulado).toBeCloseTo(350.6, 2);
    expect(b.passivoTotal).toBeCloseTo(b.ativoTotal, 2);
    expect(b.capital + b.resultadoAcumulado).toBeCloseTo(b.patrimonioLiquido, 2);
  });

  it("fecha também com PL negativo (passivo maior que o ativo)", () => {
    const b = calcularBalanco([{ tipo: "Despesa", status: "em_aberto", valor: 5000 }], contas);
    expect(b.patrimonioLiquido).toBeLessThan(0);
    expect(b.passivoTotal).toBeCloseTo(b.ativoTotal, 2);
  });
});

describe("calcularIndices", () => {
  const contas = [
    { tipo: "Banco", saldo_inicial: 0, saldo_atual: 800 },
    { tipo: "Caixa", saldo_inicial: 0, saldo_atual: 100 },
    { tipo: "Fundo Fixo", saldo_inicial: 0, saldo_atual: 50 },
    { tipo: "Investimento", saldo_inicial: 0, saldo_atual: 50 },
    { tipo: "Cartão", saldo_inicial: 0, saldo_atual: -300 }, // não é disponibilidade
  ];

  it("PC = 0 → liquidez null (n/d), sem fatores inventados", () => {
    const r = calcularIndices({
      transacoes: [{ tipo: "Receita", status: "pago", valor: 1000 }],
      contas,
    });
    expect(r.disponibilidades).toBe(1000); // usa saldo_atual, não saldo_inicial
    expect(r.passivoCirculante).toBe(0);
    expect(r.liquidezCorrente).toBeNull();
    expect(r.liquidezImediata).toBeNull();
    expect(r.prazoMedioRecebimento).toBeNull(); // sem período selecionado
  });

  it("liquidez corrente/imediata e prazo médio com CR e PC", () => {
    const r = calcularIndices({
      transacoes: [
        { tipo: "Receita", status: "pago", valor: 3000 },
        { tipo: "Despesa", status: "pago", valor: 1000, projeto_id: "p" },
      ],
      transacoesPosicao: [
        { tipo: "Receita", status: "em_aberto", valor: 1000 },
        { tipo: "Despesa", status: "em_aberto", valor: 500 },
      ],
      contas,
      dataInicio: "2026-09-01",
      dataFim: "2026-09-30",
    });
    expect(r.ativoCirculante).toBe(2000);
    expect(r.liquidezCorrente).toBe(4);
    expect(r.liquidezImediata).toBe(2);
    expect(r.prazoMedioRecebimento).toBeCloseTo(10, 6); // 1000/3000 × 30
    expect(r.lucroLiquido).toBe(2000);
    expect(r.grauEndividamento).toBe(25);
  });

  it("regime contábil usa numero_documento (não a coluna inexistente e_contabil)", () => {
    const r = calcularIndices({
      transacoes: [
        { tipo: "Receita", status: "pago", valor: 100, numero_documento: "1" },
        { tipo: "Receita", status: "pago", valor: 900, e_contabil: true },
      ],
      contas: [],
      versao: "contabil",
    });
    expect(r.receitas).toBe(100);
  });
});

describe("período anterior", () => {
  it("janela de 30 dias → os 30 dias imediatamente anteriores", () => {
    expect(diasDoPeriodo("2026-09-01", "2026-09-30")).toBe(30);
    expect(periodoAnterior("2026-09-01", "2026-09-30")).toEqual({
      inicio: "2026-08-02",
      fim: "2026-08-31",
    });
  });

  it("um único dia → o dia anterior", () => {
    expect(periodoAnterior("2026-03-01", "2026-03-01")).toEqual({
      inicio: "2026-02-28",
      fim: "2026-02-28",
    });
  });

  it("período inválido/invertido → null", () => {
    expect(periodoAnterior("", "2026-09-30")).toBeNull();
    expect(periodoAnterior("2026-09-30", "2026-09-01")).toBeNull();
    expect(periodoAnterior("2026-02-31", "2026-03-10")).toBeNull();
  });

  it("comparativo separa atual e anterior a partir das transações sem filtro de data", () => {
    const dados = calcularComparativoPeriodos(
      [
        { tipo: "Receita", status: "pago", valor: 100, data_vencimento: "2026-08-02" },
        { tipo: "Receita", status: "pago", valor: 50, data_vencimento: "2026-08-01" }, // fora
        { tipo: "Receita", status: "pago", valor: 300, data_vencimento: "2026-09-30" },
        { tipo: "Despesa", status: "pago", valor: 40, data_vencimento: "2026-09-15" },
      ],
      "2026-09-01",
      "2026-09-30"
    );
    expect(dados).toEqual([
      { periodo: "Anterior", receitas: 100, despesas: 0, lucro: 100 },
      { periodo: "Atual", receitas: 300, despesas: 40, lucro: 260 },
    ]);
  });

  it("variação com base zero → null (n/d), não divide por 1", () => {
    expect(variacaoPercentual(12345, 0)).toBeNull();
    expect(variacaoPercentual(150, 100)).toBe(50);
    expect(variacaoPercentual(-50, -100)).toBe(50);
  });
});

describe("filtros da IA", () => {
  const categorias = [
    { id: "cat-1", nome: "Material Elétrico" },
    { id: "cat-2", nome: "Combustível" },
  ];
  const centrosCusto = [{ id: "cc-1", nome: "Obra Centro", codigo: "01" }];

  it("resolverIdPorNome casa por id, por nome normalizado ou por 'código - nome'", () => {
    expect(resolverIdPorNome("cat-2", categorias)).toBe("cat-2");
    expect(resolverIdPorNome("  material eletrico ", categorias)).toBe("cat-1");
    expect(resolverIdPorNome("01 - Obra Centro", centrosCusto)).toBe("cc-1");
    expect(resolverIdPorNome("Inexistente", categorias)).toBe("all");
    expect(resolverIdPorNome("Todas", categorias)).toBe("all");
    expect(resolverIdPorNome(null, categorias)).toBe("all");
  });

  it("traduzirFiltrosIA: nomes → ids, só chaves conhecidas, datas válidas", () => {
    const f = traduzirFiltrosIA(
      {
        dataInicio: "2026-07-01",
        dataFim: "2026-09-30",
        categoriaId: "Combustível",
        centroCustoId: "obra centro",
        contaId: "Itaú",
        qualquerCoisa: "x",
        versao: "contabil",
      },
      { categorias, centrosCusto }
    );
    expect(f).toEqual({
      dataInicio: "2026-07-01",
      dataFim: "2026-09-30",
      categoriaId: "cat-2",
      centroCustoId: "cc-1",
      versao: "contabil",
    });
  });

  it("traduzirFiltrosIA: descarta data inválida, inverte período trocado, desconhecido → all", () => {
    expect(
      traduzirFiltrosIA({ dataInicio: "último trimestre", dataFim: "2026-09-30" }, { categorias })
    ).toEqual({ dataFim: "2026-09-30" });
    expect(traduzirFiltrosIA({ dataInicio: "2026-09-30", dataFim: "2026-09-01" })).toEqual({
      dataInicio: "2026-09-01",
      dataFim: "2026-09-30",
    });
    expect(traduzirFiltrosIA({ categoria: "Aluguel" }, { categorias })).toEqual({
      categoriaId: "all",
    });
    expect(traduzirFiltrosIA(null)).toEqual({});
  });

  it("tipoRelatorioValido aceita só abas existentes", () => {
    expect(tipoRelatorioValido("balanco")).toBe("balanco");
    expect(tipoRelatorioValido("DRE")).toBe("dre");
    expect(tipoRelatorioValido("comparacao")).toBeNull();
    expect(tipoRelatorioValido(undefined)).toBeNull();
  });
});

describe("resumoParaInsights", () => {
  it("normaliza tipo/status e gera chave estável", () => {
    const lista = [
      { tipo: "receita", status: "Realizado", valor: 1000 },
      { tipo: "Despesa", status: "Pago", valor: 200, categoria_id: "c1" },
      { tipo: "Despesa", status: "em_aberto", valor: 999 },
    ];
    const r = resumoParaInsights(lista, [{ id: "c1", nome: "Material" }]);
    expect(r.totalReceitas).toBe(1000);
    expect(r.totalDespesas).toBe(200);
    expect(r.margemLiquida).toBe(80);
    expect(r.categoriasMaiores).toEqual(["Material: R$ 200.00"]);
    expect(resumoParaInsights([...lista]).chave).toBe(r.chave);
  });
});

describe("dataLocalISO", () => {
  it("usa a data local", () => {
    expect(dataLocalISO(new Date(2026, 8, 29, 23, 30))).toBe("2026-09-29");
  });
});

describe("parcelas e posição na data-base", () => {
  const parcelada = {
    id: "t1",
    tipo: "Despesa",
    status: "pendente",
    valor: 3000,
    conta_id: "c1",
    data: "2026-08-20",
    data_vencimento: "2026-09-10",
    parcelado: true,
    // gravado com JSON.stringify no front; valores em formato brasileiro
    parcelas: JSON.stringify([
      {
        numero: 1,
        valor: "1.000,00",
        data_vencimento: "2026-09-10",
        status: "pago",
        data_pagamento: "2026-09-12",
      },
      { numero: 2, valor: 1000, data_vencimento: "2026-10-10", status: "pendente" },
      { numero: 3, valor: "1000.00", data_vencimento: "2026-11-10" },
    ]),
  };

  it("expandirParcelas: uma linha por parcela, com valor, vencimento, pagamento e status próprios", () => {
    const linhas = expandirParcelas([
      parcelada,
      { id: "t2", tipo: "Receita", status: "pago", valor: 50 },
    ]);
    expect(linhas).toHaveLength(4);
    expect(linhas[0]).toMatchObject({
      id: "t1:p1",
      transacao_id: "t1",
      valor: 1000,
      status: "pago",
      data_pagamento: "2026-09-12",
    });
    expect(linhas[1]).toMatchObject({
      id: "t1:p2",
      valor: 1000,
      status: "pendente",
      data_vencimento: "2026-10-10",
      data_pagamento: null,
    });
    expect(linhas[2]).toMatchObject({
      valor: 1000,
      status: "pendente",
      data_vencimento: "2026-11-10",
    });
    expect(linhas[3].id).toBe("t2");
    const cancelada = expandirParcelas([{ ...parcelada, status: "cancelado" }]);
    expect(cancelada.every((l) => l.status === "cancelado")).toBe(true);
  });

  it("DRE de caixa conta só a parcela paga, na data do pagamento", () => {
    const linhas = expandirParcelas([parcelada]);
    expect(dataReferencia(linhas[0])).toBe("2026-09-12");
    expect(dataReferencia(linhas[1])).toBe("2026-10-10");
    expect(calcularDRE(linhas).despesasOperacionais).toBe(1000);
  });

  it("abertoNaData: vencimento futuro conta; pago depois da data-base conta; lançado depois não", () => {
    const base = "2026-09-30";
    expect(
      abertoNaData({ status: "pendente", data: "2026-09-01", data_vencimento: "2026-12-01" }, base)
    ).toBe(true);
    expect(
      abertoNaData({ status: "pago", data: "2026-09-01", data_pagamento: "2026-10-05" }, base)
    ).toBe(true);
    expect(
      abertoNaData({ status: "pago", data: "2026-09-01", data_pagamento: "2026-09-20" }, base)
    ).toBe(false);
    expect(abertoNaData({ status: "pendente", data: "2026-10-02" }, base)).toBe(false);
    expect(abertoNaData({ status: "cancelado", data: "2026-09-01" }, base)).toBe(false);
  });

  it("saldo das contas na data-base desconta o que entrou/saiu depois; plano de contas e imposto retido ficam fora", () => {
    const contas = [
      { id: "c1", tipo: "Banco", saldo_atual: 5000 },
      { id: "c2", tipo: "Banco", tipo_natureza: "Passivo", saldo_atual: 900 }, // conta do plano
    ];
    expect(contaDisponivel(contas[1])).toBe(false);
    const caixa = [
      { conta_id: "c1", tipo: "Receita", status: "pago", valor: 700, data_pagamento: "2026-10-03" },
      { conta_id: "c1", tipo: "Despesa", status: "pago", valor: 200, data_pagamento: "2026-10-04" },
      { conta_id: "c1", tipo: "Despesa", status: "pago", valor: 300, data_pagamento: "2026-09-15" },
      {
        conta_id: "c1",
        tipo: "Despesa",
        status: "pendente",
        valor: 999,
        data_vencimento: "2026-10-20",
      },
      {
        conta_id: "c1",
        tipo: "Despesa",
        status: "pago",
        valor: 80,
        data_pagamento: "2026-10-05",
        referencia_tipo: "medicao_obra_imposto",
      },
    ];
    expect(saldoContasNaData(contas, caixa)).toBe(5000);
    expect(saldoContasNaData(contas, caixa, "2026-09-30")).toBe(4500); // 5000 − 700 + 200
  });

  it("balanço na data-base inclui parcelas a vencer no passivo e fecha", () => {
    const linhas = expandirParcelas([parcelada]);
    const contas = [{ id: "c1", tipo: "Banco", saldo_inicial: 4000, saldo_atual: 3000 }];
    const b = calcularBalanco(linhas, contas, "real", "2026-09-30", linhas);
    expect(b.contasPagar).toBe(2000); // parcelas 2 e 3 (a 3 vence em novembro)
    expect(b.saldoContas).toBe(3000); // a parcela 1 saiu em 12/09, antes da data-base
    expect(b.passivoTotal).toBeCloseTo(b.ativoTotal, 2);
  });
});
