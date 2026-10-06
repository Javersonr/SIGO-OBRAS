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

import { LoginPortal, TrocarSenhaPortal } from "./LoginPortal";

/**
 * Primeira tela do login e da troca de senha (T27), só com dados sintéticos. `renderToStaticMarkup` não
 * roda efeitos nem eventos: o que depende de digitar (botão habilitado, regras cumpridas) está em
 * lib/portal-senha.test.js, e o limite de tentativas, em portal-funcionario/regras.test.ts.
 */
const tela = (el) => renderToStaticMarkup(el);
const campo = (html, id) => html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))?.[0] ?? "";

describe("LoginPortal", () => {
  const html = tela(<LoginPortal aviso="" onEntrar={() => {}} />);

  it("o campo de usuário aceita letras no celular (teclado de texto, sem teclado só numérico)", () => {
    const usuario = campo(html, "usuario");
    expect(usuario).toContain('inputMode="text"');
    expect(usuario).not.toContain("numeric");
    // usuário é minúsculo e não é palavra do dicionário: nada de maiúscula/autocorreção do teclado
    expect(usuario).toContain('autoCapitalize="none"');
    expect(usuario).toContain('autoCorrect="off"');
  });

  it("diz que vale o CPF ou o usuário que o RH passou", () => {
    expect(html).toContain("CPF ou usuário");
    expect(html).not.toContain("(seu CPF)");
  });
});

describe("TrocarSenhaPortal", () => {
  const props = { token: "t", nome: "Fulano de Tal", onConcluir: () => {}, onCancelar: () => {} };

  it("mostra as regras da senha antes de enviar, sem repetir só o 'mínimo 6'", () => {
    const html = tela(<TrocarSenhaPortal {...props} obrigatoria usuario="11122233344" />);
    expect(html).toContain("Pelo menos 6 caracteres");
    expect(html).toContain("Diferente do seu CPF ou usuário");
    expect(html).toContain("senha fácil");
    expect(html).not.toContain("mínimo 6 caracteres");
  });

  it("limita o tamanho da senha ao que o servidor aceita", () => {
    const html = tela(<TrocarSenhaPortal {...props} obrigatoria usuario="" />);
    expect(campo(html, "senha-nova")).toContain('maxLength="72"');
    expect(campo(html, "senha-confirma")).toContain('maxLength="72"');
  });

  it("1º acesso não pede a senha atual; a troca voluntária pede", () => {
    const primeiro = tela(<TrocarSenhaPortal {...props} obrigatoria usuario="" />);
    expect(campo(primeiro, "senha-atual")).toBe("");
    const voluntaria = tela(<TrocarSenhaPortal {...props} obrigatoria={false} usuario="" />);
    expect(campo(voluntaria, "senha-atual")).not.toBe("");
    expect(voluntaria).toContain("Senha atual");
  });

  it("o botão começa desligado nas duas trocas (nada digitado)", () => {
    for (const obrigatoria of [true, false]) {
      const html = tela(<TrocarSenhaPortal {...props} obrigatoria={obrigatoria} usuario="" />);
      const botao = html.match(/<button[^>]*type="submit"[^>]*>/)?.[0] ?? "";
      expect(botao).toContain("disabled");
    }
  });
});
