import { describe, it, expect, vi, afterEach } from "vitest";
import {
  montarRegistrosImportacao,
  montarInfoOrcamento,
  emLotes,
  proximaOrdem,
  compararNumeroItem,
  rotuloItem,
  ordenarItensProjeto,
  ordenarItensOportunidade,
  semEtapas,
  cancelarGravacoesPendentes,
  temGravacaoPendente,
} from "./orcamento-registros";

const ETAPA = {
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
const ITEM = {
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
const CTX = { empresaId: "emp-1", oportunidadeId: "op-1", descontoPct: 12.35 };

describe("montarRegistrosImportacao", () => {
  it("etapa e item com o exemplo do §8 da spec (10,48 com 12,35% → 9,18; × 125,5 → 1.152,09)", () => {
    const [etapa, item] = montarRegistrosImportacao([ETAPA, ITEM], CTX);
    expect(etapa).toEqual({
      empresa_id: "emp-1",
      oportunidade_id: "op-1",
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
    expect(item).toEqual({
      empresa_id: "emp-1",
      oportunidade_id: "op-1",
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

  it("todos os registros têm exatamente as mesmas chaves (o insert em lote grava NULL na ausente)", () => {
    const regs = montarRegistrosImportacao([ETAPA, ITEM, { ...ITEM, numero: "1.2" }], CTX);
    const chaves = Object.keys(regs[0]).sort();
    expect(chaves).toHaveLength(17);
    for (const r of regs) expect(Object.keys(r).sort()).toEqual(chaves);
    for (const r of regs) {
      expect(r).not.toHaveProperty("linha");
      expect(r).not.toHaveProperty("total_informado");
      expect(r).not.toHaveProperty("projeto_id");
    }
  });

  it("desconto 0, nulo ou ausente grava o preço de referência cortado em 2 casas", () => {
    const [a] = montarRegistrosImportacao([ITEM], { ...CTX, descontoPct: 0 });
    expect(a.valor_unitario).toBe(10.48);
    expect(a.valor_total).toBe(1315.24);
    const [b] = montarRegistrosImportacao([ITEM], { empresaId: "e", oportunidadeId: "o" });
    expect(b.valor_unitario).toBe(10.48);
    const [c] = montarRegistrosImportacao([{ ...ITEM, valor_unitario_ref: 7.1299 }], {
      ...CTX,
      descontoPct: null,
    });
    expect(c.valor_unitario).toBe(7.12);
    expect(c.valor_unitario_ref).toBe(7.1299);
  });

  it("desconto inválido lança em vez de gravar o preço cheio (só nulo ou ausente vale 0)", () => {
    const monta = (descontoPct) => () => montarRegistrosImportacao([ITEM], { ...CTX, descontoPct });
    for (const ruim of ["12,35", "abc", NaN, 100, -1]) expect(monta(ruim)).toThrow(RangeError);
  });

  it("código e fonte ausentes viram null; ordem segue a posição na planilha", () => {
    const semCodigo = { ...ITEM, codigo: undefined, fonte: undefined };
    const regs = montarRegistrosImportacao([ETAPA, ITEM, semCodigo], CTX);
    expect(regs.map((r) => r.ordem)).toEqual([0, 1, 2]);
    expect(regs[2].codigo).toBeNull();
    expect(regs[2].fonte).toBeNull();
  });

  it("lista vazia ou nula devolve []", () => {
    expect(montarRegistrosImportacao([], CTX)).toEqual([]);
    expect(montarRegistrosImportacao(null, CTX)).toEqual([]);
  });
});

describe("montarInfoOrcamento", () => {
  it("grava as 8 chaves da aba Informações + arquivo e data, e descarta chave desconhecida", () => {
    const info = {
      orgao: "Prefeitura Municipal de Itatinga",
      objeto: "Iluminação pública",
      edital: "PE 12/2026",
      data_base: "08/2026",
      bdi: "25,00",
      fonte: "SINAPI 08/2026",
      total_prefeitura: 1315.24,
      observacoes: null,
      extra: "ignorar",
    };
    expect(
      montarInfoOrcamento(info, {
        arquivoNome: "Orcamento SIGO - Itatinga.xlsx",
        importadoEm: "2026-09-29T18:00:00.000Z",
      })
    ).toEqual({
      orgao: "Prefeitura Municipal de Itatinga",
      objeto: "Iluminação pública",
      edital: "PE 12/2026",
      data_base: "08/2026",
      bdi: "25,00",
      fonte: "SINAPI 08/2026",
      total_prefeitura: 1315.24,
      observacoes: null,
      arquivo_nome: "Orcamento SIGO - Itatinga.xlsx",
      importado_em: "2026-09-29T18:00:00.000Z",
    });
  });

  it("info ausente vira chaves nulas", () => {
    const r = montarInfoOrcamento(undefined, { arquivoNome: "a.xlsx", importadoEm: "x" });
    expect(r.orgao).toBeNull();
    expect(r.total_prefeitura).toBeNull();
    expect(Object.keys(r)).toHaveLength(10);
  });
});

describe("emLotes", () => {
  it("fatia na ordem, com o último lote menor", () => {
    expect(emLotes([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
  it("padrão de 200", () => {
    const lista = Array.from({ length: 450 }, (_, i) => i);
    expect(emLotes(lista).map((l) => l.length)).toEqual([200, 200, 50]);
    expect(emLotes(lista).flat()).toEqual(lista);
  });
  it("lista vazia ou nula → []", () => {
    expect(emLotes([], 10)).toEqual([]);
    expect(emLotes(null, 10)).toEqual([]);
  });
  it("tamanho inválido lança", () => {
    expect(() => emLotes([1], 0)).toThrow("Tamanho de lote inválido");
    expect(() => emLotes([1], 2.5)).toThrow("Tamanho de lote inválido");
  });
});

describe("proximaOrdem", () => {
  it("0 com a lista vazia ou nula", () => {
    expect(proximaOrdem([])).toBe(0);
    expect(proximaOrdem(undefined)).toBe(0);
  });
  it("max(ordem) + 1, com ordem nula contando como 0", () => {
    expect(proximaOrdem([{ ordem: 3 }, { ordem: 7 }, { ordem: null }])).toBe(8);
    expect(proximaOrdem([{ ordem: null }])).toBe(1);
    expect(proximaOrdem([{ ordem: 0 }])).toBe(1);
  });
});

describe("compararNumeroItem", () => {
  it("ordem natural por segmento", () => {
    const lista = ["1.10", "2", "1.2", "10", "1", "1.1.2", "1.1"];
    expect([...lista].sort(compararNumeroItem)).toEqual([
      "1",
      "1.1",
      "1.1.2",
      "1.2",
      "1.10",
      "2",
      "10",
    ]);
  });
  it("iguais dão 0; nulo vem antes", () => {
    expect(compararNumeroItem("1.2", "1.2")).toBe(0);
    expect(compararNumeroItem(null, "1")).toBeLessThan(0);
    expect(compararNumeroItem("1", null)).toBeGreaterThan(0);
  });
});

describe("rotuloItem", () => {
  it("numero quando existe, senão a posição", () => {
    expect(rotuloItem({ numero: "1.2" }, 5)).toBe("1.2");
    expect(rotuloItem({ numero: null }, 4)).toBe("5");
    expect(rotuloItem({}, 0)).toBe("1");
  });
});

describe("ordenarItensProjeto", () => {
  it("com numero: por ordem (nula por último), desempate por numero, sem mutar a entrada", () => {
    const itens = [
      { id: "a", numero: "1.10", ordem: 2 },
      { id: "b", numero: null, ordem: null },
      { id: "c", numero: "1", ordem: 0 },
      { id: "d", numero: "1.2", ordem: 2 },
      { id: "e", numero: "1.1", ordem: 1 },
    ];
    const copia = itens.map((i) => i.id);
    expect(ordenarItensProjeto(itens).map((i) => i.id)).toEqual(["c", "e", "d", "a", "b"]);
    expect(itens.map((i) => i.id)).toEqual(copia);
  });
  it("sem numero: ordem alfabética por descrição, como hoje", () => {
    const itens = [
      { id: "1", descricao: "cabo", ordem: 0 },
      { id: "2", descricao: "Abraçadeira", ordem: 1 },
      { id: "3", descricao: null, ordem: 2 },
      { id: "4", descricao: "Braço", ordem: 3 },
    ];
    expect(ordenarItensProjeto(itens).map((i) => i.id)).toEqual(["3", "2", "4", "1"]);
  });
});

describe("ordenarItensOportunidade", () => {
  it("por ordem (nula como 0), desempate por numero, rótulo item = numero ou posição", () => {
    const itens = [
      { id: "a", numero: "1.1", ordem: 1, item: "9" },
      { id: "b", numero: null, ordem: 3, item: "9" },
      { id: "c", numero: "1", ordem: 0, item: "9" },
      { id: "d", numero: "1.2", ordem: 1, item: "9" },
    ];
    const r = ordenarItensOportunidade(itens);
    expect(r.map((i) => i.id)).toEqual(["c", "a", "d", "b"]);
    expect(r.map((i) => i.item)).toEqual(["1", "1.1", "1.2", "4"]);
    expect(itens[0].item).toBe("9");
  });
  it("lista nula → []", () => {
    expect(ordenarItensOportunidade(null)).toEqual([]);
  });
});

describe("semEtapas", () => {
  it("tira só as linhas de etapa", () => {
    const itens = [{ id: 1, etapa: true }, { id: 2, etapa: false }, { id: 3 }];
    expect(semEtapas(itens).map((i) => i.id)).toEqual([2, 3]);
    expect(semEtapas(undefined)).toEqual([]);
  });
});

describe("cancelarGravacoesPendentes", () => {
  afterEach(() => vi.useRealTimers());

  it("cancela os timers pendentes e zera o mapa", () => {
    vi.useFakeTimers();
    const gravar = vi.fn();
    const ref = { current: {} };
    ref.current["i1-quantidade"] = setTimeout(gravar, 1500);
    ref.current["i2-valor_unitario"] = setTimeout(gravar, 1500);
    expect(cancelarGravacoesPendentes(ref)).toBe(2);
    vi.advanceTimersByTime(2000);
    expect(gravar).not.toHaveBeenCalled();
    expect(ref.current).toEqual({});
  });

  it("ref ausente ou vazio não lança", () => {
    expect(cancelarGravacoesPendentes(undefined)).toBe(0);
    expect(cancelarGravacoesPendentes({ current: null })).toBe(0);
    expect(cancelarGravacoesPendentes({ current: {} })).toBe(0);
  });
});

describe("temGravacaoPendente", () => {
  afterEach(() => vi.useRealTimers());

  it("true quando há timer no mapa, e não cancela nem apaga nada", () => {
    vi.useFakeTimers();
    const gravar = vi.fn();
    const ref = { current: {} };
    ref.current["i1-quantidade"] = setTimeout(gravar, 1500);
    expect(temGravacaoPendente(ref)).toBe(true);
    expect(Object.keys(ref.current)).toEqual(["i1-quantidade"]);
    vi.advanceTimersByTime(2000);
    expect(gravar).toHaveBeenCalledTimes(1);
  });

  it("false com o mapa vazio, depois de cancelar ou quando a última chave sai", () => {
    vi.useFakeTimers();
    const ref = { current: {} };
    expect(temGravacaoPendente(ref)).toBe(false);
    ref.current["i1-quantidade"] = setTimeout(() => {}, 1500);
    ref.current["i2-valor_unitario"] = setTimeout(() => {}, 1500);
    delete ref.current["i1-quantidade"];
    expect(temGravacaoPendente(ref)).toBe(true);
    cancelarGravacoesPendentes(ref);
    expect(temGravacaoPendente(ref)).toBe(false);
  });

  it("ref ausente, nulo ou fora do formato não lança", () => {
    expect(temGravacaoPendente(undefined)).toBe(false);
    expect(temGravacaoPendente(null)).toBe(false);
    expect(temGravacaoPendente({})).toBe(false);
    expect(temGravacaoPendente({ current: null })).toBe(false);
    expect(temGravacaoPendente({ current: "x" })).toBe(false);
  });
});
