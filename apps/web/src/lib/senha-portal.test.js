import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import {
  FUNCAO_FORNECEDOR_ACESSO,
  LINHA_JA_TEM_ACESSO,
  LINHA_SENHA_ENVIADA,
  MENSAGEM_ENVIAR_DEPOIS,
  MENSAGEM_FALHA_SERVIDOR,
  MENSAGEM_FORNECEDOR_SEM_EMAIL,
  acessosDaCotacao,
  enviarSenhaFornecedor,
  linhaSobreSenha,
  linksDaCotacao,
  prepararConvite,
  reemitirLinkCotacao,
  situacaoAtual,
  textoDoMotivo,
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

  it("a lib não gera, não pede e não monta senha (quem envia é o servidor)", () => {
    const fonte = readFileSync(new URL("./senha-portal.js", import.meta.url), "utf8");
    expect(fonte).not.toMatch(/getRandomValues|subtle\.digest|FornecedorAcesso/);
    expect(fonte).not.toMatch(/acao:\s*"credencial"|\.senha\b|rotacionarCredencial/);
  });

  it("as telas de Compras não leem nem exibem senha de fornecedor", () => {
    for (const arq of ["CotacaoModal.jsx", "LinksModal.jsx"]) {
      const fonte = readFileSync(new URL(`../components/compras/${arq}`, import.meta.url), "utf8");
      expect(fonte, arq).not.toMatch(/\.senha\b|Senha:\*|senha_acesso|credencial/);
    }
  });
});

describe("enviarSenhaFornecedor", () => {
  it("pede o envio ao servidor e devolve só destino mascarado e login", async () => {
    invoke.mockResolvedValueOnce({
      data: {
        success: true,
        enviado: true,
        destino: "5511*****0000",
        login: "forn@exemplo.test",
      },
    });
    const r = await enviarSenhaFornecedor(sigo, "forn-1");
    expect(invoke).toHaveBeenCalledWith("fornecedorAcesso", {
      acao: "enviar_senha",
      fornecedor_id: "forn-1",
    });
    expect(r).toEqual({
      enviado: true,
      motivo: null,
      mensagem: null,
      destino: "5511*****0000",
      login: "forn@exemplo.test",
    });
    expect(JSON.stringify(r)).not.toMatch(/senha/i);
  });

  it("não enviado (motivo do servidor): devolve o motivo, não lança", async () => {
    invoke.mockResolvedValueOnce({
      data: { success: true, enviado: false, motivo: "SEM_TELEFONE", mensagem: "sem telefone" },
    });
    const r = await enviarSenhaFornecedor(sigo, "forn-1");
    expect(r).toMatchObject({ enviado: false, motivo: "SEM_TELEFONE" });
  });

  it("403 sem permissão (success: false + codigo): vira motivo SEM_PERMISSAO", async () => {
    invoke.mockResolvedValueOnce({
      data: { success: false, error: "Sem permissão...", codigo: "SEM_PERMISSAO" },
    });
    const r = await enviarSenhaFornecedor(sigo, "forn-1");
    expect(r).toMatchObject({ enviado: false, motivo: "SEM_PERMISSAO" });
    expect(textoDoMotivo(r)).toMatch(/não tem permissão/);
  });

  it("resposta vazia ou exceção: não lança, motivo ERRO com o aviso genérico", async () => {
    invoke.mockResolvedValueOnce({ data: undefined });
    expect(await enviarSenhaFornecedor(sigo, "x")).toMatchObject({
      enviado: false,
      motivo: "ERRO",
      mensagem: MENSAGEM_FALHA_SERVIDOR,
    });
    invoke.mockRejectedValueOnce(new Error("rede caiu"));
    expect(await enviarSenhaFornecedor(sigo, "x")).toMatchObject({
      enviado: false,
      motivo: "ERRO",
      mensagem: "rede caiu",
    });
  });
});

describe("textoDoMotivo: linguagem simples para cada motivo", () => {
  it.each([
    ["SEM_EMAIL", /e-mail/],
    ["SEM_TELEFONE", /telefone/],
    ["LIMITE", /limite de mensagens/],
    ["CANAL_INDISPONIVEL", /fora do ar/],
    ["SEM_PERMISSAO", /permissão/],
    ["FALHA_AO_GRAVAR", /envie uma nova/],
  ])("%s", (motivo, re) => {
    expect(textoDoMotivo({ motivo })).toMatch(re);
  });
  it("motivo desconhecido usa a mensagem do servidor", () => {
    expect(textoDoMotivo({ motivo: "X", mensagem: "texto do servidor" })).toBe("texto do servidor");
  });
});

describe("linhaSobreSenha: os três textos do convite (item 7)", () => {
  it("senha acabou de ser enviada", () => {
    expect(linhaSobreSenha("enviada")).toBe(
      "Seu login e senha do portal chegam em outra mensagem, enviada pelo número do SIGO Obras."
    );
    expect(LINHA_SENHA_ENVIADA).toBe(linhaSobreSenha("enviada"));
  });
  it("fornecedor já tinha acesso", () => {
    expect(linhaSobreSenha("ja_tinha")).toBe(
      "Para consultar seu histórico, use o login e a senha que você já recebeu."
    );
    expect(LINHA_JA_TEM_ACESSO).toBe(linhaSobreSenha("ja_tinha"));
  });
  it("envio falhou ou situação desconhecida: nenhuma linha sobre senha", () => {
    expect(linhaSobreSenha(null)).toBe("");
    expect(linhaSobreSenha(undefined)).toBe("");
  });
});

describe("situacaoAtual (mostrar/copiar sem enviar)", () => {
  it("enviada agora > já tinha acesso ativo > nada", () => {
    expect(situacaoAtual({ ativo: false }, true)).toBe("enviada");
    expect(situacaoAtual({ ativo: true }, false)).toBe("ja_tinha");
    expect(situacaoAtual({ tem_acesso: false, ativo: false }, false)).toBeNull();
    expect(situacaoAtual(undefined, false)).toBeNull();
  });
});

describe("prepararConvite: quando a senha é enviada (item 6)", () => {
  it("sem acesso: o servidor envia a senha antes do convite", async () => {
    invoke.mockResolvedValueOnce({
      data: { success: true, enviado: true, destino: "5511*****0000", login: "f@exemplo.test" },
    });
    const r = await prepararConvite(sigo, {
      acesso: { tem_acesso: false, ativo: false },
      fornecedorId: "f1",
    });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(r.situacao).toBe("enviada");
    expect(r.tipoAviso).toBe("sucesso");
    expect(r.aviso).toMatch(/5511\*\*\*\*\*0000/);
  });

  it("falha no envio NÃO impede o convite: sem linha de senha e aviso com o motivo", async () => {
    invoke.mockResolvedValueOnce({
      data: { success: true, enviado: false, motivo: "LIMITE", mensagem: "limite" },
    });
    const r = await prepararConvite(sigo, {
      acesso: { tem_acesso: false, ativo: false },
      fornecedorId: "f1",
    });
    expect(r.situacao).toBeNull();
    expect(linhaSobreSenha(r.situacao)).toBe("");
    expect(r.tipoAviso).toBe("alerta");
    expect(r.aviso).toMatch(/limite de mensagens/);
    expect(r.aviso).toContain(MENSAGEM_ENVIAR_DEPOIS);
    expect(r.aviso).toMatch(/O convite sai com o link/);
  });

  it("exceção no servidor também não impede o convite", async () => {
    invoke.mockRejectedValueOnce(new Error("rede caiu"));
    const r = await prepararConvite(sigo, {
      acesso: { tem_acesso: false, ativo: false },
      fornecedorId: "f1",
    });
    expect(r.situacao).toBeNull();
    expect(r.tipoAviso).toBe("alerta");
  });

  it("já tem acesso ativo: lembrete NÃO troca a senha (nenhuma chamada)", async () => {
    const r = await prepararConvite(sigo, {
      acesso: { tem_acesso: true, ativo: true },
      fornecedorId: "f1",
    });
    expect(invoke).not.toHaveBeenCalled();
    expect(r.situacao).toBe("ja_tinha");
  });

  it("acesso desativado ou situação desconhecida: não envia nada", async () => {
    for (const acesso of [{ tem_acesso: true, ativo: false }, undefined, null]) {
      const r = await prepararConvite(sigo, { acesso, fornecedorId: "f1" });
      expect(r.situacao).toBeNull();
      expect(r.aviso).toBeNull();
    }
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe("acessosDaCotacao", () => {
  it("situação de cada fornecedor, sem senha nem telefone", async () => {
    invoke.mockResolvedValueOnce({
      data: {
        success: true,
        acessos: [
          {
            fornecedor_id: "f1",
            email: "f1@exemplo.test",
            tem_acesso: true,
            ativo: true,
            tem_email: true,
            tem_telefone: false,
          },
          { fornecedor_id: "f2", email: null, tem_acesso: false, ativo: false },
        ],
      },
    });
    const a = await acessosDaCotacao(sigo, "cot-1");
    expect(invoke).toHaveBeenCalledWith("fornecedorAcesso", {
      acao: "status",
      cotacao_id: "cot-1",
    });
    expect(a).toEqual({
      f1: {
        tem_acesso: true,
        ativo: true,
        tem_email: true,
        tem_telefone: false,
        email: "f1@exemplo.test",
      },
      f2: { tem_acesso: false, ativo: false, tem_email: false, tem_telefone: false, email: null },
    });
  });

  it("erro do servidor lança (a tela mostra o aviso)", async () => {
    invoke.mockResolvedValueOnce({ data: { success: false, error: "Cotação não encontrada" } });
    await expect(acessosDaCotacao(sigo, "cot-1")).rejects.toThrow("Cotação não encontrada");
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
  });

  it("sem link na resposta lança", async () => {
    invoke.mockResolvedValueOnce({ data: { success: true } });
    await expect(reemitirLinkCotacao(sigo, "cf1")).rejects.toThrow(MENSAGEM_FALHA_SERVIDOR);
  });
});

describe("MENSAGEM_FORNECEDOR_SEM_EMAIL", () => {
  it("é o mesmo texto que o servidor usa no SEM_EMAIL", async () => {
    const { MENSAGEM_SEM_EMAIL } =
      await import("../../../../supabase/functions/fornecedor-acesso/regras.ts");
    expect(MENSAGEM_FORNECEDOR_SEM_EMAIL).toBe(MENSAGEM_SEM_EMAIL);
  });
});
