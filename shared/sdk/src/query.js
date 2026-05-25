/**
 * Converte filtros estilo Base44 para queries Supabase.
 *
 * Operadores Base44 reconhecidos:
 *   {field: value}              → .eq(field, value)
 *   {field: {$in: [...]}}       → .in(field, [...])
 *   {field: {$nin: [...]}}      → .not(field, 'in', '(...)')
 *   {field: {$ne: value}}       → .neq(field, value)
 *   {field: {$gt: value}}       → .gt(field, value)
 *   {field: {$gte: value}}      → .gte(field, value)
 *   {field: {$lt: value}}       → .lt(field, value)
 *   {field: {$lte: value}}      → .lte(field, value)
 *   {field: {$like: 'foo%'}}    → .like(field, 'foo%')
 *   {field: {$ilike: 'foo%'}}   → .ilike(field, 'foo%')
 *   {field: {$contains: x}}     → .contains(field, x) (para jsonb)
 *   {field: null}               → .is(field, null)
 *
 * Soft delete: filtros automaticamente excluem deleted_at IS NOT NULL,
 * exceto se {includeDeleted: true} é passado.
 */

/**
 * Aplica os filtros sobre um query builder do Supabase
 * @param {Object} query  - resultado de supabase.from(table).select()
 * @param {Object} criteria - filtro estilo Base44
 * @returns query modificado
 */
export function applyFilter(query, criteria = {}) {
  for (const [key, value] of Object.entries(criteria)) {
    if (key === "includeDeleted") continue;
    if (value === null || value === undefined) {
      query = query.is(key, null);
      continue;
    }
    if (typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
      // operador
      if ("$in" in value) query = query.in(key, value.$in);
      else if ("$nin" in value) query = query.not(key, "in", `(${value.$nin.join(",")})`);
      else if ("$ne" in value) query = query.neq(key, value.$ne);
      else if ("$gt" in value) query = query.gt(key, value.$gt);
      else if ("$gte" in value) query = query.gte(key, value.$gte);
      else if ("$lt" in value) query = query.lt(key, value.$lt);
      else if ("$lte" in value) query = query.lte(key, value.$lte);
      else if ("$like" in value) query = query.like(key, value.$like);
      else if ("$ilike" in value) query = query.ilike(key, value.$ilike);
      else if ("$contains" in value) query = query.contains(key, value.$contains);
      else {
        // objeto sem operador conhecido = match literal jsonb (não recomendado)
        query = query.eq(key, value);
      }
    } else {
      query = query.eq(key, value);
    }
  }
  return query;
}

/**
 * Converte 'sort_by' Base44 ("-created_date" ou "field,-other") para orders Supabase
 * @returns Array<{column, ascending}>
 */
export function parseSortBy(sortBy) {
  if (!sortBy) return [];
  return sortBy.split(",").map((part) => {
    const trimmed = part.trim();
    if (trimmed.startsWith("-")) {
      return { column: mapDateField(trimmed.slice(1)), ascending: false };
    }
    return { column: mapDateField(trimmed), ascending: true };
  });
}

/**
 * Translates Base44 date field aliases for Postgres equivalents
 */
function mapDateField(name) {
  if (name === "created_date") return "created_at";
  if (name === "updated_date") return "updated_at";
  return name;
}

/**
 * Adiciona aliases (created_date, updated_date) em registros vindos do Postgres,
 * porque o frontend Base44 espera esses nomes.
 */
export function addBase44Aliases(row) {
  if (!row || typeof row !== "object") return row;
  if (row.created_at !== undefined && row.created_date === undefined) {
    row.created_date = row.created_at;
  }
  if (row.updated_at !== undefined && row.updated_date === undefined) {
    row.updated_date = row.updated_at;
  }
  return row;
}

export function addBase44AliasesAll(rows) {
  if (!Array.isArray(rows)) return rows;
  return rows.map(addBase44Aliases);
}

/**
 * Remove aliases (created_date, updated_date) antes de escrever no Postgres
 */
export function stripBase44Aliases(data) {
  if (!data || typeof data !== "object") return data;
  const cleaned = { ...data };
  delete cleaned.created_date;
  delete cleaned.updated_date;
  return cleaned;
}
