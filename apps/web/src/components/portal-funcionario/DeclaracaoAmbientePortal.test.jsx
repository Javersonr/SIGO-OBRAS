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

// O teste NUNCA carrega o cliente de produção: qualquer chamada ao backend falha.
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

import DeclaracaoAmbientePortal, { DeclaracaoAmbienteConteudo } from "./DeclaracaoAmbientePortal";
import { ITENS_DA_DECLARACAO } from "@/lib/ead-declaracao-ambiente";

/**
 * Tela da declaração de ambiente e horário (T35). `renderToStaticMarkup` não roda efeitos nem cliques: confere o
 * que o aluno LÊ e o estado do botão. O que o servidor faz com o pedido é conferido em declaracao-ambiente.test.ts, e
 * a regra de quando a tela aparece e o que ela envia, em lib/portal-declaracao.test.js.
 */
const declaracao = {
  versao: 2,
  texto: "Escolha um lugar silencioso.\nReserve este horário só para o curso.",
  art: null,
  itens: [],
};
const marcarTudo = Object.fromEntries(ITENS_DA_DECLARACAO.map((i) => [i.id, true]));
const nenhum = Object.fromEntries(ITENS_DA_DECLARACAO.map((i) => [i.id, false]));
const semOperacao = () => {};

// atenção: "disabled:" aparece nas classes do botão; o que vale é o atributo
const botaoParado = (html) => /<button[^>]*\sdisabled=""/.test(html);

const conteudo = (extra = {}) =>
  renderToStaticMarkup(
    <DeclaracaoAmbienteConteudo
      declaracao={declaracao}
      marcados={nenhum}
      onMarcar={semOperacao}
      onConfirmar={semOperacao}
      {...extra}
    />
  );

describe("DeclaracaoAmbienteConteudo", () => {
  it("mostra o texto do RT, os três itens e o botão parado até marcar os três", () => {
    const html = conteudo();
    expect(html).toContain("Escolha um lugar silencioso.");
    expect(html).toContain("Reserve este horário só para o curso.");
    for (const i of ITENS_DA_DECLARACAO) expect(html).toContain(i.rotulo);
    expect((html.match(/type="checkbox"/g) || []).length).toBe(3);
    // botão desabilitado e a contagem do que falta
    expect(botaoParado(html)).toBe(true);
    expect(html).toContain("Declarar e abrir o curso");
    expect(html).toContain("Faltam marcar 3 itens para abrir o curso.");
  });

  it("com um item faltando fala no singular; com os três, libera o botão e some o aviso", () => {
    const faltaUm = conteudo({ marcados: { ...marcarTudo, local_adequado: false } });
    expect(faltaUm).toContain("Falta marcar 1 item para abrir o curso.");
    expect(botaoParado(faltaUm)).toBe(true);

    const completo = conteudo({ marcados: marcarTudo });
    expect(completo).not.toContain("para abrir o curso.");
    expect((completo.match(/checked=""/g) || []).length).toBe(3);
    expect(botaoParado(completo)).toBe(false);
  });

  it("enquanto envia, o botão fica parado e os itens também (nada de duplo clique)", () => {
    const html = conteudo({ marcados: marcarTudo, enviando: true });
    expect(botaoParado(html)).toBe(true);
    expect((html.match(/<input[^>]*\sdisabled=""/g) || []).length).toBe(3);
  });

  it("a ART só aparece quando o RT preencheu, junto do texto", () => {
    expect(conteudo()).not.toContain("ART do responsável técnico");
    const comArt = conteudo({ declaracao: { ...declaracao, art: "ART 12345-6" } });
    expect(comArt).toContain("ART do responsável técnico");
    expect(comArt).toContain("ART 12345-6");
  });

  it("na prévia do RT o botão nunca libera, nem com os três marcados, e o aviso diz que nada é gravado", () => {
    const html = conteudo({ marcados: marcarTudo, previa: true });
    expect(botaoParado(html)).toBe(true);
    expect(html).toContain("não grava nada");
  });

  it("o texto do RT é texto, nunca HTML (a tela do aluno não executa marcação)", () => {
    const html = conteudo({
      declaracao: { ...declaracao, texto: "<script>alert(1)</script> olá", art: "<b>x</b>" },
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<b>x</b>");
  });
});

describe("DeclaracaoAmbientePortal (a tela inteira)", () => {
  const item = {
    matricula: { id: "m1", status: "em_andamento" },
    curso: { nome: "Curso de teste" },
  };
  const tela = (extra = {}) =>
    renderToStaticMarkup(
      <DeclaracaoAmbientePortal
        item={item}
        declaracao={declaracao}
        token="token"
        recarregar={async () => ({})}
        onDeclarada={semOperacao}
        onVoltar={semOperacao}
        onErroSessao={semOperacao}
        {...extra}
      />
    );

  it("mostra o curso, a explicação do porquê e o caminho de volta", () => {
    const html = tela();
    expect(html).toContain("Curso de teste");
    expect(html).toContain("Ambiente e horário de estudo");
    expect(html).toContain("fica registrada, com a data e a hora");
    expect(html).toContain("Voltar aos meus treinamentos");
    // começa tudo desmarcado: nenhum item vem marcado por padrão
    expect(html).not.toContain('checked=""');
  });

  it("sem o texto (a busca dos dados falhou) o aluno lê o problema e tem 'Tentar de novo', sem itens para marcar", () => {
    const html = tela({ declaracao: null });
    expect(html).toContain("Não foi possível carregar a declaração agora");
    expect(html).toContain("Tentar de novo");
    expect(html).not.toContain('type="checkbox"');
  });
});
