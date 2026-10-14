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
import CasoPortal, { CasoNaTela } from "./CasoPortal";
import { casoParaTela, telaConcluida, telaDepoisDaEscolha } from "@/lib/portal-caso";

const semOperacao = () => {};
const fila = (tarefa) => tarefa();
const desenhar = (tela, extra = {}) =>
  renderToStaticMarkup(
    <CasoNaTela
      tela={tela}
      onEscolher={semOperacao}
      onContinuar={semOperacao}
      onConcluir={semOperacao}
      onTentar={semOperacao}
      {...extra}
    />
  );

// dados sintéticos (nenhum texto do material do curso)
const aberto = {
  situacao: "etapa",
  contexto: "Contexto sintético do caso",
  etapa: {
    id: "e1",
    pergunta: "Qual a decisão?",
    opcoes: [
      { indice: 1, texto: "Opção B" },
      { indice: 0, texto: "Opção A" },
    ],
  },
  passagem: 1,
  ultimo: null,
};
const etapa = casoParaTela(aberto);
const proxima = {
  id: "e2",
  pergunta: "E agora?",
  opcoes: [
    { indice: 0, texto: "X" },
    { indice: 1, texto: "Y" },
  ],
};

describe("CasoPortal", () => {
  it("abre pelo servidor: antes da resposta só o 'Abrindo o caso...'", () => {
    const html = renderToStaticMarkup(
      <CasoPortal
        item={{ matricula: { id: "m1" } }}
        aula={{ id: "ac", tipo: "caso", titulo: "Caso" }}
        token="t"
        fila={fila}
        tratarErro={semOperacao}
        onConcluida={semOperacao}
      />
    );
    expect(html).toContain("Estudo de caso");
    expect(html).toContain("Abrindo o caso...");
    expect(sigo.functions.invoke).not.toHaveBeenCalled(); // o render estático não roda efeitos
  });

  it("etapa: contexto, pergunta e as opções como botões, só com o texto, na ordem do servidor", () => {
    const html = desenhar(etapa);
    expect(html).toContain("Contexto sintético do caso");
    expect(html).toContain("Qual a decisão?");
    expect(html.indexOf("Opção B")).toBeLessThan(html.indexOf("Opção A"));
    expect((html.match(/<button/g) || []).length).toBe(2);
    expect(html).not.toMatch(/segura|insegura/i);
  });

  it("clique único: com uma chamada em andamento, nenhuma opção aceita outro clique", () => {
    const livres = desenhar(etapa);
    expect((livres.match(/disabled=""/g) || []).length).toBe(0);
    const ocupadas = desenhar(etapa, { enviando: true });
    expect((ocupadas.match(/<button[^>]*disabled=""/g) || []).length).toBe(2);
  });

  it("de volta à etapa (recarregou a página): o comentário da última escolha e o aviso da passagem", () => {
    const html = desenhar(
      casoParaTela({
        ...aberto,
        passagem: 2,
        ultimo: { comentario: "Volte e reveja.", segura: false },
      })
    );
    expect(html).toContain("Volte e reveja.");
    expect(html).toContain("Escolha insegura");
    expect(html).toContain("Você já passou por esta etapa");
  });

  it("escolha segura: comentário em verde, a escolha feita e 'Continuar' (a próxima pergunta só depois)", () => {
    const tela = telaDepoisDaEscolha(
      etapa,
      {
        comentario: "Muito bem: é o caminho seguro.",
        segura: true,
        fim: false,
        passagem: 1,
        etapa: proxima,
        reflexao: null,
      },
      0
    );
    const html = desenhar(tela);
    expect(html).toContain("Sua escolha: Opção A");
    expect(html).toContain("Escolha segura");
    expect(html).toContain("Muito bem: é o caminho seguro.");
    expect(html).toContain("border-emerald-200");
    expect(html).toContain("Continuar");
    expect(html).not.toContain("E agora?");
  });

  it("escolha insegura: comentário em âmbar", () => {
    const tela = telaDepoisDaEscolha(
      etapa,
      {
        comentario: "Arriscado.",
        segura: false,
        fim: false,
        passagem: 1,
        etapa: aberto.etapa,
        reflexao: null,
      },
      1
    );
    const html = desenhar(tela);
    expect(html).toContain("Escolha insegura");
    expect(html).toContain("border-amber-200");
    expect(html).toContain("Arriscado.");
  });

  it("fim: 'Para refletir' com a reflexão e só o botão 'Concluir caso'", () => {
    const fim = telaDepoisDaEscolha(
      etapa,
      {
        comentario: "Fim seguro.",
        segura: true,
        fim: true,
        passagem: 1,
        etapa: null,
        reflexao: "Reflexão sintética",
      },
      0
    ).seguinte;
    const html = desenhar(fim);
    expect(html).toContain("Para refletir");
    expect(html).toContain("Reflexão sintética");
    expect(html).toContain("Concluir caso");
    expect((html.match(/<button/g) || []).length).toBe(1);
    expect(html).not.toContain('disabled=""');
    // clique único: enquanto a conclusão está em andamento o botão não aceita outro clique
    expect(desenhar(fim, { enviando: true })).toMatch(/<button[^>]*disabled=""/);
  });

  it("concluído: a reflexão para rever, sem botão nenhum", () => {
    const html = desenhar(
      telaConcluida({
        fase: "fim",
        contexto: "Contexto sintético do caso",
        reflexao: "Reflexão sintética",
      })
    );
    expect(html).toContain("Caso concluído.");
    expect(html).toContain("Reflexão sintética");
    expect(html).not.toContain("<button");
  });

  it("caso com problema: a mensagem do servidor, sem 'Tentar de novo'", () => {
    const html = desenhar({
      fase: "erro",
      mensagem: "Este caso está com problema — avise o RH",
      definitivo: true,
    });
    expect(html).toContain("Este caso está com problema — avise o RH");
    expect(html).not.toContain("Tentar de novo");
  });
});
