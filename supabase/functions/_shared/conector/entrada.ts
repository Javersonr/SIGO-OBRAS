/**
 * Entrada das ferramentas do conector do Claude: lista fechada de campos (spec 25/09 §4.9) e
 * validadores pequenos. Puro.
 *
 * Todo inputSchema das ferramentas tem additionalProperties:false em todos os objetos; o despacho
 * confere a entrada com camposForaDoSchema e recusa campo que o schema não declara (um campo a
 * mais é erro; um campo ausente não é).
 */

type Schema = Record<string, unknown>;

const ehObjeto = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** Caminhos de chaves não aceitas pelo schema (só nos objetos com additionalProperties:false; desce em properties e items).
 *  Ex.: ["edital.local.bairro", "linhas[3].bdi"]. Ordem: a de encontro. */
export function camposForaDoSchema(valor: unknown, schema: Schema, caminho = ""): string[] {
  if (!ehObjeto(schema)) return [];
  const fora: string[] = [];
  if (Array.isArray(valor)) {
    const itens = schema.items;
    if (ehObjeto(itens)) {
      valor.forEach((v, i) => fora.push(...camposForaDoSchema(v, itens, `${caminho}[${i}]`)));
    }
    return fora;
  }
  if (!ehObjeto(valor)) return fora;
  const props = ehObjeto(schema.properties) ? schema.properties : {};
  for (const [chave, v] of Object.entries(valor)) {
    const aqui = caminho ? `${caminho}.${chave}` : chave;
    if (Object.prototype.hasOwnProperty.call(props, chave)) {
      fora.push(...camposForaDoSchema(v, props[chave] as Schema, aqui));
    } else if (schema.additionalProperties === false) {
      fora.push(aqui);
    }
  }
  return fora;
}

/** Cópia profunda sem as listas "required" (schema estrito da OpenAI → schema de entrada do conector). */
export function semObrigatorios(schema: Schema): Schema {
  const copiar = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(copiar);
    if (!ehObjeto(v)) return v;
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) {
      if (k === "required" && Array.isArray(x)) continue;
      if (k === "properties" && ehObjeto(x)) {
        // as chaves de properties são nomes de campo (um campo pode se chamar "required")
        out[k] = Object.fromEntries(Object.entries(x).map(([p, s]) => [p, copiar(s)]));
        continue;
      }
      out[k] = copiar(x);
    }
    return out;
  };
  return copiar(schema) as Schema;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** UUID em minúsculas, ou null. */
export function uuidOuNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return UUID_RE.test(t) ? t.toLowerCase() : null;
}

/** Texto aparado; vazio → null; cortado em `max`. */
export function textoCurto(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

/** Inteiro entre min e max (inclusive); número em texto ("12") vale. */
export function inteiroNaFaixa(v: unknown, min: number, max: number): number | null {
  const n = typeof v === "string" && /^\s*-?\d+\s*$/.test(v) ? Number(v) : v;
  if (typeof n !== "number" || !Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

export function booleanoOuNull(v: unknown): boolean | null {
  return v === true || v === false ? v : null;
}

/** Caracteres de JSON.stringify(args): acima disso a entrada é recusada antes de rodar. */
export const LIMITE_JSON_ENTRADA = 3_000_000;
