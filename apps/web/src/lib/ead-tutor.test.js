import { describe, it, expect } from "vitest";
import {
  MAX_TUTOR_ATENDIMENTO,
  MAX_TUTOR_NOME,
  dadosDoTutorParaGravar,
  tutorDoCurso,
} from "./ead-tutor";

// Só dados fictícios (o repositório é público).

describe("dadosDoTutorParaGravar: o que o RH digitou vira o que o banco guarda", () => {
  it("tudo vazio grava três nulos (o RH preenche quando quiser, D4)", () => {
    for (const curso of [
      {},
      { tutor_nome: "", tutor_telefone: "", tutor_atendimento: "" },
      { tutor_nome: "  ", tutor_telefone: "   ", tutor_atendimento: "\n" },
      { tutor_nome: null, tutor_telefone: null, tutor_atendimento: undefined },
    ]) {
      expect(dadosDoTutorParaGravar(curso)).toEqual({
        ok: true,
        dados: { tutor_nome: null, tutor_telefone: null, tutor_atendimento: null },
      });
    }
  });

  it("apara nome e atendimento", () => {
    const r = dadosDoTutorParaGravar({
      tutor_nome: "  Tutor Teste ",
      tutor_atendimento: "  Dias úteis, 8h às 17h; resposta em até 1 dia útil\n",
    });
    expect(r.ok).toBe(true);
    expect(r.dados.tutor_nome).toBe("Tutor Teste");
    expect(r.dados.tutor_atendimento).toBe("Dias úteis, 8h às 17h; resposta em até 1 dia útil");
  });

  it("o telefone é gravado na máscara nacional, qualquer que seja o jeito de digitar", () => {
    for (const digitado of [
      "11999990000",
      "(11) 99999-0000",
      " 11 99999 0000 ",
      "+55 11 99999-0000",
      "5511999990000",
    ]) {
      const r = dadosDoTutorParaGravar({ tutor_telefone: digitado });
      expect(r, digitado).toEqual({
        ok: true,
        dados: { tutor_nome: null, tutor_telefone: "(11) 99999-0000", tutor_atendimento: null },
      });
    }
    expect(dadosDoTutorParaGravar({ tutor_telefone: "1133330000" }).dados.tutor_telefone).toBe(
      "(11) 3333-0000"
    );
  });

  it("telefone que o envio não aceita NÃO grava e diz o motivo", () => {
    for (const ruim of ["999", "(11) 9999-000", "abc", "119999900001", "(11) 89999-0000"]) {
      const r = dadosDoTutorParaGravar({ tutor_telefone: ruim });
      expect(r.ok, ruim).toBe(false);
      expect(r.erro, ruim).toMatch(/telefone/i);
    }
  });

  it("nome e atendimento têm tamanho máximo (o aluno os lê na tela do curso)", () => {
    const nome = dadosDoTutorParaGravar({ tutor_nome: "a".repeat(MAX_TUTOR_NOME + 1) });
    expect(nome.ok).toBe(false);
    expect(nome.erro).toMatch(/nome do tutor/i);
    const atendimento = dadosDoTutorParaGravar({
      tutor_atendimento: "a".repeat(MAX_TUTOR_ATENDIMENTO + 1),
    });
    expect(atendimento.ok).toBe(false);
    expect(atendimento.erro).toMatch(/atendimento/i);
    expect(dadosDoTutorParaGravar({ tutor_nome: "a".repeat(MAX_TUTOR_NOME) }).ok).toBe(true);
    expect(
      dadosDoTutorParaGravar({ tutor_atendimento: "a".repeat(MAX_TUTOR_ATENDIMENTO) }).ok
    ).toBe(true);
  });

  it("os limites são os do banco (migração 0140)", () => {
    expect(MAX_TUTOR_NOME).toBe(120);
    expect(MAX_TUTOR_ATENDIMENTO).toBe(300);
  });
});

describe("tutorDoCurso: o que o aluno vê do tutor", () => {
  it("sem nome e sem atendimento não há o que mostrar", () => {
    expect(tutorDoCurso(null)).toBeNull();
    expect(tutorDoCurso({})).toBeNull();
    expect(tutorDoCurso({ tutor_nome: "  ", tutor_atendimento: "" })).toBeNull();
    // o telefone nunca vai ao aluno: sozinho, não faz o tutor aparecer
    expect(tutorDoCurso({ tutor_telefone: "(11) 99999-0000" })).toBeNull();
  });

  it("mostra só o que existe", () => {
    expect(tutorDoCurso({ tutor_nome: " Tutor Teste " })).toEqual({
      nome: "Tutor Teste",
      atendimento: null,
    });
    expect(tutorDoCurso({ tutor_atendimento: "Dias úteis" })).toEqual({
      nome: null,
      atendimento: "Dias úteis",
    });
    expect(tutorDoCurso({ tutor_nome: "Tutor Teste", tutor_atendimento: "Dias úteis" })).toEqual({
      nome: "Tutor Teste",
      atendimento: "Dias úteis",
    });
  });

  it("não devolve o telefone, mesmo que o curso o traga", () => {
    const t = tutorDoCurso({
      tutor_nome: "Tutor Teste",
      tutor_telefone: "(11) 99999-0000",
      tutor_atendimento: "Dias úteis",
    });
    expect(Object.keys(t).sort()).toEqual(["atendimento", "nome"]);
  });
});
