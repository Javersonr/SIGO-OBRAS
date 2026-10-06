import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// utilitários importados pelos componentes leem `window` ao carregar; o ambiente de teste não tem DOM
vi.hoisted(() => {
  const janela = {};
  janela.self = janela;
  janela.top = janela;
  globalThis.window = janela;
});

import ProvaDaTentativa from "./ProvaDaTentativa";

// Dados sintéticos: perguntas inventadas, nenhum nome ou identificador real.
const tentativa = {
  id: "t1",
  numero: 2,
  acertos: 1,
  total: 2,
  created_at: "2026-10-05T14:00:00Z",
  dispositivo: "Navegador de teste",
  prova: [
    {
      questao_id: "q1",
      ordem: 1,
      pergunta: "Qual é a cor do teste?",
      opcoes: ["azul", "verde", "roxo"],
      correta: 1,
    },
    {
      questao_id: "q2",
      ordem: 2,
      pergunta: "Quantos lados tem um triângulo?",
      opcoes: ["2", "3", "4"],
      correta: 1,
    },
  ],
  respostas: [
    // mostrada em 2º lugar, alternativas na ordem roxo, azul, verde; o aluno marcou "azul" (errada)
    {
      questao_id: "q1",
      resposta: 0,
      acertou: false,
      posicao_exibida: 2,
      ordem_opcoes_exibida: [2, 0, 1],
    },
    // mostrada em 1º lugar, alternativas 4, 2, 3; o aluno marcou "3" (certa)
    {
      questao_id: "q2",
      resposta: 1,
      acertou: true,
      posicao_exibida: 1,
      ordem_opcoes_exibida: [2, 0, 1],
    },
  ],
};

const html = (props) =>
  renderToStaticMarkup(
    <ProvaDaTentativa tentativa={tentativa} formatarDataHora={(iso) => `[${iso}]`} {...props} />
  );

describe("ProvaDaTentativa", () => {
  it("mostra as perguntas na ordem em que apareceram para o aluno", () => {
    const saida = html();
    expect(saida.indexOf("Quantos lados tem um triângulo?")).toBeGreaterThan(-1);
    expect(saida.indexOf("Quantos lados tem um triângulo?")).toBeLessThan(
      saida.indexOf("Qual é a cor do teste?")
    );
    expect(saida).toContain("Questão 1");
    expect(saida).toContain("Questão 2");
  });

  it("as alternativas saem na ordem exibida, com letra", () => {
    const saida = html();
    // q1: roxo, azul, verde
    const ordem = ["roxo", "azul", "verde"].map((t) => saida.indexOf(`>${t}<`));
    expect(ordem.every((i) => i > -1)).toBe(true);
    expect([...ordem].sort((a, b) => a - b)).toEqual(ordem);
    expect(saida).toContain("A)");
    expect(saida).toContain("C)");
  });

  it("diz em texto qual foi marcada e qual é a correta (não só pela cor)", () => {
    const saida = html();
    expect(saida).toContain("marcada");
    expect(saida).toContain("correta");
    expect(saida).toContain("Acertou");
    expect(saida).toContain("Errou");
  });

  it("mostra quando a prova foi aberta e enviada, e o aparelho", () => {
    const saida = html({ abertaEm: "2026-10-05T13:50:00Z" });
    expect(saida).toContain("Prova aberta em [2026-10-05T13:50:00Z]");
    expect(saida).toContain("Enviada em [2026-10-05T14:00:00Z]");
    expect(saida).toContain("Aparelho: Navegador de teste");
    expect(html()).not.toContain("Prova aberta em");
  });

  it("tentativa antiga sem a ordem exibida avisa que usou a ordem do cadastro", () => {
    const antiga = {
      ...tentativa,
      respostas: tentativa.respostas.map(({ questao_id, resposta, acertou }) => ({
        questao_id,
        resposta,
        acertou,
      })),
    };
    expect(html({ tentativa: antiga })).toContain("não registrou a ordem das alternativas");
    expect(html()).not.toContain("não registrou a ordem das alternativas");
  });

  it("tentativa sem a prova gravada mostra só o resultado, sem quebrar", () => {
    const sem = { ...tentativa, prova: null, respostas: null };
    const saida = html({ tentativa: sem });
    expect(saida).toContain("não guardou o texto da prova");
    expect(saida).toContain("1/2 acertos");
  });
});
