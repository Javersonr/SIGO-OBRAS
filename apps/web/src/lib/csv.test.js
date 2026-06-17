import { describe, it, expect } from "vitest";
import { detectarSeparadorCSV, parseCSV, csvParaObjetos } from "./csv";

describe("detectarSeparadorCSV", () => {
  it("detecta ; , e tab", () => {
    expect(detectarSeparadorCSV("a;b;c")).toBe(";");
    expect(detectarSeparadorCSV("a,b,c")).toBe(",");
    expect(detectarSeparadorCSV("a\tb\tc")).toBe("\t");
  });
  it("tab tem prioridade quando empata", () => {
    expect(detectarSeparadorCSV("a\tb;c")).toBe("\t");
  });
  it("; ganha de , quando ambos aparecem", () => {
    expect(detectarSeparadorCSV("a;b,c")).toBe(";");
  });
  it("default vírgula quando não há separador", () => {
    expect(detectarSeparadorCSV("")).toBe(",");
    expect(detectarSeparadorCSV("umacoisa")).toBe(",");
  });
});

describe("parseCSV", () => {
  it("linhas e campos simples", () => {
    expect(parseCSV("a;b;c", ";")).toEqual([["a", "b", "c"]]);
    expect(parseCSV("a;b\nc;d", ";")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });
  it("trima campos e mantém campo final vazio", () => {
    expect(parseCSV("a ; b ;c", ";")).toEqual([["a", "b", "c"]]);
    expect(parseCSV("a;b;", ";")).toEqual([["a", "b", ""]]);
  });
  it("aspas protegem o separador dentro do campo", () => {
    expect(parseCSV('"a;b";c', ";")).toEqual([["a;b", "c"]]);
  });
  it("aspas duplas escapadas viram uma aspa", () => {
    expect(parseCSV('"ele disse ""oi""";c', ";")).toEqual([['ele disse "oi"', "c"]]);
  });
  it("quebra de linha dentro de aspas fica no mesmo campo", () => {
    expect(parseCSV('"linha1\nlinha2";c', ";")).toEqual([["linha1\nlinha2", "c"]]);
  });
  it("aceita CRLF", () => {
    expect(parseCSV("a;b\r\nc;d", ";")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });
});

describe("csvParaObjetos", () => {
  it("remove BOM, detecta separador e mapeia cabeçalho", () => {
    const BOM = String.fromCharCode(0xfeff);
    const out = csvParaObjetos(`${BOM}Descrição;Valor\nCimento;250,00`);
    expect(out.separador).toBe(";");
    expect(out.headers).toEqual(["Descrição", "Valor"]); // sem BOM grudado no 1º header
    expect(out.data).toEqual([{ Descrição: "Cimento", Valor: "250,00" }]);
  });
  it("colunas faltando viram string vazia", () => {
    const out = csvParaObjetos("A,B,C\n1,2");
    expect(out.data).toEqual([{ A: "1", B: "2", C: "" }]);
  });
  it("texto vazio → sem linhas", () => {
    expect(csvParaObjetos("").data).toEqual([]);
  });
});
