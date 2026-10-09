import { describe, it, expect } from "vitest";
import { ATIVIDADES, CATEGORIAS, TIPOS_DOC } from "@/components/acervo/acervo-utils";
import {
  ATIVIDADES_ACERVO,
  CATEGORIAS_ACERVO,
  TIPOS_DOC_ACERVO,
  categoriaValida,
} from "../../../../supabase/functions/_shared/edital/acervo-categorias.ts";

// O conector do Claude valida as categorias, os tipos e as atividades do acervo com uma cópia das
// listas da tela (supabase/functions/_shared/edital/acervo-categorias.ts). Mudou a tela, muda lá.
describe("paridade das listas do acervo: tela × conector do Claude", () => {
  it("categorias: mesmos ids, rótulos e unidades, na mesma ordem", () => {
    expect(CATEGORIAS_ACERVO).toEqual(CATEGORIAS);
  });

  it("tipos de documento e atividades: mesmos ids, na mesma ordem", () => {
    expect([...TIPOS_DOC_ACERVO]).toEqual(TIPOS_DOC.map((t) => t.id));
    expect([...ATIVIDADES_ACERVO]).toEqual(ATIVIDADES.map((a) => a.id));
  });

  it("todo id e todo rótulo da tela são reconhecidos pelo servidor", () => {
    for (const c of CATEGORIAS) {
      expect(categoriaValida(c.id)).toBe(c.id);
      expect(categoriaValida(c.label)).toBe(c.id);
    }
  });
});
