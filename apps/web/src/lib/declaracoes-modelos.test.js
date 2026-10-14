import { describe, it, expect } from "vitest";
import {
  chaveDoTitulo,
  MODELOS_PADRAO,
  modelosDaEmpresa,
  preencherModelo,
  validarModelo,
} from "./declaracoes-modelos";

const TITULO_LOTE_1 = "Declaração do Anexo V - Visita Técnica ao local da obra - Lote 1";
const TITULO_LOTE_2 = "Declaração do Anexo V - Visita Técnica ao local da obra - Lote 2";

describe("modelos de declaração (tela)", () => {
  it("chaveDoTitulo: minúsculas, sem acento, até 40", () => {
    expect(chaveDoTitulo("Declaração de Visita Técnica")).toBe("declaracao_de_visita_tecnica");
    expect(chaveDoTitulo("  !!  ")).toBe("");
    expect(chaveDoTitulo("a".repeat(80)).length).toBe(40);
    expect(chaveDoTitulo("x".repeat(40))).toBe("x".repeat(40));
  });
  it("chaveDoTitulo: títulos longos que só diferem no fim não colidem", () => {
    const c1 = chaveDoTitulo(TITULO_LOTE_1);
    const c2 = chaveDoTitulo(TITULO_LOTE_2);
    expect(c1).not.toBe(c2);
    for (const c of [c1, c2]) {
      expect(c.length).toBeLessThanOrEqual(40);
      expect(c).toMatch(/^[a-z0-9_]+$/);
      expect(c).not.toMatch(/__/);
      expect(c).not.toMatch(/_$/);
    }
    // 31 primeiros + "_" + FNV-1a de 32 bits do título normalizado inteiro (mesmos valores do servidor)
    expect(c1).toBe("declaracao_do_anexo_v_visita_te_9a27f3e9");
    expect(c2).toBe("declaracao_do_anexo_v_visita_te_9727ef30");
    expect(chaveDoTitulo("a".repeat(100))).toBe(`${"a".repeat(31)}_0a0bb1d9`);
    expect(chaveDoTitulo("x".repeat(41))).toBe(`${"x".repeat(31)}_fb64f7a7`);
    // o 31º caractere é um "_": o "_" do fim do corte sai antes de juntar o hash
    expect(chaveDoTitulo(`${"a".repeat(30)} ${"b".repeat(20)}`)).toBe(`${"a".repeat(30)}_712a2dec`);
    // mesmo título, mesma chave
    expect(chaveDoTitulo(TITULO_LOTE_1)).toBe(c1);
    expect(chaveDoTitulo(`  ${TITULO_LOTE_1.toUpperCase()}!! `)).toBe(c1);
  });
  it("validarModelo: título, texto e chave única entre os modelos próprios", () => {
    expect(
      validarModelo({ chave: "me_epp", titulo: "ME/EPP", texto: "Texto {empresa}" }, [])
    ).toEqual({
      ok: true,
      erros: [],
      dados: { chave: "me_epp", titulo: "ME/EPP", texto: "Texto {empresa}", ativo: true },
    });
    expect(validarModelo({ chave: "", titulo: " ", texto: "" }, []).erros).toEqual([
      "Informe o título do modelo",
      "Escreva o texto da declaração",
    ]);
    expect(validarModelo({ chave: "nova", titulo: "Nova", texto: "x" }, ["nova"]).erros).toEqual([
      "Já existe um modelo com este título",
    ]);
    expect(
      validarModelo({ chave: "x1", titulo: "X", texto: "{porte} {empresa}" }, []).erros
    ).toEqual(["Variável desconhecida no texto: {porte}"]);
  });
  it("validarModelo: a chave calculada do título segue o CHECK do banco (letra inicial, 2 a 60)", () => {
    const aviso = "O título deve começar com uma letra e ter ao menos 2 caracteres";
    expect(validarModelo({ chave: "", titulo: "1ª visita", texto: "x" }, []).erros).toEqual([
      aviso,
    ]);
    expect(validarModelo({ chave: "", titulo: "X", texto: "x" }, []).erros).toEqual([aviso]);
    expect(validarModelo({ chave: "", titulo: "!!!", texto: "x" }, []).erros).toEqual([
      "Use letras no título",
    ]);
    const ok = validarModelo({ chave: "", titulo: "Visita técnica", texto: "x" }, []);
    expect(ok.ok).toBe(true);
    expect(ok.dados.chave).toBe("visita_tecnica");
  });
  it("validarModelo: modelo NOVO não cai em cima de um padrão pela chave do título", () => {
    const jaExiste = ["Já existe um modelo com este título"];
    // "ME/EPP" → me_epp, a chave de um dos seis padrão
    expect(validarModelo({ chave: "", titulo: "ME/EPP", texto: "x" }, []).erros).toEqual(jaExiste);
    expect(validarModelo({ chave: "", titulo: "Me  Epp", texto: "x" }, []).erros).toEqual(jaExiste);
    expect(validarModelo({ chave: "  ", titulo: "Reserva Cargos", texto: "x" }, []).erros).toEqual(
      jaExiste
    );
    for (const padrao of MODELOS_PADRAO) {
      const form = { chave: "", titulo: padrao.chave.replace(/_/g, " "), texto: "x" };
      expect(validarModelo(form, []).erros).toEqual(jaExiste);
    }
    // editar o padrão (chave preenchida) continua valendo
    expect(validarModelo({ chave: "me_epp", titulo: "ME/EPP", texto: "x" }, [])).toEqual({
      ok: true,
      erros: [],
      dados: { chave: "me_epp", titulo: "ME/EPP", texto: "x", ativo: true },
    });
    // título parecido, mas outra chave: passa
    expect(validarModelo({ chave: "", titulo: "ME/EPP 2", texto: "x" }, []).ok).toBe(true);
  });
  it("validarModelo: chave começando com edital_ é reservada aos textos do edital", () => {
    const erro = ['O título não pode começar com "edital"'];
    expect(validarModelo({ chave: "", titulo: "Edital 5", texto: "x" }, []).erros).toEqual(erro);
    expect(validarModelo({ chave: "", titulo: "EDITAL - Anexo V", texto: "x" }, []).erros).toEqual(
      erro
    );
    expect(
      validarModelo({ chave: "", titulo: "Edital: visita técnica", texto: "x" }, []).erros
    ).toEqual(erro);
    // "edital" sozinho, ou uma palavra que só começa com as mesmas letras, não colide com "edital_..."
    expect(validarModelo({ chave: "", titulo: "Edital", texto: "x" }, []).ok).toBe(true);
    expect(validarModelo({ chave: "", titulo: "Editalício", texto: "x" }, []).ok).toBe(true);
    expect(validarModelo({ chave: "", titulo: "Declaração do edital", texto: "x" }, []).ok).toBe(
      true
    );
  });
  it("modelosDaEmpresa devolve os seis padrão sem linhas", () => {
    expect(modelosDaEmpresa([])).toEqual(MODELOS_PADRAO.map((m) => ({ ...m })));
  });
  it("MODELOS_PADRAO é imutável e modelosDaEmpresa devolve objetos novos", () => {
    expect(Object.isFrozen(MODELOS_PADRAO)).toBe(true);
    for (const padrao of MODELOS_PADRAO) expect(Object.isFrozen(padrao)).toBe(true);
    expect(() => {
      MODELOS_PADRAO[0].chave = "alterada";
    }).toThrow(TypeError);
    const copias = modelosDaEmpresa([]);
    copias.forEach((copia, i) => expect(copia).not.toBe(MODELOS_PADRAO[i]));
    copias[0].texto = "mexido por quem chamou";
    expect(MODELOS_PADRAO[0].texto).not.toBe("mexido por quem chamou");
    expect(modelosDaEmpresa([])[0].texto).not.toBe("mexido por quem chamou");
  });
  it("preencherModelo: o valor entra literal ($&, $1, $$ e {variavel} dentro dele não são reprocessados)", () => {
    const vars = { empresa: "A$&B $1 $$ {cnpj} $` $'", cnpj: "11.222.333/0001-81" };
    expect(preencherModelo("{empresa}, CNPJ {cnpj}.", vars)).toEqual({
      texto: "A$&B $1 $$ {cnpj} $` $', CNPJ 11.222.333/0001-81.",
      sem_valor: [],
      desconhecidas: [],
    });
  });
});
