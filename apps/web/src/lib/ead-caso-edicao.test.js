import { describe, it, expect } from "vitest";
import { LIMITES_CASO, novoCasoVazio, proximoIdDeEtapa, validarCaso } from "./ead-caso";
import {
  FIM,
  adicionarEtapa,
  adicionarOpcao,
  alterarOpcao,
  alterarPergunta,
  casoMudou,
  casoParaEditar,
  destinosDoCaso,
  removerEtapa,
  removerOpcao,
  renomearEtapa,
} from "./ead-caso-edicao";

// Roteiro sintético com recuperação, na forma dos casos ramificados do material (textos inventados).
const opcao = (texto, segura, proxima) => ({
  texto,
  comentario: `Comentário: ${texto}`,
  segura,
  proxima,
});
const CASO = {
  contexto: "Contexto sintético.",
  etapas: [
    {
      id: "e1",
      pergunta: "Primeira decisão?",
      opcoes: [opcao("Bloquear", true, "e2"), opcao("Seguir", false, "r1")],
    },
    {
      id: "r1",
      pergunta: "Como corrigir?",
      opcoes: [opcao("Voltar", true, "e1"), opcao("Insistir", false, "r1")],
    },
    {
      id: "e2",
      pergunta: "Segunda decisão?",
      opcoes: [opcao("Medir", true, null), opcao("Pular", false, "e2")],
    },
  ],
  reflexao: "Reflexão sintética.",
};
const codigos = (conteudo) => validarCaso(conteudo).map((p) => p.codigo);

describe("o roteiro de teste", () => {
  it("é válido pela mesma regra do servidor (C3)", () => {
    expect(validarCaso(CASO)).toEqual([]);
  });
});

describe("casoParaEditar", () => {
  it("roteiro ausente ou ilegível vira o caso vazio de partida", () => {
    expect(casoParaEditar(null)).toEqual(novoCasoVazio());
    expect(casoParaEditar("não é JSON")).toEqual(novoCasoVazio());
    expect(casoParaEditar({ etapas: "x" })).toEqual(novoCasoVazio());
  });

  it("aceita o JSON em texto e devolve uma cópia (mexer nela não mexe no original)", () => {
    expect(casoParaEditar(JSON.stringify(CASO))).toEqual(CASO);
    const copia = casoParaEditar(CASO);
    copia.etapas[0].opcoes[0].texto = "mudou";
    expect(CASO.etapas[0].opcoes[0].texto).toBe("Bloquear");
  });

  it("normaliza: segura só com true; destino vazio ou 'Fim' vira null; o que falta vira texto vazio", () => {
    const c = casoParaEditar({
      etapas: [
        {
          id: "e1",
          opcoes: [
            { texto: "A", segura: "sim", proxima: "" },
            { segura: true, proxima: FIM },
          ],
        },
      ],
    });
    expect(c).toEqual({
      contexto: "",
      etapas: [
        {
          id: "e1",
          pergunta: "",
          opcoes: [
            { texto: "A", comentario: "", segura: false, proxima: null },
            { texto: "", comentario: "", segura: true, proxima: null },
          ],
        },
      ],
      reflexao: "",
    });
  });
});

describe("adicionarEtapa e removerEtapa", () => {
  it("acrescenta uma etapa com código livre, uma saída segura (Fim) e uma insegura que volta a ela", () => {
    const id = proximoIdDeEtapa(CASO);
    const novo = adicionarEtapa(CASO);
    expect(["e1", "r1", "e2"]).not.toContain(id);
    expect(novo.etapas).toHaveLength(4);
    expect(novo.etapas[3]).toEqual({
      id,
      pergunta: "",
      opcoes: [
        { texto: "", comentario: "", segura: true, proxima: null },
        { texto: "", comentario: "", segura: false, proxima: id },
      ],
    });
    expect(CASO.etapas).toHaveLength(3);
  });

  it("não passa do limite de etapas", () => {
    const cheio = {
      ...CASO,
      etapas: Array.from({ length: LIMITES_CASO.etapas }, (_, i) => ({
        id: `x${i}`,
        pergunta: "P",
        opcoes: [],
      })),
    };
    expect(adicionarEtapa(cheio).etapas).toHaveLength(LIMITES_CASO.etapas);
  });

  it("remover a recuperação: a insegura que levava a ela volta para a própria etapa", () => {
    const sem = removerEtapa(CASO, 1);
    expect(sem.etapas.map((e) => e.id)).toEqual(["e1", "e2"]);
    expect(sem.etapas[0].opcoes[1]).toMatchObject({ texto: "Seguir", proxima: "e1" });
    expect(validarCaso(sem)).toEqual([]);
  });

  it("remover o destino de uma segura: a segura passa a encerrar o caso", () => {
    const sem = removerEtapa(CASO, 2);
    expect(sem.etapas[0].opcoes[0]).toMatchObject({
      texto: "Bloquear",
      segura: true,
      proxima: null,
    });
    expect(codigos(sem)).not.toContain("PROXIMA_INEXISTENTE");
  });

  it("a única etapa não sai, e índice que não existe não muda nada", () => {
    const uma = { ...CASO, etapas: [CASO.etapas[2]] };
    expect(removerEtapa(uma, 0).etapas).toHaveLength(1);
    expect(removerEtapa(CASO, 9)).toEqual(CASO);
  });
});

describe("renomearEtapa", () => {
  it("muda o código e leva junto toda opção que apontava para ele", () => {
    const r = renomearEtapa(CASO, 1, " rec1 ");
    expect(r.ok).toBe(true);
    expect(r.conteudo.etapas.map((e) => e.id)).toEqual(["e1", "rec1", "e2"]);
    expect(r.conteudo.etapas[0].opcoes[1].proxima).toBe("rec1");
    expect(r.conteudo.etapas[1].opcoes[1].proxima).toBe("rec1");
    expect(validarCaso(r.conteudo)).toEqual([]);
  });

  it("recusa código vazio, com espaço, longo demais ou repetido, dizendo por quê", () => {
    expect(renomearEtapa(CASO, 1, "")).toMatchObject({ ok: false });
    expect(renomearEtapa(CASO, 1, "r 1").erro).toMatch(/espaço/);
    expect(renomearEtapa(CASO, 1, "x".repeat(21)).erro).toMatch(/20 caracteres/);
    expect(renomearEtapa(CASO, 1, "e2").erro).toContain("e2");
    expect(renomearEtapa(CASO, 9, "novo").ok).toBe(false);
  });

  it("o mesmo código não muda nada", () => {
    expect(renomearEtapa(CASO, 1, "r1")).toEqual({ ok: true, conteudo: CASO });
  });
});

describe("opções", () => {
  it("opção nova é insegura e volta para a própria etapa; no máximo 6", () => {
    const tres = adicionarOpcao(CASO, 0);
    expect(tres.etapas[0].opcoes).toHaveLength(3);
    expect(tres.etapas[0].opcoes[2]).toEqual({
      texto: "",
      comentario: "",
      segura: false,
      proxima: "e1",
    });
    let cheia = CASO;
    for (let i = 0; i < 10; i += 1) cheia = adicionarOpcao(cheia, 0);
    expect(cheia.etapas[0].opcoes).toHaveLength(LIMITES_CASO.opcoesMax);
  });

  it("remover opção respeita o mínimo de 2", () => {
    expect(removerOpcao(CASO, 0, 1).etapas[0].opcoes).toHaveLength(2);
    expect(removerOpcao(adicionarOpcao(CASO, 0), 0, 2)).toEqual(CASO);
  });

  it("muda texto, comentário e destino", () => {
    const c = alterarOpcao(CASO, 1, 0, { texto: "Voltar ao bloqueio", proxima: "e2" });
    expect(c.etapas[1].opcoes[0]).toEqual({
      texto: "Voltar ao bloqueio",
      comentario: "Comentário: Voltar",
      segura: true,
      proxima: "e2",
    });
  });

  it("'Fim do caso' numa segura encerra; numa insegura, volta para a própria etapa", () => {
    expect(alterarOpcao(CASO, 0, 0, { proxima: FIM }).etapas[0].opcoes[0].proxima).toBeNull();
    expect(alterarOpcao(CASO, 0, 1, { proxima: FIM }).etapas[0].opcoes[1].proxima).toBe("e1");
  });

  it("tornar insegura a opção que encerrava: ela passa a voltar para a etapa", () => {
    expect(alterarOpcao(CASO, 2, 0, { segura: false }).etapas[2].opcoes[0]).toMatchObject({
      segura: false,
      proxima: "e2",
    });
  });

  it("índices que não existem não mudam nada", () => {
    expect(alterarOpcao(CASO, 0, 9, { texto: "x" })).toEqual(CASO);
    expect(alterarOpcao(CASO, 9, 0, { texto: "x" })).toEqual(CASO);
    expect(adicionarOpcao(CASO, 9)).toEqual(CASO);
  });
});

describe("alterarPergunta, destinosDoCaso e casoMudou", () => {
  it("muda só a pergunta da etapa", () => {
    const c = alterarPergunta(CASO, 1, "Nova pergunta?");
    expect(c.etapas[1]).toEqual({ ...CASO.etapas[1], pergunta: "Nova pergunta?" });
    expect(c.etapas[0]).toEqual(CASO.etapas[0]);
  });

  it("os destinos do 'leva para' são os códigos das etapas, sem vazio nem repetição", () => {
    expect(destinosDoCaso(CASO)).toEqual(["e1", "r1", "e2"]);
    expect(
      destinosDoCaso({ etapas: [{ id: "e1" }, { id: "" }, { id: "e1" }, { id: "r1" }] })
    ).toEqual(["e1", "r1"]);
  });

  it("casoMudou compara o roteiro normalizado", () => {
    expect(casoMudou(CASO, casoParaEditar(CASO))).toBe(false);
    expect(casoMudou(CASO, alterarOpcao(CASO, 0, 0, { comentario: "outro" }))).toBe(true);
    const fim = CASO.etapas[2];
    const comVazio = {
      ...CASO,
      etapas: [{ ...fim, opcoes: [{ ...fim.opcoes[0], proxima: "" }, fim.opcoes[1]] }],
    };
    expect(casoMudou(comVazio, { ...CASO, etapas: [fim] })).toBe(false);
  });
});
