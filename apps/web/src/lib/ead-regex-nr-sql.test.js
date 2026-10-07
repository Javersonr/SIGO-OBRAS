import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// Guarda das expressões regulares de NR dos SQL do EAD (A6). Não há Postgres local: o teste TRADUZ a regex do
// arquivo para JavaScript (só as poucas construções que elas usam) e confere nomes de verdade. O que importa:
// nome digitado no Word, com travessão (U+2013 "–" ou U+2014 "—") no lugar do hífen, tem de casar do mesmo
// jeito que o nome com hífen; senão o curso fica fora da prévia e da gravação, sem aviso. Os dois travessões
// entram como os próprios caracteres dentro dos colchetes (os arquivos já levam acentos e seguem em UTF-8).
const lerSql = (caminho) => readFileSync(new URL(caminho, import.meta.url), "utf8");
const SQL_NR1_NR6 = lerSql("../../../../tools/ead-validade-nr1-nr6.sql");
const SQL_MODALIDADE = lerSql(
  "../../../../supabase/migrations/0136_treinamento_curso_modalidade.sql"
);

/** Todas as regex `~* '...'` de NR do arquivo (inclusive as das partes comentadas), como texto de SQL. */
function regexesDeNr(sql) {
  return [...sql.matchAll(/~\*\s*'([^']*NR\[\[:space:\][^']*)'/g)].map((m) => m[1]);
}

/** Regex do Postgres (ARE) → RegExp do JavaScript, só com o que estes SQL usam. */
function paraJs(regexDoPostgres) {
  const js = regexDoPostgres
    .replace(/\\m/g, "\\b")
    .replace(/\\M/g, "\\b")
    .replace(/\[:space:\]/g, "\\s");
  return new RegExp(js, "i");
}

describe("regex de NR dos SQL do EAD aceita o travessão do Word (A6)", () => {
  describe("NR-1 e NR-6 (tools/ead-validade-nr1-nr6.sql)", () => {
    const regexes = regexesDeNr(SQL_NR1_NR6);

    it("a prévia e a gravação (B1, B2 e a conferência) usam a mesma regex", () => {
      expect(regexes.length).toBeGreaterThanOrEqual(4);
      expect(new Set(regexes).size).toBe(1);
    });

    it("casa NR-1 e NR-6 escritos com hífen, espaço, travessão ou nada", () => {
      const r = paraJs(regexes[0]);
      for (const nome of [
        "NR-01 Básico",
        "NR-1",
        "NR 6 Uso de EPI",
        "nr-06 reciclagem",
        "Treinamento NR1",
        "NR–01 Básico", // travessão (U+2013)
        "NR – 6",
        "NR—06", // travessão longo (U+2014)
        "NR  —  1",
        "Introdução (NR-01)",
      ]) {
        expect(r.test(nome), nome).toBe(true);
      }
    });

    it("não casa outras NR que só começam com 1 ou 6", () => {
      const r = paraJs(regexes[0]);
      for (const nome of ["NR-10", "NR–10", "NR-16", "NR — 16", "NR-11", "NR-35", "ENR-1", "NR-"]) {
        expect(r.test(nome), nome).toBe(false);
      }
    });
  });

  describe("NR-35 (supabase/migrations/0136_treinamento_curso_modalidade.sql)", () => {
    const regexes = regexesDeNr(SQL_MODALIDADE);

    it("a marcação como apoio e a conferência usam a mesma regex", () => {
      expect(regexes.length).toBeGreaterThanOrEqual(2);
      expect(new Set(regexes).size).toBe(1);
    });

    it("casa NR-35 escrito com hífen, espaço, travessão ou nada", () => {
      const r = paraJs(regexes[0]);
      for (const nome of [
        "NR-35",
        "NR 35 Trabalho em altura",
        "NR35",
        "NR–35",
        "NR — 35",
        "NR—35",
      ]) {
        expect(r.test(nome), nome).toBe(true);
      }
    });

    it("não casa NR-3, NR-350 nem NR-135", () => {
      const r = paraJs(regexes[0]);
      for (const nome of ["NR-3", "NR-350", "NR-135", "NR–3"]) {
        expect(r.test(nome), nome).toBe(false);
      }
    });
  });

  it("os dois travessões entram como caracteres dentro dos colchetes (não como escape que o Postgres possa ler diferente)", () => {
    for (const sql of [SQL_NR1_NR6, SQL_MODALIDADE]) {
      for (const regex of regexesDeNr(sql)) {
        expect(regex).toMatch(/\[\[:space:\][^\]]*–[^\]]*\]/);
        expect(regex).toMatch(/\[\[:space:\][^\]]*—[^\]]*\]/);
      }
    }
  });
});
