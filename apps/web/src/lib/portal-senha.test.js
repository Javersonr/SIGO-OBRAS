import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  avisoDeSenhaLonga,
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

describe("portal-senha: usuário desconhecido (tela recarregada) não mostra 'cumprida' sem avaliar (T27, M1)", () => {
  const usuarioDe = (lista) => lista.find((r) => r.id === "usuario");

  it("a regra do usuário fica pendente e diz que o servidor confere ao salvar", () => {
    for (const desconhecido of ["", undefined, null]) {
      const r = usuarioDe(regrasDaSenha("Obra#2026x", desconhecido));
      expect(r.ok, String(desconhecido)).toBe(false);
      expect(r.aoSalvar).toBe(true);
      expect(r.texto).toMatch(/CPF ou usuário/);
      expect(r.texto).toMatch(/servidor confere/i);
    }
  });

  it("nem a senha igual ao CPF faz a regra aparecer cumprida (o aluno não vê tudo verde à toa)", () => {
    const regras = regrasDaSenha(CPF, "");
    expect(usuarioDe(regras).ok).toBe(false);
    expect(regras.filter((r) => r.id !== "usuario").every((r) => r.ok)).toBe(true);
  });

  it("com o usuário conhecido nada muda: é uma regra comum, avaliada na hora", () => {
    const boa = usuarioDe(regrasDaSenha("Obra#2026x", CPF));
    expect(boa.ok).toBe(true);
    expect(boa.aoSalvar).toBe(false);
    expect(boa.texto).toBe("Diferente do seu CPF ou usuário");
    expect(usuarioDe(regrasDaSenha(CPF, CPF)).ok).toBe(false);
  });

  it("a regra que fica para o servidor não trava o botão (senão a tela recarregada nunca salvaria)", () => {
    const dados = { atual: "", nova: "Obra#2026x", confirma: "Obra#2026x", obrigatoria: true };
    expect(podeTrocarSenha({ ...dados, usuario: "" })).toBe(true);
    // as outras regras continuam valendo sem o usuário
    expect(podeTrocarSenha({ ...dados, usuario: "", nova: "123456", confirma: "123456" })).toBe(
      false
    );
    expect(podeTrocarSenha({ ...dados, usuario: "", nova: "abc", confirma: "abc" })).toBe(false);
  });

  it("todas as regras que a tela consegue conferir cumpridas = o servidor aceitaria (usuário desconhecido)", () => {
    for (const nova of ["", "abc", "123456", "Obra#2026x", "ab".repeat(37), "SENHA123"]) {
      const cumpridas = regrasDaSenha(nova, "")
        .filter((r) => !r.aoSalvar)
        .every((r) => r.ok);
      expect(cumpridas, nova).toBe(motivoDoServidor(nova, "") === null);
    }
  });
});

describe("portal-senha: senha longa demais avisa em vez de truncar em silêncio (T27, m4)", () => {
  it("até 72 caracteres não há aviso", () => {
    expect(avisoDeSenhaLonga("")).toBeNull();
    expect(avisoDeSenhaLonga(undefined)).toBeNull();
    expect(avisoDeSenhaLonga("x".repeat(TAMANHO_MAXIMO_SENHA))).toBeNull();
  });

  it("acima de 72 caracteres o aviso diz quantos foram e qual é o máximo", () => {
    const aviso = avisoDeSenhaLonga("x".repeat(TAMANHO_MAXIMO_SENHA + 1));
    expect(aviso).toContain("73");
    expect(aviso).toContain(String(TAMANHO_MAXIMO_SENHA));
    expect(aviso).toMatch(/mais curta/i);
    expect(avisoDeSenhaLonga("y".repeat(200))).toContain("200");
  });

  it("a regra do tamanho não fica cumprida e o botão não liga com a senha acima do limite", () => {
    const longa = "Obra#26".padEnd(TAMANHO_MAXIMO_SENHA + 5, "x");
    expect(regrasDaSenha(longa, CPF).find((r) => r.id === "tamanho").ok).toBe(false);
    expect(
      podeTrocarSenha({ atual: "", nova: longa, confirma: longa, obrigatoria: true, usuario: CPF })
    ).toBe(false);
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

  it("confirmacaoDivergiu: o único jeito de avisar é a confirmação NÃO ser o começo da nova senha (T27, m2)", () => {
    // o que sobrava do critério antigo ("chegou ao tamanho da nova") nunca valia sozinho: confirmação
    // do tamanho da nova (ou maior) que ainda é o começo dela só existe quando é igual (sem aviso)
    const novas = ["", "a", "Obra#2026x", "senha longa com espaço"];
    for (const nova of novas) {
      for (const confirma of ["", "a", "ab", "Obra", "Obra#2026x", "Obra#2026xy", "senha longa"]) {
        const esperado = !!confirma && confirma !== nova && !nova.startsWith(confirma);
        expect(confirmacaoDivergiu(nova, confirma), `${nova} | ${confirma}`).toBe(esperado);
      }
    }
    // confirmação a mais depois de igual à nova: saiu do caminho (a nova NÃO começa por ela)
    expect(confirmacaoDivergiu("abc", "abcd")).toBe(true);
    // confirmação mais curta e ainda no caminho: sem aviso
    expect(confirmacaoDivergiu("abc", "ab")).toBe(false);
    // sem nova senha digitada ainda, qualquer confirmação já destoa
    expect(confirmacaoDivergiu("", "a")).toBe(true);
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
