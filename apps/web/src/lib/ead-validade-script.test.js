import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// Guarda do script `tools/ead-validade-nr1-nr6.sql` (D12). Não executa SQL (não há banco de teste): confere a
// FORMA do arquivo. O ponto principal: a prévia é UM comando só. O `supabase db query --linked -f` passa pela API de
// gestão, que pode devolver só o resultado do último comando de um arquivo com vários; com dois SELECTs a prévia
// mostraria só o último e esconderia o resto (T24, revisão 1).
const sql = readFileSync(
  new URL("../../../../tools/ead-validade-nr1-nr6.sql", import.meta.url),
  "utf8"
);

// O que o banco executa de fato: sem comentário de linha (a parte B está toda comentada).
const executavel = sql
  .split("\n")
  .map((linha) => linha.replace(/--.*$/, ""))
  .join("\n");
const comandos = executavel
  .split(";")
  .map((c) => c.trim())
  .filter(Boolean);

describe("tools/ead-validade-nr1-nr6.sql: prévia da validade de 24 meses (NR-1 e NR-6)", () => {
  it("a prévia é um comando só, e é uma consulta", () => {
    expect(comandos).toHaveLength(1);
    expect(comandos[0]).toMatch(/^with\s+alvo\s+as\s*\(/i);
    expect(comandos[0]).toMatch(/\bselect\b/i);
  });

  it("a prévia só lê: nenhum comando que grava ou abre transação fora de comentário", () => {
    expect(executavel).not.toMatch(
      /\b(insert|update|delete|truncate|alter|drop|create|grant|revoke|begin|commit|rollback)\b/i
    );
  });

  it("uma linha por curso, com o que a gravação faz e tudo o que a parte B muda", () => {
    for (const coluna of [
      "o_que_a_gravacao_faz",
      "matriculas_concluidas_sem_renovacao",
      "modelo_cursos_ead_ligados",
      "modelo_exigencias_de_funcoes_que_tambem_mudam",
      "modelo_exigencias_que_passam_a_alertar",
      "aviso",
    ]) {
      expect(executavel, coluna).toContain(` as ${coluna}`);
    }
    // O curso sem vínculo (B1) tem de aparecer: o modelo entra por left join.
    expect(executavel).toMatch(/left\s+join\s+public\.treinamento\s+m\b/i);
    // Os três destinos da gravação ficam explícitos na linha.
    expect(executavel).toContain("'B1:");
    expect(executavel).toContain("'B2:");
    expect(executavel).toContain("'NADA:");
  });

  it("a contagem de 'sem renovação' só conta matrícula concluída sem data de renovação", () => {
    expect(executavel).toMatch(
      /x\.status\s*=\s*'concluido'\s+and\s+x\.proxima_renovacao\s+is\s+null/i
    );
  });

  it("a gravação (parte B) existe e está toda comentada", () => {
    expect(sql).toMatch(/^-- begin;$/m);
    expect(sql).toMatch(/^-- update public\.treinamento_curso$/m);
    expect(sql).toMatch(/^-- update public\.treinamento m$/m);
    expect(sql).toMatch(/^-- commit;$/m);
    expect(sql).toContain("set validade_meses = 24");
  });

  it("não leva UUID nem endereço de e-mail (repositório público)", () => {
    expect(sql).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(sql).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  });
});
