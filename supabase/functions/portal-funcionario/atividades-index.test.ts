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
