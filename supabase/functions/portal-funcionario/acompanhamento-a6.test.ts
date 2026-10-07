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
  // a data da conclusão vem do último marco da trilha (revisão 2), não do dia em que o portal foi aberto
  assert.match(corpo, /marco:\s*sit\.marco/);
});

test("concluirSeCompleto: o erro da gravação não vira conclusão (revisão 2): fica em andamento e adiada", () => {
  const corpo = corpoDaFuncao("concluirSeCompleto");
  assert.match(
    corpo,
    /const \{ error: erroGravacao \} = await supabase\s*\.from\("treinamento_matricula"\)\s*\.update\(patch\)/
  );
  const falha = corpo.slice(corpo.indexOf("if (erroGravacao)"));
  assert.match(falha, /console\.error\(/);
  assert.match(falha, /await adiar\?\.\("gravacao_falhou"\)/);
  assert.match(falha, /concluiu:\s*false/);
  // nunca devolve "concluiu" depois de um UPDATE que falhou
  assert.ok(corpo.indexOf("if (erroGravacao)") < corpo.lastIndexOf("return"));
});

test("concluirSeCompleto: a conclusão adiada deixa o evento conclusao_adiada (só quem passa 'adiar'); a retomada e o certificado não", () => {
  const corpo = corpoDaFuncao("concluirSeCompleto");
  assert.match(corpo, /adiar\?:\s*\(motivo:/);
  assert.match(corpo, /else if \(adiada\) \{\s*await adiar\?\.\("curso_nao_lido"\);?\s*\}/);
  // a ação cria o evento com a constante (o front classifica o evento pelo nome)
  assert.match(
    codigoDoIndex,
    /evento:\s*EVENTO_CONCLUSAO_ADIADA,\s*matricula_id:\s*mat\.id,\s*curso_id:\s*mat\.curso_id/
  );
  // o último marco da trilha vem da trilha lida do banco (aulas concluídas e tentativa aprovada)
  const situacao = corpoDaFuncao("situacaoReal");
  assert.match(situacao, /marcoDaTrilha\(/);
  assert.match(situacao, /\.select\("numero, nota, created_at"\)/);
  assert.match(corpoDaFuncao("trilhaDoCurso"), /\.select\("aula_id, concluida, concluida_em"\)/);
});

test("progresso e avaliação marcam a conclusão adiada; o certificado e a retomada não (já há marca ou o aluno vê o 503)", () => {
  const chamadas = [...codigoDoIndex.matchAll(/await concluirSeCompleto\(([^)]*\)?)\)/g)].map((m) =>
    m[1].replace(/\s+/g, " ").trim()
  );
  // progresso e avaliação passam o 4º parâmetro; o certificado e a retomada do dados, não
  assert.equal(
    chamadas.filter((c) => c.endsWith("adiarConclusao(mat)")).length,
    2,
    String(chamadas)
  );
  assert.equal(
    chamadas.filter((c) => c === "supabase, mat, empresaId").length,
    1,
    String(chamadas)
  );
  assert.equal(chamadas.filter((c) => c === "supabase, m, empresaId").length, 1, String(chamadas));
  assert.match(codigoDoIndex, /const adiarConclusao = \(mat: [^)]*\) =>/);
});

test("concluirSeCompleto: o comentário não promete mais 'a conclusão sai sem a validade'", () => {
  const original = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  const inicio = original.indexOf("async function concluirSeCompleto(");
  // o comentário fica logo ACIMA da função
  const comentario = original.slice(original.lastIndexOf("/**", inicio), inicio);
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
  // só as matrículas da empresa; quem escolhe é a regra pura (trilha completa + conclusão adiada + sem prova
  // reprovada), e a conclusão é a mesma função das outras ações
  assert.match(trecho, /matriculas:\s*matsDaEmpresa,/);
  assert.match(trecho, /concluidoNaTrilha,/);
  assert.match(trecho, /provaSemAprovacao:\s*\(m\)\s*=>/);
  assert.match(trecho, /lerAdiadas:\s*\(ids\)\s*=>\s*conclusoesAdiadasDoBanco\(/);
  assert.match(trecho, /await concluirSeCompleto\(supabase,\s*m,\s*empresaId\)/);
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

test("dados: a retomada não grava o evento curso_concluido (abrir o portal não é estudar), e sim conclusao_registrada", () => {
  const trecho = trechoDoDados();
  assert.doesNotMatch(trecho, /curso_concluido/);
  assert.match(
    trecho,
    /evento:\s*EVENTO_CONCLUSAO_REGISTRADA,\s*matricula_id:\s*m\.id,\s*curso_id:\s*m\.curso_id/
  );
  // o evento só é gravado se a conclusão realmente foi gravada
  assert.ok(
    trecho.indexOf("if (resultado.concluiu)") <
      trecho.indexOf("evento: EVENTO_CONCLUSAO_REGISTRADA")
  );
});

test("dados: nunca conclui por conta própria uma trilha que só parece completa (a conta da prova sem aprovação existe)", () => {
  const trecho = trechoDoDados();
  // tentativas feitas e nenhuma aprovada: o RH apagou as questões; não é conclusão
  assert.match(
    trecho,
    /provaSemAprovacao:\s*\(m\)\s*=>\s*\{[\s\S]{0,400}\(tentativas \?\? \[\]\)\.filter\([\s\S]{0,200}\.some\(/
  );
});

test("conclusoesAdiadasDoBanco: lê só os dois eventos, do funcionário e da empresa da sessão, e o erro de leitura lança", () => {
  const inicio = codigoDoIndex.indexOf("async function conclusoesAdiadasDoBanco(");
  assert.ok(inicio > 0, "função conclusoesAdiadasDoBanco não encontrada");
  const corpo = codigoDoIndex.slice(inicio, codigoDoIndex.indexOf("\nDeno.serve(", inicio));
  assert.match(corpo, /\.from\("treinamento_evento"\)/);
  assert.match(corpo, /\.eq\("empresa_id",\s*empresaId\)/);
  assert.match(corpo, /\.eq\("funcionario_id",\s*funcionarioId\)/);
  assert.match(
    corpo,
    /\.in\("evento",\s*\[EVENTO_CONCLUSAO_ADIADA,\s*EVENTO_CONCLUSAO_REGISTRADA\]\)/
  );
  assert.match(corpo, /\.in\("matricula_id",\s*matriculaIds\)/);
  // erro de leitura não pode virar "nenhuma pendência" em silêncio nem derrubar o portal: lança e a retomada registra
  assert.match(corpo, /if \(error\) throw error/);
  assert.match(corpo, /conclusoesAdiadas\(/);
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
  // e a releitura confere: matrícula ainda aberta (ou relida sem a data) também é 503, nunca um certificado sem conclusão
  const depois = bloco.slice(bloco.indexOf("minhaMatricula(mat.id)"));
  assert.match(
    depois,
    /if \(mat\.status !== "concluido" \|\| !mat\.data_conclusao\)\s*\{?\s*return fail\([^)]*503\)/
  );
});

test("concluirSeCompleto: o comentário aponta quem tenta de novo (retomarConclusoes), não a 'próxima ação'", () => {
  const original = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  const inicio = original.indexOf("async function concluirSeCompleto(");
  const comentario = original.slice(original.lastIndexOf("/**", inicio), inicio);
  assert.match(comentario, /retomarConclusoes/);
  assert.match(comentario, /conclusao_adiada/);
  assert.doesNotMatch(comentario, /a próxima ação do aluno tenta de novo/);
});
