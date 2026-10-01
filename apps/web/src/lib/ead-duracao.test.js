import { describe, it, expect } from "vitest";
import { parseDuracao, formatDuracao } from "./ead-duracao";
describe("duração das aulas", () => {
  it("lê mm:ss, inclusive vídeos com mais de uma hora", () => {
    expect(parseDuracao("01:30")).toBe(90);
    expect(parseDuracao("120:05")).toBe(7205);
    expect(parseDuracao("0:01")).toBe(1);
  });
  it("recusa duração nula, segundos inválidos e números ambíguos", () => {
    for (const valor of ["", "0:00", "1:60", "1:5", "1", "-1:30", "Infinity"])
      expect(parseDuracao(valor)).toBeNull();
  });
  it("formata segundos sem perder o valor", () => {
    expect(formatDuracao(7205)).toBe("120:05");
    expect(parseDuracao(formatDuracao(125))).toBe(125);
  });
});
