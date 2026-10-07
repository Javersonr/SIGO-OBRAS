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

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  AtivarAcessoPortal,
  EscolherEmpresaPortal,
  LoginPortal,
  TrocarSenhaPortal,
} from "./LoginPortal";

const fonte = readFileSync(fileURLToPath(new URL("LoginPortal.jsx", import.meta.url)), "utf8");

/**
 * Primeira tela do login, da ativação pela provisória e da troca de senha (T27, T38), só com dados sintéticos. `renderToStaticMarkup` não
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

const botaoDeEnviar = (html) => html.match(/<button[^>]*type="submit"[^>]*>/)?.[0] ?? "";

describe("AtivarAcessoPortal: entrou com a senha provisória (T38)", () => {
  const props = {
    tokenAtivacao: "ta",
    empresaNome: "Empresa Teste",
    onEntrar: () => {},
    onVoltar: () => {},
  };

  it("a MESMA tela para todos: 'Crie sua senha pessoal' com o link 'Já uso o portal em outra empresa'", () => {
    const html = tela(<AtivarAcessoPortal {...props} usuario="11122233344" />);
    expect(html).toContain("Crie sua senha pessoal");
    expect(html).toContain("Já uso o portal em outra empresa");
    expect(html).toContain("Empresa Teste");
    // o aviso fixo, igual para todos (a tela não sabe se a pessoa já tem senha)
    expect(html).toContain(
      "A senha nova vale em todas as empresas. Se você já usa o portal em outra empresa, o RH dela vai precisar"
    );
    // criar a senha não pede a senha atual
    expect(campo(html, "senha-atual")).toBe("");
  });

  it("mostra as regras da senha antes de enviar, sem repetir só o 'mínimo 6'", () => {
    const html = tela(<AtivarAcessoPortal {...props} usuario="11122233344" />);
    expect(html).toContain("Pelo menos 6 caracteres");
    expect(html).toContain("Diferente do seu CPF ou usuário");
    expect(html).toContain("senha fácil");
    expect(html).not.toContain("mínimo 6 caracteres");
  });

  it("não corta a senha colada em silêncio: sem maxLength, com o aviso do limite de 72 (T27, m4)", () => {
    const html = tela(<AtivarAcessoPortal {...props} usuario="" />);
    expect(campo(html, "senha-nova")).not.toContain("maxLength");
    expect(campo(html, "senha-confirma")).not.toContain("maxLength");
    expect(fonte).toContain("avisoDeSenhaLonga(nova)");
    expect(fonte).toContain("avisoDeSenhaLonga(confirma)");
    expect(html).not.toContain("o máximo é 72");
  });

  it("usuário desconhecido (tela recarregada): a regra do CPF diz que o servidor confere ao salvar (T27, M1)", () => {
    const recarregada = tela(<AtivarAcessoPortal {...props} usuario="" />);
    expect(recarregada).toContain("Diferente do seu CPF ou usuário (o servidor confere ao salvar)");
    expect(recarregada).toContain('aria-label="Conferida ao salvar"');
    expect(recarregada).not.toContain('aria-label="Cumprida"');
  });

  it("o botão começa desligado (nada digitado)", () => {
    expect(botaoDeEnviar(tela(<AtivarAcessoPortal {...props} usuario="" />))).toContain("disabled");
  });

  it("a troca obrigatória e o 'Já uso' usam os textos do spec (lib/portal-login.js)", () => {
    expect(fonte).toContain("TEXTOS_DO_LOGIN.trocaObrigatoria");
    expect(fonte).toContain("TEXTOS_DO_LOGIN.digiteASenhaQueUsa");
    // o erro RESET_NEGADO destaca o link; o token vencido volta ao login
    expect(fonte).toContain("reacaoAoErroDaAtivacao(err)");
  });
});

describe("EscolherEmpresaPortal: duas ou mais empresas liberadas (T38)", () => {
  it("pergunta em qual empresa entrar, com um botão por empresa", () => {
    const html = tela(
      <EscolherEmpresaPortal
        tokenEscolha="te"
        empresas={[
          { id: "f-a", nome: "Empresa A", logo_url: null },
          { id: "f-b", nome: "Empresa B", logo_url: "https://exemplo.test/logo.png" },
        ]}
        onEntrar={() => {}}
        onVoltar={() => {}}
      />
    );
    expect(html).toContain("Em qual empresa você quer entrar?");
    expect(html).toContain("Empresa A");
    expect(html).toContain("Empresa B");
    expect(html).toContain('src="https://exemplo.test/logo.png"');
  });
});

describe("TrocarSenhaPortal: troca voluntária (T38: sempre com a senha atual)", () => {
  const props = { token: "t", nome: "Fulano de Tal", onConcluir: () => {}, onCancelar: () => {} };

  it("pede a senha atual e avisa que a nova vale em todas as empresas", () => {
    const html = tela(<TrocarSenhaPortal {...props} usuario="" />);
    expect(campo(html, "senha-atual")).not.toBe("");
    expect(html).toContain("Senha atual");
    expect(html).toContain("A senha nova vale em todas as empresas em que você usa o portal.");
  });

  it("mostra as regras e começa com o botão desligado", () => {
    const html = tela(<TrocarSenhaPortal {...props} usuario="11122233344" />);
    expect(html).toContain("Pelo menos 6 caracteres");
    expect(botaoDeEnviar(html)).toContain("disabled");
  });

  it("manda sempre a senha atual (o primeiro acesso não passa mais por aqui)", () => {
    expect(fonte).toContain(
      'chamarPortal("trocar_senha", { nova_senha: nova, senha_atual: atual }, token)'
    );
    expect(fonte).not.toContain("obrigatoria ? undefined : atual");
  });
});
