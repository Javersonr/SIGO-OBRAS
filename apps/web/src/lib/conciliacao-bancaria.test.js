import { describe, it, expect } from "vitest";
import {
  dataDaTransacao,
  diasEntre,
  ehLinhaDoBanco,
  ehSugestao,
  extratoConciliado,
  extratoPendente,
  ordenarRegras,
  pontuarCandidato,
  regraCasa,
  seraBaixadoAoConciliar,
  transacaoConciliavel,
  valorDaTransacao,
  valorDoExtrato,
  mesmoSentido,
} from "./conciliacao-bancaria";

describe("ehLinhaDoBanco — mesmo critério de _extrato_eh_do_banco (0156)", () => {
  it("importada: status_conciliacao, upload_id ou origem OFX", () => {
    expect(ehLinhaDoBanco({ status_conciliacao: "pendente" })).toBe(true);
    expect(ehLinhaDoBanco({ status_conciliacao: "" })).toBe(true); // is not null
    expect(ehLinhaDoBanco({ upload_id: "u1" })).toBe(true);
    expect(ehLinhaDoBanco({ origem: "ofx" })).toBe(true);
  });
  it("do sistema: nada disso", () => {
    expect(ehLinhaDoBanco({ origem: "Manual", hash_linha: "tx:1", transacao_id: "t1" })).toBe(
      false
    );
    expect(ehLinhaDoBanco({ status_conciliacao: null, upload_id: null, origem: null })).toBe(false);
    expect(ehLinhaDoBanco(null)).toBe(false);
  });
});

describe("pendente × conciliada", () => {
  it("transacao_id ou status conciliado = conciliada", () => {
    expect(extratoConciliado({ status_conciliacao: "conciliado", transacao_id: "t" })).toBe(true);
    expect(extratoConciliado({ status_conciliacao: "pendente", transacao_id: "t" })).toBe(true);
    expect(extratoPendente({ status_conciliacao: "pendente" })).toBe(true);
    expect(extratoPendente({ origem: "OFX" })).toBe(true); // legado sem status
  });
  it("linha do sistema não é nem uma nem outra", () => {
    const sist = { origem: "Manual", transacao_id: "t" };
    expect(extratoPendente(sist)).toBe(false);
    expect(extratoConciliado(sist)).toBe(false);
  });
});

describe("valores com sinal", () => {
  it("extrato: tipo manda (legado positivo) e valor novo já vem com sinal", () => {
    expect(valorDoExtrato({ valor: 100, tipo: "debito" })).toBe(-100);
    expect(valorDoExtrato({ valor: -100, tipo: "debito" })).toBe(-100);
    expect(valorDoExtrato({ valor: 100, tipo: "credito" })).toBe(100);
    expect(valorDoExtrato({ valor: -7 })).toBe(-7);
  });
  it("transação: despesa negativa, receita positiva", () => {
    expect(valorDaTransacao({ valor: 50, tipo: "despesa" })).toBe(-50);
    expect(valorDaTransacao({ valor: 50, tipo: "Receita" })).toBe(50);
  });
});

describe("dataDaTransacao / diasEntre", () => {
  it("paga usa data_pagamento; em aberto usa vencimento", () => {
    const t = { data: "2026-09-01", data_vencimento: "2026-09-10", data_pagamento: "2026-09-12" };
    expect(dataDaTransacao({ ...t, status: "pago" })).toBe("2026-09-12");
    expect(dataDaTransacao({ ...t, status: "em_aberto" })).toBe("2026-09-10");
    expect(dataDaTransacao({ data: "2026-09-01", status: "pago" })).toBe("2026-09-01");
  });
  it("diferença em dias", () => {
    expect(diasEntre("2026-09-29", "2026-10-01")).toBe(2);
    expect(diasEntre("2026-09-29", null)).toBe(Infinity);
  });
});

describe("transacaoConciliavel — o que conciliar_extrato aceita", () => {
  it("paga ou em aberto não parcelada", () => {
    expect(transacaoConciliavel({ tipo: "despesa", status: "pago" })).toBe(true);
    expect(transacaoConciliavel({ tipo: "despesa", status: "em_aberto" })).toBe(true);
    expect(transacaoConciliavel({ tipo: "despesa", status: "pago", parcelado: true })).toBe(true);
  });
  it("recusa conciliada, cancelada, parcelada em aberto e tipo desconhecido", () => {
    expect(transacaoConciliavel({ tipo: "despesa", status: "pago", conciliado: true })).toBe(false);
    expect(transacaoConciliavel({ tipo: "despesa", status: "Cancelado" })).toBe(false);
    expect(transacaoConciliavel({ tipo: "despesa", status: "pendente", parcelado: true })).toBe(
      false
    );
    expect(transacaoConciliavel({ tipo: "transferencia", status: "pago" })).toBe(false);
  });
  it("em aberto será baixada ao conciliar", () => {
    expect(seraBaixadoAoConciliar({ status: "pendente" })).toBe(true);
    expect(seraBaixadoAoConciliar({ status: "Realizado" })).toBe(false);
  });
});

describe("regraCasa", () => {
  const extrato = {
    data: "2026-09-29",
    valor: -150,
    tipo: "debito",
    descricao: "PAG BOLETO ENERGIA",
  };
  const tx = {
    tipo: "despesa",
    status: "pago",
    valor: 150,
    data_pagamento: "2026-09-28",
    descricao: "pag boleto energia",
  };
  const regra = { tipo_match: "exato", tolerancia_valor: 0, tolerancia_dias: 1 };

  it("débito do banco casa com despesa de mesmo valor (com sinal)", () => {
    expect(regraCasa(regra, extrato, tx)).toBe(true);
    // a versão antiga comparava |valor|: receita de 150 casava com débito de 150
    expect(regraCasa(regra, extrato, { ...tx, tipo: "receita" })).toBe(false);
  });

  it("linha legada (valor positivo + tipo debito) também casa", () => {
    expect(regraCasa(regra, { ...extrato, valor: 150 }, tx)).toBe(true);
  });

  it("tolerâncias de valor (em centavos) e dias", () => {
    expect(regraCasa(regra, extrato, { ...tx, valor: 150.01 })).toBe(false);
    expect(regraCasa({ ...regra, tolerancia_valor: 0.01 }, extrato, { ...tx, valor: 150.01 })).toBe(
      true
    );
    expect(regraCasa(regra, extrato, { ...tx, data_pagamento: "2026-09-26" })).toBe(false);
  });

  it("contem / palavra_chave / ignorar_descricao", () => {
    const curto = { ...extrato, descricao: "energia" };
    expect(regraCasa({ ...regra, tipo_match: "contem" }, curto, tx)).toBe(true);
    expect(regraCasa({ ...regra, tipo_match: "contem" }, { ...extrato, descricao: "" }, tx)).toBe(
      false
    );
    const kw = { ...regra, tipo_match: "palavra_chave", palavras_chave: '["luz","ENERGIA"]' };
    expect(regraCasa(kw, extrato, tx)).toBe(true);
    // palavra vazia não vira coringa
    expect(regraCasa({ ...kw, palavras_chave: '["", " "]' }, extrato, tx)).toBe(false);
    expect(
      regraCasa({ ...regra, ignorar_descricao: true }, extrato, { ...tx, descricao: "x" })
    ).toBe(true);
  });
});

describe("ordenarRegras", () => {
  it("prioridade menor primeiro, só ativas", () => {
    const r = ordenarRegras([
      { id: "b", prioridade: 3, ativo: true },
      { id: "a", prioridade: 1, ativo: true },
      { id: "x", prioridade: 0, ativo: false },
    ]);
    expect(r.map((x) => x.id)).toEqual(["a", "b"]);
  });
});

describe("sugestões e pontuação", () => {
  const extrato = { data: "2026-09-29", valor: -100, tipo: "debito", descricao: "PIX JOAO" };
  it("ehSugestao: até R$ 0,10 e 5 dias, com sinal", () => {
    const tx = { tipo: "despesa", status: "pago", valor: 100.1, data_pagamento: "2026-09-25" };
    expect(ehSugestao(extrato, tx)).toBe(true);
    expect(ehSugestao(extrato, { ...tx, tipo: "receita" })).toBe(false);
  });
  it("pontuarCandidato: exato no valor, na data e na descrição = 100", () => {
    const tx = {
      tipo: "despesa",
      status: "pago",
      valor: 100,
      data_pagamento: "2026-09-29",
      descricao: "pix joao",
    };
    expect(pontuarCandidato(extrato, tx)).toEqual({
      score: 100,
      valorExato: true,
      dataProxima: true,
    });
    // descrição vazia não ganha os 30 pontos de graça
    expect(pontuarCandidato({ ...extrato, descricao: "" }, { ...tx, descricao: "" }).score).toBe(
      70
    );
  });
});

describe("mesmoSentido: igual ao conciliar_extrato do banco", () => {
  it("receita só com entrada, despesa só com saída; linha antiga pelo tipo", () => {
    const entrada = { valor: 50 };
    const saida = { valor: -50 };
    const saidaAntiga = { valor: 50, tipo: "debito" };
    expect(mesmoSentido(entrada, { tipo: "Receita" })).toBe(true);
    expect(mesmoSentido(saida, { tipo: "receita" })).toBe(false);
    expect(mesmoSentido(saida, { tipo: "Despesa" })).toBe(true);
    expect(mesmoSentido(saidaAntiga, { tipo: "Despesa" })).toBe(true);
    expect(mesmoSentido(saidaAntiga, { tipo: "Receita" })).toBe(false);
  });
});
