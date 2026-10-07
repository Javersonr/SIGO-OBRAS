// Roda com Node 23.6+ (type stripping):
//   node --test supabase/functions/portal-funcionario/acompanhamento-a6.test.ts
//
// A6 (acompanhamento técnico das revisões): guardas de TEXTO do index.ts, que não é importável no Node
// (usa Deno.serve e imports de URL). Cada teste fixa a ligação entre o index.ts e a regra pura que tem teste
// de comportamento (regras.test.ts, ciencia.test.ts). Sem dado real. Na A7 a leitura da trilha e a conclusão
// (`trilhaDoCurso`, `situacaoReal`, `concluirSeCompleto`) saíram para conclusao.ts, testada com banco injetado
// (conclusao.test.ts); as guardas delas leem esse arquivo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const semComentarios = (texto: string) =>
  texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const codigoDoIndex = semComentarios(readFileSync(new URL("./index.ts", import.meta.url), "utf8"));
const originalDaConclusao = readFileSync(new URL("./conclusao.ts", import.meta.url), "utf8");
const codigoDaConclusao = semComentarios(originalDaConclusao);
const codigoDaProva = semComentarios(readFileSync(new URL("./prova.ts", import.meta.url), "utf8"));

/**
 * O corpo de uma função de topo, do `async function nome(` até a próxima função de topo. As da conclusão
 * (`trilhaDoCurso`, `situacaoReal`, `concluirSeCompleto`) estão em conclusao.ts desde a A7.
 */
function corpoDaFuncao(nome: string): string {
  const codigo = codigoDaConclusao.includes(`async function ${nome}(`)
    ? codigoDaConclusao
    : codigoDoIndex;
  const inicio = codigo.indexOf(`async function ${nome}(`);
  assert.ok(inicio >= 0, `função ${nome} não encontrada`);
  const fim = codigo.indexOf("\nasync function ", inicio + 10);
  const fimExportado = codigo.indexOf("\nexport async function ", inicio + 10);
  const deno = codigo.indexOf("\nDeno.serve(", inicio);
  const limites = [fim, fimExportado, deno].filter((n) => n > inicio);
  return codigo.slice(inicio, limites.length ? Math.min(...limites) : undefined);
}

/** O comentário logo ACIMA de `async function concluirSeCompleto(` (em conclusao.ts desde a A7). */
function comentarioDeConcluirSeCompleto(): string {
  const inicio = originalDaConclusao.indexOf("async function concluirSeCompleto(");
  assert.ok(inicio > 0, "concluirSeCompleto não encontrada em conclusao.ts");
  return originalDaConclusao.slice(originalDaConclusao.lastIndexOf("/**", inicio), inicio);
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
  // o motivo vem da regra (curso_nao_lido ou, desde a A7, prova_nao_lida); sem motivo, nada é marcado
  assert.match(corpo, /else if \(motivo\) \{\s*await adiar\?\.\(motivo\);?\s*\}/);
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
  // o comentário fica logo ACIMA da função
  const comentario = comentarioDeConcluirSeCompleto();
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
  const comentario = comentarioDeConcluirSeCompleto();
  assert.match(comentario, /retomarConclusoes/);
  assert.match(comentario, /conclusao_adiada/);
  assert.doesNotMatch(comentario, /a próxima ação do aluno tenta de novo/);
});

// ------------------------------------------- A7: leitura que falhou não decide a conclusão (I1 da revisão 3)
// O comportamento está em conclusao.test.ts (banco injetado) e em regras.test.ts; aqui, a ligação no index.ts.

test("A7: o index.ts usa a conclusão de conclusao.ts e não tem mais cópia própria", () => {
  assert.match(
    codigoDoIndex,
    /import \{ concluirSeCompleto, situacaoReal, trilhaDoCurso \} from "\.\/conclusao\.ts";/
  );
  for (const nome of ["trilhaDoCurso", "situacaoReal", "concluirSeCompleto"]) {
    assert.doesNotMatch(codigoDoIndex, new RegExp(`async function ${nome}\\(`), nome);
  }
});

test("A7: toda leitura da trilha confere `lida` antes de usar as aulas (503, nunca 'aula bloqueada')", () => {
  const leituras = [
    ...codigoDoIndex.matchAll(/const trilha = await trilhaDoCurso\([^)]*\);\s*([^\n]*)/g),
  ];
  // abrir_aula e progresso; a preparação da prova saiu para prova.ts na revisão 1 (guarda abaixo)
  assert.equal(leituras.length, 2, String(leituras.map((m) => m[0])));
  for (const [, seguinte] of leituras) {
    assert.match(seguinte, /if \(!trilha\.lida\) return fail\(MSG_TRILHA_INDISPONIVEL, 503\)/);
  }
  // a da prova: a mesma conferência, em prova.ts (o comportamento está em prova.test.ts)
  assert.match(
    codigoDaProva,
    /const trilha = await trilhaDoCurso\([^)]*\);\s*if \(!trilha\.lida\) return \{ falha: \{ mensagem: MSG_TRILHA_INDISPONIVEL, status: 503 \} \};/
  );
});

test("A7: o certificado com a trilha ilegível responde 503 (bloqueioDaTrilhaNoCertificado), não 409 'Conclua o curso'", () => {
  const inicio = codigoDoIndex.indexOf('body.acao === "certificado"');
  const trecho = codigoDoIndex.slice(
    inicio,
    codigoDoIndex.indexOf('body.acao === "ciencia"', inicio)
  );
  assert.match(
    trecho,
    /const sit = await situacaoReal\(supabase, mat, empresaId\);\s*const semTrilha = bloqueioDaTrilhaNoCertificado\(sit\);\s*if \(semTrilha\) return fail\(semTrilha\.mensagem, semTrilha\.status\);/
  );
  // a mensagem de "conclua o curso" saiu do index.ts: só a regra decide entre 409 e 503
  assert.doesNotMatch(codigoDoIndex, /Conclua o curso antes de emitir o certificado/);
  assert.doesNotMatch(trecho, /if \(!sit\.concluido\)/);
});

test("A7: o dados não monta a resposta com questões ou tentativas ilegíveis (503 antes da retomada)", () => {
  const trecho = trechoDoDados();
  assert.match(trecho, /\{ data: questoes, error: erroQuestoes \}/);
  assert.match(trecho, /\{ data: tentativas, error: erroTentativas \}/);
  const falha = trecho.indexOf("if (erroQuestoes || erroTentativas)");
  assert.ok(falha > 0, "o dados não confere o erro das questões e das tentativas");
  const bloco = trecho.slice(falha, trecho.indexOf("const liberadaEm", falha));
  assert.match(bloco, /console\.error\([^)]*questões/);
  assert.match(bloco, /console\.error\([^)]*tentativas/);
  assert.match(bloco, /return fail\([^)]*503\s*\)/);
  // vem antes da conta da trilha e da retomada (que dependem das duas listas)
  assert.ok(falha < trecho.indexOf("const concluidoNaTrilha"));
  assert.ok(falha < trecho.indexOf("retomarConclusoes({"));
});

test("A7: a conclusão normal (aula, prova) e a do certificado fecham a marca adiada com conclusao_registrada", () => {
  // o fechamento usa a regra pura (fecharConclusaoAdiada) com a leitura das marcas desta matrícula
  const inicio = codigoDoIndex.indexOf("const fecharAdiada = (");
  assert.ok(inicio > 0, "falta o fecharAdiada");
  const definicao = codigoDoIndex.slice(inicio, codigoDoIndex.indexOf("});", inicio) + 3);
  assert.match(definicao, /fecharConclusaoAdiada\(\{/);
  assert.match(
    definicao,
    /conclusoesAdiadasDoBanco\(supabase, \{ empresaId, funcionarioId, matriculaIds: ids \}\)/
  );
  assert.match(
    definicao,
    /evento: EVENTO_CONCLUSAO_REGISTRADA,\s*matricula_id: mat\.id,\s*curso_id: mat\.curso_id,\s*detalhe: \{ data_conclusao: dataConclusao, origem \}/
  );
  // progresso e avaliação: logo depois do curso_concluido; certificado: logo depois de concluir
  assert.match(
    codigoDoIndex,
    /evento: "curso_concluido", matricula_id: mat\.id, curso_id: mat\.curso_id \}\);\s*await fecharAdiada\(mat, resultado\.data_conclusao, "aula"\);/
  );
  assert.match(
    codigoDoIndex,
    /evento: "curso_concluido", matricula_id: mat\.id, curso_id: mat\.curso_id \}\);\s*await fecharAdiada\(mat, r\.data_conclusao, "prova"\);/
  );
  assert.match(
    codigoDoIndex,
    /if \(!conclusao\.concluiu\) \{[^}]*\}\s*await fecharAdiada\(mat, conclusao\.data_conclusao, "certificado"\);/
  );
  // a retomada continua gravando o seu, agora com a origem
  assert.match(
    trechoDoDados(),
    /detalhe: \{ data_conclusao: resultado\.data_conclusao, origem: "retomada" \}/
  );
});

test("A7 (Minor 1): o navegador não grava as marcas da conclusão (fora de EVENTOS_CLIENTE)", () => {
  const original = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  const inicio = original.indexOf("const EVENTOS_CLIENTE = new Set([");
  assert.ok(inicio > 0, "lista EVENTOS_CLIENTE não encontrada");
  const lista = original.slice(inicio, original.indexOf("]);", inicio));
  assert.ok(lista.length > 50, "a lista de eventos do navegador não foi lida");
  // com a marca gravada pelo aluno, a retomada concluiria qualquer trilha que parecesse completa
  for (const evento of [
    "conclusao_adiada",
    "conclusao_registrada",
    "EVENTO_CONCLUSAO_ADIADA",
    "EVENTO_CONCLUSAO_REGISTRADA",
  ]) {
    assert.equal(lista.includes(evento), false, evento);
  }
});

test("A7 (Minor 3): o comentário de concluirSeCompleto diz que o progresso chama em TODA aula concluída", () => {
  const comentario = comentarioDeConcluirSeCompleto();
  assert.doesNotMatch(comentario, /só chamam isto no instante em que a última aula/);
  assert.match(comentario, /TODA aula/);
  // e o que acontece com cada leitura que falha
  assert.match(comentario, /segunda leitura|lê tudo de novo/);
  assert.match(comentario, /NÃO conclui e NÃO marca/);
});

test("A7: a conclusão confere o erro de cada leitura (conclusao.ts) e manda a causa ao log", () => {
  const trilha = corpoDaFuncao("trilhaDoCurso");
  assert.match(trilha, /error: erroAulas/);
  assert.match(trilha, /error: erroProgs/);
  assert.match(trilha, /lida: !erroAulas && !erroProgs/);
  const situacao = corpoDaFuncao("situacaoReal");
  assert.match(situacao, /error: erroQuestoes/);
  assert.match(situacao, /error: erroAprovadas/);
  assert.match(situacao, /concluido: lida && sit\.concluido/);
  const concluir = corpoDaFuncao("concluirSeCompleto");
  // segunda leitura antes de desistir ou adiar
  assert.match(
    concluir,
    /if \(!sit\.lida \|\| erroCurso\) \{[\s\S]*await esperar\(\);[\s\S]*await ler\(\);/
  );
});

// ------------------------------------- A7, revisão 1: a prova não é aberta nem corrigida com leitura que falhou
// O comportamento está em prova.test.ts (banco injetado); aqui, a ligação no index.ts e a ordem em prova.ts.

test("A7 (revisão 1): o index.ts usa prepararProva de prova.ts, sem cópia própria, e devolve a recusa", () => {
  assert.match(
    codigoDoIndex,
    /import \{ prepararProva, type RecusaDaProva \} from "\.\/prova\.ts";/
  );
  assert.doesNotMatch(codigoDoIndex, /const prepararProva = /);
  assert.match(
    codigoDoIndex,
    /const recusaDaProva = \(r: RecusaDaProva\) => fail\(r\.mensagem, r\.status, r\.extra\);/
  );
  // iniciar_avaliacao (sem gabarito) e avaliacao (com): a empresa da sessão, e a recusa sai antes de usar a prova
  const chamadas = [
    ...codigoDoIndex.matchAll(
      /const preparo = await prepararProva\(supabase, mat, empresaId, (false|true)\);\s*if \(preparo\.falha\) return recusaDaProva\(preparo\.falha\);/g
    ),
  ].map((m) => m[1]);
  assert.deepEqual(chamadas, ["false", "true"]);
});

test("A7 (revisão 1): o envio da prova só corrige e grava a tentativa depois da preparação sem falha", () => {
  const inicio = codigoDoIndex.indexOf('body.acao === "avaliacao"');
  assert.ok(inicio > 0, "ação avaliacao não encontrada");
  const acao = codigoDoIndex.slice(
    inicio,
    codigoDoIndex.indexOf('body.acao === "certificado"', inicio)
  );
  const recusa = acao.indexOf("if (preparo.falha) return recusaDaProva(preparo.falha)");
  assert.ok(recusa > 0, "a recusa da preparação não foi encontrada");
  // a tentativa aprovada é imutável (0135): com o curso ilegível, nem a correção (nota mínima padrão) nem o INSERT
  assert.ok(recusa < acao.indexOf("corrigirProva("));
  assert.ok(recusa < acao.indexOf('.from("treinamento_tentativa").insert'));
  // a nota mínima da correção vem do curso que a preparação leu
  assert.match(acao, /notaMinima: curso\?\.nota_minima/);
});

test("A7 (revisão 1): prova.ts confere o erro das quatro leituras e responde 503 antes de qualquer regra da prova", () => {
  for (const erro of ["erroQuestoes", "erroCurso", "erroAnteriores", "erroLiberacoes"]) {
    assert.match(codigoDaProva, new RegExp(`error: ${erro}\\b`), erro);
  }
  // a causa de cada leitura vai ao log
  assert.match(
    codigoDaProva,
    /console\.error\(`\$\{LOG\} prepararProva: \$\{leitura\}:`, causa\(erro\)\)/
  );
  const falha = codigoDaProva.indexOf(
    "if (ilegivel) return { falha: { mensagem: MSG_PROVA_INDISPONIVEL, status: 503 } };"
  );
  assert.ok(falha > 0, "falta o 503 da prova com leitura ilegível");
  // antes de "sem questões", do limite e do intervalo, e de a nota mínima do curso valer
  assert.ok(falha < codigoDaProva.indexOf("!questoes?.length"));
  assert.ok(falha < codigoDaProva.indexOf("situacaoDasTentativas({"));
});

test("A7 (revisão 1): prova.ts continua sem Deno e sem import de URL (testável no Node)", () => {
  assert.doesNotMatch(codigoDaProva, /\bDeno\./);
  assert.doesNotMatch(codigoDaProva, /from "https?:/);
});
