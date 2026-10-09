// node --test supabase/functions/_shared/edital/acervo-cadastro.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  marcarSinteses,
  MSG_SEM_CONFIRMACAO,
  numeroCatNormalizado,
  validarAtestado,
} from "./acervo-cadastro.ts";
import { CATEGORIAS_ACERVO, categoriaValida } from "./acervo-categorias.ts";

const linha = (
  categoria: string,
  quantidade: number | null,
  unidade: string | null,
  sintese?: boolean
) => ({
  categoria,
  descricao: `${categoria} ${quantidade ?? "?"} ${unidade ?? ""}`.trim(),
  quantidade,
  unidade,
  especificacao: null,
  na_atividade_tecnica: false,
  ...(sintese === undefined ? {} : { sintese }),
});
const marcas = (qs: { observacao: string }[]) => qs.map((q) => q.observacao);

const minima = (extra: Record<string, unknown> = {}) => ({
  confirmado_pelo_usuario: true,
  tipo: "cat",
  numero: "CAT nº 1.000.001/2026",
  objeto: "Iluminação pública com LED",
  quantitativos: [{ categoria: "poste", descricao: "Postes implantados", quantidade: 10 }],
  ...extra,
});

test("categoriaValida: id, caixa, acento, espaço e rótulo da tela; fora da lista → outro", () => {
  assert.equal(CATEGORIAS_ACERVO.length, 24);
  assert.equal(CATEGORIAS_ACERVO.at(-1)?.id, "outro");
  assert.equal(categoriaValida("poste"), "poste");
  assert.equal(categoriaValida("Cabo MT protegido"), "cabo_mt_protegido");
  assert.equal(categoriaValida("ESCAVAÇÃO"), "escavacao");
  assert.equal(categoriaValida("Postes"), "poste");
  assert.equal(categoriaValida("Potência (kVA)"), "potencia_kva");
  assert.equal(categoriaValida("iluminação de praça"), "outro");
  assert.equal(categoriaValida(null), "outro");
  assert.equal(categoriaValida(12), "outro");
});

test("validarAtestado: sem confirmado_pelo_usuario: true é erro (nem 'true' em texto vale)", () => {
  for (const confirmado of [undefined, false, "true", 1]) {
    const r = validarAtestado(minima({ confirmado_pelo_usuario: confirmado }));
    assert.deepEqual(r, { ok: false, erros: [MSG_SEM_CONFIRMACAO] }, String(confirmado));
  }
  assert.equal(
    MSG_SEM_CONFIRMACAO,
    "Mostre a conferência ao usuário e envie confirmado_pelo_usuario: true"
  );
});

test("validarAtestado: CAT completa normalizada, categoria fora da lista vira outro com aviso", () => {
  const r = validarAtestado({
    confirmado_pelo_usuario: true,
    tipo: "CAT",
    numero: " CAT nº 3.239.747/2025 ",
    conselho: "CREA-MG",
    art_numero: "MG20250000001",
    contratante: "Prefeitura Municipal de Cidade Teste",
    contratante_cnpj: "00.000.000/0001-00",
    contrato: "012/2024",
    data_inicio: "05/02/2024",
    data_fim: "2024-11-30",
    objeto: "Eficientização da iluminação pública com LED",
    cidade: "Cidade Teste",
    uf: "minas gerais",
    atividades: ["Execução", "obra", "fiscalização", "execucao"],
    com_execucao: true,
    situacao: "Concluída",
    profissional: {
      nome: " Eng. Fulano Sintético ",
      registro: "MG-0999001/D",
      titulos: "Engenheiro Eletricista",
    },
    cobre_arts: ["MG2024001", " MG2024001 ", "MG2024002", ""],
    riscos: null,
    observacoes: "Atestado sintético",
    quantitativos: [
      {
        categoria: "Postes",
        descricao: "Poste de concreto DT 11 m/300 daN",
        quantidade: 30,
        unidade: "un",
        na_atividade_tecnica: true,
      },
      {
        categoria: "poste",
        descricao: "Total de postes implantados",
        quantidade: "50",
        sintese: true,
      },
      {
        categoria: "iluminação de praça",
        descricao: "Projetor LED 150 W",
        quantidade: 12,
        unidade: "pç",
        especificacao: "LED 150 W",
      },
      {
        categoria: "cabo_bt_multiplexado",
        descricao: "Cabo multiplexado 3x1x35+35",
        quantidade: "1,2",
        unidade: "km",
      },
      {
        categoria: "cabo_bt_multiplexado",
        descricao: "Cabo multiplexado 2x1x16+16",
        quantidade: 800,
        unidade: "m",
      },
    ],
  });
  assert.deepEqual(r, {
    ok: true,
    atestado: {
      tipo: "cat",
      numero: "CAT nº 3.239.747/2025",
      conselho: "CREA-MG",
      art_numero: "MG20250000001",
      contratante: "Prefeitura Municipal de Cidade Teste",
      contratante_cnpj: "00.000.000/0001-00",
      contrato: "012/2024",
      data_inicio: "2024-02-05",
      data_fim: "2024-11-30",
      objeto: "Eficientização da iluminação pública com LED",
      cidade: "Cidade Teste",
      uf: "MG",
      atividades: ["execucao", "fiscalizacao"],
      com_execucao: true,
      situacao: "concluida",
      empresa_executora: null,
      cobre_arts: ["MG2024001", "MG2024002"],
      riscos: null,
      observacoes: "Atestado sintético",
      profissional_nome: "Eng. Fulano Sintético",
    },
    profissional: {
      nome: "Eng. Fulano Sintético",
      registro: "MG-0999001/D",
      titulos: "Engenheiro Eletricista",
    },
    quantitativos: [
      {
        categoria: "poste",
        descricao: "Poste de concreto DT 11 m/300 daN",
        quantidade: 30,
        unidade: "un",
        especificacao: null,
        na_atividade_tecnica: true,
        observacao: "detalhe",
        ordem: 1,
      },
      {
        categoria: "poste",
        descricao: "Total de postes implantados",
        quantidade: 50,
        unidade: "un",
        especificacao: null,
        na_atividade_tecnica: false,
        observacao: "síntese",
        ordem: 2,
      },
      {
        categoria: "outro",
        descricao: "Projetor LED 150 W",
        quantidade: 12,
        unidade: "pç",
        especificacao: "LED 150 W",
        na_atividade_tecnica: false,
        observacao: "síntese",
        ordem: 3,
      },
      {
        categoria: "cabo_bt_multiplexado",
        descricao: "Cabo multiplexado 3x1x35+35",
        quantidade: 1.2,
        unidade: "km",
        especificacao: null,
        na_atividade_tecnica: false,
        observacao: "síntese",
        ordem: 4,
      },
      {
        categoria: "cabo_bt_multiplexado",
        descricao: "Cabo multiplexado 2x1x16+16",
        quantidade: 800,
        unidade: "m",
        especificacao: null,
        na_atividade_tecnica: false,
        observacao: "detalhe",
        ordem: 5,
      },
    ],
    avisos: [
      'atividades: "obra" fora da lista (execucao, projeto, consultoria, fiscalizacao, assessoria); não gravada',
      'quantitativos[2].categoria "iluminação de praça" fora da lista: gravada como "outro"',
      "categoria cabo_bt_multiplexado: nenhuma linha marcada como síntese; ficou quantitativos[3] (a de maior quantidade)",
    ],
  });
});

test("validarAtestado: datas inválidas, UF, tipo e quantitativos com problema voltam todos de uma vez", () => {
  const r = validarAtestado({
    tipo: "obra",
    objeto: "   ",
    data_inicio: "31/02/2026",
    data_fim: "2026-01-10",
    uf: "XX",
    com_execucao: "sim",
    situacao: "parada",
    profissional: { registro: "123" },
    quantitativos: [
      { categoria: "poste", descricao: "", quantidade: -1 },
      "texto",
      { categoria: "poste", descricao: "Postes", quantidade: "abc", sintese: "sim" },
    ],
  });
  assert.deepEqual(r, {
    ok: false,
    erros: [
      MSG_SEM_CONFIRMACAO,
      "tipo: use cat, atestado, cao, cat_profissional",
      "objeto: obrigatório (objeto ou obra do atestado)",
      "data_inicio: data inválida (use AAAA-MM-DD)",
      "uf: use a sigla do estado com 2 letras (ex.: MG)",
      "com_execucao: use true, false ou null",
      "situacao: use concluida ou em_andamento",
      "profissional.nome: obrigatório (ou envie profissional: null)",
      "quantitativos[0].descricao: obrigatória",
      "quantitativos[0].quantidade: número maior ou igual a zero",
      "quantitativos[1]: deve ser um objeto",
      "quantitativos[2].quantidade: número maior ou igual a zero",
      "quantitativos[2].sintese: use true ou false",
    ],
  });
});

test("validarAtestado: fim antes do início; quantitativos vazio ou acima de 200", () => {
  assert.deepEqual(validarAtestado(minima({ data_inicio: "2026-03-01", data_fim: "28/02/2026" })), {
    ok: false,
    erros: ["data_fim: anterior à data_inicio"],
  });
  const muitas = Array.from({ length: 201 }, (_, i) => ({
    categoria: "poste",
    descricao: `L${i}`,
  }));
  for (const quantitativos of [[], muitas, undefined]) {
    assert.deepEqual(validarAtestado(minima({ quantitativos })), {
      ok: false,
      erros: ["quantitativos: informe de 1 a 200 linhas"],
    });
  }
});

test("validarAtestado: CAT sem nº avisa que não confere duplicidade; atestado sem CAT não avisa", () => {
  const cat = validarAtestado(minima({ numero: "s/n" }));
  assert.ok(cat.ok);
  assert.deepEqual(cat.avisos, [
    "numero: sem o nº do documento o SIGO não confere se ele já foi cadastrado",
  ]);
  const atestado = validarAtestado(minima({ tipo: "atestado", numero: null }));
  assert.ok(atestado.ok);
  assert.deepEqual(atestado.avisos, []);
  assert.equal(atestado.atestado.situacao, "concluida");
  assert.equal(atestado.profissional, null);
  assert.equal(atestado.atestado.profissional_nome, null);
});

test("validarAtestado: os avisos repetem no máximo 60 caracteres do que foi enviado", () => {
  const longo = "x".repeat(5000);
  const r = validarAtestado(
    minima({
      atividades: [longo],
      quantitativos: [{ categoria: longo, descricao: "Postes", quantidade: 1 }],
    })
  );
  assert.ok(r.ok);
  assert.deepEqual(r.avisos, [
    `atividades: "${"x".repeat(59)}…" fora da lista (execucao, projeto, consultoria, fiscalizacao, assessoria); não gravada`,
    `quantitativos[0].categoria "${"x".repeat(59)}…" fora da lista: gravada como "outro"`,
  ]);
});

test("marcarSinteses: nenhuma marcada → a de maior quantidade; empate → a primeira", () => {
  assert.deepEqual(
    marcas(
      marcarSinteses([linha("poste", 30, "un"), linha("poste", 50, "un"), linha("poste", 50, "un")])
    ),
    ["detalhe", "síntese", "detalhe"]
  );
  assert.deepEqual(marcas(marcarSinteses([linha("poste", null, null), linha("poste", 5, "un")])), [
    "detalhe",
    "síntese",
  ]);
  assert.deepEqual(marcas(marcarSinteses([linha("topografia", null, null)])), ["síntese"]);
});

test("marcarSinteses: uma marcada vale mesmo menor; várias marcadas → a maior entre elas", () => {
  assert.deepEqual(
    marcas(marcarSinteses([linha("poste", 30, "un", true), linha("poste", 50, "un")])),
    ["síntese", "detalhe"]
  );
  assert.deepEqual(
    marcas(
      marcarSinteses([
        linha("poste", 10, "un", true),
        linha("poste", 60, "un"),
        linha("poste", 40, "un", true),
      ])
    ),
    ["detalhe", "detalhe", "síntese"]
  );
});

test("marcarSinteses: km × m pela unidade canônica; categorias independentes; ordem = posição + 1", () => {
  assert.deepEqual(
    marcas(marcarSinteses([linha("rede_aerea", 1500, "m"), linha("rede_aerea", 2, "km")])),
    ["detalhe", "síntese"]
  );
  assert.deepEqual(
    marcas(marcarSinteses([linha("rede_aerea", 2500, "metros"), linha("rede_aerea", 2, "km")])),
    ["síntese", "detalhe"]
  );
  const r = marcarSinteses([
    linha("poste", 3, "un"),
    linha("spda", 1, "conj", true),
    linha("poste", 9, "un"),
  ]);
  assert.deepEqual(
    r.map(({ categoria, observacao, ordem }) => [categoria, observacao, ordem]),
    [
      ["poste", "detalhe", 1],
      ["spda", "síntese", 2],
      ["poste", "síntese", 3],
    ]
  );
  assert.ok(r.every((q) => !("sintese" in q)));
});

test("numeroCatNormalizado: só dígitos e '/'; sem dígito → null", () => {
  assert.equal(numeroCatNormalizado("CAT nº 3.239.747/2025"), "3239747/2025");
  assert.equal(numeroCatNormalizado("  1234567/2024-A "), "1234567/2024");
  assert.equal(numeroCatNormalizado(2024123), "2024123");
  for (const v of ["s/n", "S/N", "", "   ", null, undefined, {}]) {
    assert.equal(numeroCatNormalizado(v), null, String(v));
  }
});
