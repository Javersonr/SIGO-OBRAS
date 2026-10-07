// Roda com Node 23.6+ (type stripping):
//   node --test supabase/functions/portal-funcionario/endurecimento.test.ts
//
// Guarda da T31 (endurecimento do portal-funcionario). O `index.ts` não é importável no Node (usa
// `Deno.serve` e imports de URL), então estas conferências são pelo TEXTO do código, como em
// `trilha-imutavel.test.ts`. A regra em si (volume, trava, colunas) é testada em `regras.test.ts`;
// aqui se confere que o `index.ts` a USA:
//   - a ação legada `link` saiu (nenhuma tela ou função chama);
//   - `evento` e `progresso` passam pelo limite de volume antes de qualquer trabalho;
//   - o sinal do `progresso` só é gravado com a trava otimista;
//   - a matrícula nunca é lida com `select("*")`, e toda coluna da matrícula que o código lê está na
//     lista fixa.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COLUNAS_MATRICULA_PORTAL } from "./regras.ts";

const indexTs = readFileSync(new URL("./index.ts", import.meta.url), "utf8");

/** Código sem comentários de linha e de bloco (para não confundir o que é explicação com o que roda). */
const semComentarios = (texto: string) =>
  texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const codigo = semComentarios(indexTs);

/** O trecho de uma ação: do `if (body.acao === "<nome>")` até o próximo `// ----` de seção. */
function trechoDaAcao(nome: string): string {
  const inicio = codigo.indexOf(`if (body.acao === "${nome}")`);
  assert.ok(inicio >= 0, `ação ${nome} não encontrada no index.ts`);
  const resto = codigo.slice(inicio + 10);
  const proximo = resto.search(/\n {4}(?:if \(body\.acao === |\/\/ -{5,})/);
  return codigo.slice(inicio, proximo >= 0 ? inicio + 10 + proximo : undefined);
}

test("a ação legada link saiu do portal (nenhum chamador no front nem nas funções)", () => {
  assert.equal(/body\.acao\s*===\s*"link"/.test(codigo), false);
  // só ela usava o usuário do SIGO (staff) e o funcionario_id do corpo
  assert.equal(codigo.includes("usuarioDaRequisicao"), false);
  assert.equal(/body\.funcionario_id/.test(codigo), false);
  // o cabeçalho da função não promete mais a ação
  assert.equal(/acao:\s*"link"/.test(indexTs), false);
});

test("o portal continua com as ações do aluno (nada além da link saiu)", () => {
  for (const acao of [
    "login",
    "trocar_senha",
    "logout",
    "documentos",
    "dados",
    "evento",
    "progresso",
    "iniciar_avaliacao",
    "avaliacao",
    "certificado",
    "ciencia",
    "duvida",
  ]) {
    assert.ok(codigo.includes(`body.acao === "${acao}"`), acao);
  }
});

test("evento e progresso passam pelo limite de volume antes de qualquer trabalho", () => {
  // o evento escolhe o teto pelo NOME do evento (abrir_aula e play/pausa têm o seu, T31); o progresso, o dele
  const chamadas: Record<string, string> = {
    evento: "dentroDoLimite(acaoDeVolumeDoEvento(body.evento))",
    progresso: 'dentroDoLimite("progresso")',
  };
  for (const acao of ["evento", "progresso"]) {
    const trecho = trechoDaAcao(acao);
    const chamada = trecho.indexOf(chamadas[acao]);
    assert.ok(chamada >= 0, `${acao}: sem o limite de volume`);
    // vem antes de ler a matrícula ou qualquer tabela
    const primeiraLeitura = trecho.search(/minhaMatricula\(|supabase\s*\.from\(|trilhaDoCurso\(/);
    assert.ok(chamada < primeiraLeitura, `${acao}: o limite tem de vir antes das leituras`);
    // estourou: 429 (a resposta é a mesma nas duas ações)
    assert.ok(trecho.includes(`if (!(await ${chamadas[acao]})) return muitasAcoes();`), acao);
  }
  assert.ok(
    /const muitasAcoes = \(\) =>\s*fail\(MSG_MUITAS_ACOES,\s*429,\s*\{ codigo: "LIMITE" \}\)/.test(
      codigo
    )
  );
});

test("o evento usa o teto próprio de abrir_aula e do play; só o resto cai no teto geral (T31)", () => {
  const trecho = trechoDaAcao("evento");
  // a escolha do teto sai da regra testada (regras.test.ts), não de um if solto no index.ts
  assert.ok(trecho.includes("acaoDeVolumeDoEvento(body.evento)"));
  assert.equal(/dentroDoLimite\("evento"\)/.test(codigo), false, "o teto único voltou");
  // o tipo aceito pelo limite cobre todas as ações da regra
  assert.ok(codigo.includes("const dentroDoLimite = (acao: AcaoComVolume)"));
});

test("a reconfirmação passa a senha à regra (senha vazia não consome tentativa, T27)", () => {
  const inicio = codigo.indexOf("const reconfirmar = (senha: string)");
  assert.ok(inicio >= 0, "falta o reconfirmar");
  const definicao = codigo.slice(inicio, codigo.indexOf("const muitasTentativas"));
  assert.match(definicao, /reconfirmarSenha\(\{\s*funcionarioId,\s*senha,/);
});

test("o limite de volume é do funcionário da sessão e usa o limitador do login (sem IP)", () => {
  const inicio = codigo.indexOf("const dentroDoLimite = ");
  assert.ok(inicio >= 0, "falta o dentroDoLimite");
  const definicao = codigo.slice(inicio, codigo.indexOf("const muitasAcoes"));
  assert.ok(definicao.includes("dentroDoVolume({"));
  assert.ok(/funcionarioId,/.test(definicao), "o contador é do funcionário da sessão");
  assert.ok(definicao.includes("consumirTentativa(supabase, escopo, janelaSeg, limites)"));
  assert.equal(/\bip\b|ipDaRequisicao/.test(definicao), false, "o volume não é por IP");
});

test("o sinal do progresso só é gravado com a trava otimista em ultimo_sinal_em", () => {
  const trecho = trechoDaAcao("progresso");
  const gravacoes = [...trecho.matchAll(/update\(\{\s*ultimo_sinal_em/g)];
  assert.equal(gravacoes.length, 1, "o progresso grava o sinal uma vez");
  assert.ok(trecho.includes("travaDoSinal("), "falta a trava no UPDATE do sinal");
  assert.ok(trecho.includes("resultadoDoSinal("), "falta conferir se a gravação valeu");
  // o valor LIDO (o da sessão) é o que a trava confere
  assert.ok(/travaDoSinal\([\s\S]{0,400}acesso\.ultimo_sinal_em/.test(trecho));
  // perdeu a corrida: 409 com o código próprio, sem creditar nem gravar o progresso
  const mudou = trecho.indexOf(`"mudou"`);
  assert.ok(mudou >= 0, "o progresso não trata o sinal que mudou");
  const resposta = trecho.slice(mudou, mudou + 400);
  assert.ok(/409/.test(resposta) && /SINAL_CONCORRENTE/.test(resposta));
  assert.ok(
    mudou < trecho.indexOf(`from("treinamento_progresso").upsert`),
    "a trava vem antes de gravar o progresso"
  );
});

test("o abrir_aula zera o relógio sem trava (recomeçar a contagem só tira crédito)", () => {
  const trecho = trechoDaAcao("evento");
  assert.equal([...trecho.matchAll(/update\(\{\s*ultimo_sinal_em/g)].length, 1);
  assert.equal(trecho.includes("travaDoSinal("), false);
});

test("a matrícula nunca é lida com select(*): colunas fixas em minhaMatricula e em dados", () => {
  // cada consulta a treinamento_matricula, do .from() ao próximo ponto-e-vírgula ou "])"
  const consultas = [...codigo.matchAll(/\.from\("treinamento_matricula"\)([\s\S]*?)(?:;|\]\))/g)];
  assert.ok(consultas.length >= 2, "esperava as leituras de minhaMatricula e dados");
  for (const [, cadeia] of consultas) {
    if (!/\.select\(/.test(cadeia)) continue; // só escreve (update)
    assert.equal(/\.select\(\s*"\*"/.test(cadeia), false, cadeia.slice(0, 120));
    assert.ok(cadeia.includes("COLUNAS_MATRICULA_PORTAL"), cadeia.slice(0, 120));
  }
  const leituras = consultas.filter(([, c]) => /\.select\(/.test(c));
  assert.equal(leituras.length, 2, "minhaMatricula e dados");
});

test("toda coluna da matrícula que o index.ts lê está na lista fixa", () => {
  const colunas = new Set(COLUNAS_MATRICULA_PORTAL.split(",").map((c) => c.trim()));
  // `mat` é a matrícula do aluno em todas as ações; em `dados` ela se chama `m`
  const usadas = new Set<string>();
  for (const [, campo] of codigo.matchAll(/\bmat\??\.([a-z_]+)/g)) usadas.add(campo);
  const dados = trechoDaAcao("dados");
  for (const [, campo] of dados.matchAll(/\bm\.([a-z_]+)/g)) usadas.add(campo);
  assert.ok(usadas.size >= 6, "a leitura do código não achou os campos (o teste ficaria vazio)");
  for (const campo of usadas) {
    assert.ok(
      colunas.has(campo),
      `${campo} é lido da matrícula mas não está em COLUNAS_MATRICULA_PORTAL`
    );
  }
});
