// Roda com Node 23.6+ (type stripping):
//   node --test supabase/functions/portal-funcionario/tipo-treinamento.test.ts
//
// T23: tipo do treinamento (inicial, periódico, eventual) e motivo do eventual. A matrícula guarda os dois
// (migração 0142); na emissão eles são CONGELADOS em `dados` do certificado e, por isso, entram no hash. Dados
// sintéticos: nenhum nome, CPF ou motivo real.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MOTIVO_EVENTUAL_MAX,
  MOTIVO_EVENTUAL_MIN,
  TIPOS_DE_TREINAMENTO,
  dadosDoTipoNoCertificado,
} from "./tipo-treinamento.ts";
import { hashDoCertificado } from "../_shared/portal-funcionario.ts";
import { COLUNAS_MATRICULA_ALUNO, COLUNAS_MATRICULA_PORTAL, matriculaParaAluno } from "./regras.ts";
// o espelho do front: tem de dizer a mesma coisa (o arquivo não tem import de alias)
import {
  MOTIVO_EVENTUAL_MAX as MOTIVO_EVENTUAL_MAX_FRONT,
  MOTIVO_EVENTUAL_MIN as MOTIVO_EVENTUAL_MIN_FRONT,
  TIPOS_DE_TREINAMENTO as TIPOS_DE_TREINAMENTO_FRONT,
  linhasDoTipoNoCertificado,
  rotuloDoTipo,
  tipoPublicoDoCertificado,
} from "../../../apps/web/src/lib/ead-tipo-matricula.js";

test("os três tipos da NR-1 (1.7.1.2) e os limites do motivo são os da migração 0142", () => {
  assert.deepEqual([...TIPOS_DE_TREINAMENTO], ["inicial", "periodico", "eventual"]);
  assert.equal(MOTIVO_EVENTUAL_MIN, 3);
  assert.equal(MOTIVO_EVENTUAL_MAX, 200);
  const sql = readFileSync(
    new URL("../../migrations/0142_ead_tipo_e_pre_requisito.sql", import.meta.url),
    "utf8"
  );
  assert.ok(sql.includes("tipo in ('inicial', 'periodico', 'eventual')"));
  assert.ok(sql.includes(`>= ${MOTIVO_EVENTUAL_MIN}`));
  assert.ok(sql.includes(`<= ${MOTIVO_EVENTUAL_MAX}`));
});

test("inicial e periódico entram no certificado só com o tipo, sem motivo", () => {
  assert.deepEqual(dadosDoTipoNoCertificado({ tipo: "inicial", motivo_eventual: null }), {
    tipo_treinamento: "inicial",
  });
  assert.deepEqual(dadosDoTipoNoCertificado({ tipo: "periodico", motivo_eventual: null }), {
    tipo_treinamento: "periodico",
  });
});

test("inicial e periódico nunca levam motivo, mesmo que a linha traga um (o banco recusa, o servidor também)", () => {
  assert.deepEqual(
    dadosDoTipoNoCertificado({ tipo: "periodico", motivo_eventual: "texto solto" }),
    {
      tipo_treinamento: "periodico",
    }
  );
});

test("eventual entra com o motivo, sem os espaços das pontas", () => {
  assert.deepEqual(
    dadosDoTipoNoCertificado({ tipo: "eventual", motivo_eventual: "  Mudança de procedimento  " }),
    { tipo_treinamento: "eventual", motivo_eventual: "Mudança de procedimento" }
  );
});

test("eventual sem motivo, ou com motivo curto ou longo demais, não afirma nada (certificado sem o tipo)", () => {
  for (const motivo of [
    null,
    undefined,
    "",
    "   ",
    "ab",
    "x".repeat(MOTIVO_EVENTUAL_MAX + 1),
    42,
  ]) {
    assert.deepEqual(
      dadosDoTipoNoCertificado({ tipo: "eventual", motivo_eventual: motivo as never }),
      {},
      String(motivo)
    );
  }
  // exatamente nos limites: vale
  assert.equal(
    dadosDoTipoNoCertificado({ tipo: "eventual", motivo_eventual: "abc" }).motivo_eventual,
    "abc"
  );
  const maximo = "x".repeat(MOTIVO_EVENTUAL_MAX);
  assert.equal(
    dadosDoTipoNoCertificado({ tipo: "eventual", motivo_eventual: maximo }).motivo_eventual,
    maximo
  );
});

test("tipo ausente ou desconhecido não vira 'inicial' em silêncio: o certificado sai sem a informação", () => {
  for (const mat of [
    {},
    { tipo: null },
    { tipo: "" },
    { tipo: "Inicial" },
    { tipo: "reciclagem" },
    { tipo: 1 },
    null,
    undefined,
  ]) {
    assert.deepEqual(dadosDoTipoNoCertificado(mat as never), {}, JSON.stringify(mat));
  }
});

test("o tipo e o motivo entram no hash: mudar um deles muda o selo do certificado", async () => {
  const base = { aluno: { nome: "Aluno Teste" }, curso: { nome: "Curso Teste" } };
  const assinatura = { metodo: "senha_pessoal_portal_funcionario", hash_versao: 2 };
  const codigo = "ABCD-2345-WXYZ";
  const hash = (extra: Record<string, unknown>) =>
    hashDoCertificado(codigo, { ...base, ...extra }, assinatura);
  const inicial = await hash(dadosDoTipoNoCertificado({ tipo: "inicial" }));
  const periodico = await hash(dadosDoTipoNoCertificado({ tipo: "periodico" }));
  const eventualA = await hash(
    dadosDoTipoNoCertificado({ tipo: "eventual", motivo_eventual: "Motivo A" })
  );
  const eventualB = await hash(
    dadosDoTipoNoCertificado({ tipo: "eventual", motivo_eventual: "Motivo B" })
  );
  assert.equal(new Set([inicial, periodico, eventualA, eventualB]).size, 4);
  // certificado antigo (sem as chaves) continua com o hash de sempre
  assert.equal(await hash({}), await hashDoCertificado(codigo, base, assinatura));
});

test("o espelho do front lê de volta o que o servidor congela no certificado", () => {
  const casos = [
    { tipo: "inicial", motivo_eventual: null },
    { tipo: "periodico", motivo_eventual: null },
    { tipo: "eventual", motivo_eventual: "  Mudança de procedimento " },
  ];
  for (const mat of casos) {
    const dados = dadosDoTipoNoCertificado(mat);
    const publico = tipoPublicoDoCertificado(dados);
    assert.equal(publico?.tipo, mat.tipo);
    assert.equal(publico?.motivo ?? null, mat.motivo_eventual ? mat.motivo_eventual.trim() : null);
    assert.equal(
      linhasDoTipoNoCertificado(dados)[0],
      `Tipo de treinamento: ${rotuloDoTipo(mat.tipo)}`
    );
  }
  // o que o servidor recusa afirmar, a tela também não imprime
  const semMotivo = dadosDoTipoNoCertificado({ tipo: "eventual", motivo_eventual: null });
  assert.deepEqual(linhasDoTipoNoCertificado(semMotivo), []);
  // os limites do front são os do servidor (e os do CHECK da migração)
  assert.equal(MOTIVO_EVENTUAL_MIN_FRONT, MOTIVO_EVENTUAL_MIN);
  assert.equal(MOTIVO_EVENTUAL_MAX_FRONT, MOTIVO_EVENTUAL_MAX);
  assert.deepEqual([...TIPOS_DE_TREINAMENTO_FRONT], [...TIPOS_DE_TREINAMENTO]);
});

test("o servidor lê o tipo e o motivo da matrícula; a tela do aluno não os recebe", () => {
  const colunas = COLUNAS_MATRICULA_PORTAL.split(",").map((c) => c.trim());
  assert.ok(colunas.includes("tipo"));
  assert.ok(colunas.includes("motivo_eventual"));
  // o `select` do servidor é a lista do aluno MAIS o que só o servidor lê: o tipo não sai em `dados.matricula`
  for (const c of ["tipo", "motivo_eventual"]) {
    assert.equal((COLUNAS_MATRICULA_ALUNO as readonly string[]).includes(c), false, c);
  }
  const saida = matriculaParaAluno({
    id: "m1",
    curso_id: "c1",
    avaliacao_aprovada: true,
    tipo: "eventual",
    motivo_eventual: "motivo interno",
  });
  assert.equal("tipo" in saida, false);
  assert.equal("motivo_eventual" in saida, false);
});
