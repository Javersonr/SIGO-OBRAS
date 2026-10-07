import { describe, it, expect } from "vitest";
import {
  TEXTOS_DO_LOGIN,
  pedidoDaAtivacao,
  passoDaAtivacao,
  passoDoLogin,
  podeEnviarAtivacao,
  reacaoAoErroDaAtivacao,
  sessaoDaResposta,
} from "./portal-login";
import { MSG_RESET_NEGADO } from "../../../../supabase/functions/_shared/portal-credencial.ts";

/**
 * T38 (um login em mais de uma empresa): qual tela o portal mostra depois de cada resposta do login e da ativação, e
 * os textos. Spec: docs/superpowers/specs/2026-10-07-portal-varias-empresas-design.md, §5.1 e §8. Dados fictícios.
 */

describe("passoDoLogin: a tela depois do login", () => {
  it("uma empresa liberada: entra direto no painel, com o nome da empresa para o cabeçalho", () => {
    expect(
      passoDoLogin({ token: "t1", nome: "Fulano de Teste", empresa_nome: "Empresa A" })
    ).toEqual({
      tela: "painel",
      sessao: { token: "t1", nome: "Fulano de Teste", empresa_nome: "Empresa A" },
    });
  });

  it("duas ou mais: a escolha da empresa (só id, nome e logo de cada uma)", () => {
    const passo = passoDoLogin({
      etapa: "escolher_empresa",
      token_escolha: "te",
      empresas: [
        { id: "f-a", nome: "Empresa A", logo_url: "https://x/a.png", extra: "não passa" },
        { id: "f-b", nome: "Empresa B", logo_url: null },
        { nome: "sem id" },
      ],
    });
    expect(passo).toEqual({
      tela: "escolher",
      tokenEscolha: "te",
      empresas: [
        { id: "f-a", nome: "Empresa A", logo_url: "https://x/a.png" },
        { id: "f-b", nome: "Empresa B", logo_url: null },
      ],
    });
  });

  it("entrou com a provisória: a MESMA tela para todos (criar a senha, com o link 'Já uso o portal')", () => {
    expect(
      passoDoLogin({
        etapa: "senha_provisoria",
        token_ativacao: "ta",
        empresa: { nome: "Empresa B" },
      })
    ).toEqual({ tela: "ativar", tokenAtivacao: "ta", empresaNome: "Empresa B" });
    // a resposta não diz se a pessoa já tem senha: nada além disso entra no passo
    const comLixo = passoDoLogin({
      etapa: "senha_provisoria",
      token_ativacao: "ta",
      empresa: { nome: "Empresa B" },
      tem_senha: true,
    });
    expect(comLixo).toEqual({ tela: "ativar", tokenAtivacao: "ta", empresaNome: "Empresa B" });
  });

  it("resposta sem token nem etapa conhecida é erro (não entra com sessão vazia)", () => {
    expect(passoDoLogin({}).tela).toBe("erro");
    expect(passoDoLogin(null).tela).toBe("erro");
    expect(passoDoLogin({ etapa: "escolher_empresa", empresas: [] }).tela).toBe("erro");
  });
});

describe("passoDaAtivacao: depois de criar ou confirmar a senha", () => {
  it("a senha atual nasceu da provisória de outra empresa: troca obrigatória (P10)", () => {
    expect(passoDaAtivacao({ etapa: "nova_senha_obrigatoria" })).toEqual({
      tela: "troca_obrigatoria",
    });
  });
  it("liberou: entra no painel", () => {
    expect(passoDaAtivacao({ token: "t2", nome: "Fulano", empresa_nome: "Empresa B" })).toEqual({
      tela: "painel",
      sessao: { token: "t2", nome: "Fulano", empresa_nome: "Empresa B" },
    });
  });
  it("sem token: erro", () => {
    expect(passoDaAtivacao({}).tela).toBe("erro");
  });
});

describe("pedidoDaAtivacao e podeEnviarAtivacao: os três jeitos de liberar a empresa", () => {
  const usuario = "11122233344";
  it("criar a senha: só a senha nova (com as regras e a confirmação)", () => {
    expect(pedidoDaAtivacao({ modo: "criar", atual: "x", nova: "Obra#2026x" })).toEqual({
      nova_senha: "Obra#2026x",
    });
    expect(
      podeEnviarAtivacao({ modo: "criar", nova: "Obra#2026x", confirma: "Obra#2026x", usuario })
    ).toBe(true);
    expect(
      podeEnviarAtivacao({ modo: "criar", nova: "Obra#2026x", confirma: "outra", usuario })
    ).toBe(false);
    expect(podeEnviarAtivacao({ modo: "criar", nova: "123456", confirma: "123456", usuario })).toBe(
      false
    );
  });
  it("já uso o portal: só a senha atual", () => {
    expect(pedidoDaAtivacao({ modo: "ja_uso", atual: "minha", nova: "ignorada" })).toEqual({
      senha_atual: "minha",
    });
    expect(podeEnviarAtivacao({ modo: "ja_uso", atual: "minha" })).toBe(true);
    expect(podeEnviarAtivacao({ modo: "ja_uso", atual: "" })).toBe(false);
  });
  it("troca obrigatória: a senha atual (já digitada) e a nova, diferente dela", () => {
    expect(pedidoDaAtivacao({ modo: "troca", atual: "minha", nova: "Obra#2026x" })).toEqual({
      senha_atual: "minha",
      nova_senha: "Obra#2026x",
    });
    expect(
      podeEnviarAtivacao({
        modo: "troca",
        atual: "minha",
        nova: "Obra#2026x",
        confirma: "Obra#2026x",
        usuario,
      })
    ).toBe(true);
    expect(
      podeEnviarAtivacao({
        modo: "troca",
        atual: "Obra#2026x",
        nova: "Obra#2026x",
        confirma: "Obra#2026x",
        usuario,
      })
    ).toBe(false);
  });
});

describe("reacaoAoErroDaAtivacao", () => {
  it("RESET_NEGADO: fica na tela, mostra o texto do servidor e destaca o 'Já uso o portal'", () => {
    const erro = Object.assign(new Error(MSG_RESET_NEGADO), { codigo: "RESET_NEGADO" });
    expect(reacaoAoErroDaAtivacao(erro)).toEqual({
      voltarAoLogin: false,
      destacarJaUso: true,
      mensagem: MSG_RESET_NEGADO,
    });
  });
  it("token vencido ou provisória que mudou: volta ao login com o aviso", () => {
    const erro = Object.assign(new Error("Esta senha provisória não vale mais."), {
      codigo: "ATIVACAO",
    });
    expect(reacaoAoErroDaAtivacao(erro)).toEqual({
      voltarAoLogin: true,
      destacarJaUso: false,
      mensagem: "Esta senha provisória não vale mais.",
    });
  });
  it("senha atual errada e o resto: fica na tela com a mensagem", () => {
    const erro = Object.assign(new Error("Credenciais inválidas"), { codigo: "CREDENCIAIS" });
    expect(reacaoAoErroDaAtivacao(erro)).toMatchObject({
      voltarAoLogin: false,
      destacarJaUso: false,
    });
    expect(reacaoAoErroDaAtivacao(null).mensagem).toBeTruthy();
  });
});

describe("textos do portal (§8)", () => {
  it("os textos combinados no spec", () => {
    expect(TEXTOS_DO_LOGIN.escolherEmpresa).toBe("Em qual empresa você quer entrar?");
    expect(TEXTOS_DO_LOGIN.jaUsoOutraEmpresa).toBe("Já uso o portal em outra empresa");
    expect(TEXTOS_DO_LOGIN.avisoSenhaNova).toBe(
      "A senha nova vale em todas as empresas. Se você já usa o portal em outra empresa, o RH dela vai precisar " +
        "te passar uma senha provisória nova."
    );
    expect(TEXTOS_DO_LOGIN.digiteASenhaQueUsa).toBe("Digite a senha que você já usa");
    expect(TEXTOS_DO_LOGIN.trocaObrigatoria).toBe(
      "Por segurança, escolha uma senha nova, que só você conhece. A que você usa hoje foi criada com uma senha " +
        "provisória, e quem gerou essa provisória pode saber qual é."
    );
    expect(TEXTOS_DO_LOGIN.dicaOutraEmpresa).toBe(
      "Trabalha em outra empresa e ela não aparece? Peça ao RH dela a senha provisória."
    );
    expect(TEXTOS_DO_LOGIN.avisoTrocaDeSenha).toBe(
      "A senha nova vale em todas as empresas em que você usa o portal."
    );
    expect(TEXTOS_DO_LOGIN.trocarDeEmpresa).toBe("Trocar de empresa");
  });
  it("nenhum texto diz o nome de empresa nem quantas são", () => {
    for (const texto of Object.values(TEXTOS_DO_LOGIN)) expect(texto).not.toMatch(/\d/);
  });
});

describe("sessaoDaResposta", () => {
  it("guarda só o token, o nome e o nome da empresa (o CPF não vai para o aparelho)", () => {
    expect(
      sessaoDaResposta({
        token: "t",
        nome: "Fulano",
        empresa_nome: "Empresa A",
        usuario: "11122233344",
      })
    ).toEqual({ token: "t", nome: "Fulano", empresa_nome: "Empresa A" });
  });
});
