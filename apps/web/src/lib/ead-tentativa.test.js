import { describe, it, expect } from "vitest";
import { detalharTentativa } from "./ead-tentativa";

// Dados sintéticos: perguntas e alternativas inventadas, nenhum nome ou identificador real.
const prova = [
  {
    questao_id: "q1",
    ordem: 1,
    pergunta: "Primeira?",
    opcoes: ["a1", "a2", "a3", "a4"],
    correta: 2,
  },
  { questao_id: "q2", ordem: 2, pergunta: "Segunda?", opcoes: ["b1", "b2", "b3"], correta: 0 },
];

const respostas = [
  // q1 foi mostrada em 2º lugar, com as alternativas embaralhadas; o aluno marcou a original 2 (certa)
  {
    questao_id: "q1",
    resposta: 2,
    acertou: true,
    posicao_exibida: 2,
    ordem_opcoes_exibida: [3, 2, 0, 1],
  },
  // q2 foi a 1ª; o aluno marcou a original 1 (errada); a certa é a original 0
  {
    questao_id: "q2",
    resposta: 1,
    acertou: false,
    posicao_exibida: 1,
    ordem_opcoes_exibida: [1, 0, 2],
  },
];

const tentativa = { id: "t1", numero: 1, acertos: 1, total: 2, nota: 50, prova, respostas };

describe("detalharTentativa: a prova como o aluno viu", () => {
  it("ordena as questões pela posição exibida ao aluno", () => {
    const d = detalharTentativa(tentativa);
    expect(d.temDetalhe).toBe(true);
    expect(d.questoes.map((q) => [q.posicao, q.pergunta])).toEqual([
      [1, "Segunda?"],
      [2, "Primeira?"],
    ]);
  });

  it("lista as alternativas na ordem exibida, com letra, marcada e correta", () => {
    const [segunda, primeira] = detalharTentativa(tentativa).questoes;
    // q1: ordem exibida [3, 2, 0, 1] -> a4, a3, a1, a2; a certa é a3 (original 2) e foi a marcada
    expect(primeira.alternativas.map((a) => [a.letra, a.texto])).toEqual([
      ["A", "a4"],
      ["B", "a3"],
      ["C", "a1"],
      ["D", "a2"],
    ]);
    expect(primeira.alternativas.filter((a) => a.marcada).map((a) => a.texto)).toEqual(["a3"]);
    expect(primeira.alternativas.filter((a) => a.correta).map((a) => a.texto)).toEqual(["a3"]);
    expect(primeira.status).toBe("acertou");
    // q2: ordem exibida [1, 0, 2] -> b2, b1, b3; marcou b2 (errada) e a certa é b1
    expect(segunda.alternativas.map((a) => a.texto)).toEqual(["b2", "b1", "b3"]);
    expect(segunda.alternativas.find((a) => a.marcada)?.texto).toBe("b2");
    expect(segunda.alternativas.find((a) => a.correta)?.texto).toBe("b1");
    expect(segunda.status).toBe("errou");
  });

  it("guarda o índice original de cada alternativa (a resposta gravada é o índice original)", () => {
    const [, primeira] = detalharTentativa(tentativa).questoes;
    expect(primeira.alternativas.map((a) => a.indiceOriginal)).toEqual([3, 2, 0, 1]);
  });

  it("questão sem resposta aparece como 'sem_resposta', sem alternativa marcada", () => {
    const d = detalharTentativa({
      ...tentativa,
      respostas: [{ questao_id: "q1", resposta: null, acertou: false, posicao_exibida: 1 }],
    });
    const q1 = d.questoes.find((q) => q.pergunta === "Primeira?");
    expect(q1.status).toBe("sem_resposta");
    expect(q1.alternativas.some((a) => a.marcada)).toBe(false);
    // q2 nem tem linha de resposta: também sem resposta
    expect(d.questoes.find((q) => q.pergunta === "Segunda?").status).toBe("sem_resposta");
  });

  it("resposta fora das alternativas (lixo) não marca nenhuma", () => {
    for (const resposta of [9, -1, 1.5, "x", undefined]) {
      const d = detalharTentativa({
        ...tentativa,
        respostas: [{ questao_id: "q1", resposta, acertou: false }],
      });
      const q1 = d.questoes.find((q) => q.pergunta === "Primeira?");
      expect(
        q1.alternativas.some((a) => a.marcada),
        String(resposta)
      ).toBe(false);
    }
  });
});

describe("detalharTentativa: tentativas antigas e dados estranhos", () => {
  it("sem a ordem exibida, usa a ordem do cadastro e avisa que a ordem não foi gravada", () => {
    const antigas = respostas.map(({ questao_id, resposta, acertou }) => ({
      questao_id,
      resposta,
      acertou,
    }));
    const d = detalharTentativa({ ...tentativa, respostas: antigas });
    // sem posição, a ordem das questões é a da prova gravada
    expect(d.questoes.map((q) => q.pergunta)).toEqual(["Primeira?", "Segunda?"]);
    expect(d.questoes[0].alternativas.map((a) => a.texto)).toEqual(["a1", "a2", "a3", "a4"]);
    expect(d.questoes.every((q) => q.ordemRegistrada === false)).toBe(true);
    expect(detalharTentativa(tentativa).questoes.every((q) => q.ordemRegistrada)).toBe(true);
  });

  it("ordem de alternativas que não é uma permutação é ignorada (não inventa nem repete texto)", () => {
    for (const ordem of [[0, 0, 1, 2], [0, 1], [0, 1, 2, 9], ["0", "1", "2", "3"], null, "x"]) {
      const d = detalharTentativa({
        ...tentativa,
        respostas: [{ questao_id: "q1", resposta: 2, acertou: true, ordem_opcoes_exibida: ordem }],
      });
      const q1 = d.questoes.find((q) => q.pergunta === "Primeira?");
      expect(
        q1.alternativas.map((a) => a.texto),
        JSON.stringify(ordem)
      ).toEqual(["a1", "a2", "a3", "a4"]);
      expect(q1.ordemRegistrada).toBe(false);
    }
  });

  it("prova e respostas como texto JSON (jsonb legado) também funcionam", () => {
    const d = detalharTentativa({
      ...tentativa,
      prova: JSON.stringify(prova),
      respostas: JSON.stringify(respostas),
    });
    expect(d.temDetalhe).toBe(true);
    expect(d.questoes).toHaveLength(2);
  });

  it("sem prova gravada: não há detalhe a mostrar (e nada estoura)", () => {
    for (const t of [
      undefined,
      null,
      {},
      { prova: null, respostas: null },
      { prova: [], respostas: [] },
      { prova: "lixo", respostas: "lixo" },
      { prova: { a: 1 }, respostas: 3 },
    ]) {
      const d = detalharTentativa(t);
      expect(d.temDetalhe, JSON.stringify(t)).toBe(false);
      expect(d.questoes).toEqual([]);
    }
  });

  it("sem gabarito gravado, nenhuma alternativa é 'correta' e o status vem do que foi gravado", () => {
    const semGabarito = prova.map(({ correta, ...resto }) => resto);
    const d = detalharTentativa({ ...tentativa, prova: semGabarito });
    expect(d.questoes.every((q) => q.alternativas.every((a) => !a.correta))).toBe(true);
    expect(d.questoes.map((q) => q.status)).toEqual(["errou", "acertou"]);
  });

  it("alternativas que não são texto viram texto (não mostram [object Object])", () => {
    const d = detalharTentativa({
      ...tentativa,
      prova: [{ questao_id: "q1", pergunta: "P?", opcoes: [{ texto: "x" }, 5, null], correta: 0 }],
      respostas: [],
    });
    expect(d.questoes[0].alternativas.map((a) => a.texto)).toEqual(["x", "5", ""]);
  });

  it("posições repetidas ou ausentes mantêm a ordem da prova gravada (ordenação estável)", () => {
    const d = detalharTentativa({
      ...tentativa,
      respostas: [
        { questao_id: "q1", resposta: 0, posicao_exibida: 1 },
        { questao_id: "q2", resposta: 0, posicao_exibida: 1 },
      ],
    });
    expect(d.questoes.map((q) => q.pergunta)).toEqual(["Primeira?", "Segunda?"]);
  });
});
