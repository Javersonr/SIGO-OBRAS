import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Os componentes importam utilitários que leem `window` ao carregar; o ambiente de teste não tem DOM.
vi.hoisted(() => {
  const janela = {};
  janela.self = janela;
  janela.top = janela;
  globalThis.window = janela;
});

// O teste NUNCA carrega o cliente de produção (ver CursoPortal.previa.test.jsx).
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
import QuestionarioPortal, {
  QuestoesDoQuestionario,
  ResultadoDoQuestionario,
  SituacaoDoQuestionario,
} from "./QuestionarioPortal";
import { provaParaTela } from "@/lib/portal-curso";

const semOperacao = () => {};
const fila = (tarefa) => tarefa();
const item = { matricula: { id: "m1" } };
const aula = { id: "aq", tipo: "questionario", titulo: "M1 · Questionário do módulo" };

// a resposta de `questionario_abrir` do servidor: sorteada e SEM gabarito (dados sintéticos)
const aberta = {
  success: true,
  concluida: false,
  tentativa: 2,
  nota_minima: 80,
  questoes: [
    { id: "x2", pergunta: "Segunda sintética?", opcoes: ["c", "a", "b"], ordem_opcoes: [2, 0, 1] },
    { id: "x1", pergunta: "Primeira sintética?", opcoes: ["b", "a"], ordem_opcoes: [1, 0] },
  ],
};

describe("QuestionarioPortal", () => {
  it("abre pelo servidor: antes da resposta só o 'Preparando', sem questão nenhuma", () => {
    const html = renderToStaticMarkup(
      <QuestionarioPortal
        item={item}
        aula={aula}
        token="t"
        fila={fila}
        tratarErro={semOperacao}
        onConcluida={semOperacao}
      />
    );
    expect(html).toContain("Questionário do módulo");
    expect(html).toContain("Preparando o questionário");
    expect(html).not.toContain("sintética");
    expect(sigo.functions.invoke).not.toHaveBeenCalled(); // o render estático não roda efeitos
  });

  it("as questões saem na ordem do servidor, sem gabarito para o aluno", () => {
    const html = renderToStaticMarkup(
      <QuestoesDoQuestionario prova={provaParaTela(aberta)} respostas={{}} onMarcar={semOperacao} />
    );
    expect(html.indexOf("Segunda sintética?")).toBeLessThan(html.indexOf("Primeira sintética?"));
    expect(html).toMatch(/A\) c<[\s\S]*B\) a<[\s\S]*C\) b</);
    expect(html).not.toContain("gabarito");
  });

  it("na prévia do RT marca o gabarito e mostra o comentário antes do envio", () => {
    const comGabarito = {
      ...aberta,
      questoes: aberta.questoes.map((q) => ({
        ...q,
        correta: 0,
        comentario: `Comentário de ${q.id}`,
      })),
    };
    const html = renderToStaticMarkup(
      <QuestoesDoQuestionario
        prova={provaParaTela(comGabarito, { previa: true })}
        respostas={{}}
        previa
        onMarcar={semOperacao}
      />
    );
    expect((html.match(/gabarito<\/span>/g) || []).length).toBe(2);
    expect(html).toContain("Comentário de x1");
  });

  it("depois do envio: a correção comentada de cada questão, acertando ou não (A2), e as alternativas travadas", () => {
    const resultado = {
      aprovada: false,
      nota: 50,
      acertos: 1,
      total: 2,
      nota_minima: 80,
      revisao: [
        { questao_id: "x1", acertou: true, resposta_correta: "a", comentario: "Por causa de A." },
        { questao_id: "x2", acertou: false, resposta_correta: "c", comentario: "Por causa de C." },
      ],
    };
    const html = renderToStaticMarkup(
      <QuestoesDoQuestionario
        prova={provaParaTela(aberta)}
        respostas={{ x1: 0, x2: 1 }}
        resultado={resultado}
        onMarcar={semOperacao}
      />
    );
    expect(html).toContain("Você acertou");
    expect(html).toContain("Resposta certa: c");
    expect(html).toContain("Por causa de A.");
    expect(html).toContain("Por causa de C.");
    expect((html.match(/<input[^>]*disabled=""/g) || []).length).toBe(5);
  });

  it("não aprovado: placar, quantos acertos faltam e 'Tentar de novo'", () => {
    const html = renderToStaticMarkup(
      <ResultadoDoQuestionario
        resultado={{ aprovada: false, nota: 75, acertos: 6, total: 8, nota_minima: 80 }}
        onTentarDeNovo={semOperacao}
      />
    );
    expect(html).toContain("Nota: 75% (6/8)");
    expect(html).toContain("acerte pelo menos 7 de 8");
    expect(html).toContain("Tentar de novo");
  });

  it("aprovado: placar e conclusão, sem 'Tentar de novo'", () => {
    const html = renderToStaticMarkup(
      <ResultadoDoQuestionario
        resultado={{ aprovada: true, nota: 88, acertos: 7, total: 8, nota_minima: 80 }}
        onTentarDeNovo={semOperacao}
      />
    );
    expect(html).toContain("Nota: 88% (7/8)");
    expect(html).toContain("Questionário concluído");
    expect(html).not.toContain("Tentar de novo");
  });

  it("aula concluída: a melhor nota e as tentativas, sem nova tentativa", () => {
    const html = renderToStaticMarkup(
      <SituacaoDoQuestionario
        estado={{ fase: "concluido", melhorNota: 88, tentativas: 2, notaMinima: 80 }}
        onTentar={semOperacao}
      />
    );
    expect(html).toContain(
      "Questionário concluído · melhor nota 88% · 2 tentativas · nota mínima 80%"
    );
    expect(html).not.toContain("Tentar de novo");
  });

  it("questionário vazio: a mensagem do servidor, sem 'Tentar de novo' (falta o RH agir)", () => {
    const html = renderToStaticMarkup(
      <SituacaoDoQuestionario
        estado={{
          fase: "erro",
          mensagem: "Este questionário ainda não tem questões — avise o RH",
          definitivo: true,
        }}
        onTentar={semOperacao}
      />
    );
    expect(html).toContain("ainda não tem questões");
    expect(html).not.toContain("Tentar de novo");
  });
});
