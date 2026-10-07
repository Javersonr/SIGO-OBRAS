// Roda com Node 23.6+ (type stripping):
//   node --test supabase/functions/portal-funcionario/pre-requisito.test.ts
//
// T23: pré-requisito entre cursos (coluna treinamento_curso.pre_requisito_curso_id, migração 0142). O NR-10
// Complementar (SEP) exige o NR-10 Básico: quem não tem o curso exigido concluído e dentro da validade não
// emite o certificado do curso que o exige (409 PRE_REQUISITO). Regra espelhada no front
// (apps/web/src/lib/ead-pre-requisito.js); o teste confere os dois contra os mesmos casos.
// Dados sintéticos: ids e nomes de mentira.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  bloqueioDeEmissaoPorPreRequisito,
  cursosExigidosDoBanco,
  lerPreRequisito,
  preRequisitoDoCurso,
  situacaoDoPreRequisito,
  textoDoPreRequisito,
} from "./pre-requisito.ts";
// o espelho do front: só testa se os dois dizem a mesma coisa (o arquivo não tem import de alias)
import { situacaoDoPreRequisito as situacaoNoFront } from "../../../apps/web/src/lib/ead-pre-requisito.js";

const HOJE = "2026-10-07";
const BASICO = { id: "curso-basico", nome: "NR-10 Básico", modalidade: "ead", deleted_at: null };
const concluida = (extra = {}) => ({
  id: "m1",
  curso_id: "curso-basico",
  status: "concluido",
  proxima_renovacao: "2028-10-07",
  deleted_at: null,
  ...extra,
});
const semRevogadas = new Set<string>();

/** Tudo o que a regra recebe: curso exigido, matrículas do aluno nele, certificados revogados e o dia. */
function situacao(p: {
  curso?: unknown;
  matriculas?: unknown[];
  revogadas?: Set<string>;
  hoje?: string;
}) {
  return situacaoDoPreRequisito({
    curso: (p.curso === undefined ? BASICO : p.curso) as never,
    matriculas: (p.matriculas ?? []) as never,
    revogadas: p.revogadas ?? semRevogadas,
    hoje: p.hoje ?? HOJE,
  });
}

// ---------------------------------------------------------------------------------- a regra

test("concluído e dentro da validade: o pré-requisito está atendido", () => {
  assert.deepEqual(situacao({ matriculas: [concluida()] }), {
    atendido: true,
    motivo: "concluido",
  });
});

test("curso sem validade (sem data de renovação) vale sempre", () => {
  assert.equal(situacao({ matriculas: [concluida({ proxima_renovacao: null })] }).atendido, true);
});

test("no último dia da validade ainda vale; no dia seguinte venceu", () => {
  assert.equal(situacao({ matriculas: [concluida({ proxima_renovacao: HOJE })] }).atendido, true);
  assert.deepEqual(situacao({ matriculas: [concluida({ proxima_renovacao: "2026-10-06" })] }), {
    atendido: false,
    motivo: "vencido",
  });
});

test("data de renovação que não é data não afirma que venceu (a mesma regra da tela do RH)", () => {
  assert.equal(
    situacao({ matriculas: [concluida({ proxima_renovacao: "talvez" })] }).atendido,
    true
  );
});

test("certificado revogado da matrícula concluída: não conta", () => {
  assert.deepEqual(situacao({ matriculas: [concluida()], revogadas: new Set(["m1"]) }), {
    atendido: false,
    motivo: "revogado",
  });
});

test("matrícula ainda aberta (pendente ou em andamento): não está concluído", () => {
  for (const status of ["pendente", "em_andamento"]) {
    assert.deepEqual(situacao({ matriculas: [concluida({ status, proxima_renovacao: null })] }), {
      atendido: false,
      motivo: "em_andamento",
    });
  }
});

test("sem matrícula no curso exigido, ou só com matrícula excluída", () => {
  assert.deepEqual(situacao({ matriculas: [] }), { atendido: false, motivo: "sem_matricula" });
  assert.deepEqual(situacao({ matriculas: [concluida({ deleted_at: "2026-10-01T00:00:00Z" })] }), {
    atendido: false,
    motivo: "sem_matricula",
  });
});

test("uma conclusão válida basta: a antiga vencida ou revogada não derruba a renovação feita", () => {
  const antiga = concluida({ id: "m0", proxima_renovacao: "2026-01-01" });
  const revogada = concluida({ id: "m00" });
  const nova = concluida({ id: "m2" });
  assert.equal(
    situacao({ matriculas: [antiga, revogada, nova], revogadas: new Set(["m00"]) }).atendido,
    true
  );
});

test("com a conclusão vencida e a renovação em andamento, o motivo é 'em andamento'", () => {
  const vencida = concluida({ id: "m0", proxima_renovacao: "2026-01-01" });
  const renovando = concluida({ id: "m2", status: "em_andamento", proxima_renovacao: null });
  assert.equal(situacao({ matriculas: [vencida, renovando] }).motivo, "em_andamento");
});

test("vencido pesa mais que revogado no motivo; revogado pesa mais que sem matrícula", () => {
  const vencida = concluida({ id: "m0", proxima_renovacao: "2026-01-01" });
  const revogada = concluida({ id: "m1" });
  assert.equal(
    situacao({ matriculas: [vencida, revogada], revogadas: new Set(["m1"]) }).motivo,
    "vencido"
  );
  assert.equal(situacao({ matriculas: [revogada], revogadas: new Set(["m1"]) }).motivo, "revogado");
});

test("curso exigido que não existe, foi excluído ou nunca emite certificado: falha fechado", () => {
  assert.deepEqual(situacao({ curso: null, matriculas: [concluida()] }), {
    atendido: false,
    motivo: "curso_excluido",
  });
  assert.deepEqual(
    situacao({
      curso: { ...BASICO, deleted_at: "2026-10-01T00:00:00Z" },
      matriculas: [concluida()],
    }),
    { atendido: false, motivo: "curso_excluido" }
  );
  // o apoio conclui sem certificado e sem data de renovação: nunca poderia valer como pré-requisito
  assert.deepEqual(
    situacao({
      curso: { ...BASICO, modalidade: "apoio" },
      matriculas: [concluida({ proxima_renovacao: null })],
    }),
    { atendido: false, motivo: "curso_sem_certificado" }
  );
  // modalidade ausente (curso lido antes da 0136) vale EAD
  const { modalidade: _m, ...semModalidade } = BASICO;
  assert.equal(situacao({ curso: semModalidade, matriculas: [concluida()] }).atendido, true);
});

test("o espelho do front diz o mesmo em todos os casos acima", () => {
  const casos = [
    { matriculas: [concluida()] },
    { matriculas: [concluida({ proxima_renovacao: null })] },
    { matriculas: [concluida({ proxima_renovacao: HOJE })] },
    { matriculas: [concluida({ proxima_renovacao: "2026-10-06" })] },
    { matriculas: [concluida({ proxima_renovacao: "talvez" })] },
    { matriculas: [concluida()], revogadas: new Set(["m1"]) },
    { matriculas: [concluida({ status: "pendente" })] },
    { matriculas: [concluida({ status: "em_andamento" })] },
    { matriculas: [] },
    { matriculas: [concluida({ deleted_at: "2026-10-01T00:00:00Z" })] },
    {
      matriculas: [
        concluida({ id: "m0", proxima_renovacao: "2026-01-01" }),
        concluida({ id: "m2" }),
      ],
    },
    {
      matriculas: [
        concluida({ id: "m0", proxima_renovacao: "2026-01-01" }),
        concluida({ id: "m2", status: "em_andamento" }),
      ],
    },
    { curso: null, matriculas: [concluida()] },
    { curso: { ...BASICO, deleted_at: "2026-10-01T00:00:00Z" }, matriculas: [concluida()] },
    { curso: { ...BASICO, modalidade: "apoio" }, matriculas: [concluida()] },
  ];
  for (const [i, caso] of casos.entries()) {
    const comum = {
      curso: caso.curso === undefined ? BASICO : caso.curso,
      matriculas: caso.matriculas,
      hoje: HOJE,
    };
    assert.deepEqual(
      situacaoNoFront({ ...comum, revogadas: caso.revogadas ?? semRevogadas }),
      situacao(caso),
      `caso ${i}`
    );
  }
});

// ---------------------------------------------------------------------------------- textos e 409

test("o 409 PRE_REQUISITO diz qual curso falta e por quê; atendido não bloqueia", () => {
  assert.equal(
    bloqueioDeEmissaoPorPreRequisito({ atendido: true, motivo: "concluido" }, "NR-10 Básico"),
    null
  );
  const motivos = [
    "sem_matricula",
    "em_andamento",
    "vencido",
    "revogado",
    "curso_excluido",
    "curso_sem_certificado",
  ] as const;
  const textos = new Set<string>();
  for (const motivo of motivos) {
    const b = bloqueioDeEmissaoPorPreRequisito({ atendido: false, motivo }, "NR-10 Básico");
    assert.equal(b?.codigo, "PRE_REQUISITO", motivo);
    assert.equal(b?.mensagem, textoDoPreRequisito(motivo, "NR-10 Básico"));
    assert.ok(b?.mensagem.includes("NR-10 Básico") || motivo.startsWith("curso_"), motivo);
    textos.add(b!.mensagem);
  }
  assert.equal(textos.size, motivos.length, "cada motivo tem a sua explicação");
});

test("nome do curso exigido vazio não quebra o texto", () => {
  assert.ok(textoDoPreRequisito("sem_matricula", null).length > 20);
  assert.ok(textoDoPreRequisito("vencido", "").length > 20);
});

// ---------------------------------------------------------------------------------- o item de `dados`

test("preRequisitoDoCurso: curso sem pré-requisito não devolve nada", () => {
  const r = preRequisitoDoCurso({
    curso: { id: "c2", pre_requisito_curso_id: null },
    cursosExigidos: [BASICO],
    matriculas: [concluida()],
    certificados: [],
    hoje: HOJE,
  });
  assert.equal(r, null);
});

test("preRequisitoDoCurso: devolve o curso exigido, se está atendido e o texto para o aluno", () => {
  const entrada = {
    curso: { id: "c2", pre_requisito_curso_id: "curso-basico" },
    cursosExigidos: [BASICO],
    hoje: HOJE,
  };
  const ok = preRequisitoDoCurso({ ...entrada, matriculas: [concluida()], certificados: [] });
  assert.deepEqual(ok, {
    curso_id: "curso-basico",
    nome: "NR-10 Básico",
    atendido: true,
    motivo: "concluido",
    texto: textoDoPreRequisito("concluido", "NR-10 Básico"),
  });
  const falta = preRequisitoDoCurso({ ...entrada, matriculas: [], certificados: [] });
  assert.equal(falta?.atendido, false);
  assert.equal(falta?.motivo, "sem_matricula");
  // certificado revogado vem da lista de certificados do aluno
  const revogado = preRequisitoDoCurso({
    ...entrada,
    matriculas: [concluida()],
    certificados: [{ matricula_id: "m1", revogado_em: "2026-10-02T00:00:00Z" }],
  });
  assert.equal(revogado?.motivo, "revogado");
  // matrícula de OUTRO curso não vale
  const outro = preRequisitoDoCurso({
    ...entrada,
    matriculas: [concluida({ curso_id: "outro" })],
    certificados: [],
  });
  assert.equal(outro?.motivo, "sem_matricula");
});

test("preRequisitoDoCurso: curso exigido que a consulta não trouxe falha fechado", () => {
  const r = preRequisitoDoCurso({
    curso: { id: "c2", pre_requisito_curso_id: "curso-sumido" },
    cursosExigidos: [],
    matriculas: [concluida({ curso_id: "curso-sumido" })],
    certificados: [],
    hoje: HOJE,
  });
  assert.equal(r?.atendido, false);
  assert.equal(r?.motivo, "curso_excluido");
  assert.equal(r?.curso_id, "curso-sumido");
});

// ---------------------------------------------------------------------------------- leitura no banco

type Chamada = { tabela: string; filtros: unknown[][] };
/** Cliente de teste no formato do supabase-js: devolve, por tabela, o que o cenário mandar. */
function bancoDeTeste(
  cenario: Record<string, { data: unknown; error?: unknown }>,
  chamadas: Chamada[] = []
) {
  return {
    chamadas,
    db: {
      from(tabela: string) {
        const chamada: Chamada = { tabela, filtros: [] };
        chamadas.push(chamada);
        const resposta = () => Promise.resolve(cenario[tabela] ?? { data: [], error: null });
        const consulta: Record<string, unknown> = {
          select: (colunas?: string) => (chamada.filtros.push(["select", colunas]), consulta),
          eq: (c: string, v: unknown) => (chamada.filtros.push(["eq", c, v]), consulta),
          in: (c: string, v: unknown) => (chamada.filtros.push(["in", c, v]), consulta),
          is: (c: string, v: unknown) => (chamada.filtros.push(["is", c, v]), consulta),
          not: (c: string, o: string, v: unknown) => (
            chamada.filtros.push(["not", c, o, v]),
            consulta
          ),
          maybeSingle: () => resposta(),
          then: (resolve: (v: unknown) => unknown, rejeitar?: (e: unknown) => unknown) =>
            resposta().then(resolve, rejeitar),
        };
        return consulta;
      },
    },
  };
}
const tem = (c: Chamada | undefined, filtro: unknown[]) =>
  !!c?.filtros.some((f) => JSON.stringify(f) === JSON.stringify(filtro));

const PEDIDO = {
  preCursoId: "curso-basico",
  funcionarioId: "func-1",
  empresaId: "empresa-1",
  hoje: HOJE,
};

test("lerPreRequisito: lê o curso, as matrículas e os certificados revogados, sempre da empresa e do funcionário da sessão", async () => {
  const { db, chamadas } = bancoDeTeste({
    treinamento_curso: { data: BASICO },
    treinamento_matricula: { data: [concluida()] },
    treinamento_certificado: { data: [] },
  });
  const r = await lerPreRequisito(db, PEDIDO);
  assert.deepEqual(r, {
    ok: true,
    nome: "NR-10 Básico",
    situacao: { atendido: true, motivo: "concluido" },
  });
  const curso = chamadas.find((c) => c.tabela === "treinamento_curso");
  assert.ok(tem(curso, ["eq", "id", "curso-basico"]));
  assert.ok(tem(curso, ["eq", "empresa_id", "empresa-1"]));
  const mats = chamadas.find((c) => c.tabela === "treinamento_matricula");
  assert.ok(tem(mats, ["eq", "curso_id", "curso-basico"]));
  assert.ok(tem(mats, ["eq", "funcionario_id", "func-1"]));
  assert.ok(tem(mats, ["eq", "empresa_id", "empresa-1"]));
  assert.ok(tem(mats, ["is", "deleted_at", null]));
  const certs = chamadas.find((c) => c.tabela === "treinamento_certificado");
  assert.ok(tem(certs, ["eq", "empresa_id", "empresa-1"]));
  assert.ok(tem(certs, ["eq", "funcionario_id", "func-1"]));
  assert.ok(tem(certs, ["eq", "curso_id", "curso-basico"]));
  assert.ok(tem(certs, ["not", "revogado_em", "is", null]));
});

test("lerPreRequisito: certificado revogado da matrícula concluída derruba o pré-requisito", async () => {
  const { db } = bancoDeTeste({
    treinamento_curso: { data: BASICO },
    treinamento_matricula: { data: [concluida()] },
    treinamento_certificado: { data: [{ matricula_id: "m1" }] },
  });
  const r = await lerPreRequisito(db, PEDIDO);
  assert.equal(r.ok && r.situacao.motivo, "revogado");
});

test("lerPreRequisito: curso que não está na empresa (ou foi apagado) é 'curso excluído', sem nome", async () => {
  const { db } = bancoDeTeste({
    treinamento_curso: { data: null },
    treinamento_matricula: { data: [concluida()] },
    treinamento_certificado: { data: [] },
  });
  const r = await lerPreRequisito(db, PEDIDO);
  assert.deepEqual(r, {
    ok: true,
    nome: null,
    situacao: { atendido: false, motivo: "curso_excluido" },
  });
});

test("lerPreRequisito: falha de leitura em qualquer das três consultas não vira 'atendido' (ok: false)", async () => {
  for (const tabela of ["treinamento_curso", "treinamento_matricula", "treinamento_certificado"]) {
    const cenario: Record<string, { data: unknown; error?: unknown }> = {
      treinamento_curso: { data: BASICO },
      treinamento_matricula: { data: [concluida()] },
      treinamento_certificado: { data: [] },
    };
    cenario[tabela] = { data: null, error: { message: "falhou", code: "XX000" } };
    const erros: unknown[][] = [];
    const original = console.error;
    console.error = (...a: unknown[]) => void erros.push(a);
    try {
      const r = await lerPreRequisito(bancoDeTeste(cenario).db, PEDIDO);
      assert.deepEqual(r, { ok: false }, tabela);
    } finally {
      console.error = original;
    }
    assert.ok(erros.length > 0, `${tabela}: a causa vai para o log`);
  }
});

test("cursosExigidosDoBanco: lê só id, nome, modalidade e exclusão dos cursos da empresa", async () => {
  const { db, chamadas } = bancoDeTeste({ treinamento_curso: { data: [BASICO] } });
  const r = await cursosExigidosDoBanco(db, ["curso-basico", "curso-basico"], "empresa-1");
  assert.deepEqual(r, [BASICO]);
  assert.ok(tem(chamadas[0], ["in", "id", ["curso-basico"]]), "sem repetir o id");
  assert.ok(tem(chamadas[0], ["eq", "empresa_id", "empresa-1"]));
  assert.ok(tem(chamadas[0], ["select", "id, nome, modalidade, deleted_at"]));
});

test("cursosExigidosDoBanco: sem ids não consulta; com erro devolve vazio (o aluno fica 'não atendido')", async () => {
  const sem = bancoDeTeste({});
  assert.deepEqual(await cursosExigidosDoBanco(sem.db, [], "empresa-1"), []);
  assert.equal(sem.chamadas.length, 0);
  const original = console.error;
  console.error = () => {};
  try {
    const { db } = bancoDeTeste({ treinamento_curso: { data: null, error: { message: "x" } } });
    assert.deepEqual(await cursosExigidosDoBanco(db, ["a"], "empresa-1"), []);
  } finally {
    console.error = original;
  }
});

// ---------------------------------------------------------------------------------- o index.ts usa a regra

const indexTs = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
const codigo = indexTs.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const trecho = (nome: string) => {
  const inicio = codigo.indexOf(`if (body.acao === "${nome}")`);
  assert.ok(inicio >= 0, nome);
  const resto = codigo.slice(inicio + 10);
  const fim = resto.search(/\n {4}(?:if \(body\.acao === |\/\/ -{5,})/);
  return codigo.slice(inicio, fim >= 0 ? inicio + 10 + fim : undefined);
};

test("certificado: o pré-requisito é conferido ANTES da senha (não gasta a reconfirmação à toa) e responde 409", () => {
  const t = trecho("certificado");
  const iPre = t.indexOf("bloqueioDeEmissaoPorPreRequisito(");
  const iSenha = t.indexOf("reconfirmar(");
  assert.ok(iPre > 0, "a ação certificado confere o pré-requisito");
  assert.ok(iPre < iSenha, "antes de reconfirmar a senha");
  assert.ok(t.indexOf("lerPreRequisito(") > 0 && t.indexOf("lerPreRequisito(") < iPre);
  assert.ok(/409,\s*\{\s*codigo:\s*semPre\.codigo/.test(t), "409 com o código PRE_REQUISITO");
  // falha de leitura não deixa emitir: responde 503
  assert.ok(/!pre\.ok[\s\S]{0,200}503/.test(t));
});

test("certificado: o tipo e o motivo da matrícula são congelados em `dados`", () => {
  const t = trecho("certificado");
  assert.ok(t.includes("...dadosDoTipoNoCertificado(mat)"));
});

test("dados: cada curso do aluno recebe o pré-requisito e só emite se estiver atendido", () => {
  const t = trecho("dados");
  assert.ok(t.includes("cursosExigidosDoBanco("));
  assert.ok(t.includes("preRequisitoDoCurso("));
  assert.ok(/pre_requisito:\s*preRequisito/.test(t));
  assert.ok(/preRequisito\?\.atendido\s*!==\s*false/.test(t) || /!preRequisito\s*\|\|/.test(t));
});
