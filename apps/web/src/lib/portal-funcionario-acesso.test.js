import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { VALIDADE_PROVISORIA_DIAS as VALIDADE_NO_SERVIDOR } from "../../../../supabase/functions/_shared/portal-credencial.ts";

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
  CODIGO_CONFLITO,
  CODIGO_EFEITO_SEM_REGISTRO,
  CODIGO_JA_TEM_ACESSO,
  DURACAO_AVISO_SEM_REGISTRO_MS,
  MOTIVO_REVOGACAO_MAX,
  MOTIVO_REVOGACAO_MIN,
  extrasDaMatricula,
  falhaDaAcaoDoRH,
  statusAcesso,
  textoCredenciais,
  VALIDADE_PROVISORIA_DIAS,
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
  it("liberarTentativa manda a matrícula e as extras que a tela mostrava (a identidade vem da sessão)", async () => {
    invoke.mockResolvedValueOnce({ data: { success: true, tentativas_extras: 2 } });
    const r = await acessoPortal.liberarTentativa("mat-1", 1);
    expect(invoke).toHaveBeenCalledWith("funcionarioAcesso", {
      acao: "liberar_tentativa",
      matricula_id: "mat-1",
      tentativas_extras_vistas: 1,
    });
    expect(r.tentativas_extras).toBe(2);
  });

  it("liberarTentativa manda o 0 quando a tela mostrava 0 (zero é um valor, não ausência)", async () => {
    invoke.mockResolvedValueOnce({ data: { success: true, tentativas_extras: 1 } });
    await acessoPortal.liberarTentativa("mat-1", 0);
    expect(invoke.mock.calls[0][1].tentativas_extras_vistas).toBe(0);
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

  it("editarRespostaDuvida manda a dúvida e o texto novo (autor e empresa vêm da sessão) (A6)", async () => {
    invoke.mockResolvedValueOnce({ data: { success: true, editada: true } });
    const r = await acessoPortal.editarRespostaDuvida("duv-1", "Texto corrigido");
    expect(invoke).toHaveBeenCalledWith("funcionarioAcesso", {
      acao: "editar_resposta_duvida",
      duvida_id: "duv-1",
      resposta: "Texto corrigido",
    });
    expect(r.editada).toBe(true);
  });

  it("erro do servidor (sem permissão, conflito) sobe com a mensagem e o código", async () => {
    invoke.mockResolvedValueOnce({
      data: { success: false, error: "A matrícula mudou agora há pouco.", codigo: "CONFLITO" },
    });
    const erro = await acessoPortal.liberarTentativa("mat-1", 1).catch((e) => e);
    expect(erro.message).toBe("A matrícula mudou agora há pouco.");
    expect(erro.codigo).toBe("CONFLITO");
  });
});

describe("status HTTP do erro do servidor (T18, M3)", () => {
  it("o erro lançado leva o status da resposta (a tela decide recarregar pelo 409/404)", async () => {
    invoke.mockResolvedValueOnce({
      data: { success: false, error: "O certificado já está revogado" },
      error: { context: { status: 409 } },
    });
    const erro = await acessoPortal.revogarCertificado("mat-1", "Motivo qualquer").catch((e) => e);
    expect(erro.message).toBe("O certificado já está revogado");
    expect(erro.status).toBe(409);
    expect(erro.codigo).toBeUndefined();
  });

  it("junto do código, quando há os dois", async () => {
    invoke.mockResolvedValueOnce({
      data: { success: false, error: "A matrícula mudou agora há pouco.", codigo: "CONFLITO" },
      error: { context: { status: 409 } },
    });
    const erro = await acessoPortal.liberarTentativa("mat-1", 1).catch((e) => e);
    expect(erro.codigo).toBe("CONFLITO");
    expect(erro.status).toBe(409);
  });

  it("resposta sem o objeto de erro do supabase-js (ou sem status): não inventa status", async () => {
    invoke.mockResolvedValueOnce({ data: { success: false, error: "Erro ao revogar" } });
    const sem = await acessoPortal.revogarCertificado("mat-1", "Motivo qualquer").catch((e) => e);
    expect(sem.status).toBeUndefined();
    invoke.mockResolvedValueOnce({
      data: { success: false, error: "Erro ao revogar" },
      error: { message: "x", context: {} },
    });
    const semStatus = await acessoPortal
      .revogarCertificado("mat-1", "Motivo qualquer")
      .catch((e) => e);
    expect(semStatus.status).toBeUndefined();
  });
});

describe("liberação sem repetir (T18, M4)", () => {
  it("extrasDaMatricula lê como o servidor: inteiro positivo, senão 0", () => {
    expect(extrasDaMatricula({ tentativas_extras: 3 })).toBe(3);
    for (const ruim of [0, null, undefined, -2, 1.5, Number.NaN, "x", {}]) {
      expect(extrasDaMatricula({ tentativas_extras: ruim }), String(ruim)).toBe(0);
    }
    expect(extrasDaMatricula(undefined)).toBe(0);
    expect(extrasDaMatricula(null)).toBe(0);
  });

  it("falha comum: mostra o texto do servidor, tempo padrão, sem recarregar a matrícula", () => {
    const f = falhaDaAcaoDoRH(Object.assign(new Error("Sem permissão"), { codigo: "OUTRO" }));
    expect(f).toEqual({ texto: "Sem permissão", duracao: undefined, recarregarMatricula: false });
    expect(falhaDaAcaoDoRH(new Error("")).texto).toMatch(/Não foi possível concluir/);
    expect(falhaDaAcaoDoRH(undefined).texto).toMatch(/Não foi possível concluir/);
  });

  it("conflito: recarrega a matrícula (o número que a tela tinha já não vale)", () => {
    const f = falhaDaAcaoDoRH(Object.assign(new Error("mudou"), { codigo: CODIGO_CONFLITO }));
    expect(f.recarregarMatricula).toBe(true);
    expect(f.duracao).toBeUndefined();
  });

  it("efeito sem registro: o aviso de NÃO repetir fica mais tempo e a matrícula NÃO é recarregada", () => {
    const f = falhaDaAcaoDoRH(
      Object.assign(new Error("NÃO repita"), { codigo: CODIGO_EFEITO_SEM_REGISTRO })
    );
    expect(f.duracao).toBe(DURACAO_AVISO_SEM_REGISTRO_MS);
    expect(f.duracao).toBeGreaterThanOrEqual(15000);
    expect(f.recarregarMatricula).toBe(false);
  });

  it("409 e 404 (outro RH já agiu, matrícula ou certificado que já não existe): recarrega a lista da aba (T18, M3)", () => {
    // o servidor responde "O certificado já está revogado" com 409 e SEM `codigo`: o que o front tem é o status
    const conflito = Object.assign(new Error("O certificado já está revogado"), { status: 409 });
    expect(falhaDaAcaoDoRH(conflito).recarregarMatricula).toBe(true);
    const naoExiste = Object.assign(new Error("Esta matrícula ainda não tem certificado"), {
      status: 404,
    });
    expect(falhaDaAcaoDoRH(naoExiste).recarregarMatricula).toBe(true);
    // o texto continua o do servidor e o tempo, o padrão
    expect(falhaDaAcaoDoRH(conflito)).toEqual({
      texto: "O certificado já está revogado",
      duracao: undefined,
      recarregarMatricula: true,
    });
  });

  it("QUALQUER 409 recarrega a matrícula (até o 'já foi aprovado' da liberação, sem codigo), menos o efeito sem registro", () => {
    // a liberação recusada porque o aluno já foi aprovado: 409 sem `codigo`; o botão não pode ficar na tela
    const jaAprovado = Object.assign(new Error("O aluno já foi aprovado"), { status: 409 });
    expect(falhaDaAcaoDoRH(jaAprovado).recarregarMatricula).toBe(true);
    // o `codigo` próprio nunca é lido pelo texto, e outro 409 qualquer também recarrega
    const outro = Object.assign(new Error("qualquer 409"), { status: 409, codigo: "OUTRO" });
    expect(falhaDaAcaoDoRH(outro).recarregarMatricula).toBe(true);
    // a exceção: com o efeito sem registro a tela antiga é a proteção, mesmo que o status venha 409
    const semRegistro = Object.assign(new Error("NÃO repita"), {
      codigo: CODIGO_EFEITO_SEM_REGISTRO,
      status: 409,
    });
    expect(falhaDaAcaoDoRH(semRegistro).recarregarMatricula).toBe(false);
  });

  it("sem permissão (403), erro do banco (500) e falha de rede não recarregam a lista", () => {
    for (const status of [400, 403, 500, 503, undefined]) {
      expect(
        falhaDaAcaoDoRH(Object.assign(new Error("falhou"), { status })).recarregarMatricula,
        String(status)
      ).toBe(false);
    }
    // efeito sem registro é 500 e continua sem recarregar, mesmo que o status venha junto
    const semRegistro = Object.assign(new Error("NÃO repita"), {
      codigo: CODIGO_EFEITO_SEM_REGISTRO,
      status: 500,
    });
    expect(falhaDaAcaoDoRH(semRegistro).recarregarMatricula).toBe(false);
  });

  it("o campo e os códigos são os mesmos do servidor (funcionario-acesso)", () => {
    const ler = (nome) =>
      readFileSync(
        new URL(`../../../../supabase/functions/funcionario-acesso/${nome}`, import.meta.url),
        "utf8"
      );
    const regras = ler("regras.ts");
    const campo = /CAMPO_EXTRAS_VISTAS = "([a-z_]+)"/.exec(regras)?.[1];
    expect(campo).toBe("tentativas_extras_vistas");
    invoke.mockResolvedValueOnce({ data: { success: true } });
    return acessoPortal.liberarTentativa("mat-1", 4).then(() => {
      expect(Object.keys(invoke.mock.calls[0][1])).toContain(campo);
      expect(regras).toContain(`codigo: "${CODIGO_CONFLITO}"`);
      expect(regras).toContain(`"${CODIGO_EFEITO_SEM_REGISTRO}"`);
    });
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

describe("T38: um login em mais de uma empresa (mensagem e selo)", () => {
  const LINHA_JA_USO =
    'Se você já usa o portal em outra empresa, entre com o CPF e esta senha provisória, toque em "Já uso o ' +
    'portal em outra empresa" e digite a senha que você já usa.';

  it("a mensagem com a provisória ensina quem já usa o portal em outra empresa e diz que ela vence", () => {
    const t = textoCredenciais({
      nome: "Fulano de Tal",
      usuario: "12345678901",
      senha: "ABCD2345",
    });
    expect(t).toContain("Senha provisória: ABCD2345 (vale por 7 dias)");
    expect(t).toContain(LINHA_JA_USO);
  });

  it("avisarNoPortal: a mensagem com as credenciais leva a mesma linha; sem credenciais, não", async () => {
    invoke.mockResolvedValueOnce({
      data: { success: true, usuario: "12345678901", senha_provisoria: "Prov-123" },
    });
    const comCredenciais = await avisarNoPortal(funcionario, "Você tem treinamentos.");
    expect(comCredenciais.texto).toContain("Senha provisória: Prov-123 (vale por 7 dias)");
    expect(comCredenciais.texto).toContain(LINHA_JA_USO);
    invoke.mockResolvedValueOnce(jaTemAcesso());
    const semCredenciais = await avisarNoPortal(funcionario, "Você tem treinamentos.");
    expect(semCredenciais.texto).not.toContain(LINHA_JA_USO);
  });

  it("a validade da provisória da mensagem é a do servidor (7 dias, P3)", () => {
    expect(VALIDADE_PROVISORIA_DIAS).toBe(VALIDADE_NO_SERVIDOR);
  });

  it("statusAcesso: selo 'Precisa de nova senha provisória' com a dica do que fazer", () => {
    const s = statusAcesso({ ativo: true, precisa_provisoria: true, situacao: "travado" });
    expect(s.rotulo).toBe("Precisa de nova senha provisória");
    expect(s.dica).toBe(
      "A senha do portal mudou ou o CPF do cadastro mudou. Gere uma senha provisória em Redefinir senha e " +
        "entregue ao funcionário."
    );
    // desativado vem antes; os outros selos continuam
    expect(statusAcesso({ ativo: false, precisa_provisoria: true }).rotulo).toBe("Desativado");
    expect(statusAcesso({ ativo: true, bloqueado: true }).rotulo).toBe("Bloqueado");
    expect(statusAcesso({ ativo: true, primeiro_acesso_pendente: true }).rotulo).toBe(
      "Aguardando 1º acesso"
    );
    expect(statusAcesso({ ativo: true }).rotulo).toBe("Ativo");
    expect(statusAcesso(null).rotulo).toBe("Sem acesso");
  });
});
