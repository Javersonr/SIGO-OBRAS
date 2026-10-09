// node --test supabase/functions/_shared/orcamento/registros.test.ts
// Casos copiados de apps/web/src/lib/orcamento-registros.test.js (as funções que o servidor usa).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compararNumeroItem,
  emLotes,
  montarInfoOrcamento,
  montarRegistrosImportacao,
  ordenarItensOportunidade,
  type ItemModelo,
} from "./registros.ts";
import { LINHAS_SINTETICAS, orcamentoSintetico } from "./testes/sintetico.ts";

const E = "00000000-0000-4000-8000-000000000001";
const OP = "00000000-0000-4000-8000-000000000011";
const ETAPA: ItemModelo = {
  linha: 2,
  numero: "1",
  etapa: true,
  codigo: null,
  fonte: null,
  descricao: "SERVIÇOS PRELIMINARES",
  unidade: "vb",
  quantidade: null,
  valor_unitario_ref: null,
  total_informado: null,
};
const ITEM: ItemModelo = {
  linha: 3,
  numero: "1.1",
  etapa: false,
  codigo: "93358",
  fonte: "SINAPI",
  descricao: "Escavação manual de vala",
  unidade: "m³",
  quantidade: 125.5,
  valor_unitario_ref: 10.48,
  total_informado: 1315.24,
};
const CTX = { empresaId: E, oportunidadeId: OP, descontoPct: 12.35 };

test("montarRegistrosImportacao: etapa e item (10,48 com 12,35% → 9,18; × 125,5 → 1.152,09)", () => {
  const [etapa, item] = montarRegistrosImportacao([ETAPA, ITEM], CTX);
  assert.deepEqual(etapa, {
    empresa_id: E,
    oportunidade_id: OP,
    numero: "1",
    item: "1",
    etapa: true,
    tipo: null,
    codigo: null,
    fonte: null,
    descricao: "SERVIÇOS PRELIMINARES",
    unidade: null,
    quantidade: null,
    valor_unitario_ref: null,
    valor_unitario: null,
    bdi: 0,
    imposto: 0,
    valor_total: null,
    ordem: 0,
  });
  assert.deepEqual(item, {
    empresa_id: E,
    oportunidade_id: OP,
    numero: "1.1",
    item: "1.1",
    etapa: false,
    tipo: null,
    codigo: "93358",
    fonte: "SINAPI",
    descricao: "Escavação manual de vala",
    unidade: "m³",
    quantidade: 125.5,
    valor_unitario_ref: 10.48,
    valor_unitario: 9.18,
    bdi: 0,
    imposto: 0,
    valor_total: 1152.09,
    ordem: 1,
  });
});

test("montarRegistrosImportacao: todos com as mesmas 17 chaves, sem linha nem total_informado", () => {
  const regs = montarRegistrosImportacao([ETAPA, ITEM, { ...ITEM, numero: "1.2" }], CTX);
  const chaves = Object.keys(regs[0]).sort();
  assert.equal(chaves.length, 17);
  for (const r of regs) {
    assert.deepEqual(Object.keys(r).sort(), chaves);
    assert.ok(!("linha" in r) && !("total_informado" in r) && !("projeto_id" in r));
  }
});

test("montarRegistrosImportacao: desconto 0, nulo ou ausente grava a referência cortada", () => {
  assert.equal(
    montarRegistrosImportacao([ITEM], { ...CTX, descontoPct: 0 })[0].valor_total,
    1315.24
  );
  const [b] = montarRegistrosImportacao([ITEM], {
    empresaId: E,
    oportunidadeId: OP,
    descontoPct: undefined,
  });
  assert.equal(b.valor_unitario, 10.48);
  const [c] = montarRegistrosImportacao([{ ...ITEM, valor_unitario_ref: 7.1299 }], {
    ...CTX,
    descontoPct: null,
  });
  assert.equal(c.valor_unitario, 7.12);
  assert.equal(c.valor_unitario_ref, 7.1299);
});

test("montarRegistrosImportacao: desconto inválido lança; ordem é a posição; lista vazia → []", () => {
  for (const ruim of ["12,35", "abc", NaN, 100, -1]) {
    assert.throws(
      () => montarRegistrosImportacao([ITEM], { ...CTX, descontoPct: ruim as number }),
      RangeError,
      String(ruim)
    );
  }
  const semCodigo = { ...ITEM, codigo: undefined, fonte: undefined } as unknown as ItemModelo;
  const regs = montarRegistrosImportacao([ETAPA, ITEM, semCodigo], CTX);
  assert.deepEqual(
    regs.map((r) => r.ordem),
    [0, 1, 2]
  );
  assert.equal(regs[2].codigo, null);
  assert.equal(regs[2].fonte, null);
  assert.deepEqual(montarRegistrosImportacao([], CTX), []);
  assert.deepEqual(montarRegistrosImportacao(null as unknown as ItemModelo[], CTX), []);
});

test("montarInfoOrcamento: as 8 chaves + arquivo e data; chave desconhecida sai", () => {
  const info = {
    orgao: "Prefeitura Municipal de Cidade Exemplo",
    objeto: "Iluminação pública",
    edital: "PE 12/2026",
    data_base: "08/2026",
    bdi: "25,00",
    fonte: "SINAPI 08/2026",
    total_prefeitura: 1315.24,
    observacoes: null,
    extra: "ignorar",
  };
  assert.deepEqual(
    montarInfoOrcamento(info, {
      arquivoNome: "via Claude",
      importadoEm: "2026-10-08T12:00:00.000Z",
    }),
    {
      orgao: "Prefeitura Municipal de Cidade Exemplo",
      objeto: "Iluminação pública",
      edital: "PE 12/2026",
      data_base: "08/2026",
      bdi: "25,00",
      fonte: "SINAPI 08/2026",
      total_prefeitura: 1315.24,
      observacoes: null,
      arquivo_nome: "via Claude",
      importado_em: "2026-10-08T12:00:00.000Z",
    }
  );
  const vazio = montarInfoOrcamento(null, { arquivoNome: "a.xlsx", importadoEm: "x" });
  assert.equal(vazio.orgao, null);
  assert.equal(vazio.total_prefeitura, null);
  assert.equal(Object.keys(vazio).length, 10);
});

test("emLotes: fatia na ordem, padrão 200, vazio → [] e tamanho inválido lança", () => {
  assert.deepEqual(emLotes([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  const lista = Array.from({ length: 450 }, (_, i) => i);
  assert.deepEqual(
    emLotes(lista).map((l) => l.length),
    [200, 200, 50]
  );
  assert.deepEqual(emLotes(lista).flat(), lista);
  assert.deepEqual(emLotes([], 10), []);
  assert.deepEqual(emLotes(null as unknown as number[], 10), []);
  assert.throws(() => emLotes([1], 0), { message: "Tamanho de lote inválido: 0" });
  assert.throws(() => emLotes([1], 2.5), { message: "Tamanho de lote inválido: 2.5" });
});

test("compararNumeroItem: ordem natural por segmento; iguais 0; nulo antes", () => {
  const lista = ["1.10", "2", "1.2", "10", "1", "1.1.2", "1.1"];
  assert.deepEqual([...lista].sort(compararNumeroItem), [
    "1",
    "1.1",
    "1.1.2",
    "1.2",
    "1.10",
    "2",
    "10",
  ]);
  assert.equal(compararNumeroItem("1.2", "1.2"), 0);
  assert.equal(compararNumeroItem(null, "1"), -1);
  assert.equal(compararNumeroItem("1", null), 1);
});

test("ordenarItensOportunidade: ordem (nula como 0), desempate por numero, rótulo item", () => {
  const itens = [
    { id: "a", numero: "1.1", ordem: 1, item: "9" },
    { id: "b", numero: null, ordem: 3, item: "9" },
    { id: "c", numero: "1", ordem: 0, item: "9" },
    { id: "d", numero: "1.2", ordem: 1, item: "9" },
  ];
  const r = ordenarItensOportunidade(itens);
  assert.deepEqual(
    r.map((i) => i.id),
    ["c", "a", "d", "b"]
  );
  assert.deepEqual(
    r.map((i) => i.item),
    ["1", "1.1", "1.2", "4"]
  );
  assert.equal(itens[0].item, "9"); // não muda a entrada
  assert.deepEqual(ordenarItensOportunidade(null as unknown as []), []);
});

test("orcamentoSintetico: 3000 linhas, 40 etapas (nível 1 e 2), determinístico", () => {
  const itens = orcamentoSintetico();
  assert.equal(itens.length, LINHAS_SINTETICAS);
  assert.equal(itens.filter((i) => i.etapa).length, 40);
  assert.deepEqual(orcamentoSintetico(), itens);
  assert.notDeepEqual(orcamentoSintetico(7), itens);
  const regs = montarRegistrosImportacao(itens, CTX);
  assert.equal(regs.length, 3000);
  assert.ok(regs.every((r) => r.etapa || (r.valor_unitario !== null && r.valor_total !== null)));
});
