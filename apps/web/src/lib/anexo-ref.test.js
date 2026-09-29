import { describe, it, expect } from "vitest";
import { acrescentarAnexoPronto, planejarSincronizacaoAnexos } from "./anexo-ref";

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

describe("planejarSincronizacaoAnexos", () => {
  const gravadoNota = { id: "a1", ...nota };
  const gravadoFoto = { id: "a2", ...foto };

  it("anexo novo (sem id) vira criação, com nome, url (ref) e tipo", () => {
    const plano = planejarSincronizacaoAnexos([gravadoFoto], [gravadoFoto, nota]);
    expect(plano).toEqual({
      remover: [],
      criar: [{ nome: nota.nome, url: nota.url, tipo: nota.tipo }],
      remocaoPulada: false,
    });
  });

  it("anexo que estava gravado e saiu da lista vira remoção", () => {
    const plano = planejarSincronizacaoAnexos([gravadoNota, gravadoFoto], [gravadoFoto]);
    expect(plano).toEqual({ remover: ["a1"], criar: [], remocaoPulada: false });
  });

  it("sem mudança: nada a criar nem a remover", () => {
    expect(planejarSincronizacaoAnexos([gravadoNota], [gravadoNota])).toEqual({
      remover: [],
      criar: [],
      remocaoPulada: false,
    });
  });

  it("recibo quitado do servidor nunca é removido, mesmo fora da lista do formulário", () => {
    const recibo = {
      id: "r1",
      nome: "Recibo quitado",
      url: "comprovantes/emp/recibos/recibo-quitado-123.pdf",
      tipo: "application/pdf",
    };
    const plano = planejarSincronizacaoAnexos([recibo, gravadoNota], []);
    expect(plano.remover).toEqual(["a1"]);
  });

  it("sem tipo grava 'comprovante'", () => {
    const plano = planejarSincronizacaoAnexos(
      [],
      [{ nome: "x.pdf", url: "comprovantes/emp/x.pdf" }]
    );
    expect(plano.criar).toEqual([
      { nome: "x.pdf", url: "comprovantes/emp/x.pdf", tipo: "comprovante" },
    ]);
  });

  it("listas ausentes (undefined/null) valem como vazias", () => {
    expect(planejarSincronizacaoAnexos(undefined, null)).toEqual({
      remover: [],
      criar: [],
      remocaoPulada: false,
    });
    expect(planejarSincronizacaoAnexos(null, [nota])).toEqual({
      remover: [],
      criar: [{ nome: nota.nome, url: nota.url, tipo: nota.tipo }],
      remocaoPulada: false,
    });
  });

  it("não altera as listas de entrada", () => {
    const existentes = [gravadoNota];
    const anexos = [nota];
    planejarSincronizacaoAnexos(existentes, anexos);
    expect(existentes).toEqual([gravadoNota]);
    expect(anexos).toEqual([nota]);
  });

  describe("lista de anexos que não carregou (listaCarregada: false)", () => {
    const naoCarregada = { listaCarregada: false };

    it("nada é removido: a lista vazia do formulário não diz que o anexo foi retirado", () => {
      const plano = planejarSincronizacaoAnexos([gravadoNota, gravadoFoto], [], naoCarregada);
      expect(plano.remover).toEqual([]);
      expect(plano.remocaoPulada).toBe(true);
    });

    it("os anexos novos continuam sendo criados", () => {
      const plano = planejarSincronizacaoAnexos([gravadoNota], [nota], naoCarregada);
      expect(plano).toEqual({
        remover: [],
        criar: [{ nome: nota.nome, url: nota.url, tipo: nota.tipo }],
        remocaoPulada: true,
      });
    });

    it("não avisa quando não havia nada a remover (só o recibo quitado, ou banco vazio)", () => {
      const recibo = {
        id: "r1",
        nome: "Recibo quitado",
        url: "comprovantes/emp/recibos/recibo-quitado-123.pdf",
        tipo: "application/pdf",
      };
      expect(planejarSincronizacaoAnexos([recibo], [], naoCarregada).remocaoPulada).toBe(false);
      expect(planejarSincronizacaoAnexos([], [nota], naoCarregada).remocaoPulada).toBe(false);
    });

    it("listaCarregada true (ou sem a opção) mantém a remoção normal", () => {
      const plano = planejarSincronizacaoAnexos([gravadoNota], [], { listaCarregada: true });
      expect(plano).toEqual({ remover: ["a1"], criar: [], remocaoPulada: false });
      expect(planejarSincronizacaoAnexos([gravadoNota], []).remover).toEqual(["a1"]);
    });
  });
});
