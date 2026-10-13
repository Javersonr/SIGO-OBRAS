import { describe, it, expect } from "vitest";
import {
  pacoteDoMes,
  rotuloDoTipo,
  situacaoDaValidade,
  substituidoPadrao,
  validarDocumento,
  versoesAnteriores,
} from "./habilitacao-documentos";

const HOJE = "2026-10-13";
const doc = (id, tipo, extra = {}) => ({ id, tipo, nome: `Doc ${id}`, ativo: true, ...extra });

describe("pacoteDoMes", () => {
  it("separa vencidos e os que vencem em até 30 dias, só entre os ativos com validade", () => {
    const docs = [
      doc("a", "crf_fgts", { validade: "2026-10-28" }),
      doc("b", "cnd_federal", { validade: "2026-10-01" }),
      doc("c", "cndt_trabalhista", { validade: "2026-11-12" }),
      doc("d", "cnd_estadual", { validade: "2026-11-13" }),
      doc("e", "balanco_dre"),
      doc("f", "cnd_federal", { validade: "2026-01-01", ativo: false }),
      doc("g", "alvara", { validade: "2026-10-13" }),
    ];
    const p = pacoteDoMes(docs, HOJE);
    expect(p.vencidos.map((d) => d.id)).toEqual(["b"]);
    expect(p.vencem.map((d) => d.id)).toEqual(["g", "a", "c"]);
  });
});

describe("substituidoPadrao", () => {
  it("tipo único com um ativo → sugere esse; senão null", () => {
    const docs = [
      doc("a", "crf_fgts"),
      doc("b", "balanco_dre"),
      doc("c", "cnd_federal"),
      doc("d", "cnd_federal", { ativo: false }),
      doc("e", "alvara"),
      doc("f", "alvara"),
    ];
    expect(substituidoPadrao("crf_fgts", docs)).toBe("a");
    expect(substituidoPadrao("cnd_federal", docs)).toBe("c");
    expect(substituidoPadrao("balanco_dre", docs)).toBe(null);
    expect(substituidoPadrao("alvara", docs)).toBe(null);
    expect(substituidoPadrao("cartao_cnpj", docs)).toBe(null);
  });
});

describe("versoesAnteriores", () => {
  it("segue substitui_id da mais nova para a mais antiga e para em ciclo", () => {
    const v1 = doc("v1", "crf_fgts", { ativo: false });
    const v2 = doc("v2", "crf_fgts", { ativo: false, substitui_id: "v1" });
    const v3 = doc("v3", "crf_fgts", { substitui_id: "v2" });
    expect(versoesAnteriores(v3, [v1, v2, v3]).map((d) => d.id)).toEqual(["v2", "v1"]);
    expect(versoesAnteriores(v1, [v1, v2, v3])).toEqual([]);
    const x = doc("x", "outro", { substitui_id: "y" });
    const y = doc("y", "outro", { substitui_id: "x" });
    expect(versoesAnteriores(x, [x, y]).map((d) => d.id)).toEqual(["y"]);
  });
  it("ignora entradas vazias na lista", () => {
    const v1 = doc("v1", "crf_fgts", { ativo: false });
    const v2 = doc("v2", "crf_fgts", { ativo: false, substitui_id: "v1" });
    const v3 = doc("v3", "crf_fgts", { substitui_id: "v2" });
    expect(versoesAnteriores(v3, [null, v1, undefined, v2, v3]).map((d) => d.id)).toEqual([
      "v2",
      "v1",
    ]);
  });
});

describe("validarDocumento", () => {
  const base = {
    tipo: "crf_fgts",
    nome: "  CRF de outubro ",
    arquivo_ref: "habilitacao/00000000-0000-4000-8000-000000000001/2026/10/u-crf.pdf",
    numero: " 2026101 ",
    orgao_emissor: "",
    emissao: "2026-09-28",
    validade: "2026-10-27",
    observacao: "",
  };
  it("aceita e devolve os dados aparados, com vazio → null", () => {
    expect(validarDocumento(base)).toEqual({
      ok: true,
      erros: [],
      dados: {
        tipo: "crf_fgts",
        nome: "CRF de outubro",
        arquivo_ref: base.arquivo_ref,
        numero: "2026101",
        orgao_emissor: null,
        emissao: "2026-09-28",
        validade: "2026-10-27",
        observacao: null,
      },
    });
  });
  it("lista os erros", () => {
    const r = validarDocumento({
      ...base,
      tipo: "x",
      nome: " ",
      arquivo_ref: "",
      emissao: "2026-10-28",
      validade: "2026-10-27",
    });
    expect(r.ok).toBe(false);
    expect(r.erros).toEqual([
      "Escolha o tipo do documento",
      "Informe o nome do documento",
      "Anexe o arquivo (PDF ou imagem)",
      "A validade não pode ser anterior à emissão",
    ]);
  });
  it("data fora do formato", () => {
    expect(validarDocumento({ ...base, validade: "27/10/2026" }).erros).toEqual([
      "Validade: use uma data válida",
    ]);
    expect(validarDocumento({ ...base, emissao: "2026-02-30" }).erros).toEqual([
      "Emissão: use uma data válida",
    ]);
  });
  // diasAte aceita timestamp e sufixo; o formulário só aceita a data inteira AAAA-MM-DD
  it("validade em timestamp é recusada", () => {
    expect(validarDocumento({ ...base, validade: "2026-10-27T12:00:00Z" }).erros).toEqual([
      "Validade: use uma data válida",
    ]);
  });
  it("emissão em timestamp é recusada", () => {
    expect(validarDocumento({ ...base, emissao: "2026-09-28T00:00:00Z" }).erros).toEqual([
      "Emissão: use uma data válida",
    ]);
  });
  it("validade com sufixo depois da data é recusada", () => {
    expect(validarDocumento({ ...base, validade: "2026-10-27x" }).erros).toEqual([
      "Validade: use uma data válida",
    ]);
  });
  it("nome: 200 caracteres passa, 201 não", () => {
    expect(validarDocumento({ ...base, nome: "n".repeat(200) }).ok).toBe(true);
    const r = validarDocumento({ ...base, nome: "n".repeat(201) });
    expect(r.ok).toBe(false);
    expect(r.erros).toEqual(["Nome: use até 200 caracteres"]);
  });
  it("validade igual à emissão é aceita", () => {
    const r = validarDocumento({ ...base, emissao: "2026-10-27", validade: "2026-10-27" });
    expect(r.ok).toBe(true);
    expect(r.erros).toEqual([]);
  });
  it("sem formulário (null) devolve os três erros obrigatórios, sem lançar", () => {
    const r = validarDocumento(null);
    expect(r.ok).toBe(false);
    expect(r.erros).toEqual([
      "Escolha o tipo do documento",
      "Informe o nome do documento",
      "Anexe o arquivo (PDF ou imagem)",
    ]);
  });
});

describe("rótulo e situação (mesmas regras do servidor)", () => {
  it("rotuloDoTipo e situacaoDaValidade", () => {
    expect(rotuloDoTipo("cnd_federal")).toBe("CND Federal (Receita/PGFN)");
    expect(situacaoDaValidade("2026-10-12", HOJE)).toEqual({ situacao: "vencido", dias: -1 });
  });
});
