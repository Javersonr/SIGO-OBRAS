/**
 * Proxy de entidades estilo Base44 sobre Supabase.
 *
 * Uso:
 *   base44.entities.UsuarioCustom.filter({ ativo: true })
 *   base44.entities.Projeto.create({ nome: 'Obra X' })
 */

import {
  applyFilter,
  parseSortBy,
  addBase44Aliases,
  addBase44AliasesAll,
  stripBase44Aliases,
} from "./query.js";
import { entityToTable } from "./name-mapper.js";

/**
 * Constrói o handler para uma entidade específica
 */
function buildEntityClient(supabase, entityName) {
  const table = entityToTable(entityName);

  return {
    /**
     * list({ limit, skip, sort_by }) — lista paginada
     */
    async list({ limit, skip = 0, sort_by, includeDeleted } = {}) {
      let q = supabase.from(table).select("*");
      if (!includeDeleted) q = q.is("deleted_at", null);
      for (const o of parseSortBy(sort_by)) {
        q = q.order(o.column, { ascending: o.ascending });
      }
      if (limit) q = q.range(skip, skip + limit - 1);
      else if (skip) q = q.range(skip, skip + 999);
      const { data, error } = await q;
      if (error) throw error;
      return addBase44AliasesAll(data);
    },

    /**
     * filter(criteria, { sort_by, limit } = {}) — query com filtro
     */
    async filter(criteria = {}, opts = {}) {
      const { sort_by, limit, skip = 0, includeDeleted } = opts;
      let q = supabase.from(table).select("*");
      if (!includeDeleted && !criteria.includeDeleted) q = q.is("deleted_at", null);
      q = applyFilter(q, criteria);
      for (const o of parseSortBy(sort_by)) {
        q = q.order(o.column, { ascending: o.ascending });
      }
      if (limit) q = q.range(skip, skip + limit - 1);
      const { data, error } = await q;
      if (error) throw error;
      return addBase44AliasesAll(data);
    },

    /**
     * get(id) — busca por ID, retorna 1 registro ou null
     */
    async get(id) {
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .eq("id", id)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return addBase44Aliases(data);
    },

    /**
     * create(data) — insere e retorna o registro criado
     */
    async create(payload) {
      const clean = stripBase44Aliases(payload);
      const { data, error } = await supabase
        .from(table)
        .insert(clean)
        .select()
        .single();
      if (error) throw error;
      return addBase44Aliases(data);
    },

    /**
     * bulkCreate(records[]) — insere em lote
     */
    async bulkCreate(records) {
      if (!Array.isArray(records) || records.length === 0) return [];
      const cleaned = records.map(stripBase44Aliases);
      const { data, error } = await supabase
        .from(table)
        .insert(cleaned)
        .select();
      if (error) throw error;
      return addBase44AliasesAll(data);
    },

    /**
     * update(id, partial) — atualiza e retorna o registro
     */
    async update(id, partial) {
      const clean = stripBase44Aliases(partial);
      const { data, error } = await supabase
        .from(table)
        .update(clean)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return addBase44Aliases(data);
    },

    /**
     * delete(id) — soft delete (UPDATE deleted_at = now())
     */
    async delete(id) {
      const { error } = await supabase
        .from(table)
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      return { success: true };
    },

    /**
     * restore(id) — desfaz soft delete
     */
    async restore(id) {
      const { data, error } = await supabase
        .from(table)
        .update({ deleted_at: null })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return addBase44Aliases(data);
    },

    /**
     * deleteMany(criteria) — soft delete em lote por filtro
     * ATENÇÃO: critério vazio NÃO é permitido (proteção)
     */
    async deleteMany(criteria) {
      if (!criteria || Object.keys(criteria).length === 0) {
        throw new Error(`deleteMany(${entityName}): criteria vazio bloqueado por segurança`);
      }
      let q = supabase.from(table).update({ deleted_at: new Date().toISOString() });
      q = applyFilter(q, criteria);
      const { error, count } = await q;
      if (error) throw error;
      return { success: true, count };
    },

    /**
     * count(criteria?) — count rápido sem trazer dados
     */
    async count(criteria = {}) {
      let q = supabase.from(table).select("*", { count: "exact", head: true });
      if (!criteria.includeDeleted) q = q.is("deleted_at", null);
      q = applyFilter(q, criteria);
      const { count, error } = await q;
      if (error) throw error;
      return count || 0;
    },
  };
}

/**
 * Proxy: base44.entities.<QualquerNome> — retorna o cliente sob demanda
 */
export function createEntitiesProxy(supabase) {
  const cache = new Map();
  return new Proxy(
    {},
    {
      get(_target, entityName) {
        if (typeof entityName !== "string") return undefined;
        if (!cache.has(entityName)) {
          cache.set(entityName, buildEntityClient(supabase, entityName));
        }
        return cache.get(entityName);
      },
    }
  );
}
