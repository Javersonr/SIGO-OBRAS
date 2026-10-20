import { describe, it, expect } from "vitest";
import {
  mensagemErroFechamento,
  numeroBr,
  valorDoPreLancamento,
  dataDoFechamento,
  dataDoFechamentoParaInput,
  sugerirContaFundo,
  ehReceitaReposicaoLegada,
} from "./fechamento-caixa";

// Dados sintéticos.
describe("mensagemErroFechamento: repassa a mensagem do SQL, traduz só a infraestrutura", () => {
  it("exceção do SQL (já em português) passa como está", () => {
    const err = {
      message: "Algum pré-lançamento já está em outro fechamento. Recarregue a lista.",
      code: "P0001",
    };
    expect(mensagemErroFechamento(err)).toBe(err.message);
  });

  it("função que ainda não existe no banco (0158 não aplicada) vira aviso claro", () => {
    expect(
      mensagemErroFechamento({
        code: "PGRST202",
        message: "Could not find the function public.fechar_caixa(...) in the schema cache",
      })
    ).toMatch(/0158/);
    expect(
      mensagemErroFechamento(new Error("Could not find the function public.x in the schema cache"))
    ).toMatch(/atualização do banco/);
  });

  it("sem rede vira texto em português", () => {
    expect(mensagemErroFechamento(new TypeError("Failed to fetch"))).toMatch(/conexão/);
  });

  it("vazio não quebra", () => {
    expect(mensagemErroFechamento(null)).toBe("Erro desconhecido.");
    expect(mensagemErroFechamento({})).toBe("Erro desconhecido.");
    expect(mensagemErroFechamento("texto")).toBe("texto");
  });
});

describe("numeroBr / valorDoPreLancamento: mesmo valor que o banco soma no fechamento", () => {
  it("vírgula = formato brasileiro, ponto sozinho = decimal", () => {
    expect(numeroBr("1.234,56")).toBe(1234.56);
    expect(numeroBr("100,5")).toBe(100.5);
    expect(numeroBr("100.5")).toBe(100.5);
    expect(numeroBr(49.5)).toBe(49.5);
    expect(numeroBr("")).toBeNull();
    expect(numeroBr("R$ 10,00")).toBeNull();
    expect(numeroBr(null)).toBeNull();
  });

  it("aceita dados_extraidos como objeto, string JSON e string JSON dentro de string", () => {
    expect(valorDoPreLancamento({ dados_extraidos: { valor: "1.234,56" } })).toBe(1234.56);
    expect(valorDoPreLancamento({ dados_extraidos: JSON.stringify({ valor: "20" }) })).toBe(20);
    const duplo = JSON.stringify(JSON.stringify({ valor: "100,5" }));
    expect(valorDoPreLancamento({ dados_extraidos: duplo })).toBe(100.5);
  });

  it("sem valor ou lixo → 0", () => {
    expect(valorDoPreLancamento({})).toBe(0);
    expect(valorDoPreLancamento(null)).toBe(0);
    expect(valorDoPreLancamento({ dados_extraidos: "xx" })).toBe(0);
    expect(valorDoPreLancamento({ dados_extraidos: { valor: "abc" } })).toBe(0);
  });
});

describe("dataDoFechamento: timestamptz do banco sem 'Invalid Date' e sem virar o dia", () => {
  it("data escolhida na tela (meia-noite) aparece como foi escolhida", () => {
    expect(dataDoFechamento("2026-09-30T00:00:00+00:00")).toBe("30/09/2026");
    expect(dataDoFechamento("2026-09-30 00:00:00+00")).toBe("30/09/2026");
    expect(dataDoFechamento("2026-09-30T00:00:00-03:00")).toBe("30/09/2026");
    expect(dataDoFechamento("2026-09-30")).toBe("30/09/2026");
  });

  it("instante do fechar_caixa (now()) aparece no dia de Brasília", () => {
    // 02h10 UTC de 01/10 = 23h10 de 30/09 em Brasília
    expect(dataDoFechamento("2026-10-01T02:10:33.123456+00:00")).toBe("30/09/2026");
    expect(dataDoFechamento("2026-10-01T15:00:00.5+00:00")).toBe("01/10/2026");
  });

  it("vazio ou inválido → '-'", () => {
    expect(dataDoFechamento(null)).toBe("-");
    expect(dataDoFechamento("")).toBe("-");
    expect(dataDoFechamento("lixo")).toBe("-");
  });

  it("para o input de data: AAAA-MM-DD no mesmo critério", () => {
    expect(dataDoFechamentoParaInput("2026-09-30T00:00:00+00:00")).toBe("2026-09-30");
    expect(dataDoFechamentoParaInput("2026-10-01T02:10:33.123+00:00")).toBe("2026-09-30");
    expect(dataDoFechamentoParaInput("2026-09-30")).toBe("2026-09-30");
    expect(dataDoFechamentoParaInput(null)).toBe("");
    expect(dataDoFechamentoParaInput("lixo")).toBe("");
  });
});

describe("sugerirContaFundo: conta do fundo fixo que recebe a reposição", () => {
  const contas = [
    { id: "banco", tipo: "Banco", nome: "Banco" },
    {
      id: "ff-camila",
      tipo: "Fundo Fixo",
      nome: "Fundo Fixo Camila",
      responsavel_email: "camila@x.com",
    },
    { id: "ff-luan", tipo: "Fundo Fixo", nome: "Fundo Fixo Luan", responsavel_email: "luan@x.com" },
  ];

  it("a conta já gravada no fechamento vence", () => {
    expect(sugerirContaFundo(contas, [], "ff-luan")).toBe("ff-luan");
  });

  it("itens de uma só pessoa → o fundo fixo dela", () => {
    const itens = [{ usuario_email: "Camila@x.com " }, { usuario_email: "camila@x.com" }];
    expect(sugerirContaFundo(contas, itens, null)).toBe("ff-camila");
  });

  it("itens de várias pessoas e vários fundos → sem sugestão", () => {
    const itens = [{ usuario_email: "camila@x.com" }, { usuario_email: "luan@x.com" }];
    expect(sugerirContaFundo(contas, itens, null)).toBe("");
  });

  it("único fundo fixo da empresa → ele", () => {
    expect(sugerirContaFundo(contas.slice(0, 2), [{ usuario_email: "outro@x.com" }], null)).toBe(
      "ff-camila"
    );
  });

  it("conta gravada que não está na lista (inativa) não é sugerida", () => {
    expect(sugerirContaFundo(contas, [], "sumiu")).toBe("");
    expect(sugerirContaFundo(null, null, null)).toBe("");
  });
});

describe("ehReceitaReposicaoLegada: receita antiga do fechamento, pelo número inteiro", () => {
  it("casa #1 e não #12; só receita", () => {
    const r = (descricao, tipo = "Receita") => ({ tipo, descricao });
    expect(ehReceitaReposicaoLegada(r("Reposição Fechamento #1 - João"), 1)).toBe(true);
    expect(ehReceitaReposicaoLegada(r("Reposição Fechamento #12"), 1)).toBe(false);
    expect(ehReceitaReposicaoLegada(r("Reposição Fechamento #12"), 12)).toBe(true);
    expect(ehReceitaReposicaoLegada(r("Fechamento #1", "Despesa"), 1)).toBe(false);
    expect(ehReceitaReposicaoLegada(r("Fechamento #1"), null)).toBe(false);
  });
});
