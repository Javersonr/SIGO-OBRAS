import { describe, it, expect, vi, beforeEach } from "vitest";

const { invoke, dispararWhatsApp } = vi.hoisted(() => ({
  invoke: vi.fn(),
  dispararWhatsApp: vi.fn(),
}));

vi.mock("@/api/sigoClient", () => ({ sigo: { functions: { invoke } } }));
vi.mock("@/lib/whatsapp", () => ({ dispararWhatsApp }));

import { acessoPortal, avisarNoPortal, CODIGO_JA_TEM_ACESSO } from "./portal-funcionario-acesso";

const funcionario = { id: "func-1", nome_completo: "Fulano de Tal", telefone: "(38) 99999-9999" };

// o que o servidor devolve quando o funcionário já tem login (sigoClient mantém `codigo` no data)
const jaTemAcesso = (error = "mensagem qualquer, que pode mudar") => ({
  data: { success: false, error, codigo: "JA_TEM_ACESSO" },
});

beforeEach(() => {
  invoke.mockReset();
  dispararWhatsApp.mockReset();
  dispararWhatsApp.mockResolvedValue("evolution");
});

describe("CODIGO_JA_TEM_ACESSO", () => {
  it("é o código que o funcionario-acesso devolve no 409", () => {
    expect(CODIGO_JA_TEM_ACESSO).toBe("JA_TEM_ACESSO");
  });
});

describe("acessoPortal.criar", () => {
  it("lança o erro do servidor levando o `codigo` junto", async () => {
    invoke.mockResolvedValueOnce(jaTemAcesso("Este funcionário já tem acesso"));
    const erro = await acessoPortal.criar("func-1").catch((e) => e);
    expect(erro).toBeInstanceOf(Error);
    expect(erro.message).toBe("Este funcionário já tem acesso");
    expect(erro.codigo).toBe("JA_TEM_ACESSO");
  });

  it("erro sem `codigo` continua sendo só a mensagem", async () => {
    invoke.mockResolvedValueOnce({ data: { success: false, error: "Erro ao criar acesso" } });
    const erro = await acessoPortal.criar("func-1").catch((e) => e);
    expect(erro.message).toBe("Erro ao criar acesso");
    expect(erro.codigo).toBeUndefined();
  });
});

describe("avisarNoPortal", () => {
  it("funcionário sem acesso: cria o login e manda usuário e senha provisória", async () => {
    invoke.mockResolvedValueOnce({
      data: { success: true, usuario: "12345678901", senha_provisoria: "Prov-123" },
    });
    const r = await avisarNoPortal(funcionario, "Você tem treinamentos.");
    expect(invoke).toHaveBeenCalledWith("funcionarioAcesso", {
      acao: "criar",
      funcionario_id: "func-1",
    });
    expect(r.credenciais).toMatchObject({ usuario: "12345678901", senha_provisoria: "Prov-123" });
    expect(r.texto).toContain("Usuário: 12345678901");
    expect(r.texto).toContain("Senha provisória: Prov-123");
    expect(r.via).toBe("evolution");
    expect(dispararWhatsApp).toHaveBeenCalledWith(funcionario.telefone, r.texto);
  });

  it("já tem acesso: segue sem credenciais e manda só o link", async () => {
    invoke.mockResolvedValueOnce(jaTemAcesso());
    const r = await avisarNoPortal(funcionario, "Você tem treinamentos.");
    expect(r.credenciais).toBeNull();
    expect(r.texto).toContain("Você tem treinamentos.");
    expect(r.texto).toContain("Entre com o seu usuário (CPF) e a sua senha.");
    expect(r.texto).not.toContain("Senha provisória");
    expect(dispararWhatsApp).toHaveBeenCalledTimes(1);
  });

  it("decide pelo `codigo`, não pelo texto: mensagem reescrita no servidor não quebra", async () => {
    invoke.mockResolvedValueOnce(jaTemAcesso("Acesso existente para este funcionário"));
    await expect(avisarNoPortal(funcionario, "Aviso")).resolves.toMatchObject({
      credenciais: null,
    });
  });

  it("texto 'já tem acesso' SEM o código não vale: o erro sobe", async () => {
    invoke.mockResolvedValueOnce({
      data: { success: false, error: "Este funcionário já tem acesso — use Redefinir senha" },
    });
    await expect(avisarNoPortal(funcionario, "Aviso")).rejects.toThrow(/já tem acesso/);
    expect(dispararWhatsApp).not.toHaveBeenCalled();
  });

  it("outro código de erro sobe e nada é enviado", async () => {
    invoke.mockResolvedValueOnce({
      data: { success: false, error: "Funcionário sem CPF cadastrado", codigo: "OUTRO" },
    });
    const erro = await avisarNoPortal(funcionario, "Aviso").catch((e) => e);
    expect(erro.message).toBe("Funcionário sem CPF cadastrado");
    expect(erro.codigo).toBe("OUTRO");
    expect(dispararWhatsApp).not.toHaveBeenCalled();
  });

  it("sem telefone não dispara o WhatsApp (via = null)", async () => {
    invoke.mockResolvedValueOnce(jaTemAcesso());
    const r = await avisarNoPortal({ ...funcionario, telefone: "" }, "Aviso");
    expect(r.via).toBeNull();
    expect(dispararWhatsApp).not.toHaveBeenCalled();
  });
});
