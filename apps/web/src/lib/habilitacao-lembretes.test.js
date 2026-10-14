import { describe, it, expect } from "vitest";
import { configPadrao, lerConfig, validarConfig } from "./habilitacao-lembretes";

describe("lembretes de habilitação", () => {
  it("configPadrao: 10 dias, ninguém escolhido, WhatsApp desligado", () => {
    expect(configPadrao()).toEqual({ dias_antecedencia: 10, destinatarios: [], whatsapp: false });
  });
  it("lerConfig: linha do banco → formulário (lista como string JSON do legado também vale)", () => {
    expect(lerConfig(null)).toEqual(configPadrao());
    expect(
      lerConfig({
        dias_antecedencia: 15,
        destinatarios: '["A@x.test"," b@x.test "]',
        whatsapp: true,
      })
    ).toEqual({
      dias_antecedencia: 15,
      destinatarios: ["a@x.test", "b@x.test"],
      whatsapp: true,
    });
  });
  it("validarConfig: dias de 1 a 90 e e-mails só de usuários ativos da empresa", () => {
    const usuarios = [{ usuario_email: "A@x.test" }, { usuario_email: "b@x.test" }];
    expect(
      validarConfig(
        { dias_antecedencia: "7", destinatarios: ["a@x.test", "fora@x.test"], whatsapp: true },
        usuarios
      )
    ).toEqual({
      ok: true,
      erros: [],
      dados: { dias_antecedencia: 7, destinatarios: ["a@x.test"], whatsapp: true },
    });
    expect(
      validarConfig({ dias_antecedencia: 0, destinatarios: [], whatsapp: false }, usuarios).erros
    ).toEqual(["Dias de antecedência: de 1 a 90"]);
    expect(
      validarConfig({ dias_antecedencia: "x", destinatarios: [], whatsapp: false }, usuarios).ok
    ).toBe(false);
  });
  it("bordas: 1 e 90 valem; 91, decimal e vazio não; e-mail repetido entra uma vez; lista inválida vira vazia", () => {
    const usuarios = [{ usuario_email: "a@x.test" }];
    const dias = (v) => validarConfig({ dias_antecedencia: v, destinatarios: [] }, usuarios);
    expect([dias(1).ok, dias("90").ok, dias(90).dados.dias_antecedencia]).toEqual([true, true, 90]);
    expect([dias(91).ok, dias("7.5").ok, dias("").ok, dias(null).ok, dias(7.5).ok]).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(
      validarConfig({ dias_antecedencia: 5, destinatarios: ["a@x.test", " A@X.TEST "] }, usuarios)
        .dados.destinatarios
    ).toEqual(["a@x.test"]);
    expect(lerConfig({ destinatarios: '{"a":1}' }).destinatarios).toEqual([]);
    expect(lerConfig({ destinatarios: "isto não é JSON" }).destinatarios).toEqual([]);
    expect(lerConfig({ dias_antecedencia: 0, destinatarios: [] }).dias_antecedencia).toBe(10);
    expect(validarConfig(null, null).ok).toBe(false);
  });
});
