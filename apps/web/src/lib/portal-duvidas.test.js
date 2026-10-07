import { describe, it, expect } from "vitest";
import {
  mensagemDuvidaEnviada,
  resumoDasDuvidas,
  rotuloDaAulaDaDuvida,
  textoDoResumo,
} from "./portal-duvidas";

// Dados fictícios (o repositório é público).
const aulas = [
  { id: "a1", numero: 1, titulo: "Primeira aula" },
  { id: "a2", numero: 2, titulo: "Segunda aula" },
];

describe("rotuloDaAulaDaDuvida: em que aula o aluno perguntou", () => {
  it("mostra o número e o título da aula", () => {
    expect(rotuloDaAulaDaDuvida({ aula_id: "a2" }, aulas)).toBe("Aula 2: Segunda aula");
    expect(rotuloDaAulaDaDuvida({ aula_id: "a1" }, aulas)).toBe("Aula 1: Primeira aula");
  });

  it("dúvida do curso (sem aula) não tem rótulo", () => {
    expect(rotuloDaAulaDaDuvida({ aula_id: null }, aulas)).toBeNull();
    expect(rotuloDaAulaDaDuvida({}, aulas)).toBeNull();
  });

  it("aula que já não está no curso (apagada, lista vazia) também não tem rótulo", () => {
    expect(rotuloDaAulaDaDuvida({ aula_id: "a9" }, aulas)).toBeNull();
    expect(rotuloDaAulaDaDuvida({ aula_id: "a1" }, [])).toBeNull();
    expect(rotuloDaAulaDaDuvida({ aula_id: "a1" }, undefined)).toBeNull();
    expect(rotuloDaAulaDaDuvida(null, aulas)).toBeNull();
  });

  it("aula sem número usa só o título", () => {
    expect(rotuloDaAulaDaDuvida({ aula_id: "x" }, [{ id: "x", titulo: "Aula sem número" }])).toBe(
      "Aula sem número"
    );
  });
});

describe("resumoDasDuvidas", () => {
  it("separa respondidas e aguardando (resposta só com espaços ainda aguarda)", () => {
    expect(
      resumoDasDuvidas([
        { id: 1, resposta: "Resposta" },
        { id: 2, resposta: null },
        { id: 3, resposta: "   " },
        { id: 4, resposta: "Outra" },
      ])
    ).toEqual({ total: 4, respondidas: 2, aguardando: 2 });
    expect(resumoDasDuvidas([])).toEqual({ total: 0, respondidas: 0, aguardando: 0 });
    expect(resumoDasDuvidas(undefined)).toEqual({ total: 0, respondidas: 0, aguardando: 0 });
  });
});

describe("mensagemDuvidaEnviada", () => {
  it("diz que o tutor foi avisado só quando o servidor avisou", () => {
    expect(mensagemDuvidaEnviada(true)).toMatch(/tutor foi avisado/i);
    expect(mensagemDuvidaEnviada(false)).not.toMatch(/foi avisado/i);
    expect(mensagemDuvidaEnviada(undefined)).not.toMatch(/foi avisado/i);
  });

  it("sempre manda o aluno ao botão Atualizar para ver a resposta sem sair do curso", () => {
    for (const avisado of [true, false, undefined]) {
      expect(mensagemDuvidaEnviada(avisado)).toMatch(/Atualizar/);
    }
  });
});

describe("textoDoResumo: a linha que diz como estão as dúvidas do aluno", () => {
  it("sem dúvida não há linha", () => {
    expect(textoDoResumo({ total: 0, respondidas: 0, aguardando: 0 })).toBeNull();
    expect(textoDoResumo(undefined)).toBeNull();
  });

  it("conta no singular e no plural", () => {
    expect(textoDoResumo({ total: 1, respondidas: 0, aguardando: 1 })).toBe(
      "1 dúvida: nenhuma respondida, 1 aguardando"
    );
    expect(textoDoResumo({ total: 1, respondidas: 1, aguardando: 0 })).toBe(
      "1 dúvida: 1 respondida"
    );
    expect(textoDoResumo({ total: 3, respondidas: 2, aguardando: 1 })).toBe(
      "3 dúvidas: 2 respondidas, 1 aguardando"
    );
    expect(textoDoResumo({ total: 2, respondidas: 2, aguardando: 0 })).toBe(
      "2 dúvidas: 2 respondidas"
    );
    expect(textoDoResumo({ total: 2, respondidas: 0, aguardando: 2 })).toBe(
      "2 dúvidas: nenhuma respondida, 2 aguardando"
    );
  });
});
