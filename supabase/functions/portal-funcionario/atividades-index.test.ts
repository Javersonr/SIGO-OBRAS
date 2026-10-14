// Roda com Node 23.6+ (type stripping):
//   node --test supabase/functions/portal-funcionario/atividades-index.test.ts
//
// Atividades interativas do EAD (spec 2026-10-14: questionário do módulo, caso com decisões e tarefa de estudo):
// guardas de TEXTO do index.ts, que não é importável no Node (Deno.serve e imports de URL), como
// `acompanhamento-a6.test.ts` e `endurecimento.test.ts`. O comportamento está nos testes das regras puras e dos
// módulos com banco injetado (questionario.test.ts, caso-aluno.test.ts, caso.test.ts, regras.test.ts,
// requisitos.test.ts, prova.test.ts, conclusao.test.ts); aqui se confere que o index.ts os USA, na ordem certa, e
// que a prova final nunca lê as questões dos questionários. Sem dado real.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/** Código sem comentários de linha e de bloco (o que é explicação não conta como código). */
const semComentarios = (texto: string) =>
  texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const ler = (arquivo: string) =>
  semComentarios(readFileSync(new URL(arquivo, import.meta.url), "utf8"));
const codigo = ler("./index.ts");

/** O trecho de uma ação: do `if (body.acao === "<nome>")` até a próxima ação (ou o "Ação desconhecida"). */
function trechoDaAcao(nome: string): string {
  const inicio = codigo.indexOf(`if (body.acao === "${nome}")`);
  assert.ok(inicio >= 0, `ação ${nome} não encontrada no index.ts`);
  const resto = codigo.slice(inicio + 10);
  const proximo = resto.search(/\n {4}(?:if \(body\.acao === |return fail\("Ação desconhecida")/);
  return codigo.slice(inicio, proximo >= 0 ? inicio + 10 + proximo : undefined);
}

/** A definição de uma função interna do index.ts (`const nome = async (` até o `};` que a fecha). */
function definicao(nome: string): string {
  const inicio = codigo.indexOf(`const ${nome} = async (`);
  assert.ok(inicio > 0, `${nome} não encontrada no index.ts`);
  return codigo.slice(inicio, codigo.indexOf("\n    };", inicio) + 7);
}

/**
 * Cada consulta a `tabela`: o `.from("tabela")` e a cadeia de métodos logo depois, com os argumentos (parênteses
 * equilibrados, textos entre aspas pulados), até o primeiro token que não é `.metodo(`.
 */
function cadeias(texto: string, tabela: string): string[] {
  const marca = `.from("${tabela}")`;
  const achadas: string[] = [];
  for (let i = texto.indexOf(marca); i >= 0; i = texto.indexOf(marca, i + marca.length)) {
    let j = i + marca.length;
    for (;;) {
      const metodo = /^\s*\.[A-Za-z_]\w*\(/.exec(texto.slice(j));
      if (!metodo) break;
      j += metodo[0].length;
      let profundidade = 1;
      while (j < texto.length && profundidade > 0) {
        const c = texto[j];
        if (c === '"' || c === "'" || c === "`") {
          j++;
          while (j < texto.length && texto[j] !== c) j += texto[j] === "\\" ? 2 : 1;
        } else if (c === "(") profundidade++;
        else if (c === ")") profundidade--;
        j++;
      }
    }
    achadas.push(texto.slice(i, j));
  }
  return achadas;
}

// ---------------------------------------------------- Task 7: prova final, concluirAula, progresso, dados, certificado

const SO_PROVA = /\.is\(\s*"aula_id",\s*null\s*\)/;
const SO_QUESTIONARIOS = /\.not\(\s*"aula_id",\s*"is",\s*null\s*\)/;

test("a prova final só lê as questões sem aula; as dos questionários só servem aos requisitos", () => {
  const prova = cadeias(ler("./prova.ts"), "treinamento_questao");
  const conclusao = cadeias(ler("./conclusao.ts"), "treinamento_questao");
  const index = cadeias(codigo, "treinamento_questao");
  assert.equal(prova.length, 1, "prova.ts: a leitura das questões da prova");
  assert.equal(conclusao.length, 1, "conclusao.ts: 'o curso tem prova?'");
  for (const c of [...prova, ...conclusao]) assert.match(c, SO_PROVA);
  // index.ts: dados e certificado leem as duas listas separadas (a da prova e a dos questionários)
  assert.equal(index.length, 4, index.join("\n---\n"));
  assert.equal(index.filter((c) => SO_PROVA.test(c)).length, 2);
  assert.equal(index.filter((c) => SO_QUESTIONARIOS.test(c)).length, 2);
  for (const c of index) assert.equal(SO_PROVA.test(c) && SO_QUESTIONARIOS.test(c), false);
  // toda leitura é da empresa da sessão e ignora as apagadas
  for (const c of [...prova, ...conclusao, ...index]) {
    assert.match(c, /\.eq\(\s*"empresa_id",\s*empresaId\s*\)/);
    assert.match(c, /\.is\(\s*"deleted_at",\s*null\s*\)/);
  }
});

test("concluirAula: progresso concluído, trilha, conclusão do curso (com a marca adiada) e status, nesta ordem", () => {
  const c = definicao("concluirAula");
  assert.match(
    c,
    /const concluirAula = async \(\s*mat: any,\s*aula: any,\s*segundos: number,\s*eventoExtra: /
  );
  // definida uma vez, depois de minhaMatricula e antes das ações que a usam
  assert.equal(codigo.split("const concluirAula = async (").length - 1, 1);
  assert.ok(
    codigo.indexOf("const concluirAula = async (") > codigo.indexOf("const minhaMatricula")
  );
  assert.ok(
    codigo.indexOf("const concluirAula = async (") < codigo.indexOf('body.acao === "dados"')
  );
  const upsert = c.search(/\.from\("treinamento_progresso"\)\s*\.upsert\(/);
  assert.ok(upsert > 0, "concluirAula grava o progresso");
  const gravacao = c.slice(upsert, c.indexOf("onConflict", upsert));
  assert.match(gravacao, /segundos_assistidos: segundos/);
  assert.match(gravacao, /concluida: true/);
  assert.match(gravacao, /concluida_em: agoraIso\(\)/);
  // o progresso que não ficou gravado não conclui nada: null para quem chama responder o erro
  assert.match(c, /if \(upErr\) \{[\s\S]*?return null;/);
  const extra = c.search(
    /if \(eventoExtra\) \{\s*await ev\(\{\s*\.\.\.eventoExtra,\s*matricula_id: mat\.id,\s*curso_id: mat\.curso_id,\s*aula_id: aula\.id,?\s*\}\);/
  );
  const aulaConcluida = c.indexOf('evento: "aula_concluida"');
  const conclusao = c.indexOf(
    "await concluirSeCompleto(supabase, mat, empresaId, adiarConclusao(mat))"
  );
  const status = c.search(
    /\.from\("treinamento_matricula"\)\s*\.update\(\{ status: resultado\.status \}\)/
  );
  assert.ok(
    upsert < extra && extra < aulaConcluida,
    "evento extra depois do progresso e antes da aula"
  );
  assert.ok(aulaConcluida < conclusao && conclusao < status, "aula, curso e só então o status");
  assert.match(
    c.slice(aulaConcluida, conclusao),
    /detalhe: \{ segundos, duracao: duracaoParaProgresso\(aula, TEMPO_MINIMO_PADRAO\) \}/
  );
  assert.match(
    c,
    /evento: "curso_concluido", matricula_id: mat\.id, curso_id: mat\.curso_id \}\);\s*await fecharAdiada\(mat, resultado\.data_conclusao, "aula"\);/
  );
  assert.match(c.slice(status), /\.eq\("id", mat\.id\)\s*\.eq\("empresa_id", empresaId\)/);
  assert.match(c, /aula_concluida: true,/);
  assert.match(c, /curso_concluido: resultado\.concluiu,/);
  assert.match(c, /precisa_avaliacao: resultado\.precisaAvaliacao && !mat\.avaliacao_aprovada,/);
  assert.match(c, /status: resultado\.status,/);
  // só duas gravações do progresso no portal: a conclusão (aqui) e o tempo (progresso)
  assert.equal([...codigo.matchAll(/\.from\("treinamento_progresso"\)\s*\.upsert\(/g)].length, 2);
});

test("progresso: leitura e tarefa concluem com o clique e sem tempo mínimo; a conclusão passa por concluirAula", () => {
  const p = trechoDaAcao("progresso");
  assert.doesNotMatch(codigo, /TEMPO_LEITURA/);
  assert.doesNotMatch(p, /concluirCedo|faltamSeg|minimo:/);
  assert.match(p, /if \(concluiu && !atual\?\.concluida\) \{/);
  // a trilha diz como a aula terminou: leitura até o fim ou tarefa confirmada; vídeo, só a aula
  assert.match(p, /const extra = ehVideo\s*\?\s*null/);
  assert.match(p, /aula\.tipo === "tarefa" \? "tarefa_confirmada" : "apostila_lida"/);
  assert.match(p, /detalhe: \{ segundos: novoSeg \}/);
  assert.match(p, /const fim = await concluirAula\(mat, aula, novoSeg, extra\);/);
  assert.match(p, /if \(!fim\) return fail\("Erro ao salvar progresso", 500\);/);
  // o progresso não tem mais cópia da sequência de conclusão
  assert.doesNotMatch(p, /concluirSeCompleto\(|"aula_concluida"|"curso_concluido"|fecharAdiada\(/);
  // o upsert só de tempo não regrava a conclusão (uma conclusão gravada ao mesmo tempo não volta atrás)
  const soTempo = p.slice(p.search(/\.from\("treinamento_progresso"\)\s*\.upsert\(/));
  const gravacao = soTempo.slice(0, soTempo.indexOf("onConflict"));
  assert.match(gravacao, /segundos_assistidos: novoSeg/);
  assert.doesNotMatch(gravacao, /concluida/);
});

test("dados: a contagem da prova é só das questões sem aula; questionários e casos só entram nos requisitos", () => {
  const d = trechoDaAcao("dados");
  assert.match(d, /\{ data: questoesDosQuestionarios, error: erroQuestionarios \}/);
  assert.match(d, /\{ data: roteiros, error: erroRoteiros \}/);
  const casos = cadeias(d, "treinamento_caso");
  assert.equal(casos.length, 1);
  assert.match(casos[0], /\.in\(\s*"curso_id",\s*cursoIds\s*\)/);
  assert.match(casos[0], /\.eq\(\s*"empresa_id",\s*empresaId\s*\)/);
  assert.match(casos[0], /\.is\(\s*"deleted_at",\s*null\s*\)/);
  // leitura com erro: 503 antes da conta da trilha e da retomada (nunca decide com o que não leu)
  const falha = d.indexOf("if (erroQuestionarios || erroRoteiros)");
  assert.ok(falha > 0, "o dados não confere o erro das leituras novas");
  assert.match(d.slice(falha, falha + 600), /return fail\([^)]*503\s*\)/);
  assert.ok(falha < d.indexOf("const concluidoNaTrilha"));
  // os requisitos recebem a prova, os questionários e os roteiros do curso da matrícula
  assert.match(
    d,
    /requisitosDoCurso\(\{[\s\S]*?questoes: \[\s*\.\.\.questoesCurso,\s*\.\.\.\(questoesDosQuestionarios \?\? \[\]\)\.filter\(/
  );
  assert.match(d, /casos: \(roteiros \?\? \[\]\)\.filter\(/);
  // e nada disso vai ao navegador: o objeto de cada curso não cita as listas nem o gabarito
  const resposta = d.slice(d.indexOf("matricula: matriculaParaAluno(m)"), d.indexOf("duvidas:"));
  for (const proibido of ["questoesDosQuestionarios", "roteiros", "correta"]) {
    assert.equal(resposta.includes(proibido), false, proibido);
  }
});

test("certificado: requisitos com as aulas, todas as questões e os roteiros; atividades congeladas só quando há", () => {
  const c = trechoDaAcao("certificado");
  // as aulas trazem o id (questões e roteiros apontam para ele) e o tipo
  assert.match(c, /\.select\(\s*"id, ordem, modulo, titulo, tipo, /);
  assert.match(
    c,
    /questoes: \[\s*\.\.\.\(questoesDaProva \?\? \[\]\),\s*\.\.\.\(questoesDosQuestionarios \?\? \[\]\)\s*\]/
  );
  assert.match(c, /casos: roteiros \?\? \[\]/);
  const casos = cadeias(c, "treinamento_caso");
  assert.equal(casos.length, 1);
  assert.match(casos[0], /\.eq\(\s*"curso_id",\s*mat\.curso_id\s*\)/);
  assert.match(casos[0], /\.eq\(\s*"empresa_id",\s*empresaId\s*\)/);
  assert.match(casos[0], /\.is\(\s*"deleted_at",\s*null\s*\)/);
  assert.match(c, /if \(erroQuestoes \|\| erroQuestionarios \|\| erroRoteiros\)[\s\S]{0,200}503/);
  // a contagem antiga (head: true) saiu: os requisitos precisam das questões
  assert.doesNotMatch(c, /head: true/);
  // resumo das atividades (A9): regra pura, e só entra quando não é null (curso sem atividade emite como antes)
  assert.match(c, /const atividades = atividadesDoCertificado\(aulas \?\? \[\], curso\);/);
  const congela = c.indexOf("...(atividades ? { atividades } : {})");
  assert.ok(congela > c.indexOf("const dados = {"), "dentro do `dados` do certificado");
  assert.ok(congela < c.indexOf("hashDoCertificado("), "antes do hash");
});

// ---------------------------------------------------------------------- Task 8: questionário do módulo

test("leituras de apoio: o último questionario_iniciado e o tempo da aula, só desta matrícula, aula e empresa", () => {
  const inicio = codigo.indexOf("const ultimoInicioDoQuestionario = ");
  assert.ok(inicio > 0, "ultimoInicioDoQuestionario não encontrada");
  const ultimo = codigo.slice(inicio, codigo.indexOf(".maybeSingle()", inicio));
  assert.match(ultimo, /\.from\("treinamento_evento"\)/);
  assert.match(ultimo, /\.eq\("matricula_id", mat\.id\)/);
  assert.match(ultimo, /\.eq\("aula_id", aulaId\)/);
  assert.match(ultimo, /\.eq\("empresa_id", empresaId\)/);
  assert.match(ultimo, /\.eq\("evento", EVENTO_QUESTIONARIO_INICIADO\)/);
  assert.match(ultimo, /\.order\("id", \{ ascending: false \}\)\s*\.limit\(1\)/);
  const tempo = definicao("tempoDaAula");
  assert.match(tempo, /\.from\("treinamento_progresso"\)\s*\.select\("segundos_assistidos"\)/);
  assert.match(tempo, /\.eq\("matricula_id", mat\.id\)/);
  assert.match(tempo, /\.eq\("aula_id", aulaId\)/);
  assert.match(tempo, /\.eq\("empresa_id", empresaId\)/);
  assert.match(tempo, /if \(error\) \{[\s\S]*?return null;/);
});

test("questionario_abrir: teto de atividade, preparo sem gabarito e a mesma tentativa reabre com o mesmo sorteio", () => {
  const a = trechoDaAcao("questionario_abrir");
  const limite = a.indexOf('if (!(await dentroDoLimite("atividade"))) return muitasAcoes();');
  assert.ok(limite >= 0, "sem o teto de atividade");
  assert.ok(limite < a.indexOf("minhaMatricula(body.matricula_id)"));
  assert.match(
    a,
    /const preparo = await prepararQuestionario\(supabase, mat, body\.aula_id, empresaId, false\);\s*if \(preparo\.falha\) return recusaDaProva\(preparo\.falha\);/
  );
  // concluída: a melhor nota e as tentativas, sem sorteio novo
  const concluida = a.indexOf("if (preparo.concluida)");
  assert.ok(concluida > 0 && concluida < a.indexOf("sortearProva("));
  assert.match(
    a.slice(concluida, concluida + 300),
    /concluida: true,[\s\S]*melhor_nota: preparo\.melhorNota,[\s\S]*tentativas: preparo\.usadas/
  );
  assert.match(a, /const numero = preparo\.usadas \+ 1;/);
  assert.match(
    a,
    /inicio && inicio\.tentativa === numero \? provaDaOrdem\(questoes, inicio\.ordem\) : null/
  );
  assert.match(a, /sortearProva\(questoes, inteiroAleatorioSeguro\)/);
  // o início vai à trilha com a aula, no formato do avaliacao_iniciada, sem tempo mínimo; sem a linha, não abre
  const evento = a.indexOf("evento: EVENTO_QUESTIONARIO_INICIADO");
  assert.ok(evento > a.indexOf("sortearProva("));
  const gravacao = a.slice(evento, evento + 400);
  assert.match(gravacao, /aula_id: aula\.id/);
  assert.match(gravacao, /detalheDaProvaIniciada\(\{[\s\S]*tempoMinimoPorQuestaoSeg: 0/);
  assert.match(a, /if \(!gravou\) return fail\([^)]*503\)/);
  // o aluno recebe só o texto: nada de gabarito no trecho
  assert.doesNotMatch(a, /correta|comentario/);
  assert.match(a, /questoes: prova\.map\(\(\{ id, pergunta, opcoes, ordem_opcoes \}\) => \(\{/);
});

test("questionario_enviar: valida contra o sorteio, corrige com a nota do módulo, grava a tentativa e só o aprovado conclui", () => {
  const e = trechoDaAcao("questionario_enviar");
  const pos = (alvo: string | RegExp) =>
    typeof alvo === "string" ? e.indexOf(alvo) : e.search(alvo);
  assert.ok(pos('if (!(await dentroDoLimite("atividade"))) return muitasAcoes();') >= 0);
  assert.ok(pos("dentroDoLimite(") < pos("minhaMatricula("));
  assert.match(
    e,
    /const preparo = await prepararQuestionario\(supabase, mat, body\.aula_id, empresaId, true\);\s*if \(preparo\.falha\) return recusaDaProva\(preparo\.falha\);/
  );
  assert.match(
    e,
    /if \(preparo\.concluida\) \{?\s*return fail\([^)]*409,\s*\{\s*codigo: "QUESTIONARIO_CONCLUIDO"/
  );
  // o início desta tentativa é lido antes de qualquer gravação; erro de leitura = 503
  assert.match(e, /ultimoInicioDoQuestionario\(mat, aula\.id\)/);
  assert.match(e, /if \(erroLeitura\) \{?\s*return fail\([\s\S]{0,120}?503\)/);
  // a regra da prova, sem tempo mínimo, com a mensagem do questionário
  assert.match(e, /validarEnvio\(\{[\s\S]*?tempoMinimoPorQuestaoSeg: 0,?\s*\}\)/);
  assert.match(e, /fail\(mensagemDoEnvio\(envio\.codigo, envio\.mensagem\), envio\.status/);
  assert.match(e, /const notaMinima = notaMinimaDoModulo\(curso\);/);
  assert.match(e, /corrigirProva\(\{[\s\S]*?notaMinima,?\s*\}\)/);
  // a tentativa é imutável e numerada por matrícula e aula: o envio duplo é 409
  const insert = pos(/\.from\("treinamento_questionario_tentativa"\)\s*\.insert\(\{/);
  assert.ok(insert > pos("corrigirProva("));
  const linha = e.slice(insert, e.indexOf("});", insert));
  for (const campo of [
    "empresa_id: empresaId",
    "matricula_id: mat.id",
    "curso_id: mat.curso_id",
    "aula_id: aula.id",
    "funcionario_id: funcionarioId",
    "numero,",
    "acertos,",
    "aprovada,",
    "...origemDaRequisicao(req)",
  ]) {
    assert.ok(linha.includes(campo), campo);
  }
  assert.match(e, /tErr\.code === "23505"[\s\S]{0,200}409/);
  // trilha e conclusão depois da tentativa gravada; só o aprovado conclui a aula
  const envio = pos("evento: EVENTO_QUESTIONARIO_ENVIO");
  assert.ok(envio > insert);
  assert.match(e.slice(envio, envio + 200), /detalhe: \{ tentativa: numero, nota, aprovada \}/);
  assert.equal((e.match(/concluirAula\(/g) ?? []).length, 1);
  assert.ok(pos("concluirAula(") > envio);
  // o tempo de tela é lido o mais perto possível da conclusão: logo antes de concluirAula, dentro do aprovado e
  // depois da tentativa gravada (um sinal de progresso no meio do caminho não pode fazer o tempo voltar atrás)
  assert.equal((e.match(/tempoDaAula\(/g) ?? []).length, 1);
  assert.match(
    e,
    /if \(aprovada\) \{\s*const segundos = await tempoDaAula\(mat, aula\.id\);\s*const fim = segundos === null \? null : await concluirAula\(mat, aula, segundos, null\);/
  );
  assert.ok(pos("tempoDaAula(") > envio);
  // leitura do tempo com erro: a tentativa já está gravada, então a resposta é a da conclusão que não saiu
  assert.match(
    e,
    /if \(!fim\) \{\s*return fail\(\s*"Sua tentativa foi registrada[^"]*",\s*500\s*\);/
  );
  // a resposta é a da regra, com a correção comentada aprovado ou não (A2)
  assert.match(
    e,
    /respostaDoQuestionario\(\{[\s\S]*?revisao: revisaoDoQuestionario\(questoes, acertou\)/
  );
});

test("o navegador não grava os eventos do questionário, da tarefa e da leitura (fora de EVENTOS_CLIENTE)", () => {
  const original = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  const inicio = original.indexOf("const EVENTOS_CLIENTE = new Set([");
  const lista = original.slice(inicio, original.indexOf("]);", inicio));
  assert.ok(lista.length > 50, "a lista de eventos do navegador não foi lida");
  for (const evento of [
    "questionario_iniciado",
    "questionario_envio",
    "tarefa_confirmada",
    "apostila_lida",
    "aula_concluida",
  ]) {
    assert.equal(lista.includes(evento), false, evento);
  }
});
