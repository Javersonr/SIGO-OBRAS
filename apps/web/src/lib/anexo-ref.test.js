import { describe, it, expect } from "vitest";
import { acrescentarAnexoPronto } from "./anexo-ref";

const nota = { nome: "nota.pdf", url: "comprovantes/emp/1-nota.pdf", tipo: "application/pdf" };
const foto = { nome: "cupom.jpg", url: "comprovantes/emp/2-cupom.jpg", tipo: "image/jpeg" };

describe("acrescentarAnexoPronto", () => {
  it("põe o anexo que já subiu no fim da lista, sem mexer nos outros", () => {
    const lista = [foto];
    const nova = acrescentarAnexoPronto(lista, nota);
    expect(nova).toEqual([foto, nota]);
    expect(lista).toEqual([foto]);
  });

  it("não repete a mesma referência (ler o mesmo documento de novo)", () => {
    const lista = [nota, foto];
    expect(acrescentarAnexoPronto(lista, { ...nota, nome: "outro nome.pdf" })).toBe(lista);
  });

  it("anexo já gravado (com id) com a mesma referência também conta como já presente", () => {
    const lista = [{ id: "a1", ...nota }];
    expect(acrescentarAnexoPronto(lista, nota)).toBe(lista);
  });

  it("anexo sem url nunca entra (transacao_anexo.url é NOT NULL)", () => {
    const lista = [foto];
    expect(acrescentarAnexoPronto(lista, { nome: "x.pdf", url: null })).toBe(lista);
    expect(acrescentarAnexoPronto(lista, null)).toBe(lista);
    expect(acrescentarAnexoPronto(lista, undefined)).toBe(lista);
  });

  it("lista ainda não carregada (undefined/null) vira lista nova", () => {
    expect(acrescentarAnexoPronto(undefined, nota)).toEqual([nota]);
    expect(acrescentarAnexoPronto(null, nota)).toEqual([nota]);
    expect(acrescentarAnexoPronto(undefined, null)).toEqual([]);
  });
});
