import { describe, it, expect } from "vitest";
import { listaAnexosRH, validarPdfPortal, retirarDocumentoPortal } from "./portal-documentos";

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
