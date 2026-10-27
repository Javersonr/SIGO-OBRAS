import { describe, it, expect } from "vitest";
import {
  MSG_PREVIA_CONCLUSAO,
  ROTULO_LIDA,
  ROTULO_TAREFA,
  TIPOS_DE_LEITURA,
  avisoDeAulaConcluida,
  botaoDeLeitura,
  chaveDoPainelDaAula,
  ehLeitura,
  rotuloDoTipoNaLista,
  tempoPrevisto,
} from "./portal-leitura";

describe("botaoDeLeitura (A5: acende ao chegar ao fim, sem relógio)", () => {
  it("texto e PDF: 'Marcar como lida — li e compreendi', desligado até o fim e com a dica de rolar", () => {
    expect(botaoDeLeitura({ tipo: "texto", chegouAoFim: false })).toEqual({
      rotulo: ROTULO_LIDA,
      habilitado: false,
      dica: "Role o texto até o fim para liberar o botão.",
    });
    expect(botaoDeLeitura({ tipo: "pdf" })).toEqual({
      rotulo: ROTULO_LIDA,
      habilitado: false,
      dica: "Role a apostila até o fim da última página para liberar o botão.",
    });
    expect(ROTULO_LIDA).toBe("Marcar como lida — li e compreendi");
  });

  it("chegou ao fim: acende, sem dica", () => {
    for (const tipo of ["texto", "pdf"]) {
      expect(botaoDeLeitura({ tipo, chegouAoFim: true })).toEqual({
        rotulo: ROTULO_LIDA,
        habilitado: true,
        dica: "",
      });
    }
  });

  it("tarefa: 'Fiz a atividade', com a mesma regra do fim", () => {
    expect(ROTULO_TAREFA).toBe("Fiz a atividade");
    expect(botaoDeLeitura({ tipo: "tarefa" })).toEqual({
      rotulo: ROTULO_TAREFA,
      habilitado: false,
      dica: "Leia as instruções até o fim para liberar o botão.",
    });
    expect(botaoDeLeitura({ tipo: "tarefa", chegouAoFim: true })).toEqual({
      rotulo: ROTULO_TAREFA,
      habilitado: true,
      dica: "",
    });
  });

  it("some com a aula concluída, com a apostila indisponível e nos tipos que não são leitura", () => {
    expect(botaoDeLeitura({ tipo: "texto", chegouAoFim: true, concluida: true })).toBeNull();
    expect(botaoDeLeitura({ tipo: "pdf", chegouAoFim: true, indisponivel: true })).toBeNull();
    for (const tipo of ["video", "questionario", "caso", undefined, null, "outro"]) {
      expect(botaoDeLeitura({ tipo, chegouAoFim: true })).toBeNull();
    }
    expect(botaoDeLeitura()).toBeNull();
  });

  it("prévia do RT: o botão aparece e acende do mesmo jeito, e a dica avisa que nada é gravado", () => {
    expect(botaoDeLeitura({ tipo: "texto", previa: true })).toMatchObject({ habilitado: false });
    expect(botaoDeLeitura({ tipo: "texto", chegouAoFim: true, previa: true })).toEqual({
      rotulo: ROTULO_LIDA,
      habilitado: true,
      dica: "Prévia: o clique não conclui a aula nem grava nada.",
    });
    expect(MSG_PREVIA_CONCLUSAO).toBe(
      "Prévia: aqui a aula seria concluída para o aluno. Nada foi gravado."
    );
  });

  it("nenhum texto fala em tempo (não há contagem regressiva)", () => {
    for (const tipo of TIPOS_DE_LEITURA) {
      for (const chegouAoFim of [false, true]) {
        const b = botaoDeLeitura({ tipo, chegouAoFim });
        expect(`${b.rotulo} ${b.dica}`).not.toMatch(/faltam|\bmin\b|tempo/i);
      }
    }
  });
});

describe("ehLeitura e rótulo do tipo na lista", () => {
  it("leitura = PDF, texto e tarefa", () => {
    expect(TIPOS_DE_LEITURA).toEqual(["pdf", "texto", "tarefa"]);
    expect(TIPOS_DE_LEITURA.every(ehLeitura)).toBe(true);
    for (const tipo of ["video", "questionario", "caso", undefined]) {
      expect(ehLeitura(tipo)).toBe(false);
    }
  });

  it("os três tipos de atividade ganham rótulo; vídeo, PDF e texto ficam como antes", () => {
    expect(rotuloDoTipoNaLista("questionario")).toBe("questionário");
    expect(rotuloDoTipoNaLista("caso")).toBe("estudo de caso");
    expect(rotuloDoTipoNaLista("tarefa")).toBe("atividade de estudo");
    for (const tipo of ["video", "pdf", "texto", undefined]) {
      expect(rotuloDoTipoNaLista(tipo)).toBe("");
    }
  });
});

describe("tempoPrevisto (tarefa: o tempo cadastrado da aula)", () => {
  it("minutos e horas", () => {
    expect(tempoPrevisto(2100)).toBe("35 min");
    expect(tempoPrevisto(900)).toBe("15 min");
    expect(tempoPrevisto(3600)).toBe("1 h");
    expect(tempoPrevisto(4200)).toBe("1 h 10 min");
    expect(tempoPrevisto(20)).toBe("1 min");
    expect(tempoPrevisto("600")).toBe("10 min");
  });

  it("sem tempo válido: null", () => {
    for (const v of [0, -60, null, undefined, NaN, "abc"]) {
      expect(tempoPrevisto(v)).toBeNull();
    }
  });
});

describe("avisoDeAulaConcluida (atividade concluída pela ação própria)", () => {
  const dados = ({ aulas, temAvaliacao = true, matricula = {} }) => ({
    cursos: [
      { matricula: { id: "outra" }, curso: { tem_avaliacao: true }, aulas: [] },
      {
        matricula: { id: "m1", status: "em_andamento", avaliacao_aprovada: false, ...matricula },
        curso: { tem_avaliacao: temAvaliacao },
        aulas,
      },
    ],
  });
  const feita = { concluida: true };
  const pendente = { concluida: false };

  it("sem os dados novos (a busca falhou): só o que o servidor confirmou", () => {
    expect(
      avisoDeAulaConcluida({ resposta: { aula_concluida: true }, dados: null, matriculaId: "m1" })
    ).toBe("Aula concluída.");
    expect(avisoDeAulaConcluida()).toBe("Aula concluída.");
  });

  it("curso concluído", () => {
    expect(
      avisoDeAulaConcluida({
        resposta: { curso_concluido: true },
        dados: dados({ aulas: [feita] }),
        matriculaId: "m1",
      })
    ).toBe("Curso concluído!");
  });

  it("ainda há aulas: a próxima está liberada", () => {
    expect(
      avisoDeAulaConcluida({
        resposta: {},
        dados: dados({ aulas: [feita, pendente] }),
        matriculaId: "m1",
      })
    ).toBe("Aula concluída — a próxima já está liberada.");
  });

  it("todas feitas e há prova final: manda para a avaliação, mesmo sem `precisa_avaliacao` na resposta (questionário)", () => {
    expect(
      avisoDeAulaConcluida({
        resposta: { aprovada: true },
        dados: dados({ aulas: [feita, feita] }),
        matriculaId: "m1",
      })
    ).toBe("Todas as aulas concluídas — agora faça a avaliação final.");
  });

  it("o `precisa_avaliacao` da resposta (caso) também manda para a avaliação", () => {
    expect(
      avisoDeAulaConcluida({
        resposta: { precisa_avaliacao: true },
        dados: dados({ aulas: [feita, pendente] }),
        matriculaId: "m1",
      })
    ).toBe("Todas as aulas concluídas — agora faça a avaliação final.");
  });

  it("todas feitas, com a prova já aprovada ou sem prova: só 'Aula concluída.'", () => {
    expect(
      avisoDeAulaConcluida({
        resposta: {},
        dados: dados({ aulas: [feita], matricula: { avaliacao_aprovada: true } }),
        matriculaId: "m1",
      })
    ).toBe("Aula concluída.");
    expect(
      avisoDeAulaConcluida({
        resposta: {},
        dados: dados({ aulas: [feita], temAvaliacao: false }),
        matriculaId: "m1",
      })
    ).toBe("Aula concluída.");
  });
});

describe("chaveDoPainelDaAula (a aula aberta começa no topo da janela)", () => {
  it("é o id da aula aberta, só no modo das aulas", () => {
    expect(chaveDoPainelDaAula({ aulaId: "a1", modo: "aulas" })).toBe("a1");
    expect(chaveDoPainelDaAula({ aulaId: "a2", modo: "aulas" })).toBe("a2");
  });

  it("trocar de aula muda a chave; a mesma aula (dados refeitos) mantém a chave e não rola de novo", () => {
    const a = chaveDoPainelDaAula({ aulaId: "a1", modo: "aulas" });
    expect(chaveDoPainelDaAula({ aulaId: "a1", modo: "aulas" })).toBe(a);
    expect(chaveDoPainelDaAula({ aulaId: "a2", modo: "aulas" })).not.toBe(a);
  });

  it("voltar da prova às aulas muda a chave (null -> id): o painel remonta e começa no topo", () => {
    expect(chaveDoPainelDaAula({ aulaId: "a1", modo: "avaliacao" })).toBeNull();
    expect(chaveDoPainelDaAula({ aulaId: "a1", modo: "aulas" })).toBe("a1");
  });

  it("sem aula aberta ou sem dados: null (nada para rolar)", () => {
    for (const p of [
      { aulaId: null, modo: "aulas" },
      { aulaId: "", modo: "aulas" },
      {},
      undefined,
    ]) {
      expect(chaveDoPainelDaAula(p)).toBeNull();
    }
  });
});
