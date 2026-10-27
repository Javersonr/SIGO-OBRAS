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

// Select e Switch do Radix trocados por caixas simples: o teste confere o valor e as opções desenhadas.
vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value }) => <div data-valor={value}>{children}</div>,
  SelectTrigger: ({ children }) => <div>{children}</div>,
  SelectValue: () => null,
  SelectContent: ({ children }) => <div>{children}</div>,
  SelectItem: ({ children, value, disabled }) => (
    <span data-opcao={value} data-desabilitada={disabled ? "sim" : "nao"}>
      {children}
    </span>
  ),
}));
vi.mock("@/components/ui/switch", () => ({
  Switch: ({ checked, disabled }) => (
    <input type="checkbox" readOnly checked={!!checked} disabled={disabled} />
  ),
}));

import CasoEditor from "./CasoEditor";

/**
 * Editor do caso com decisões (atividades interativas). `renderToStaticMarkup` não roda cliques: confere o que o
 * RH vê; as operações de edição estão em lib/ead-caso-edicao.test.js e a validade em lib/ead-caso.test.js.
 */
const opcao = (texto, segura, proxima) => ({
  texto,
  comentario: `Comentário: ${texto}`,
  segura,
  proxima,
});
const VALIDO = {
  contexto: "Contexto sintético.",
  etapas: [
    {
      id: "e1",
      pergunta: "Primeira?",
      opcoes: [opcao("Bloquear", true, "e2"), opcao("Seguir", false, "r1")],
    },
    {
      id: "r1",
      pergunta: "Recuperar?",
      opcoes: [opcao("Voltar", true, "e1"), opcao("Insistir", false, "r1")],
    },
    {
      id: "e2",
      pergunta: "Segunda?",
      opcoes: [opcao("Medir", true, null), opcao("Pular", false, "e2")],
    },
  ],
  reflexao: "Reflexão sintética.",
};
const desenhar = (valor, extra = {}) =>
  renderToStaticMarkup(<CasoEditor valor={valor} onChange={() => {}} {...extra} />);

describe("CasoEditor", () => {
  it("roteiro válido: contexto, etapas, opções, destinos e 'Roteiro sem problemas'", () => {
    const html = desenhar(VALIDO);
    expect(html).toContain("Contexto sintético.");
    expect(html).toContain("Começo do caso");
    expect(html).toContain("Primeira?");
    expect(html).toContain('data-valor="r1"');
    expect(html).toContain('data-valor="__fim__"');
    expect(html).toContain("Reflexão sintética.");
    expect(html).toContain("Roteiro sem problemas");
  });

  it("roteiro com problema: a lista de validarCaso aparece e não diz 'sem problemas'", () => {
    const umaOpcao = {
      ...VALIDO,
      etapas: [{ ...VALIDO.etapas[0], opcoes: [opcao("Só uma", true, null)] }],
    };
    const html = desenhar(umaOpcao);
    expect(html).toMatch(/problemas? impede/);
    expect(html).not.toContain("Roteiro sem problemas");
  });

  it("'Fim do caso' fica desabilitado para a opção insegura", () => {
    const html = desenhar(VALIDO);
    expect(html.match(/data-opcao="__fim__" data-desabilitada="sim"/g)).toHaveLength(3);
    expect(html.match(/data-opcao="__fim__" data-desabilitada="nao"/g)).toHaveLength(3);
  });

  it("desabilitado (sem Editar ou gravando): nenhum campo editável", () => {
    const html = desenhar(VALIDO, { desabilitado: true });
    expect(html).not.toMatch(/<textarea(?![^>]*disabled)/);
    expect(html).not.toMatch(/<input(?![^>]*disabled)/);
    expect(html).not.toMatch(/<button(?![^>]*disabled)/);
  });
});
