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
// O PostgREST corta QUALQUER resposta em ~1000 linhas (max-rows do Supabase).
// Sem paginar, listas maiores perdiam registros ALEATORIAMENTE — ex.: 1.077
// transações da Sinergia → 77 "sumiam" do Financeiro; 2.185 materiais → 1.185
// fora dos combos. Sem `limit` explícito, buscamos TUDO em páginas de 1000,
// sempre com `id` como desempate para a paginação ser estável.
const PAGINA = 1000;
const MAX_PAGINAS = 30; // trava de segurança (30k linhas)

async function fetchAll(buildQuery) {
  const out = [];
  for (let p = 0; p < MAX_PAGINAS; p++) {
    const { data, error } = await buildQuery().range(p * PAGINA, p * PAGINA + PAGINA - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < PAGINA) return out;
  }
  console.warn(`[sdk] fetchAll atingiu ${MAX_PAGINAS * PAGINA} linhas — resultado truncado`);
  return out;
}

function buildEntityClient(supabase, entityName) {
  const table = entityToTable(entityName);

  return {
    /**
     * list({ limit, skip, sort_by }) — lista paginada (sem limit = TUDO)
     */
    async list({ limit, skip = 0, sort_by, includeDeleted } = {}) {
      const build = () => {
        let q = supabase.from(table).select("*");
        if (!includeDeleted) q = q.is("deleted_at", null);
        for (const o of parseSortBy(sort_by)) {
          q = q.order(o.column, { ascending: o.ascending });
        }
        return q.order("id", { ascending: true });
      };
      if (limit) {
        const { data, error } = await build().range(skip, skip + limit - 1);
        if (error) throw error;
        return addBase44AliasesAll(data);
      }
      if (skip) {
        // comportamento antigo preservado: skip sem limit = 1000 a partir dele
        const { data, error } = await build().range(skip, skip + 999);
        if (error) throw error;
        return addBase44AliasesAll(data);
      }
      return addBase44AliasesAll(await fetchAll(build));
    },

    /**
     * filter(criteria, { sort_by, limit } = {}) — query com filtro.
     * Compat Base44: também aceita posicionais filter(criteria, "-campo", 500)
     * — antes o SDK IGNORAVA sort/limit passados nesse estilo, em silêncio.
     */
    async filter(criteria = {}, opts = {}, legacyLimit) {
      if (typeof opts === "string") opts = { sort_by: opts, limit: legacyLimit };
      else if (typeof opts === "number") opts = { limit: opts };
      const { sort_by, limit, skip = 0, includeDeleted } = opts || {};
      const build = () => {
        let q = supabase.from(table).select("*");
        if (!includeDeleted && !criteria.includeDeleted) q = q.is("deleted_at", null);
        q = applyFilter(q, criteria);
        for (const o of parseSortBy(sort_by)) {
          q = q.order(o.column, { ascending: o.ascending });
        }
        return q.order("id", { ascending: true });
      };
      if (limit) {
        const { data, error } = await build().range(skip, skip + limit - 1);
        if (error) throw error;
        return addBase44AliasesAll(data);
      }
      return addBase44AliasesAll(await fetchAll(build));
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
      const { data, error } = await supabase.from(table).insert(clean).select().single();
      if (error) throw error;
      return addBase44Aliases(data);
    },

    /**
     * bulkCreate(records[]) — insere em lote
     */
    async bulkCreate(records) {
      if (!Array.isArray(records) || records.length === 0) return [];
      const cleaned = records.map(stripBase44Aliases);
      const { data, error } = await supabase.from(table).insert(cleaned).select();
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
