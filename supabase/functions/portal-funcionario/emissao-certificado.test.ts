// Roda com Node 23.6+ (type stripping):
//   node --test supabase/functions/portal-funcionario/emissao-certificado.test.ts
//
// T10, M5: depois do INSERT do certificado, o hash tem de se reproduzir a partir do que o banco
// guardou. Se não se reproduz, o certificado NÃO é entregue e NÃO fica valendo (o banco não deixa
// o servidor apagar: a trilha é só de inclusão, 0135), então ele é ANULADO (revogado pelo sistema)
// e a emissão responde 500. Dados sintéticos: nenhum nome, CPF ou IP reais.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MOTIVO_EMISSAO_ANULADA,
  MSG_EMISSAO_ANULADA,
  POR_SISTEMA,
  conferirEmissaoDoCertificado,
  dadosDaAnulacaoNaEmissao,
} from "./regras.ts";
import { hashDoCertificado } from "../_shared/portal-funcionario.ts";

const CODIGO = "ABCD-2345-WXYZ";
const dados = { aluno: { nome: "Aluno Teste" }, curso: { carga_horaria_horas: 8, nota: 86.67 } };
const assinatura = { metodo: "senha_pessoal_portal_funcionario", hash_versao: 2 };

async function emitido() {
  return { hash: await hashDoCertificado(CODIGO, dados, assinatura) };
}

test("hash que se reproduz pelo banco: entrega o certificado e não anula nada", async () => {
  const { hash } = await emitido();
  let anulacoes = 0;
  const r = await conferirEmissaoDoCertificado({
    hashEmitido: hash,
    // o banco devolveu as chaves em outra ordem: o hash canônico não liga para isso
    gravado: {
      codigo: CODIGO,
      dados: { curso: { nota: 86.67, carga_horaria_horas: 8 }, aluno: { nome: "Aluno Teste" } },
      assinatura_aluno: { hash_versao: 2, metodo: "senha_pessoal_portal_funcionario" },
    },
    anular: async () => {
      anulacoes++;
      return true;
    },
  });
  assert.deepEqual(r, { entregar: true });
  assert.equal(anulacoes, 0);
});

test("hash que NÃO se reproduz: não entrega, anula o certificado e avisa a divergência", async () => {
  const { hash } = await emitido();
  let anulacoes = 0;
  const divergencias: string[] = [];
  const r = await conferirEmissaoDoCertificado({
    hashEmitido: hash,
    gravado: {
      codigo: CODIGO,
      // o banco guardou outro valor (arredondou, por exemplo)
      dados: { ...dados, curso: { carga_horaria_horas: 8, nota: 86.7 } },
      assinatura_aluno: assinatura,
    },
    anular: async () => {
      anulacoes++;
      return true;
    },
    aoDivergir: (refeito) => divergencias.push(refeito),
  });
  assert.deepEqual(r, { entregar: false, anulado: true });
  assert.equal(anulacoes, 1);
  assert.equal(divergencias.length, 1);
  assert.notEqual(divergencias[0], hash, "o aviso leva o hash refeito (o do banco)");
});

test("hash que não se reproduz e a anulação também falha: não entrega, e diz que não anulou", async () => {
  const { hash } = await emitido();
  const gravado = { codigo: CODIGO, dados: { ...dados, extra: 1 }, assinatura_aluno: assinatura };
  const semAnular = await conferirEmissaoDoCertificado({
    hashEmitido: hash,
    gravado,
    anular: async () => false,
  });
  assert.deepEqual(semAnular, { entregar: false, anulado: false });
  // a anulação que LANÇA nunca derruba a resposta: continua sendo "não entregar"
  const lancou = await conferirEmissaoDoCertificado({
    hashEmitido: hash,
    gravado,
    anular: async () => {
      throw new Error("banco fora do ar");
    },
  });
  assert.deepEqual(lancou, { entregar: false, anulado: false });
});

test("a anulação grava só as colunas da revogação, com o sistema como autor", () => {
  const agora = new Date("2026-10-06T12:00:00.000Z");
  const d = dadosDaAnulacaoNaEmissao(agora);
  assert.deepEqual(Object.keys(d).sort(), ["motivo_revogacao", "revogado_em", "revogado_por"]);
  assert.equal(d.revogado_em, "2026-10-06T12:00:00.000Z");
  assert.equal(d.revogado_por, POR_SISTEMA);
  assert.equal(d.motivo_revogacao, MOTIVO_EMISSAO_ANULADA);
  // o motivo aparece na consulta pública: texto curto, de uma linha, sem dado pessoal
  assert.ok(MOTIVO_EMISSAO_ANULADA.length >= 5 && MOTIVO_EMISSAO_ANULADA.length <= 300);
  assert.equal(/\n/.test(MOTIVO_EMISSAO_ANULADA), false);
});

test("a mensagem do 500 diz que nada foi entregue e manda avisar o RH (a nova tentativa não resolve)", () => {
  assert.match(MSG_EMISSAO_ANULADA, /nada foi entregue/i);
  assert.match(MSG_EMISSAO_ANULADA, /RH/);
});

// ------------------------------------------------------------------ o index.ts usa a regra
const codigoDoIndex = readFileSync(new URL("./index.ts", import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

test("index.ts: depois do INSERT confere o hash pelo que o banco devolveu e responde 500 se não bater", () => {
  const insert = codigoDoIndex.indexOf('.from("treinamento_certificado")\n          .insert(');
  assert.ok(insert > 0, "INSERT do certificado não encontrado");
  const trecho = codigoDoIndex.slice(insert);
  const conferencia = trecho.indexOf("conferirEmissaoDoCertificado(");
  assert.ok(conferencia > 0, "o index.ts não confere o hash depois do INSERT");
  // o que o banco devolveu (com o id, para poder anular) é o que se confere
  assert.match(trecho.slice(0, conferencia), /\.select\("id, codigo, dados, assinatura_aluno/);
  // não entrega: 500 com o código próprio, ANTES de devolver o certificado
  const recusa = trecho.indexOf("!emissao.entregar");
  assert.ok(recusa > conferencia, "falta recusar a entrega quando o hash não confere");
  const resposta = trecho.slice(recusa, recusa + 700);
  assert.match(resposta, /fail\(MSG_EMISSAO_ANULADA,\s*500,\s*\{\s*codigo:\s*"EMISSAO_ANULADA"/);
  assert.match(resposta, /console\.error\(/);
  const entrega = trecho.indexOf("return ok({ certificado: { ...certificado, revogado: false } })");
  assert.ok(entrega > recusa, "o certificado só é devolvido depois da conferência");
  // o id interno da linha não vai ao navegador
  assert.match(
    trecho.slice(recusa, entrega),
    /const \{ id: _idDaLinha, \.\.\.certificado \} = cert/
  );
});

test("index.ts: a anulação é a revogação do sistema (colunas da regra, só se ainda não revogado)", () => {
  const updates = [...codigoDoIndex.matchAll(/\.from\("treinamento_certificado"\)\s*\.update\(/g)];
  assert.equal(updates.length, 1, "esperava só a anulação do certificado recém-emitido");
  const trecho = codigoDoIndex.slice(updates[0].index, updates[0].index + 400);
  assert.match(trecho, /\.update\(dadosDaAnulacaoNaEmissao\(/);
  assert.match(trecho, /\.eq\("empresa_id",\s*empresaId\)/);
  assert.match(trecho, /\.is\("revogado_em",\s*null\)/);
});

test("index.ts: a anulação deixa o evento certificado_revogado na trilha, com o sistema como autor", () => {
  const inicio = codigoDoIndex.indexOf("!emissao.entregar");
  const trecho = codigoDoIndex.slice(inicio, inicio + 900);
  assert.match(trecho, /evento:\s*EVENTO_CERTIFICADO_REVOGADO/);
  assert.match(trecho, /por:\s*POR_SISTEMA/);
});
