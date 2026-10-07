// Roda com Node 23.6+ (type stripping):
//   node --test supabase/functions/portal-funcionario/avisos.test.ts
//
// T24: aviso ao RH quando o aluno gasta a última tentativa da prova e não passa. O servidor chama
// `notificar_gestores` (0036), que a 0110 deixa executar só pelo service_role; é o mesmo canal do resumo
// diário `alertar_treinamentos_ead` (0138). Dados sintéticos: nenhum nome, CPF ou empresa reais.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PERFIS_DO_AVISO,
  avisarGestores,
  avisoDeTentativasEsgotadas,
  esgotouAsTentativas,
} from "./avisos.ts";

const PEDIDO = {
  matriculaId: "mat-1",
  numero: 3,
  max: 3,
  funcionarioNome: "Funcionário Teste",
  cursoNome: "Curso Teste",
};

// ------------------------------------------------------------------ esgotouAsTentativas
test("esgotouAsTentativas: reprovado na última tentativa permitida esgotou", () => {
  assert.equal(esgotouAsTentativas({ aprovada: false, numero: 3, max: 3 }), true);
});

test("esgotouAsTentativas: reprovado antes da última ainda tem tentativa", () => {
  assert.equal(esgotouAsTentativas({ aprovada: false, numero: 1, max: 3 }), false);
  assert.equal(esgotouAsTentativas({ aprovada: false, numero: 2, max: 3 }), false);
});

test("esgotouAsTentativas: aprovado na última tentativa não é esgotamento", () => {
  assert.equal(esgotouAsTentativas({ aprovada: true, numero: 3, max: 3 }), false);
});

test("esgotouAsTentativas: sem limite de tentativas (max nulo) nunca esgota", () => {
  assert.equal(esgotouAsTentativas({ aprovada: false, numero: 50, max: null }), false);
});

test("esgotouAsTentativas: com tentativas extras liberadas o teto sobe e o aviso espera o novo teto", () => {
  // 3 do curso + 1 extra = 4: a 3ª reprovação não esgota, a 4ª esgota
  assert.equal(esgotouAsTentativas({ aprovada: false, numero: 3, max: 4 }), false);
  assert.equal(esgotouAsTentativas({ aprovada: false, numero: 4, max: 4 }), true);
});

// ------------------------------------------------------------------ avisoDeTentativasEsgotadas
test("avisoDeTentativasEsgotadas: diz quem, qual curso e como liberar, sem nota nem gabarito", () => {
  const a = avisoDeTentativasEsgotadas(PEDIDO);
  assert.equal(a.titulo, "Aluno esgotou as tentativas da prova");
  assert.match(a.mensagem, /Funcionário Teste/);
  assert.match(a.mensagem, /"Curso Teste"/);
  assert.match(a.mensagem, /3 tentativas/);
  assert.match(a.mensagem, /Liberar tentativa/);
  assert.doesNotMatch(a.mensagem, /nota|acerto|gabarito/i);
  assert.equal(a.tipo, "Sistema");
  assert.equal(a.prioridade, "Alta");
  assert.equal(a.link, "/SegurancaTrabalho");
  assert.deepEqual(a.perfis, PERFIS_DO_AVISO);
});

test("avisoDeTentativasEsgotadas: perfis são os mesmos do resumo diário da 0039", () => {
  assert.deepEqual(PERFIS_DO_AVISO, ["Admin Holding", "Admin", "Gestor"]);
});

test("avisoDeTentativasEsgotadas: a chave de deduplicação é por matrícula e por tentativa", () => {
  assert.equal(avisoDeTentativasEsgotadas(PEDIDO).dedupKey, "ead_tentativas:mat-1:3");
  // depois de o RH liberar uma extra e o aluno esgotar de novo, é outra chave: o RH é avisado de novo
  assert.equal(
    avisoDeTentativasEsgotadas({ ...PEDIDO, numero: 4, max: 4 }).dedupKey,
    "ead_tentativas:mat-1:4"
  );
  // outra matrícula, outra chave
  assert.notEqual(
    avisoDeTentativasEsgotadas({ ...PEDIDO, matriculaId: "mat-2" }).dedupKey,
    avisoDeTentativasEsgotadas(PEDIDO).dedupKey
  );
});

test("avisoDeTentativasEsgotadas: nome ou curso ausente não quebra o texto", () => {
  const a = avisoDeTentativasEsgotadas({ ...PEDIDO, funcionarioNome: null, cursoNome: undefined });
  assert.match(a.mensagem, /Um aluno/);
  assert.match(a.mensagem, /um curso do portal/);
  assert.doesNotMatch(a.mensagem, /null|undefined/);
});

test("avisoDeTentativasEsgotadas: nome gigante ou com quebra de linha é aparado", () => {
  const a = avisoDeTentativasEsgotadas({
    ...PEDIDO,
    funcionarioNome: `Ana\nMaria ${"x".repeat(300)}`,
    cursoNome: "Curso\tcom\r\ntabulação",
  });
  assert.doesNotMatch(a.mensagem, /[\r\n\t]/);
  assert.ok(a.mensagem.length < 600);
});

// ------------------------------------------------------------------ avisarGestores
type Chamada = { fn: string; args: Record<string, unknown> };
function banco(resposta: { error: unknown } | Error) {
  const chamadas: Chamada[] = [];
  return {
    chamadas,
    rpc: async (fn: string, args: Record<string, unknown>) => {
      chamadas.push({ fn, args });
      if (resposta instanceof Error) throw resposta;
      return resposta;
    },
  };
}

test("avisarGestores: chama notificar_gestores com a empresa da SESSÃO e os 8 parâmetros nomeados", async () => {
  const db = banco({ error: null });
  const aviso = avisoDeTentativasEsgotadas(PEDIDO);
  const enviou = await avisarGestores(db, "empresa-da-sessao", aviso);
  assert.equal(enviou, true);
  assert.equal(db.chamadas.length, 1);
  assert.equal(db.chamadas[0].fn, "notificar_gestores");
  assert.deepEqual(db.chamadas[0].args, {
    p_empresa_id: "empresa-da-sessao",
    p_perfis: PERFIS_DO_AVISO,
    p_titulo: aviso.titulo,
    p_mensagem: aviso.mensagem,
    p_link: "/SegurancaTrabalho",
    p_tipo: "Sistema",
    p_prioridade: "Alta",
    p_dedup_key: "ead_tentativas:mat-1:3",
  });
});

test("avisarGestores: erro do banco é só registrado, nunca derruba a resposta da prova", async () => {
  const db = banco({ error: { message: "permission denied for function notificar_gestores" } });
  assert.equal(await avisarGestores(db, "e", avisoDeTentativasEsgotadas(PEDIDO)), false);
});

test("avisarGestores: falha de rede (exceção) também é engolida", async () => {
  const db = banco(new Error("fetch failed"));
  assert.equal(await avisarGestores(db, "e", avisoDeTentativasEsgotadas(PEDIDO)), false);
});

// ------------------------------------------------------------------ o index.ts usa as regras
const codigoDoIndex = readFileSync(new URL("./index.ts", import.meta.url), "utf8")
  .split("\n")
  .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
  .join("\n");

// a ação `avaliacao`, do início até a `certificado` (o aviso só pode sair daqui)
const acaoAvaliacao = codigoDoIndex.slice(
  codigoDoIndex.indexOf('body.acao === "avaliacao"'),
  codigoDoIndex.indexOf('body.acao === "certificado"')
);

test("index.ts: o aviso sai na ação avaliacao, só depois de gravar a tentativa", () => {
  const gravou = acaoAvaliacao.indexOf('.from("treinamento_tentativa").insert');
  const esgotou = acaoAvaliacao.search(
    /esgotouAsTentativas\(\s*\{\s*aprovada\s*,\s*numero\s*,\s*max\s*\}\s*\)/
  );
  const avisou = acaoAvaliacao.search(/avisarGestores\(\s*supabase\s*,\s*empresaId\s*,/);
  assert.ok(gravou > 0, "a ação grava a tentativa");
  assert.ok(esgotou > gravou, "confere se esgotou as tentativas depois de gravar");
  assert.ok(avisou > esgotou, "e só então avisa o RH, com a empresa da sessão");
  assert.equal((codigoDoIndex.match(/avisarGestores\(/g) ?? []).length, 1);
});

test("index.ts: o nome do aluno e do curso vêm do banco pela sessão, não do corpo", () => {
  const bloco = acaoAvaliacao.slice(
    acaoAvaliacao.search(/esgotouAsTentativas\(/),
    acaoAvaliacao.search(/avisarGestores\(/) + 300
  );
  assert.match(bloco, /\.eq\("id",\s*mat\.curso_id\)/);
  assert.match(bloco, /\.eq\("id",\s*funcionarioId\)/);
  assert.equal((bloco.match(/\.eq\("empresa_id",\s*empresaId\)/g) ?? []).length, 2);
  assert.doesNotMatch(bloco, /body\./);
});

test("index.ts: falha ao avisar não derruba a resposta da prova (try/catch em volta)", () => {
  const bloco = acaoAvaliacao.slice(acaoAvaliacao.search(/esgotouAsTentativas\(/));
  assert.match(bloco, /try\s*\{[\s\S]*avisarGestores\([\s\S]*\}\s*catch\s*\(e\)/);
});
