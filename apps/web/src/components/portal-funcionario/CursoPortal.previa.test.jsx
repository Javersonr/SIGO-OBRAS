import React from "react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Os componentes importam utilitários que leem `window` ao carregar; o ambiente de teste não tem DOM.
vi.hoisted(() => {
  const janela = {};
  janela.self = janela;
  janela.top = janela;
  globalThis.window = janela;
});

// O teste NUNCA carrega o cliente de produção: `api.js` importa o sigoClient, que criaria o cliente do
// Supabase com o `.env.local` da máquina. Aqui qualquer chamada ao backend é registrada (e falha).
vi.mock("@/api/sigoClient", () => ({
  sigo: {
    functions: {
      invoke: vi.fn(() => {
        throw new Error("o portal chamou o backend durante o teste");
      }),
    },
  },
  supabase: {},
  resolveStorageUrl: vi.fn(),
}));

import { sigo } from "@/api/sigoClient";
import CursoPortal from "./CursoPortal";
import AvaliacaoPortal, { ProvaEmAndamento } from "./AvaliacaoPortal";
import DuvidasPortal from "./DuvidasPortal";
import { montarItemPrevia, criarApiPrevia } from "@/lib/portal-previa";
import { provaParaTela } from "@/lib/portal-curso";

/**
 * Primeira tela da prévia do RT ("Ver como aluno", T28) e do portal de verdade, só com dados sintéticos.
 * `renderToStaticMarkup` não roda efeitos: nenhuma chamada ao servidor acontece aqui. O que cada
 * componente faz depois (eventos, tempo) fica atrás da API injetada, coberta em lib/portal-previa.test.js.
 */
const curso = { id: "c1", nome: "Curso de teste", nota_minima: 70, max_tentativas: 3 };
const aulas = [
  {
    id: "a1",
    ordem: 1,
    tipo: "video",
    titulo: "Aula um",
    fonte: "youtube",
    youtube_id: "abc",
    duracao_seg: 100,
  },
  { id: "a2", ordem: 2, tipo: "texto", titulo: "Aula dois", conteudo_texto: "oi", duracao_seg: 60 },
];
const questoes = [
  {
    id: "q1",
    ordem: 1,
    pergunta: "Primeira?",
    opcoes: ["a", "b"],
    correta: 1,
    comentario: "Comentário reservado",
  },
  { id: "q2", ordem: 2, pergunta: "Segunda?", opcoes: ["a", "b", "c"], correta: 0 },
];

const itemPrevia = montarItemPrevia({ curso, aulas, questoes, urls: {} });
const apiPrevia = criarApiPrevia({ item: itemPrevia });
const semOperacao = () => {};
const fila = (tarefa) => tarefa();

// O que o servidor devolve a um aluno matriculado: aulas em ordem linear e NENHUMA questão (a prova só
// chega sorteada, sem gabarito, quando o aluno a abre: ação `iniciar_avaliacao`).
const { questoes: _questoesDaPrevia, ...itemSemQuestoes } = itemPrevia;
const itemReal = {
  ...itemSemQuestoes,
  matricula: { id: "m1", status: "em_andamento", avaliacao_aprovada: false },
  aulas: itemPrevia.aulas.map((a, i) => ({ ...a, liberada: i === 0 })),
};

// A resposta da ação `iniciar_avaliacao` do servidor: questões sorteadas e SEM gabarito.
const respostaIniciar = {
  success: true,
  tentativa: 1,
  tentativas_max: 3,
  nota_minima: 70,
  questoes: [
    { id: "q2", pergunta: "Segunda?", opcoes: ["c", "a", "b"], ordem_opcoes: [2, 0, 1] },
    { id: "q1", pergunta: "Primeira?", opcoes: ["b", "a"], ordem_opcoes: [1, 0] },
  ],
};

// Tag de abertura do primeiro <elemento> do HTML (null se não houver) e botão pelo texto dele.
const tagAbertura = (html, elemento) =>
  html.match(new RegExp(`<${elemento}\\b[^>]*>`))?.[0] ?? null;
const botaoComTexto = (html, texto) =>
  html.match(new RegExp(`<button\\b[^>]*>[^<]*${texto}</button>`))?.[0] ?? null;
// Só o ATRIBUTO conta: as classes do shadcn (`disabled:opacity-50`) também têm a palavra "disabled".
// O React escreve o atributo ligado como ` disabled=""`.
const desativado = (tag) => /\sdisabled=""/.test(tag);

describe("prévia do curso para o RT", () => {
  const html = renderToStaticMarkup(
    <CursoPortal
      item={itemPrevia}
      api={apiPrevia}
      recarregar={async () => null}
      dadosCarregadosEm={() => Date.now()}
      onVoltar={semOperacao}
      onErroSessao={semOperacao}
    />
  );

  it("avisa que é prévia e oferece a saída", () => {
    expect(html).toContain("Prévia como aluno");
    expect(html).toContain("Sair da prévia");
    expect(html).toContain("2 aulas · prévia");
  });

  it("lista todas as aulas liberadas, sem cadeado", () => {
    expect(html).toContain("1. Aula um");
    expect(html).toContain("2. Aula dois");
    expect(html).not.toContain("conclua a anterior");
    expect(html).not.toContain("opacity-60 cursor-not-allowed"); // estilo da aula bloqueada
  });

  it("deixa abrir a prova sem concluir as aulas", () => {
    const botao = botaoComTexto(html, "Fazer avaliação final");
    expect(botao).not.toBeNull();
    expect(desativado(botao)).toBe(false); // o botão está lá E pode ser apertado
    expect(html).toContain("nota mínima 70%");
    expect(html).toContain("tentativa 1 de 3");
  });

  it("a prova mostra o gabarito e o comentário só na prévia", async () => {
    // a prova da prévia é sorteada pela API injetada, como o servidor faria para o aluno
    const sorteada = await apiPrevia.chamarPortal("iniciar_avaliacao", {});
    const prova = renderToStaticMarkup(
      <ProvaEmAndamento
        prova={provaParaTela(sorteada, { previa: true })}
        item={itemPrevia}
        api={apiPrevia}
        fila={fila}
        tratarErro={semOperacao}
        onFechar={semOperacao}
        onReabrir={semOperacao}
      />
    );
    expect((prova.match(/gabarito<\/span>/g) || []).length).toBe(2); // uma por questão
    expect(prova).toContain("Comentário reservado");
  });

  it("a prova só abre depois de o servidor sortear: antes disso não há questão na tela", () => {
    const html = renderToStaticMarkup(
      <AvaliacaoPortal
        item={itemPrevia}
        api={apiPrevia}
        fila={fila}
        tratarErro={semOperacao}
        onFechar={semOperacao}
      />
    );
    expect(html).toContain("Preparando a prova");
    expect(html).not.toContain("Primeira?");
    expect(html).not.toContain("Segunda?");
  });

  it("a dúvida ao tutor aparece, mas desativada", () => {
    const duvidas = renderToStaticMarkup(
      <DuvidasPortal
        item={itemPrevia}
        api={apiPrevia}
        aulaId={null}
        recarregar={async () => {}}
        tratarErro={semOperacao}
      />
    );
    expect(duvidas).toContain("Prévia: aqui o aluno escreve a dúvida");
    expect(desativado(tagAbertura(duvidas, "textarea"))).toBe(true);
    expect(desativado(botaoComTexto(duvidas, "Enviar dúvida"))).toBe(true);
  });

  it("nada da prévia chamou o backend (a API injetada é a única porta)", () => {
    expect(sigo.functions.invoke).not.toHaveBeenCalled();
  });
});

describe("portal do aluno (sem API injetada)", () => {
  it("segue com a trava linear e sem nada de prévia", () => {
    const html = renderToStaticMarkup(
      <CursoPortal
        item={itemReal}
        token="token"
        recarregar={async () => null}
        onVoltar={semOperacao}
        onErroSessao={semOperacao}
      />
    );
    expect(html).not.toContain("Prévia");
    expect(html).toContain("0/2 aulas concluídas");
    expect(html).toContain("conclua a anterior");
    expect(html).not.toContain("Fazer avaliação final"); // só depois de concluir as aulas
  });

  it("a prova do aluno mostra as questões na ordem do servidor e não tem gabarito", () => {
    const prova = renderToStaticMarkup(
      <ProvaEmAndamento
        prova={provaParaTela(respostaIniciar)}
        item={itemReal}
        fila={fila}
        tratarErro={semOperacao}
        onFechar={semOperacao}
        onReabrir={semOperacao}
      />
    );
    // ordem das questões e das alternativas: a do servidor
    expect(prova.indexOf("Segunda?")).toBeGreaterThan(-1);
    expect(prova.indexOf("Segunda?")).toBeLessThan(prova.indexOf("Primeira?"));
    expect(prova).toMatch(/A\) c<[\s\S]*B\) a<[\s\S]*C\) b</);
    expect(prova).toContain("0 de 2 respondidas");
    expect(prova).toContain("tentativa 1 de 3");
    expect(prova).not.toContain("gabarito");
  });

  it("a prova do aluno não mostra gabarito nem comentário, nem se a resposta os trouxesse", () => {
    const comGabarito = {
      ...respostaIniciar,
      questoes: respostaIniciar.questoes.map((q) => ({
        ...q,
        correta: 0,
        comentario: "Comentário reservado",
      })),
    };
    const prova = renderToStaticMarkup(
      <ProvaEmAndamento
        prova={provaParaTela(comGabarito)}
        item={itemReal}
        fila={fila}
        tratarErro={semOperacao}
        onFechar={semOperacao}
        onReabrir={semOperacao}
      />
    );
    expect(prova).not.toContain("gabarito");
    expect(prova).not.toContain("Comentário reservado");
  });

  it("avisa que a prova foi aberta de novo quando recebe o aviso", () => {
    const prova = renderToStaticMarkup(
      <ProvaEmAndamento
        prova={provaParaTela(respostaIniciar)}
        aviso="A prova foi aberta de novo."
        item={itemReal}
        fila={fila}
        tratarErro={semOperacao}
        onFechar={semOperacao}
        onReabrir={semOperacao}
      />
    );
    expect(prova).toContain("A prova foi aberta de novo.");
  });

  it("o cartão da avaliação diz quantas questões tem, sem receber nenhuma questão", () => {
    const concluido = {
      ...itemReal,
      aulas: itemReal.aulas.map((a) => ({ ...a, concluida: true, liberada: true })),
      avaliacao: { ...itemReal.avaliacao, total_questoes: 2 },
    };
    expect("questoes" in concluido).toBe(false);
    const html = renderToStaticMarkup(
      <CursoPortal
        item={concluido}
        token="token"
        recarregar={async () => null}
        onVoltar={semOperacao}
        onErroSessao={semOperacao}
      />
    );
    expect(html).toContain("Avaliação final · 2 questões · nota mínima 70%");
    expect(botaoComTexto(html, "Fazer avaliação final")).not.toBeNull();
  });

  it("a dúvida ao tutor fica ativa para escrever", () => {
    const duvidas = renderToStaticMarkup(
      <DuvidasPortal
        item={itemReal}
        aulaId={null}
        recarregar={async () => {}}
        tratarErro={semOperacao}
      />
    );
    expect(duvidas).not.toContain("Prévia");
    expect(tagAbertura(duvidas, "textarea")).not.toBeNull();
    expect(desativado(tagAbertura(duvidas, "textarea"))).toBe(false);
  });

  it("a prova do aluno fica desativada enquanto o intervalo da nova tentativa não acaba", () => {
    const aguardando = {
      ...itemReal,
      aulas: itemReal.aulas.map((a) => ({ ...a, concluida: true, liberada: true })),
      avaliacao: {
        ...itemReal.avaliacao,
        tentativas_usadas: 1,
        proxima_em: new Date(Date.now() + 3600 * 1000).toISOString(),
      },
    };
    const html = renderToStaticMarkup(
      <CursoPortal
        item={aguardando}
        token="token"
        recarregar={async () => null}
        onVoltar={semOperacao}
        onErroSessao={semOperacao}
      />
    );
    const botao = botaoComTexto(html, "Fazer avaliação final");
    expect(botao).not.toBeNull();
    expect(desativado(botao)).toBe(true);
  });
});

describe("a prévia só pode falar com o servidor pela API injetada", () => {
  // Se um destes componentes voltasse a importar `chamarPortal` direto de ./api, a prévia (e a prova
  // dela) passariam a falar com o servidor de produção sem que nenhum outro teste percebesse.
  for (const arquivo of [
    "CursoPortal.jsx",
    "AvaliacaoPortal.jsx",
    "DuvidasPortal.jsx",
    "CertificadoPortal.jsx",
  ]) {
    it(`${arquivo} importa só \`apiPortal\` de ./api, nunca \`chamarPortal\``, () => {
      const fonte = readFileSync(fileURLToPath(new URL(arquivo, import.meta.url)), "utf8");
      const importados = [...fonte.matchAll(/import\s*\{([^}]*)\}\s*from\s*"\.\/api"/g)]
        .flatMap((m) => m[1].split(","))
        .map((n) => n.trim())
        .filter(Boolean);
      expect(importados).toContain("apiPortal"); // o padrão vem do módulo, e a prévia o substitui
      expect(importados).not.toContain("chamarPortal");
    });
  }
});
