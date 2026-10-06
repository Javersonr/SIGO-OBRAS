import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  AVISO_HISTORICO_PARCIAL,
  LIMITE_CIENCIAS_DO_SERVIDOR,
  historicoDeCienciasParcial,
  separarCiencias,
  textoDoItemDeEntrega,
  tituloDoHistorico,
} from "./portal-ciencias";

// Dados sintéticos: o que a ação `dados` do portal devolve em `ciencias`: todas as pendentes e até 30
// confirmadas (as mais recentes).
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

describe("histórico parcial: o servidor manda só as entregas mais recentes (T36)", () => {
  const lista = (n) => Array.from({ length: n }, (_, i) => entrega(`e${i}`, "confirmada"));

  it("o limite é o mesmo do servidor (LIMITE_HISTORICO_CIENCIAS de ciencia.ts, só das confirmadas)", () => {
    const servidor = readFileSync(
      new URL("../../../../supabase/functions/portal-funcionario/ciencia.ts", import.meta.url),
      "utf8"
    );
    const limite = Number(/LIMITE_HISTORICO_CIENCIAS\s*=\s*(\d+)/.exec(servidor)?.[1]);
    expect(limite).toBe(30);
    expect(LIMITE_CIENCIAS_DO_SERVIDOR).toBe(limite);
    // o limite vale só para a consulta das confirmadas: a das pendentes não tem `.limit(`
    expect(servidor).toMatch(/consulta\("pendente"\),\s*consulta\("confirmada"\)\.limit\(/);
  });

  it("com menos entregas que o limite, o servidor mandou todas: o histórico é completo", () => {
    expect(historicoDeCienciasParcial(lista(0))).toBe(false);
    expect(historicoDeCienciasParcial(lista(LIMITE_CIENCIAS_DO_SERVIDOR - 1))).toBe(false);
  });

  it("no limite (ou acima), pode haver mais entregas antigas que não vieram: o histórico é parcial", () => {
    expect(historicoDeCienciasParcial(lista(LIMITE_CIENCIAS_DO_SERVIDOR))).toBe(true);
    expect(historicoDeCienciasParcial(lista(LIMITE_CIENCIAS_DO_SERVIDOR + 5))).toBe(true);
  });

  it("só as confirmadas contam: as pendentes chegam sem limite e não enchem o histórico", () => {
    const mista = [
      ...lista(10),
      ...Array.from({ length: 40 }, (_, i) => entrega(`p${i}`, "pendente")),
    ];
    expect(separarCiencias(mista).confirmadas).toHaveLength(10);
    // 50 entregas no total, mas só 10 confirmadas: o histórico está completo
    expect(historicoDeCienciasParcial(mista)).toBe(false);
    // 30 confirmadas (o limite do servidor) com qualquer número de pendentes: pode haver mais antigas
    const cheia = [
      ...lista(LIMITE_CIENCIAS_DO_SERVIDOR),
      ...Array.from({ length: 3 }, (_, i) => entrega(`q${i}`, "pendente")),
    ];
    expect(historicoDeCienciasParcial(cheia)).toBe(true);
  });

  it("entrada que não é lista nunca é parcial", () => {
    for (const x of [null, undefined, {}, "texto", 30]) {
      expect(historicoDeCienciasParcial(x)).toBe(false);
    }
  });

  it("o título é 'Entregas confirmadas (N)' só quando a lista é completa", () => {
    expect(tituloDoHistorico(3, false)).toBe("Entregas confirmadas (3)");
    expect(tituloDoHistorico(3)).toBe("Entregas confirmadas (3)");
  });

  it("parcial: o título não sugere o total ('Últimas entregas confirmadas (N)') e o aviso explica", () => {
    const titulo = tituloDoHistorico(22, true);
    expect(titulo).toBe("Últimas entregas confirmadas (22)");
    expect(titulo).not.toMatch(/^Entregas confirmadas/);
    expect(AVISO_HISTORICO_PARCIAL).toContain(String(LIMITE_CIENCIAS_DO_SERVIDOR));
    expect(AVISO_HISTORICO_PARCIAL).toMatch(/mais antigas/i);
    expect(AVISO_HISTORICO_PARCIAL).toMatch(/RH/);
  });
});
