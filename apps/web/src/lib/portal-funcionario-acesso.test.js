import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

const { invoke, dispararWhatsApp } = vi.hoisted(() => ({
  invoke: vi.fn(),
  dispararWhatsApp: vi.fn(),
}));

vi.mock("@/api/sigoClient", () => ({ sigo: { functions: { invoke } } }));
vi.mock("@/lib/whatsapp", () => ({ dispararWhatsApp }));

import {
  acessoPortal,
  avisarNoPortal,
  avisoDaRevogacao,
  CODIGO_JA_TEM_ACESSO,
  MOTIVO_REVOGACAO_MAX,
  MOTIVO_REVOGACAO_MIN,
  validarMotivoRevogacao,
} from "./portal-funcionario-acesso";

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

describe("ações de matrícula do RH (T18)", () => {
  it("liberarTentativa chama o servidor só com a matrícula (a identidade vem da sessão)", async () => {
    invoke.mockResolvedValueOnce({ data: { success: true, tentativas_extras: 2 } });
    const r = await acessoPortal.liberarTentativa("mat-1");
    expect(invoke).toHaveBeenCalledWith("funcionarioAcesso", {
      acao: "liberar_tentativa",
      matricula_id: "mat-1",
    });
    expect(r.tentativas_extras).toBe(2);
  });

  it("revogarCertificado manda a matrícula e o motivo", async () => {
    invoke.mockResolvedValueOnce({
      data: { success: true, revogado: true, aviso_whatsapp: "enviado" },
    });
    const r = await acessoPortal.revogarCertificado("mat-1", "Prova feita por outra pessoa");
    expect(invoke).toHaveBeenCalledWith("funcionarioAcesso", {
      acao: "revogar_certificado",
      matricula_id: "mat-1",
      motivo: "Prova feita por outra pessoa",
    });
    expect(r.aviso_whatsapp).toBe("enviado");
  });

  it("erro do servidor (sem permissão, conflito) sobe com a mensagem e o código", async () => {
    invoke.mockResolvedValueOnce({
      data: { success: false, error: "A matrícula mudou agora há pouco.", codigo: "CONFLITO" },
    });
    const erro = await acessoPortal.liberarTentativa("mat-1").catch((e) => e);
    expect(erro.message).toBe("A matrícula mudou agora há pouco.");
    expect(erro.codigo).toBe("CONFLITO");
  });
});

describe("avisoDaRevogacao: o que dizer ao RH depois de revogar", () => {
  it("aluno avisado no WhatsApp: tudo certo", () => {
    const r = avisoDaRevogacao({ revogado: true, aviso_whatsapp: "enviado" });
    expect(r.tipo).toBe("success");
    expect(r.texto).toMatch(/revogado/i);
    expect(r.texto).toMatch(/avisado no WhatsApp/i);
  });

  it("a revogação vale mesmo quando o aviso não saiu: o texto diz o motivo e manda avisar de outro jeito", () => {
    const casos = {
      sem_telefone: /não tem telefone/i,
      telefone_invalido: /telefone .*inválido/i,
      canal_nao_configurado: /não está configurado/i,
      falhou: /falhou/i,
    };
    for (const [aviso, esperado] of Object.entries(casos)) {
      const r = avisoDaRevogacao({ revogado: true, aviso_whatsapp: aviso });
      expect(r.tipo, aviso).toBe("warning");
      expect(r.texto, aviso).toMatch(/Certificado revogado/);
      expect(r.texto, aviso).toMatch(esperado);
      expect(r.texto, aviso).toMatch(/outro meio/i);
    }
  });

  it("funcionário inativo não é avisado, e isso não é problema", () => {
    const r = avisoDaRevogacao({ revogado: true, aviso_whatsapp: "inativo" });
    expect(r.tipo).toBe("success");
    expect(r.texto).toMatch(/inativo/i);
  });

  it("resposta sem o campo do aviso (servidor antigo) só confirma a revogação", () => {
    for (const resposta of [
      { revogado: true },
      undefined,
      null,
      { aviso_whatsapp: "novo_valor" },
      { aviso_whatsapp: "constructor" },
      { aviso_whatsapp: "toString" },
    ]) {
      const r = avisoDaRevogacao(resposta);
      expect(r.tipo).toBe("success");
      expect(r.texto).toBe("Certificado revogado");
    }
  });
});

describe("validarMotivoRevogacao: confere antes de ir ao servidor", () => {
  it("limpa espaços e quebras de linha, como o servidor", () => {
    expect(validarMotivoRevogacao("  Prova feita\npor outra   pessoa ")).toEqual({
      ok: true,
      motivo: "Prova feita por outra pessoa",
    });
  });

  it("recusa vazio, curto e longo demais, dizendo o que corrigir", () => {
    const vazio = validarMotivoRevogacao("   ");
    expect(vazio.ok).toBe(false);
    expect(vazio.erro).toMatch(/motivo/i);
    const curto = validarMotivoRevogacao("a".repeat(MOTIVO_REVOGACAO_MIN - 1));
    expect(curto.ok).toBe(false);
    expect(curto.erro).toContain(String(MOTIVO_REVOGACAO_MIN));
    const longo = validarMotivoRevogacao("a".repeat(MOTIVO_REVOGACAO_MAX + 1));
    expect(longo.ok).toBe(false);
    expect(longo.erro).toContain(String(MOTIVO_REVOGACAO_MAX));
    expect(validarMotivoRevogacao("a".repeat(MOTIVO_REVOGACAO_MIN)).ok).toBe(true);
    expect(validarMotivoRevogacao("a".repeat(MOTIVO_REVOGACAO_MAX)).ok).toBe(true);
    expect(validarMotivoRevogacao(undefined).ok).toBe(false);
  });

  it("os limites são os mesmos do servidor (funcionario-acesso/regras.ts)", () => {
    const servidor = readFileSync(
      new URL("../../../../supabase/functions/funcionario-acesso/regras.ts", import.meta.url),
      "utf8"
    );
    expect(Number(/MOTIVO_REVOGACAO_MIN = (\d+)/.exec(servidor)?.[1])).toBe(MOTIVO_REVOGACAO_MIN);
    expect(Number(/MOTIVO_REVOGACAO_MAX = (\d+)/.exec(servidor)?.[1])).toBe(MOTIVO_REVOGACAO_MAX);
  });
});
