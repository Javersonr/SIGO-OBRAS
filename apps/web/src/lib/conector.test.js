import { describe, it, expect } from "vitest";
import {
  comandoClaudeCode,
  comandoClaudeCodeOAuth,
  destinoSeguro,
  erroDeSessao,
  lerPedidoAutorizacao,
  linkInstalacaoClaude,
  sessaoCustomConfere,
  urlConector,
} from "./conector";

const MCP = "https://fpy.supabase.co/functions/v1/mcp";

describe("conector do Claude (front)", () => {
  it("urlConector monta a URL da função mcp", () => {
    expect(urlConector("https://fpy.supabase.co/")).toBe(MCP);
    expect(urlConector("")).toBe("");
  });

  it("linkInstalacaoClaude usa o formato oficial com a URL codificada", () => {
    expect(linkInstalacaoClaude(MCP)).toBe(
      "https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=SIGO%20Obras&connectorUrl=https%3A%2F%2Ffpy.supabase.co%2Ffunctions%2Fv1%2Fmcp"
    );
    expect(linkInstalacaoClaude(MCP, { admin: true })).toMatch(
      /^https:\/\/claude\.ai\/admin-settings\/connectors\?/
    );
  });

  it("comandos do Claude Code", () => {
    expect(comandoClaudeCode(MCP, "sigo_pk_x")).toBe(
      `claude mcp add --transport http sigo-obras ${MCP} --header "Authorization: Bearer sigo_pk_x"`
    );
    expect(comandoClaudeCodeOAuth(MCP)).toBe(
      `claude mcp add --transport http --scope user sigo-obras ${MCP}`
    );
  });

  it("destinoSeguro só aceita caminho interno", () => {
    expect(destinoSeguro("/AutorizarConector?client_id=x")).toBe("/AutorizarConector?client_id=x");
    expect(destinoSeguro("//evil.com")).toBeNull();
    expect(destinoSeguro("/\\evil.com")).toBeNull();
    expect(destinoSeguro("https://evil.com")).toBeNull();
    expect(destinoSeguro("/a\u0000b")).toBeNull();
    expect(destinoSeguro(null)).toBeNull();
  });

  it("lerPedidoAutorizacao separa os parâmetros e lista os obrigatórios faltando", () => {
    const { pedido, faltando } = lerPedidoAutorizacao(
      "?response_type=code&client_id=sigo_c_1&redirect_uri=http%3A%2F%2Flocalhost%3A5%2Fcallback&code_challenge=abc&code_challenge_method=S256&state=s&extra=1"
    );
    expect(pedido).toEqual({
      response_type: "code",
      client_id: "sigo_c_1",
      redirect_uri: "http://localhost:5/callback",
      code_challenge: "abc",
      code_challenge_method: "S256",
      state: "s",
    });
    expect(faltando).toEqual([]);
    expect(lerPedidoAutorizacao("?client_id=x").faltando).toEqual([
      "response_type",
      "redirect_uri",
      "code_challenge",
      "code_challenge_method",
    ]);
  });
});

describe("tela de autorização: sessão e erros", () => {
  const custom = (o) => JSON.stringify(o);

  it("sessaoCustomConfere exige o custom_auth da aba com id e o MESMO e-mail da sessão", () => {
    const raw = custom({ id: "u1", email: "Joao@X.com", empresa_id: "e1" });
    expect(sessaoCustomConfere(raw, "joao@x.com")).toBe(true);
    expect(sessaoCustomConfere(raw, "JOAO@X.COM")).toBe(true);
    // e-mail diferente: sessão do Supabase de outra pessoa
    expect(sessaoCustomConfere(raw, "outro@x.com")).toBe(false);
  });

  it("sessaoCustomConfere recusa sessão 'zumbi' (sessionStorage vazio ou inválido)", () => {
    expect(sessaoCustomConfere(null, "joao@x.com")).toBe(false); // aba nova / navegador reaberto
    expect(sessaoCustomConfere("", "joao@x.com")).toBe(false);
    expect(sessaoCustomConfere("{corrompido", "joao@x.com")).toBe(false);
    expect(sessaoCustomConfere(custom({ email: "joao@x.com" }), "joao@x.com")).toBe(false); // sem id
    expect(sessaoCustomConfere(custom({ id: "u1" }), "joao@x.com")).toBe(false); // sem e-mail
    expect(sessaoCustomConfere(custom({ id: "u1", email: "joao@x.com" }), "")).toBe(false);
    expect(sessaoCustomConfere(custom({ id: "u1", email: "joao@x.com" }), undefined)).toBe(false);
    expect(sessaoCustomConfere("[]", "joao@x.com")).toBe(false);
  });

  it("erroDeSessao: só o erro de sessão manda para o login", () => {
    expect(erroDeSessao({ success: false, codigo: "sessao_invalida", error: "x" })).toBe(true);
    expect(
      erroDeSessao({
        success: false,
        error: "Sessão inválida ou expirada. Entre no SIGO de novo.",
      })
    ).toBe(true);
    expect(
      erroDeSessao({
        success: false,
        error: "Pedido de autorização inválido: aplicativo ou endereço de retorno não reconhecido.",
      })
    ).toBe(false);
    expect(
      erroDeSessao({
        success: false,
        error: "Troque sua senha provisória antes de conectar o Claude",
      })
    ).toBe(false);
    expect(erroDeSessao({ success: false, error: "Serviço indisponível, tente de novo" })).toBe(
      false
    );
    expect(erroDeSessao(null)).toBe(false);
    expect(erroDeSessao(undefined)).toBe(false);
  });
});
