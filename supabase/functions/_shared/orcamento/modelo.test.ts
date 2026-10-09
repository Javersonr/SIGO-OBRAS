// node --test supabase/functions/_shared/orcamento/modelo.test.ts
// As regras são as da tela (a paridade fica em apps/web/src/lib/modelo-paridade.test.js); aqui, o
// que é do JSON do conector: "Linha n" = índice + 2, linha vazia pulada, informações em número e
// os bloqueios do conector (itensSemEtapa).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CAMPOS_INFORMACOES_CONECTOR,
  CAMPOS_LINHA_CONECTOR,
  LIMITE_LINHAS,
  validarLinhasModelo,
  type InformacoesConector,
  type LinhaConector,
} from "./modelo.ts";
import { orcamentoSintetico } from "./testes/sintetico.ts";

const etapa = (item: string, descricao: string): LinhaConector => ({ item, descricao });
const linha = (
  item: string | number | null,
  descricao: string,
  quantidade: number | string | null,
  preco_unitario: number | string | null,
  extra: Partial<LinhaConector> = {}
): LinhaConector => ({ item, descricao, unidade: "un", quantidade, preco_unitario, ...extra });

// O ORC_OK de orcamento-modelo.test.js (Itatinga reduzido), em JSON.
const ORC_OK: LinhaConector[] = [
  etapa("1", "SERVIÇOS PRELIMINARES"),
  {
    item: "1.1",
    codigo: "93358",
    fonte: "SINAPI",
    descricao: "Escavação manual",
    unidade: "m³",
    quantidade: 125.5,
    preco_unitario: 10.48,
    total: 1315.24,
  },
  {
    item: "1.2",
    descricao: "Placa de obra",
    unidade: "m²",
    quantidade: "2,88",
    preco_unitario: "400,00",
    total: "1.152,00",
  },
  etapa("2", "ILUMINAÇÃO"),
  {
    item: "2.1",
    codigo: 41210,
    fonte: "SINAPI",
    descricao: "Poste 12/1000",
    unidade: "un",
    quantidade: 6,
    preco_unitario: 2827.92,
    total: 16967.52,
  },
];
const INFO_OK = {
  orgao: "Prefeitura Municipal de Itatinga",
  objeto: "Iluminação pública",
  edital: "PE 12/2026",
  data_base: "09/2025",
  bdi: "23,96",
  fonte_precos: "SINAPI 09/2025",
  total_prefeitura: 19434.76,
  observacoes: "",
};

test("constantes: os 8 campos da linha e das informações, limite de 3000", () => {
  assert.deepEqual(CAMPOS_LINHA_CONECTOR, [
    "item",
    "codigo",
    "fonte",
    "descricao",
    "unidade",
    "quantidade",
    "preco_unitario",
    "total",
  ]);
  assert.equal(CAMPOS_INFORMACOES_CONECTOR.length, 8);
  assert.equal(LIMITE_LINHAS, 3000);
});

test("caminho feliz: etapas, itens, info e totais, sem aviso e sem bloqueio", () => {
  const r = validarLinhasModelo(ORC_OK, INFO_OK);
  assert.deepEqual(r.erros, []);
  assert.deepEqual(r.avisos, []);
  assert.deepEqual(r.itensSemEtapa, []);
  assert.deepEqual(r.totais, {
    referencia: 19434.76,
    prefeitura: 19434.76,
    qtdEtapas: 2,
    qtdItens: 3,
  });
  assert.deepEqual(r.itens[2], {
    linha: 4,
    numero: "1.2",
    etapa: false,
    codigo: null,
    fonte: null,
    descricao: "Placa de obra",
    unidade: "m²",
    quantidade: 2.88,
    valor_unitario_ref: 400,
    total_informado: 1152,
  });
  assert.equal(r.itens[4].codigo, "41210");
  assert.deepEqual(r.info, {
    orgao: "Prefeitura Municipal de Itatinga",
    objeto: "Iluminação pública",
    edital: "PE 12/2026",
    data_base: "09/2025",
    bdi: "23,96",
    fonte: "SINAPI 09/2025",
    total_prefeitura: 19434.76,
    observacoes: null,
  });
});

test("itensSemEtapa: item sem etapa acima (aviso da tela; o conector bloqueia)", () => {
  const r = validarLinhasModelo(
    [
      etapa("1", "Etapa 1"),
      linha("1.1", "A", 1, 1),
      linha("1.3", "B", 1, 1),
      linha("2.1", "C", 1, 1),
    ],
    null
  );
  assert.deepEqual(r.erros, []);
  assert.deepEqual(r.itensSemEtapa, ["2.1"]);
  assert.deepEqual(r.avisos, [
    "Linha 4: Item 1.3 fora de sequência (depois de 1.1).",
    "Linha 5: Item 2.1 fora de sequência (depois de 1.3).",
    "Linha 5: item 2.1 sem etapa acima.",
  ]);
});

test("itensSemEtapa: orçamento sem nenhuma etapa lista todos os itens", () => {
  const r = validarLinhasModelo([linha("1", "A", 1, 1), linha("2", "B", 1, 1)], null);
  assert.deepEqual(r.erros, []);
  assert.deepEqual(r.itensSemEtapa, ["1", "2"]);
  assert.deepEqual(r.avisos, ["A planilha não tem linhas de etapa; os itens ficam sem subtotal."]);
});

test("Linha n = índice + 2; linha com os 8 campos vazios é pulada sem mudar a numeração", () => {
  const vazia = { item: null, descricao: "  ", unidade: "", quantidade: null } as LinhaConector;
  const r = validarLinhasModelo([etapa("1", "Etapa"), vazia, linha("1.1", "Serviço", 1, 2)], null);
  assert.deepEqual(r.erros, []);
  assert.deepEqual(
    r.itens.map((i) => i.linha),
    [2, 4]
  );
});

test("erros da tela, com a linha do JSON: vazio, fora do padrão, repetido, número e par incompleto", () => {
  const r = validarLinhasModelo(
    [
      linha("1.1", "A", 1, 1),
      linha(null, "B", 1, 1),
      linha("1.a", "C", 1, 1),
      linha("1.1", "E", 1, 1),
      linha("1.2", "", 1, 1),
      linha("3", "F", "abc", 1),
      linha("4", "G", 1, null),
      linha("5", "H", 0, 1),
      linha("6", "I", 1, -0.01),
    ],
    null
  );
  assert.deepEqual(r.erros, [
    "Linha 3: Item vazio.",
    'Linha 4: Item "1.a" fora do padrão (use 1, 1.1, 1.1.2).',
    "Linha 5: Item 1.1 repetido (já está na linha 2).",
    "Linha 6: Descrição vazia.",
    'Linha 7: Quantidade não é um número ("abc").',
    "Linha 8: Quantidade sem Preço unitário.",
    "Linha 9: Quantidade deve ser maior que zero.",
    "Linha 10: Preço unitário negativo.",
  ]);
});

test("item em número: inteiro vira texto; não inteiro avisa como a tela", () => {
  const r = validarLinhasModelo([etapa("1", "Etapa"), linha(1.1, "A", 1, 2)], null);
  assert.deepEqual(r.erros, []);
  assert.deepEqual(
    r.itens.map((i) => i.numero),
    ["1", "1.1"]
  );
  assert.deepEqual(r.avisos, [
    "Linha 3: Item lido como número (1.1); se era 1.10, formate a coluna A como Texto e digite de novo.",
  ]);
});

test("informações: BDI em número, total inválido ignorado, Data-base numérica e null", () => {
  const r = validarLinhasModelo(ORC_OK, {
    bdi: 23.96,
    total_prefeitura: "dezenove mil",
    data_base: 45901 as unknown as string,
  });
  assert.equal(r.info.bdi, "23,96");
  assert.equal(r.info.total_prefeitura, null);
  assert.equal(r.info.data_base, "45901");
  assert.deepEqual(r.avisos, [
    "Informações, linha 4: Data-base numérica (45901) — confira.",
    'Informações: Total da prefeitura (R$) não é um número ("dezenove mil"); foi ignorado.',
  ]);
  const semInfo = validarLinhasModelo(ORC_OK, null);
  assert.deepEqual(semInfo.avisos, []);
  assert.equal(semInfo.info.orgao, null);
  assert.equal(semInfo.totais.prefeitura, null);
});

test("soma diferente do total da prefeitura é só aviso", () => {
  const r = validarLinhasModelo(ORC_OK, { total_prefeitura: "R$ 19.500,00" });
  assert.deepEqual(r.erros, []);
  assert.deepEqual(r.avisos, [
    "Soma dos itens (R$ 19.434,76) difere do Total da prefeitura (R$ 19.500,00) em R$ 65,24.",
  ]);
});

test("limite: 3000 linhas passam; 3001 é erro e nada é lido", () => {
  const sintetico = orcamentoSintetico().map((i) => ({
    item: i.numero,
    codigo: i.codigo,
    fonte: i.fonte,
    descricao: i.descricao,
    unidade: i.unidade,
    quantidade: i.quantidade,
    preco_unitario: i.valor_unitario_ref,
    total: null,
  }));
  const ok = validarLinhasModelo(sintetico, null);
  assert.deepEqual(ok.erros, []);
  assert.deepEqual(ok.itensSemEtapa, []);
  assert.equal(ok.totais.qtdItens, 2960);
  assert.equal(ok.totais.qtdEtapas, 40);
  const demais = validarLinhasModelo([...sintetico, linha("11", "x", 1, 1)], null);
  assert.deepEqual(demais.erros, [
    'A aba "Orçamento" tem 3.001 linhas preenchidas; o limite é 3.000.',
  ]);
  assert.deepEqual(demais.itens, []);
});

test("lista vazia ou que não é lista: nenhum item", () => {
  const msg = 'Nenhum item com Quantidade e Preço unitário na aba "Orçamento".';
  assert.deepEqual(validarLinhasModelo([], null).erros, [msg]);
  assert.deepEqual(validarLinhasModelo(null as unknown as LinhaConector[], null).erros, [msg]);
});

// ─── Entrada malformada: o despacho só confere campos a mais, não os tipos ───────────────────

test("linha que não é objeto e campo composto são erro (só null/undefined é linha em branco)", () => {
  const ruim = (v: unknown) => v as never; // vale para qualquer tipo esperado
  const r = validarLinhasModelo(
    [
      etapa("1", "Etapa"),
      ruim("1.1 Serviço"),
      ruim(null),
      ruim(["1.2", "B"]),
      linha("1.3", ruim({ nome: "C" }), 1, 1),
      linha(ruim(["1.4"]), "D", 1, 1),
      linha("1.5", "E", ruim({ v: 1 }), ruim([2])),
      ruim(0),
      linha("1.9", "Serviço válido", 1, 1),
    ],
    null
  );
  assert.deepEqual(r.erros, [
    "Linha 3: a linha deve ser um objeto com os campos do modelo.",
    "Linha 5: a linha deve ser um objeto com os campos do modelo.",
    "Linha 6: Descrição deve ser texto ou número.",
    "Linha 7: Item deve ser texto ou número.",
    "Linha 8: Quantidade deve ser texto ou número.",
    "Linha 8: Preço unitário deve ser texto ou número.",
    "Linha 9: a linha deve ser um objeto com os campos do modelo.",
  ]);
});

test("informações: valor composto é ignorado com aviso; informações que não é objeto também", () => {
  const composto = validarLinhasModelo(ORC_OK, {
    orgao: { nome: "X" } as unknown as string,
    objeto: "Obj",
    total_prefeitura: [19434.76] as unknown as number,
  });
  assert.deepEqual(composto.erros, []);
  assert.equal(composto.info.orgao, null);
  assert.equal(composto.info.objeto, "Obj");
  assert.equal(composto.info.total_prefeitura, null);
  assert.deepEqual(composto.avisos, [
    "Informações: Órgão deve ser texto ou número; foi ignorado.",
    "Informações: Total da prefeitura (R$) deve ser texto ou número; foi ignorado.",
  ]);
  for (const ruim of ["Prefeitura", 7, ["orgao"], true]) {
    const r = validarLinhasModelo(ORC_OK, ruim as unknown as InformacoesConector);
    assert.deepEqual(r.avisos, [
      "Informações: deve ser um objeto com os campos do modelo; foram ignoradas.",
    ]);
    assert.equal(r.info.orgao, null);
  }
});
