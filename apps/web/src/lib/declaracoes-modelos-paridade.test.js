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
  it("preencherModelo com $&, $1, $$ e {variavel} no valor dá o mesmo", () => {
    const vars = { empresa: "A$&B $1 $$ {cnpj} $` $'", cnpj: "9", cpf: "  " };
    const texto = "{empresa} {cnpj} {cpf} {x}";
    expect(tela.preencherModelo(texto, vars)).toEqual(servidor.preencherModelo(texto, vars));
  });
  it("a chave do texto do edital: tela e servidor calculam a mesma, inclusive em título longo", () => {
    const titulos = [
      "Declaração do Anexo V — Visita Técnica",
      "Declaração de Visita Técnica",
      "Declaração do Anexo V - Visita Técnica ao local da obra - Lote 1",
      "Declaração do Anexo V - Visita Técnica ao local da obra - Lote 2",
      "Cônjuge: ÇÃO, ÉÍÓÚ, àêõ — nº 5/2026 (obra de iluminação pública, praça central e avenida)",
      `${"a".repeat(30)} ${"b".repeat(20)}`,
      "x".repeat(40),
      "x".repeat(41),
      "a".repeat(100),
      "  !!  ",
      "!!!",
      "",
      "1ª visita",
    ];
    for (const t of titulos) {
      const doServidor = servidor.chaveDoItem({ tipo: "texto", titulo: t, texto: "x" });
      expect(`edital_${tela.chaveDoTitulo(t) || "declaracao"}`).toBe(doServidor);
    }
    expect(tela.chaveDoTitulo("")).toBe("");
    expect(servidor.chaveDoItem({ tipo: "texto", titulo: "", texto: "x" })).toBe(
      "edital_declaracao"
    );
  });
});
