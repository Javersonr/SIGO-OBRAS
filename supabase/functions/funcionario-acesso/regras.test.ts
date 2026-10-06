// Roda com Node 23.6+ (type stripping):  node --test supabase/functions/funcionario-acesso/regras.test.ts
//
// Regras das ações do RH sobre a matrícula (T18): liberar tentativa e revogar certificado. Dados
// sintéticos: nenhum nome, telefone, e-mail ou identificador real.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  ACOES_DE_MATRICULA,
  MOTIVO_REVOGACAO_MAX,
  MOTIVO_REVOGACAO_MIN,
  MENSAGEM_SEM_EDICAO,
  TEMPO_LIMITE_AVISO_MS,
  avisarAluno,
  dadosDaRevogacao,
  dadosParaDesfazerRevogacao,
  decidirLiberacao,
  decidirRevogacao,
  destinoDoAviso,
  detalheDaLiberacao,
  detalheDaRevogacao,
  falhaDoRegistro,
  motivoDaRevogacao,
  registrarOuDesfazer,
  textoAvisoRevogacao,
  validarMatriculaId,
} from "./regras.ts";

const ID = "3f2b8c1e-5d4a-4b6e-9c7d-0a1b2c3d4e5f";

// ------------------------------------------------------------ as ações
test("ações de matrícula: nomes combinados com a tela", () => {
  assert.deepEqual([...ACOES_DE_MATRICULA].sort(), ["liberar_tentativa", "revogar_certificado"]);
});

test("cada ação de matrícula tem a mensagem de falta de permissão (e fala de Funcionários)", () => {
  for (const acao of ACOES_DE_MATRICULA) {
    const msg = MENSAGEM_SEM_EDICAO[acao];
    assert.ok(msg && /Funcionários/.test(msg), `${acao}: ${msg}`);
  }
  assert.match(MENSAGEM_SEM_EDICAO.liberar_tentativa, /liberar/i);
  assert.match(MENSAGEM_SEM_EDICAO.revogar_certificado, /revogar/i);
});

// ------------------------------------------------------------ matricula_id
test("validarMatriculaId: aceita só uuid (com espaços ao redor, minúsculo)", () => {
  assert.deepEqual(validarMatriculaId(ID), { ok: true, id: ID });
  assert.deepEqual(validarMatriculaId(`  ${ID.toUpperCase()} `), { ok: true, id: ID });
});

test("validarMatriculaId: recusa vazio, número, objeto e texto qualquer (400, sem ir ao banco)", () => {
  for (const ruim of [undefined, null, "", "  ", 123, {}, [], "abc", `${ID}x`, "1; drop table x"]) {
    const r = validarMatriculaId(ruim);
    assert.equal(r.ok, false, String(ruim));
    if (!r.ok) {
      assert.equal(r.status, 400);
      assert.match(r.mensagem, /matricula_id/);
    }
  }
});

// ------------------------------------------------------------ motivo
test("motivoDaRevogacao: tira espaços das pontas e junta quebras de linha e espaços repetidos", () => {
  assert.deepEqual(motivoDaRevogacao("  Prova feita\npor outra   pessoa \n"), {
    ok: true,
    motivo: "Prova feita por outra pessoa",
  });
});

test("motivoDaRevogacao: o motivo é obrigatório (vazio, só espaços e não-texto são recusados)", () => {
  for (const ruim of [undefined, null, "", "   \n ", 42, {}]) {
    const r = motivoDaRevogacao(ruim);
    assert.equal(r.ok, false, String(ruim));
    if (!r.ok) assert.match(r.mensagem, /motivo/i);
  }
});

test("motivoDaRevogacao: limites de tamanho valem para o texto já limpo", () => {
  assert.equal(motivoDaRevogacao("a".repeat(MOTIVO_REVOGACAO_MIN - 1)).ok, false);
  assert.equal(motivoDaRevogacao("a".repeat(MOTIVO_REVOGACAO_MIN)).ok, true);
  assert.equal(motivoDaRevogacao("a".repeat(MOTIVO_REVOGACAO_MAX)).ok, true);
  const longo = motivoDaRevogacao("a".repeat(MOTIVO_REVOGACAO_MAX + 1));
  assert.equal(longo.ok, false);
  if (!longo.ok) assert.match(longo.mensagem, new RegExp(String(MOTIVO_REVOGACAO_MAX)));
  // espaços sobrando não contam para o mínimo
  assert.equal(motivoDaRevogacao(`  ${"a".repeat(MOTIVO_REVOGACAO_MIN - 1)}   `).ok, false);
});

// ------------------------------------------------------------ liberar tentativa
test("decidirLiberacao: soma uma tentativa extra à matrícula", () => {
  assert.deepEqual(decidirLiberacao({ avaliacao_aprovada: false, tentativas_extras: 2 }), {
    ok: true,
    extrasAtuais: 2,
    extrasNovas: 3,
  });
  for (const extras of [0, null, undefined, -4, Number.NaN, "x"]) {
    const r = decidirLiberacao({ avaliacao_aprovada: null, tentativas_extras: extras as number });
    assert.deepEqual(r, { ok: true, extrasAtuais: 0, extrasNovas: 1 }, String(extras));
  }
});

test("decidirLiberacao: matrícula inexistente ou excluída é 404", () => {
  for (const mat of [null, undefined, { deleted_at: "2026-10-01T00:00:00Z" }]) {
    const r = decidirLiberacao(mat);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.status, 404);
  }
});

test("decidirLiberacao: quem já foi aprovado não precisa de tentativa (409, nada muda)", () => {
  const r = decidirLiberacao({ avaliacao_aprovada: true, tentativas_extras: 1 });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.status, 409);
    assert.match(r.mensagem, /aprovad/i);
  }
});

test("detalheDaLiberacao: autor (e-mail do RH) e o total de extras depois da liberação", () => {
  assert.deepEqual(detalheDaLiberacao({ por: "rh@exemplo.test", extrasNovas: 3 }), {
    por: "rh@exemplo.test",
    tentativas_extras: 3,
  });
});

// ------------------------------------------------------------ revogar certificado
test("decidirRevogacao: certificado válido pode ser revogado", () => {
  assert.deepEqual(decidirRevogacao({ id: "c1", revogado_em: null }), { ok: true });
});

test("decidirRevogacao: sem certificado é 404; já revogado é 409 (não sobrescreve motivo nem autor)", () => {
  const sem = decidirRevogacao(null);
  assert.equal(sem.ok, false);
  if (!sem.ok) assert.equal(sem.status, 404);
  const ja = decidirRevogacao({ id: "c1", revogado_em: "2026-10-01T10:00:00Z" });
  assert.equal(ja.ok, false);
  if (!ja.ok) {
    assert.equal(ja.status, 409);
    assert.match(ja.mensagem, /já está revogado/i);
  }
});

test("dadosDaRevogacao: grava só as 3 colunas da revogação, com o autor e a hora do servidor", () => {
  const dados = dadosDaRevogacao({
    agora: new Date("2026-10-05T12:30:00.000Z"),
    por: "rh@exemplo.test",
    motivo: "Prova feita por outra pessoa",
  });
  assert.deepEqual(dados, {
    revogado_em: "2026-10-05T12:30:00.000Z",
    revogado_por: "rh@exemplo.test",
    motivo_revogacao: "Prova feita por outra pessoa",
  });
});

test("dadosParaDesfazerRevogacao: zera exatamente as mesmas 3 colunas", () => {
  assert.deepEqual(Object.keys(dadosParaDesfazerRevogacao()).sort(), [
    "motivo_revogacao",
    "revogado_em",
    "revogado_por",
  ]);
  assert.ok(Object.values(dadosParaDesfazerRevogacao()).every((v) => v === null));
  assert.deepEqual(
    Object.keys(dadosDaRevogacao({ agora: new Date(0), por: "a", motivo: "b" })).sort(),
    Object.keys(dadosParaDesfazerRevogacao()).sort()
  );
});

test("detalheDaRevogacao: autor, código do certificado e motivo", () => {
  assert.deepEqual(
    detalheDaRevogacao({ por: "rh@exemplo.test", codigo: "ABCD-2345-EFGH", motivo: "Fraude" }),
    { por: "rh@exemplo.test", codigo: "ABCD-2345-EFGH", motivo: "Fraude" }
  );
});

// ------------------------------------------------------------ aviso ao aluno
test("textoAvisoRevogacao: primeiro nome, curso, código, empresa e motivo", () => {
  const t = textoAvisoRevogacao({
    nome: "  Fulana de Tal ",
    curso: "NR-10 Básico",
    codigo: "ABCD-2345-EFGH",
    empresa: "Empresa Exemplo Ltda",
    motivo: "Prova feita por outra pessoa",
  });
  assert.match(t, /^Olá, Fulana\./);
  assert.ok(t.includes("NR-10 Básico"));
  assert.ok(t.includes("ABCD-2345-EFGH"));
  assert.ok(t.includes("Empresa Exemplo Ltda"));
  assert.ok(t.includes("Motivo: Prova feita por outra pessoa"));
  assert.match(t, /revogado/);
});

test("textoAvisoRevogacao: sem nome, curso ou empresa o texto continua inteiro e sem 'undefined'", () => {
  const t = textoAvisoRevogacao({
    nome: null,
    curso: "",
    codigo: "X",
    empresa: undefined,
    motivo: "m",
  });
  assert.match(t, /^Olá\./);
  assert.ok(!/undefined|null/.test(t));
  assert.match(t, /pela empresa/);
});

test("destinoDoAviso: telefone BR válido vira número E.164; o resto não envia", () => {
  assert.deepEqual(destinoDoAviso({ telefone: "(38) 99999-0000", ativo: true }), {
    tipo: "enviar",
    numero: "5538999990000",
  });
  assert.deepEqual(destinoDoAviso({ telefone: "+55 38 3333-0000", ativo: true }), {
    tipo: "enviar",
    numero: "553833330000",
  });
  for (const telefone of [null, undefined, "", "  "])
    assert.deepEqual(destinoDoAviso({ telefone, ativo: true }), { tipo: "sem_telefone" });
  assert.deepEqual(destinoDoAviso({ telefone: "12345", ativo: true }), {
    tipo: "telefone_invalido",
  });
});

test("destinoDoAviso: funcionário inativo ou excluído não recebe aviso", () => {
  assert.deepEqual(destinoDoAviso({ telefone: "(38) 99999-0000", ativo: false }), {
    tipo: "inativo",
  });
  assert.deepEqual(destinoDoAviso({ telefone: "(38) 99999-0000", ativo: true, deleted_at: "x" }), {
    tipo: "inativo",
  });
  assert.deepEqual(destinoDoAviso(null), { tipo: "inativo" });
});

test("avisarAluno: manda a mensagem ao número normalizado e diz 'enviado'", async () => {
  const enviados: [string, string][] = [];
  const r = await avisarAluno({
    destino: { tipo: "enviar", numero: "5538999990000" },
    texto: "oi",
    enviar: async (numero, texto) => {
      enviados.push([numero, texto]);
    },
    canalNaoConfigurado: () => false,
  });
  assert.equal(r, "enviado");
  assert.deepEqual(enviados, [["5538999990000", "oi"]]);
});

test("avisarAluno: sem telefone, telefone inválido ou inativo não chama o canal", async () => {
  let chamadas = 0;
  const enviar = async () => {
    chamadas++;
  };
  for (const tipo of ["sem_telefone", "telefone_invalido", "inativo"] as const) {
    const r = await avisarAluno({
      destino: { tipo },
      texto: "oi",
      enviar,
      canalNaoConfigurado: () => false,
    });
    assert.equal(r, tipo);
  }
  assert.equal(chamadas, 0);
});

test("avisarAluno: falha do canal nunca estoura: vira 'falhou' (ou 'canal_nao_configurado')", async () => {
  const erros: unknown[] = [];
  const base = {
    destino: { tipo: "enviar", numero: "5538999990000" } as const,
    texto: "oi",
    aoFalhar: (e: unknown) => erros.push(e),
  };
  const falha = new Error("Evolution 500");
  assert.equal(
    await avisarAluno({
      ...base,
      enviar: async () => {
        throw falha;
      },
      canalNaoConfigurado: () => false,
    }),
    "falhou"
  );
  assert.equal(
    await avisarAluno({
      ...base,
      enviar: async () => {
        throw falha;
      },
      canalNaoConfigurado: (e) => e === falha,
    }),
    "canal_nao_configurado"
  );
  assert.equal(erros.length, 2);
});

// ------------------------------------------------------------ T18, M1: erro de leitura do funcionário
test("destinoDoAviso: falha na leitura do funcionário é 'falhou', nunca 'inativo' (toast verde mentiroso)", () => {
  // o funcionário ATIVO que não foi lido por erro do banco parecia "inativo, nenhum aviso foi enviado"
  assert.deepEqual(destinoDoAviso(null, { message: "conexão caiu" }), { tipo: "falhou" });
  assert.deepEqual(
    destinoDoAviso({ telefone: "(38) 99999-0000", ativo: true }, { message: "conexão caiu" }),
    { tipo: "falhou" }
  );
  // sem erro e sem linha segue sendo "inativo" (não existe na empresa); com erro nulo não muda nada
  assert.deepEqual(destinoDoAviso(null), { tipo: "inativo" });
  assert.deepEqual(destinoDoAviso(null, null), { tipo: "inativo" });
  assert.deepEqual(destinoDoAviso({ telefone: "(38) 99999-0000", ativo: true }, null), {
    tipo: "enviar",
    numero: "5538999990000",
  });
});

test("avisarAluno: destino 'falhou' não chama o canal e devolve 'falhou'", async () => {
  let chamadas = 0;
  const r = await avisarAluno({
    destino: { tipo: "falhou" },
    texto: "oi",
    enviar: async () => {
      chamadas++;
    },
    canalNaoConfigurado: () => false,
  });
  assert.equal(r, "falhou");
  assert.equal(chamadas, 0);
});

// ------------------------------------------------------------ T18, M2: tempo limite do aviso
test("avisarAluno: canal que não responde vira 'falhou' pelo tempo limite, sem travar a revogação", async () => {
  const erros: unknown[] = [];
  const inicio = Date.now();
  const r = await avisarAluno({
    destino: { tipo: "enviar", numero: "5538999990000" },
    texto: "oi",
    enviar: () => new Promise<void>(() => {}), // nunca responde
    canalNaoConfigurado: () => false,
    aoFalhar: (e) => erros.push(e),
    limiteMs: 30,
  });
  assert.equal(r, "falhou");
  assert.ok(Date.now() - inicio < 2_000, "voltou logo, sem esperar o canal");
  assert.equal(erros.length, 1);
  assert.match((erros[0] as Error).message, /tempo esgotado/i);
});

test("avisarAluno: o envio que termina a tempo não é cortado e o relógio não fica ligado", async () => {
  const r = await avisarAluno({
    destino: { tipo: "enviar", numero: "5538999990000" },
    texto: "oi",
    enviar: () => new Promise<void>((resolve) => setTimeout(resolve, 5)),
    canalNaoConfigurado: () => false,
    limiteMs: 5_000,
  });
  // se o temporizador do limite ficasse ligado, o teste esperaria 5 s para terminar o processo
  assert.equal(r, "enviado");
});

test("avisarAluno: envio que falha depois de o prazo vencer não vira erro não tratado", async () => {
  let rejeitar!: (e: Error) => void;
  const r = await avisarAluno({
    destino: { tipo: "enviar", numero: "5538999990000" },
    texto: "oi",
    enviar: () =>
      new Promise<void>((_ok, no) => {
        rejeitar = no;
      }),
    canalNaoConfigurado: () => false,
    limiteMs: 20,
  });
  assert.equal(r, "falhou");
  rejeitar(new Error("Evolution 500 tardio")); // sem handler, derrubaria o processo de teste
  await new Promise((resolve) => setTimeout(resolve, 20));
});

test("o prazo do aviso é de poucos segundos, e o do envio ao Evolution cabe dentro dele", () => {
  assert.ok(TEMPO_LIMITE_AVISO_MS >= 5_000 && TEMPO_LIMITE_AVISO_MS <= 30_000);
});

// ------------------------------------------------------------ T18, M4: efeito sem registro
test("registrarOuDesfazer: evento gravado = registrado, sem desfazer nada", async () => {
  const passos: string[] = [];
  const r = await registrarOuDesfazer({
    registrar: async () => (passos.push("registrar"), true),
    desfazer: async () => (passos.push("desfazer"), true),
  });
  assert.equal(r, "registrado");
  assert.deepEqual(passos, ["registrar"]);
});

test("registrarOuDesfazer: evento não gravou e o efeito foi desfeito = desfeito (pode tentar de novo)", async () => {
  const passos: string[] = [];
  const r = await registrarOuDesfazer({
    registrar: async () => (passos.push("registrar"), false),
    desfazer: async () => (passos.push("desfazer"), true),
  });
  assert.equal(r, "desfeito");
  assert.deepEqual(passos, ["registrar", "desfazer"]);
});

test("registrarOuDesfazer: não desfez, mas o evento gravou na última tentativa = registrado (em dia)", async () => {
  const resultados = [false, true];
  const passos: string[] = [];
  const r = await registrarOuDesfazer({
    registrar: async () => (passos.push("registrar"), resultados.shift() as boolean),
    desfazer: async () => (passos.push("desfazer"), false),
  });
  assert.equal(r, "registrado");
  assert.deepEqual(passos, ["registrar", "desfazer", "registrar"]);
});

test("registrarOuDesfazer: nem registrou nem desfez = sem_registro (e para por aí, sem laço)", async () => {
  const passos: string[] = [];
  const r = await registrarOuDesfazer({
    registrar: async () => (passos.push("registrar"), false),
    desfazer: async () => (passos.push("desfazer"), false),
  });
  assert.equal(r, "sem_registro");
  assert.deepEqual(passos, ["registrar", "desfazer", "registrar"]);
});

test("registrarOuDesfazer: exceção do banco conta como falha, nunca estoura", async () => {
  const r = await registrarOuDesfazer({
    registrar: async () => {
      throw new Error("rede");
    },
    desfazer: async () => {
      throw new Error("rede");
    },
  });
  assert.equal(r, "sem_registro");
});

test("falhaDoRegistro: efeito desfeito = 500 'tente de novo'; sem desfazer = código próprio e 'NÃO repita'", () => {
  const liberarDesfeita = falhaDoRegistro({ acao: "liberar_tentativa", resultado: "desfeito" });
  assert.equal(liberarDesfeita.status, 500);
  assert.equal(liberarDesfeita.codigo, "TRILHA_FALHOU");
  assert.match(liberarDesfeita.mensagem, /Tente de novo/);

  const liberarSem = falhaDoRegistro({ acao: "liberar_tentativa", resultado: "sem_registro" });
  assert.equal(liberarSem.status, 500);
  assert.equal(liberarSem.codigo, "EFEITO_SEM_REGISTRO");
  assert.match(liberarSem.mensagem, /NÃO repita/);
  assert.match(liberarSem.mensagem, /suporte/i);
  assert.doesNotMatch(liberarSem.mensagem, /Tente de novo/);

  const revogarDesfeita = falhaDoRegistro({ acao: "revogar_certificado", resultado: "desfeito" });
  assert.equal(revogarDesfeita.codigo, "TRILHA_FALHOU");
  assert.match(revogarDesfeita.mensagem, /revogação/);

  const revogarSem = falhaDoRegistro({ acao: "revogar_certificado", resultado: "sem_registro" });
  assert.equal(revogarSem.codigo, "EFEITO_SEM_REGISTRO");
  assert.match(revogarSem.mensagem, /revogado/);
  assert.match(revogarSem.mensagem, /NÃO foi avisado/);
  assert.match(revogarSem.mensagem, /suporte/i);
});

// ------------------------------------------------------------ o index.ts não foge das regras
const INDEX = readFileSync(fileURLToPath(new URL("./index.ts", import.meta.url)), "utf8");

test("index.ts: toda ação de matrícula exige a permissão 'editar' antes de ler a matrícula", () => {
  const inicio = INDEX.indexOf("if (ACOES_DE_MATRICULA.has(acao)) {");
  assert.ok(inicio > 0, "bloco das ações de matrícula não encontrado");
  const bloco = INDEX.slice(inicio, inicio + 900);
  const permissao = bloco.indexOf("if (!podeEditar) return fail(MENSAGEM_SEM_EDICAO[acao], 403)");
  const leitura = bloco.indexOf("matriculaDoChamador(");
  assert.ok(permissao !== -1, "a permissão não é conferida no bloco");
  assert.ok(leitura !== -1 && permissao < leitura, "a permissão vem antes de ler a matrícula");
});

test("index.ts: o certificado só é alterado com as colunas da revogação (e do desfazer)", () => {
  const todas = [...INDEX.matchAll(/\.from\("treinamento_certificado"\)\s*\.update\(/g)];
  const dasRegras = [
    ...INDEX.matchAll(/\.from\("treinamento_certificado"\)\s*\.update\(\s*(\w+)\(/g),
  ].map((m) => m[1]);
  assert.equal(todas.length, 2, "esperava só a revogação e o desfazer");
  assert.deepEqual(dasRegras.sort(), ["dadosDaRevogacao", "dadosParaDesfazerRevogacao"]);
});

test("index.ts: o autor do evento e da revogação é o e-mail da sessão, nunca algo do corpo", () => {
  assert.ok(INDEX.includes("por: staff.email"));
  assert.ok(!/body\.(por|email|revogado_por|usuario_email)\b/.test(INDEX));
});

test("index.ts: a leitura do funcionário confere o error e o passa a destinoDoAviso (T18, M1)", () => {
  const leitura = INDEX.indexOf('.from("funcionario")\n    .select("nome_completo, telefone');
  assert.ok(leitura > 0, "leitura do funcionário para o aviso não encontrada");
  const antes = INDEX.slice(Math.max(0, leitura - 80), leitura);
  assert.match(antes, /const \{ data: func, error: erroFunc \}/);
  const depois = INDEX.slice(leitura, leitura + 900);
  assert.match(depois, /if \(erroFunc\)[\s\S]*?console\.error\(/);
  assert.match(depois, /destinoDoAviso\(func, erroFunc\)/);
});

test("index.ts: liberar e revogar passam por registrarOuDesfazer e respondem pela falhaDoRegistro (T18, M4)", () => {
  assert.equal(INDEX.match(/registrarOuDesfazer\(\{/g)?.length, 2, "uma vez em cada ação");
  assert.equal(INDEX.match(/falhaDoRegistro\(\{/g)?.length, 2);
  // a falha sem desfazer deixa rastro no log (o suporte precisa dos números para conferir a matrícula)
  assert.match(INDEX, /registro === "sem_registro"[\s\S]*?console\.error\(/);
  // o "desfazer" só vale se atingiu a linha (0 linhas = o valor já tinha mudado, não foi desfeito)
  assert.equal(INDEX.match(/\.select\("id"\);\s*\n\s*if \(erroDesfazer\)/g)?.length, 2);
});

test("index.ts: a resposta de efeito sem registro leva o código próprio (EFEITO_SEM_REGISTRO via falhaDoRegistro)", () => {
  assert.match(INDEX, /fail\(falha\.mensagem,\s*falha\.status,\s*\{\s*codigo:\s*falha\.codigo/);
});
