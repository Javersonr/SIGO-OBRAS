import { describe, it, expect } from "vitest";
import { filtrarTransacoes, dentroDoPeriodo } from "./filtros-transacao";

// hoje fixo (15/jun/2026, meio-dia local) p/ período determinístico.
const HOJE = new Date(2026, 5, 15, 12, 0, 0);

describe("dentroDoPeriodo", () => {
  it("'todos' e período vazio não filtram", () => {
    expect(dentroDoPeriodo("2020-01-01", "todos", HOJE)).toBe(true);
    expect(dentroDoPeriodo("2020-01-01", "", HOJE)).toBe(true);
    expect(dentroDoPeriodo("2020-01-01", null, HOJE)).toBe(true);
  });

  it("sem data → fora de período específico", () => {
    expect(dentroDoPeriodo(null, "mes", HOJE)).toBe(false);
    expect(dentroDoPeriodo("", "ano", HOJE)).toBe(false);
  });

  it("mês: só o mês/ano correntes", () => {
    expect(dentroDoPeriodo("2026-06-10", "mes", HOJE)).toBe(true);
    expect(dentroDoPeriodo("2026-05-10", "mes", HOJE)).toBe(false);
    expect(dentroDoPeriodo("2025-06-10", "mes", HOJE)).toBe(false);
  });

  it("trimestre: jun cai no 2º tri (abr–jun)", () => {
    expect(dentroDoPeriodo("2026-06-10", "trimestre", HOJE)).toBe(true);
    expect(dentroDoPeriodo("2026-04-10", "trimestre", HOJE)).toBe(true);
    expect(dentroDoPeriodo("2026-03-10", "trimestre", HOJE)).toBe(false); // 1º tri
    expect(dentroDoPeriodo("2026-07-10", "trimestre", HOJE)).toBe(false); // 3º tri
    expect(dentroDoPeriodo("2025-06-10", "trimestre", HOJE)).toBe(false); // ano diff
  });

  it("ano: só o ano corrente", () => {
    expect(dentroDoPeriodo("2026-01-10", "ano", HOJE)).toBe(true);
    expect(dentroDoPeriodo("2025-12-10", "ano", HOJE)).toBe(false);
  });

  it("hoje: mesma data (independe da hora)", () => {
    expect(dentroDoPeriodo(new Date(2026, 5, 15, 8, 0, 0), "hoje", HOJE)).toBe(true);
    expect(dentroDoPeriodo(new Date(2026, 5, 16, 8, 0, 0), "hoje", HOJE)).toBe(false);
  });

  it("semana: a própria data está na sua semana; +15 dias não", () => {
    expect(dentroDoPeriodo(new Date(2026, 5, 15, 12), "semana", new Date(2026, 5, 15, 12))).toBe(
      true
    );
    expect(dentroDoPeriodo(new Date(2026, 5, 30, 12), "semana", new Date(2026, 5, 15, 12))).toBe(
      false
    );
  });

  it("período desconhecido não filtra", () => {
    expect(dentroDoPeriodo("2026-06-10", "qualquercoisa", HOJE)).toBe(true);
  });
});

describe("filtrarTransacoes", () => {
  const dados = [
    {
      tipo: "Despesa",
      descricao: "Cimento",
      fornecedor_nome: "Loja X",
      status: "pago",
      categoria_id: "c1",
      projeto_id: "p1",
      data_vencimento: "2026-06-10",
    },
    {
      tipo: "despesa",
      descricao: "Areia",
      fornecedor_nome: "Areial Y",
      status: "pendente",
      categoria_id: "c2",
      projeto_id: "p1",
      data_vencimento: "2026-05-10",
    },
    {
      tipo: "Receita",
      descricao: "Medição 1",
      cliente_nome: "CEMIG",
      status: "recebido",
      categoria_id: "c3",
      projeto_id: "p2",
      data_vencimento: "2026-06-20",
    },
  ];

  it("filtra por tipo", () => {
    expect(filtrarTransacoes(dados, {}, { tipo: "despesa" })).toHaveLength(2);
    expect(filtrarTransacoes(dados, {}, { tipo: "receita" })).toHaveLength(1);
    expect(filtrarTransacoes(dados, {}, {})).toHaveLength(3); // sem tipo = todos
  });

  it("busca por descrição, fornecedor ou cliente (case-insensitive)", () => {
    expect(filtrarTransacoes(dados, { busca: "cimento" }, {})).toHaveLength(1);
    expect(filtrarTransacoes(dados, { busca: "areial" }, {})).toHaveLength(1); // fornecedor
    expect(filtrarTransacoes(dados, { busca: "cemig" }, {})).toHaveLength(1); // cliente
    expect(filtrarTransacoes(dados, { busca: "zzz" }, {})).toHaveLength(0);
  });

  it("status/categoria/projeto, com 'all' = sem filtro", () => {
    expect(filtrarTransacoes(dados, { status: "pago" }, {})).toHaveLength(1);
    expect(filtrarTransacoes(dados, { categoriaId: "c2" }, {})).toHaveLength(1);
    expect(filtrarTransacoes(dados, { projetoId: "p1" }, {})).toHaveLength(2);
    expect(filtrarTransacoes(dados, { status: "all", projetoId: "all" }, {})).toHaveLength(3);
  });

  it("período combina com tipo", () => {
    // despesas de junho/2026: só "Cimento"
    const r = filtrarTransacoes(dados, { periodo: "mes" }, { tipo: "despesa", hoje: HOJE });
    expect(r).toHaveLength(1);
    expect(r[0].descricao).toBe("Cimento");
  });

  it("lista vazia/nula não quebra", () => {
    expect(filtrarTransacoes(null, { busca: "x" }, {})).toEqual([]);
    expect(filtrarTransacoes([], {}, { tipo: "despesa" })).toEqual([]);
  });
});
