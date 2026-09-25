import { describe, expect, it } from "vitest";
import {
  calcularResumo,
  diasAte,
  ehSintese,
  fmtData,
  normalizarUnidade,
  numeroOuNull,
  semExecucao,
  statusValidade,
} from "./acervo-utils";

const docs = [
  { id: "a", tipo: "cat", numero: "1/2024", valor: "100.50" },
  { id: "b", tipo: "atestado", numero: null, valor: 900 },
  { id: "c", tipo: "cao", numero: "3/2024", valor: 5000 }, // fora (repete ARTs)
  { id: "d", tipo: "cat_profissional", numero: "4/2024", valor: 7000 }, // fora (outra empresa)
  { id: "e", tipo: "cat", numero: "5/2024", valor: null },
];
const q = (atestado_id, categoria, quantidade, unidade, observacao = "síntese") => ({
  atestado_id,
  categoria,
  quantidade,
  unidade,
  observacao,
});
const quants = [
  q("a", "potencia_kva", 585, "kVA"),
  q("a", "transformador", 13, "un", "detalhe"), // detalhe não soma
  q("a", "poste", "149.000", "un"),
  q("a", "luminaria_ip", 100, "un"),
  q("b", "refletor", 124, "unidade"),
  q("b", "luminaria_ip", 10, "un"),
  q("b", "potencia_kva", 45, "KVA"),
  q("c", "potencia_kva", 9999, "kVA"),
  q("d", "poste", 9999, "un"),
  q("e", "poste", 60, "un"),
  q("e", "chave_fusivel", 2, "jogo"),
  q("e", "chave_fusivel", 5, "un"),
];

describe("calcularResumo", () => {
  const r = calcularResumo(docs, quants);
  const card = (id) => r.cards.find((c) => c.id === id);

  it("soma só sínteses de CAT + atestado", () => {
    expect(r.documentos).toBe(3);
    expect(card("kva").total).toBe(630);
    expect(card("postes").total).toBe(209);
    expect(card("luminarias").total).toBe(234); // 100 + 10 + 124 refletores
  });

  it("valor somado e maior contrato ignoram CAO/CAT profissional e nulos", () => {
    expect(r.valorTotal).toBe(1000.5);
    expect(r.semValor).toBe(1);
    expect(r.tetoValor.atestado.id).toBe("b");
    expect(r.tetoValorCat.atestado.id).toBe("a"); // teto geral é atestado sem CAT
  });

  it("teto por obra única soma as categorias do card no mesmo documento", () => {
    expect(card("luminarias").teto).toMatchObject({ quantidade: 134, atestado: { id: "b" } });
    expect(card("luminarias").tetoCat).toMatchObject({ quantidade: 100, atestado: { id: "a" } });
    expect(card("kva").teto.atestado.id).toBe("a");
    expect(card("kva").tetoCat).toBeNull();
  });

  it("demais categorias separadas por unidade", () => {
    const chaves = r.demais.filter((d) => d.categoria === "chave_fusivel");
    expect(chaves.map((d) => [d.unidade, d.total])).toEqual([
      ["jogo", 2],
      ["un", 5],
    ]);
  });
});

describe("helpers", () => {
  it("síntese sem depender de acento", () => {
    expect(ehSintese({ observacao: "síntese" })).toBe(true);
    expect(ehSintese({ observacao: "SINTESE" })).toBe(true);
    expect(ehSintese({ observacao: "detalhe" })).toBe(false);
  });
  it("unidades equivalentes", () => {
    expect(normalizarUnidade("kVA")).toBe(normalizarUnidade("kva"));
    expect(normalizarUnidade("Unidade")).toBe("un");
  });
  it("datas por split, sem fuso", () => {
    expect(fmtData("2026-03-01")).toBe("01/03/2026");
    expect(diasAte("2026-10-01", "2026-09-24")).toBe(7);
    expect(statusValidade("2026-09-23", "2026-09-24").status).toBe("vencida");
    expect(statusValidade("2026-10-24", "2026-09-24").status).toBe("vence_logo");
    expect(statusValidade("2026-10-25", "2026-09-24").status).toBe("ok");
  });
  it("números pt-BR", () => {
    expect(numeroOuNull("1.234,56")).toBe(1234.56);
    expect(numeroOuNull("400000.00")).toBe(400000);
    expect(numeroOuNull("")).toBeNull();
    expect(numeroOuNull("abc")).toBeNull();
  });
  it("sem execução", () => {
    expect(semExecucao({ com_execucao: false })).toBe(true);
    expect(semExecucao({ com_execucao: null, atividades: ["projeto"] })).toBe(true);
    expect(semExecucao({ com_execucao: null, atividades: [] })).toBe(false);
    expect(semExecucao({ com_execucao: true, atividades: ["projeto"] })).toBe(false);
  });
});
