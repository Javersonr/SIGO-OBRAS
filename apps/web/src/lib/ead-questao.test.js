import { describe, it, expect } from "vitest";
import { normalizarQuestao } from "./ead-questao";

describe("normalizarQuestao", () => {
  it("remapeia a correta quando remove um campo vazio anterior", () => {
    expect(
      normalizarQuestao({ pergunta: " Pergunta ", opcoes: ["A", " ", "C", "D"], correta: 2 }).dados
    ).toEqual({ pergunta: "Pergunta", opcoes: ["A", "C", "D"], correta: 1, comentario: null });
  });
  it("recusa a alternativa correta vazia", () => {
    expect(normalizarQuestao({ pergunta: "Pergunta", opcoes: ["A", "", "C"], correta: 1 }).ok).toBe(
      false
    );
  });
  it("preserva cinco alternativas e seu gabarito", () => {
    const questao = normalizarQuestao({
      pergunta: "Pergunta",
      opcoes: ["A", "B", "C", "D", "E"],
      correta: 4,
    });
    expect(questao.dados.opcoes).toHaveLength(5);
    expect(questao.dados.correta).toBe(4);
  });
  it("recusa pergunta vazia, menos de duas opções e índice inválido", () => {
    for (const dados of [
      { pergunta: " ", opcoes: ["A", "B"], correta: 0 },
      { pergunta: "Pergunta", opcoes: ["A", ""], correta: 0 },
      { pergunta: "Pergunta", opcoes: ["A", "B"], correta: -1 },
      { pergunta: "Pergunta", opcoes: ["A", "B"], correta: 2 },
    ])
      expect(normalizarQuestao(dados).ok).toBe(false);
  });
});
