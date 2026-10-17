import { describe, it, expect, vi, afterEach } from "vitest";
import {
  camposDaBaixa,
  classificarBaixaEmLote,
  desconciliarTransacao,
  ehErroConciliacao,
  estornarLancamento,
  marcarParcela,
  resumoBaixaEmLote,
  marcarParcelaNoBanco,
  preservarPagamentosDasParcelas,
  statusDaParcelada,
} from "./baixa-financeira";

// Mensagens exatas dos triggers da 0155
const ERRO_TX_CONCILIADA = {
  code: "P0001",
  message:
    "Lançamento conciliado com o extrato do banco: desfaça a conciliação antes de estornar ou excluir",
};
const ERRO_LINHA_CONCILIADA = {
  code: "P0001",
  message: "Linha do extrato bancário conciliada: desfaça a conciliação antes de excluir",
};

afterEach(() => {
  vi.useRealTimers();
});

describe("camposDaBaixa", () => {
  it("pagar grava status pago + a data escolhida", () => {
    expect(camposDaBaixa(true, "2026-09-29")).toEqual({
      status: "pago",
      data_pagamento: "2026-09-29",
    });
  });
  it("pagar sem data usa hoje (local)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 17, 10, 0, 0));
    expect(camposDaBaixa(true)).toEqual({ status: "pago", data_pagamento: "2026-10-17" });
    expect(camposDaBaixa(true, "")).toEqual({ status: "pago", data_pagamento: "2026-10-17" });
  });
  it("estornar volta para em_aberto e limpa a data", () => {
    expect(camposDaBaixa(false, "2026-09-29")).toEqual({
      status: "em_aberto",
      data_pagamento: null,
    });
  });
  it("nunca grava 'Realizado' (a lista mostrava como Em aberto)", () => {
    expect(camposDaBaixa(true, "2026-09-29").status).not.toMatch(/realizado/i);
  });
});

describe("ehErroConciliacao", () => {
  it("reconhece os dois erros de conciliação do banco", () => {
    expect(ehErroConciliacao(ERRO_TX_CONCILIADA)).toBe(true);
    expect(ehErroConciliacao(ERRO_LINHA_CONCILIADA)).toBe(true);
    expect(ehErroConciliacao(new Error(ERRO_TX_CONCILIADA.message))).toBe(true);
    expect(ehErroConciliacao(ERRO_TX_CONCILIADA.message)).toBe(true);
  });
  it("não confunde com outros erros", () => {
    expect(ehErroConciliacao({ code: "P0001", message: "Acesso negado" })).toBe(false);
    expect(ehErroConciliacao(new Error("rate limit"))).toBe(false);
    expect(ehErroConciliacao(null)).toBe(false);
    expect(ehErroConciliacao(undefined)).toBe(false);
  });
});

describe("classificarBaixaEmLote", () => {
  it("separa a baixar, parceladas e já pagas", () => {
    const itens = [
      { id: "a", status: "em_aberto" },
      { id: "b", status: "pago" },
      { id: "c", status: "Realizado" },
      { id: "d", status: "em_aberto", parcelado: true },
      { id: "e", status: "Pago", parcelado: true },
      { id: "f", status: "atrasado" },
      { id: "g" },
    ];
    const r = classificarBaixaEmLote(itens);
    expect(r.baixar.map((t) => t.id)).toEqual(["a", "f", "g"]);
    // parcelada é pulada mesmo com status pago: quem manda é o JSON das parcelas
    expect(r.parceladas.map((t) => t.id)).toEqual(["d", "e"]);
    expect(r.jaPagas.map((t) => t.id)).toEqual(["b", "c"]);
  });
  it("parcelado só conta quando é true (legado com string/1 não)", () => {
    const r = classificarBaixaEmLote([{ id: "x", status: "em_aberto", parcelado: false }]);
    expect(r.baixar).toHaveLength(1);
  });
  it("lista vazia, nula ou com buracos", () => {
    expect(classificarBaixaEmLote(null)).toEqual({ baixar: [], parceladas: [], jaPagas: [] });
    expect(classificarBaixaEmLote([null, undefined])).toEqual({
      baixar: [],
      parceladas: [],
      jaPagas: [],
    });
  });
});

describe("resumoBaixaEmLote", () => {
  it("só baixadas", () => {
    expect(resumoBaixaEmLote({ baixadas: 3 })).toBe("✅ 3 despesa(s) baixada(s).");
  });
  it("explica as puladas", () => {
    const txt = resumoBaixaEmLote({ baixadas: 1, parceladas: 2, jaPagas: 1 });
    expect(txt).toContain("✅ 1 despesa(s) baixada(s).");
    expect(txt).toContain("⏭️ 3 pulada(s):");
    expect(txt).toContain("2 parcelada(s) — o pagamento é feito parcela a parcela");
    expect(txt).toContain("1 já estava(m) paga(s)");
  });
  it("rótulos de receita", () => {
    const txt = resumoBaixaEmLote(
      { baixadas: 2, jaPagas: 1 },
      { itens: "receita(s)", baixadasRotulo: "recebida(s)", pagasRotulo: "recebida(s)" }
    );
    expect(txt).toContain("✅ 2 receita(s) recebida(s).");
    expect(txt).toContain("1 já estava(m) recebida(s)");
    expect(txt).not.toContain("parcelada");
  });
  it("lista as falhas (até 10)", () => {
    const falhas = Array.from({ length: 12 }, (_, i) => `D${i}: erro`);
    const txt = resumoBaixaEmLote({ baixadas: 0, falhas });
    expect(txt).toContain("❌ 12 com erro:");
    expect(txt).toContain("D9: erro");
    expect(txt).not.toContain("D10: erro");
    expect(txt).toContain("... e mais 2");
  });
});

describe("estornarLancamento", () => {
  const montar = ({ conciliado = false, confirma = true, falhas = [] } = {}) => {
    const ordem = [];
    const fila = [...falhas];
    return {
      ordem,
      args: {
        conciliado,
        confirmar: vi.fn(() => {
          ordem.push("confirmar");
          return confirma;
        }),
        desconciliar: vi.fn(async () => {
          ordem.push("desconciliar");
        }),
        estornar: vi.fn(async () => {
          ordem.push("estornar");
          const erro = fila.shift();
          if (erro) throw erro;
        }),
      },
    };
  };

  it("não conciliado: só estorna, sem perguntar", async () => {
    const { ordem, args } = montar();
    expect(await estornarLancamento(args)).toBe(true);
    expect(ordem).toEqual(["estornar"]);
  });

  it("conciliado: pergunta, desconcilia e SÓ ENTÃO estorna", async () => {
    const { ordem, args } = montar({ conciliado: true });
    expect(await estornarLancamento(args)).toBe(true);
    expect(ordem).toEqual(["confirmar", "desconciliar", "estornar"]);
  });

  it("conciliado e o usuário desiste: nada é gravado", async () => {
    const { ordem, args } = montar({ conciliado: true, confirma: false });
    expect(await estornarLancamento(args)).toBe(false);
    expect(ordem).toEqual(["confirmar"]);
  });

  it("lista desatualizada: o banco recusa por conciliação → pergunta, desconcilia, tenta de novo", async () => {
    const { ordem, args } = montar({ falhas: [ERRO_TX_CONCILIADA] });
    expect(await estornarLancamento(args)).toBe(true);
    expect(ordem).toEqual(["estornar", "confirmar", "desconciliar", "estornar"]);
  });

  it("lista desatualizada e o usuário desiste: não desconcilia", async () => {
    const { ordem, args } = montar({ falhas: [ERRO_TX_CONCILIADA], confirma: false });
    expect(await estornarLancamento(args)).toBe(false);
    expect(ordem).toEqual(["estornar", "confirmar"]);
  });

  it("outro erro do banco sobe sem perguntar nem desconciliar", async () => {
    const erro = new Error("Acesso negado");
    const { ordem, args } = montar({ falhas: [erro] });
    await expect(estornarLancamento(args)).rejects.toBe(erro);
    expect(ordem).toEqual(["estornar"]);
  });

  it("falha ao desconciliar: não tenta estornar", async () => {
    const { ordem, args } = montar({ conciliado: true });
    args.desconciliar.mockRejectedValueOnce(new Error("Lançamento não encontrado"));
    await expect(estornarLancamento(args)).rejects.toThrow("Lançamento não encontrado");
    expect(args.estornar).not.toHaveBeenCalled();
    expect(ordem).toEqual(["confirmar"]);
  });
});

describe("desconciliarTransacao", () => {
  it("chama a RPC da 0156 com p_transacao_id", async () => {
    const client = { rpc: vi.fn(async () => ({ data: 1, error: null })) };
    await desconciliarTransacao(client, "tx-1");
    expect(client.rpc).toHaveBeenCalledWith("desconciliar_transacao", { p_transacao_id: "tx-1" });
  });
  it("propaga o erro da RPC", async () => {
    const erro = { message: "Lançamento não encontrado" };
    const client = { rpc: vi.fn(async () => ({ data: null, error: erro })) };
    await expect(desconciliarTransacao(client, "tx-1")).rejects.toBe(erro);
  });
  it("sem cliente: erro claro", async () => {
    await expect(desconciliarTransacao(null, "tx-1")).rejects.toThrow("Backend não configurado");
  });
});

describe("marcarParcela", () => {
  const parcelas = () => [
    {
      numero: 1,
      valor: 100,
      data_vencimento: "2026-09-10",
      status: "pago",
      data_pagamento: "2026-09-10",
    },
    {
      numero: 2,
      valor: 100,
      data_vencimento: "2026-10-10",
      status: "em_aberto",
      data_pagamento: null,
    },
  ];

  it("paga a parcela com as chaves que o banco lê (status/data_pagamento)", () => {
    const novas = marcarParcela(parcelas(), 1, {
      pago: true,
      dataPagamento: "2026-10-09",
      comprovanteUrl: "comprovantes/x.pdf",
    });
    expect(novas[1]).toEqual({
      numero: 2,
      valor: 100,
      data_vencimento: "2026-10-10",
      status: "pago",
      data_pagamento: "2026-10-09",
      comprovante_url: "comprovantes/x.pdf",
    });
    expect(novas[0]).toEqual(parcelas()[0]);
  });

  it("desfaz o pagamento: em_aberto, sem data e sem comprovante", () => {
    const novas = marcarParcela(parcelas(), 0, { pago: false });
    expect(novas[0]).toMatchObject({
      status: "em_aberto",
      data_pagamento: null,
      comprovante_url: null,
      valor: 100,
    });
  });

  it("não altera o array nem os objetos originais", () => {
    const orig = parcelas();
    const copia = JSON.parse(JSON.stringify(orig));
    const novas = marcarParcela(orig, 0, { pago: false });
    expect(orig).toEqual(copia);
    expect(novas).not.toBe(orig);
    expect(novas[1]).toBe(orig[1]);
  });

  it("paga sem data usa hoje; sem comprovante grava null", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 17, 10, 0, 0));
    const novas = marcarParcela(parcelas(), 1, { pago: true, comprovanteUrl: "" });
    expect(novas[1].data_pagamento).toBe("2026-10-17");
    expect(novas[1].comprovante_url).toBeNull();
  });

  it("lista nula vira lista vazia", () => {
    expect(marcarParcela(null, 0, { pago: true })).toEqual([]);
  });
});

describe("parcelas: banco como fonte do pagamento", () => {
  it("marcarParcelaNoBanco chama a RPC com a parcela e a data (ou hoje)", async () => {
    const chamadas = [];
    const client = {
      rpc: async (nome, args) => {
        chamadas.push([nome, args]);
        return { data: [{ status: "pago" }], error: null };
      },
    };
    await marcarParcelaNoBanco(client, "t1", 2, { pago: true, dataPagamento: "2026-10-05" });
    await marcarParcelaNoBanco(client, "t1", 0, { pago: false });
    expect(chamadas[0]).toEqual([
      "financeiro_marcar_parcela",
      {
        p_transacao_id: "t1",
        p_indice: 2,
        p_pago: true,
        p_data_pagamento: "2026-10-05",
        p_comprovante_url: null,
      },
    ]);
    expect(chamadas[1][1]).toMatchObject({ p_indice: 0, p_pago: false, p_data_pagamento: null });
    const falha = { rpc: async () => ({ data: null, error: new Error("A parcela 4 não existe") }) };
    await expect(marcarParcelaNoBanco(falha, "t1", 3, { pago: true })).rejects.toThrow(
      /não existe/
    );
  });

  it("preservarPagamentosDasParcelas: pagamento do banco, valor e vencimento do formulário", () => {
    const form = [
      { numero: 1, valor: 110, data_vencimento: "2026-10-10", status: "em_aberto" },
      { numero: 2, valor: 90, data_vencimento: "2026-11-10", status: "em_aberto" },
      { numero: 3, valor: 50, data_vencimento: "2026-12-10" },
    ];
    const banco = [
      {
        numero: 1,
        valor: 100,
        status: "pago",
        data_pagamento: "2026-10-09",
        comprovante_url: "c/1",
      },
      { numero: 2, valor: 100, status: "em_aberto" },
    ];
    expect(preservarPagamentosDasParcelas(form, banco)).toEqual([
      {
        numero: 1,
        valor: 110,
        data_vencimento: "2026-10-10",
        status: "pago",
        data_pagamento: "2026-10-09",
        comprovante_url: "c/1",
      },
      {
        numero: 2,
        valor: 90,
        data_vencimento: "2026-11-10",
        status: "em_aberto",
        data_pagamento: null,
        comprovante_url: null,
      },
      { numero: 3, valor: 50, data_vencimento: "2026-12-10" },
    ]);
  });

  it("statusDaParcelada: todas pagas → pago; senão em aberto; cancelada fica", () => {
    const pagas = [{ status: "pago" }, { status: "Realizado" }];
    expect(statusDaParcelada(pagas, "em_aberto")).toBe("pago");
    expect(statusDaParcelada([{ status: "pago" }, { status: "em_aberto" }], "pago")).toBe(
      "em_aberto"
    );
    expect(statusDaParcelada([{ status: "em_aberto" }], "atrasado")).toBe("atrasado");
    expect(statusDaParcelada(pagas, "cancelado")).toBe("cancelado");
    expect(statusDaParcelada([], "pago")).toBe("em_aberto");
  });
});
