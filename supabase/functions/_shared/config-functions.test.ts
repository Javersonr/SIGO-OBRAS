// Roda com Node 23.6+ (type stripping):
//   node --test supabase/functions/_shared/config-functions.test.ts
//
// Guarda do supabase/config.toml: toda Edge Function tem de declarar o próprio `verify_jwt`. Sem o bloco,
// um deploy feito sem a flag `--no-verify-jwt` (ou de todas as funções de uma vez) liga a exigência de JWT
// no gateway e derruba login e portais, que entram sem sessão do Supabase.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pastaFuncoes = join(dirname(fileURLToPath(import.meta.url)), "..");
const config = readFileSync(join(pastaFuncoes, "..", "config.toml"), "utf8");

/** Pastas de função (as que começam com "_" ou "." são código comum, não função). */
function funcoes(): string[] {
  return readdirSync(pastaFuncoes, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("_") && !e.name.startsWith("."))
    .map((e) => e.name)
    .sort();
}

/** Blocos `[functions.<nome>]` do config.toml com o valor de `verify_jwt` (null = bloco sem a chave). */
function blocos(): Map<string, boolean | null> {
  const mapa = new Map<string, boolean | null>();
  const linhas = config.split(/\r?\n/);
  for (let i = 0; i < linhas.length; i++) {
    const cabecalho = linhas[i].match(/^\[functions\.([a-z0-9-]+)\]\s*$/);
    if (!cabecalho) continue;
    let valor: boolean | null = null;
    for (let j = i + 1; j < linhas.length && !linhas[j].startsWith("["); j++) {
      const chave = linhas[j].match(/^\s*verify_jwt\s*=\s*(true|false)\s*(#.*)?$/);
      if (chave) valor = chave[1] === "true";
    }
    mapa.set(cabecalho[1], valor);
  }
  return mapa;
}

test("toda Edge Function declara verify_jwt em supabase/config.toml", () => {
  const declarados = blocos();
  const semDeclaracao = funcoes().filter((nome) => typeof declarados.get(nome) !== "boolean");
  assert.deepEqual(semDeclaracao, [], "acrescente o bloco [functions.<nome>] com verify_jwt");
});

test("config.toml não declara função que não existe", () => {
  const existentes = new Set(funcoes());
  const sobrando = [...blocos().keys()].filter((nome) => !existentes.has(nome));
  assert.deepEqual(sobrando, []);
});

test("só ia-processar, saas-config e validar-certificado exigem JWT no gateway", () => {
  // Mudou de propósito? Atualize esta lista junto com o AGENTS.md (seção Edge Functions).
  const comJwt = [...blocos()].filter(([, exige]) => exige === true).map(([nome]) => nome);
  assert.deepEqual(comJwt.sort(), ["ia-processar", "saas-config", "validar-certificado"]);
});
