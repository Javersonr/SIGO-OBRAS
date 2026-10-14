import { describe, it, expect } from "vitest";
import {
  chaveDoTitulo,
  mensagemDeErroAoSalvarModelo,
  MODELOS_PADRAO,
  modelosDaEmpresa,
  modelosParaEditor,
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

describe("mensagemDeErroAoSalvarModelo (recusas do banco, 0156)", () => {
  const erro = (message, code) => ({ message, code });
  it("chave repetida entre os modelos vivos da empresa (23505)", () => {
    expect(
      mensagemDeErroAoSalvarModelo(
        erro(
          'duplicate key value violates unique constraint "modelo_declaracao_chave_uidx"',
          "23505"
        )
      )
    ).toBe(
      "Já existe um modelo com este título (talvez criado agora por outra pessoa). Atualize a página e confira a lista."
    );
  });
  it("CHECK da chave e chave reservada (edital_)", () => {
    expect(
      mensagemDeErroAoSalvarModelo(
        erro(
          'new row for relation "modelo_declaracao" violates check constraint "modelo_declaracao_chave_check"'
        )
      )
    ).toBe("O título deve começar com uma letra e ter ao menos 2 caracteres");
    expect(
      mensagemDeErroAoSalvarModelo(
        erro(
          'new row for relation "modelo_declaracao" violates check constraint "modelo_declaracao_chave_reservada_chk"'
        )
      )
    ).toBe('O título não pode começar com "edital"');
  });
  it("CHECK do título e do texto (tamanho e texto em branco)", () => {
    expect(
      mensagemDeErroAoSalvarModelo(
        erro(
          'new row for relation "modelo_declaracao" violates check constraint "modelo_declaracao_titulo_check"'
        )
      )
    ).toBe("Título: informe de 1 a 200 caracteres, com ao menos uma letra ou número");
    expect(
      mensagemDeErroAoSalvarModelo(
        erro(
          'new row for relation "modelo_declaracao" violates check constraint "modelo_declaracao_texto_check"'
        )
      )
    ).toBe("Texto: informe de 1 a 20.000 caracteres, sem deixar a declaração em branco");
  });
  it("permissão: RLS ou permission denied", () => {
    const esperado =
      "Você não tem permissão para gravar os modelos (Oportunidades → Lista → editar).";
    expect(
      mensagemDeErroAoSalvarModelo(
        erro('new row violates row-level security policy for table "modelo_declaracao"', "42501")
      )
    ).toBe(esperado);
    expect(
      mensagemDeErroAoSalvarModelo(erro("permission denied for table modelo_declaracao", "42501"))
    ).toBe(esperado);
  });
  it("alterar uma linha que sumiu ou que a RLS esconde (PGRST116)", () => {
    const esperado =
      "Este modelo não existe mais, ou você não pode alterá-lo. Atualize a página e confira a lista.";
    expect(
      mensagemDeErroAoSalvarModelo(
        erro("JSON object requested, multiple (or no) rows returned", "PGRST116")
      )
    ).toBe(esperado);
    expect(
      mensagemDeErroAoSalvarModelo(erro("Cannot coerce the result to a single JSON object"))
    ).toBe(esperado);
  });
  it("qualquer outra: 'Erro ao salvar' com a mensagem quando houver", () => {
    expect(mensagemDeErroAoSalvarModelo(erro("falha de rede"))).toBe(
      "Erro ao salvar: falha de rede"
    );
    expect(mensagemDeErroAoSalvarModelo(new Error("boom"))).toBe("Erro ao salvar: boom");
    expect(mensagemDeErroAoSalvarModelo({})).toBe("Erro ao salvar");
    expect(mensagemDeErroAoSalvarModelo(null)).toBe("Erro ao salvar");
    expect(mensagemDeErroAoSalvarModelo(undefined)).toBe("Erro ao salvar");
  });
});

describe("modelosParaEditor (lista do cartão Modelos de declaração)", () => {
  const ID_1 = "00000000-0000-4000-8000-000000000001";
  const ID_2 = "00000000-0000-4000-8000-000000000002";
  const ID_3 = "00000000-0000-4000-8000-000000000003";
  const ID_4 = "00000000-0000-4000-8000-000000000004";

  it("sem linhas: os seis padrão, na ordem do código, sem id e com a situação 'padrao'", () => {
    const lista = modelosParaEditor([]);
    expect(lista.map((m) => m.chave)).toEqual(MODELOS_PADRAO.map((m) => m.chave));
    for (const [i, item] of lista.entries()) {
      expect(item).toEqual({
        chave: MODELOS_PADRAO[i].chave,
        titulo: MODELOS_PADRAO[i].titulo,
        texto: MODELOS_PADRAO[i].texto,
        ativo: true,
        ordem: MODELOS_PADRAO[i].ordem,
        padrao: true,
        id: null,
        situacao: "padrao",
      });
    }
    // aceita entrada que não é lista
    expect(modelosParaEditor(undefined)).toHaveLength(6);
    expect(modelosParaEditor(null)).toHaveLength(6);
  });
  it("linha com a chave de um padrão: 'editado', com o título e o texto da linha", () => {
    const lista = modelosParaEditor([
      {
        id: ID_1,
        chave: "me_epp",
        titulo: "ME/EPP da casa",
        texto: "Texto {empresa}",
        ativo: true,
        ordem: 3,
      },
    ]);
    expect(lista).toHaveLength(6);
    const item = lista.find((m) => m.chave === "me_epp");
    expect(item).toEqual({
      chave: "me_epp",
      titulo: "ME/EPP da casa",
      texto: "Texto {empresa}",
      ativo: true,
      ordem: 3,
      padrao: true,
      id: ID_1,
      situacao: "editado",
    });
    // a posição continua a do padrão
    expect(lista.map((m) => m.chave)).toEqual(MODELOS_PADRAO.map((m) => m.chave));
    // os outros cinco seguem 'padrao'
    expect(lista.filter((m) => m.situacao === "padrao")).toHaveLength(5);
  });
  it("linha de padrão com ativo = false: 'desativado' (continua na lista, e ordem nula cai na do padrão)", () => {
    const lista = modelosParaEditor([
      { id: ID_2, chave: "reserva_cargos", titulo: "T", texto: "X", ativo: false, ordem: null },
    ]);
    const item = lista.find((m) => m.chave === "reserva_cargos");
    expect(item.situacao).toBe("desativado");
    expect(item.ativo).toBe(false);
    expect(item.padrao).toBe(true);
    expect(item.id).toBe(ID_2);
    expect(item.ordem).toBe(5);
  });
  it("modelos próprios vêm depois dos padrão, por ordem (nula por último) e título", () => {
    const lista = modelosParaEditor([
      {
        id: ID_1,
        chave: "visita_tecnica",
        titulo: "Visita técnica",
        texto: "A",
        ativo: true,
        ordem: null,
      },
      { id: ID_2, chave: "anexo_v", titulo: "Anexo V", texto: "B", ativo: true, ordem: null },
      { id: ID_3, chave: "primeiro", titulo: "Zeta", texto: "C", ativo: true, ordem: 10 },
      { id: ID_4, chave: "inativo", titulo: "Antigo", texto: "D", ativo: false, ordem: 11 },
    ]);
    expect(lista.slice(0, 6).every((m) => m.padrao)).toBe(true);
    const proprios = lista.slice(6);
    expect(proprios.map((m) => m.chave)).toEqual([
      "primeiro",
      "inativo",
      "anexo_v",
      "visita_tecnica",
    ]);
    expect(proprios.map((m) => m.situacao)).toEqual([
      "proprio",
      "desativado",
      "proprio",
      "proprio",
    ]);
    for (const m of proprios) expect(m.padrao).toBe(false);
    expect(proprios[0].id).toBe(ID_3);
  });
  it("ignora linha sem chave e não mexe em MODELOS_PADRAO nem na lista recebida", () => {
    const linhas = [
      null,
      undefined,
      { id: ID_1, chave: "", titulo: "Sem chave", texto: "x", ativo: true },
      { id: ID_2, titulo: "Sem chave", texto: "x", ativo: true },
      { id: ID_3, chave: "me_epp", titulo: "Editado", texto: "y", ativo: true, ordem: 3 },
    ];
    const copia = JSON.stringify(linhas);
    const lista = modelosParaEditor(linhas);
    expect(lista).toHaveLength(6);
    expect(JSON.stringify(linhas)).toBe(copia);
    lista[0].texto = "mexido por quem chamou";
    expect(MODELOS_PADRAO[0].texto).not.toBe("mexido por quem chamou");
    expect(modelosParaEditor([])[0].texto).not.toBe("mexido por quem chamou");
  });
});
