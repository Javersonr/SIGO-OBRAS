import { describe, it, expect } from "vitest";
import {
  LIMITES_CASO,
  estadoDoCaso,
  etapaParaAluno,
  novoCasoVazio,
  proximoIdDeEtapa,
  resultadoDaEscolha,
  validarCaso,
} from "./ead-caso";

// Textos sintéticos (nada do material do NR-10). Linear: a insegura volta à mesma etapa.
const opc = (texto, segura, proxima) => ({
  texto,
  comentario: `Comentário: ${texto}`,
  segura,
  proxima,
});
const CASO_LINEAR = {
  contexto: "Equipe sintética prepara uma tarefa de teste.",
  etapas: [
    {
      id: "e1",
      pergunta: "Primeira decisão?",
      opcoes: [opc("Pular a conferência", false, "e1"), opc("Conferir o plano", true, "e2")],
    },
    {
      id: "e2",
      pergunta: "Segunda decisão?",
      opcoes: [opc("Seguir sem aviso", false, "e2"), opc("Avisar a equipe", true, "e3")],
    },
    {
      id: "e3",
      pergunta: "Última decisão?",
      opcoes: [opc("Encerrar às pressas", false, "e3"), opc("Registrar e encerrar", true, null)],
    },
  ],
  reflexao: "Reflexão sintética.",
};
// Ramificado (formato dos rascunhos): a insegura leva à recuperação, cuja segura volta à decisão.
const CASO_RAMIFICADO = {
  contexto: "Situação sintética com recuperação.",
  etapas: [
    {
      id: "e1",
      pergunta: "Decisão A?",
      opcoes: [
        opc("A segura", true, "e2"),
        opc("A insegura 1", false, "r1"),
        opc("A insegura 2", false, "r1"),
      ],
    },
    {
      id: "r1",
      pergunta: "Recuperação 1?",
      opcoes: [opc("R1 segura", true, "e1"), opc("R1 insegura", false, "r1")],
    },
    {
      id: "e2",
      pergunta: "Decisão B?",
      opcoes: [opc("B segura", true, null), opc("B insegura", false, "r2")],
    },
    {
      id: "r2",
      pergunta: "Recuperação 2?",
      opcoes: [opc("R2 segura", true, "e2"), opc("R2 insegura", false, "r2")],
    },
  ],
  reflexao: "Reflexão sintética do ramificado.",
};
const copia = (v) => JSON.parse(JSON.stringify(v));
const codigos = (conteudo) => validarCaso(conteudo).map((p) => p.codigo);

describe("validarCaso", () => {
  it("aceita o caso linear e o ramificado com recuperação", () => {
    expect(validarCaso(CASO_LINEAR)).toEqual([]);
    expect(validarCaso(CASO_RAMIFICADO)).toEqual([]);
  });

  it("contexto e reflexão podem ficar vazios ou faltar", () => {
    const sem = copia(CASO_LINEAR);
    delete sem.contexto;
    sem.reflexao = "";
    expect(validarCaso(sem)).toEqual([]);
  });

  it("recusa o que não é roteiro (FORMATO) e para por aí", () => {
    for (const ruim of [null, undefined, "texto", 3, [], {}, { etapas: "x" }, { etapas: [1] }]) {
      expect(codigos(ruim), JSON.stringify(ruim)).toEqual(["FORMATO"]);
    }
    const seguraTexto = copia(CASO_LINEAR);
    seguraTexto.etapas[0].opcoes[0].segura = "sim";
    expect(codigos(seguraTexto)).toEqual(["FORMATO"]);
    const proximaNumero = copia(CASO_LINEAR);
    proximaNumero.etapas[1].opcoes[1].proxima = 3;
    expect(codigos(proximaNumero)).toEqual(["FORMATO"]);
    const contextoNumero = copia(CASO_LINEAR);
    contextoNumero.contexto = 5;
    expect(codigos(contextoNumero)).toEqual(["FORMATO"]);
    const opcoesTexto = copia(CASO_LINEAR);
    opcoesTexto.etapas[2].opcoes = "a, b";
    expect(validarCaso(opcoesTexto)).toEqual([
      { codigo: "FORMATO", texto: "As opções da etapa nº 3 precisam ser uma lista", etapa: "e3" },
    ]);
  });

  it("SEM_ETAPAS e MUITAS_ETAPAS", () => {
    expect(codigos({ contexto: "", etapas: [], reflexao: "" })).toEqual(["SEM_ETAPAS"]);
    const longo = {
      etapas: Array.from({ length: LIMITES_CASO.etapas + 1 }, (_, i) => ({
        id: `e${i + 1}`,
        pergunta: `Pergunta ${i + 1}?`,
        opcoes: [
          opc(`Volta ${i + 1}`, false, `e${i + 1}`),
          opc(`Segue ${i + 1}`, true, i === LIMITES_CASO.etapas ? null : `e${i + 2}`),
        ],
      })),
    };
    expect(codigos(longo)).toEqual(["MUITAS_ETAPAS"]);
    longo.etapas.pop();
    longo.etapas[LIMITES_CASO.etapas - 1].opcoes[1].proxima = null;
    expect(validarCaso(longo)).toEqual([]);
  });

  it("ID_VAZIO e ID_REPETIDO (e não confere o caminho com identificadores ruins)", () => {
    const vazio = copia(CASO_LINEAR);
    vazio.etapas[1].id = "  ";
    // as duas opções que levavam a "e2" passam a apontar para uma etapa que não existe; sem INALCANCAVEL/SEM_SAIDA
    expect(codigos(vazio)).toEqual(["ID_VAZIO", "PROXIMA_INEXISTENTE", "PROXIMA_INEXISTENTE"]);
    const repetido = copia(CASO_LINEAR);
    repetido.etapas[2].id = "e2";
    expect(validarCaso(repetido)[0]).toEqual({
      codigo: "ID_REPETIDO",
      texto: 'O identificador "e2" está em mais de uma etapa',
      etapa: "e2",
    });
    expect(codigos(repetido)).toEqual([
      "ID_REPETIDO",
      "PROXIMA_INEXISTENTE",
      "PROXIMA_INEXISTENTE",
    ]);
  });

  it("PERGUNTA_VAZIA, OPCOES_QTD, TEXTO_VAZIO e COMENTARIO_VAZIO", () => {
    const c = copia(CASO_LINEAR);
    c.etapas[0].pergunta = "";
    c.etapas[1].opcoes[0].texto = " ";
    c.etapas[1].opcoes[1].comentario = "";
    expect(validarCaso(c)).toEqual([
      { codigo: "PERGUNTA_VAZIA", texto: 'A etapa "e1" está sem pergunta', etapa: "e1" },
      { codigo: "TEXTO_VAZIO", texto: 'A opção 1 da etapa "e2" está sem texto', etapa: "e2" },
      {
        codigo: "COMENTARIO_VAZIO",
        texto: 'A opção 2 da etapa "e2" está sem comentário',
        etapa: "e2",
      },
    ]);
    const uma = copia(CASO_LINEAR);
    uma.etapas[0].opcoes = [opc("Conferir o plano", true, "e2")];
    expect(codigos(uma)).toEqual(["OPCOES_QTD"]);
    const sete = copia(CASO_LINEAR);
    sete.etapas[0].opcoes = [
      ...Array.from({ length: 6 }, (_, i) => opc(`Volta ${i}`, false, "e1")),
      opc("Conferir o plano", true, "e2"),
    ];
    expect(codigos(sete)).toEqual(["OPCOES_QTD"]);
  });

  it("PROXIMA_INEXISTENTE, FIM_INSEGURO e SEM_SEGURA", () => {
    const leva = copia(CASO_LINEAR);
    leva.etapas[0].opcoes[0].proxima = "e9";
    expect(codigos(leva)).toEqual(["PROXIMA_INEXISTENTE"]);
    const fimInseguro = copia(CASO_LINEAR);
    fimInseguro.etapas[1].opcoes[0].proxima = null;
    expect(codigos(fimInseguro)).toEqual(["FIM_INSEGURO"]);
    const semSegura = copia(CASO_LINEAR);
    semSegura.etapas[2].opcoes[1].segura = false;
    // a etapa e3 perdeu a única saída: sem segura, fim inseguro e ninguém chega ao fim
    expect(codigos(semSegura)).toEqual([
      "FIM_INSEGURO",
      "SEM_SEGURA",
      "SEM_SAIDA",
      "SEM_SAIDA",
      "SEM_SAIDA",
      "SEM_CAMINHO_SEGURO",
    ]);
  });

  it("INALCANCAVEL, SEM_SAIDA e SEM_CAMINHO_SEGURO, cada um sozinho", () => {
    const solta = copia(CASO_RAMIFICADO);
    solta.etapas.push({
      id: "x1",
      pergunta: "Etapa solta?",
      opcoes: [opc("Fim", true, null), opc("Volta", false, "x1")],
    });
    expect(validarCaso(solta)).toEqual([
      {
        codigo: "INALCANCAVEL",
        texto: 'A etapa "x1" nunca é alcançada a partir da primeira etapa',
        etapa: "x1",
      },
    ]);
    const armadilha = copia(CASO_RAMIFICADO);
    armadilha.etapas[1].opcoes[0].proxima = "r1"; // a recuperação r1 não devolve mais à decisão
    expect(validarCaso(armadilha)).toEqual([
      {
        codigo: "SEM_SAIDA",
        texto: 'Da etapa "r1" não há como chegar ao fim do caso',
        etapa: "r1",
      },
    ]);
    const soPelaInsegura = {
      etapas: [
        {
          id: "e1",
          pergunta: "Decisão?",
          opcoes: [opc("Segura", true, "r1"), opc("Atalho", false, "e2")],
        },
        {
          id: "r1",
          pergunta: "Volta?",
          opcoes: [opc("Volta", true, "e1"), opc("Fica", false, "r1")],
        },
        {
          id: "e2",
          pergunta: "Fim?",
          opcoes: [opc("Encerra", true, null), opc("Fica", false, "e2")],
        },
      ],
    };
    expect(validarCaso(soPelaInsegura)).toEqual([
      {
        codigo: "SEM_CAMINHO_SEGURO",
        texto: "Não há caminho só de opções seguras da primeira etapa até o fim do caso",
        etapa: null,
      },
    ]);
  });

  it("TAMANHO: pergunta, opção e comentário até 1.000; contexto e reflexão até 4.000", () => {
    const c = copia(CASO_LINEAR);
    c.contexto = "x".repeat(LIMITES_CASO.longo + 1);
    c.reflexao = "x".repeat(LIMITES_CASO.longo);
    c.etapas[0].pergunta = "p".repeat(LIMITES_CASO.texto + 1);
    c.etapas[1].opcoes[0].texto = "t".repeat(LIMITES_CASO.texto + 1);
    c.etapas[2].opcoes[0].comentario = "c".repeat(LIMITES_CASO.texto + 1);
    expect(validarCaso(c).map((p) => [p.codigo, p.texto])).toEqual([
      ["TAMANHO", "O contexto do caso passa de 4.000 caracteres"],
      ["TAMANHO", 'A pergunta da etapa "e1" passa de 1.000 caracteres'],
      ["TAMANHO", 'A opção 1 da etapa "e2" passa de 1.000 caracteres'],
      ["TAMANHO", 'O comentário da opção 1 da etapa "e3" passa de 1.000 caracteres'],
    ]);
    expect(LIMITES_CASO).toEqual({
      etapas: 30,
      opcoesMin: 2,
      opcoesMax: 6,
      texto: 1000,
      longo: 4000,
    });
  });
});

describe("estadoDoCaso", () => {
  it("sem escolhas: na primeira etapa, visitada uma vez", () => {
    expect(estadoDoCaso(CASO_LINEAR, [])).toEqual({
      valido: true,
      motivo: null,
      fim: false,
      etapaAtual: "e1",
      passagens: { e1: 1 },
      ultimo: null,
    });
    expect(estadoDoCaso(CASO_LINEAR, undefined).etapaAtual).toBe("e1");
  });

  it("linear: a insegura volta à mesma etapa (2ª passagem); a segura avança; a última encerra", () => {
    const umaInsegura = estadoDoCaso(CASO_LINEAR, [{ etapa: "e1", opcao: 0 }]);
    expect(umaInsegura.etapaAtual).toBe("e1");
    expect(umaInsegura.passagens).toEqual({ e1: 2 });
    expect(umaInsegura.ultimo).toEqual({
      comentario: "Comentário: Pular a conferência",
      segura: false,
    });
    const fim = estadoDoCaso(CASO_LINEAR, [
      { etapa: "e1", opcao: 0 },
      { etapa: "e1", opcao: 1 },
      { etapa: "e2", opcao: 1 },
      { etapa: "e3", opcao: 1 },
    ]);
    expect(fim).toEqual({
      valido: true,
      motivo: null,
      fim: true,
      etapaAtual: null,
      passagens: { e1: 2, e2: 1, e3: 1 },
      ultimo: { comentario: "Comentário: Registrar e encerrar", segura: true },
    });
  });

  it("ramificado: insegura leva à recuperação, que devolve à decisão; o fim só pela segura", () => {
    const caminho = [
      { etapa: "e1", opcao: 2 },
      { etapa: "r1", opcao: 1 },
      { etapa: "r1", opcao: 0 },
      { etapa: "e1", opcao: 0 },
      { etapa: "e2", opcao: 1 },
      { etapa: "r2", opcao: 0 },
    ];
    const meio = estadoDoCaso(CASO_RAMIFICADO, caminho);
    expect(meio.etapaAtual).toBe("e2");
    expect(meio.passagens).toEqual({ e1: 2, r1: 2, e2: 2, r2: 1 });
    expect(meio.fim).toBe(false);
    const fim = estadoDoCaso(CASO_RAMIFICADO, [...caminho, { etapa: "e2", opcao: 0 }]);
    expect(fim.fim).toBe(true);
    expect(fim.etapaAtual).toBe(null);
  });

  it("caminho que não confere: CAMINHO_DIVERGENTE (etapa errada, opção que não existe, clique depois do fim)", () => {
    const divergente = {
      valido: false,
      motivo: "CAMINHO_DIVERGENTE",
      fim: false,
      etapaAtual: null,
      passagens: {},
      ultimo: null,
    };
    expect(estadoDoCaso(CASO_LINEAR, [{ etapa: "e2", opcao: 1 }])).toEqual(divergente);
    expect(estadoDoCaso(CASO_LINEAR, [{ etapa: "e1", opcao: 5 }])).toEqual(divergente);
    expect(estadoDoCaso(CASO_LINEAR, [{ etapa: "e1", opcao: "1" }])).toEqual(divergente);
    expect(estadoDoCaso(CASO_LINEAR, [null])).toEqual(divergente);
    const ateOFim = [
      { etapa: "e1", opcao: 1 },
      { etapa: "e2", opcao: 1 },
      { etapa: "e3", opcao: 1 },
    ];
    expect(estadoDoCaso(CASO_LINEAR, [...ateOFim, { etapa: "e3", opcao: 1 }])).toEqual(divergente);
    // o RH tirou a etapa e2 do roteiro: o caminho gravado deixa de conferir
    const alterado = copia(CASO_LINEAR);
    alterado.etapas.splice(1, 1);
    alterado.etapas[0].opcoes[1].proxima = "e3";
    expect(estadoDoCaso(alterado, ateOFim)).toEqual(divergente);
  });

  it("roteiro inválido: CASO_INVALIDO, sem etapa atual", () => {
    expect(estadoDoCaso({ etapas: [] }, [])).toEqual({
      valido: false,
      motivo: "CASO_INVALIDO",
      fim: false,
      etapaAtual: null,
      passagens: {},
      ultimo: null,
    });
  });
});

describe("etapaParaAluno", () => {
  it("só pergunta e opções com texto e índice original; nunca segura, comentário ou próxima", () => {
    const semTroca = (n) => n - 1; // Fisher–Yates trocando cada posição com ela mesma
    const etapa = etapaParaAluno(CASO_RAMIFICADO, "e1", semTroca);
    expect(etapa).toEqual({
      id: "e1",
      pergunta: "Decisão A?",
      opcoes: [
        { indice: 0, texto: "A segura" },
        { indice: 1, texto: "A insegura 1" },
        { indice: 2, texto: "A insegura 2" },
      ],
    });
    const texto = JSON.stringify(etapa);
    for (const segredo of ['segura":', "comentario", "proxima", "Comentário:"]) {
      expect(texto.includes(segredo), segredo).toBe(false);
    }
  });

  it("embaralha com o sorteio recebido (Fisher–Yates) e recusa sorteio fora do intervalo", () => {
    const sempreZero = () => 0;
    expect(etapaParaAluno(CASO_RAMIFICADO, "e1", sempreZero).opcoes.map((o) => o.indice)).toEqual([
      1, 2, 0,
    ]);
    expect(() => etapaParaAluno(CASO_LINEAR, "e1", (n) => n)).toThrow(RangeError);
    expect(() => etapaParaAluno(CASO_LINEAR, "e1", () => 0.5)).toThrow(RangeError);
    expect(() => etapaParaAluno(CASO_LINEAR, "e9", sempreZero)).toThrow(RangeError);
  });
});

describe("resultadoDaEscolha", () => {
  const inicio = estadoDoCaso(CASO_LINEAR, []);

  it("insegura: comentário, volta à etapa e conta a passagem; segura: avança", () => {
    expect(resultadoDaEscolha(CASO_LINEAR, inicio, "e1", 0)).toEqual({
      ok: true,
      comentario: "Comentário: Pular a conferência",
      segura: false,
      proxima: "e1",
      fim: false,
      passagem: 1,
    });
    const segunda = estadoDoCaso(CASO_LINEAR, [{ etapa: "e1", opcao: 0 }]);
    expect(resultadoDaEscolha(CASO_LINEAR, segunda, "e1", 1)).toMatchObject({
      ok: true,
      segura: true,
      proxima: "e2",
      fim: false,
      passagem: 2,
    });
  });

  it("a segura que encerra devolve fim", () => {
    const naUltima = estadoDoCaso(CASO_LINEAR, [
      { etapa: "e1", opcao: 1 },
      { etapa: "e2", opcao: 1 },
    ]);
    expect(resultadoDaEscolha(CASO_LINEAR, naUltima, "e3", 1)).toMatchObject({
      ok: true,
      segura: true,
      proxima: null,
      fim: true,
    });
  });

  it("recusas: fora de ordem, opção inválida, caso encerrado e caso inválido", () => {
    expect(resultadoDaEscolha(CASO_LINEAR, inicio, "e2", 1)).toEqual({
      ok: false,
      codigo: "CASO_FORA_DE_ORDEM",
    });
    for (const opcao of [2, -1, "1", 1.5, null, undefined]) {
      expect(resultadoDaEscolha(CASO_LINEAR, inicio, "e1", opcao), String(opcao)).toEqual({
        ok: false,
        codigo: "OPCAO_INVALIDA",
      });
    }
    const fim = estadoDoCaso(CASO_LINEAR, [
      { etapa: "e1", opcao: 1 },
      { etapa: "e2", opcao: 1 },
      { etapa: "e3", opcao: 1 },
    ]);
    expect(resultadoDaEscolha(CASO_LINEAR, fim, "e3", 1)).toEqual({
      ok: false,
      codigo: "CASO_ENCERRADO",
    });
    expect(resultadoDaEscolha({ etapas: [] }, inicio, "e1", 0)).toEqual({
      ok: false,
      codigo: "CASO_INVALIDO",
    });
    expect(
      resultadoDaEscolha(
        CASO_LINEAR,
        estadoDoCaso(CASO_LINEAR, [{ etapa: "e2", opcao: 0 }]),
        "e1",
        0
      )
    ).toEqual({ ok: false, codigo: "CASO_INVALIDO" });
  });
});

describe("novoCasoVazio e proximoIdDeEtapa", () => {
  it("o caso novo tem a forma certa e só os campos de texto por preencher", () => {
    const novo = novoCasoVazio();
    expect(novo.etapas).toHaveLength(1);
    expect(novo.etapas[0].id).toBe("e1");
    expect(novo.etapas[0].opcoes.map((o) => [o.segura, o.proxima])).toEqual([
      [true, null],
      [false, "e1"],
    ]);
    expect(codigos(novo)).toEqual([
      "PERGUNTA_VAZIA",
      "TEXTO_VAZIO",
      "COMENTARIO_VAZIO",
      "TEXTO_VAZIO",
      "COMENTARIO_VAZIO",
    ]);
    // cada chamada devolve um objeto novo (o editor muda o que recebe)
    expect(novoCasoVazio()).not.toBe(novo);
  });

  it("o próximo id é o menor e<n> livre", () => {
    expect(proximoIdDeEtapa(novoCasoVazio())).toBe("e2");
    expect(proximoIdDeEtapa(CASO_RAMIFICADO)).toBe("e3");
    expect(proximoIdDeEtapa({ etapas: [{ id: "e2" }, { id: "r1" }] })).toBe("e1");
    expect(proximoIdDeEtapa(null)).toBe("e1");
  });
});
