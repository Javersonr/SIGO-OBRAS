import { describe, it, expect } from "vitest";
import {
  LIMITE_DE_MINUTOS_DA_AULA,
  TIPOS_DE_ATIVIDADE,
  TIPOS_DE_AULA,
  camposDaEdicaoSemVideo,
  ehAtividade,
  montarAulaSemArquivo,
  nomeDoTipoDeAula,
  proximaOrdem,
  rotuloDoTempo,
  segundosDosMinutos,
  separarQuestoes,
  situacaoDaAtividade,
} from "./ead-aula-nova";

// Atividades interativas (spec 2026-10-14, §5.2): a "Nova aula" ganha questionário, caso e tarefa.

describe("tipos de aula", () => {
  it("a Nova aula oferece os seis tipos, na ordem da tela", () => {
    expect(TIPOS_DE_AULA.map((t) => t.valor)).toEqual([
      "video",
      "pdf",
      "texto",
      "questionario",
      "caso",
      "tarefa",
    ]);
    expect(TIPOS_DE_AULA.map((t) => t.rotulo)).toEqual([
      "Vídeo",
      "PDF",
      "Texto",
      "Questionário",
      "Caso",
      "Tarefa",
    ]);
  });

  it("nome de cada tipo na linha da aula; aula antiga sem tipo é vídeo", () => {
    expect(nomeDoTipoDeAula("questionario")).toBe("Questionário do módulo");
    expect(nomeDoTipoDeAula("caso")).toBe("Caso com decisões");
    expect(nomeDoTipoDeAula("tarefa")).toBe("Atividade de estudo");
    expect(nomeDoTipoDeAula(null)).toBe("Vídeo");
    expect(nomeDoTipoDeAula("constructor")).toBe("constructor");
  });

  it("as três atividades interativas", () => {
    expect(TIPOS_DE_ATIVIDADE).toEqual(["questionario", "caso", "tarefa"]);
    expect(ehAtividade("caso")).toBe(true);
    expect(ehAtividade("texto")).toBe(false);
    expect(ehAtividade(undefined)).toBe(false);
  });

  it("o rótulo do tempo: leitura no PDF e no texto; tempo previsto nas atividades", () => {
    expect(rotuloDoTempo("pdf")).toBe("Tempo previsto de leitura (min)");
    expect(rotuloDoTempo("texto")).toBe("Tempo previsto de leitura (min)");
    for (const tipo of TIPOS_DE_ATIVIDADE) expect(rotuloDoTempo(tipo)).toBe("Tempo previsto (min)");
  });
});

describe("segundosDosMinutos", () => {
  it("minutos (número ou texto, com vírgula) viram segundos inteiros", () => {
    expect(segundosDosMinutos(15)).toBe(900);
    expect(segundosDosMinutos("1,5")).toBe(90);
    expect(segundosDosMinutos(" 10 ")).toBe(600);
    expect(segundosDosMinutos(LIMITE_DE_MINUTOS_DA_AULA)).toBe(LIMITE_DE_MINUTOS_DA_AULA * 60);
  });

  it("vazio, zero, negativo, texto ou acima do limite valem 0 (a tela pede o tempo)", () => {
    for (const v of ["", "  ", null, undefined, 0, "-3", "abc", LIMITE_DE_MINUTOS_DA_AULA + 1]) {
      expect(segundosDosMinutos(v), String(v)).toBe(0);
    }
  });
});

describe("montarAulaSemArquivo", () => {
  const SEM_ARQUIVO = { fonte: "upload", youtube_id: null, arquivo_ref: null };

  it("questionário e caso: só o tempo previsto; nascem sem texto", () => {
    expect(
      montarAulaSemArquivo({ tipo: "questionario", minutos: "15", texto: "ignorado" })
    ).toEqual({
      ok: true,
      dados: { ...SEM_ARQUIVO, conteudo_texto: null, duracao_seg: 900 },
    });
    expect(montarAulaSemArquivo({ tipo: "caso", minutos: 10 })).toEqual({
      ok: true,
      dados: { ...SEM_ARQUIVO, conteudo_texto: null, duracao_seg: 600 },
    });
  });

  it("tarefa e texto: o texto (aparado) vira o conteúdo", () => {
    expect(
      montarAulaSemArquivo({
        tipo: "tarefa",
        minutos: "35",
        texto: "  Faça o mapa.\n\nO que produzir: uma foto.  ",
      })
    ).toEqual({
      ok: true,
      dados: {
        ...SEM_ARQUIVO,
        conteudo_texto: "Faça o mapa.\n\nO que produzir: uma foto.",
        duracao_seg: 2100,
      },
    });
    expect(montarAulaSemArquivo({ tipo: "texto", minutos: 2, texto: "Leitura" }).dados).toEqual({
      ...SEM_ARQUIVO,
      conteudo_texto: "Leitura",
      duracao_seg: 120,
    });
  });

  it("sem tempo ou sem texto: o erro diz o que falta", () => {
    expect(montarAulaSemArquivo({ tipo: "questionario", minutos: "" })).toEqual({
      ok: false,
      erro: "Informe o tempo previsto (minutos)",
    });
    expect(montarAulaSemArquivo({ tipo: "texto", minutos: "", texto: "x" }).erro).toBe(
      "Informe o tempo previsto de leitura (minutos)"
    );
    expect(montarAulaSemArquivo({ tipo: "texto", minutos: 5, texto: "  " }).erro).toBe(
      "Escreva o texto da aula"
    );
    expect(montarAulaSemArquivo({ tipo: "tarefa", minutos: 5, texto: "" }).erro).toMatch(
      /instruções da atividade/
    );
  });

  it("vídeo e PDF não passam por aqui (sobem arquivo)", () => {
    expect(montarAulaSemArquivo({ tipo: "video", minutos: 5 }).ok).toBe(false);
    expect(montarAulaSemArquivo({ tipo: "pdf", minutos: 5 }).ok).toBe(false);
    expect(montarAulaSemArquivo(undefined).ok).toBe(false);
  });
});

describe("camposDaEdicaoSemVideo", () => {
  it("PDF, questionário e caso: só o tempo previsto", () => {
    expect(camposDaEdicaoSemVideo({ tipo: "pdf", minutos: "20" })).toEqual({
      ok: true,
      patch: { duracao_seg: 1200 },
    });
    expect(camposDaEdicaoSemVideo({ tipo: "caso", minutos: 12, texto: "ignorado" })).toEqual({
      ok: true,
      patch: { duracao_seg: 720 },
    });
  });

  it("texto e tarefa: o texto também (antes só se corrigia por SQL)", () => {
    expect(camposDaEdicaoSemVideo({ tipo: "texto", minutos: "5", texto: " novo " })).toEqual({
      ok: true,
      patch: { duracao_seg: 300, conteudo_texto: "novo" },
    });
    expect(camposDaEdicaoSemVideo({ tipo: "tarefa", minutos: "5", texto: "" }).ok).toBe(false);
  });

  it("sem tempo: erro com o nome do tempo de cada tipo", () => {
    expect(camposDaEdicaoSemVideo({ tipo: "questionario", minutos: "" }).erro).toBe(
      "Informe o tempo previsto (minutos)"
    );
    expect(camposDaEdicaoSemVideo({ tipo: "pdf", minutos: 0 }).erro).toBe(
      "Informe o tempo previsto de leitura (minutos)"
    );
  });
});

describe("separarQuestoes e proximaOrdem", () => {
  it("prova final = sem aula; cada questionário = as da aula; em ordem; apagadas fora", () => {
    const qs = [
      { id: "p2", ordem: 2, aula_id: null },
      { id: "q1b", ordem: 2, aula_id: "aq1" },
      { id: "p1", ordem: 1 },
      { id: "q1a", ordem: 1, aula_id: "aq1" },
      { id: "q2a", ordem: 1, aula_id: "aq2" },
      { id: "px", ordem: 3, deleted_at: "2026-10-01T00:00:00Z" },
    ];
    const { prova, porAula } = separarQuestoes(qs);
    expect(prova.map((q) => q.id)).toEqual(["p1", "p2"]);
    expect(porAula.get("aq1").map((q) => q.id)).toEqual(["q1a", "q1b"]);
    expect(porAula.get("aq2").map((q) => q.id)).toEqual(["q2a"]);
    expect(porAula.has("aq3")).toBe(false);
    expect(qs[0].id).toBe("p2"); // a lista recebida não muda
    expect(separarQuestoes(null).prova).toEqual([]);
    expect(separarQuestoes(undefined).porAula.size).toBe(0);
  });

  it("a próxima ordem é a maior do grupo + 1", () => {
    expect(proximaOrdem([])).toBe(1);
    expect(proximaOrdem([{ ordem: 2 }, { ordem: "5" }, {}])).toBe(6);
    expect(proximaOrdem(undefined)).toBe(1);
  });
});

describe("situacaoDaAtividade (selos da linha da aula)", () => {
  it("questionário: quantas questões, ou a pendência 'sem questões'", () => {
    const aula = { tipo: "questionario" };
    expect(situacaoDaAtividade(aula, { questoes: [{}, {}] })).toEqual({
      resumo: "2 questões",
      pendencia: null,
    });
    expect(situacaoDaAtividade(aula, { questoes: [{}] }).resumo).toBe("1 questão");
    expect(situacaoDaAtividade(aula, {})).toEqual({ resumo: null, pendencia: "sem questões" });
  });

  it("caso sem roteiro e tarefa sem instruções ficam pendentes", () => {
    expect(situacaoDaAtividade({ tipo: "caso" }, { temRoteiro: false }).pendencia).toBe(
      "sem roteiro"
    );
    expect(situacaoDaAtividade({ tipo: "caso" }, { temRoteiro: true }).pendencia).toBeNull();
    expect(situacaoDaAtividade({ tipo: "tarefa", conteudo_texto: " " }).pendencia).toBe(
      "sem instruções"
    );
    expect(situacaoDaAtividade({ tipo: "tarefa", conteudo_texto: "Faça." }).pendencia).toBeNull();
  });

  it("vídeo, PDF e texto não ganham selo daqui", () => {
    expect(situacaoDaAtividade({ tipo: "video" })).toEqual({ resumo: null, pendencia: null });
    expect(situacaoDaAtividade(null)).toEqual({ resumo: null, pendencia: null });
  });
});
