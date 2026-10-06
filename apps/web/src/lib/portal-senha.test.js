import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  confirmacaoConfere,
  confirmacaoDivergiu,
  motivoSenhaInvalida,
  normalizarUsuario,
  podeTrocarSenha,
  regrasDaSenha,
  senhaNovaIgualAtual,
  TAMANHO_MAXIMO_SENHA,
  TAMANHO_MINIMO_SENHA,
} from "./portal-senha";
import {
  motivoSenhaInvalida as motivoDoServidor,
  normalizarUsuario as normalizarNoServidor,
} from "../../../../supabase/functions/_shared/portal-funcionario.ts";

// Dados sintéticos: nenhum CPF, nome ou senha real.
const CPF = "11122233344";

describe("portal-senha: o mínimo continua 6 caracteres", () => {
  it("constantes", () => {
    expect(TAMANHO_MINIMO_SENHA).toBe(6);
    expect(TAMANHO_MAXIMO_SENHA).toBe(72);
  });
});

describe("portal-senha: motivoSenhaInvalida (cópia da regra do servidor)", () => {
  it("aceita uma senha boa", () => {
    expect(motivoSenhaInvalida("Obra#2026x", CPF)).toBeNull();
  });

  it("recusa menos de 6 caracteres e mais de 72", () => {
    expect(motivoSenhaInvalida("", CPF)).toBe("A senha precisa ter pelo menos 6 caracteres");
    expect(motivoSenhaInvalida("abc12", CPF)).toBe("A senha precisa ter pelo menos 6 caracteres");
    expect(motivoSenhaInvalida("ab".repeat(37), CPF)).toBe("Senha longa demais");
  });

  it("recusa o próprio usuário/CPF, com ou sem pontuação, e o usuário com letras", () => {
    expect(motivoSenhaInvalida(CPF, CPF)).toBe("A senha não pode ser o seu usuário/CPF");
    expect(motivoSenhaInvalida("111.222.333-44", CPF)).toBe(
      "A senha não pode ser o seu usuário/CPF"
    );
    expect(motivoSenhaInvalida("Maria.Souza", "maria.souza")).toBe(
      "A senha não pode ser o seu usuário/CPF"
    );
  });

  it("recusa senha fácil e caractere repetido", () => {
    expect(motivoSenhaInvalida("123456", CPF)).toBe("Senha fácil demais — escolha outra");
    expect(motivoSenhaInvalida("SENHA123", CPF)).toBe("Senha fácil demais — escolha outra");
    expect(motivoSenhaInvalida("aaaaaaaa", CPF)).toBe("Senha fácil demais — escolha outra");
  });

  it("sem o usuário conhecido (tela recarregada), só confere o que dá para conferir", () => {
    expect(motivoSenhaInvalida("Obra#2026x", "")).toBeNull();
    expect(motivoSenhaInvalida("123456", "")).toBe("Senha fácil demais — escolha outra");
  });
});

describe("portal-senha: sincronia com a regra do servidor", () => {
  // O servidor é quem manda (`_shared/portal-funcionario.ts`). Este teste roda as duas regras sobre as
  // mesmas entradas: se uma mudar sem a outra, ele quebra.
  const casos = [
    "",
    "a",
    "abc12",
    "abcdef",
    "aaaaaa",
    "111111",
    "123456",
    "1234567",
    "12345678",
    "123456789",
    "654321",
    "123123",
    "000000",
    "SENHA1",
    "Senha123",
    "ABC123",
    "Qwerty",
    "Obra#2026x",
    "Trocar#9",
    "ab".repeat(36),
    "ab".repeat(37),
    "a".repeat(72),
    CPF,
    "111.222.333-44",
    "111 222 333 44",
    "Maria.Souza",
    "maria.souza",
    "  maria.souza  ",
  ];
  // o servidor nunca confere com usuário vazio (todo acesso tem usuário), então esse caso fica de fora
  const usuarios = [CPF, "maria.souza"];

  it("mesma resposta para as mesmas entradas", () => {
    for (const usuario of usuarios) {
      for (const nova of casos) {
        expect(motivoSenhaInvalida(nova, usuario), JSON.stringify([nova, usuario])).toBe(
          motivoDoServidor(nova, usuario)
        );
      }
    }
  });

  it("normalizarUsuario: mesma resposta que a do servidor", () => {
    for (const bruto of [
      "",
      "  ",
      CPF,
      "111.222.333-44",
      " 111 222 333 44 ",
      "111/222",
      "Maria.Souza",
      "MARIA SOUZA",
      "maria1",
      "12ab",
    ]) {
      expect(normalizarUsuario(bruto), JSON.stringify(bruto)).toBe(normalizarNoServidor(bruto));
    }
  });

  it("toda senha fraca da lista do servidor também é recusada aqui", () => {
    const fonte = readFileSync(
      new URL("../../../../supabase/functions/_shared/portal-funcionario.ts", import.meta.url),
      "utf8"
    );
    const bloco = fonte.match(/SENHAS_FRACAS\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
    expect(bloco, "lista SENHAS_FRACAS não encontrada no servidor").not.toBeNull();
    const fracas = [...bloco[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(fracas.length).toBeGreaterThanOrEqual(10);
    for (const senha of fracas) {
      expect(motivoSenhaInvalida(senha, CPF), senha).toBe(motivoDoServidor(senha, CPF));
      expect(motivoSenhaInvalida(senha, CPF), senha).not.toBeNull();
    }
  });
});

describe("portal-senha: regrasDaSenha (lista mostrada antes de enviar)", () => {
  const ok = (lista) => Object.fromEntries(lista.map((r) => [r.id, r.ok]));

  it("tem as três regras, na ordem em que o servidor confere", () => {
    expect(regrasDaSenha("", CPF).map((r) => r.id)).toEqual(["tamanho", "usuario", "facil"]);
    for (const r of regrasDaSenha("", CPF)) expect(r.texto).toBeTruthy();
  });

  it("nada digitado: nenhuma regra aparece como cumprida", () => {
    expect(ok(regrasDaSenha("", CPF))).toEqual({ tamanho: false, usuario: false, facil: false });
  });

  it("curta demais: as outras regras esperam o mínimo digitado", () => {
    expect(ok(regrasDaSenha("abc", CPF))).toEqual({
      tamanho: false,
      usuario: false,
      facil: false,
    });
  });

  it("senha boa cumpre as três", () => {
    expect(ok(regrasDaSenha("Obra#2026x", CPF))).toEqual({
      tamanho: true,
      usuario: true,
      facil: true,
    });
  });

  it("igual ao CPF falha só a regra do usuário", () => {
    expect(ok(regrasDaSenha(CPF, CPF))).toEqual({ tamanho: true, usuario: false, facil: true });
  });

  it("fácil falha só a regra da senha fácil", () => {
    expect(ok(regrasDaSenha("123456", CPF))).toEqual({
      tamanho: true,
      usuario: true,
      facil: false,
    });
    expect(ok(regrasDaSenha("zzzzzzzz", CPF))).toEqual({
      tamanho: true,
      usuario: true,
      facil: false,
    });
  });

  it("todas cumpridas se, e somente se, o servidor aceitaria a senha", () => {
    for (const nova of ["", "abc", "123456", CPF, "Obra#2026x", "ab".repeat(37), "SENHA123"]) {
      const cumpridas = regrasDaSenha(nova, CPF).every((r) => r.ok);
      expect(cumpridas, nova).toBe(motivoDoServidor(nova, CPF) === null);
    }
  });
});

describe("portal-senha: confirmação e senha atual", () => {
  it("confirmacaoConfere exige algo digitado e igual", () => {
    expect(confirmacaoConfere("Obra#2026x", "Obra#2026x")).toBe(true);
    expect(confirmacaoConfere("Obra#2026x", "Obra#2026y")).toBe(false);
    expect(confirmacaoConfere("", "")).toBe(false);
  });

  it("confirmacaoDivergiu só reclama quando já deu para ver que não vai bater", () => {
    // ainda digitando: o que há é o começo da nova senha, sem reclamar
    expect(confirmacaoDivergiu("Obra#2026x", "")).toBe(false);
    expect(confirmacaoDivergiu("Obra#2026x", "Obra#20")).toBe(false);
    expect(confirmacaoDivergiu("Obra#2026x", "Obra#2026x")).toBe(false);
    // saiu do caminho no meio, ou chegou ao tamanho da nova e não é igual
    expect(confirmacaoDivergiu("Obra#2026x", "Obra#2027")).toBe(true);
    expect(confirmacaoDivergiu("Obra#2026x", "obra#2026x")).toBe(true);
    expect(confirmacaoDivergiu("Obra#2026x", "Obra#2026xy")).toBe(true);
  });

  it("senhaNovaIgualAtual só avisa quando as duas foram digitadas", () => {
    expect(senhaNovaIgualAtual("Obra#2026x", "Obra#2026x")).toBe(true);
    expect(senhaNovaIgualAtual("Obra#2026x", "Outra#2026")).toBe(false);
    expect(senhaNovaIgualAtual("", "")).toBe(false);
    expect(senhaNovaIgualAtual("Obra#2026x", "")).toBe(false);
  });
});

describe("portal-senha: podeTrocarSenha (habilita o botão)", () => {
  const base = { atual: "", nova: "Obra#2026x", confirma: "Obra#2026x", usuario: CPF };

  it("1º acesso (senha provisória): não pede a senha atual", () => {
    expect(podeTrocarSenha({ ...base, obrigatoria: true })).toBe(true);
  });

  it("troca voluntária: sem a senha atual o botão fica desligado", () => {
    expect(podeTrocarSenha({ ...base, obrigatoria: false })).toBe(false);
    expect(podeTrocarSenha({ ...base, obrigatoria: false, atual: "Antiga#77" })).toBe(true);
  });

  it("troca voluntária: nova igual à atual não passa", () => {
    expect(podeTrocarSenha({ ...base, obrigatoria: false, atual: "Obra#2026x" })).toBe(false);
  });

  it("senha fora da regra ou confirmação diferente não passa", () => {
    expect(
      podeTrocarSenha({ ...base, obrigatoria: true, nova: "123456", confirma: "123456" })
    ).toBe(false);
    expect(podeTrocarSenha({ ...base, obrigatoria: true, confirma: "Obra#2026y" })).toBe(false);
    expect(podeTrocarSenha({ ...base, obrigatoria: true, confirma: "" })).toBe(false);
  });
});
