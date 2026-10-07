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

// O teste NUNCA carrega o cliente de produção.
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

// O Dialog do Radix usa portal (precisa de `document`): aqui ele só entrega o conteúdo quando está aberto.
vi.mock("@/components/ui/dialog", () => {
  const Passa = ({ children }) => <div>{children}</div>;
  return {
    Dialog: ({ open, children }) => (open ? <div>{children}</div> : null),
    DialogContent: Passa,
    DialogHeader: Passa,
    DialogFooter: Passa,
    DialogTitle: Passa,
    DialogDescription: Passa,
  };
});

import DeclaracaoTextoDialog from "./DeclaracaoTextoDialog";
import { TEXTO_PADRAO_DA_DECLARACAO, declaracaoVigente } from "@/lib/ead-declaracao-ambiente";

/**
 * Janela do RT para o texto da declaração (T35): o texto padrão pendente de aprovação, a versão em vigor, a ART, a
 * prévia "Como o aluno vê" e o botão de salvar. `renderToStaticMarkup` não roda efeitos nem cliques: confere o que
 * o RT LÊ no começo; as regras de validar e de "nada mudou" estão em lib/ead-declaracao-ambiente.test.js.
 */
const semOperacao = () => {};
const desenhar = (vigente, extra = {}) =>
  renderToStaticMarkup(
    <DeclaracaoTextoDialog
      aberto
      vigente={vigente}
      onFechar={semOperacao}
      onSalvar={async () => true}
      {...extra}
    />
  );
const botaoDeSalvar = (html) => /<button[^>]*type="submit"([^>]*)>/.exec(html);

describe("DeclaracaoTextoDialog", () => {
  it("sem versão salva: mostra o texto padrão como pendente de aprovação do RT e oferece aprovar", () => {
    const html = desenhar(declaracaoVigente([]));
    expect(html).toContain("pendente de aprovação do responsável técnico");
    expect(html).toContain("vira a versão 1");
    expect(html).toContain("Aprovar e salvar como versão 1");
    // o texto padrão está no campo, para o RT editar
    expect(html).toContain("Antes de começar, leia com atenção.");
    expect(TEXTO_PADRAO_DA_DECLARACAO).toContain("Antes de começar, leia com atenção.");
  });

  it("aprovar o padrão como está já vale: o botão não fica parado por 'nada mudou'", () => {
    const html = desenhar(declaracaoVigente([]));
    const botao = botaoDeSalvar(html);
    expect(botao).not.toBeNull();
    expect(botao[1]).not.toMatch(/\sdisabled=""/);
  });

  it("com versão em vigor: não fala em pendente, oferece a versão seguinte e a ART vem preenchida", () => {
    const vigente = declaracaoVigente([
      { versao: 2, texto: "Texto aprovado pelo RT, com mais de vinte caracteres.", art: "ART 77" },
    ]);
    const html = desenhar(vigente);
    expect(html).not.toContain("pendente de aprovação");
    expect(html).toContain("Salvar como versão 3");
    expect(html).toContain("Texto aprovado pelo RT, com mais de vinte caracteres.");
    expect(html).toContain('value="ART 77"');
    // sem mudar nada, o botão fica parado (não cria versão repetida)
    expect(botaoDeSalvar(html)[1]).toMatch(/\sdisabled=""/);
  });

  it("mostra 'Como o aluno vê' com a mesma tela do aluno, sem gravar nada", () => {
    const html = desenhar(declaracaoVigente([]));
    expect(html).toContain("Como o aluno vê");
    expect(html).toContain("Eu declaro que:");
    expect(html).toContain("não grava nada");
    expect((html.match(/type="checkbox"/g) || []).length).toBe(3);
  });

  it("os limites do texto e da ART aparecem para o RT", () => {
    const html = desenhar(declaracaoVigente([]));
    expect(html).toContain("4000");
    expect(html).toContain('maxLength="120"');
    expect(html).toContain("Aparece para o aluno logo abaixo do texto.");
  });

  it("fechada, não desenha nada", () => {
    expect(desenhar(declaracaoVigente([]), { aberto: false })).toBe("");
  });
});
