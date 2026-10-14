/** Paridade dos modelos de declaração: a tela (declaracoes-modelos.js) e o servidor (declaracoes.ts). */
import { describe, it, expect } from "vitest";
import * as tela from "./declaracoes-modelos";
import * as servidor from "../../../../supabase/functions/_shared/documentos/declaracoes.ts";

describe("paridade tela × servidor", () => {
  it("mesmos modelos padrão, variáveis e limites", () => {
    expect(tela.MODELOS_PADRAO).toEqual(servidor.MODELOS_PADRAO);
    expect(tela.VARIAVEIS_DECLARACAO).toEqual(servidor.VARIAVEIS_DECLARACAO);
    expect(tela.LIMITE_TEXTO_DECLARACAO).toBe(servidor.LIMITE_TEXTO_DECLARACAO);
    expect(tela.LIMITE_TITULO_DECLARACAO).toBe(servidor.LIMITE_TITULO_DECLARACAO);
  });
  it("modelosDaEmpresa e preencherModelo dão o mesmo", () => {
    const linhas = [
      { chave: "me_epp", titulo: "Z", texto: "T {empresa}", ativo: true, ordem: 9 },
      { chave: "fato_impeditivo", titulo: "x", texto: "y", ativo: false },
      { chave: "propria", titulo: "Ação", texto: "{cpf} {x}", ativo: true, ordem: null },
    ];
    expect(tela.modelosDaEmpresa(linhas)).toEqual(servidor.modelosDaEmpresa(linhas));
    const vars = { empresa: "E", cnpj: "", cpf: "1" };
    for (const m of [...servidor.MODELOS_PADRAO, ...linhas]) {
      expect(tela.preencherModelo(m.texto, vars)).toEqual(servidor.preencherModelo(m.texto, vars));
    }
  });
});
