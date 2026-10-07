// Roda com Node 23.6+ (type stripping):
//   node --test supabase/functions/funcionario-acesso/migracao-0147-grants.test.ts
//
// Guarda da 0147 (T33, revisão 1): a função que roda COMO authenticated (trigger ou função com EXECUTE para a API) e
// NÃO é SECURITY DEFINER só pode chamar funções que authenticated também executa. O Postgres confere o EXECUTE da
// chamada aninhada com o papel ativo; a 0147 tirou anexos_como_lista e anexos_do_portal de authenticated, mas o trigger
// zz_documentos_portal (invoker de propósito, R7) as chama em TODO INSERT de funcionário e em todo UPDATE com
// documentos_rh_anexos: o RH inteiro cairia com "permission denied for function" ao aplicar a migração. Não há
// Postgres no PC, e o smoke SQL só roda depois de a migração estar em produção; este teste lê o arquivo e acusa a
// falta de grant antes do commit.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const sql = readFileSync(
  fileURLToPath(new URL("../../migrations/0147_permissoes_ead.sql", import.meta.url)),
  "utf8"
);

interface Funcao {
  nome: string;
  definer: boolean;
  trigger: boolean;
  corpo: string;
}

const semComentarios = (texto: string) => texto.replace(/--.*$/gm, "");

/** As funções que a migração cria (public.<nome>), com o cabeçalho lido e o corpo entre $$ e $$;. */
function funcoesDaMigracao(texto: string): Funcao[] {
  const limpo = semComentarios(texto);
  const achadas: Funcao[] = [];
  const re =
    /create or replace function public\.(\w+)\s*\(([\s\S]*?)\)\s*returns\s+([\s\S]*?)\bas\s+\$\$([\s\S]*?)\n\$\$;/g;
  for (const m of limpo.matchAll(re)) {
    const cabecalho = `${m[3]}`;
    achadas.push({
      nome: m[1],
      definer: /security definer/i.test(cabecalho),
      trigger: /^\s*trigger\b/i.test(m[3]),
      corpo: m[4],
    });
  }
  return achadas;
}

/** As funções com EXECUTE concedido a authenticated (grant ... on function public.<nome>(...) to ...). */
function executaveisPelaApi(texto: string): Set<string> {
  const limpo = semComentarios(texto);
  const executa = new Set<string>();
  const re = /grant\s+execute\s+on\s+function\s+public\.(\w+)\s*\([^)]*\)\s+to\s+([^;]*);/gi;
  for (const m of limpo.matchAll(re)) {
    if (/\bauthenticated\b/i.test(m[2])) executa.add(m[1]);
  }
  return executa;
}

/**
 * "quem chama -> quem é chamado" sem EXECUTE para authenticated: o chamador roda como authenticated (função de trigger,
 * ou função com grant para authenticated) e não é SECURITY DEFINER.
 */
function chamadasSemExecute(texto: string): string[] {
  const funcoes = funcoesDaMigracao(texto);
  const executa = executaveisPelaApi(texto);
  const problemas: string[] = [];
  for (const chamador of funcoes) {
    const roda_como_authenticated = chamador.trigger || executa.has(chamador.nome);
    if (chamador.definer || !roda_como_authenticated) continue;
    for (const alvo of funcoes) {
      if (alvo.nome === chamador.nome) continue;
      if (!new RegExp(`\\b${alvo.nome}\\s*\\(`).test(chamador.corpo)) continue;
      if (!executa.has(alvo.nome)) problemas.push(`${chamador.nome} -> ${alvo.nome}`);
    }
  }
  return problemas.sort();
}

test("0147: o leitor acha as funções da migração e quem é SECURITY DEFINER", () => {
  const funcoes = funcoesDaMigracao(sql);
  const por = new Map(funcoes.map((f) => [f.nome, f]));
  for (const nome of [
    "tem_permissao",
    "zz_permissao_ead",
    "matricula_andamento_so_servidor",
    "certificado_so_revogacao",
    "anexos_como_lista",
    "anexos_do_portal",
    "portal_documento_funcionario",
    "portal_documento_publicar",
    "portal_documento_retirar",
    "zz_documentos_portal",
  ]) {
    assert.ok(por.has(nome), `função ${nome} não encontrada: ${[...por.keys()].join(", ")}`);
  }
  // R7: o trigger dos documentos precisa do current_user de quem grava
  assert.equal(por.get("zz_documentos_portal")?.definer, false);
  assert.equal(por.get("zz_documentos_portal")?.trigger, true);
  assert.equal(por.get("anexos_do_portal")?.definer, false);
  assert.equal(por.get("tem_permissao")?.definer, true);
  assert.equal(por.get("portal_documento_publicar")?.definer, true);
});

test("0147: o trigger zz_documentos_portal chama as funções anexos_* e elas têm EXECUTE para authenticated", () => {
  const funcoes = funcoesDaMigracao(sql);
  const trigger = funcoes.find((f) => f.nome === "zz_documentos_portal");
  assert.ok(trigger, "zz_documentos_portal não encontrada");
  assert.match(trigger.corpo, /public\.anexos_do_portal\(/);
  const executa = executaveisPelaApi(sql);
  assert.ok(
    executa.has("anexos_do_portal"),
    "falta grant execute de anexos_do_portal para authenticated"
  );
  assert.ok(
    executa.has("anexos_como_lista"),
    "falta grant execute de anexos_como_lista para authenticated"
  );
  // anon nunca recebe
  assert.doesNotMatch(
    semComentarios(sql),
    /grant\s+execute\s+on\s+function\s+public\.anexos_\w+[^;]*\banon\b[^;]*;/i
  );
});

test("0147: nenhuma função que roda como authenticated chama função sem EXECUTE para authenticated", () => {
  assert.deepEqual(chamadasSemExecute(sql), []);
});

test("0147: o leitor acusa a migração sem os grants (o erro da revisão 1)", () => {
  const semOsDois = sql.replace(
    /^grant execute on function public\.anexos_(como_lista|do_portal)\([^)]*\) to authenticated;$/gm,
    ""
  );
  assert.notEqual(semOsDois, sql, "os dois grants deveriam existir na migração");
  assert.deepEqual(chamadasSemExecute(semOsDois), ["zz_documentos_portal -> anexos_do_portal"]);
  // só o da função de baixo: a de cima roda como authenticated e chama uma função que authenticated não executa
  const semAFuncaoDeBaixo = sql.replace(
    /^grant execute on function public\.anexos_como_lista\([^)]*\) to authenticated;$/gm,
    ""
  );
  assert.deepEqual(chamadasSemExecute(semAFuncaoDeBaixo), [
    "anexos_do_portal -> anexos_como_lista",
  ]);
});
