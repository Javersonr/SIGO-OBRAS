import { describe, it, expect } from "vitest";
import { formatarMinutos, prazoParaOAluno, textoDaDedicacao } from "./portal-prazo";

describe("formatarMinutos", () => {
  it.each([
    [1, "1 min"],
    [45, "45 min"],
    [60, "1 h"],
    [90, "1 h 30 min"],
    [120, "2 h"],
    [1440, "24 h"],
    ["30", "30 min"],
  ])("%s min vira %s", (entrada, saida) => {
    expect(formatarMinutos(entrada)).toBe(saida);
  });

  it.each([null, undefined, "", 0, -5, 1.5, "abc", NaN, Infinity])(
    "valor que não é minuto inteiro positivo (%s) vira texto vazio",
    (entrada) => {
      expect(formatarMinutos(entrada)).toBe("");
    }
  );
});

describe("textoDaDedicacao", () => {
  it("diz o tempo mínimo estimado por dia", () => {
    expect(textoDaDedicacao({ dedicacao_diaria_min: 90 })).toBe(
      "Dedicação mínima estimada: 1 h 30 min por dia"
    );
    expect(textoDaDedicacao({ dedicacao_diaria_min: 30 })).toBe(
      "Dedicação mínima estimada: 30 min por dia"
    );
  });

  it("sem o dado no curso não há texto", () => {
    expect(textoDaDedicacao({})).toBeNull();
    expect(textoDaDedicacao({ dedicacao_diaria_min: null })).toBeNull();
    expect(textoDaDedicacao({ dedicacao_diaria_min: 0 })).toBeNull();
    expect(textoDaDedicacao(null)).toBeNull();
  });
});

describe("prazoParaOAluno", () => {
  // matriculado em 01/10/2026 às 12h de Brasília; 30 dias de prazo: limite em 31/10/2026
  const curso = { prazo_conclusao_dias: 30 };
  const matricula = (extra = {}) => ({
    status: "em_andamento",
    created_at: "2026-10-01T15:00:00Z",
    ...extra,
  });

  it("dentro do prazo: diz a data limite e quantos dias faltam", () => {
    const r = prazoParaOAluno({ matricula: matricula(), curso, hoje: "2026-10-06" });
    expect(r).toEqual({
      texto: "Prazo para concluir: até 31/10/2026 (faltam 25 dias)",
      limite: "2026-10-31",
      tom: "normal",
    });
  });

  it("os últimos 7 dias pedem atenção; o último dia diz que termina hoje", () => {
    expect(prazoParaOAluno({ matricula: matricula(), curso, hoje: "2026-10-24" })).toMatchObject({
      texto: "Prazo para concluir: até 31/10/2026 (faltam 7 dias)",
      tom: "atencao",
    });
    expect(prazoParaOAluno({ matricula: matricula(), curso, hoje: "2026-10-30" })).toMatchObject({
      texto: "Prazo para concluir: até 31/10/2026 (falta 1 dia)",
      tom: "atencao",
    });
    expect(prazoParaOAluno({ matricula: matricula(), curso, hoje: "2026-10-31" })).toMatchObject({
      texto: "Prazo para concluir: até 31/10/2026 (termina hoje)",
      tom: "atencao",
    });
  });

  it("passou do limite: o aluno é mandado ao RH (o portal não o tranca)", () => {
    expect(prazoParaOAluno({ matricula: matricula(), curso, hoje: "2026-11-01" })).toEqual({
      texto: "O prazo para concluir terminou em 31/10/2026. Fale com o RH.",
      limite: "2026-10-31",
      tom: "atraso",
    });
  });

  it("conta a partir do dia de Brasília, não do de Greenwich", () => {
    // 02/10 01:00 UTC ainda é 01/10 22:00 em Brasília
    const r = prazoParaOAluno({
      matricula: matricula({ created_at: "2026-10-02T01:00:00Z" }),
      curso,
      hoje: "2026-10-06",
    });
    expect(r.limite).toBe("2026-10-31");
  });

  it("sem prazo no curso, com curso concluído ou sem dados, não há prazo", () => {
    expect(prazoParaOAluno({ matricula: matricula(), curso: {}, hoje: "2026-10-06" })).toBeNull();
    expect(
      prazoParaOAluno({
        matricula: matricula(),
        curso: { prazo_conclusao_dias: 0 },
        hoje: "2026-10-06",
      })
    ).toBeNull();
    expect(
      prazoParaOAluno({
        matricula: matricula({ status: "concluido" }),
        curso,
        hoje: "2026-10-06",
      })
    ).toBeNull();
    expect(prazoParaOAluno({ matricula: null, curso, hoje: "2026-10-06" })).toBeNull();
    expect(prazoParaOAluno({})).toBeNull();
  });
});
