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

// ------------------------------------------------------ revisão 1: segunda chance da conclusão (I1)

/** O trecho do `dados`, da ação até a próxima. */
function trechoDoDados(): string {
  const dados = codigoDoIndex.indexOf('body.acao === "dados"');
  assert.ok(dados > 0, "ação dados não encontrada");
  return codigoDoIndex.slice(dados, codigoDoIndex.indexOf('body.acao === "evento"', dados));
}

test("dados: conclui de novo a matrícula que a trilha dá por completa e o banco tem aberta, ANTES de montar a resposta", () => {
  const trecho = trechoDoDados();
  const retomada = trecho.indexOf("retomarConclusoes({");
  assert.ok(retomada > 0, "o dados não chama retomarConclusoes");
  // só as matrículas da empresa, escolhidas pela regra pura, e concluídas pela mesma função das outras ações
  assert.match(
    trecho,
    /matriculas:\s*matriculasComConclusaoPorRegistrar\(matsDaEmpresa,\s*concluidoNaTrilha\)/
  );
  assert.match(trecho, /concluir:\s*\(m\)\s*=>\s*concluirSeCompleto\(supabase,\s*m,\s*empresaId\)/);
  // relê pela mesma leitura das outras ações (do próprio funcionário, na empresa da sessão, colunas fixas): o
  // `select(*)` da matrícula continua proibido (endurecimento.test.ts conta as leituras)
  assert.match(trecho, /reler:\s*\(m\)\s*=>\s*minhaMatricula\(m\.id\)/);
  // antes de a resposta (matrícula do aluno, pré-requisito dos outros cursos) ser montada
  assert.ok(retomada < trecho.indexOf("const resposta = matsDaEmpresa.map("));
  // e depois de ler tudo de que a conta da trilha precisa
  assert.ok(retomada > trecho.indexOf("const progressoDa"));
});

test("dados: a conta da trilha é uma só (concluidoReal usa concluidoNaTrilha)", () => {
  const trecho = trechoDoDados();
  assert.match(trecho, /const concluidoReal = concluidoNaTrilha\(m\);/);
  assert.equal(trecho.split("situacaoDaTrilha(").length - 1, 1);
});

test("dados: a retomada não grava o evento curso_concluido (abrir o portal não é estudar)", () => {
  assert.doesNotMatch(trechoDoDados(), /curso_concluido/);
});

test("certificado: conclusão que não deu para registrar é 503, não um certificado sem a conclusão", () => {
  const inicio = codigoDoIndex.indexOf('body.acao === "certificado"');
  const trecho = codigoDoIndex.slice(
    inicio,
    codigoDoIndex.indexOf('body.acao === "ciencia"', inicio)
  );
  const regrava = trecho.indexOf('mat.status !== "concluido" || !mat.data_conclusao');
  assert.ok(regrava > 0, "bloco que regrava a conclusão não encontrado");
  const bloco = trecho.slice(regrava, trecho.indexOf("const curso = cursoDoCertificado", regrava));
  assert.match(bloco, /const conclusao = await concluirSeCompleto\(supabase,\s*mat,\s*empresaId\)/);
  assert.match(bloco, /if \(!conclusao\.concluiu\)\s*\{\s*return fail\([^)]*503\)/);
  // a falha vem ANTES de reler a matrícula e de montar o certificado
  assert.ok(bloco.indexOf("!conclusao.concluiu") < bloco.indexOf("minhaMatricula(mat.id)"));
});

test("concluirSeCompleto: o comentário aponta quem tenta de novo (retomarConclusoes), não a 'próxima ação'", () => {
  const original = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  const inicio = original.indexOf("async function concluirSeCompleto(");
  const comentario = original.slice(inicio, inicio + 1900);
  assert.match(comentario, /retomarConclusoes/);
  assert.doesNotMatch(comentario, /a próxima ação do aluno tenta de novo/);
});
