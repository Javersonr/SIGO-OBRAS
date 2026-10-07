// Roda com Node 23.6+ (type stripping):
//   node --test supabase/functions/portal-funcionario/acompanhamento-a6.test.ts
//
// A6 (acompanhamento técnico das revisões): guardas de TEXTO do index.ts, que não é importável no Node
// (usa Deno.serve e imports de URL). Cada teste fixa a ligação entre o index.ts e a regra pura que tem teste
// de comportamento (regras.test.ts, ciencia.test.ts). Sem dado real.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const codigoDoIndex = readFileSync(new URL("./index.ts", import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

/** O corpo de uma função de topo do index.ts, do `async function nome(` até a próxima função de topo. */
function corpoDaFuncao(nome: string): string {
  const inicio = codigoDoIndex.indexOf(`async function ${nome}(`);
  assert.ok(inicio >= 0, `função ${nome} não encontrada`);
  const fim = codigoDoIndex.indexOf("\nasync function ", inicio + 10);
  const deno = codigoDoIndex.indexOf("\nDeno.serve(", inicio);
  const limites = [fim, deno].filter((n) => n > inicio);
  return codigoDoIndex.slice(inicio, Math.min(...limites));
}

test("concluirSeCompleto: erro ao ler o curso não conclui (decisaoDeConclusao com cursoLido: !erroCurso)", () => {
  const corpo = corpoDaFuncao("concluirSeCompleto");
  assert.match(corpo, /error:\s*erroCurso/);
  assert.match(corpo, /decisaoDeConclusao\(\{[\s\S]{0,200}cursoLido:\s*!erroCurso/);
  // quem grava a conclusão é só o patch da regra; o index.ts não monta mais as datas por conta própria
  assert.doesNotMatch(corpo, /datasDeConclusao\(/);
  assert.doesNotMatch(corpo, /status:\s*"concluido"/);
  assert.match(
    corpo,
    /if \(patch\) await supabase\.from\("treinamento_matricula"\)\.update\(patch\)/
  );
});

test("concluirSeCompleto: o comentário não promete mais 'a conclusão sai sem a validade'", () => {
  const original = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  const inicio = original.indexOf("async function concluirSeCompleto(");
  const comentario = original.slice(inicio, inicio + 1400);
  assert.doesNotMatch(comentario, /sai sem a validade/);
  assert.match(comentario, /NÃO conclui/);
});

test("dados: falha só da lista de ciências não derruba os cursos (ciencias: null, sem 503)", () => {
  const dados = codigoDoIndex.indexOf('body.acao === "dados"');
  assert.ok(dados > 0, "ação dados não encontrada");
  const fim = codigoDoIndex.indexOf('body.acao === "evento"', dados);
  const trecho = codigoDoIndex.slice(dados, fim);
  assert.match(trecho, /listarCienciasDoAluno\(/);
  assert.doesNotMatch(trecho, /Não foi possível carregar suas entregas agora/);
  assert.doesNotMatch(trecho, /if \(!listaDeCiencias\.ok\) return fail/);
  assert.match(
    trecho,
    /ciencias:\s*listaDeCiencias\.ok\s*\?\s*listaDeCiencias\.ciencias\s*:\s*null/
  );
});
