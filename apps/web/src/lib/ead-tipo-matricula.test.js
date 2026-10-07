import { describe, it, expect } from "vitest";
import {
  MOTIVO_EVENTUAL_MAX,
  MOTIVO_EVENTUAL_MIN,
  OPCOES_DE_TIPO,
  TIPO_AUTOMATICO,
  TIPOS_DE_TREINAMENTO,
  linhasDoTipoNoCertificado,
  rotuloDoTipo,
  textoDoTipoDaMatricula,
  tipoDaNovaMatricula,
  tipoPublicoDoCertificado,
  validarEscolhaDeTipo,
} from "./ead-tipo-matricula";

describe("tipos de treinamento (NR-1 1.7.1.2)", () => {
  it("são os três do banco, na ordem da norma; a escolha do RH tem mais o automático", () => {
    expect(TIPOS_DE_TREINAMENTO).toEqual(["inicial", "periodico", "eventual"]);
    expect(OPCOES_DE_TIPO.map((o) => o.valor)).toEqual([TIPO_AUTOMATICO, ...TIPOS_DE_TREINAMENTO]);
    expect(MOTIVO_EVENTUAL_MIN).toBe(3);
    expect(MOTIVO_EVENTUAL_MAX).toBe(200);
    for (const o of OPCOES_DE_TIPO) {
      expect(o.rotulo.length).toBeGreaterThan(2);
      expect(o.explicacao.length).toBeGreaterThan(10);
    }
  });

  it("rotuloDoTipo: texto de tela; tipo que não é um dos três não ganha rótulo inventado", () => {
    expect(rotuloDoTipo("inicial")).toBe("Inicial");
    expect(rotuloDoTipo("periodico")).toBe("Periódico");
    expect(rotuloDoTipo("eventual")).toBe("Eventual");
    for (const v of [undefined, null, "", "Inicial", "reciclagem", 3])
      expect(rotuloDoTipo(v)).toBe("");
  });
});

describe("validarEscolhaDeTipo (o que o RH escolheu ao matricular)", () => {
  it("automático, inicial e periódico valem sem motivo e guardam o motivo como nulo", () => {
    for (const tipo of [TIPO_AUTOMATICO, "inicial", "periodico"]) {
      expect(validarEscolhaDeTipo({ tipo, motivo: "texto que sobrou na tela" })).toEqual({
        ok: true,
        tipo,
        motivo: null,
      });
    }
  });

  it("eventual exige motivo; sem ele, não grava e diz por quê", () => {
    for (const motivo of [undefined, null, "", "   ", "ab", "  ab  "]) {
      const r = validarEscolhaDeTipo({ tipo: "eventual", motivo });
      expect(r.ok).toBe(false);
      expect(r.erro).toMatch(/motivo/i);
    }
  });

  it("eventual com motivo: tira os espaços das pontas e respeita o teto de 200 caracteres", () => {
    expect(
      validarEscolhaDeTipo({ tipo: "eventual", motivo: "  Mudança de procedimento  " })
    ).toEqual({
      ok: true,
      tipo: "eventual",
      motivo: "Mudança de procedimento",
    });
    expect(validarEscolhaDeTipo({ tipo: "eventual", motivo: "abc" }).ok).toBe(true);
    expect(validarEscolhaDeTipo({ tipo: "eventual", motivo: "x".repeat(200) }).ok).toBe(true);
    const longo = validarEscolhaDeTipo({ tipo: "eventual", motivo: "x".repeat(201) });
    expect(longo.ok).toBe(false);
    expect(longo.erro).toMatch(/200/);
  });

  it("tipo desconhecido é recusado", () => {
    for (const tipo of [undefined, null, "", "outro", "Inicial"]) {
      expect(validarEscolhaDeTipo({ tipo, motivo: "" }).ok).toBe(false);
    }
  });
});

describe("tipoDaNovaMatricula (cada pessoa da lista recebe o seu tipo)", () => {
  const concluida = (extra = {}) => ({
    id: "m1",
    funcionario_id: "f1",
    curso_id: "c1",
    status: "concluido",
    deleted_at: null,
    ...extra,
  });

  it("escolha explícita vale para todos; só o eventual leva o motivo", () => {
    const base = { funcionarioId: "f1", cursoId: "c1", matriculas: [concluida()] };
    expect(tipoDaNovaMatricula({ ...base, tipo: "inicial", motivo: "x" })).toEqual({
      tipo: "inicial",
      motivo_eventual: null,
    });
    expect(tipoDaNovaMatricula({ ...base, tipo: "periodico" })).toEqual({
      tipo: "periodico",
      motivo_eventual: null,
    });
    expect(
      tipoDaNovaMatricula({ ...base, tipo: "eventual", motivo: "Retorno de afastamento" })
    ).toEqual({
      tipo: "eventual",
      motivo_eventual: "Retorno de afastamento",
    });
  });

  it("automático: periódico para quem já concluiu este curso antes, inicial para quem nunca o fez", () => {
    const auto = (matriculas, funcionarioId = "f1", cursoId = "c1") =>
      tipoDaNovaMatricula({ tipo: TIPO_AUTOMATICO, funcionarioId, cursoId, matriculas }).tipo;
    expect(auto([concluida()])).toBe("periodico");
    expect(auto([])).toBe("inicial");
    // matrícula aberta, de outro curso, de outra pessoa ou excluída não faz dele um periódico
    expect(auto([concluida({ status: "em_andamento" })])).toBe("inicial");
    expect(auto([concluida({ curso_id: "c2" })])).toBe("inicial");
    expect(auto([concluida({ funcionario_id: "f2" })])).toBe("inicial");
    expect(auto([concluida({ deleted_at: "2026-10-01T00:00:00Z" })])).toBe("inicial");
    // certificado vencido ou revogado: ele continua tendo feito o curso antes
    expect(auto([concluida({ proxima_renovacao: "2020-01-01" })])).toBe("periodico");
  });

  it("sem escolha (undefined) é o automático; o motivo do automático é sempre nulo", () => {
    expect(
      tipoDaNovaMatricula({ funcionarioId: "f1", cursoId: "c1", matriculas: [], motivo: "sobrou" })
    ).toEqual({ tipo: "inicial", motivo_eventual: null });
  });
});

describe("o tipo no certificado e na consulta pública", () => {
  it("linhasDoTipoNoCertificado: certificado antigo (sem o tipo) não ganha linha nenhuma", () => {
    expect(linhasDoTipoNoCertificado({})).toEqual([]);
    expect(linhasDoTipoNoCertificado(null)).toEqual([]);
    expect(linhasDoTipoNoCertificado({ tipo_treinamento: "outro" })).toEqual([]);
  });

  it("linhasDoTipoNoCertificado: inicial e periódico em uma linha; eventual leva o motivo em outra", () => {
    expect(linhasDoTipoNoCertificado({ tipo_treinamento: "inicial" })).toEqual([
      "Tipo de treinamento: Inicial",
    ]);
    expect(linhasDoTipoNoCertificado({ tipo_treinamento: "periodico" })).toEqual([
      "Tipo de treinamento: Periódico",
    ]);
    expect(
      linhasDoTipoNoCertificado({
        tipo_treinamento: "eventual",
        motivo_eventual: "Mudança de procedimento",
      })
    ).toEqual(["Tipo de treinamento: Eventual", "Motivo: Mudança de procedimento"]);
    // motivo no inicial vindo de um registro adulterado não sai impresso
    expect(
      linhasDoTipoNoCertificado({ tipo_treinamento: "inicial", motivo_eventual: "não deve sair" })
    ).toEqual(["Tipo de treinamento: Inicial"]);
  });

  it("tipoPublicoDoCertificado: a consulta pública só aceita o que a regra do servidor aceita", () => {
    expect(tipoPublicoDoCertificado({ tipo_treinamento: "periodico" })).toEqual({
      tipo: "periodico",
      rotulo: "Periódico",
      motivo: null,
    });
    expect(
      tipoPublicoDoCertificado({ tipo_treinamento: "eventual", motivo_eventual: " Ocorrência " })
    ).toEqual({ tipo: "eventual", rotulo: "Eventual", motivo: "Ocorrência" });
    expect(tipoPublicoDoCertificado({ tipo_treinamento: "eventual" })).toEqual({
      tipo: "eventual",
      rotulo: "Eventual",
      motivo: null,
    });
    expect(tipoPublicoDoCertificado({})).toBeNull();
    expect(tipoPublicoDoCertificado(undefined)).toBeNull();
    expect(tipoPublicoDoCertificado({ tipo_treinamento: "x" })).toBeNull();
  });

  it("textoDoTipoDaMatricula: a tela do RH mostra o tipo (e o motivo do eventual)", () => {
    expect(textoDoTipoDaMatricula({ tipo: "inicial" })).toBe("Inicial");
    expect(textoDoTipoDaMatricula({ tipo: "periodico" })).toBe("Periódico");
    expect(textoDoTipoDaMatricula({ tipo: "eventual", motivo_eventual: "Acidente" })).toBe(
      "Eventual: Acidente"
    );
    // matrícula lida antes da migração (sem a coluna): não afirma nada
    expect(textoDoTipoDaMatricula({})).toBe("");
    expect(textoDoTipoDaMatricula(null)).toBe("");
  });
});
