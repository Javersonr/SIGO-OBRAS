// Roda com Node 23.6+ (type stripping):  node --test supabase/functions/portal-funcionario/tutor.test.ts
//
// T21 (tutor e dúvidas, decisão D4 de 06/10/2026). A regra pura do aviso ao tutor (`tutor.ts`), a ligação dela
// no `index.ts` (que não é importável no Node: confere-se pelo TEXTO do código, como em `avisos.test.ts`) e a
// migração `0140_treinamento_curso_tutor.sql`. Só dados e números fictícios: o repositório é público.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { normalizarTelefoneBR } from "../_shared/whatsapp-envio.ts";
import {
  MAX_PERGUNTA_NO_AVISO,
  URL_DUVIDAS_DO_TUTOR,
  destinoDoAvisoAoTutor,
  mensagemDuvidaAoTutor,
  tutorParaOAluno,
} from "./tutor.ts";
import { normalizarTelefoneBR as normalizarFront } from "../../../apps/web/src/lib/telefone.js";

// ------------------------------------------------------------------ o telefone do tutor
test("destinoDoAvisoAoTutor: o número só sai quando o envio do WhatsApp o aceita", () => {
  assert.equal(destinoDoAvisoAoTutor({ tutor_telefone: "(11) 99999-0000" }), "5511999990000");
  assert.equal(destinoDoAvisoAoTutor({ tutor_telefone: "11999990000" }), "5511999990000");
  assert.equal(destinoDoAvisoAoTutor({ tutor_telefone: "5511999990000" }), "5511999990000");
  assert.equal(destinoDoAvisoAoTutor({ tutor_telefone: "(11) 3333-0000" }), "551133330000");
  for (const ruim of [undefined, null, "", "   ", "abc", "999", "(11) 9999-000", "119999900001"]) {
    assert.equal(destinoDoAvisoAoTutor({ tutor_telefone: ruim }), null, String(ruim));
  }
  assert.equal(destinoDoAvisoAoTutor(null), null);
  assert.equal(destinoDoAvisoAoTutor(undefined), null);
});

test("a cópia do front e a regra do servidor dizem o mesmo, nos mesmos casos", () => {
  const casos = [
    "",
    "   ",
    "abc",
    "1",
    "999990000",
    "11999990000",
    "1133330000",
    "5511999990000",
    "551133330000",
    "55119999900001",
    "119999900001",
    "(11) 99999-0000",
    "+55 11 99999-0000",
    "55 11 99999 0000",
    "(55) 99999-0000",
    "55999990000",
    "tel: 11 99999-0000",
    "ramal 123",
    "0800 123 4567",
    null,
    undefined,
  ];
  for (const caso of casos) {
    assert.equal(normalizarFront(caso), normalizarTelefoneBR(caso as string), String(caso));
  }
});

// ------------------------------------------------------------------ a mensagem ao tutor
const dados = {
  cursoNome: "Curso de Teste",
  alunoNome: "Aluno Teste",
  aulaTitulo: "Aula de Teste",
  pergunta: "Como funciona isto?",
};

test("a mensagem traz o curso, o aluno, a aula, a pergunta e o link direto para responder", () => {
  const texto = mensagemDuvidaAoTutor(dados);
  assert.match(texto, /Curso de Teste/);
  assert.match(texto, /Aluno Teste/);
  assert.match(texto, /Aula de Teste/);
  assert.match(texto, /"Como funciona isto\?"/);
  assert.ok(texto.includes(URL_DUVIDAS_DO_TUTOR), "o link vai na mensagem");
  assert.equal(texto.split(URL_DUVIDAS_DO_TUTOR).length, 2, "uma vez só");
});

test("o link é o do SIGO em produção, na página de RH & Segurança, direto na aba Treinamentos", () => {
  assert.match(URL_DUVIDAS_DO_TUTOR, /^https:\/\/www\.sigoobras\.com\.br\/SegurancaTrabalho(\?|$)/);
  assert.match(URL_DUVIDAS_DO_TUTOR, /tab=treinamentos_ead$/);
});

test("dúvida do curso todo (sem aula) não ganha a linha da aula", () => {
  for (const aulaTitulo of [null, undefined, "", "   "]) {
    const texto = mensagemDuvidaAoTutor({ ...dados, aulaTitulo });
    assert.doesNotMatch(texto, /Aula:/);
    assert.doesNotMatch(texto, /null|undefined/);
  }
  assert.match(mensagemDuvidaAoTutor(dados), /Aula: Aula de Teste/);
});

test("nome ausente (curso ou aluno apagado) não vira 'undefined' na mensagem", () => {
  const texto = mensagemDuvidaAoTutor({ ...dados, cursoNome: undefined, alunoNome: null });
  assert.doesNotMatch(texto, /undefined|null/);
});

test("pergunta enorme é cortada no aviso (o texto inteiro fica no SIGO)", () => {
  const texto = mensagemDuvidaAoTutor({
    ...dados,
    pergunta: "a".repeat(MAX_PERGUNTA_NO_AVISO + 500),
  });
  assert.ok(texto.includes("a".repeat(MAX_PERGUNTA_NO_AVISO)));
  assert.ok(!texto.includes("a".repeat(MAX_PERGUNTA_NO_AVISO + 1)));
  assert.match(texto, /\.\.\./);
  // pergunta que cabe vai inteira, sem reticências
  assert.doesNotMatch(mensagemDuvidaAoTutor(dados), /\.\.\./);
});

test("a mensagem nunca leva o telefone do tutor nem a senha de ninguém", () => {
  const texto = mensagemDuvidaAoTutor(dados);
  assert.doesNotMatch(texto, /\d{8,}/);
});

// ------------------------------------------------------------------ o que o aluno recebe do tutor
test("tutorParaOAluno: só nome e atendimento, aparados; nunca o telefone", () => {
  assert.deepEqual(
    tutorParaOAluno({
      tutor_nome: "  Tutor Teste ",
      tutor_telefone: "(11) 99999-0000",
      tutor_atendimento: " Dias úteis, 8h às 17h ",
    }),
    { tutor_nome: "Tutor Teste", tutor_atendimento: "Dias úteis, 8h às 17h" }
  );
  assert.deepEqual(tutorParaOAluno({ tutor_telefone: "(11) 99999-0000" }), {
    tutor_nome: null,
    tutor_atendimento: null,
  });
  assert.deepEqual(tutorParaOAluno({ tutor_nome: "  ", tutor_atendimento: "" }), {
    tutor_nome: null,
    tutor_atendimento: null,
  });
  assert.deepEqual(tutorParaOAluno(null), { tutor_nome: null, tutor_atendimento: null });
  assert.deepEqual(Object.keys(tutorParaOAluno({ tutor_telefone: "11999990000" })).sort(), [
    "tutor_atendimento",
    "tutor_nome",
  ]);
});

// ------------------------------------------------------------------ o index.ts usa as regras
const codigoDoIndex = readFileSync(new URL("./index.ts", import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

/** O trecho de uma ação, do `if (body.acao === "<nome>")` até o próximo `// ----` de seção. */
function trechoDaAcao(nome: string): string {
  const inicio = codigoDoIndex.indexOf(`if (body.acao === "${nome}")`);
  assert.ok(inicio >= 0, `ação ${nome} não encontrada no index.ts`);
  const resto = codigoDoIndex.slice(inicio + 10);
  const proximo = resto.search(
    /\n {4}(?:if \(body\.acao === |\/\/ -{5,}|return fail\("Ação desconhecida")/
  );
  return codigoDoIndex.slice(inicio, proximo >= 0 ? inicio + 10 + proximo : undefined);
}

test("index.ts, ação duvida: o aviso vai ao telefone do curso da matrícula, só se o número for válido", () => {
  const acao = trechoDaAcao("duvida");
  const lerCurso = acao.search(/\.from\("treinamento_curso"\)/);
  const destino = acao.search(/destinoDoAvisoAoTutor\(\s*curso\s*\)/);
  const enviar = acao.search(/enviarWhatsAppTexto\(\s*destino\s*,/);
  assert.ok(lerCurso > 0, "lê o curso no banco");
  assert.ok(destino > lerCurso, "decide o destino depois de ler o curso");
  assert.ok(enviar > destino, "e só então envia");
  // o curso vem pelo id da MATRÍCULA da sessão e pela empresa da sessão, nunca do corpo
  const bloco = acao.slice(lerCurso, destino);
  assert.match(bloco, /\.eq\("id",\s*mat\.curso_id\)/);
  assert.match(bloco, /\.eq\("empresa_id",\s*empresaId\)/);
  assert.match(bloco, /tutor_telefone/);
  assert.doesNotMatch(bloco, /body\.curso/);
  // sem número válido nada é enviado: o envio fica dentro do `if (destino)`
  assert.match(acao, /if\s*\(\s*destino\s*\)\s*\{[\s\S]*enviarWhatsAppTexto\(/);
});

test("index.ts, ação duvida: a mensagem sai da regra testada (com o link) e a falha não derruba a dúvida", () => {
  const acao = trechoDaAcao("duvida");
  assert.match(acao, /mensagemDuvidaAoTutor\(\s*\{/);
  assert.doesNotMatch(acao, /Responda no SIGO/, "o texto da mensagem mora em tutor.ts");
  assert.match(acao, /try\s*\{[\s\S]*enviarWhatsAppTexto\([\s\S]*\}\s*catch\s*\(e\)/);
  // a resposta diz se o tutor foi avisado (a tela do aluno usa)
  assert.match(acao, /tutor_avisado/);
  // a dúvida já foi gravada antes do aviso
  assert.ok(acao.indexOf('.from("treinamento_duvida")') < acao.indexOf("enviarWhatsAppTexto("));
});

test("index.ts, ação duvida: a aula citada na mensagem é da empresa e do curso da matrícula", () => {
  const acao = trechoDaAcao("duvida");
  const aula = acao.slice(acao.search(/\.from\("treinamento_aula"\)/));
  assert.match(aula, /\.eq\("id",\s*body\.aula_id\)/);
  assert.match(aula, /\.eq\("curso_id",\s*mat\.curso_id\)/);
  assert.match(aula, /\.eq\("empresa_id",\s*empresaId\)/);
});

test("index.ts, ação dados: o aluno recebe nome e atendimento do tutor, e o telefone não sai", () => {
  const acao = trechoDaAcao("dados");
  assert.match(acao, /\.\.\.tutorParaOAluno\(\s*curso\s*\)/);
  assert.doesNotMatch(acao, /tutor_telefone/);
});

// ------------------------------------------------------------------ a migração 0140
const pastaMigracoes = new URL("../../migrations/", import.meta.url);
const arquivos0140 = readdirSync(pastaMigracoes).filter((n) => /^0140_.+\.sql$/.test(n));
const migracao = readFileSync(
  new URL(arquivos0140[0] ?? "0140_ausente.sql", pastaMigracoes),
  "utf8"
);
const sqlMigracao = migracao.replace(/--.*$/gm, "");

test("existe exatamente uma migração 0140, a do tutor", () => {
  assert.equal(arquivos0140.length, 1, arquivos0140.join(", "));
  assert.equal(arquivos0140[0], "0140_treinamento_curso_tutor.sql");
});

test("migração 0140: colunas tutor_nome e tutor_atendimento, idempotente, com os limites do front", () => {
  assert.match(sqlMigracao, /alter table public\.treinamento_curso/i);
  assert.match(sqlMigracao, /add column if not exists tutor_nome text/i);
  assert.match(sqlMigracao, /add column if not exists tutor_atendimento text/i);
  // os limites repetem o front (lib/ead-tutor.js: 120 e 300)
  assert.match(sqlMigracao, /char_length\(tutor_nome\)\s*<=\s*120/);
  assert.match(sqlMigracao, /char_length\(tutor_atendimento\)\s*<=\s*300/);
  // a restrição é recriada (reaplicar não falha) e, como não é NOT VALID, a criação varre a tabela inteira (são poucas linhas: sem efeito prático)
  assert.match(sqlMigracao, /drop constraint if exists treinamento_curso_tutor_nome_chk/i);
  assert.match(sqlMigracao, /drop constraint if exists treinamento_curso_tutor_atendimento_chk/i);
});

test("migração 0140: transação, sem mexer em dado real, termina em select 'ok' as res;", () => {
  assert.match(sqlMigracao, /^\s*begin;/im);
  assert.match(sqlMigracao, /^\s*commit;/im);
  assert.match(migracao.trimEnd(), /select 'ok' as res;$/);
  // D4: o tutor e o telefone o RH grava pela tela; a migração não preenche nada
  assert.doesNotMatch(sqlMigracao, /\bupdate\s+public\./i);
  assert.doesNotMatch(sqlMigracao, /\binsert\s+into\b/i);
  assert.doesNotMatch(sqlMigracao, /\bdelete\s+from\b/i);
  assert.doesNotMatch(sqlMigracao, /tutor_telefone\s*=/i);
});

test("migração 0140: sem UUID, e-mail, telefone, token nem URL (repositório público)", () => {
  assert.doesNotMatch(migracao, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  assert.doesNotMatch(migracao, /[\w.+-]+@[\w-]+\.[\w.-]+/);
  assert.doesNotMatch(migracao, /https?:\/\//i);
  assert.doesNotMatch(migracao, /\b\d{4,5}-\d{4}\b/);
});
