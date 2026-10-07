// Roda com Node 23.6+ (type stripping):  node --test supabase/functions/funcionario-acesso/duvida.test.ts
//
// A6 (T21): editar a resposta de uma dúvida do tutor passa pelo servidor, que guarda a versão ANTERIOR na
// trilha (evento `duvida_resposta_editada`, só de inclusão, migração 0135). Antes a tela do RH sobrescrevia
// `resposta`, `respondida_por` e `respondida_em` sem rastro, e o aluno podia ter lido a primeira versão.
// Dados sintéticos: nenhum nome, e-mail ou identificador real.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  ACOES_DE_DUVIDA,
  MENSAGEM_SEM_EDICAO_DA_RESPOSTA,
  RESPOSTA_MAX,
  dadosDaEdicao,
  dadosParaDesfazerEdicao,
  decidirEdicaoDaResposta,
  detalheDaEdicao,
  falhaDoRegistroDaEdicao,
  validarDuvidaId,
  validarRespostaDaDuvida,
} from "./duvida.ts";
import { EVENTO_DUVIDA_RESPOSTA_EDITADA } from "../_shared/portal-funcionario.ts";

const ID = "3f2b8c1e-5d4a-4b6e-9c7d-0a1b2c3d4e5f";
const respondida = {
  id: ID,
  empresa_id: "empresa-teste",
  resposta: "Resposta original do tutor.",
  respondida_por: "Tutor Teste",
  respondida_em: "2026-10-05T12:00:00+00:00",
  updated_at: "2026-10-05T12:00:00.123456+00:00",
  deleted_at: null,
};

test("a ação nova é só de dúvida e se chama editar_resposta_duvida", () => {
  assert.deepEqual([...ACOES_DE_DUVIDA], ["editar_resposta_duvida"]);
});

test("o evento é de nome fixo, e a mensagem de falta de permissão fala de Funcionários", () => {
  assert.equal(EVENTO_DUVIDA_RESPOSTA_EDITADA, "duvida_resposta_editada");
  assert.match(MENSAGEM_SEM_EDICAO_DA_RESPOSTA, /editar Funcionários/);
});

test("validarDuvidaId: aceita só uuid (com espaços, em maiúscula); o resto é 400 sem ir ao banco", () => {
  assert.deepEqual(validarDuvidaId(` ${ID.toUpperCase()} `), { ok: true, id: ID });
  for (const ruim of [undefined, null, "", "abc", 42, {}, ID + "x", "1; drop table x"]) {
    const r = validarDuvidaId(ruim);
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.status, 400);
      assert.match(r.mensagem, /duvida_id/);
    }
  }
});

test("validarRespostaDaDuvida: tira as pontas e guarda as quebras de linha; vazio e longo demais são 400", () => {
  assert.deepEqual(validarRespostaDaDuvida("  Linha 1\nLinha 2  "), {
    ok: true,
    resposta: "Linha 1\nLinha 2",
  });
  for (const vazio of [undefined, null, "", "   \n ", 42, {}]) {
    const r = validarRespostaDaDuvida(vazio);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.status, 400);
  }
  assert.equal(validarRespostaDaDuvida("x".repeat(RESPOSTA_MAX)).ok, true);
  const longa = validarRespostaDaDuvida("x".repeat(RESPOSTA_MAX + 1));
  assert.equal(longa.ok, false);
  if (!longa.ok) {
    assert.equal(longa.status, 400);
    assert.match(longa.mensagem, new RegExp(String(RESPOSTA_MAX)));
  }
});

test("decidirEdicaoDaResposta: texto novo devolve a versão anterior inteira e a marca de leitura", () => {
  const r = decidirEdicaoDaResposta(respondida, "Resposta corrigida.");
  assert.equal(r.ok, true);
  if (r.ok && r.mudou) {
    assert.deepEqual(r.anterior, {
      resposta: "Resposta original do tutor.",
      respondida_por: "Tutor Teste",
      respondida_em: "2026-10-05T12:00:00+00:00",
    });
    // a gravação só vale se ninguém mexeu na dúvida no meio (trava otimista)
    assert.equal(r.lidaEm, "2026-10-05T12:00:00.123456+00:00");
  } else {
    assert.fail("esperava uma edição");
  }
});

test("decidirEdicaoDaResposta: o mesmo texto (só espaços diferentes nas pontas) não muda nada", () => {
  const r = decidirEdicaoDaResposta(respondida, "  Resposta original do tutor.  ");
  assert.deepEqual(r, { ok: true, mudou: false });
});

test("decidirEdicaoDaResposta: dúvida inexistente ou excluída é 404; sem resposta ainda é 409 (não é edição)", () => {
  for (const sumida of [null, undefined, { ...respondida, deleted_at: "2026-10-06T00:00:00Z" }]) {
    const r = decidirEdicaoDaResposta(sumida, "x");
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.status, 404);
  }
  for (const resposta of [null, "", "   "]) {
    const r = decidirEdicaoDaResposta({ ...respondida, resposta }, "x");
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.status, 409);
      assert.equal(r.codigo, "SEM_RESPOSTA");
    }
  }
});

test("detalheDaEdicao: quem editou, a dúvida e a versão anterior inteira (resposta, autor e hora)", () => {
  const d = detalheDaEdicao({
    por: "rh@teste.invalid",
    duvidaId: ID,
    anterior: {
      resposta: "Resposta original do tutor.",
      respondida_por: "Tutor Teste",
      respondida_em: "2026-10-05T12:00:00+00:00",
    },
  });
  assert.deepEqual(d, {
    por: "rh@teste.invalid",
    duvida_id: ID,
    resposta_anterior: "Resposta original do tutor.",
    respondida_por_anterior: "Tutor Teste",
    respondida_em_anterior: "2026-10-05T12:00:00+00:00",
  });
});

test("dadosDaEdicao e dadosParaDesfazerEdicao mexem nas mesmas três colunas (as que o gatilho da dúvida deixa)", () => {
  const agora = new Date("2026-10-07T10:00:00.000Z");
  const nova = dadosDaEdicao({ resposta: "Nova.", por: "Fulano de Tal", agora });
  assert.deepEqual(nova, {
    resposta: "Nova.",
    respondida_por: "Fulano de Tal",
    respondida_em: "2026-10-07T10:00:00.000Z",
  });
  const volta = dadosParaDesfazerEdicao({
    resposta: "Antiga.",
    respondida_por: "Tutor Teste",
    respondida_em: "2026-10-05T12:00:00+00:00",
  });
  assert.deepEqual(Object.keys(volta).sort(), Object.keys(nova).sort());
  assert.deepEqual(volta, {
    resposta: "Antiga.",
    respondida_por: "Tutor Teste",
    respondida_em: "2026-10-05T12:00:00+00:00",
  });
});

test("falhaDoRegistroDaEdicao: desfeita = tente de novo; sem registro = NÃO edite de novo e avise o suporte", () => {
  const desfeita = falhaDoRegistroDaEdicao("desfeito");
  assert.equal(desfeita.status, 500);
  assert.equal(desfeita.codigo, "TRILHA_FALHOU");
  assert.match(desfeita.mensagem, /resposta anterior foi mantida/i);
  assert.match(desfeita.mensagem, /tente de novo/i);
  const sem = falhaDoRegistroDaEdicao("sem_registro");
  assert.equal(sem.status, 500);
  assert.equal(sem.codigo, "EFEITO_SEM_REGISTRO");
  assert.match(sem.mensagem, /NÃO edite/);
  assert.match(sem.mensagem, /suporte/i);
});

// ------------------------------------------------------------------------------------ o index.ts usa as regras
const codigoDoIndex = readFileSync(fileURLToPath(new URL("./index.ts", import.meta.url)), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

function corpoDa(nome: string): string {
  const inicio = codigoDoIndex.indexOf(`async function ${nome}(`);
  assert.ok(inicio >= 0, `função ${nome} não encontrada`);
  const fim = codigoDoIndex.indexOf("\nasync function ", inicio + 10);
  const deno = codigoDoIndex.indexOf("\nDeno.serve(", inicio);
  return codigoDoIndex.slice(inicio, Math.min(...[fim, deno].filter((n) => n > inicio)));
}

test("index.ts: a ação exige a permissão 'editar' e lê a dúvida só da empresa da sessão", () => {
  const principal = codigoDoIndex.slice(codigoDoIndex.indexOf("Deno.serve("));
  const bloco = principal.slice(principal.indexOf("ACOES_DE_DUVIDA.has(acao)"));
  assert.ok(principal.includes("ACOES_DE_DUVIDA.has(acao)"));
  assert.ok(
    bloco.indexOf("if (!podeEditar)") >= 0 &&
      bloco.indexOf("if (!podeEditar)") < bloco.indexOf("duvidaDoChamador("),
    "a permissão vem antes de ler a dúvida"
  );
  assert.match(bloco, /MENSAGEM_SEM_EDICAO_DA_RESPOSTA/);
  const leitura = corpoDa("duvidaDoChamador");
  assert.match(leitura, /\.from\("treinamento_duvida"\)/);
  assert.match(leitura, /!staff\.is_super_admin && data\.empresa_id !== staff\.empresa_id/);
  assert.match(leitura, /error/);
});

test("index.ts: a edição grava com trava otimista, registra a versão anterior e desfaz se a trilha falhar", () => {
  const corpo = corpoDa("editarRespostaDaDuvida");
  assert.match(corpo, /decidirEdicaoDaResposta\(/);
  // só grava se a dúvida continua como foi lida (updated_at) e na empresa da dúvida
  assert.match(corpo, /\.eq\("updated_at", decisao\.lidaEm\)/);
  assert.match(corpo, /\.eq\("empresa_id", duvida\.empresa_id\)/);
  assert.match(corpo, /registrarOuDesfazer\(/);
  assert.match(corpo, /evento:\s*EVENTO_DUVIDA_RESPOSTA_EDITADA/);
  assert.match(corpo, /detalheDaEdicao\(\{[\s\S]*por:\s*staff\.email/);
  assert.match(corpo, /dadosParaDesfazerEdicao\(decisao\.anterior\)/);
  assert.match(corpo, /falhaDoRegistroDaEdicao\(registro\)/);
  // sem o registro nem o desfazer, a versão anterior só existe no log: ele a leva inteira
  assert.match(corpo, /EFEITO SEM REGISTRO[\s\S]{0,500}decisao\.anterior/);
  // o autor vem da sessão, nunca do corpo
  assert.doesNotMatch(corpo, /body\./);
  // a causa de um passo que lança fica no log
  assert.match(corpo, /aoFalhar:\s*\(passo, erro\) =>/);
});
