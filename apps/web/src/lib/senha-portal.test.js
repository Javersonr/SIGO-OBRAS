import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import {
  FUNCAO_FORNECEDOR_ACESSO,
  MENSAGEM_FALHA_SERVIDOR,
  credenciaisDaCotacao,
  credencialParaEnvio,
  linksDaCotacao,
  reemitirLinkCotacao,
  rotacionarCredencialFornecedor,
} from "./senha-portal";

// sigo de mentira: só o invoke (o sigoClient devolve { data } e nunca lança)
const invoke = vi.fn();
const sigo = { functions: { invoke } };

const LINK = "https://www.sigoobras.com.br/AcessoFornecedor?token=" + "a".repeat(43);

beforeEach(() => invoke.mockReset());

describe("a função do servidor", () => {
  it("é a fornecedor-acesso, registrada no sigoClient", () => {
    expect(FUNCAO_FORNECEDOR_ACESSO).toBe("fornecedorAcesso");
    const cliente = readFileSync(new URL("../api/sigoClient.js", import.meta.url), "utf8");
    expect(cliente).toMatch(/fornecedorAcesso:\s*"fornecedor-acesso"/);
  });

  it("a lib não gera senha nem grava na tabela (quem faz é o servidor)", () => {
    const fonte = readFileSync(new URL("./senha-portal.js", import.meta.url), "utf8");
    expect(fonte).not.toMatch(/getRandomValues|subtle\.digest|FornecedorAcesso/);
  });
});

describe("rotacionarCredencialFornecedor", () => {
  it("pede a credencial ao servidor com o fornecedor e devolve { email, senha }", async () => {
    invoke.mockResolvedValueOnce({
      data: { success: true, credencial: { email: "forn@exemplo.test", senha: "Senha123abcd" } },
    });
    const cred = await rotacionarCredencialFornecedor(sigo, {
      empresaId: "ignorado",
      fornecedorId: "forn-1",
      fornecedorEmail: "nao-vai@exemplo.test",
    });
    expect(invoke).toHaveBeenCalledWith("fornecedorAcesso", {
      acao: "credencial",
      fornecedor_id: "forn-1",
    });
    expect(cred).toEqual({ email: "forn@exemplo.test", senha: "Senha123abcd" });
  });

  it("fornecedor sem acesso e sem e-mail no cadastro: null (mensagem sem login)", async () => {
    invoke.mockResolvedValueOnce({
      data: { success: true, credencial: null, motivo: "SEM_EMAIL" },
    });
    expect(await rotacionarCredencialFornecedor(sigo, { fornecedorId: "forn-1" })).toBeNull();
  });

  it("falha do servidor vira erro com a mensagem dele", async () => {
    invoke.mockResolvedValueOnce({
      data: {
        success: false,
        error: "Sem permissão: o acesso do fornecedor ao portal é da aba...",
      },
    });
    await expect(rotacionarCredencialFornecedor(sigo, { fornecedorId: "forn-1" })).rejects.toThrow(
      /Sem permissão/
    );
  });

  it("resposta vazia ou sem mensagem vira o aviso genérico", async () => {
    invoke.mockResolvedValueOnce({ data: undefined });
    await expect(rotacionarCredencialFornecedor(sigo, { fornecedorId: "x" })).rejects.toThrow(
      MENSAGEM_FALHA_SERVIDOR
    );
    invoke.mockResolvedValueOnce({ data: { success: false } });
    await expect(rotacionarCredencialFornecedor(sigo, { fornecedorId: "x" })).rejects.toThrow(
      MENSAGEM_FALHA_SERVIDOR
    );
  });
});

describe("credenciaisDaCotacao", () => {
  it("só quem tem acesso ATIVO, sempre com senha null", async () => {
    invoke.mockResolvedValueOnce({
      data: {
        success: true,
        acessos: [
          { fornecedor_id: "f1", email: "f1@exemplo.test", tem_acesso: true, ativo: true },
          { fornecedor_id: "f2", email: "f2@exemplo.test", tem_acesso: true, ativo: false },
          { fornecedor_id: "f3", email: null, tem_acesso: false, ativo: false },
        ],
      },
    });
    const creds = await credenciaisDaCotacao(sigo, "cot-1");
    expect(invoke).toHaveBeenCalledWith("fornecedorAcesso", {
      acao: "status",
      cotacao_id: "cot-1",
    });
    expect(creds).toEqual({ f1: { email: "f1@exemplo.test", senha: null } });
  });

  it("erro do servidor lança (a tela mostra o aviso)", async () => {
    invoke.mockResolvedValueOnce({ data: { success: false, error: "Cotação não encontrada" } });
    await expect(credenciaisDaCotacao(sigo, "cot-1")).rejects.toThrow("Cotação não encontrada");
  });
});

describe("linksDaCotacao", () => {
  it("indexa por fornecedor e por participação; link nulo fica de fora", async () => {
    invoke.mockResolvedValueOnce({
      data: {
        success: true,
        links: [
          { cotacao_fornecedor_id: "cf1", fornecedor_id: "f1", link: LINK },
          { cotacao_fornecedor_id: "cf2", fornecedor_id: "f2", link: null },
        ],
      },
    });
    const links = await linksDaCotacao(sigo, "cot-1");
    expect(invoke).toHaveBeenCalledWith("fornecedorAcesso", { acao: "links", cotacao_id: "cot-1" });
    expect(links).toEqual({ porFornecedor: { f1: LINK }, porParticipacao: { cf1: LINK } });
  });

  it("erro do servidor lança", async () => {
    invoke.mockResolvedValueOnce({ data: { success: false, error: "Sessão inválida" } });
    await expect(linksDaCotacao(sigo, "cot-1")).rejects.toThrow("Sessão inválida");
  });
});

describe("reemitirLinkCotacao", () => {
  it("pede o link novo da participação", async () => {
    invoke.mockResolvedValueOnce({
      data: { success: true, cotacao_fornecedor_id: "cf1", fornecedor_id: "f1", link: LINK },
    });
    expect(await reemitirLinkCotacao(sigo, "cf1")).toBe(LINK);
    expect(invoke).toHaveBeenCalledWith("fornecedorAcesso", {
      acao: "reemitir_link",
      cotacao_fornecedor_id: "cf1",
    });
  });

  it("sem link na resposta lança", async () => {
    invoke.mockResolvedValueOnce({ data: { success: true } });
    await expect(reemitirLinkCotacao(sigo, "cf1")).rejects.toThrow(MENSAGEM_FALHA_SERVIDOR);
  });
});

describe("credencialParaEnvio", () => {
  it("já tem senha gerada nesta abertura: usa a mesma, sem chamar o servidor", async () => {
    const atual = { email: "f@exemplo.test", senha: "JaGerada1234" };
    expect(await credencialParaEnvio(sigo, { atual, fornecedorId: "f1" })).toBe(atual);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("só o hash no banco (senha null): pede senha nova ao servidor", async () => {
    invoke.mockResolvedValueOnce({
      data: { success: true, credencial: { email: "f@exemplo.test", senha: "Nova12345678" } },
    });
    const cred = await credencialParaEnvio(sigo, {
      atual: { email: "f@exemplo.test", senha: null },
      fornecedorId: "f1",
    });
    expect(cred).toEqual({ email: "f@exemplo.test", senha: "Nova12345678" });
  });

  it("painel da cotação (soSeTemAcesso): sem acesso, não cria e devolve null", async () => {
    expect(
      await credencialParaEnvio(sigo, { atual: undefined, fornecedorId: "f1", soSeTemAcesso: true })
    ).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("tela de cotação: sem acesso, pede ao servidor (que cria com o e-mail do cadastro)", async () => {
    invoke.mockResolvedValueOnce({
      data: { success: true, credencial: { email: "f@exemplo.test", senha: "Nova12345678" } },
    });
    expect(await credencialParaEnvio(sigo, { atual: undefined, fornecedorId: "f1" })).toEqual({
      email: "f@exemplo.test",
      senha: "Nova12345678",
    });
  });

  it("falha do servidor lança (a tela não abre a mensagem)", async () => {
    invoke.mockResolvedValueOnce({ data: { success: false, error: "Erro interno" } });
    await expect(
      credencialParaEnvio(sigo, {
        atual: { email: "f@exemplo.test", senha: null },
        fornecedorId: "f1",
      })
    ).rejects.toThrow("Erro interno");
  });
});

describe("MENSAGEM_FORNECEDOR_SEM_EMAIL", () => {
  it("é o mesmo texto que o servidor usa no SEM_EMAIL", async () => {
    const { MENSAGEM_FORNECEDOR_SEM_EMAIL } = await import("./senha-portal");
    const { MENSAGEM_SEM_EMAIL } =
      await import("../../../../supabase/functions/fornecedor-acesso/regras.ts");
    expect(MENSAGEM_FORNECEDOR_SEM_EMAIL).toBe(MENSAGEM_SEM_EMAIL);
  });
});
