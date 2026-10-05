import { describe, it, expect } from "vitest";
import {
  PASTAS_PADRAO,
  PASTA_EDITAL,
  PASTA_OUTROS,
  ehPastaPadrao,
  pastaDoArquivo,
  lerPastasExtras,
  listarPastas,
  agruparPorPasta,
  nomePastaValido,
  mesmaPasta,
  pastaParaGravar,
} from "./pastas-arquivo";

describe("PASTAS_PADRAO", () => {
  it("tem as 5 pastas na ordem da spec, com Outros por último", () => {
    expect(PASTAS_PADRAO).toEqual([
      "Edital",
      "Credenciamento",
      "Envelope 01 – Proposta",
      "Envelope 02 – Habilitação",
      "Outros",
    ]);
  });
  it("ehPastaPadrao ignora maiúsculas e acento", () => {
    expect(ehPastaPadrao("envelope 02 – habilitacao")).toBe(true);
    expect(ehPastaPadrao("Recurso")).toBe(false);
  });
});

describe("pastaDoArquivo", () => {
  it("usa a pasta gravada (aparada)", () => {
    expect(pastaDoArquivo({ pasta: "  Recurso ", categoria: "edital" })).toBe("Recurso");
  });
  it("sem pasta: categorias do edital vão para Edital", () => {
    for (const categoria of ["edital", "termo_referencia", "anexo_edital", "errata"]) {
      expect(pastaDoArquivo({ pasta: null, categoria })).toBe(PASTA_EDITAL);
    }
  });
  it("sem pasta e sem categoria do edital: Outros", () => {
    expect(pastaDoArquivo({ pasta: "   ", categoria: null })).toBe(PASTA_OUTROS);
    expect(pastaDoArquivo({})).toBe(PASTA_OUTROS);
  });
});

describe("lerPastasExtras", () => {
  it("aceita array, string JSON (legado) e lixo", () => {
    expect(lerPastasExtras(["Recurso", " Contrato ", ""])).toEqual(["Recurso", "Contrato"]);
    expect(lerPastasExtras('["Recurso"]')).toEqual(["Recurso"]);
    expect(lerPastasExtras(null)).toEqual([]);
    expect(lerPastasExtras("não é json")).toEqual([]);
    expect(lerPastasExtras({ a: 1 })).toEqual([]);
  });
});

describe("listarPastas", () => {
  it("sem extras: só as padrão, Outros por último", () => {
    expect(listarPastas([], [])).toEqual(PASTAS_PADRAO);
  });
  it("extras em ordem alfabética entre as padrão e Outros", () => {
    expect(listarPastas(["Recurso", "Contrato"], [])).toEqual([
      "Edital",
      "Credenciamento",
      "Envelope 01 – Proposta",
      "Envelope 02 – Habilitação",
      "Contrato",
      "Recurso",
      "Outros",
    ]);
  });
  it("não repete pasta (maiúsculas/acento) e inclui pasta que só existe no arquivo", () => {
    const pastas = listarPastas(
      ["recurso", "ENVELOPE 02 – HABILITACAO"],
      [{ pasta: "Recurso" }, { pasta: "Atas" }]
    );
    expect(pastas).toEqual([
      "Edital",
      "Credenciamento",
      "Envelope 01 – Proposta",
      "Envelope 02 – Habilitação",
      "Atas",
      "recurso",
      "Outros",
    ]);
  });
});

describe("agruparPorPasta", () => {
  it("devolve todas as pastas (vazias também) e ordena arquivos por nome numérico", () => {
    const arquivos = [
      { id: 1, nome: "10- CND.pdf", pasta: "Envelope 02 – Habilitação" },
      { id: 2, nome: "2- QSA.pdf", pasta: "Envelope 02 – Habilitação" },
      { id: 3, nome: "Edital.pdf", categoria: "edital" },
      { id: 4, nome: "foto.png" },
    ];
    const grupos = agruparPorPasta(arquivos, listarPastas([], arquivos));
    expect(grupos.map((g) => g.pasta)).toEqual(PASTAS_PADRAO);
    const hab = grupos.find((g) => g.pasta === "Envelope 02 – Habilitação");
    expect(hab.arquivos.map((a) => a.id)).toEqual([2, 1]);
    expect(grupos.find((g) => g.pasta === "Edital").arquivos.map((a) => a.id)).toEqual([3]);
    expect(grupos.find((g) => g.pasta === "Outros").arquivos.map((a) => a.id)).toEqual([4]);
    expect(grupos.find((g) => g.pasta === "Credenciamento").arquivos).toEqual([]);
  });
  it("casa a pasta do arquivo sem diferenciar maiúsculas/acento", () => {
    const grupos = agruparPorPasta([{ id: 9, nome: "a.pdf", pasta: "edital" }], PASTAS_PADRAO);
    expect(grupos.find((g) => g.pasta === "Edital").arquivos.map((a) => a.id)).toEqual([9]);
  });
});

describe("nomePastaValido", () => {
  it("apara e junta espaços", () => {
    expect(nomePastaValido("  Recurso   Administrativo ", [])).toEqual({
      ok: true,
      nome: "Recurso Administrativo",
    });
  });
  it("recusa vazio, longo demais e repetido (sem diferenciar acento)", () => {
    expect(nomePastaValido("   ", []).ok).toBe(false);
    expect(nomePastaValido("x".repeat(61), []).ok).toBe(false);
    expect(nomePastaValido("x".repeat(60), []).ok).toBe(true);
    expect(nomePastaValido("envelope 02 – habilitacao", PASTAS_PADRAO).ok).toBe(false);
    expect(nomePastaValido("RECURSO", ["Recurso"]).erro).toBe("Já existe uma pasta com esse nome");
  });
});

describe("mesmaPasta", () => {
  it("ignora maiúsculas, acento e espaços sobrando", () => {
    expect(mesmaPasta("edital", "Edital")).toBe(true);
    expect(mesmaPasta("Envelope 02 – Habilitacao", "envelope  02 – HABILITAÇÃO ")).toBe(true);
    expect(mesmaPasta("Recurso", "Contrato")).toBe(false);
  });
  it("vazio só casa com vazio", () => {
    expect(mesmaPasta("", null)).toBe(true);
    expect(mesmaPasta("", "Outros")).toBe(false);
  });
});

describe("pastaParaGravar", () => {
  it("Outros (qualquer grafia) ou vazio grava null, para a regra de categoria valer depois", () => {
    expect(pastaParaGravar("Outros")).toBeNull();
    expect(pastaParaGravar("  outros ")).toBeNull();
    expect(pastaParaGravar("")).toBeNull();
    expect(pastaParaGravar(null)).toBeNull();
    expect(pastaParaGravar(undefined)).toBeNull();
  });
  it("as demais pastas gravam o nome aparado", () => {
    expect(pastaParaGravar("Edital")).toBe("Edital");
    expect(pastaParaGravar("  Envelope 02 – Habilitação ")).toBe("Envelope 02 – Habilitação");
    expect(pastaParaGravar("Recurso   Administrativo")).toBe("Recurso Administrativo");
  });
  it("arquivo com categoria do edital movido para Outros grava 'Outros' (null o devolveria ao Edital)", () => {
    expect(pastaParaGravar("Outros", "edital")).toBe("Outros");
    expect(pastaParaGravar("Outros", "errata")).toBe("Outros");
    expect(pastaParaGravar("Outros", "contrato")).toBeNull();
    expect(pastaParaGravar("Outros", null)).toBeNull();
    expect(pastaParaGravar("Credenciamento", "edital")).toBe("Credenciamento");
  });
  it("o resultado coerente com pastaDoArquivo: envio em Outros + categoria depois = Edital", () => {
    const gravada = pastaParaGravar("Outros");
    expect(pastaDoArquivo({ pasta: gravada, categoria: "edital" })).toBe(PASTA_EDITAL);
    const movido = pastaParaGravar("Outros", "edital");
    expect(pastaDoArquivo({ pasta: movido, categoria: "edital" })).toBe(PASTA_OUTROS);
  });
});
