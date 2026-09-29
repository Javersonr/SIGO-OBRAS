import { describe, it, expect } from "vitest";
import {
  GEMINI_MODELO_FORTE,
  GEMINI_MODELO_PADRAO,
  OPCOES_GEMINI_FORTE,
  OPCOES_GEMINI_PADRAO,
  payloadGemini,
  resultadoTesteGemini,
} from "./integracoes-ia";

const STATUS = {
  configurada: true,
  final: "1234",
  origem: "painel",
  modelo: "gemini-3.5-flash-lite",
  modelo_forte: "gemini-3.8-flash",
};

describe("modelos do Gemini no SaaS Admin", () => {
  it("as opções são as que o servidor aceita, com o padrão primeiro", () => {
    expect(OPCOES_GEMINI_PADRAO.map((o) => o.valor)).toEqual([
      "gemini-3.5-flash-lite",
      "gemini-3.1-flash-lite",
      "gemini-3.8-flash",
    ]);
    expect(OPCOES_GEMINI_FORTE.map((o) => o.valor)).toEqual([
      "gemini-3.8-flash",
      "gemini-3.1-pro-preview",
    ]);
    expect(GEMINI_MODELO_PADRAO).toBe(OPCOES_GEMINI_PADRAO[0].valor);
    expect(GEMINI_MODELO_FORTE).toBe(OPCOES_GEMINI_FORTE[0].valor);
    for (const o of [...OPCOES_GEMINI_PADRAO, ...OPCOES_GEMINI_FORTE]) {
      expect(o.rotulo.startsWith(o.valor)).toBe(true);
    }
  });
});

describe("payloadGemini (botão Salvar do card)", () => {
  it("nada mudou → null (Salvar desabilitado)", () => {
    expect(
      payloadGemini({
        novaChave: "",
        modelo: "gemini-3.5-flash-lite",
        modeloForte: "gemini-3.8-flash",
        status: STATUS,
      })
    ).toBeNull();
    expect(
      payloadGemini({
        novaChave: "   ",
        modelo: GEMINI_MODELO_PADRAO,
        modeloForte: GEMINI_MODELO_FORTE,
        status: null,
      })
    ).toBeNull();
    expect(payloadGemini()).toBeNull();
  });

  it("chave nova vai aparada e sozinha", () => {
    expect(
      payloadGemini({
        novaChave: "  AIzaSyTESTE000000000000001234 \n",
        modelo: "gemini-3.5-flash-lite",
        modeloForte: "gemini-3.8-flash",
        status: STATUS,
      })
    ).toEqual({ acao: "definir", chave_gemini: "AIzaSyTESTE000000000000001234" });
  });

  it("só os modelos que mudaram", () => {
    expect(
      payloadGemini({
        novaChave: "",
        modelo: "gemini-3.8-flash",
        modeloForte: "gemini-3.8-flash",
        status: STATUS,
      })
    ).toEqual({ acao: "definir", gemini_modelo: "gemini-3.8-flash" });
    expect(
      payloadGemini({
        novaChave: "",
        modelo: "gemini-3.5-flash-lite",
        modeloForte: "gemini-3.1-pro-preview",
        status: STATUS,
      })
    ).toEqual({ acao: "definir", gemini_modelo_forte: "gemini-3.1-pro-preview" });
  });

  it("sem status (servidor antigo ou falha ao carregar) compara com os padrões", () => {
    expect(
      payloadGemini({
        novaChave: "",
        modelo: "gemini-3.1-flash-lite",
        modeloForte: GEMINI_MODELO_FORTE,
        status: null,
      })
    ).toEqual({ acao: "definir", gemini_modelo: "gemini-3.1-flash-lite" });
  });
});

describe("resultadoTesteGemini (botão Testar)", () => {
  it("lê o gemini_teste do servidor", () => {
    expect(
      resultadoTesteGemini({
        success: true,
        gemini_teste: { ok: true, mensagem: "Gemini respondeu" },
      })
    ).toEqual({ ok: true, mensagem: "Gemini respondeu" });
    expect(
      resultadoTesteGemini({
        success: true,
        gemini_teste: { ok: false, mensagem: "Chave inválida" },
      })
    ).toEqual({ ok: false, mensagem: "Chave inválida" });
  });

  it("erro da função ou resposta estranha vira falha com mensagem", () => {
    expect(
      resultadoTesteGemini({ success: false, error: "Acesso restrito ao super admin" })
    ).toEqual({
      ok: false,
      mensagem: "Acesso restrito ao super admin",
    });
    expect(resultadoTesteGemini({ success: false })).toEqual({
      ok: false,
      mensagem: "Não foi possível testar a chave",
    });
    expect(resultadoTesteGemini(null)).toEqual({
      ok: false,
      mensagem: "Não foi possível testar a chave",
    });
    expect(resultadoTesteGemini({ success: true })).toEqual({
      ok: false,
      mensagem: "Resposta inesperada do servidor",
    });
  });
});
