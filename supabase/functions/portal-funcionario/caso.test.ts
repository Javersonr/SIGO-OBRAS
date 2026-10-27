// Roda com Node 23.6+ (type stripping):
//   node --test supabase/functions/portal-funcionario/caso.test.ts
//
// Roteiro do caso com decisões (spec 2026-10-14 §4.3 e §7). Confere a regra do servidor (caso.ts) e, com a MESMA
// tabela de casos, a cópia do front (apps/web/src/lib/ead-caso.js), como o requisitos.test.ts faz com os
// requisitos. Textos sintéticos: nada do material do NR-10.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LIMITES_CASO,
  escolhasDaRodada,
  estadoDoCaso,
  etapaParaAluno,
  resultadoDaEscolha,
  validarCaso,
} from "./caso.ts";
import {
  LIMITES_CASO as LIMITES_FRONT,
  estadoDoCaso as estadoFront,
  etapaParaAluno as etapaFront,
  resultadoDaEscolha as resultadoFront,
  validarCaso as validarFront,
} from "../../../apps/web/src/lib/ead-caso.js";

const opc = (texto: string, segura: boolean, proxima: string | null) => ({
  texto,
  comentario: `Comentário: ${texto}`,
  segura,
  proxima,
});
// linear: a insegura volta à mesma etapa
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
// ramificado (formato dos rascunhos): a insegura leva à recuperação, cuja segura volta à decisão
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
// ids que também são nomes de propriedade de objeto: valem como qualquer outro id
const CASO_ESPECIAL = {
  etapas: [
    {
      id: "e1",
      pergunta: "Primeira?",
      opcoes: [opc("Volta", false, "e1"), opc("Segue", true, "__proto__")],
    },
    {
      id: "__proto__",
      pergunta: "Segunda?",
      opcoes: [opc("Volta", false, "__proto__"), opc("Segue", true, "toString")],
    },
    {
      id: "toString",
      pergunta: "Terceira?",
      opcoes: [opc("Volta", false, "toString"), opc("Segue", true, "constructor")],
    },
    {
      id: "constructor",
      pergunta: "Quarta?",
      opcoes: [opc("Volta", false, "constructor"), opc("Encerra", true, null)],
    },
  ],
};
// cadeia de n etapas (a última encerra); a insegura de cada uma volta a ela mesma
const cadeia = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `e${i + 1}`,
    pergunta: `Pergunta ${i + 1}?`,
    opcoes: [
      opc(`Volta ${i + 1}`, false, `e${i + 1}`),
      opc(`Segue ${i + 1}`, true, i + 2 > n ? null : `e${i + 2}`),
    ],
  }));
// deno-lint-ignore no-explicit-any
const copia = (v: any) => JSON.parse(JSON.stringify(v));
// deno-lint-ignore no-explicit-any
const mudado = (base: unknown, mudar: (c: any) => void) => {
  const c = copia(base);
  mudar(c);
  return c;
};
const tem = (objeto: object, chave: string) => Object.prototype.hasOwnProperty.call(objeto, chave);

// ------------------------------------------------------------------ a tabela das duas cópias
const ROTEIROS: [string, unknown][] = [
  ["linear", CASO_LINEAR],
  ["ramificado", CASO_RAMIFICADO],
  ["nulo", null],
  ["lista", []],
  ["sem etapas", { contexto: "", etapas: [], reflexao: "" }],
  ["etapa número", { etapas: [1] }],
  ["segura texto", mudado(CASO_LINEAR, (c) => (c.etapas[0].opcoes[0].segura = "sim"))],
  ["id vazio", mudado(CASO_LINEAR, (c) => (c.etapas[1].id = " "))],
  ["id repetido", mudado(CASO_LINEAR, (c) => (c.etapas[2].id = "e2"))],
  [
    "id vazio e opções que não são lista",
    mudado(CASO_LINEAR, (c) => {
      c.etapas[1].id = "";
      c.etapas[1].opcoes = "a, b";
    }),
  ],
  [
    "id em branco e formato errado",
    mudado(CASO_LINEAR, (c) => {
      c.etapas[0].id = "  ";
      c.etapas[0].pergunta = 7;
      c.etapas[0].opcoes[0].segura = "sim";
    }),
  ],
  ["pergunta vazia", mudado(CASO_LINEAR, (c) => (c.etapas[0].pergunta = ""))],
  ["uma opção", mudado(CASO_LINEAR, (c) => c.etapas[0].opcoes.splice(0, 1))],
  ["próxima inexistente", mudado(CASO_LINEAR, (c) => (c.etapas[0].opcoes[0].proxima = "e9"))],
  ["fim inseguro", mudado(CASO_LINEAR, (c) => (c.etapas[1].opcoes[0].proxima = null))],
  ["sem segura", mudado(CASO_LINEAR, (c) => (c.etapas[2].opcoes[1].segura = false))],
  [
    "inalcançável",
    mudado(CASO_RAMIFICADO, (c) =>
      c.etapas.push({
        id: "x1",
        pergunta: "Solta?",
        opcoes: [opc("Fim", true, null), opc("Volta", false, "x1")],
      })
    ),
  ],
  ["sem saída", mudado(CASO_RAMIFICADO, (c) => (c.etapas[1].opcoes[0].proxima = "r1"))],
  [
    "sem caminho seguro",
    {
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
    },
  ],
  ["contexto longo", mudado(CASO_LINEAR, (c) => (c.contexto = "x".repeat(4001)))],
  ["pergunta longa", mudado(CASO_LINEAR, (c) => (c.etapas[1].pergunta = "p".repeat(1001)))],
  ["etapas demais (cadeia boa)", { etapas: cadeia(LIMITES_CASO.etapas + 1) }],
  [
    "etapas demais com caminho quebrado",
    {
      etapas: [
        ...cadeia(LIMITES_CASO.etapas + 1),
        {
          id: "solta",
          pergunta: "Solta?",
          opcoes: [opc("Volta", false, "solta"), opc("Fica", true, "solta")],
        },
      ],
    },
  ],
  [
    "opções demais com caminho quebrado",
    mudado(CASO_RAMIFICADO, (c) => (c.etapas[1].opcoes = [opc("Só uma", false, "r1")])),
  ],
  ["ids especiais", CASO_ESPECIAL],
];

const CAMINHOS: [string, unknown, unknown][] = [
  ["linear sem escolha", CASO_LINEAR, []],
  ["linear insegura", CASO_LINEAR, [{ etapa: "e1", opcao: 0 }]],
  [
    "linear até o fim",
    CASO_LINEAR,
    [
      { etapa: "e1", opcao: 0 },
      { etapa: "e1", opcao: 1 },
      { etapa: "e2", opcao: 1 },
      { etapa: "e3", opcao: 1 },
    ],
  ],
  [
    "ramificado com recuperação",
    CASO_RAMIFICADO,
    [
      { etapa: "e1", opcao: 2 },
      { etapa: "r1", opcao: 1 },
      { etapa: "r1", opcao: 0 },
      { etapa: "e1", opcao: 0 },
      { etapa: "e2", opcao: 1 },
      { etapa: "r2", opcao: 0 },
    ],
  ],
  ["fora de ordem", CASO_LINEAR, [{ etapa: "e2", opcao: 1 }]],
  ["opção que não existe", CASO_LINEAR, [{ etapa: "e1", opcao: 7 }]],
  ["opção em texto", CASO_LINEAR, [{ etapa: "e1", opcao: "1" }]],
  ["escolhas que não são lista", CASO_LINEAR, "x"],
  ["roteiro inválido", { etapas: [] }, []],
  [
    "ids especiais no meio do caminho",
    CASO_ESPECIAL,
    [
      { etapa: "e1", opcao: 1 },
      { etapa: "__proto__", opcao: 0 },
      { etapa: "__proto__", opcao: 1 },
      { etapa: "toString", opcao: 0 },
    ],
  ],
  [
    "ids especiais até o fim",
    CASO_ESPECIAL,
    [
      { etapa: "e1", opcao: 1 },
      { etapa: "__proto__", opcao: 1 },
      { etapa: "toString", opcao: 1 },
      { etapa: "constructor", opcao: 1 },
    ],
  ],
];

test("LIMITES_CASO: os mesmos valores nas duas cópias", () => {
  assert.deepEqual(LIMITES_CASO, {
    etapas: 30,
    opcoesMin: 2,
    opcoesMax: 6,
    texto: 1000,
    longo: 4000,
  });
  assert.deepEqual(LIMITES_CASO, LIMITES_FRONT);
});

test("validarCaso: servidor e front dizem o mesmo em toda a tabela", () => {
  for (const [nome, roteiro] of ROTEIROS) {
    assert.deepEqual(validarCaso(roteiro), validarFront(roteiro), nome);
  }
});

test("estadoDoCaso e resultadoDaEscolha: servidor e front dizem o mesmo em toda a tabela", () => {
  for (const [nome, roteiro, escolhas] of CAMINHOS) {
    const estado = estadoDoCaso(roteiro, escolhas);
    assert.deepEqual(estado, estadoFront(roteiro, escolhas), nome);
    for (const etapa of [
      "e1",
      "e2",
      "e3",
      "r1",
      "r2",
      "x",
      "__proto__",
      "toString",
      "constructor",
    ]) {
      for (const opcao of [0, 1, 2, 5, "1", null]) {
        assert.deepEqual(
          resultadoDaEscolha(roteiro, estado, etapa, opcao),
          resultadoFront(roteiro, estado, etapa, opcao),
          `${nome} / ${etapa} / ${String(opcao)}`
        );
      }
    }
  }
});

test("etapaParaAluno: servidor e front embaralham igual com o mesmo sorteio", () => {
  const sorteios = [() => 0, (n: number) => n - 1, (n: number) => Math.floor(n / 2)];
  for (const sorteio of sorteios) {
    for (const [roteiro, etapa] of [
      [CASO_LINEAR, "e1"],
      [CASO_RAMIFICADO, "e1"],
      [CASO_RAMIFICADO, "r2"],
      [CASO_ESPECIAL, "__proto__"],
      [CASO_ESPECIAL, "constructor"],
    ] as const) {
      assert.deepEqual(
        etapaParaAluno(roteiro, etapa, sorteio),
        etapaFront(roteiro, etapa, sorteio)
      );
    }
  }
});

// ---------------------------------------------------------------------------- a regra em si
test("validarCaso: o linear e o ramificado com recuperação são válidos; os quebrados dão o código certo", () => {
  assert.deepEqual(validarCaso(CASO_LINEAR), []);
  assert.deepEqual(validarCaso(CASO_RAMIFICADO), []);
  const codigos = new Map(ROTEIROS.map(([nome, r]) => [nome, validarCaso(r).map((p) => p.codigo)]));
  assert.deepEqual(codigos.get("nulo"), ["FORMATO"]);
  assert.deepEqual(codigos.get("sem etapas"), ["SEM_ETAPAS"]);
  assert.deepEqual(codigos.get("segura texto"), ["FORMATO"]);
  assert.ok(codigos.get("id vazio")?.includes("ID_VAZIO"));
  assert.ok(codigos.get("id repetido")?.includes("ID_REPETIDO"));
  assert.deepEqual(codigos.get("pergunta vazia"), ["PERGUNTA_VAZIA"]);
  assert.deepEqual(codigos.get("uma opção"), ["OPCOES_QTD"]);
  assert.deepEqual(codigos.get("próxima inexistente"), ["PROXIMA_INEXISTENTE"]);
  assert.deepEqual(codigos.get("fim inseguro"), ["FIM_INSEGURO"]);
  assert.ok(codigos.get("sem segura")?.includes("SEM_SEGURA"));
  assert.deepEqual(codigos.get("inalcançável"), ["INALCANCAVEL"]);
  assert.deepEqual(codigos.get("sem saída"), ["SEM_SAIDA"]);
  assert.deepEqual(codigos.get("sem caminho seguro"), ["SEM_CAMINHO_SEGURO"]);
  assert.deepEqual(codigos.get("contexto longo"), ["TAMANHO"]);
  assert.deepEqual(codigos.get("pergunta longa"), ["TAMANHO"]);
});

test("validarCaso: FORMATO de uma etapa com id vazio vem com etapa null (como o resto do módulo)", () => {
  const semLista = mudado(CASO_LINEAR, (c) => {
    c.etapas[1].id = "";
    c.etapas[1].opcoes = "a, b";
  });
  const esperado = [
    { codigo: "FORMATO", texto: "As opções da etapa nº 2 precisam ser uma lista", etapa: null },
  ];
  assert.deepEqual(validarCaso(semLista), esperado);
  assert.deepEqual(validarFront(semLista), esperado);
  const emBranco = mudado(CASO_LINEAR, (c) => {
    c.etapas[0].id = "  ";
    c.etapas[0].pergunta = 7;
    c.etapas[0].opcoes[0].segura = "sim";
  });
  for (const validar of [validarCaso, validarFront]) {
    assert.deepEqual(
      validar(emBranco).map((p: { codigo: string; etapa: string | null }) => [p.codigo, p.etapa]),
      [
        ["FORMATO", null],
        ["FORMATO", null],
      ]
    );
  }
});

test("validarCaso: roteiro grande demais ou com opções demais devolve só o que achou, sem conferir o caminho", () => {
  // o banco não limita o tamanho do roteiro e o servidor valida a cada clique: nada de varrer milhares de etapas
  const quebrado = ROTEIROS.find(([nome]) => nome === "etapas demais com caminho quebrado")?.[1];
  const opcoesDemais = ROTEIROS.find(
    ([nome]) => nome === "opções demais com caminho quebrado"
  )?.[1];
  const enorme = { etapas: cadeia(LIMITES_CASO.etapas * 50) };
  for (const validar of [validarCaso, validarFront]) {
    const codigos = (r: unknown) => validar(r).map((p: { codigo: string }) => p.codigo);
    // a etapa solta daria INALCANCAVEL e SEM_SAIDA se o caminho fosse conferido
    assert.deepEqual(codigos(quebrado), ["MUITAS_ETAPAS"]);
    // a etapa r1 (sem segura, com uma opção só) daria SEM_SAIDA
    assert.deepEqual(codigos(opcoesDemais), ["OPCOES_QTD", "SEM_SEGURA"]);
    // milhares de etapas em cadeia: só MUITAS_ETAPAS, e rápido
    const inicio = Date.now();
    assert.deepEqual(codigos(enorme), ["MUITAS_ETAPAS"]);
    assert.ok(Date.now() - inicio < 1000, "validar milhares de etapas levou mais de 1 s");
  }
  assert.equal(estadoDoCaso(enorme, []).motivo, "CASO_INVALIDO");
  assert.equal(estadoFront(enorme, []).motivo, "CASO_INVALIDO");
});

test("ids de etapa que são nomes de propriedade de objeto: válidos, com passagens em chave própria", () => {
  const copias = [
    ["servidor", { validarCaso, estadoDoCaso, resultadoDaEscolha }],
    [
      "front",
      { validarCaso: validarFront, estadoDoCaso: estadoFront, resultadoDaEscolha: resultadoFront },
    ],
  ] as const;
  for (const [nome, regra] of copias) {
    assert.deepEqual(regra.validarCaso(CASO_ESPECIAL), [], nome);
    const meio = regra.estadoDoCaso(CASO_ESPECIAL, [
      { etapa: "e1", opcao: 1 },
      { etapa: "__proto__", opcao: 0 },
      { etapa: "__proto__", opcao: 1 },
      { etapa: "toString", opcao: 1 },
    ]);
    assert.equal(meio.valido, true, nome);
    assert.equal(meio.etapaAtual, "constructor", nome);
    for (const id of ["__proto__", "toString", "constructor"]) {
      assert.ok(tem(meio.passagens, id), `${nome}: passagens tem a chave própria ${id}`);
    }
    assert.deepEqual(
      Object.keys(meio.passagens),
      ["e1", "__proto__", "toString", "constructor"],
      nome
    );
    assert.equal(meio.passagens["e1"], 1, nome);
    assert.equal(meio.passagens["__proto__"], 2, nome);
    assert.equal(meio.passagens["toString"], 1, nome);
    assert.equal(meio.passagens["constructor"], 1, nome);

    // na 2ª visita a "__proto__", a segura leva a "toString" e a passagem é a 2ª
    const naSegunda = regra.estadoDoCaso(CASO_ESPECIAL, [
      { etapa: "e1", opcao: 1 },
      { etapa: "__proto__", opcao: 0 },
    ]);
    assert.deepEqual(
      regra.resultadoDaEscolha(CASO_ESPECIAL, naSegunda, "__proto__", 1),
      {
        ok: true,
        comentario: "Comentário: Segue",
        segura: true,
        proxima: "toString",
        fim: false,
        passagem: 2,
      },
      nome
    );
    const naUltima = regra.estadoDoCaso(CASO_ESPECIAL, [
      { etapa: "e1", opcao: 1 },
      { etapa: "__proto__", opcao: 1 },
      { etapa: "toString", opcao: 0 },
      { etapa: "toString", opcao: 1 },
      { etapa: "constructor", opcao: 0 },
    ]);
    assert.equal(naUltima.passagens["toString"], 2, nome);
    assert.equal(naUltima.passagens["constructor"], 2, nome);
    assert.deepEqual(
      regra.resultadoDaEscolha(CASO_ESPECIAL, naUltima, "constructor", 1),
      {
        ok: true,
        comentario: "Comentário: Encerra",
        segura: true,
        proxima: null,
        fim: true,
        passagem: 2,
      },
      nome
    );
    // um id que o roteiro não tem nunca herda uma propriedade do objeto
    assert.deepEqual(
      regra.resultadoDaEscolha(CASO_ESPECIAL, naUltima, "hasOwnProperty", 0),
      { ok: false, codigo: "CASO_FORA_DE_ORDEM" },
      nome
    );
  }
  assert.equal(etapaParaAluno(CASO_ESPECIAL, "__proto__", () => 0).id, "__proto__");
  assert.equal(etapaParaAluno(CASO_ESPECIAL, "constructor", () => 0).pergunta, "Quarta?");
});

test("estadoDoCaso: refaz o caminho do ramificado (recuperação devolve à decisão; passagens por etapa)", () => {
  const estado = estadoDoCaso(CASO_RAMIFICADO, CAMINHOS[3][2]);
  assert.equal(estado.valido, true);
  assert.equal(estado.etapaAtual, "e2");
  assert.deepEqual(estado.passagens, { e1: 2, r1: 2, e2: 2, r2: 1 });
  assert.deepEqual(estado.ultimo, { comentario: "Comentário: R2 segura", segura: true });
  const fim = estadoDoCaso(CASO_RAMIFICADO, [
    ...(CAMINHOS[3][2] as object[]),
    { etapa: "e2", opcao: 0 },
  ]);
  assert.equal(fim.fim, true);
  assert.equal(fim.etapaAtual, null);
});

test("resultadoDaEscolha: etapa fora de ordem é recusada (o caso não pula etapa)", () => {
  const inicio = estadoDoCaso(CASO_LINEAR, []);
  assert.deepEqual(resultadoDaEscolha(CASO_LINEAR, inicio, "e3", 1), {
    ok: false,
    codigo: "CASO_FORA_DE_ORDEM",
  });
  assert.deepEqual(resultadoDaEscolha(CASO_LINEAR, inicio, "e1", 1), {
    ok: true,
    comentario: "Comentário: Conferir o plano",
    segura: true,
    proxima: "e2",
    fim: false,
    passagem: 1,
  });
});

test("etapaParaAluno: as opções vão sem segura, comentário e próxima, com o índice original", () => {
  for (const etapa of ["e1", "r1", "e2", "r2"]) {
    const vista = etapaParaAluno(CASO_RAMIFICADO, etapa, () => 0);
    for (const o of vista.opcoes) assert.deepEqual(Object.keys(o).sort(), ["indice", "texto"]);
    assert.deepEqual(Object.keys(vista).sort(), ["id", "opcoes", "pergunta"]);
    assert.ok(!JSON.stringify(vista).includes("Comentário:"), etapa);
  }
  assert.throws(() => etapaParaAluno(CASO_LINEAR, "e1", (n) => n), RangeError);
});

// ---------------------------------------------------------------- escolhasDaRodada (só no servidor)
const ev = (evento: string, detalhe: unknown) => ({ evento, detalhe });

test("escolhasDaRodada: sem eventos, rodada 1 e nenhuma escolha", () => {
  assert.deepEqual(escolhasDaRodada([]), { rodada: 1, escolhas: [] });
  assert.deepEqual(escolhasDaRodada(null), { rodada: 1, escolhas: [] });
});

test("escolhasDaRodada: só as escolhas da maior rodada, em ordem; o resto da trilha é ignorado", () => {
  const eventos = [
    ev("aula_aberta", { aula: "x" }),
    ev("caso_escolha", {
      rodada: 1,
      etapa: "e1",
      opcao: 0,
      segura: false,
      proxima: "e1",
      passagem: 1,
    }),
    ev("caso_escolha", {
      rodada: 1,
      etapa: "e1",
      opcao: 1,
      segura: true,
      proxima: "e2",
      passagem: 2,
    }),
    ev("caso_reiniciado", { rodada: 2, motivo: "caso_alterado" }),
    ev("caso_escolha", {
      rodada: 2,
      etapa: "e1",
      opcao: 1,
      segura: true,
      proxima: "e2",
      passagem: 1,
    }),
    ev("caso_escolha", JSON.stringify({ rodada: 2, etapa: "e2", opcao: 1 })),
    ev("caso_escolha", { rodada: 2, etapa: "e2" }), // sem opção: ignorada
    ev("caso_escolha", { rodada: 2, etapa: 3, opcao: 0 }), // etapa que não é texto: ignorada
    ev("caso_escolha", "não é JSON"),
    ev("caso_escolha", null),
  ];
  assert.deepEqual(escolhasDaRodada(eventos), {
    rodada: 2,
    escolhas: [
      { etapa: "e1", opcao: 1 },
      { etapa: "e2", opcao: 1 },
    ],
  });
});

test("roteiro alterado pelo RH: o caminho gravado diverge e a rodada nova recomeça da primeira etapa", () => {
  const gravadas = [
    ev("caso_escolha", { rodada: 1, etapa: "e1", opcao: 1 }),
    ev("caso_escolha", { rodada: 1, etapa: "e2", opcao: 1 }),
  ];
  const rodada1 = escolhasDaRodada(gravadas);
  assert.equal(estadoDoCaso(CASO_LINEAR, rodada1.escolhas).etapaAtual, "e3");
  // o RH tirou a etapa e2: o mesmo caminho não confere mais
  const alterado = mudado(CASO_LINEAR, (c) => {
    c.etapas.splice(1, 1);
    c.etapas[0].opcoes[1].proxima = "e3";
  });
  assert.deepEqual(validarCaso(alterado), []);
  const divergente = estadoDoCaso(alterado, rodada1.escolhas);
  assert.equal(divergente.valido, false);
  assert.equal(divergente.motivo, "CAMINHO_DIVERGENTE");
  // o servidor grava caso_reiniciado com a rodada seguinte: a nova rodada começa sem escolhas, na 1ª etapa
  const depois = escolhasDaRodada([
    ...gravadas,
    ev("caso_reiniciado", { rodada: rodada1.rodada + 1, motivo: "caso_alterado" }),
  ]);
  assert.deepEqual(depois, { rodada: 2, escolhas: [] });
  const recomeco = estadoDoCaso(alterado, depois.escolhas);
  assert.equal(recomeco.valido, true);
  assert.equal(recomeco.etapaAtual, "e1");
  assert.deepEqual(recomeco.passagens, { e1: 1 });
});
