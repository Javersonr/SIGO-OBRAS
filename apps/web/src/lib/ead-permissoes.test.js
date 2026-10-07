import { describe, it, expect } from "vitest";
import {
  ABA_EAD,
  FUNCOES_EAD,
  MODULO_SST,
  NENHUMA_PERMISSAO_EAD,
  dadosDoCursoParaGravar,
  dicaDoPublicado,
  permissoesEad,
  podeSalvarCurso,
} from "./ead-permissoes";

/**
 * T33: a tela espelha as funções da aba "Treinamentos EAD" (quem protege é o banco e o servidor). Aqui só a regra
 * pura: o objeto de permissões, o que o "Salvar curso" grava para cada combinação e a dica da chave Publicado.
 */

// um temPermissao como o do Layout, a partir de um mapa { "aba": { funcao: true } } do módulo Segurança do Trabalho
const temPermissaoDe =
  (abas, { admin = false } = {}) =>
  (modulo, aba = null, funcao = null) => {
    if (admin) return true;
    if (modulo !== "Segurança do Trabalho") return false;
    const daAba = abas[aba];
    if (!aba) return Object.values(abas).some((a) => Object.values(a).some((v) => v === true));
    if (!funcao) return !!daAba && Object.values(daAba).some((v) => v === true);
    return daAba?.[funcao] === true;
  };

describe("nomes", () => {
  it("o módulo, a aba e as 7 funções são os do editor de permissões (ESTRUTURA_PERMISSOES)", () => {
    expect(MODULO_SST).toBe("Segurança do Trabalho");
    expect(ABA_EAD).toBe("Treinamentos EAD");
    expect(FUNCOES_EAD).toEqual([
      "visualizar",
      "editar",
      "publicar",
      "matricular",
      "liberar_tentativa",
      "revogar_certificado",
      "responder_duvidas",
    ]);
  });
});

describe("permissoesEad", () => {
  it("Admin (temPermissao sempre true) pode tudo, inclusive criar o acesso ao portal", () => {
    const pode = permissoesEad(temPermissaoDe({}, { admin: true }));
    expect(Object.values(pode).every((v) => v === true)).toBe(true);
  });

  it("sem a aba: nada (nem ver a aba), mesmo com Funcionários", () => {
    const pode = permissoesEad(
      temPermissaoDe({ Funcionários: { visualizar: true, editar: true } })
    );
    expect(pode).toEqual({ ...NENHUMA_PERMISSAO_EAD, criarAcessoPortal: true });
    expect(pode.visualizar).toBe(false);
  });

  it("ver a aba é ter QUALQUER função dela (quem só edita vê o que edita)", () => {
    expect(permissoesEad(temPermissaoDe({ [ABA_EAD]: { editar: true } })).visualizar).toBe(true);
    expect(permissoesEad(temPermissaoDe({ [ABA_EAD]: { matricular: true } })).visualizar).toBe(
      true
    );
    expect(permissoesEad(temPermissaoDe({ [ABA_EAD]: { editar: false } })).visualizar).toBe(false);
  });

  it("cada função libera só a sua chave", () => {
    const chaves = {
      editar: "editar",
      publicar: "publicar",
      matricular: "matricular",
      liberar_tentativa: "liberarTentativa",
      revogar_certificado: "revogarCertificado",
      responder_duvidas: "responderDuvidas",
    };
    for (const [funcao, chave] of Object.entries(chaves)) {
      const pode = permissoesEad(temPermissaoDe({ [ABA_EAD]: { [funcao]: true } }));
      expect(pode).toEqual({ ...NENHUMA_PERMISSAO_EAD, visualizar: true, [chave]: true });
    }
  });

  it("criar o acesso ao portal é Funcionários → Editar (P3 = C1), não a aba nova", () => {
    expect(
      permissoesEad(temPermissaoDe({ [ABA_EAD]: { matricular: true } })).criarAcessoPortal
    ).toBe(false);
    expect(
      permissoesEad(temPermissaoDe({ Funcionários: { visualizar: true } })).criarAcessoPortal
    ).toBe(false);
    expect(
      permissoesEad(temPermissaoDe({ Funcionários: { editar: true } })).criarAcessoPortal
    ).toBe(true);
  });

  it("sem temPermissao (tela ainda carregando): nada", () => {
    expect(permissoesEad(undefined)).toEqual(NENHUMA_PERMISSAO_EAD);
    expect(permissoesEad(null)).toEqual(NENHUMA_PERMISSAO_EAD);
  });

  it("um temPermissao que lança não derruba a tela: conta como sem permissão", () => {
    const pode = permissoesEad(() => {
      throw new Error("vínculo ainda não carregou");
    });
    expect(pode).toEqual(NENHUMA_PERMISSAO_EAD);
  });
});

describe("podeSalvarCurso", () => {
  const pode = (extra) => ({ ...NENHUMA_PERMISSAO_EAD, visualizar: true, ...extra });
  it("curso novo só com Editar; curso existente com Editar ou Publicar", () => {
    expect(podeSalvarCurso(pode({ editar: true }), { novo: true })).toBe(true);
    expect(podeSalvarCurso(pode({ publicar: true }), { novo: true })).toBe(false);
    expect(podeSalvarCurso(pode({ publicar: true }), { novo: false })).toBe(true);
    expect(podeSalvarCurso(pode({ editar: true }), { novo: false })).toBe(true);
    expect(podeSalvarCurso(pode({}), { novo: false })).toBe(false);
    expect(podeSalvarCurso(pode({ matricular: true }), { novo: false })).toBe(false);
  });
});

describe("dadosDoCursoParaGravar", () => {
  const dados = { empresa_id: "e1", nome: "Curso", nota_minima: 70, ativo: true };
  const pode = (extra) => ({ ...NENHUMA_PERMISSAO_EAD, visualizar: true, ...extra });

  it("Editar e Publicar: grava tudo, como antes", () => {
    expect(
      dadosDoCursoParaGravar(dados, pode({ editar: true, publicar: true }), { novo: false })
    ).toEqual(dados);
    expect(
      dadosDoCursoParaGravar(dados, pode({ editar: true, publicar: true }), { novo: true })
    ).toEqual(dados);
  });

  it("só Editar: curso existente não leva a chave Publicado (fica como está no banco)", () => {
    const r = dadosDoCursoParaGravar(dados, pode({ editar: true }), { novo: false });
    expect(r).toEqual({ empresa_id: "e1", nome: "Curso", nota_minima: 70 });
    expect(Object.hasOwn(r, "ativo")).toBe(false);
  });

  it("só Editar: curso novo nasce rascunho (publicar exige Publicar)", () => {
    expect(dadosDoCursoParaGravar(dados, pode({ editar: true }), { novo: true })).toEqual({
      ...dados,
      ativo: false,
    });
  });

  it("só Publicar: grava só a chave Publicado de um curso existente; curso novo não", () => {
    expect(dadosDoCursoParaGravar(dados, pode({ publicar: true }), { novo: false })).toEqual({
      ativo: true,
    });
    expect(
      dadosDoCursoParaGravar({ ...dados, ativo: false }, pode({ publicar: true }), { novo: false })
    ).toEqual({ ativo: false });
    expect(dadosDoCursoParaGravar(dados, pode({ publicar: true }), { novo: true })).toBeNull();
  });

  it("sem Editar nem Publicar: nada a gravar", () => {
    expect(dadosDoCursoParaGravar(dados, pode({ matricular: true }), { novo: false })).toBeNull();
    expect(dadosDoCursoParaGravar(dados, NENHUMA_PERMISSAO_EAD, { novo: true })).toBeNull();
  });

  it("não muda o objeto recebido", () => {
    const copia = { ...dados };
    dadosDoCursoParaGravar(dados, pode({ editar: true }), { novo: false });
    expect(dados).toEqual(copia);
  });
});

describe("dicaDoPublicado", () => {
  it("quem não publica vê o porquê; quem publica, nada", () => {
    expect(dicaDoPublicado({ ...NENHUMA_PERMISSAO_EAD, editar: true })).toBe(
      "Publicar exige a permissão Treinamentos EAD → Publicar"
    );
    expect(dicaDoPublicado({ ...NENHUMA_PERMISSAO_EAD, publicar: true })).toBeNull();
  });
});
