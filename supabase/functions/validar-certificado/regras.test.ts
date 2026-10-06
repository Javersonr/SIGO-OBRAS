// Roda com Node 23.6+ (type stripping):  node --test supabase/functions/validar-certificado/regras.test.ts
//
// Dados sintéticos: nenhum nome, CPF, CNPJ ou IP reais (só endereços de documentação, RFC 5737).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  avaliarCertificado,
  conferirIntegridade,
  dataDeBrasilia,
  estaVencido,
  localDoCertificado,
  resultadoDaConsulta,
  responsavelTecnicoPublico,
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

test("integridade: antigo que não dá para refazer NÃO confere (false), nunca 'não verificável' (null)", async () => {
  const cert = await certificadoLegado();
  // hash que não bate, sem hash_versao: nem a v1 nem a v2 reproduzem, então o registro não confere
  const r = await conferirIntegridade({ ...cert, hash_sha256: "0".repeat(64) });
  assert.deepEqual(r, { integro: false, hash_versao: 1 });
});

test("integridade: apagar o hash_versao de um certificado novo não rebaixa para a v1 (T10, M1)", async () => {
  const cert = await certificadoNovo();
  const { hash_versao: _tirada, ...semVersao } = cert.assinatura_aluno;
  // 1) só a versão apagada, o resto intacto: o hash gravado era da assinatura COM a versão
  const soSemVersao = await conferirIntegridade({ ...cert, assinatura_aluno: semVersao });
  assert.equal(soSemVersao.integro, false);
  // 2) versão apagada E a validade esticada: antes virava `null` ("válido" na página); agora não confere
  const esticado = {
    ...cert,
    assinatura_aluno: semVersao,
    dados: {
      ...cert.dados,
      periodo: { ...(cert.dados.periodo as object), validade: "2030-01-01" },
    },
  };
  const r = await conferirIntegridade(esticado);
  assert.equal(r.integro, false);
  assert.notEqual(r.integro, null);
});

test("integridade: sem hash_versao tenta a v1 e, se não bater, a v2 (hash canônico sem a versão)", async () => {
  // uma assinatura sem hash_versao cujo hash foi calculado pela v2: a segunda tentativa reproduz
  const dados = dadosDeEmissao();
  const assinatura = assinaturaDeEmissao();
  const cert = {
    codigo: CODIGO,
    dados: comoNoJsonb(dados),
    assinatura_aluno: comoNoJsonb(assinatura),
    hash_sha256: await hashDoCertificado(CODIGO, dados, assinatura),
  };
  assert.deepEqual(await conferirIntegridade(cert), { integro: true, hash_versao: 2 });
});

test("integridade: com hash_versao 2 gravada, a v1 nunca é tentada", async () => {
  // o hash gravado é o da v1 (JSON.stringify na ordem antiga) mas a assinatura diz v2: não confere
  const legado = await certificadoLegado();
  const r = await conferirIntegridade({
    ...legado,
    assinatura_aluno: { ...legado.assinatura_aluno, hash_versao: HASH_VERSAO_CANONICO },
  });
  assert.deepEqual(r, { integro: false, hash_versao: 2 });
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

// ------------------------------------------------------------------ local (T8)
test("localDoCertificado: devolve o ambiente gravado em dados.local; sem local, null", () => {
  assert.deepEqual(
    localDoCertificado({
      local: { ambiente: "Plataforma de Teste — https://exemplo.test/portal" },
    }),
    { ambiente: "Plataforma de Teste — https://exemplo.test/portal" }
  );
  // certificado emitido antes da T8 não tem local: a página só não mostra a linha
  assert.equal(localDoCertificado({}), null);
  assert.equal(localDoCertificado({ local: null }), null);
  assert.equal(localDoCertificado({ local: {} }), null);
  assert.equal(localDoCertificado(null), null);
  assert.equal(localDoCertificado({ local: "texto solto" }), null);
});

test("localDoCertificado: só o ambiente sai na consulta pública (nada além dele)", () => {
  const l = localDoCertificado({ local: { ambiente: "Plataforma", interno: "não sai" } });
  assert.deepEqual(l, { ambiente: "Plataforma" });
});

// ------------------------------------------------------------------ responsável técnico (T29)
test("responsavelTecnicoPublico: só nome e registro saem na consulta pública, nunca a referência da assinatura", () => {
  const r = responsavelTecnicoPublico({
    responsavel_tecnico: {
      nome: "RT de Teste",
      registro: "CREA-XX 0000",
      assinatura_ref: "assinaturas/empresa-teste/2026/10/aaaa-rt.png",
    },
  });
  assert.deepEqual(r, { nome: "RT de Teste", registro: "CREA-XX 0000" });
  assert.ok(!JSON.stringify(r).includes("assinaturas/"));
});

test("responsavelTecnicoPublico: certificado antigo e dados fora do formato viram null (a página só não mostra)", () => {
  assert.deepEqual(responsavelTecnicoPublico({ responsavel_tecnico: { nome: "RT de Teste" } }), {
    nome: "RT de Teste",
    registro: null,
  });
  for (const dados of [
    null,
    undefined,
    {},
    { responsavel_tecnico: null },
    { responsavel_tecnico: "x" },
  ]) {
    assert.equal(responsavelTecnicoPublico(dados), null);
  }
  // sem nome não há o que mostrar
  assert.equal(
    responsavelTecnicoPublico({ responsavel_tecnico: { registro: "CREA-XX 0000" } }),
    null
  );
});

test("index.ts: a consulta pública usa responsavelTecnicoPublico (não devolve o objeto gravado inteiro)", () => {
  const codigo = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  assert.match(codigo, /responsavel_tecnico:\s*responsavelTecnicoPublico\(d\)/);
  assert.doesNotMatch(codigo, /responsavel_tecnico:\s*d\.responsavel_tecnico/);
});

test("integridade: certificado com local e modalidade nova confere do mesmo jeito", async () => {
  const dados = {
    ...dadosDeEmissao(),
    local: { ambiente: "Plataforma de Teste — https://exemplo.test/portal" },
  };
  const assinatura = assinaturaDeEmissao({ hash_versao: HASH_VERSAO_CANONICO });
  const cert = {
    codigo: CODIGO,
    dados: comoNoJsonb(dados) as Record<string, unknown>,
    assinatura_aluno: comoNoJsonb(assinatura) as Record<string, unknown>,
    hash_sha256: await hashDoCertificado(CODIGO, dados, assinatura),
  };
  assert.deepEqual(await conferirIntegridade(cert), { integro: true, hash_versao: 2 });
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

test("situação: integridade que não é true (inclusive null vindo de fora) reprova: nunca 'válido'", () => {
  assert.equal(
    situacaoDoCertificado({ revogado: false, integro: null as unknown as boolean, vencido: false }),
    "divergente"
  );
  assert.equal(
    situacaoDoCertificado({
      revogado: false,
      integro: undefined as unknown as boolean,
      vencido: true,
    }),
    "divergente"
  );
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

test("avaliar: sem hash_versao e com a validade esticada → divergente, não 'válido' (T10, M1)", async () => {
  const cert = await certificadoNovo("2026-10-03");
  const { hash_versao: _tirada, ...semVersao } = cert.assinatura_aluno;
  const adulterado = {
    ...cert,
    assinatura_aluno: semVersao,
    dados: {
      ...cert.dados,
      periodo: { ...(cert.dados.periodo as object), validade: "2030-01-01" },
    },
  };
  const r = await avaliarCertificado(adulterado, HOJE);
  assert.equal(r.situacao, "divergente");
  assert.equal(r.integro, false);
  assert.equal(r.valido, false);
});

// ------------------------------------------------------------------ resultadoDaConsulta (T10, M7)
test("consulta: erro do banco é erro (500), nunca 'nenhum certificado' (T10, M7)", () => {
  const r = resultadoDaConsulta({ data: null, error: { message: "conexão caiu", code: "08006" } });
  assert.equal(r.tipo, "erro");
  // mesmo que o banco devolva uma linha junto com o erro, o erro vale
  assert.equal(
    resultadoDaConsulta({ data: { codigo: "X" }, error: { message: "falha" } }).tipo,
    "erro"
  );
});

test("consulta: sem erro e sem linha = não encontrado; com linha = encontrado", () => {
  assert.deepEqual(resultadoDaConsulta({ data: null, error: null }), { tipo: "nao_encontrado" });
  assert.deepEqual(resultadoDaConsulta({ data: undefined, error: undefined }), {
    tipo: "nao_encontrado",
  });
  const cert = { codigo: CODIGO };
  assert.deepEqual(resultadoDaConsulta({ data: cert, error: null }), {
    tipo: "encontrado",
    certificado: cert,
  });
});

test("index.ts: o erro do select vira 500 (com console.error) antes de 'não encontrado'", () => {
  const index = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  const leitura = index.indexOf("resultadoDaConsulta(leitura)");
  assert.ok(leitura > 0, "o index.ts não usa resultadoDaConsulta");
  const erro = index.indexOf('consulta.tipo === "erro"', leitura);
  const naoAchou = index.indexOf('consulta.tipo === "nao_encontrado"', leitura);
  assert.ok(
    erro > leitura && naoAchou > erro,
    "o erro tem de ser tratado antes do 'não encontrado'"
  );
  const bloco = index.slice(erro, naoAchou);
  assert.match(bloco, /console\.error\(/);
  assert.match(bloco, /fail\([\s\S]*?,\s*500\s*\)/);
  // a leitura não descarta o error (era o defeito: const { data: cert } = ...)
  assert.equal(/const \{ data: cert \}/.test(index), false);
});
