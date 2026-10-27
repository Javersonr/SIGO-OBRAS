import { describe, it, expect } from "vitest";
import {
  CODIGOS_SEM_NOVA_TENTATIVA,
  MSG_QUESTIONARIO_INVALIDO,
  acertosNecessarios,
  detalheDaTentativa,
  idDoRascunhoDoQuestionario,
  questionarioParaTela,
  reacaoAoErroDaAbertura,
  reacaoAoErroDoEnvio,
  resultadoDoQuestionario,
  textoDasFaltas,
  textoDoQuestionarioConcluido,
} from "./portal-questionario";
import {
  MSG_SEM_CONEXAO,
  PREFIXO_PROVA,
  guardarRascunhoProva,
  lerRascunhoProva,
  limparRascunhosPortal,
} from "./portal-curso";

/** localStorage de mentira (só o que o portal usa). */
function memoria() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    key: (i) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
    chaves: () => [...m.keys()],
  };
}

/** Erro no formato do ErroPortal (components/portal-funcionario/api.js): `extra` é o corpo da resposta. */
const erro = (codigo, mensagem = "Recusado", extra = {}) =>
  Object.assign(new Error(mensagem), { codigo, extra: { codigo, error: mensagem, ...extra } });

// resposta sintética de `questionario_abrir`: sorteada e sem gabarito
const aberta = {
  success: true,
  concluida: false,
  tentativa: 2,
  nota_minima: 80,
  questoes: [
    { id: "x2", pergunta: "Segunda?", opcoes: ["c", "a", "b"], ordem_opcoes: [2, 0, 1] },
    { id: "x1", pergunta: "Primeira?", opcoes: ["b", "a"], ordem_opcoes: [1, 0] },
  ],
};

describe("questionarioParaTela", () => {
  it("tentativa aberta: as questões na ordem do servidor, com o índice original de cada alternativa", () => {
    const tela = questionarioParaTela(aberta);
    expect(tela.fase).toBe("respondendo");
    expect(tela.prova).toMatchObject({ tentativa: 2, notaMinima: 80 });
    expect(tela.prova.questoes.map((q) => q.id)).toEqual(["x2", "x1"]);
    expect(tela.prova.questoes[0].exibicao).toEqual([
      { texto: "c", indice: 2 },
      { texto: "a", indice: 0 },
      { texto: "b", indice: 1 },
    ]);
  });

  it("o gabarito e o comentário só passam na prévia do RT", () => {
    const comGabarito = {
      ...aberta,
      questoes: aberta.questoes.map((q) => ({ ...q, correta: 0, comentario: "Reservado" })),
    };
    expect(questionarioParaTela(comGabarito).prova.questoes[0]).not.toHaveProperty("correta");
    expect(JSON.stringify(questionarioParaTela(comGabarito))).not.toContain("Reservado");
    expect(questionarioParaTela(comGabarito, { previa: true }).prova.questoes[0]).toMatchObject({
      correta: 0,
      comentario: "Reservado",
    });
  });

  it("aula concluída: a melhor nota e as tentativas, sem questão", () => {
    expect(
      questionarioParaTela({ concluida: true, nota_minima: 80, melhor_nota: 88, tentativas: 2 })
    ).toEqual({ fase: "concluido", notaMinima: 80, melhorNota: 88, tentativas: 2 });
  });

  it("resposta fora do formato: null (a tela mostra o problema)", () => {
    for (const ruim of [
      null,
      undefined,
      {},
      { ...aberta, questoes: [] },
      { ...aberta, tentativa: 0 },
      {
        ...aberta,
        questoes: [{ id: "x", pergunta: "?", opcoes: ["a", "b"], ordem_opcoes: [0, 0] }],
      },
    ]) {
      expect(questionarioParaTela(ruim)).toBeNull();
    }
  });
});

describe("rascunho das respostas no aparelho", () => {
  it("o do questionário não se mistura com o da prova final nem com o de outro questionário", () => {
    const s = memoria();
    const questoes = [{ id: "x1", opcoes: ["a", "b"] }];
    guardarRascunhoProva(s, "m1", 1, { x1: 0 });
    guardarRascunhoProva(s, idDoRascunhoDoQuestionario("m1", "aq1"), 1, { x1: 1 });
    guardarRascunhoProva(s, idDoRascunhoDoQuestionario("m1", "aq2"), 1, { x1: 0 });
    expect(s.chaves()).toHaveLength(3);
    expect(lerRascunhoProva(s, "m1", 1, questoes)).toEqual({ x1: 0 });
    expect(lerRascunhoProva(s, idDoRascunhoDoQuestionario("m1", "aq1"), 1, questoes)).toEqual({
      x1: 1,
    });
    expect(lerRascunhoProva(s, idDoRascunhoDoQuestionario("m1", "aq2"), 1, questoes)).toEqual({
      x1: 0,
    });
  });

  it("sair do portal apaga também os rascunhos dos questionários (mesmo prefixo)", () => {
    const s = memoria();
    guardarRascunhoProva(s, idDoRascunhoDoQuestionario("m1", "aq1"), 3, { x1: 1 });
    expect(s.chaves()[0].startsWith(PREFIXO_PROVA)).toBe(true);
    limparRascunhosPortal(s);
    expect(s.chaves()).toEqual([]);
  });
});

describe("acertosNecessarios", () => {
  it("8 questões com 80% pedem 7 (6/8 = 75%), com o arredondamento do servidor", () => {
    expect(acertosNecessarios(8, 80)).toBe(7);
    expect(acertosNecessarios(8, 75)).toBe(6);
    expect(acertosNecessarios(10, 70)).toBe(7);
    expect(acertosNecessarios(3, 67)).toBe(2);
    expect(acertosNecessarios(3, 100)).toBe(3);
  });

  it("mínima 0 ou sem questões: zero", () => {
    expect(acertosNecessarios(5, 0)).toBe(0);
    expect(acertosNecessarios(0, 80)).toBe(0);
    expect(acertosNecessarios(null, 80)).toBe(0);
  });
});

describe("resultadoDoQuestionario", () => {
  it("aprovado: placar e o aviso de conclusão", () => {
    expect(
      resultadoDoQuestionario({ aprovada: true, nota: 88, acertos: 7, total: 8, nota_minima: 80 })
    ).toEqual({
      aprovada: true,
      titulo: "Nota: 88% (7/8)",
      mensagem: "Questionário concluído. Confira abaixo a correção comentada.",
    });
  });

  it("não aprovado: placar e quantos acertos a nota mínima pede (A2: é estudo, tenta de novo)", () => {
    expect(
      resultadoDoQuestionario({ aprovada: false, nota: 75, acertos: 6, total: 8, nota_minima: 80 })
    ).toEqual({
      aprovada: false,
      titulo: "Nota: 75% (6/8)",
      mensagem:
        "Para concluir, acerte pelo menos 7 de 8 (nota mínima 80%). Confira a correção comentada e tente de novo.",
    });
  });

  it("resposta sem nota: só o conceito, sem número inventado", () => {
    expect(resultadoDoQuestionario({ aprovada: false })).toEqual({
      aprovada: false,
      titulo: "Resultado: insatisfatório",
      mensagem:
        "Você ainda não atingiu a nota mínima. Confira a correção comentada e tente de novo.",
    });
    expect(resultadoDoQuestionario(null).aprovada).toBe(false);
    expect(resultadoDoQuestionario({ aprovada: true }).titulo).toBe("Resultado: satisfatório");
  });
});

describe("textos da tela", () => {
  it("aula concluída: melhor nota, tentativas e nota mínima", () => {
    expect(textoDoQuestionarioConcluido({ melhorNota: 88, tentativas: 2, notaMinima: 80 })).toBe(
      "Questionário concluído · melhor nota 88% · 2 tentativas · nota mínima 80%"
    );
    expect(textoDoQuestionarioConcluido({ melhorNota: 100, tentativas: 1, notaMinima: 80 })).toBe(
      "Questionário concluído · melhor nota 100% · 1 tentativa · nota mínima 80%"
    );
    expect(textoDoQuestionarioConcluido({})).toBe("Questionário concluído");
    expect(textoDoQuestionarioConcluido()).toBe("Questionário concluído");
  });

  it("cabeçalho da tentativa", () => {
    expect(detalheDaTentativa({ notaMinima: 80, tentativa: 2 })).toBe(
      "Nota mínima 80% · tentativa 2 · a correção comentada aparece depois de enviar"
    );
    expect(detalheDaTentativa({ tentativa: 1 })).toBe(
      "Tentativa 1 · a correção comentada aparece depois de enviar"
    );
  });

  it("questões sem resposta no envio", () => {
    expect(textoDasFaltas({ faltam: 1, primeiraSemResposta: 2 })).toBe(
      "Responda todas as questões antes de enviar: falta 1 (a primeira sem resposta é a questão 3)."
    );
    expect(textoDasFaltas({ faltam: 3, primeiraSemResposta: 0 })).toBe(
      "Responda todas as questões antes de enviar: faltam 3 (a primeira sem resposta é a questão 1)."
    );
  });
});

describe("reações às recusas do servidor", () => {
  it("abertura: sessão vai ao portal; questionário vazio e aula bloqueada não oferecem 'Tentar de novo'", () => {
    expect(CODIGOS_SEM_NOVA_TENTATIVA).toEqual(["QUESTIONARIO_VAZIO", "AULA_BLOQUEADA"]);
    expect(reacaoAoErroDaAbertura(erro("SESSAO", "Sessão expirada"))).toEqual({ acao: "sessao" });
    expect(reacaoAoErroDaAbertura(erro("TROCAR_SENHA", "Troque a senha"))).toEqual({
      acao: "sessao",
    });
    expect(
      reacaoAoErroDaAbertura(
        erro("QUESTIONARIO_VAZIO", "Este questionário ainda não tem questões — avise o RH")
      )
    ).toEqual({
      acao: "erro",
      mensagem: "Este questionário ainda não tem questões — avise o RH",
      definitivo: true,
    });
    expect(
      reacaoAoErroDaAbertura(erro("AULA_BLOQUEADA", "Conclua a aula anterior primeiro")).definitivo
    ).toBe(true);
  });

  it("abertura: rede e resposta fora do formato deixam tentar de novo", () => {
    expect(reacaoAoErroDaAbertura(new Error("Failed to fetch"))).toEqual({
      acao: "erro",
      mensagem: MSG_SEM_CONEXAO,
      definitivo: false,
    });
    expect(reacaoAoErroDaAbertura(new Error(MSG_QUESTIONARIO_INVALIDO))).toEqual({
      acao: "erro",
      mensagem: MSG_QUESTIONARIO_INVALIDO,
      definitivo: false,
    });
  });

  it("envio: questionário que não vale mais é aberto de novo, com o aviso certo", () => {
    const alterada = reacaoAoErroDoEnvio(erro("PROVA_ALTERADA", "As questões foram alteradas"));
    expect(alterada.acao).toBe("reabrir");
    expect(alterada.aviso).toMatch(/RH alterou as questões/);
    const naoIniciada = reacaoAoErroDoEnvio(erro("PROVA_NAO_INICIADA", "Abra de novo"));
    expect(naoIniciada.acao).toBe("reabrir");
    expect(naoIniciada.aviso).toMatch(/não estava mais aberto/);
  });

  it("envio: concluído em outra aba, sessão e o resto", () => {
    expect(reacaoAoErroDoEnvio(erro("QUESTIONARIO_CONCLUIDO", "Já concluído"))).toEqual({
      acao: "concluido",
    });
    expect(reacaoAoErroDoEnvio(erro("SESSAO", "Sessão expirada"))).toEqual({ acao: "sessao" });
    expect(
      reacaoAoErroDoEnvio(erro("RESPOSTAS_INCOMPLETAS", "Responda todas as questões: falta 1."))
    ).toEqual({ acao: "mensagem", mensagem: "Responda todas as questões: falta 1." });
  });
});
