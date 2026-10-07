import { describe, it, expect } from "vitest";
import {
  listaAnexosRH,
  validarPdfPortal,
  retirarDocumentoPortal,
  parametrosDaPublicacao,
  permissoesDocumentosPortal,
} from "./portal-documentos";

describe("documentos do portal", () => {
  const pdf = { name: "teste.pdf", type: "application/pdf", size: 100 };
  it("exige PDF, tamanho permitido e competência nos documentos mensais", () => {
    expect(validarPdfPortal(pdf, "contracheque", "2026-10")).toBeNull();
    expect(validarPdfPortal(pdf, "folha_ponto", "2026-13")).toBeTruthy();
    expect(validarPdfPortal(pdf, "documentacao", "")).toBeNull();
    expect(validarPdfPortal({ ...pdf, size: 0 }, "documentacao", "")).toBeTruthy();
    expect(validarPdfPortal({ ...pdf, size: 21 * 1024 * 1024 }, "documentacao", "")).toBeTruthy();
    expect(validarPdfPortal({ ...pdf, name: "arquivo.exe" }, "documentacao", "")).toBeTruthy();
  });
  it("aceita JSONB e strings legadas, e recusa objetos inválidos", () => {
    expect(listaAnexosRH('[{"nome":"legado"}]')).toHaveLength(1);
    for (const valor of [null, "{", {}, "null"]) expect(listaAnexosRH(valor)).toEqual([]);
  });
  it("retira só o item solicitado do próprio funcionário", () => {
    const doc = { id: "doc-teste", origem: "portal_funcionario", funcionario_id: "aluno-teste" };
    const outros = [
      { ...doc, funcionario_id: "outro-aluno" },
      { id: doc.id, origem: "legado" },
    ];
    expect(retirarDocumentoPortal([doc, ...outros], doc.id, "aluno-teste")).toEqual(outros);
  });
});

// T33 (P2 = aba RH): publicar e retirar passam pelas RPC da migração 0147, que montam o item no banco
describe("documentos do portal pelas RPC (T33)", () => {
  it("parâmetros da publicação: competência só nos mensais; o resto vai como veio", () => {
    expect(
      parametrosDaPublicacao({
        funcionarioId: "f1",
        tipo: "contracheque",
        competencia: "2026-09",
        ref: "contratacao/e1/2026/10/x-doc.pdf",
        nomeArquivo: "doc.pdf",
      })
    ).toEqual({
      p_funcionario_id: "f1",
      p_tipo: "contracheque",
      p_competencia: "2026-09",
      p_ref: "contratacao/e1/2026/10/x-doc.pdf",
      p_nome_arquivo: "doc.pdf",
    });
    expect(
      parametrosDaPublicacao({
        funcionarioId: "f1",
        tipo: "documentacao",
        competencia: "2026-09",
        ref: "r",
        nomeArquivo: "n.pdf",
      }).p_competencia
    ).toBeNull();
  });

  it("publicar = RH → Criar; retirar = RH → Deletar (aba RH de Segurança do Trabalho)", () => {
    const chamadas = [];
    const tem = (modulo, aba, funcao) => {
      chamadas.push([modulo, aba, funcao]);
      return funcao === "criar";
    };
    expect(permissoesDocumentosPortal(tem)).toEqual({ publicar: true, retirar: false });
    expect(chamadas).toEqual([
      ["Segurança do Trabalho", "RH", "criar"],
      ["Segurança do Trabalho", "RH", "deletar"],
    ]);
    expect(permissoesDocumentosPortal(undefined)).toEqual({ publicar: false, retirar: false });
    expect(
      permissoesDocumentosPortal(() => {
        throw new Error("x");
      })
    ).toEqual({ publicar: false, retirar: false });
  });
});
