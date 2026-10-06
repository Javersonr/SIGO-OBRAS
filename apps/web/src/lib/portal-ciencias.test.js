import { describe, it, expect } from "vitest";
import { separarCiencias, textoDoItemDeEntrega } from "./portal-ciencias";

// Dados sintéticos: o que a ação `dados` do portal devolve em `ciencias` (até 30, mais nova primeiro).
const entrega = (id, status, extra = {}) => ({
  id,
  tipo: "EPI",
  descricao: `Entrega ${id}`,
  itens: [],
  status,
  created_at: "2026-09-01T12:00:00Z",
  confirmada_em: status === "confirmada" ? "2026-09-02T12:00:00Z" : null,
  ...extra,
});

describe("separarCiencias", () => {
  it("separa as pendentes das confirmadas e mantém a ordem das pendentes", () => {
    const r = separarCiencias([
      entrega("a", "pendente"),
      entrega("b", "confirmada"),
      entrega("c", "pendente"),
    ]);
    expect(r.pendentes.map((c) => c.id)).toEqual(["a", "c"]);
    expect(r.confirmadas.map((c) => c.id)).toEqual(["b"]);
  });

  it("confirmadas: a que foi confirmada por último vem primeiro (não a criada por último)", () => {
    const r = separarCiencias([
      entrega("nova-confirmada-cedo", "confirmada", {
        created_at: "2026-09-20T12:00:00Z",
        confirmada_em: "2026-09-21T12:00:00Z",
      }),
      entrega("velha-confirmada-tarde", "confirmada", {
        created_at: "2026-09-01T12:00:00Z",
        confirmada_em: "2026-09-25T12:00:00Z",
      }),
    ]);
    expect(r.confirmadas.map((c) => c.id)).toEqual([
      "velha-confirmada-tarde",
      "nova-confirmada-cedo",
    ]);
  });

  it("confirmada sem data de confirmação (dado antigo) usa a data de criação e não quebra a ordem", () => {
    const r = separarCiencias([
      entrega("sem-data", "confirmada", {
        confirmada_em: null,
        created_at: "2026-09-10T12:00:00Z",
      }),
      entrega("com-data", "confirmada", { confirmada_em: "2026-09-15T12:00:00Z" }),
      entrega("sem-nada", "confirmada", { confirmada_em: null, created_at: null }),
    ]);
    expect(r.confirmadas.map((c) => c.id)).toEqual(["com-data", "sem-data", "sem-nada"]);
  });

  it("não altera a lista recebida", () => {
    const entrada = [entrega("a", "confirmada"), entrega("b", "pendente")];
    const copia = JSON.parse(JSON.stringify(entrada));
    separarCiencias(entrada);
    expect(entrada).toEqual(copia);
  });

  it("status desconhecido, entrada vazia ou inválida não aparece em nenhuma lista", () => {
    const r = separarCiencias([entrega("x", "cancelada"), null, undefined, "texto", 7, {}]);
    expect(r).toEqual({ pendentes: [], confirmadas: [] });
    expect(separarCiencias(null)).toEqual({ pendentes: [], confirmadas: [] });
    expect(separarCiencias(undefined)).toEqual({ pendentes: [], confirmadas: [] });
    expect(separarCiencias({})).toEqual({ pendentes: [], confirmadas: [] });
    expect(separarCiencias([])).toEqual({ pendentes: [], confirmadas: [] });
  });
});

describe("textoDoItemDeEntrega", () => {
  it("monta quantidade, descrição, código e CA", () => {
    expect(
      textoDoItemDeEntrega({ quantidade: 2, descricao: "Luva", codigo: "L-1", ca: "12345" })
    ).toBe("2× Luva (L-1) · CA 12345");
  });

  it("usa o nome quando não há descrição e omite o que não veio", () => {
    expect(textoDoItemDeEntrega({ nome: "Capacete" })).toBe("Capacete");
    expect(textoDoItemDeEntrega({ quantidade: 1, nome: "Bota" })).toBe("1× Bota");
    expect(textoDoItemDeEntrega({ descricao: "Cinto", ca: "99" })).toBe("Cinto · CA 99");
  });

  it("item em texto puro (dado antigo) aparece como está; vazio ou inválido não vira 'undefined'", () => {
    expect(textoDoItemDeEntrega("Colete refletivo")).toBe("Colete refletivo");
    expect(textoDoItemDeEntrega({})).toBe("");
    expect(textoDoItemDeEntrega(null)).toBe("");
    expect(textoDoItemDeEntrega(undefined)).toBe("");
  });
});
