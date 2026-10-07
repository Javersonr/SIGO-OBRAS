// Roda com Node 23.6+ (type stripping):
//   node --test supabase/functions/portal-funcionario/pratica.test.ts
//
// T12: parte prática presencial do curso semipresencial (tabelas treinamento_sessao_pratica e
// treinamento_pratica_participante, migração 0143). O certificado do semipresencial só é emitido com a
// participação do aluno marcada "presente" e "satisfatório" numa sessão não apagada do mesmo curso, já realizada
// (data até hoje, em Brasília). A regra é espelhada no front (apps/web/src/lib/ead-pratica.js); este teste
// confere os dois contra os mesmos casos. Dados sintéticos: ids, nomes e locais de mentira.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  bloqueioDeEmissaoPorPratica,
  dadosDaPraticaNoCertificado,
  lerPratica,
  localComPratica,
  periodoComPratica,
  podeEmitirSemipresencial,
  praticaParaOAluno,
  praticasDoBanco,
  situacaoDaPratica,
  textoDaPratica,
} from "./pratica.ts";
import {
  podeEmitirSemipresencial as podeEmitirNoFront,
  situacaoDaPratica as situacaoNoFront,
} from "../../../apps/web/src/lib/ead-pratica.js";

const HOJE = "2026-10-07";
const CURSO = "curso-semi";
const MAT = "mat-1";
const sessao = (extra: Record<string, unknown> = {}) => ({
  id: "s1",
  curso_id: CURSO,
  data: "2026-10-05",
  hora_inicio: "08:00:00",
  hora_fim: "12:00:00",
  carga_horas: 4,
  local: "Pátio de treinamento de teste",
  instrutor_nome: "Instrutor de Teste",
  instrutor_qualificacao: "Eng. de Teste",
  deleted_at: null,
  ...extra,
});
const participacao = (extra: Record<string, unknown> = {}) => ({
  sessao_id: "s1",
  matricula_id: MAT,
  presente: true,
  resultado: "satisfatorio",
  deleted_at: null,
  ...extra,
});
const entrada = (sessoes: unknown[], participacoes: unknown[], hoje = HOJE) => ({
  matriculaId: MAT,
  cursoId: CURSO,
  sessoes: sessoes as never,
  participacoes: participacoes as never,
  hoje,
});

// ---------------------------------------------------------------------------------- a regra

test("podeEmitirSemipresencial: presente e satisfatório numa sessão viva do curso, já realizada", () => {
  assert.equal(podeEmitirSemipresencial(entrada([sessao()], [participacao()])), true);
  // no próprio dia da sessão já vale
  assert.equal(podeEmitirSemipresencial(entrada([sessao({ data: HOJE })], [participacao()])), true);
});

test("podeEmitirSemipresencial: sem participação, ausente, pendente ou insatisfatório não emite", () => {
  assert.equal(podeEmitirSemipresencial(entrada([sessao()], [])), false);
  assert.equal(podeEmitirSemipresencial(entrada([], [])), false);
  for (const extra of [
    { presente: false }, // ausente (o banco nem aceita "satisfatório" sem presença)
    { presente: null },
    { resultado: "pendente" },
    { resultado: "insatisfatorio" },
    { resultado: null },
    { resultado: "SATISFATORIO" }, // valor que o banco não aceita não vira satisfatório
  ]) {
    assert.equal(
      podeEmitirSemipresencial(entrada([sessao()], [participacao(extra)])),
      false,
      JSON.stringify(extra)
    );
  }
});

test("podeEmitirSemipresencial: sessão ou participação apagada, de outro curso ou de outra matrícula não vale", () => {
  const apagada = "2026-10-06T10:00:00Z";
  assert.equal(
    podeEmitirSemipresencial(entrada([sessao({ deleted_at: apagada })], [participacao()])),
    false
  );
  assert.equal(
    podeEmitirSemipresencial(entrada([sessao()], [participacao({ deleted_at: apagada })])),
    false
  );
  assert.equal(
    podeEmitirSemipresencial(entrada([sessao({ curso_id: "outro-curso" })], [participacao()])),
    false
  );
  assert.equal(
    podeEmitirSemipresencial(entrada([sessao()], [participacao({ matricula_id: "outra" })])),
    false
  );
  // participação que aponta para uma sessão que a consulta não trouxe
  assert.equal(
    podeEmitirSemipresencial(entrada([sessao()], [participacao({ sessao_id: "sumida" })])),
    false
  );
});

test("podeEmitirSemipresencial: sessão marcada para depois de hoje (ou sem data válida) ainda não vale", () => {
  assert.equal(
    podeEmitirSemipresencial(entrada([sessao({ data: "2026-10-08" })], [participacao()])),
    false
  );
  for (const data of [null, "", "amanhã", "08/10/2026"]) {
    assert.equal(
      podeEmitirSemipresencial(entrada([sessao({ data })], [participacao()])),
      false,
      String(data)
    );
  }
});

test("situacaoDaPratica: realizada > agendada > insatisfatória > pendente, com a sessão de cada caso", () => {
  const passada = sessao({ id: "s0", data: "2026-09-30" });
  const recente = sessao({ id: "s1", data: "2026-10-05" });
  const futura = sessao({ id: "s2", data: "2026-10-20" });
  // duas realizadas: vale a mais recente
  const duas = situacaoDaPratica(
    entrada(
      [passada, recente],
      [participacao({ sessao_id: "s0" }), participacao({ sessao_id: "s1" })]
    )
  );
  assert.equal(duas.situacao, "realizada");
  assert.equal(duas.sessao?.id, "s1");
  // reprovado e remarcado: aparece a próxima sessão
  const remarcada = situacaoDaPratica(
    entrada(
      [passada, futura],
      [
        participacao({ sessao_id: "s0", resultado: "insatisfatorio" }),
        participacao({ sessao_id: "s2", presente: false, resultado: "pendente" }),
      ]
    )
  );
  assert.equal(remarcada.situacao, "agendada");
  assert.equal(remarcada.sessao?.id, "s2");
  // reprovado sem nova sessão
  const reprovado = situacaoDaPratica(
    entrada([passada], [participacao({ sessao_id: "s0", resultado: "insatisfatorio" })])
  );
  assert.equal(reprovado.situacao, "insatisfatoria");
  assert.equal(reprovado.sessao?.id, "s0");
  // reprovado e depois aprovado: realizada
  const aprovado = situacaoDaPratica(
    entrada(
      [passada, recente],
      [
        participacao({ sessao_id: "s0", resultado: "insatisfatorio" }),
        participacao({ sessao_id: "s1" }),
      ]
    )
  );
  assert.equal(aprovado.situacao, "realizada");
  // sessão de hoje ainda sem resultado: agendada (marcada para hoje)
  const hoje = situacaoDaPratica(
    entrada([sessao({ data: HOJE })], [participacao({ presente: false, resultado: "pendente" })])
  );
  assert.equal(hoje.situacao, "agendada");
  // sessão passada sem resultado lançado, ou ausente: pendente
  for (const extra of [{ resultado: "pendente" }, { presente: false, resultado: "pendente" }]) {
    const r = situacaoDaPratica(entrada([recente], [participacao(extra)]));
    assert.equal(r.situacao, "pendente", JSON.stringify(extra));
    assert.equal(r.sessao, null);
  }
  assert.deepEqual(situacaoDaPratica(entrada([], [])), { situacao: "pendente", sessao: null });
});

test("o espelho do front diz o mesmo em todos os casos", () => {
  const apagada = "2026-10-06T10:00:00Z";
  const casos = [
    entrada([sessao()], [participacao()]),
    entrada([sessao({ data: HOJE })], [participacao()]),
    entrada([sessao()], []),
    entrada([sessao()], [participacao({ presente: false })]),
    entrada([sessao()], [participacao({ resultado: "pendente" })]),
    entrada([sessao()], [participacao({ resultado: "insatisfatorio" })]),
    entrada([sessao({ deleted_at: apagada })], [participacao()]),
    entrada([sessao()], [participacao({ deleted_at: apagada })]),
    entrada([sessao({ curso_id: "outro" })], [participacao()]),
    entrada([sessao()], [participacao({ matricula_id: "outra" })]),
    entrada([sessao({ data: "2026-10-08" })], [participacao()]),
    entrada([sessao({ data: null })], [participacao()]),
    entrada(
      [sessao({ id: "s0", data: "2026-09-30" }), sessao({ id: "s2", data: "2026-10-20" })],
      [
        participacao({ sessao_id: "s0", resultado: "insatisfatorio" }),
        participacao({ sessao_id: "s2", resultado: "pendente", presente: false }),
      ]
    ),
    entrada(
      [sessao({ id: "s0", data: "2026-09-30" }), sessao({ id: "s1" })],
      [participacao({ sessao_id: "s0" }), participacao({ sessao_id: "s1" })]
    ),
  ];
  for (const [i, caso] of casos.entries()) {
    assert.deepEqual(situacaoNoFront(caso), situacaoDaPratica(caso), `caso ${i}`);
    assert.equal(podeEmitirNoFront(caso), podeEmitirSemipresencial(caso), `caso ${i}`);
  }
});

// ---------------------------------------------------------------------------------- textos e 409

test("textoDaPratica: o que o aluno lê em cada situação", () => {
  assert.equal(
    textoDaPratica({ situacao: "realizada", sessao: sessao() as never }),
    "Parte prática: realizada em 05/10/2026, em Pátio de treinamento de teste."
  );
  assert.equal(
    textoDaPratica({ situacao: "agendada", sessao: sessao({ data: "2026-10-20" }) as never }),
    "Parte prática: pendente. Sessão presencial marcada para 20/10/2026, em Pátio de treinamento de teste."
  );
  assert.match(
    textoDaPratica({ situacao: "insatisfatoria", sessao: sessao() as never }),
    /^Parte prática: resultado insatisfatório\. Procure o RH/
  );
  assert.match(
    textoDaPratica({ situacao: "pendente", sessao: null }),
    /^Parte prática: pendente\./
  );
});

test("bloqueioDeEmissaoPorPratica: 409 PRATICA_PENDENTE com o motivo; realizada não bloqueia", () => {
  assert.equal(
    bloqueioDeEmissaoPorPratica({ situacao: "realizada", sessao: sessao() as never }),
    null
  );
  const textos = new Set<string>();
  for (const situacao of ["pendente", "agendada", "insatisfatoria"] as const) {
    const b = bloqueioDeEmissaoPorPratica({ situacao, sessao: sessao() as never });
    assert.equal(b?.codigo, "PRATICA_PENDENTE", situacao);
    assert.match(b!.mensagem, /prática presencial/, situacao);
    assert.match(b!.mensagem, /satisfatória/, situacao);
    textos.add(b!.mensagem);
  }
  assert.equal(textos.size, 3, "cada situação tem a sua explicação");
});

// ---------------------------------------------------------------------------------- o certificado

test("dadosDaPraticaNoCertificado: congela data, horário, local, instrutor, carga e resultado", () => {
  const s = sessao({ observacoes: "não vai ao certificado", lista_presenca_ref: "treinamentos/x" });
  const dados = dadosDaPraticaNoCertificado(s as never);
  assert.deepEqual(dados, {
    sessao_id: "s1",
    data: "2026-10-05",
    hora_inicio: "08:00",
    hora_fim: "12:00",
    local: "Pátio de treinamento de teste",
    instrutor: { nome: "Instrutor de Teste", qualificacao: "Eng. de Teste" },
    carga_horas: 4,
    resultado: "satisfatorio",
  });
  // é uma cópia: mudar a sessão depois (o RH edita) não muda o que foi congelado
  s.local = "Outro local";
  (s as { instrutor_nome: string }).instrutor_nome = "Outra pessoa";
  assert.equal(dados.local, "Pátio de treinamento de teste");
  assert.equal(dados.instrutor.nome, "Instrutor de Teste");
  // campos vazios viram null; carga em texto vira número
  const vazia = dadosDaPraticaNoCertificado(
    sessao({
      hora_inicio: null,
      hora_fim: "",
      instrutor_qualificacao: "  ",
      carga_horas: "2.5",
    }) as never
  );
  assert.equal(vazia.hora_inicio, null);
  assert.equal(vazia.hora_fim, null);
  assert.equal(vazia.instrutor.qualificacao, null);
  assert.equal(vazia.carga_horas, 2.5);
});

test("localComPratica: o local do certificado leva o ambiente da teoria e o local da prática", () => {
  const ambiente = { ambiente: "Plataforma de Teste — https://exemplo.test/portal" };
  assert.deepEqual(localComPratica(ambiente, sessao() as never), {
    ambiente: "Plataforma de Teste — https://exemplo.test/portal",
    pratica: "Pátio de treinamento de teste",
  });
  // o objeto base não muda (é a constante do EAD)
  assert.deepEqual(ambiente, { ambiente: "Plataforma de Teste — https://exemplo.test/portal" });
});

test("periodoComPratica: o período cobre a teoria e o dia da prática; a validade não muda", () => {
  const teoria = { inicio: "2026-10-01", conclusao: "2026-10-03", validade: "2028-10-03" };
  assert.deepEqual(periodoComPratica(teoria, "2026-10-05"), {
    inicio: "2026-10-01",
    conclusao: "2026-10-05",
    validade: "2028-10-03",
  });
  // prática antes da teoria: o início recua
  assert.deepEqual(periodoComPratica(teoria, "2026-09-28"), {
    inicio: "2026-09-28",
    conclusao: "2026-10-03",
    validade: "2028-10-03",
  });
  // prática dentro do período: nada muda
  assert.deepEqual(periodoComPratica(teoria, "2026-10-02"), teoria);
  // sem início (matrícula antiga) ou sem data da prática
  assert.deepEqual(periodoComPratica({ ...teoria, inicio: null }, "2026-10-05"), {
    inicio: "2026-10-05",
    conclusao: "2026-10-05",
    validade: "2028-10-03",
  });
  assert.deepEqual(periodoComPratica(teoria, null), teoria);
});

// ---------------------------------------------------------------------------------- o item de `dados`

test("praticaParaOAluno: só o semipresencial tem parte prática; o aluno recebe situação, data, local e texto", () => {
  const base = { sessoes: [sessao()], participacoes: [participacao()], hoje: HOJE };
  const matricula = { id: MAT, curso_id: CURSO };
  for (const modalidade of ["ead", "apoio", undefined]) {
    assert.equal(
      praticaParaOAluno({ curso: { id: CURSO, modalidade }, matricula, ...base }),
      null,
      String(modalidade)
    );
  }
  const r = praticaParaOAluno({
    curso: { id: CURSO, modalidade: "semipresencial" },
    matricula,
    ...base,
  });
  assert.deepEqual(r, {
    situacao: "realizada",
    data: "2026-10-05",
    local: "Pátio de treinamento de teste",
    texto: "Parte prática: realizada em 05/10/2026, em Pátio de treinamento de teste.",
  });
  // o instrutor, o horário e as observações da sessão não vão ao aluno
  assert.ok(!("instrutor" in (r as object)));
  const pendente = praticaParaOAluno({
    curso: { id: CURSO, modalidade: "semipresencial" },
    matricula,
    sessoes: [],
    participacoes: [],
    hoje: HOJE,
  });
  assert.deepEqual(pendente, {
    situacao: "pendente",
    data: null,
    local: null,
    texto: textoDaPratica({ situacao: "pendente", sessao: null }),
  });
});

// ---------------------------------------------------------------------------------- leitura no banco

type Chamada = { tabela: string; filtros: unknown[][] };
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
const silenciar = async (fn: () => Promise<void>) => {
  const original = console.error;
  const erros: unknown[][] = [];
  console.error = (...a: unknown[]) => void erros.push(a);
  try {
    await fn();
  } finally {
    console.error = original;
  }
  return erros;
};

test("lerPratica: lê as sessões do curso e as participações da matrícula, sempre da empresa da sessão", async () => {
  const { db, chamadas } = bancoDeTeste({
    treinamento_sessao_pratica: { data: [sessao()] },
    treinamento_pratica_participante: { data: [participacao()] },
  });
  const r = await lerPratica(db, {
    matriculaId: MAT,
    cursoId: CURSO,
    empresaId: "empresa-1",
    hoje: HOJE,
  });
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.pratica.situacao, "realizada");
  assert.equal(r.ok && r.pratica.sessao?.id, "s1");
  const sessoes = chamadas.find((c) => c.tabela === "treinamento_sessao_pratica");
  assert.ok(tem(sessoes, ["eq", "curso_id", CURSO]));
  assert.ok(tem(sessoes, ["eq", "empresa_id", "empresa-1"]));
  assert.ok(tem(sessoes, ["is", "deleted_at", null]));
  const parts = chamadas.find((c) => c.tabela === "treinamento_pratica_participante");
  assert.ok(tem(parts, ["eq", "matricula_id", MAT]));
  assert.ok(tem(parts, ["eq", "empresa_id", "empresa-1"]));
  assert.ok(tem(parts, ["is", "deleted_at", null]));
});

test("lerPratica: falha de leitura em qualquer consulta não vira 'realizada' (ok: false, causa no log)", async () => {
  for (const tabela of ["treinamento_sessao_pratica", "treinamento_pratica_participante"]) {
    const cenario: Record<string, { data: unknown; error?: unknown }> = {
      treinamento_sessao_pratica: { data: [sessao()] },
      treinamento_pratica_participante: { data: [participacao()] },
    };
    cenario[tabela] = { data: null, error: { message: "falhou", code: "XX000" } };
    let r: unknown;
    const erros = await silenciar(async () => {
      r = await lerPratica(bancoDeTeste(cenario).db, {
        matriculaId: MAT,
        cursoId: CURSO,
        empresaId: "empresa-1",
        hoje: HOJE,
      });
    });
    assert.deepEqual(r, { ok: false }, tabela);
    assert.ok(erros.length > 0, `${tabela}: a causa vai para o log`);
  }
});

test("praticasDoBanco: sem curso semipresencial não consulta; com erro devolve vazio (o aluno fica 'pendente')", async () => {
  const sem = bancoDeTeste({});
  assert.deepEqual(
    await praticasDoBanco(sem.db, { cursoIds: [], matriculaIds: ["m"], empresaId: "e" }),
    {
      sessoes: [],
      participacoes: [],
    }
  );
  assert.equal(sem.chamadas.length, 0);
  const { db, chamadas } = bancoDeTeste({
    treinamento_sessao_pratica: { data: [sessao()] },
    treinamento_pratica_participante: { data: [participacao()] },
  });
  const r = await praticasDoBanco(db, {
    cursoIds: [CURSO, CURSO],
    matriculaIds: [MAT],
    empresaId: "empresa-1",
  });
  assert.equal(r.sessoes.length, 1);
  assert.equal(r.participacoes.length, 1);
  const sessoes = chamadas.find((c) => c.tabela === "treinamento_sessao_pratica");
  assert.ok(tem(sessoes, ["in", "curso_id", [CURSO]]), "sem repetir o curso");
  assert.ok(tem(sessoes, ["eq", "empresa_id", "empresa-1"]));
  const parts = chamadas.find((c) => c.tabela === "treinamento_pratica_participante");
  assert.ok(tem(parts, ["in", "matricula_id", [MAT]]));
  assert.ok(tem(parts, ["eq", "empresa_id", "empresa-1"]));
  let falhou: unknown;
  await silenciar(async () => {
    falhou = await praticasDoBanco(
      bancoDeTeste({ treinamento_sessao_pratica: { data: null, error: { message: "x" } } }).db,
      { cursoIds: [CURSO], matriculaIds: [MAT], empresaId: "e" }
    );
  });
  assert.deepEqual(falhou, { sessoes: [], participacoes: [] });
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

test("certificado: o semipresencial confere a prática ANTES da senha e responde 409 PRATICA_PENDENTE", () => {
  const t = trecho("certificado");
  const iLer = t.indexOf("lerPratica(");
  const iBloqueio = t.indexOf("bloqueioDeEmissaoPorPratica(");
  const iSenha = t.indexOf("reconfirmar(");
  assert.ok(iLer > 0, "a ação certificado lê a prática no banco");
  assert.ok(iLer < iBloqueio && iBloqueio < iSenha, "lê, confere e só então pede a senha");
  assert.ok(/409,\s*\{\s*codigo:\s*semPratica\.codigo/.test(t), "409 com o código da prática");
  // falha de leitura não deixa emitir
  assert.ok(/!praticaLida\.ok[\s\S]{0,200}503/.test(t));
});

test("certificado: congela a prática, o local da prática, as duas cargas e o período com a prática", () => {
  const t = trecho("certificado");
  assert.ok(t.includes("dadosDaPraticaNoCertificado("));
  assert.ok(t.includes("localComPratica("));
  assert.ok(t.includes("periodoComPratica("));
  assert.ok(/carga_teorica_horas/.test(t) && /carga_pratica_horas/.test(t));
  assert.ok(t.includes("textoDaModalidade(modalidadeDoCurso(curso), curso)"));
});

test("dados: o semipresencial recebe a parte prática e só emite com ela realizada", () => {
  const t = trecho("dados");
  assert.ok(t.includes("praticasDoBanco("));
  assert.ok(t.includes("praticaParaOAluno("));
  assert.ok(/pratica:\s*pratica\b/.test(t));
  // curso que não é semipresencial não tem prática (null) e não depende dela
  assert.ok(/\(pratica === null \|\| pratica\.situacao === "realizada"\)/.test(t));
});
