import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// `lib/utils.js` (usado pelos componentes da ui) lê `window` ao carregar; o ambiente de teste não tem DOM.
vi.hoisted(() => {
  const janela = {};
  janela.self = janela;
  janela.top = janela;
  globalThis.window = janela;
});

import QuestoesEad from "./QuestoesEad";

/**
 * Lista e editor de questões da aba Treinamentos (prova final e questionários dos módulos). `renderToStaticMarkup`
 * não roda cliques: confere o que o RH vê; a regra do gabarito está em lib/ead-questao.test.js.
 */
const QUESTOES = [
  {
    id: "q1",
    pergunta: "Primeira pergunta?",
    opcoes: ["Certa", "Errada"],
    correta: 0,
    comentario: "Porque sim.",
  },
  { id: "q2", pergunta: "Segunda pergunta?", opcoes: ["X", "Y", "Z"], correta: 2 },
];
const semOperacao = () => {};
const desenhar = (extra = {}) =>
  renderToStaticMarkup(
    <QuestoesEad
      questoes={QUESTOES}
      onRascunho={semOperacao}
      onSalvar={semOperacao}
      onExcluir={semOperacao}
      {...extra}
    />
  );

describe("QuestoesEad", () => {
  it("lista as questões com a correta marcada por texto (não só pela cor) e o comentário", () => {
    const html = desenhar();
    expect(html).toContain("1. Primeira pergunta?");
    expect(html).toContain("2. Segunda pergunta?");
    expect(html).toContain("(correta)");
    expect(html).toContain("Porque sim.");
  });

  it("sem Editar: nem botões de editar e excluir, nem o editor", () => {
    const html = desenhar({ rascunho: { pergunta: "", opcoes: ["", ""], correta: 0 } });
    expect(html).not.toContain("Editar a questão");
    expect(html).not.toContain("Salvar questão");
  });

  it("com Editar: botões por questão e o editor do rascunho, com o grupo de rádio próprio", () => {
    const html = desenhar({
      podeEditar: true,
      grupo: "correta-aq1",
      dicaDoComentario: "Comentário (o aluno vê na correção)",
      rascunho: { pergunta: "Nova?", opcoes: ["a", "b", "c"], correta: 1, comentario: "" },
    });
    expect(html).toContain('aria-label="Editar a questão 1"');
    expect(html).toContain('aria-label="Excluir a questão 2"');
    expect(html).toContain('name="correta-aq1"');
    expect(html).toContain('placeholder="Comentário (o aluno vê na correção)"');
    expect(html).toContain("Salvar questão");
  });

  it("lista vazia mostra o aviso; nada de emoji", () => {
    const vazia = renderToStaticMarkup(
      <QuestoesEad
        questoes={[]}
        vazio="Nenhuma questão ainda."
        onRascunho={semOperacao}
        onSalvar={semOperacao}
        onExcluir={semOperacao}
      />
    );
    expect(vazia).toContain("Nenhuma questão ainda.");
    expect(desenhar({ podeEditar: true })).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
