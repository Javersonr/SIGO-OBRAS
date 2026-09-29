import { describe, it, expect } from "vitest";
import { categoriaDoFornecedor, chaveCategoria, listaCategorias } from "./categorias-fornecedor";

describe("listaCategorias", () => {
  it("aceita lista, JSON em texto e texto separado por vírgula", () => {
    expect(listaCategorias(["Material", "", null, "Serviço"])).toEqual(["Material", "Serviço"]);
    expect(listaCategorias('["Material","Frete"]')).toEqual(["Material", "Frete"]);
    expect(listaCategorias("Material, Frete ,")).toEqual(["Material", "Frete"]);
  });

  it("vazio ou tipo estranho → lista vazia", () => {
    expect(listaCategorias(null)).toEqual([]);
    expect(listaCategorias("   ")).toEqual([]);
    expect(listaCategorias(42)).toEqual([]);
  });
});

describe("categoriaDoFornecedor", () => {
  const categorias = [
    { id: "c1", nome: "Combustível" },
    { id: "c2", nome: "Material Elétrico " },
  ];

  it("1ª categoria do fornecedor que existe em Configurações (sem acento/espaço)", () => {
    const fornecedor = { categorias: '["Frete","material eletrico","Combustivel"]' };
    expect(categoriaDoFornecedor(fornecedor, categorias)).toEqual(categorias[1]);
  });

  it("nenhuma correspondência, fornecedor nulo ou sem categorias → null", () => {
    expect(categoriaDoFornecedor({ categorias: ["Frete"] }, categorias)).toBeNull();
    expect(categoriaDoFornecedor(null, categorias)).toBeNull();
    expect(categoriaDoFornecedor({ categorias: ["Combustível"] }, undefined)).toBeNull();
  });

  it("chaveCategoria normaliza para comparar nomes", () => {
    expect(chaveCategoria("  Pedágio ")).toBe("pedagio");
    expect(chaveCategoria(null)).toBe("");
  });
});
