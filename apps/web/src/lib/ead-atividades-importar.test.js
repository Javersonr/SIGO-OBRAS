import { describe, it, expect } from "vitest";
import {
  FORMATO_POR_VIDEO,
  MODULO_NOVO,
  TEMPOS_PADRAO,
  TEMPO_PADRAO_POS_VIDEO_MIN,
  acharAulaDoVideo,
  casarModulo,
  codigosDasAulas,
  formatoDoArquivo,
  lerPacoteDeAtividades,
  lerQuestionariosPorVideo,
  mensagemDoErroDaImportacao,
  minutosDoTempo,
  modulosDasAulas,
  payloadDaImportacao,
  planejarImportacao,
  planejarImportacaoPorVideo,
  situacaoDaImportacao,
  textoDoResumoDaImportacao,
} from "./ead-atividades-importar";

// Pacote sintético na forma dos rascunhos de autoria: caso ramificado com recuperação, 8 questões e 2 tarefas.
const opcao = (texto, segura, proxima) => ({
  texto,
  feedback: `Comentário: ${texto}`,
  segura,
  proxima,
});
const CASO_RAMIFICADO = {
  id: "M1-C1",
  titulo: "Quadro sem bloqueio",
  contexto: "Contexto sintético do caso.",
  etapas: [
    {
      id: "e1",
      pergunta: "Primeira decisão?",
      opcoes: [opcao("Bloquear", true, "e2"), opcao("Seguir", false, "r1")],
    },
    {
      id: "r1",
      pergunta: "Como corrigir?",
      opcoes: [opcao("Voltar e bloquear", true, "e1"), opcao("Insistir", false, "r1")],
    },
    {
      id: "e2",
      pergunta: "Segunda decisão?",
      opcoes: [opcao("Medir a tensão", true, null), opcao("Pular a medição", false, "e2")],
    },
  ],
  reflexao: "Reflexão sintética.",
};
const QUESTOES = Array.from({ length: 8 }, (_, i) => ({
  enunciado: `Pergunta sintética ${i + 1}?`,
  opcoes: ["Alternativa A", "Alternativa B", "Alternativa C", "Alternativa D"],
  correta: i % 4,
  explicacao: `Explicação ${i + 1}.`,
}));
const TAREFAS = [
  {
    titulo: "Mapa de riscos",
    instrucoes: "Desenhe o mapa do posto.",
    evidencia: "Uma foto do mapa.",
    tempoEstimadoMin: 35,
  },
  {
    titulo: "Lista de verificação",
    instrucoes: "Monte a lista.",
    evidencia: "",
    tempoEstimadoMin: 20,
  },
];
const PACOTE = [
  {
    id: "M1",
    titulo: "Introdução sintética",
    objetivos: ["Objetivo sintético"],
    apostila: {},
    episodios: [],
    casos: [CASO_RAMIFICADO],
    questoes: QUESTOES,
    estudo: TAREFAS,
    pratica: [{ titulo: "Estação prática sintética" }],
    fontes: [],
  },
  { id: "M2", titulo: "Módulo sem atividades", casos: [], questoes: [], estudo: [], pratica: [] },
];
const MODULOS_DO_CURSO = ["M10 · Revisão", "M1 · Introdução", "M3 Análise"];

describe("lerPacoteDeAtividades", () => {
  it("lê a lista de módulos e converte para o formato do SIGO (feedback → comentário, enunciado → pergunta)", () => {
    const { modulos, erros } = lerPacoteDeAtividades(PACOTE);
    expect(erros).toEqual([]);
    expect(modulos.map((m) => m.id)).toEqual(["M1", "M2"]);
    expect(Object.keys(modulos[0])).toEqual(["id", "titulo", "casos", "questoes", "tarefas"]);
    const [caso] = modulos[0].casos;
    expect(caso.titulo).toBe("Quadro sem bloqueio");
    expect(caso.conteudo.etapas.map((e) => e.id)).toEqual(["e1", "r1", "e2"]);
    expect(caso.conteudo.etapas[0].opcoes[1]).toEqual({
      texto: "Seguir",
      comentario: "Comentário: Seguir",
      segura: false,
      proxima: "r1",
    });
    expect(caso.conteudo.etapas[2].opcoes[0].proxima).toBeNull();
    expect(modulos[0].questoes[0]).toEqual({
      pergunta: "Pergunta sintética 1?",
      opcoes: ["Alternativa A", "Alternativa B", "Alternativa C", "Alternativa D"],
      correta: 0,
      comentario: "Explicação 1.",
    });
    expect(modulos[0].tarefas[0]).toEqual({
      titulo: "Mapa de riscos",
      instrucoes: "Desenhe o mapa do posto.",
      evidencia: "Uma foto do mapa.",
      minutos: 35,
    });
  });

  it("aceita { modulos: [...] } e JSON em texto", () => {
    expect(lerPacoteDeAtividades({ modulos: PACOTE }).modulos).toHaveLength(2);
    expect(lerPacoteDeAtividades(JSON.stringify(PACOTE)).modulos).toHaveLength(2);
  });

  it("arquivo fora do formato: erros legíveis, sem lançar", () => {
    expect(lerPacoteDeAtividades("não é json").erros[0]).toMatch(/JSON válido/);
    expect(lerPacoteDeAtividades({}).erros[0]).toMatch(/lista de módulos/);
    expect(lerPacoteDeAtividades([]).erros[0]).toMatch(/nenhum módulo/);
    expect(lerPacoteDeAtividades([{ titulo: "sem id" }]).erros[0]).toMatch(/código/);
    expect(lerPacoteDeAtividades([{ id: "M1" }, { id: "m1" }]).erros[0]).toMatch(/mais de uma vez/);
    expect(lerPacoteDeAtividades([{ id: "M1", casos: "x" }]).erros[0]).toMatch(
      /"casos" não é uma lista/
    );
    expect(() => lerPacoteDeAtividades(null)).not.toThrow();
  });
});

describe("casarModulo, modulosDasAulas e codigosDasAulas", () => {
  it("casa pelo código no começo do nome do módulo; M1 não casa com M10", () => {
    expect(casarModulo("M1", MODULOS_DO_CURSO)).toBe("M1 · Introdução");
    expect(casarModulo("M10", MODULOS_DO_CURSO)).toBe("M10 · Revisão");
    expect(casarModulo("M3", MODULOS_DO_CURSO)).toBe("M3 Análise");
    expect(casarModulo("m1", MODULOS_DO_CURSO)).toBe("M1 · Introdução");
    expect(casarModulo("M2", MODULOS_DO_CURSO)).toBeNull();
    expect(casarModulo("M4", ["M4"])).toBe("M4");
    expect(casarModulo("M5", ["M5·Sem espaço"])).toBe("M5·Sem espaço");
    expect(casarModulo("", MODULOS_DO_CURSO)).toBeNull();
    expect(casarModulo("M1", null)).toBeNull();
  });

  it("os módulos do curso, na ordem das aulas, sem repetir e sem os de aula apagada", () => {
    const aulas = [
      { ordem: 2, modulo: "B" },
      { ordem: 1, modulo: "A" },
      { ordem: 3, modulo: "A" },
      { ordem: 4, modulo: " " },
      { ordem: 5, modulo: "C", deleted_at: "2026-10-01T00:00:00Z" },
    ];
    expect(modulosDasAulas(aulas)).toEqual(["A", "B"]);
  });

  it("os códigos de origem que já existem no curso (aula apagada não conta)", () => {
    const codigos = codigosDasAulas([
      { codigo_origem: "M1-Q" },
      { codigo_origem: null },
      { codigo_origem: "M1-C1", deleted_at: "2026-10-01T00:00:00Z" },
    ]);
    expect([...codigos]).toEqual(["M1-Q"]);
  });
});

describe("planejarImportacao", () => {
  const pacote = lerPacoteDeAtividades(PACOTE);
  const planejar = (extra = {}) =>
    planejarImportacao({
      pacote,
      modulosDoCurso: MODULOS_DO_CURSO,
      codigosExistentes: [],
      tempos: TEMPOS_PADRAO,
      escolhaDeModulo: {},
      ...extra,
    });

  it("cada caso, o questionário e cada tarefa viram aulas, nesta ordem, com título e código de origem", () => {
    const { itens } = planejar();
    expect(itens.map((i) => [i.codigo_origem, i.tipo, i.titulo, i.duracao_seg])).toEqual([
      ["M1-C1", "caso", "M1 · Caso 1: Quadro sem bloqueio", 600],
      ["M1-Q", "questionario", "M1 · Questionário do módulo", 900],
      ["M1-T1", "tarefa", "M1 · Atividade de estudo 1: Mapa de riscos", 2100],
      ["M1-T2", "tarefa", "M1 · Atividade de estudo 2: Lista de verificação", 1200],
    ]);
    expect(itens.every((i) => i.modulo === "M1 · Introdução" && i.moduloPacote === "M1")).toBe(
      true
    );
    expect(itens.every((i) => i.problemas.length === 0 && i.jaExiste === false)).toBe(true);
    expect(itens[0].caso).toEqual(pacote.modulos[0].casos[0].conteudo);
    expect(itens[1].questoes).toHaveLength(8);
    expect(itens[1].questoes[3]).toEqual({
      pergunta: "Pergunta sintética 4?",
      opcoes: ["Alternativa A", "Alternativa B", "Alternativa C", "Alternativa D"],
      correta: 3,
      comentario: "Explicação 4.",
    });
    expect(itens[2].conteudo_texto).toBe(
      "Desenhe o mapa do posto.\n\nO que produzir: Uma foto do mapa."
    );
    expect(itens[3].conteudo_texto).toBe("Monte a lista.");
  });

  it("o resumo por módulo leva só os módulos com atividades (o M2 fica de fora)", () => {
    expect(planejar().porModulo).toEqual([
      {
        moduloPacote: "M1",
        tituloPacote: "Introdução sintética",
        modulo: "M1 · Introdução",
        origem: "casado",
        casos: 1,
        questoes: 8,
        tarefas: 2,
        minutos: 80,
      },
    ]);
  });

  it("código de origem que já existe no curso: 'já existe' (pulado) e fora do tempo somado", () => {
    const { itens, porModulo } = planejar({ codigosExistentes: ["M1-Q"] });
    expect(itens.find((i) => i.codigo_origem === "M1-Q").jaExiste).toBe(true);
    expect(porModulo[0].minutos).toBe(65);
  });

  it("tempos padrão editáveis; valor inválido volta ao padrão", () => {
    const editados = planejar({ tempos: { questionarioMin: "20", casoMin: 12 } }).itens;
    expect(editados.find((i) => i.tipo === "questionario").duracao_seg).toBe(1200);
    expect(editados.find((i) => i.tipo === "caso").duracao_seg).toBe(720);
    const invalidos = planejar({ tempos: { questionarioMin: "0", casoMin: "abc" } }).itens;
    expect(invalidos.find((i) => i.tipo === "questionario").duracao_seg).toBe(900);
    expect(invalidos.find((i) => i.tipo === "caso").duracao_seg).toBe(600);
  });

  it("módulo sem par vai para um módulo novo; o RH pode escolher outro ou forçar o novo", () => {
    const outro = lerPacoteDeAtividades([
      { id: "M5", titulo: "Título cinco", estudo: [TAREFAS[0]] },
      ...PACOTE,
    ]);
    const semEscolha = planejar({ pacote: outro });
    expect(semEscolha.porModulo[0]).toMatchObject({ modulo: "M5 · Título cinco", origem: "novo" });
    const escolhido = planejar({ pacote: outro, escolhaDeModulo: { M5: "M3 Análise" } });
    expect(escolhido.porModulo[0]).toMatchObject({ modulo: "M3 Análise", origem: "escolhido" });
    expect(escolhido.itens[0].modulo).toBe("M3 Análise");
    const forcado = planejar({ escolhaDeModulo: { M1: MODULO_NOVO } });
    expect(forcado.porModulo[0]).toMatchObject({
      modulo: "M1 · Introdução sintética",
      origem: "novo",
    });
    // escolha que não é um módulo do curso é ignorada
    expect(planejar({ escolhaDeModulo: { M1: "Outro" } }).porModulo[0].origem).toBe("casado");
  });
});

describe("problemas bloqueiam até a atividade ser desmarcada", () => {
  const COM_PROBLEMAS = [
    {
      id: "M3",
      titulo: "Problemas",
      casos: [
        CASO_RAMIFICADO,
        {
          ...CASO_RAMIFICADO,
          titulo: "Caso quebrado",
          etapas: [
            {
              id: "e1",
              pergunta: "Única?",
              opcoes: [opcao("Certa", true, null), opcao("Errada que encerra", false, null)],
            },
          ],
        },
      ],
      questoes: [
        QUESTOES[0],
        { enunciado: "Sem certa?", opcoes: ["a", "b"], correta: 7, explicacao: "" },
        { enunciado: "Uma só?", opcoes: ["a"], correta: 0 },
      ],
      estudo: [
        { titulo: "Sem instruções", instrucoes: "", evidencia: "x", tempoEstimadoMin: 10 },
        { titulo: "Sem tempo", instrucoes: "Faça.", evidencia: "" },
        TAREFAS[0],
      ],
    },
  ];
  const { itens } = planejarImportacao({
    pacote: lerPacoteDeAtividades(COM_PROBLEMAS),
    modulosDoCurso: [],
    codigosExistentes: [],
    tempos: TEMPOS_PADRAO,
    escolhaDeModulo: {},
  });
  const item = (codigo) => itens.find((i) => i.codigo_origem === codigo);

  it("caso inválido (validarCaso), questão sem resposta certa ou com 1 alternativa, tarefa sem instruções ou tempo", () => {
    expect(item("M3-C1").problemas).toEqual([]);
    expect(item("M3-C2").problemas.length).toBeGreaterThan(0);
    expect(item("M3-C2").problemas.every((p) => p.startsWith("Caso 2: "))).toBe(true);
    expect(item("M3-Q").problemas).toEqual([
      "Questão 2: sem resposta certa",
      "Questão 3: menos de 2 alternativas",
    ]);
    expect(item("M3-T1").problemas).toEqual(["Atividade de estudo 1: sem instruções"]);
    expect(item("M3-T2").problemas).toEqual(["Atividade de estudo 2: sem tempo estimado"]);
    expect(item("M3-T3").problemas).toEqual([]);
  });

  it("com problema marcado não confirma; desmarcadas, entram só as boas", () => {
    expect(situacaoDaImportacao(itens, [])).toMatchObject({
      podeConfirmar: false,
      comProblema: ["M3-C2", "M3-Q", "M3-T1", "M3-T2"],
    });
    const fora = ["M3-C2", "M3-Q", "M3-T1", "M3-T2"];
    expect(situacaoDaImportacao(itens, fora)).toMatchObject({
      podeConfirmar: true,
      aImportar: 2,
      comProblema: [],
    });
    expect(payloadDaImportacao(itens, fora).map((i) => i.codigo_origem)).toEqual([
      "M3-C1",
      "M3-T3",
    ]);
    // o payload nunca leva atividade com problema, nem se o diálogo esquecer de desmarcar
    expect(payloadDaImportacao(itens, []).map((i) => i.codigo_origem)).toEqual(["M3-C1", "M3-T3"]);
  });
});

describe("payloadDaImportacao e situacaoDaImportacao", () => {
  const pacote = lerPacoteDeAtividades(PACOTE);
  const { itens } = planejarImportacao({
    pacote,
    modulosDoCurso: MODULOS_DO_CURSO,
    codigosExistentes: [],
    tempos: TEMPOS_PADRAO,
    escolhaDeModulo: {},
  });

  it("monta a lista da RPC (C1), sem os campos da prévia, sem as desmarcadas", () => {
    const modulo = "M1 · Introdução";
    expect(payloadDaImportacao(itens, new Set(["M1-T2"]))).toEqual([
      {
        codigo_origem: "M1-C1",
        tipo: "caso",
        modulo,
        titulo: "M1 · Caso 1: Quadro sem bloqueio",
        duracao_seg: 600,
        caso: pacote.modulos[0].casos[0].conteudo,
      },
      {
        codigo_origem: "M1-Q",
        tipo: "questionario",
        modulo,
        titulo: "M1 · Questionário do módulo",
        duracao_seg: 900,
        questoes: itens[1].questoes,
      },
      {
        codigo_origem: "M1-T1",
        tipo: "tarefa",
        modulo,
        titulo: "M1 · Atividade de estudo 1: Mapa de riscos",
        duracao_seg: 2100,
        conteudo_texto: "Desenhe o mapa do posto.\n\nO que produzir: Uma foto do mapa.",
      },
    ]);
  });

  it("a situação soma o que vai entrar e conta o que será pulado", () => {
    expect(situacaoDaImportacao(itens, [])).toEqual({
      aImportar: 4,
      questoes: 8,
      minutos: 80,
      puladas: 0,
      comProblema: [],
      podeConfirmar: true,
    });
    const jaFeito = itens.map((i) => ({ ...i, jaExiste: true }));
    expect(situacaoDaImportacao(jaFeito, [])).toMatchObject({
      aImportar: 0,
      puladas: 4,
      podeConfirmar: false,
    });
  });
});

describe("exercícios pós-vídeo (questionarios_por_video)", () => {
  const AULAS_DO_CURSO = [
    {
      id: "v1",
      ordem: 1,
      tipo: "video",
      modulo: "SEP 1",
      titulo: "Vídeo do S02A",
      video_ref: "treinamentos/emp/2026/10/1a2b-NR10_S02A_cena.mp4",
    },
    {
      id: "v2",
      ordem: 2,
      tipo: "video",
      modulo: "SEP 1",
      titulo: "Vídeo do S02AB",
      video_ref: "treinamentos/emp/2026/10/3c4d-S02AB.mp4",
    },
    {
      id: "v3",
      ordem: 3,
      tipo: null,
      modulo: "SEP 2",
      titulo: "Vídeo antigo, sem tipo",
      video_ref: "treinamentos/emp/2026/10/5e6f-s03b.mp4",
    },
    {
      id: "v4",
      ordem: 4,
      tipo: "video",
      modulo: "SEP 2",
      titulo: "Vídeo removido",
      video_ref: "treinamentos/emp/2026/10/7a8b-S04C.mp4",
      deleted_at: "2026-10-01T00:00:00Z",
    },
    {
      id: "p1",
      ordem: 5,
      tipo: "pdf",
      modulo: "SEP 2",
      titulo: "Apostila",
      arquivo_ref: "treinamentos/emp/2026/10/9c0d-S05D.pdf",
    },
    {
      id: "y1",
      ordem: 6,
      tipo: "video",
      fonte: "youtube",
      youtube_id: "abcdefghijk",
      modulo: "SEP 3",
      titulo: "Vídeo do YouTube",
    },
  ];
  const POR_VIDEO = {
    tipo: FORMATO_POR_VIDEO,
    itens: [
      {
        video: "S02A",
        questoes: [
          {
            pergunta: "Pergunta pós-vídeo 1?",
            opcoes: ["Certa", "Errada 1", "Errada 2", "Errada 3"],
            correta: 0,
            comentario: "Comentário 1.",
          },
          {
            pergunta: "Pergunta pós-vídeo 2?",
            opcoes: ["Errada", "Certa"],
            correta: 1,
            comentario: "Comentário 2.",
          },
        ],
      },
      {
        video: "s03b",
        questoes: [
          { pergunta: "Pergunta 3?", opcoes: ["a", "b", "c", "d"], correta: 3, comentario: "" },
        ],
      },
      {
        video: "S99Z",
        questoes: [{ pergunta: "Pergunta 4?", opcoes: ["a", "b"], correta: 0, comentario: "c" }],
      },
    ],
  };

  it("reconhece o formato do arquivo", () => {
    expect(formatoDoArquivo(POR_VIDEO)).toBe("por_video");
    expect(formatoDoArquivo(JSON.stringify(POR_VIDEO))).toBe("por_video");
    expect(formatoDoArquivo(PACOTE)).toBe("pacote");
    expect(formatoDoArquivo({ modulos: [] })).toBe("pacote");
  });

  it("lê os itens; o código do vídeo fica em maiúsculas", () => {
    const { itens, erros } = lerQuestionariosPorVideo(POR_VIDEO);
    expect(erros).toEqual([]);
    expect(itens.map((i) => i.video)).toEqual(["S02A", "S03B", "S99Z"]);
    expect(itens[0].questoes[1]).toEqual({
      pergunta: "Pergunta pós-vídeo 2?",
      opcoes: ["Errada", "Certa"],
      correta: 1,
      comentario: "Comentário 2.",
    });
  });

  it("arquivo fora do formato, item sem vídeo ou vídeo repetido: erros legíveis", () => {
    expect(lerQuestionariosPorVideo({ tipo: "outro" }).erros[0]).toMatch(/questionarios_por_video/);
    expect(lerQuestionariosPorVideo({ tipo: FORMATO_POR_VIDEO, itens: [] }).erros[0]).toMatch(
      /itens/
    );
    const ruins = lerQuestionariosPorVideo({
      tipo: FORMATO_POR_VIDEO,
      itens: [{ questoes: [] }, { video: "S02A" }, { video: "s02a" }],
    });
    expect(ruins.erros).toHaveLength(2);
    expect(ruins.erros[1]).toMatch(/S02A aparece mais de uma vez/);
  });

  it("acharAulaDoVideo: o código como pedaço do nome do arquivo do vídeo, sem caixa; S02A não casa com S02AB", () => {
    expect(acharAulaDoVideo("S02A", AULAS_DO_CURSO)?.id).toBe("v1");
    expect(acharAulaDoVideo("S02AB", AULAS_DO_CURSO)?.id).toBe("v2");
    // depois do uuid do upload pela tela ("<uuid>-<nome>") e com o tipo antigo vazio (= vídeo)
    expect(acharAulaDoVideo("S03B", AULAS_DO_CURSO)?.id).toBe("v3");
    expect(acharAulaDoVideo("S04C", AULAS_DO_CURSO)).toBeNull(); // aula apagada
    expect(acharAulaDoVideo("S05D", AULAS_DO_CURSO)).toBeNull(); // PDF não é vídeo
    expect(acharAulaDoVideo("S0", AULAS_DO_CURSO)).toBeNull();
    expect(acharAulaDoVideo("S.2A", AULAS_DO_CURSO)).toBeNull(); // o código não vira expressão regular
    expect(acharAulaDoVideo("", AULAS_DO_CURSO)).toBeNull();
  });

  it("planeja um questionário logo depois de cada vídeo, herdando o módulo; o que falta vira problema", () => {
    const arquivo = lerQuestionariosPorVideo(POR_VIDEO);
    const { itens } = planejarImportacaoPorVideo({
      arquivo,
      aulas: AULAS_DO_CURSO,
      codigosExistentes: ["PV-S03B"],
    });
    expect(itens.map((i) => i.codigo_origem)).toEqual(["PV-S02A", "PV-S03B", "PV-S99Z"]);
    expect(itens[0]).toMatchObject({
      tipo: "questionario",
      depois_da_aula_id: "v1",
      modulo: "SEP 1",
      titulo: "Exercícios do vídeo: Vídeo do S02A",
      duracao_seg: TEMPO_PADRAO_POS_VIDEO_MIN * 60,
      video: "S02A",
      problemas: [],
      jaExiste: false,
    });
    expect(itens[1]).toMatchObject({ depois_da_aula_id: "v3", jaExiste: true });
    expect(itens[2]).toMatchObject({
      depois_da_aula_id: null,
      titulo: "Exercícios do vídeo S99Z",
      problemas: ["vídeo S99Z não encontrado neste curso"],
    });
    const comTempo = planejarImportacaoPorVideo({ arquivo, aulas: AULAS_DO_CURSO, minutos: "7" });
    expect(comTempo.itens[0].duracao_seg).toBe(420);
  });

  it("código que casa com mais de uma aula de vídeo é problema (o RH confere antes)", () => {
    const duplicado = [
      ...AULAS_DO_CURSO,
      { id: "v9", ordem: 9, tipo: "video", titulo: "Outra cópia", video_ref: "t/e/9-S02A.mp4" },
    ];
    const { itens } = planejarImportacaoPorVideo({
      arquivo: lerQuestionariosPorVideo(POR_VIDEO),
      aulas: duplicado,
    });
    expect(itens[0].problemas[0]).toMatch(/2 aulas de vídeo/);
  });

  it("o payload leva depois_da_aula_id; a situação bloqueia até desmarcar o vídeo não encontrado", () => {
    const { itens } = planejarImportacaoPorVideo({
      arquivo: lerQuestionariosPorVideo(POR_VIDEO),
      aulas: AULAS_DO_CURSO,
      codigosExistentes: ["PV-S03B"],
    });
    expect(situacaoDaImportacao(itens, [])).toMatchObject({
      podeConfirmar: false,
      comProblema: ["PV-S99Z"],
      puladas: 1,
    });
    expect(situacaoDaImportacao(itens, ["PV-S99Z"])).toMatchObject({
      podeConfirmar: true,
      aImportar: 1,
    });
    expect(payloadDaImportacao(itens, ["PV-S99Z"])).toEqual([
      {
        codigo_origem: "PV-S02A",
        tipo: "questionario",
        modulo: "SEP 1",
        titulo: "Exercícios do vídeo: Vídeo do S02A",
        duracao_seg: 300,
        questoes: itens[0].questoes,
        depois_da_aula_id: "v1",
      },
    ]);
  });
});

describe("minutosDoTempo, resumo e erros da RPC", () => {
  it("minutos inteiros de 1 a 600", () => {
    expect(minutosDoTempo("15")).toBe(15);
    expect(minutosDoTempo(600)).toBe(600);
    for (const v of ["", null, "0", "12.5", "abc", 601])
      expect(minutosDoTempo(v), String(v)).toBeNull();
  });

  it("o resumo depois de importar", () => {
    expect(textoDoResumoDaImportacao({ criadas: 4, puladas: 0, questoes: 8 })).toBe(
      "4 aulas criadas e 8 questões gravadas."
    );
    expect(textoDoResumoDaImportacao({ criadas: 1, puladas: 2, questoes: 0 })).toBe(
      "1 aula criada; 2 já existiam e foram puladas."
    );
    expect(textoDoResumoDaImportacao({ criadas: 0, puladas: 3, questoes: 0 })).toBe(
      "Nada novo: as 3 atividades já existiam e foram puladas."
    );
    expect(textoDoResumoDaImportacao({ criadas: 0, puladas: 1, questoes: 0 })).toBe(
      "Nada novo: a atividade já existia e foi pulada."
    );
    expect(textoDoResumoDaImportacao(null)).toBe("Nenhuma atividade foi importada.");
  });

  it("erro da RPC vira frase em português", () => {
    expect(mensagemDoErroDaImportacao({ code: "42501", message: "x" })).toBe(
      "Sem permissão para importar atividades: é preciso Treinamentos EAD → Editar."
    );
    expect(
      mensagemDoErroDaImportacao({ code: "22023", message: "atividade M3-C1 malformada" })
    ).toBe("O banco recusou uma atividade do arquivo: atividade M3-C1 malformada");
    expect(mensagemDoErroDaImportacao({ code: "23505" })).toMatch(/ao mesmo tempo/);
    expect(mensagemDoErroDaImportacao({ message: "falhou" })).toBe(
      "Não foi possível importar as atividades: falhou"
    );
    expect(mensagemDoErroDaImportacao(undefined)).toBe("Não foi possível importar as atividades.");
  });
});

describe("o plano só manda o que a RPC aceita", () => {
  const questao = { pergunta: "Pergunta?", opcoes: ["a", "b"], correta: 0, comentario: "" };
  const aulaDeVideo = {
    id: "v1",
    ordem: 1,
    tipo: "video",
    modulo: "A",
    titulo: "V",
    video_ref: "t/e/1-S01A.mp4",
  };

  it("código de origem repetido no plano vira problema e nunca vai no payload", () => {
    // plano montado à mão: os leitores já recusam módulo e vídeo repetidos (a RPC recusa a lista inteira)
    const modulo = {
      id: "M7",
      titulo: "Sete",
      casos: [],
      questoes: [],
      tarefas: [{ titulo: "A", instrucoes: "Faça.", evidencia: "", minutos: 10 }],
    };
    const { itens } = planejarImportacao({
      pacote: { modulos: [modulo, modulo] },
      modulosDoCurso: [],
      codigosExistentes: [],
      tempos: TEMPOS_PADRAO,
      escolhaDeModulo: {},
    });
    expect(itens.map((i) => i.codigo_origem)).toEqual(["M7-T1", "M7-T1"]);
    expect(itens[0].problemas).toEqual([]);
    expect(itens[1].problemas).toEqual(["código de origem repetido: M7-T1"]);
    expect(payloadDaImportacao(itens, [])).toHaveLength(1);
    // defesa extra: itens sem a marca de problema também não repetem o código
    expect(payloadDaImportacao([itens[0], { ...itens[0] }], [])).toHaveLength(1);

    const porVideo = planejarImportacaoPorVideo({
      arquivo: {
        itens: [
          { video: "S01A", questoes: [questao] },
          { video: "S01A", questoes: [questao] },
        ],
      },
      aulas: [aulaDeVideo],
    });
    expect(porVideo.itens[0].problemas).toEqual([]);
    expect(porVideo.itens[1].problemas).toEqual(["código de origem repetido: PV-S01A"]);
    expect(payloadDaImportacao(porVideo.itens, [])).toHaveLength(1);
  });

  it("título, código e quantidade de questões acima do limite da RPC viram problema", () => {
    const pacote = lerPacoteDeAtividades([
      {
        id: "M8",
        titulo: "Oito",
        questoes: Array.from({ length: 51 }, () => ({
          enunciado: "Pergunta?",
          opcoes: ["a", "b"],
          correta: 0,
        })),
        estudo: [
          { titulo: "x".repeat(300), instrucoes: "Faça.", evidencia: "", tempoEstimadoMin: 10 },
        ],
      },
      { id: `M${"9".repeat(60)}`, estudo: [TAREFAS[0]] },
    ]);
    const { itens } = planejarImportacao({
      pacote,
      modulosDoCurso: [],
      codigosExistentes: [],
      tempos: TEMPOS_PADRAO,
      escolhaDeModulo: {},
    });
    const item = (codigo) => itens.find((i) => i.codigo_origem === codigo);
    expect(item("M8-Q").problemas).toEqual(["mais de 50 questões (tem 51)"]);
    expect(item("M8-T1").problemas).toEqual(["título com mais de 300 caracteres"]);
    expect(itens.at(-1).problemas).toEqual(["código de origem com mais de 60 caracteres"]);

    const muitas = planejarImportacaoPorVideo({
      arquivo: { itens: [{ video: "S01A", questoes: Array.from({ length: 51 }, () => questao) }] },
      aulas: [aulaDeVideo],
    });
    expect(muitas.itens[0].problemas).toEqual(["mais de 50 questões (tem 51)"]);
  });

  it("tempo estimado da tarefa arredondado para menos de 1 minuto não vale", () => {
    const tarefa = (tempoEstimadoMin) => ({ titulo: "T", instrucoes: "Faça.", tempoEstimadoMin });
    const { modulos } = lerPacoteDeAtividades([
      { id: "M9", estudo: [tarefa(0.4), tarefa(1.6), tarefa(601), tarefa("abc")] },
    ]);
    expect(modulos[0].tarefas.map((t) => t.minutos)).toEqual([null, 2, null, null]);
  });
});

describe("exercício pós-vídeo com a aula de vídeo sem título", () => {
  it("o título cai para o código do vídeo (nunca 'undefined')", () => {
    const { itens } = planejarImportacaoPorVideo({
      arquivo: {
        itens: [
          {
            video: "S01A",
            questoes: [{ pergunta: "Pergunta?", opcoes: ["a", "b"], correta: 0, comentario: "" }],
          },
        ],
      },
      aulas: [{ id: "v1", ordem: 1, tipo: "video", titulo: null, video_ref: "t/e/1-S01A.mp4" }],
    });
    expect(itens[0]).toMatchObject({
      depois_da_aula_id: "v1",
      modulo: null,
      titulo: "Exercícios do vídeo S01A",
      problemas: [],
    });
  });
});
