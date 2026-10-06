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

// O teste NUNCA carrega o cliente de produção: `api.js` importa o sigoClient, que criaria o cliente do
// Supabase com o `.env.local` da máquina. Qualquer chamada ao backend falha o teste.
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

import { EntregasPendentes, HistoricoDeEntregas } from "./CienciasPortal";

/**
 * Entregas que pedem ciência e histórico das já confirmadas (T36), só com dados sintéticos. As datas
 * ficam ao meio-dia UTC para o dia não mudar com o fuso do computador que roda o teste.
 */
const tela = (el) => renderToStaticMarkup(el);
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{25A0}-\u{27BF}\u{FE0F}]/u;

const pendente = {
  id: "p1",
  tipo: "EPI",
  descricao: "Kit de EPI do mês",
  itens: [{ quantidade: 2, descricao: "Luva", codigo: "L-1", ca: "12345" }],
  status: "pendente",
  created_at: "2026-09-30T12:00:00Z",
  confirmada_em: null,
};
const confirmada = (id, extra = {}) => ({
  id,
  tipo: "Ferramenta",
  descricao: `Entrega ${id}`,
  itens: [],
  status: "confirmada",
  created_at: "2026-09-01T12:00:00Z",
  confirmada_em: "2026-09-10T12:00:00Z",
  ...extra,
});

describe("EntregasPendentes", () => {
  it("sem pendentes não desenha nada", () => {
    expect(tela(<EntregasPendentes pendentes={[]} onConfirmar={() => {}} />)).toBe("");
  });

  it("mostra a entrega, os itens e o botão de ciência, sem emoji", () => {
    const html = tela(<EntregasPendentes pendentes={[pendente]} onConfirmar={() => {}} />);
    expect(html).toContain("Você tem entregas aguardando sua ciência:");
    expect(html).toContain("Kit de EPI do mês");
    expect(html).toContain("2× Luva (L-1) · CA 12345");
    expect(html).toContain("Confirmo o recebimento (dou ciência)");
    expect(html).toContain("Lei 14.063/2020");
    expect(html).not.toMatch(EMOJI);
  });
});

describe("HistoricoDeEntregas", () => {
  it("sem confirmadas não desenha nada (nem o título)", () => {
    expect(tela(<HistoricoDeEntregas confirmadas={[]} />)).toBe("");
  });

  it("lista as confirmadas num bloco recolhido, com a data e a hora da confirmação", () => {
    const html = tela(
      <HistoricoDeEntregas
        confirmadas={[
          confirmada("a", { itens: [{ quantidade: 1, nome: "Furadeira" }] }),
          confirmada("b", { confirmada_em: "2026-08-03T12:00:00Z" }),
        ]}
      />
    );
    expect(html).toContain("<details");
    expect(html).not.toMatch(/<details[^>]*\sopen/);
    expect(html).toContain("Entregas confirmadas (2)");
    expect(html).toContain("Entrega a");
    expect(html).toContain("1× Furadeira");
    expect(html).toContain("Ferramenta");
    expect(html).toContain("Confirmada em 10/09/2026");
    expect(html).toContain("Confirmada em 03/08/2026");
    expect(html).not.toMatch(EMOJI);
  });

  it("é só leitura: não tem botão de ciência", () => {
    const html = tela(<HistoricoDeEntregas confirmadas={[confirmada("a")]} />);
    expect(html).not.toContain("<button");
    expect(html).not.toContain("Confirmo o recebimento");
  });

  it("confirmada sem data de confirmação (dado antigo) aparece sem inventar a data", () => {
    const html = tela(
      <HistoricoDeEntregas confirmadas={[confirmada("a", { confirmada_em: null })]} />
    );
    expect(html).toContain("Entrega a");
    expect(html).toContain("Confirmada");
    expect(html).not.toContain("Confirmada em");
  });
});
