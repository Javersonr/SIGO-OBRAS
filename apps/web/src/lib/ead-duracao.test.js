import { describe, it, expect } from "vitest";
import { parseDuracao, formatDuracao, videoSemDuracao } from "./ead-duracao";
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
describe("aula de vídeo sem duração", () => {
  it("marca só vídeo sem duração positiva (mesma regra do servidor)", () => {
    for (const duracao_seg of [null, undefined, 0, -1, Infinity, "inválido"])
      expect(videoSemDuracao({ tipo: "video", duracao_seg })).toBe(true);
    expect(videoSemDuracao({ duracao_seg: null })).toBe(true);
    expect(videoSemDuracao({ tipo: "video", duracao_seg: 1 })).toBe(false);
    expect(videoSemDuracao({ tipo: "video", duracao_seg: "90" })).toBe(false);
  });
  it("não marca PDF nem texto, que usam o tempo mínimo de leitura", () => {
    expect(videoSemDuracao({ tipo: "pdf", duracao_seg: null })).toBe(false);
    expect(videoSemDuracao({ tipo: "texto" })).toBe(false);
    expect(videoSemDuracao(null)).toBe(false);
  });
});
