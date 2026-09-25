import { describe, it, expect } from "vitest";
import {
  camposOportunidadeDoEdital,
  categoriaPeloNome,
  dataDoEdital,
  horaDoEdital,
  montarPartesEdital,
  normalizarEdital,
  numeroDoEdital,
  textoDaPaginaPdf,
  ufDoEdital,
} from "./edital-ia";

describe("normalizadores do edital", () => {
  it("datas AAAA-MM-DD válidas (aceita DD/MM/AAAA)", () => {
    expect(dataDoEdital("2026-10-15")).toBe("2026-10-15");
    expect(dataDoEdital("5/3/2026")).toBe("2026-03-05");
    expect(dataDoEdital("2026-02-31")).toBeNull();
    expect(dataDoEdital("amanhã")).toBeNull();
  });
  it("horas HH:MM", () => {
    expect(horaDoEdital("9h")).toBe("09:00");
    expect(horaDoEdital("14h30")).toBe("14:30");
    expect(horaDoEdital("08:59:00")).toBe("08:59");
    expect(horaDoEdital("25:00")).toBeNull();
  });
  it("números em formato BR", () => {
    expect(numeroDoEdital("R$ 213.148,20")).toBe(213148.2);
    expect(numeroDoEdital("213.148")).toBe(213148);
    expect(numeroDoEdital(1234.5)).toBe(1234.5);
    expect(numeroDoEdital("")).toBeNull();
  });
  it("UF por sigla ou nome", () => {
    expect(ufDoEdital("mg")).toBe("MG");
    expect(ufDoEdital("São Paulo")).toBe("SP");
    expect(ufDoEdital("Xyz")).toBeNull();
  });
  it("categoria pelo nome do arquivo", () => {
    expect(categoriaPeloNome("Edital 011-2026.pdf")).toBe("edital");
    expect(categoriaPeloNome("Anexo I - Termo de Referência.pdf")).toBe("termo_referencia");
    expect(categoriaPeloNome("ERRATA 01.pdf")).toBe("errata");
    expect(categoriaPeloNome("Anexo III - Minuta.pdf")).toBe("anexo_edital");
    expect(categoriaPeloNome("documento.pdf", true)).toBe("edital");
  });
});

describe("camposOportunidadeDoEdital", () => {
  const ex = {
    orgao: " Prefeitura de Juruaia ",
    numero_edital: "011/2026",
    modalidade: "pregao",
    forma: "eletronica",
    objeto:
      "Contratação de empresa especializada para execução de serviços de iluminação pública em LED no Estádio Municipal, com fornecimento de materiais e mão de obra",
    valor_estimado: "R$ 213.148,20",
    datas: {
      sessao: { data: "2026-10-15", hora: "9h", pagina: 1 },
      proposta_limite: { data: "15/10/2026", hora: "08:59:00" },
      impugnacao_limite: { data: "2026-02-31", hora: "25:00" },
      visita_tecnica: { obrigatoria: true, data: "2026-10-05", hora: "14h30", descricao: "Obras" },
    },
    garantia_proposta: { exigida: false },
    local: { cidade: "Juruaia", uf: "Minas Gerais" },
    exclusiva_me_epp: true,
  };

  it("mapeia só colunas com valor", () => {
    const c = camposOportunidadeDoEdital(ex);
    expect(c).toMatchObject({
      orgao: "Prefeitura de Juruaia",
      valor_estimado: 213148.2,
      licitacao_modalidade: "pregao",
      licitacao_numero: "011/2026",
      licitacao_forma: "eletronica",
      licitacao_data: "2026-10-15",
      licitacao_horario: "09:00",
      licitacao_data_proposta: "2026-10-15",
      licitacao_horario_proposta: "08:59",
      licitacao_visita_tecnica: "Obrigatória — 05/10/2026 às 14:30 — Obras",
      licitacao_garantia_proposta: false,
      licitacao_exclusiva_me_epp: true,
      cidade: "Juruaia",
      estado: "MG",
    });
    expect(c.licitacao_data_impugnacao).toBeUndefined();
    expect(c.licitacao_horario_impugnacao).toBeUndefined();
    expect(c.nome.length).toBeLessThanOrEqual(120);
    expect(c.descricao).toBe(ex.objeto);
    expect(Object.values(c).some((v) => v === undefined || v === null || v === "")).toBe(false);
  });

  it("vazio p/ entrada inválida", () => {
    expect(camposOportunidadeDoEdital(null)).toEqual({});
  });
});

describe("normalizarEdital", () => {
  it("ids únicos por grupo e listas sempre presentes", () => {
    const n = normalizarEdital({
      habilitacao: { tecnica_operacional: [{ descricao: "a" }, { id: "op1", descricao: "b" }] },
      avisos: ["x"],
    });
    expect(n.habilitacao.tecnica_operacional.map((x) => x.id)).toEqual(["op1", "op2"]);
    expect(n.habilitacao.economica).toEqual([]);
    expect(n.itens).toEqual([]);
    expect(n.avisos).toEqual(["x"]);
  });
});

describe("montarPartesEdital", () => {
  const pag = (n, chars, imagem) => ({ n, texto: "x".repeat(chars), imagem });

  it("arquivo pequeno vai numa parte só", () => {
    const partes = montarPartesEdital([
      { nome: "a.pdf", paginas: Array.from({ length: 40 }, (_, i) => pag(i + 1, 1000)) },
    ]);
    expect(partes).toHaveLength(1);
  });

  it("divide por 25 páginas de texto e 6 imagens, sem misturar arquivos", () => {
    const grande = Array.from({ length: 95 }, (_, i) => pag(i + 1, 2100));
    const escaneado = Array.from({ length: 8 }, (_, i) => pag(i + 1, 0, "data:image/jpeg;base64,"));
    const partes = montarPartesEdital([
      { nome: "edital.pdf", paginas: grande },
      { nome: "anexo.pdf", paginas: escaneado },
    ]);
    const doEdital = partes.filter((p) => p.nome === "edital.pdf");
    expect(doEdital.map((p) => p.paginas.length)).toEqual([25, 25, 25, 20]);
    const doAnexo = partes.filter((p) => p.nome === "anexo.pdf");
    expect(doAnexo.map((p) => p.paginas.length)).toEqual([6, 2]);
  });
});

describe("textoDaPaginaPdf", () => {
  it("respeita hasEOL e separa colunas", () => {
    const item = (str, x, y, extra = {}) => ({
      str,
      transform: [10, 0, 0, 10, x, y],
      width: str.length * 5,
      height: 10,
      ...extra,
    });
    const t = textoDaPaginaPdf({
      items: [
        item("Edital", 0, 700, { hasEOL: true }),
        item("Item", 0, 680),
        item("Descrição", 60, 680),
        item("Sessão", 0, 660),
      ],
    });
    expect(t).toBe("Edital\nItem Descrição\nSessão");
  });
});
