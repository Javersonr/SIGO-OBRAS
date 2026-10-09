import { describe, expect, it, vi } from "vitest";
import {
  arquivoCabeNoSlot,
  CATEGORIAS_COM_TEXTO,
  gravarTextoPaginas,
  LIMITE_ANEXO_ATESTADO,
  LIMITE_ANEXO_OPORTUNIDADE,
  lerParametroLink,
  lotesDeTexto,
  MAX_CARACTERES_PAGINA,
  montarLinhasTexto,
  precisaTrocarEmpresa,
} from "./envio-arquivos";

const E = "00000000-0000-4000-8000-000000000001";
const OUTRA = "00000000-0000-4000-8000-000000000002";
const ARQ = "00000000-0000-4000-8000-000000000040";

describe("constantes", () => {
  it("limites, teto da página e categorias com texto", () => {
    expect(LIMITE_ANEXO_OPORTUNIDADE).toBe(52428800);
    expect(LIMITE_ANEXO_ATESTADO).toBe(26214400);
    expect(MAX_CARACTERES_PAGINA).toBe(100000);
    expect(CATEGORIAS_COM_TEXTO).toEqual(["edital", "termo_referencia", "anexo_edital", "errata"]);
  });
});

describe("lerParametroLink", () => {
  it("devolve o UUID em minúsculas", () => {
    expect(lerParametroLink(`?link=${ARQ.toUpperCase()}`)).toBe(ARQ);
    expect(lerParametroLink(`link=${ARQ}&x=1`)).toBe(ARQ);
  });
  it("sem link ou com valor que não é UUID → null", () => {
    expect(lerParametroLink("")).toBeNull();
    expect(lerParametroLink("?link=../../x")).toBeNull();
    expect(lerParametroLink(undefined)).toBeNull();
  });
});

describe("precisaTrocarEmpresa", () => {
  it("só quando a sessão está em outra empresa", () => {
    expect(precisaTrocarEmpresa(E, E.toUpperCase())).toBe(false);
    expect(precisaTrocarEmpresa(OUTRA, E)).toBe(true);
    expect(precisaTrocarEmpresa(null, E)).toBe(true);
    expect(precisaTrocarEmpresa(E, null)).toBe(false);
  });
});

describe("arquivoCabeNoSlot", () => {
  const pdf = { tipo: "pdf" };
  const xlsx = { tipo: "xlsx" };
  it("aceita a extensão do tipo e o tamanho até o limite", () => {
    expect(arquivoCabeNoSlot({ name: "Edital.PDF", size: 10 }, pdf, 100)).toEqual({ ok: true });
    expect(arquivoCabeNoSlot({ name: "Proposta.xlsx", size: 100 }, xlsx, 100)).toEqual({
      ok: true,
    });
  });
  it("recusa extensão errada, vazio, grande demais e sem arquivo", () => {
    expect(arquivoCabeNoSlot({ name: "Proposta.xlsx", size: 10 }, pdf, 100)).toEqual({
      ok: false,
      erro: "Este espaço espera um arquivo .pdf",
    });
    expect(arquivoCabeNoSlot({ name: "a.pdf", size: 0 }, pdf, 100)).toEqual({
      ok: false,
      erro: "O arquivo está vazio",
    });
    expect(
      arquivoCabeNoSlot(
        { name: "a.pdf", size: LIMITE_ANEXO_ATESTADO + 1 },
        pdf,
        LIMITE_ANEXO_ATESTADO
      )
    ).toEqual({ ok: false, erro: "O arquivo passa de 25 MB" });
    expect(arquivoCabeNoSlot(null, pdf, 100)).toEqual({ ok: false, erro: "Escolha um arquivo" });
  });
});

describe("montarLinhasTexto", () => {
  it("uma linha por página, texto cortado em 100000 e escaneada booleana", () => {
    const linhas = montarLinhasTexto(
      [
        { n: 1, texto: "a".repeat(100005), escaneada: false },
        { n: 2, texto: "", escaneada: true },
        { n: 0, texto: "inválida" },
        { n: 3 },
      ],
      { empresaId: E, arquivoId: ARQ }
    );
    expect(linhas.map((l) => [l.pagina, l.texto.length, l.escaneada])).toEqual([
      [1, 100000, false],
      [2, 0, true],
      [3, 0, false],
    ]);
    expect(linhas[0]).toMatchObject({ empresa_id: E, arquivo_id: ARQ });
  });
});

describe("lotesDeTexto", () => {
  it("fecha o lote em 200 linhas ou no teto de caracteres", () => {
    const curtas = Array.from({ length: 450 }, (_, i) => ({ pagina: i + 1, texto: "x" }));
    expect(lotesDeTexto(curtas).map((l) => l.length)).toEqual([200, 200, 50]);
    const grandes = Array.from({ length: 50 }, (_, i) => ({
      pagina: i + 1,
      texto: "y".repeat(100000),
    }));
    expect(lotesDeTexto(grandes).map((l) => l.length)).toEqual([20, 20, 10]);
    expect(lotesDeTexto([])).toEqual([]);
  });
});

describe("gravarTextoPaginas", () => {
  function entidadeFalsa({ falhaNoLote = 0, falhaNaLimpeza = false } = {}) {
    const ordem = [];
    let lotes = 0;
    let apagadas = 0;
    return {
      ordem,
      async deleteMany(criterio) {
        ordem.push(["deleteMany", criterio]);
        apagadas += 1;
        if (falhaNaLimpeza && apagadas > 1) throw new Error("limpeza fora do ar");
        return { success: true };
      },
      async bulkCreate(linhas) {
        lotes += 1;
        if (lotes === falhaNoLote) throw new Error("lote recusado");
        ordem.push(["bulkCreate", linhas.length]);
        return linhas;
      },
    };
  }

  const paginas450 = Array.from({ length: 450 }, (_, i) => ({
    n: i + 1,
    texto: `p${i + 1}`,
    escaneada: false,
  }));

  it("apaga as páginas antigas ANTES e grava em lotes de 200", async () => {
    const ent = entidadeFalsa();
    const n = await gravarTextoPaginas(ent, {
      empresaId: E,
      arquivoId: ARQ,
      paginas: paginas450,
    });
    expect(n).toBe(450);
    expect(ent.ordem).toEqual([
      ["deleteMany", { empresa_id: E, arquivo_id: ARQ }],
      ["bulkCreate", 200],
      ["bulkCreate", 200],
      ["bulkCreate", 50],
    ]);
  });

  it("o 2º bulkCreate lança: o deleteMany roda de novo e o erro original sobe", async () => {
    const ent = entidadeFalsa({ falhaNoLote: 2 });
    await expect(
      gravarTextoPaginas(ent, { empresaId: E, arquivoId: ARQ, paginas: paginas450 })
    ).rejects.toThrow("lote recusado");
    expect(ent.ordem).toEqual([
      ["deleteMany", { empresa_id: E, arquivo_id: ARQ }],
      ["bulkCreate", 200],
      ["deleteMany", { empresa_id: E, arquivo_id: ARQ }],
    ]);
  });

  it("se a limpeza também falhar, o erro original sobe e a falha dela vai ao console", async () => {
    const ent = entidadeFalsa({ falhaNoLote: 2, falhaNaLimpeza: true });
    const console_ = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(
        gravarTextoPaginas(ent, { empresaId: E, arquivoId: ARQ, paginas: paginas450 })
      ).rejects.toThrow("lote recusado");
      expect(console_).toHaveBeenCalledTimes(1);
      expect(String(console_.mock.calls[0][1])).toContain("limpeza fora do ar");
    } finally {
      console_.mockRestore();
    }
  });

  it("PDF sem páginas só limpa o texto antigo; sem empresa ou arquivo lança", async () => {
    const ent = entidadeFalsa();
    expect(await gravarTextoPaginas(ent, { empresaId: E, arquivoId: ARQ, paginas: [] })).toBe(0);
    expect(ent.ordem).toEqual([["deleteMany", { empresa_id: E, arquivo_id: ARQ }]]);
    await expect(
      gravarTextoPaginas(ent, { empresaId: "", arquivoId: ARQ, paginas: [] })
    ).rejects.toThrow("Empresa e arquivo são obrigatórios");
  });
});
