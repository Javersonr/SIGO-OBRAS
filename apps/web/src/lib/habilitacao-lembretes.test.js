import { describe, it, expect } from "vitest";
import {
  candidatosDeLembrete,
  configPadrao,
  ehConfigDuplicada,
  lerConfig,
  validarConfig,
} from "./habilitacao-lembretes";

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
  it("candidatosDeLembrete: os usuários da RPC (nome e telefone) e os e-mails gravados que a lista não traz", () => {
    // as linhas de habilitacao_usuarios_da_empresa: usuario_email, nome e tem_telefone (nunca o telefone)
    const usuarios = [
      { usuario_email: "Ana@x.test", nome: "Ana Souza", tem_telefone: true },
      { usuario_email: "bia@x.test", nome: "  ", tem_telefone: false },
      { usuario_email: " ANA@x.test ", nome: "Ana repetida", tem_telefone: false },
      { usuario_email: "  ", nome: "Sem e-mail", tem_telefone: true },
      null,
    ];
    expect(candidatosDeLembrete(usuarios, ["bia@x.test", "Saiu@x.test", "saiu@x.test"])).toEqual([
      { email: "ana@x.test", nome: "Ana Souza", aviso: null },
      { email: "bia@x.test", nome: "bia@x.test", aviso: "sem telefone para o WhatsApp" },
      {
        email: "saiu@x.test",
        nome: "saiu@x.test",
        aviso: "não está mais entre os usuários ativos",
      },
    ]);
    // tem_telefone que não é true (nulo, texto) conta como sem telefone
    expect(
      candidatosDeLembrete([{ usuario_email: "c@x.test", nome: "Caio", tem_telefone: "sim" }], [])
    ).toEqual([{ email: "c@x.test", nome: "Caio", aviso: "sem telefone para o WhatsApp" }]);
    expect(candidatosDeLembrete(null, null)).toEqual([]);
  });
  it("candidatosDeLembrete: sem a lista de usuários (só leitura), os gravados aparecem sem nota", () => {
    expect(candidatosDeLembrete([], ["a@x.test"], { listaCarregada: false })).toEqual([
      { email: "a@x.test", nome: "a@x.test", aviso: null },
    ]);
    // o que candidatosDeLembrete devolve serve de `usuarios` para o validarConfig: o gravado não se perde
    const candidatos = candidatosDeLembrete(
      [{ usuario_email: "a@x.test", nome: "A", tem_telefone: true }],
      ["saiu@x.test"]
    );
    expect(
      validarConfig(
        { dias_antecedencia: 10, destinatarios: ["saiu@x.test", "a@x.test", "outro@x.test"] },
        candidatos.map((c) => ({ usuario_email: c.email }))
      ).dados.destinatarios
    ).toEqual(["saiu@x.test", "a@x.test"]);
  });
  it("ehConfigDuplicada: só a recusa do índice único da configuração da empresa", () => {
    expect(
      ehConfigDuplicada({
        code: "23505",
        message: 'duplicate key value violates unique constraint "habilitacao_config_empresa_uidx"',
      })
    ).toBe(true);
    expect(
      ehConfigDuplicada(new Error("new row violates row-level security policy for table"))
    ).toBe(false);
    expect(
      ehConfigDuplicada({
        code: "23505",
        message: 'duplicate key value violates unique constraint "outra_tabela_uidx"',
      })
    ).toBe(false);
    expect(ehConfigDuplicada(null)).toBe(false);
    expect(ehConfigDuplicada(undefined)).toBe(false);
  });
});
