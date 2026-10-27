import { describe, it, expect, vi } from "vitest";
import {
  MSG_CASO_ATUALIZADO,
  MSG_CASO_ENCERRADO,
  MSG_CASO_RESPOSTA_INVALIDA,
  MSG_OPCAO_INVALIDA,
  alvoDeFocoDaTela,
  avisoParaATela,
  casoParaTela,
  focarNoAlvoDoCaso,
  reacaoAoErroDaAberturaDoCaso,
  reacaoAoErroDoCaso,
  telaConcluida,
  telaDepoisDaEscolha,
} from "./portal-caso";
import { MSG_SEM_CONEXAO } from "./portal-curso";

/** Erro no formato do ErroPortal (components/portal-funcionario/api.js): `extra` é o corpo da resposta. */
const erro = (codigo, mensagem = "Recusado", extra = {}) =>
  Object.assign(new Error(mensagem), { codigo, extra: { codigo, error: mensagem, ...extra } });

// respostas sintéticas da ação `caso_abrir` (nenhum texto do material do curso)
const abertoNaEtapa = {
  success: true,
  situacao: "etapa",
  contexto: "Contexto sintético",
  etapa: {
    id: "e1",
    pergunta: "Qual a decisão?",
    opcoes: [
      { indice: 1, texto: "Opção B" },
      { indice: 0, texto: "Opção A" },
    ],
  },
  passagem: 1,
  ultimo: null,
};
const etapaSeguinte = {
  id: "e2",
  pergunta: "E agora?",
  opcoes: [
    { indice: 0, texto: "X" },
    { indice: 1, texto: "Y" },
  ],
};

describe("casoParaTela", () => {
  it("etapa: contexto, pergunta e opções só com índice e texto (qualquer campo a mais é descartado)", () => {
    const vazando = {
      ...abertoNaEtapa,
      etapa: {
        ...abertoNaEtapa.etapa,
        opcoes: abertoNaEtapa.etapa.opcoes.map((o) => ({
          ...o,
          segura: true,
          comentario: "não pode aparecer",
          proxima: "e9",
        })),
      },
    };
    expect(casoParaTela(vazando)).toEqual({
      fase: "etapa",
      contexto: "Contexto sintético",
      etapa: {
        id: "e1",
        pergunta: "Qual a decisão?",
        opcoes: [
          { indice: 1, texto: "Opção B" },
          { indice: 0, texto: "Opção A" },
        ],
      },
      passagem: 1,
      ultimo: null,
    });
  });

  it("fim, concluído e o comentário da última escolha (recarregar retoma de onde parou)", () => {
    expect(
      casoParaTela({
        situacao: "fim",
        contexto: "C",
        reflexao: "R",
        ultimo: { comentario: "Fim seguro.", segura: true },
      })
    ).toEqual({
      fase: "fim",
      contexto: "C",
      reflexao: "R",
      ultimo: { comentario: "Fim seguro.", segura: true },
    });
    expect(casoParaTela({ situacao: "concluido", contexto: "C", reflexao: "R" })).toEqual({
      fase: "concluido",
      contexto: "C",
      reflexao: "R",
    });
    expect(
      casoParaTela({
        ...abertoNaEtapa,
        passagem: 2,
        ultimo: { comentario: "Volte.", segura: false },
      })
    ).toMatchObject({ passagem: 2, ultimo: { comentario: "Volte.", segura: false } });
  });

  it("resposta fora do formato: null", () => {
    for (const ruim of [
      null,
      undefined,
      {},
      { situacao: "outra" },
      { ...abertoNaEtapa, etapa: null },
      { ...abertoNaEtapa, etapa: { ...abertoNaEtapa.etapa, opcoes: [] } },
      {
        ...abertoNaEtapa,
        etapa: { ...abertoNaEtapa.etapa, opcoes: [{ indice: "0", texto: "A" }] },
      },
      { ...abertoNaEtapa, etapa: { ...abertoNaEtapa.etapa, id: "" } },
    ]) {
      expect(casoParaTela(ruim)).toBeNull();
    }
  });
});

describe("telaDepoisDaEscolha", () => {
  const etapa = casoParaTela(abertoNaEtapa);

  it("insegura que volta à mesma etapa: comentário, a escolha feita e a etapa de novo com a passagem seguinte", () => {
    const tela = telaDepoisDaEscolha(
      etapa,
      {
        comentario: "Arriscado.",
        segura: false,
        fim: false,
        passagem: 1,
        etapa: abertoNaEtapa.etapa,
        reflexao: null,
      },
      1
    );
    expect(tela).toMatchObject({
      fase: "comentario",
      contexto: "Contexto sintético",
      escolhida: "Opção B",
      comentario: "Arriscado.",
      segura: false,
      fim: false,
    });
    expect(tela.etapa.id).toBe("e1"); // a pergunta respondida continua à vista
    expect(tela.seguinte).toMatchObject({ fase: "etapa", passagem: 2, ultimo: null });
    expect(tela.seguinte.etapa.id).toBe("e1");
  });

  it("segura que avança: a próxima etapa, sem repetir o comentário depois do 'Continuar'", () => {
    const tela = telaDepoisDaEscolha(
      etapa,
      {
        comentario: "Isso.",
        segura: true,
        fim: false,
        passagem: 1,
        etapa: etapaSeguinte,
        reflexao: null,
      },
      0
    );
    expect(tela).toMatchObject({ escolhida: "Opção A", segura: true });
    expect(tela.seguinte).toEqual({
      fase: "etapa",
      contexto: "Contexto sintético",
      etapa: etapaSeguinte,
      passagem: null,
      ultimo: null,
    });
  });

  it("escolha que encerra: a seguinte é 'Para refletir', com a reflexão", () => {
    const tela = telaDepoisDaEscolha(
      etapa,
      {
        comentario: "Fim seguro.",
        segura: true,
        fim: true,
        passagem: 1,
        etapa: null,
        reflexao: "Reflexão sintética",
      },
      0
    );
    expect(tela.fim).toBe(true);
    expect(tela.seguinte).toEqual({
      fase: "fim",
      contexto: "Contexto sintético",
      reflexao: "Reflexão sintética",
      ultimo: null,
    });
  });

  it("mesma etapa: a passagem vem do servidor (a dele + 1), não da soma feita na tela", () => {
    // a tela achava que era a 1ª passagem (ficou velha: outra aba andou), o servidor diz que foi a 3ª
    const tela = telaDepoisDaEscolha(
      etapa,
      {
        comentario: "Arriscado.",
        segura: false,
        fim: false,
        passagem: 3,
        etapa: abertoNaEtapa.etapa,
        reflexao: null,
      },
      1
    );
    expect(tela.seguinte.passagem).toBe(4);
  });

  it("sem passagem na resposta, soma a da tela; em etapa diferente, a passagem fica desconhecida", () => {
    const resposta = { comentario: "x", segura: false, fim: false, reflexao: null };
    const naSegunda = { ...etapa, passagem: 2 };
    expect(
      telaDepoisDaEscolha(naSegunda, { ...resposta, etapa: abertoNaEtapa.etapa }, 1).seguinte
        .passagem
    ).toBe(3);
    expect(
      telaDepoisDaEscolha(naSegunda, { ...resposta, passagem: 2, etapa: etapaSeguinte }, 0).seguinte
        .passagem
    ).toBeNull();
  });

  it("resposta incompleta ou tela que não é etapa: null", () => {
    expect(
      telaDepoisDaEscolha(etapa, { segura: true, fim: false, etapa: etapaSeguinte }, 0)
    ).toBeNull();
    expect(
      telaDepoisDaEscolha(etapa, { comentario: "x", segura: true, fim: false, etapa: null }, 0)
    ).toBeNull();
    expect(telaDepoisDaEscolha(etapa, null, 0)).toBeNull();
    expect(
      telaDepoisDaEscolha({ fase: "fim" }, { comentario: "x", segura: true, fim: true }, 0)
    ).toBeNull();
  });
});

describe("telaConcluida", () => {
  it("guarda o contexto e a reflexão para o aluno rever", () => {
    expect(telaConcluida({ fase: "fim", contexto: "C", reflexao: "R", ultimo: null })).toEqual({
      fase: "concluido",
      contexto: "C",
      reflexao: "R",
    });
    expect(telaConcluida({})).toEqual({ fase: "concluido", contexto: "", reflexao: "" });
  });
});

describe("avisoParaATela", () => {
  const concluida = telaConcluida({ contexto: "C", reflexao: "R" });

  it("caso concluído: nenhum aviso de reabertura (a tela diz só 'Caso concluído.')", () => {
    for (const aviso of [
      MSG_CASO_ENCERRADO,
      MSG_CASO_ATUALIZADO,
      MSG_OPCAO_INVALIDA,
      "Chegue ao fim do caso para concluir",
    ]) {
      expect(avisoParaATela(concluida, aviso)).toBe("");
    }
  });

  it("etapa e fim: o aviso fica; sem aviso ou sem tela, texto vazio", () => {
    expect(avisoParaATela(casoParaTela(abertoNaEtapa), MSG_CASO_ATUALIZADO)).toBe(
      MSG_CASO_ATUALIZADO
    );
    expect(
      avisoParaATela(
        { fase: "fim", contexto: "C", reflexao: "R", ultimo: null },
        MSG_CASO_ENCERRADO
      )
    ).toBe(MSG_CASO_ENCERRADO);
    expect(avisoParaATela(casoParaTela(abertoNaEtapa))).toBe("");
    expect(avisoParaATela(null, MSG_CASO_ENCERRADO)).toBe("");
  });
});

describe("foco (teclado e leitor de tela)", () => {
  it("cada fase com conteúdo novo tem o seu alvo; as outras não pedem foco", () => {
    expect(alvoDeFocoDaTela({ fase: "etapa" })).toBe("enunciado");
    expect(alvoDeFocoDaTela({ fase: "comentario" })).toBe("comentario");
    expect(alvoDeFocoDaTela({ fase: "fim" })).toBe("reflexao");
    expect(alvoDeFocoDaTela({ fase: "concluido" })).toBe("concluido");
    expect(alvoDeFocoDaTela({ fase: "carregando" })).toBeNull();
    expect(alvoDeFocoDaTela({ fase: "erro" })).toBeNull();
    expect(alvoDeFocoDaTela(null)).toBeNull();
  });

  it("leva o foco ao elemento marcado com o alvo, dentro da raiz do caso", () => {
    const elemento = { focus: vi.fn() };
    const raiz = { querySelector: vi.fn(() => elemento) };
    expect(focarNoAlvoDoCaso(raiz, "comentario")).toBe(true);
    expect(raiz.querySelector).toHaveBeenCalledWith('[data-caso-foco="comentario"]');
    expect(elemento.focus).toHaveBeenCalledTimes(1);
  });

  it("sem raiz, sem alvo ou sem o elemento na tela: não faz nada e não lança", () => {
    expect(focarNoAlvoDoCaso(null, "comentario")).toBe(false);
    expect(focarNoAlvoDoCaso({ querySelector: vi.fn() }, null)).toBe(false);
    expect(focarNoAlvoDoCaso({ querySelector: () => null }, "enunciado")).toBe(false);
  });
});

describe("reações às recusas do servidor", () => {
  it("CASO_FORA_DE_ORDEM: a tela vai para o estado que o servidor mandou (ou abre de novo)", () => {
    const r = reacaoAoErroDoCaso(
      erro("CASO_FORA_DE_ORDEM", "Fora de ordem", {
        estado: { ...abertoNaEtapa, etapa: etapaSeguinte },
      })
    );
    expect(r.acao).toBe("tela");
    expect(r.aviso).toBe(MSG_CASO_ATUALIZADO);
    expect(r.tela.etapa.id).toBe("e2");
    expect(reacaoAoErroDoCaso(erro("CASO_FORA_DE_ORDEM", "Fora de ordem"))).toEqual({
      acao: "reabrir",
      aviso: MSG_CASO_ATUALIZADO,
    });
  });

  it("CASO_FORA_DE_ORDEM com o estado no fim ou concluído (outra aba andou mais): a tela vai até lá", () => {
    const fim = reacaoAoErroDoCaso(
      erro("CASO_FORA_DE_ORDEM", "Fora de ordem", {
        estado: {
          situacao: "fim",
          contexto: "C",
          reflexao: "R",
          ultimo: { comentario: "Fim seguro.", segura: true },
        },
      })
    );
    expect(fim).toMatchObject({ acao: "tela", aviso: MSG_CASO_ATUALIZADO });
    expect(fim.tela).toEqual({
      fase: "fim",
      contexto: "C",
      reflexao: "R",
      ultimo: { comentario: "Fim seguro.", segura: true },
    });
    const concluido = reacaoAoErroDoCaso(
      erro("CASO_FORA_DE_ORDEM", "Fora de ordem", {
        estado: { situacao: "concluido", contexto: "C", reflexao: "R" },
      })
    );
    expect(concluido.tela.fase).toBe("concluido");
    // estado fora do formato: abre de novo em vez de desenhar uma tela quebrada
    expect(
      reacaoAoErroDoCaso(erro("CASO_FORA_DE_ORDEM", "Fora de ordem", { estado: { situacao: "x" } }))
    ).toEqual({ acao: "reabrir", aviso: MSG_CASO_ATUALIZADO });
  });

  it("caso encerrado, opção que sumiu e conclusão antes do fim: abre de novo, com o aviso", () => {
    expect(reacaoAoErroDoCaso(erro("CASO_ENCERRADO"))).toEqual({
      acao: "reabrir",
      aviso: MSG_CASO_ENCERRADO,
    });
    expect(reacaoAoErroDoCaso(erro("OPCAO_INVALIDA"))).toEqual({
      acao: "reabrir",
      aviso: MSG_OPCAO_INVALIDA,
    });
    expect(
      reacaoAoErroDoCaso(erro("CASO_INCOMPLETO", "Chegue ao fim do caso para concluir"))
    ).toEqual({ acao: "reabrir", aviso: "Chegue ao fim do caso para concluir" });
  });

  it("caso com problema e aula bloqueada: erro sem 'Tentar de novo'; rede: a mensagem fica; sessão: portal", () => {
    expect(
      reacaoAoErroDoCaso(erro("CASO_INVALIDO", "Este caso está com problema — avise o RH"))
    ).toEqual({
      acao: "erro",
      mensagem: "Este caso está com problema — avise o RH",
      definitivo: true,
    });
    expect(
      reacaoAoErroDoCaso(erro("AULA_BLOQUEADA", "Conclua a aula anterior primeiro")).definitivo
    ).toBe(true);
    expect(reacaoAoErroDoCaso(new Error("Failed to fetch"))).toEqual({
      acao: "mensagem",
      mensagem: MSG_SEM_CONEXAO,
    });
    expect(reacaoAoErroDoCaso(new Error(MSG_CASO_RESPOSTA_INVALIDA))).toEqual({
      acao: "mensagem",
      mensagem: MSG_CASO_RESPOSTA_INVALIDA,
    });
    expect(reacaoAoErroDoCaso(erro("SESSAO", "Sessão expirada"))).toEqual({ acao: "sessao" });
  });

  it("abertura: caso com problema não oferece 'Tentar de novo'; rede oferece; sessão vai ao portal", () => {
    expect(
      reacaoAoErroDaAberturaDoCaso(
        erro("CASO_INVALIDO", "Este caso está com problema — avise o RH")
      )
    ).toEqual({
      acao: "erro",
      mensagem: "Este caso está com problema — avise o RH",
      definitivo: true,
    });
    expect(reacaoAoErroDaAberturaDoCaso(new Error("Failed to fetch"))).toEqual({
      acao: "erro",
      mensagem: MSG_SEM_CONEXAO,
      definitivo: false,
    });
    expect(reacaoAoErroDaAberturaDoCaso(erro("TROCAR_SENHA", "Troque a senha"))).toEqual({
      acao: "sessao",
    });
  });
});
