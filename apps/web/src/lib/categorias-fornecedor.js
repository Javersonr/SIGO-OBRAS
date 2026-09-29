/**
 * Categorias do fornecedor ↔ Categorias Financeiras de despesa.
 * Funções puras (sem React), usadas pelo CategoriasFornecedorSelect, pela
 * nova despesa e pelo preenchimento do "Ler documento".
 */
import { normalizarTexto } from "./busca";

/** Chave de comparação de nome de categoria (minúsculas, sem acento, sem espaço nas pontas). */
export const chaveCategoria = (nome) => normalizarTexto(String(nome || "").trim());

/** `categorias` do fornecedor como lista (aceita o legado em texto). */
export function listaCategorias(valor) {
  if (Array.isArray(valor)) return valor.filter(Boolean);
  if (typeof valor === "string" && valor.trim()) {
    try {
      const v = JSON.parse(valor);
      if (Array.isArray(v)) return v.filter(Boolean);
    } catch {
      /* texto separado por vírgula */
    }
    return valor
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
  }
  return [];
}

/** 1ª categoria financeira (de `categorias`) que bate com as do fornecedor. */
export function categoriaDoFornecedor(fornecedor, categorias) {
  const porChave = new Map((categorias || []).map((c) => [chaveCategoria(c.nome), c]));
  for (const nome of listaCategorias(fornecedor?.categorias)) {
    const c = porChave.get(chaveCategoria(nome));
    if (c) return c;
  }
  return null;
}
