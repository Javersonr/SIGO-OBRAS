import { describe, it, expect } from "vitest";
import { validarNumerosDoCurso } from "./ead-curso-numeros";

// A6 (T32): os números do curso são conferidos antes de gravar, com a mensagem da tela. Sem isto, nota fora de
// 0-100 ou carga/validade negativa voltavam como o texto cru do Postgres ("new row for relation ... violates
// check constraint ..."), e carga com vírgula ("1,5") como "invalid input syntax for type integer".
const ok = (curso) => validarNumerosDoCurso(curso);
const erro = (curso) => {
  const r = validarNumerosDoCurso(curso);
  expect(r.ok).toBe(false);
  return r;
};

describe("validarNumerosDoCurso", () => {
  it("curso com os números de sempre passa (e o formulário vazio também: valem os padrões)", () => {
    expect(ok({ nota_minima: 70, max_tentativas: 3, intervalo_tentativa_min: 30 })).toEqual({
      ok: true,
    });
    expect(ok({ carga_horaria_horas: "40", validade_meses: "24", nota_minima: "70" })).toEqual({
      ok: true,
    });
    expect(ok({})).toEqual({ ok: true });
    expect(
      ok({
        nota_minima: "",
        max_tentativas: "",
        intervalo_tentativa_min: null,
        carga_horaria_horas: "",
        validade_meses: undefined,
      })
    ).toEqual({ ok: true });
  });

  describe("nota mínima: inteiro de 0 a 100", () => {
    it("os limites valem", () => {
      for (const v of [0, "0", 100, "100", 70])
        expect(ok({ nota_minima: v }).ok, String(v)).toBe(true);
    });
    it("fora de 0-100, decimal ou texto: erro com o nome do campo", () => {
      for (const v of [101, "150", -1, "-5", 70.5, "abc"]) {
        const r = erro({ nota_minima: v });
        expect(r.campo, String(v)).toBe("nota_minima");
        expect(r.erro, String(v)).toMatch(/nota mínima/i);
        expect(r.erro, String(v)).toMatch(/0 a 100/);
        expect(r.erro, String(v)).not.toMatch(/violates|check constraint|invalid input/i);
      }
    });
  });

  describe("tentativas e intervalo: inteiro, 0 ou mais", () => {
    it("0 vale (sem limite / sem espera)", () => {
      expect(ok({ max_tentativas: 0, intervalo_tentativa_min: 0 }).ok).toBe(true);
      expect(ok({ max_tentativas: "0", intervalo_tentativa_min: "0" }).ok).toBe(true);
    });
    it("negativo ou decimal: erro", () => {
      for (const v of [-1, "-3", 1.5]) {
        const t = erro({ max_tentativas: v });
        expect(t.campo).toBe("max_tentativas");
        expect(t.erro).toMatch(/tentativas/i);
        const i = erro({ intervalo_tentativa_min: v });
        expect(i.campo).toBe("intervalo_tentativa_min");
        expect(i.erro).toMatch(/intervalo/i);
      }
    });
  });

  describe("carga horária: inteiro maior que zero (curso sem vínculo com o cadastro central)", () => {
    it("vazia vale (curso sem carga é pendência de requisito); positiva vale", () => {
      expect(ok({ carga_horaria_horas: "" }).ok).toBe(true);
      expect(ok({ carga_horaria_horas: 8 }).ok).toBe(true);
    });
    it("zero, negativa, decimal ou texto: erro, e a mensagem diz o que fazer", () => {
      for (const v of [0, "0", -4, "-1", 1.5, "1,5", "abc"]) {
        const r = erro({ carga_horaria_horas: v });
        expect(r.campo, String(v)).toBe("carga_horaria_horas");
        expect(r.erro, String(v)).toMatch(/carga horária/i);
        expect(r.erro, String(v)).toMatch(/maior que zero/i);
      }
    });
  });

  describe("validade: inteiro de meses, 0 ou mais (curso sem vínculo com o cadastro central)", () => {
    it("vazia, 0 (não vence) e positiva valem", () => {
      for (const v of ["", 0, "0", 12, "24"])
        expect(ok({ validade_meses: v }).ok, String(v)).toBe(true);
    });
    it("negativa, decimal ou texto: erro", () => {
      for (const v of [-1, "-12", 1.5, "doze"]) {
        const r = erro({ validade_meses: v });
        expect(r.campo, String(v)).toBe("validade_meses");
        expect(r.erro, String(v)).toMatch(/validade/i);
        expect(r.erro, String(v)).toMatch(/0 ou mais/);
      }
    });
  });

  it("curso ligado ao cadastro central: carga e validade são dele (campos travados), então não se confere aqui", () => {
    // o gatilho do banco as sobrescreve a cada gravação; um valor sem sentido herdado do modelo não pode travar
    // a edição do instrutor, por exemplo
    expect(ok({ modelo_treinamento_id: "m1", carga_horaria_horas: 0, validade_meses: -3 })).toEqual(
      { ok: true }
    );
    // o resto continua valendo
    expect(erro({ modelo_treinamento_id: "m1", nota_minima: 120 }).campo).toBe("nota_minima");
  });

  it("devolve o primeiro problema, na ordem da tela, e nunca lança com entrada ausente", () => {
    expect(erro({ validade_meses: -1, nota_minima: 200 }).campo).toBe("nota_minima");
    expect(() => validarNumerosDoCurso(null)).not.toThrow();
    expect(validarNumerosDoCurso(undefined)).toEqual({ ok: true });
  });
});
