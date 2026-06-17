import { describe, it, expect } from "vitest";
import { gerarDatasParcelas } from "./parcelas";

describe("gerarDatasParcelas", () => {
  it("gera a mesma data a cada mês", () => {
    expect(gerarDatasParcelas(3, "2026-01-15")).toEqual(["2026-01-15", "2026-02-15", "2026-03-15"]);
  });

  it("não tem drift de timezone (mantém o dia informado)", () => {
    // bug histórico: voltava 2026-01-14 em UTC-3
    expect(gerarDatasParcelas(1, "2026-01-15")).toEqual(["2026-01-15"]);
  });

  it("CLAMPA pro último dia do mês (não transborda fev→mar)", () => {
    // antes: fev caía em 2026-03-03 (overflow). agora: 2026-02-28
    expect(gerarDatasParcelas(3, "2026-01-31")).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
  });

  it("respeita ano bissexto (fev 29 em 2024)", () => {
    expect(gerarDatasParcelas(2, "2024-01-31")).toEqual(["2024-01-31", "2024-02-29"]);
  });

  it("dia 30 também clampa em fevereiro", () => {
    expect(gerarDatasParcelas(2, "2026-01-30")).toEqual(["2026-01-30", "2026-02-28"]);
  });

  it("vira o ano corretamente", () => {
    expect(gerarDatasParcelas(3, "2026-11-15")).toEqual(["2026-11-15", "2026-12-15", "2027-01-15"]);
    expect(gerarDatasParcelas(2, "2026-12-31")).toEqual(["2026-12-31", "2027-01-31"]);
  });

  it("entrada inválida → array vazio", () => {
    expect(gerarDatasParcelas(0, "2026-01-15")).toEqual([]);
    expect(gerarDatasParcelas(3, "")).toEqual([]);
    expect(gerarDatasParcelas(3, null)).toEqual([]);
    expect(gerarDatasParcelas(2, "lixo")).toEqual([]);
  });
});
