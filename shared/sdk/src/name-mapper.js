/**
 * Conversão entre nomes de entidade (PascalCase no Base44)
 * e nomes de tabela (snake_case no Postgres).
 *
 * Convenção: cada palavra começa com maiúscula no Base44.
 * No Postgres usamos snake_case ASCII puro.
 *
 *   UsuarioCustom         → usuario_custom
 *   TransacaoFinanceira   → transacao_financeira
 *   HistoricoDocumentoAssinado → historico_documento_assinado
 *
 * Exceções (entidades cujo nome no DB difere do default):
 *   EPI → epi (não "e_p_i")
 *   NFe* → nfe_* (acrônimos preservados em lowercase)
 */

const EXCEPTIONS = {
  EPI: "epi",
  // Adicionar mais se aparecer divergência
};

/**
 * Converte PascalCase → snake_case
 */
export function pascalToSnake(name) {
  if (EXCEPTIONS[name]) return EXCEPTIONS[name];
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toLowerCase();
}

/**
 * Converte snake_case → PascalCase
 */
export function snakeToPascal(name) {
  const inverse = Object.entries(EXCEPTIONS).find(([_, v]) => v === name);
  if (inverse) return inverse[0];
  return name
    .split("_")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
}

/**
 * Mapas pré-construídos pra evitar conversão repetida
 */
const _pascalToSnakeCache = new Map();
const _snakeToPascalCache = new Map();

export function entityToTable(entityName) {
  if (!_pascalToSnakeCache.has(entityName)) {
    _pascalToSnakeCache.set(entityName, pascalToSnake(entityName));
  }
  return _pascalToSnakeCache.get(entityName);
}

export function tableToEntity(tableName) {
  if (!_snakeToPascalCache.has(tableName)) {
    _snakeToPascalCache.set(tableName, snakeToPascal(tableName));
  }
  return _snakeToPascalCache.get(tableName);
}
