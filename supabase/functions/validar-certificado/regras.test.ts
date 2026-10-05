// Roda com Node 23.6+ (type stripping):  node --test supabase/functions/validar-certificado/regras.test.ts
//
// Dados sintéticos: nenhum nome, CPF, CNPJ ou IP reais (só endereços de documentação, RFC 5737).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  avaliarCertificado,
  conferirIntegridade,
  dataDeBrasilia,
  estaVencido,
  situacaoDoCertificado,
  validadeDoCertificado,
} from "./regras.ts";
import {
  HASH_VERSAO_CANONICO,
  hashDoCertificado,
  sha256Hex,
} from "../_shared/portal-funcionario.ts";

/** O que o `jsonb` faz com as chaves: ordena por tamanho e depois pelos bytes, em todos os níveis. */
function comoNoJsonb(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(comoNoJsonb);
  if (v !== null && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(o)
        .sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0))
        .map((k) => [k, comoNoJsonb(o[k])])
    );
  }
  return v;
}

const CODIGO = "ABCD-2345-WXYZ";

/** `dados` na ordem em que o servidor os monta na emissão (a mesma desde o 1º certificado). */
function dadosDeEmissao(validade: string | null = "2027-10-02") {
  return {
    aluno: { nome: "Aluno Teste", cpf: "00000000000", funcao: "Eletricista" },
    empresa: { nome: "Empresa Teste Ltda", cnpj: "00000000000000" },
    curso: {
      nome: "Curso Teste",
      codigo: "CT-01",
      carga_horaria_horas: 8,
      modalidade: "Ensino a distância (EAD) — NR-1, Anexo II",
      conteudo_programatico: null,
      aulas: [
        { modulo: "Módulo 1", titulo: "Aula 1" },
        { modulo: "Módulo 1", titulo: "Aula 2" },
      ],
    },
    periodo: { inicio: "2026-10-01", conclusao: "2026-10-02", validade },
    avaliacao: { nota: 86.67, tentativa: 1 },
    instrutor: { nome: "Instrutor Teste", qualificacao: "Qualificação Teste" },
    responsavel_tecnico: { nome: "RT Teste", registro: "CREA 000000" },
  };
}

function assinaturaDeEmissao(extra: Record<string, unknown> = {}) {
  return {
    metodo: "senha_pessoal_portal_funcionario",
    usuario: "00000000000",
    declaracao:
      "Declaro que realizei pessoalmente este treinamento, assisti às aulas e fiz a avaliação.",
    assinado_em: "2026-10-02T15:04:05.000Z",
    ip: "203.0.113.9",
    dispositivo: "Navegador/1.0",
    ...extra,
  };
}

/** Linha como o banco devolve para um certificado emitido pelo servidor novo (hash canônico). */
async function certificadoNovo(validade: string | null = "2027-10-02") {
  const dados = dadosDeEmissao(validade);
  const assinatura = assinaturaDeEmissao({ hash_versao: HASH_VERSAO_CANONICO });
  return {
    codigo: CODIGO,
    dados: comoNoJsonb(dados) as Record<string, unknown>,
    assinatura_aluno: comoNoJsonb(assinatura) as Record<string, unknown>,
    hash_sha256: await hashDoCertificado(CODIGO, dados, assinatura),
    revogado_em: null as string | null,
  };
}

/** Linha de um certificado emitido ANTES da T10: hash = SHA-256 do JSON.stringify na ordem de montagem. */
async function certificadoLegado() {
  const dados = dadosDeEmissao();
  const assinatura = assinaturaDeEmissao();
  return {
    codigo: CODIGO,
    dados: comoNoJsonb(dados) as Record<string, unknown>,
    assinatura_aluno: comoNoJsonb(assinatura) as Record<string, unknown>,
    hash_sha256: await sha256Hex(JSON.stringify({ codigo: CODIGO, dados, assinatura })),
    revogado_em: null as string | null,
  };
}

// ------------------------------------------------------------------ conferirIntegridade
test("integridade: certificado novo, como o banco devolve (chaves reordenadas), confere", async () => {
  const cert = await certificadoNovo();
  // o jsonb reordenou de fato: o JSON.stringify do que veio do banco não reproduz o hash antigo
  assert.notEqual(
    JSON.stringify(cert.dados),
    JSON.stringify(dadosDeEmissao()),
    "o teste só vale se o banco reordenar as chaves"
  );
  assert.deepEqual(await conferirIntegridade(cert), { integro: true, hash_versao: 2 });
});

test("integridade: a ordem das chaves não importa (mesmo objeto, outra ordem)", async () => {
  const cert = await certificadoNovo();
  const invertido = {
    ...cert,
    dados: Object.fromEntries(Object.entries(cert.dados).reverse()),
    assinatura_aluno: Object.fromEntries(Object.entries(cert.assinatura_aluno).reverse()),
  };
  assert.equal((await conferirIntegridade(invertido)).integro, true);
});

test("integridade: campo alterado em dados → integro = false", async () => {
  const cert = await certificadoNovo();
  const adulterado = {
    ...cert,
    dados: {
      ...cert.dados,
      aluno: { ...(cert.dados.aluno as object), nome: "Outro Aluno" },
    },
  };
  assert.deepEqual(await conferirIntegridade(adulterado), { integro: false, hash_versao: 2 });
});

test("integridade: validade esticada no banco → integro = false", async () => {
  const cert = await certificadoNovo("2026-10-03");
  const adulterado = {
    ...cert,
    dados: {
      ...cert.dados,
      periodo: { ...(cert.dados.periodo as object), validade: "2030-01-01" },
    },
  };
  assert.equal((await conferirIntegridade(adulterado)).integro, false);
});

test("integridade: assinatura alterada (IP, data) → integro = false", async () => {
  const cert = await certificadoNovo();
  const outroIp = { ...cert, assinatura_aluno: { ...cert.assinatura_aluno, ip: "203.0.113.10" } };
  assert.equal((await conferirIntegridade(outroIp)).integro, false);
  const outraData = {
    ...cert,
    assinatura_aluno: { ...cert.assinatura_aluno, assinado_em: "2026-10-03T15:04:05.000Z" },
  };
  assert.equal((await conferirIntegridade(outraData)).integro, false);
});

test("integridade: código ou hash gravado diferente → integro = false", async () => {
  const cert = await certificadoNovo();
  assert.equal((await conferirIntegridade({ ...cert, codigo: "ABCD-2345-WXYA" })).integro, false);
  assert.equal(
    (await conferirIntegridade({ ...cert, hash_sha256: "0".repeat(64) })).integro,
    false
  );
});

test("integridade: o hash gravado em maiúsculas ou com espaços sobrando ainda confere", async () => {
  const cert = await certificadoNovo();
  const r = await conferirIntegridade({
    ...cert,
    hash_sha256: ` ${cert.hash_sha256.toUpperCase()} `,
  });
  assert.equal(r.integro, true);
});

test("integridade: certificado ANTIGO (hash do JSON.stringify) continua conferindo, sem invalidar", async () => {
  const cert = await certificadoLegado();
  assert.deepEqual(await conferirIntegridade(cert), { integro: true, hash_versao: 1 });
});

test("integridade: antigo com avaliação nula, sem aulas e sem IP também reproduz", async () => {
  const base = dadosDeEmissao();
  const dados = { ...base, avaliacao: null, curso: { ...base.curso, aulas: [] } };
  const assinatura = assinaturaDeEmissao({ ip: null, dispositivo: null });
  const cert = {
    codigo: CODIGO,
    dados: comoNoJsonb(dados),
    assinatura_aluno: comoNoJsonb(assinatura),
    hash_sha256: await sha256Hex(JSON.stringify({ codigo: CODIGO, dados, assinatura })),
  };
  assert.deepEqual(await conferirIntegridade(cert), { integro: true, hash_versao: 1 });
});

test("integridade: antigo que não dá para refazer fica 'não verificável' (null), nunca reprovado", async () => {
  const cert = await certificadoLegado();
  // hash que não bate e sem a versão 2 na assinatura: pode ser uma forma antiga que não conhecemos
  const r = await conferirIntegridade({ ...cert, hash_sha256: "0".repeat(64) });
  assert.deepEqual(r, { integro: null, hash_versao: 1 });
});

test("integridade: a versão do hash vem da assinatura; ausente = versão 1", async () => {
  const novo = await certificadoNovo();
  assert.equal((await conferirIntegridade(novo)).hash_versao, 2);
  const antigo = await certificadoLegado();
  assert.equal((await conferirIntegridade(antigo)).hash_versao, 1);
});

// ------------------------------------------------------------------ data de Brasília / validade
test("dataDeBrasilia: 23h30 de Brasília ainda é o dia anterior ao do UTC", () => {
  assert.equal(dataDeBrasilia(new Date("2026-10-06T02:30:00Z")), "2026-10-05");
  assert.equal(dataDeBrasilia(new Date("2026-10-06T03:00:00Z")), "2026-10-06");
  assert.equal(dataDeBrasilia(new Date("2026-10-05T12:00:00Z")), "2026-10-05");
});

test("dataDeBrasilia: virada de ano", () => {
  assert.equal(dataDeBrasilia(new Date("2027-01-01T02:59:59Z")), "2026-12-31");
  assert.equal(dataDeBrasilia(new Date("2027-01-01T03:00:00Z")), "2027-01-01");
});

test("estaVencido: validade de ontem vence; a de hoje ainda vale; a de amanhã vale", () => {
  assert.equal(estaVencido("2026-10-04", "2026-10-05"), true);
  assert.equal(estaVencido("2026-10-05", "2026-10-05"), false);
  assert.equal(estaVencido("2026-10-06", "2026-10-05"), false);
});

test("estaVencido: sem validade (ou valor que não é data) nunca vence", () => {
  assert.equal(estaVencido(null, "2026-10-05"), false);
  assert.equal(estaVencido(undefined, "2026-10-05"), false);
  assert.equal(estaVencido("", "2026-10-05"), false);
  assert.equal(estaVencido("em breve", "2026-10-05"), false);
});

test("estaVencido: aceita a validade com hora (timestamp) e compara só o dia", () => {
  assert.equal(estaVencido("2026-10-04T23:59:59Z", "2026-10-05"), true);
  assert.equal(estaVencido("2026-10-05T00:00:00Z", "2026-10-05"), false);
});

test("validadeDoCertificado: lê dados.periodo.validade como AAAA-MM-DD ou null", () => {
  assert.equal(validadeDoCertificado({ periodo: { validade: "2027-10-02" } }), "2027-10-02");
  assert.equal(
    validadeDoCertificado({ periodo: { validade: "2027-10-02T10:00:00Z" } }),
    "2027-10-02"
  );
  assert.equal(validadeDoCertificado({ periodo: { validade: null } }), null);
  assert.equal(validadeDoCertificado({ periodo: {} }), null);
  assert.equal(validadeDoCertificado({}), null);
  assert.equal(validadeDoCertificado(null), null);
});

// ------------------------------------------------------------------ situação
test("situação: revogado tem prioridade; depois dados que não conferem; depois vencido", () => {
  assert.equal(
    situacaoDoCertificado({ revogado: true, integro: false, vencido: true }),
    "revogado"
  );
  assert.equal(
    situacaoDoCertificado({ revogado: false, integro: false, vencido: true }),
    "divergente"
  );
  assert.equal(situacaoDoCertificado({ revogado: false, integro: true, vencido: true }), "vencido");
  assert.equal(situacaoDoCertificado({ revogado: false, integro: true, vencido: false }), "valido");
});

test("situação: integridade 'não verificável' (null) não reprova o certificado", () => {
  assert.equal(situacaoDoCertificado({ revogado: false, integro: null, vencido: false }), "valido");
  assert.equal(situacaoDoCertificado({ revogado: false, integro: null, vencido: true }), "vencido");
});

// ------------------------------------------------------------------ avaliarCertificado
const HOJE = new Date("2026-10-05T15:00:00Z"); // 12h em Brasília, 05/10/2026

test("avaliar: certificado íntegro, no prazo, não revogado → válido", async () => {
  const r = await avaliarCertificado(await certificadoNovo("2027-10-02"), HOJE);
  assert.deepEqual(r, {
    situacao: "valido",
    valido: true,
    revogado: false,
    vencido: false,
    integro: true,
    hash_versao: 2,
    validade: "2027-10-02",
  });
});

test("avaliar: validade ontem → vencido (mas autêntico: integro continua true)", async () => {
  const r = await avaliarCertificado(await certificadoNovo("2026-10-04"), HOJE);
  assert.equal(r.situacao, "vencido");
  assert.equal(r.vencido, true);
  assert.equal(r.integro, true);
  assert.equal(r.valido, false);
  assert.equal(r.validade, "2026-10-04");
});

test("avaliar: validade hoje (data de Brasília) ainda é válido; passada a meia-noite, vencido", async () => {
  const cert = await certificadoNovo("2026-10-05");
  assert.equal((await avaliarCertificado(cert, HOJE)).situacao, "valido");
  // 22h de 05/10 em Brasília (já é 06/10 em UTC)
  assert.equal(
    (await avaliarCertificado(cert, new Date("2026-10-06T01:00:00Z"))).situacao,
    "valido"
  );
  // 00h de 06/10 em Brasília
  assert.equal(
    (await avaliarCertificado(cert, new Date("2026-10-06T03:00:00Z"))).situacao,
    "vencido"
  );
});

test("avaliar: sem validade (curso sem renovação) nunca vence", async () => {
  const r = await avaliarCertificado(await certificadoNovo(null), HOJE);
  assert.equal(r.situacao, "valido");
  assert.equal(r.vencido, false);
  assert.equal(r.validade, null);
});

test("avaliar: revogado → revogado, mesmo íntegro e no prazo", async () => {
  const cert = { ...(await certificadoNovo()), revogado_em: "2026-10-03T10:00:00Z" };
  const r = await avaliarCertificado(cert, HOJE);
  assert.equal(r.situacao, "revogado");
  assert.equal(r.revogado, true);
  assert.equal(r.valido, false);
});

test("avaliar: campo alterado → divergente (integro = false, valido = false)", async () => {
  const cert = await certificadoNovo();
  const adulterado = {
    ...cert,
    dados: { ...cert.dados, curso: { ...(cert.dados.curso as object), nome: "Curso Trocado" } },
  };
  const r = await avaliarCertificado(adulterado, HOJE);
  assert.equal(r.situacao, "divergente");
  assert.equal(r.integro, false);
  assert.equal(r.valido, false);
});

test("avaliar: certificado antigo íntegro e no prazo → válido, versão 1", async () => {
  const r = await avaliarCertificado(await certificadoLegado(), HOJE);
  assert.equal(r.situacao, "valido");
  assert.equal(r.integro, true);
  assert.equal(r.hash_versao, 1);
});
