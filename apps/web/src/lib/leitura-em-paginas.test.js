import { describe, it, expect } from "vitest";
import { lerEmPaginas } from "./leitura-em-paginas";

// Uma "consulta" falsa que se comporta como a do supabase-js: `.range(de, ate)` devolve a fatia (ate inclusivo).
function consultaCom(tabela, { falhaNaPagina = null } = {}) {
  const chamadas = [];
  const montar = () => ({
    range: async (de, ate) => {
      chamadas.push([de, ate]);
      if (falhaNaPagina !== null && chamadas.length === falhaNaPagina + 1) {
        return { data: null, error: new Error("falhou") };
      }
      return { data: tabela.slice(de, ate + 1), error: null };
    },
  });
  return { montar, chamadas };
}
const linhas = (n) => Array.from({ length: n }, (_, i) => ({ id: i }));

describe("lerEmPaginas", () => {
  it("tabela pequena: uma página só", async () => {
    const { montar, chamadas } = consultaCom(linhas(3));
    const r = await lerEmPaginas(montar, { tamanho: 10 });
    expect(r.linhas).toHaveLength(3);
    expect(r.truncado).toBe(false);
    expect(chamadas).toEqual([[0, 9]]);
  });

  it("junta as páginas até a última vir incompleta (a do supabase corta em 1000)", async () => {
    const { montar, chamadas } = consultaCom(linhas(25));
    const r = await lerEmPaginas(montar, { tamanho: 10 });
    expect(r.linhas.map((l) => l.id)).toEqual(linhas(25).map((l) => l.id));
    expect(chamadas).toEqual([
      [0, 9],
      [10, 19],
      [20, 29],
    ]);
  });

  it("tamanho exato de uma página: pede a seguinte (vem vazia) e termina", async () => {
    const { montar, chamadas } = consultaCom(linhas(20));
    const r = await lerEmPaginas(montar, { tamanho: 10 });
    expect(r.linhas).toHaveLength(20);
    expect(chamadas).toHaveLength(3);
    expect(r.truncado).toBe(false);
  });

  it("tabela vazia: lista vazia", async () => {
    const { montar } = consultaCom([]);
    expect(await lerEmPaginas(montar)).toEqual({ linhas: [], truncado: false });
  });

  it("passou do máximo de páginas: devolve o que leu e avisa que cortou", async () => {
    const { montar, chamadas } = consultaCom(linhas(100));
    const r = await lerEmPaginas(montar, { tamanho: 10, maxPaginas: 3 });
    expect(r.linhas).toHaveLength(30);
    expect(r.truncado).toBe(true);
    expect(chamadas).toHaveLength(3);
  });

  it("erro numa página: a leitura inteira falha (não devolve metade como se fosse tudo)", async () => {
    const { montar } = consultaCom(linhas(50), { falhaNaPagina: 1 });
    await expect(lerEmPaginas(montar, { tamanho: 10 })).rejects.toThrow("falhou");
  });

  it("resposta sem data nem erro conta como vazia", async () => {
    const r = await lerEmPaginas(() => ({ range: async () => ({ data: null, error: null }) }));
    expect(r.linhas).toEqual([]);
  });
});
