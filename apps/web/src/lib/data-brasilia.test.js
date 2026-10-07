import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dataHoraBrasilia, dataHoraCurtaBrasilia, diaBrasilia } from "./data-brasilia";

// Dados sintéticos: só instantes de calendário.
describe("dataHoraBrasilia: data e hora no fuso de Brasília, qualquer que seja o aparelho", () => {
  it("02h30 UTC de 06/10 é 23h30 de 05/10 em Brasília (o dia da conclusão não vira)", () => {
    const texto = dataHoraBrasilia("2026-10-06T02:30:00.000Z");
    expect(texto).toContain("05/10/2026");
    expect(texto).toContain("23:30:00");
    expect(texto).not.toContain("06/10/2026");
  });

  it("meio-dia UTC é 09h em Brasília (UTC-3, sem horário de verão)", () => {
    expect(dataHoraBrasilia("2026-01-10T12:00:00.000Z")).toContain("09:00:00");
    expect(dataHoraBrasilia("2026-07-10T12:00:00.000Z")).toContain("09:00:00");
  });

  it("aceita Date e texto com ou sem fuso explícito do Postgres", () => {
    expect(dataHoraBrasilia(new Date("2026-10-06T02:30:00.000Z"))).toContain("23:30:00");
    expect(dataHoraBrasilia("2026-10-06T02:30:00+00:00")).toContain("23:30:00");
    expect(dataHoraBrasilia("2026-10-05T23:30:00-03:00")).toContain("23:30:00");
  });

  it("vazio ou data inválida não derruba a tela: devolve o travessão", () => {
    for (const x of [null, undefined, "", "não é data", NaN]) {
      expect(dataHoraBrasilia(x), String(x)).toBe("—");
    }
  });
});

describe("dataHoraCurtaBrasilia: data e hora sem segundos, no fuso de Brasília (A6, T35)", () => {
  it("02h30 UTC de 06/10 é 23h30 de 05/10 em Brasília, sem segundos", () => {
    const texto = dataHoraCurtaBrasilia("2026-10-06T02:30:00.000Z");
    expect(texto).toContain("05/10/2026");
    expect(texto).toContain("23:30");
    expect(texto).not.toContain("23:30:00");
    expect(texto).not.toContain("06/10");
  });

  it("vazio ou data inválida devolve texto vazio (a tela esconde o campo)", () => {
    for (const x of [null, undefined, "", "não é data", NaN]) {
      expect(dataHoraCurtaBrasilia(x), String(x)).toBe("");
    }
  });
});

describe("o PDF do certificado e a página de validação usam a hora de Brasília (T8, acompanhamento)", () => {
  const ler = (caminho) => readFileSync(new URL(caminho, import.meta.url), "utf8");
  it("nenhum dos dois formata a assinatura com o fuso do aparelho", () => {
    for (const caminho of [
      "./certificado-ead.js",
      "../components/portal-funcionario/ResultadoValidacao.jsx",
    ]) {
      const fonte = ler(caminho);
      expect(fonte, caminho).toContain("dataHoraBrasilia(");
      // `toLocaleString("pt-BR")` sozinho usa o fuso do aparelho
      expect(fonte, caminho).not.toContain('toLocaleString("pt-BR")');
    }
  });
});

describe("diaBrasilia: só o dia, no fuso de Brasília (A6, T12 M5)", () => {
  it("02h30 UTC de 06/10 é o dia 05/10 em Brasília: 'Lançado em' não adianta o dia depois das 21h", () => {
    expect(diaBrasilia("2026-10-06T02:30:00.000Z")).toBe("05/10/2026");
    expect(diaBrasilia("2026-10-06T12:00:00.000Z")).toBe("06/10/2026");
    expect(diaBrasilia(new Date("2026-10-06T02:30:00.000Z"))).toBe("05/10/2026");
    expect(diaBrasilia("2026-10-05T23:30:00-03:00")).toBe("05/10/2026");
  });

  it("vazio ou data inválida devolve o travessão", () => {
    for (const x of [null, undefined, "", "não é data", NaN]) {
      expect(diaBrasilia(x), String(x)).toBe("—");
    }
  });

  it("o diálogo de presença usa esta função, e não corta o texto do timestamp (que é em UTC)", () => {
    const fonte = readFileSync(
      new URL("../components/seguranca/PresencaSessaoDialog.jsx", import.meta.url),
      "utf8"
    );
    expect(fonte).toContain("Lançado em {diaBrasilia(p.avaliado_em)}");
    expect(fonte).not.toContain("String(p.avaliado_em).slice(0, 10)");
  });
});
