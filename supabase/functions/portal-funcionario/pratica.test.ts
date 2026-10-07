// Roda com Node 23.6+ (type stripping):
//   node --test supabase/functions/portal-funcionario/pratica.test.ts
//
// T12: parte prática presencial do curso semipresencial (tabelas treinamento_sessao_pratica e
// treinamento_pratica_participante, migração 0143). O certificado do semipresencial só é emitido com a
// participação do aluno marcada "presente" e "satisfatório" em sessões não apagadas do mesmo curso, já realizadas
// (data até hoje, em Brasília), cuja soma de carga chegue à carga prática do curso. A regra é espelhada no front (apps/web/src/lib/ead-pratica.js); este teste
// confere os dois contra os mesmos casos. Dados sintéticos: ids, nomes e locais de mentira.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renovacaoAPartirDe } from "./regras.ts";
import {
  bloqueioDeEmissaoPorPratica,
  dadosDaPraticaNoCertificado,
  fimDoSemipresencial,
  lerPratica,
  localComPratica,
  periodoComPratica,
  periodoDoSemipresencial,
  podeEmitirSemipresencial,
  praticaDoCertificado,
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
  assert.deepEqual(situacaoDaPratica(entrada([], [])), {
    situacao: "pendente",
    sessao: null,
    sessoes: [],
    cumpridaHoras: 0,
    exigidaHoras: null,
  });
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

/** A situação como `situacaoDaPratica` a devolve, para os testes de texto. */
const situacao = (extra: Record<string, unknown>) =>
  ({ sessoes: [], cumpridaHoras: 0, exigidaHoras: null, ...extra }) as never;

test("textoDaPratica: o que o aluno lê em cada situação", () => {
  assert.equal(
    textoDaPratica(situacao({ situacao: "realizada", sessao: sessao(), sessoes: [sessao()] })),
    "Parte prática: realizada em 05/10/2026, em Pátio de treinamento de teste."
  );
  assert.equal(
    textoDaPratica(situacao({ situacao: "agendada", sessao: sessao({ data: "2026-10-20" }) })),
    "Parte prática: pendente. Sessão presencial marcada para 20/10/2026, em Pátio de treinamento de teste."
  );
  assert.match(
    textoDaPratica(situacao({ situacao: "insatisfatoria", sessao: sessao() })),
    /^Parte prática: resultado insatisfatório\. Procure o RH/
  );
  assert.match(
    textoDaPratica(situacao({ situacao: "pendente", sessao: null })),
    /^Parte prática: pendente\./
  );
});

test("textoDaPratica: a prática de vários dias lista os dias e os locais, sem repetir", () => {
  const dia1 = sessao({ id: "a", data: "2026-10-05", local: "Pátio A" });
  const dia2 = sessao({ id: "b", data: "2026-10-06", local: "Pátio A" });
  const dia3 = sessao({ id: "c", data: "2026-10-07", local: "Galpão B" });
  const turno2 = sessao({ id: "d", data: "2026-10-06", local: "Pátio A" });
  assert.equal(
    textoDaPratica(situacao({ situacao: "realizada", sessao: dia2, sessoes: [dia1, dia2] })),
    "Parte prática: realizada em 05/10/2026 e 06/10/2026, em Pátio A."
  );
  assert.equal(
    textoDaPratica(situacao({ situacao: "realizada", sessao: dia3, sessoes: [dia1, dia2, dia3] })),
    "Parte prática: realizada em 05/10/2026, 06/10/2026 e 07/10/2026, em Pátio A e Galpão B."
  );
  // dois turnos no mesmo dia: o dia sai uma vez
  assert.equal(
    textoDaPratica(situacao({ situacao: "realizada", sessao: turno2, sessoes: [dia2, turno2] })),
    "Parte prática: realizada em 06/10/2026, em Pátio A."
  );
});

test("textoDaPratica: quem já cumpriu parte da carga vê quantas horas faltam", () => {
  assert.equal(
    textoDaPratica(
      situacao({ situacao: "parcial", sessao: null, cumpridaHoras: 8, exigidaHoras: 16 })
    ),
    "Parte prática: pendente. Cumpridas 8 h das 16 h de prática presencial. O RH registra as próximas sessões presenciais."
  );
  assert.match(
    textoDaPratica(
      situacao({
        situacao: "agendada",
        sessao: sessao({ data: "2026-10-20" }),
        cumpridaHoras: 2.5,
        exigidaHoras: 8,
      })
    ),
    /marcada para 20\/10\/2026, em Pátio de treinamento de teste\. Cumpridas 2,5 h das 8 h de prática presencial\.$/
  );
  // sem horas cumpridas o texto não fala de horas
  assert.ok(
    !textoDaPratica(situacao({ situacao: "insatisfatoria", sessao: sessao() })).includes(
      "Cumpridas"
    )
  );
});

test("bloqueioDeEmissaoPorPratica: 409 PRATICA_PENDENTE com o motivo; realizada não bloqueia", () => {
  assert.equal(
    bloqueioDeEmissaoPorPratica(
      situacao({ situacao: "realizada", sessao: sessao(), sessoes: [sessao()] })
    ),
    null
  );
  const textos = new Set<string>();
  for (const quando of ["pendente", "agendada", "insatisfatoria", "parcial"] as const) {
    const b = bloqueioDeEmissaoPorPratica(
      situacao({ situacao: quando, sessao: sessao(), cumpridaHoras: 8, exigidaHoras: 16 })
    );
    assert.equal(b?.codigo, "PRATICA_PENDENTE", quando);
    assert.match(b!.mensagem, /prática presencial/, quando);
    assert.match(b!.mensagem, /satisfatória/, quando);
    textos.add(b!.mensagem);
  }
  assert.equal(textos.size, 4, "cada situação tem a sua explicação");
});

// ---------------------------------------------------------------------------------- o certificado

test("dadosDaPraticaNoCertificado: congela dia, horário, local, instrutor e carga de cada sessão, mais a soma", () => {
  const s = sessao({ observacoes: "não vai ao certificado", lista_presenca_ref: "treinamentos/x" });
  const dados = dadosDaPraticaNoCertificado([s as never]);
  assert.deepEqual(dados, {
    carga_horas: 4,
    resultado: "satisfatorio",
    sessoes: [
      {
        sessao_id: "s1",
        data: "2026-10-05",
        hora_inicio: "08:00",
        hora_fim: "12:00",
        local: "Pátio de treinamento de teste",
        instrutor: { nome: "Instrutor de Teste", qualificacao: "Eng. de Teste" },
        carga_horas: 4,
      },
    ],
  });
  // é uma cópia: mudar a sessão depois (o RH edita) não muda o que foi congelado
  s.local = "Outro local";
  (s as { instrutor_nome: string }).instrutor_nome = "Outra pessoa";
  assert.equal(dados.sessoes[0].local, "Pátio de treinamento de teste");
  assert.equal(dados.sessoes[0].instrutor.nome, "Instrutor de Teste");
  // campos vazios viram null; carga em texto vira número
  const vazia = dadosDaPraticaNoCertificado([
    sessao({
      hora_inicio: null,
      hora_fim: "",
      instrutor_qualificacao: "  ",
      carga_horas: "2.5",
    }) as never,
  ]);
  assert.equal(vazia.sessoes[0].hora_inicio, null);
  assert.equal(vazia.sessoes[0].hora_fim, null);
  assert.equal(vazia.sessoes[0].instrutor.qualificacao, null);
  assert.equal(vazia.sessoes[0].carga_horas, 2.5);
  assert.equal(vazia.carga_horas, 2.5);
});

test("dadosDaPraticaNoCertificado: a prática de vários dias congela todas as sessões, em ordem de data, e soma as cargas", () => {
  const dia1 = sessao({ id: "a", data: "2026-10-05", carga_horas: 8, hora_fim: "17:00:00" });
  const dia2 = sessao({
    id: "b",
    data: "2026-10-06",
    carga_horas: 8,
    hora_fim: "17:00:00",
    local: "Galpão B",
  });
  const dados = dadosDaPraticaNoCertificado([dia2 as never, dia1 as never]);
  assert.deepEqual(
    dados.sessoes.map((x) => [x.sessao_id, x.data, x.local, x.carga_horas]),
    [
      ["a", "2026-10-05", "Pátio de treinamento de teste", 8],
      ["b", "2026-10-06", "Galpão B", 8],
    ]
  );
  assert.equal(dados.carga_horas, 16);
  // a soma não carrega erro de ponto flutuante (em dias diferentes: no mesmo dia e horário seriam a mesma sessão
  // lançada duas vezes, que vale uma vez só, A7)
  const frac = dadosDaPraticaNoCertificado([
    sessao({ id: "a", carga_horas: 0.1 }) as never,
    sessao({ id: "b", data: "2026-10-06", carga_horas: 0.2 }) as never,
  ]);
  assert.equal(frac.carga_horas, 0.3);
});

test("localComPratica: o local do certificado leva o ambiente da teoria e os locais da prática", () => {
  const ambiente = { ambiente: "Plataforma de Teste — https://exemplo.test/portal" };
  assert.deepEqual(localComPratica(ambiente, [sessao() as never]), {
    ambiente: "Plataforma de Teste — https://exemplo.test/portal",
    pratica: "Pátio de treinamento de teste",
  });
  // vários dias: os locais na ordem das sessões, sem repetir
  const dia1 = sessao({ id: "a", data: "2026-10-05", local: "Pátio A" });
  const dia2 = sessao({ id: "b", data: "2026-10-06", local: "Pátio A" });
  const dia3 = sessao({ id: "c", data: "2026-10-07", local: "Galpão B" });
  assert.equal(
    localComPratica(ambiente, [dia3 as never, dia1 as never, dia2 as never]).pratica,
    "Pátio A e Galpão B"
  );
  assert.equal(localComPratica(ambiente, [dia1 as never, dia2 as never]).pratica, "Pátio A");
  // o objeto base não muda (é a constante do EAD)
  assert.deepEqual(ambiente, { ambiente: "Plataforma de Teste — https://exemplo.test/portal" });
});

test("periodoComPratica: o período cobre a teoria e os dias da prática; sem validade nova, a da teoria fica", () => {
  const teoria = { inicio: "2026-10-01", conclusao: "2026-10-03", validade: "2028-10-03" };
  assert.deepEqual(periodoComPratica(teoria, ["2026-10-05"]), {
    inicio: "2026-10-01",
    conclusao: "2026-10-05",
    validade: "2028-10-03",
  });
  // vários dias: vale o último para a conclusão
  assert.deepEqual(periodoComPratica(teoria, ["2026-10-06", "2026-10-05"]), {
    inicio: "2026-10-01",
    conclusao: "2026-10-06",
    validade: "2028-10-03",
  });
  // prática antes da teoria: o início recua
  assert.deepEqual(periodoComPratica(teoria, ["2026-09-28"]), {
    inicio: "2026-09-28",
    conclusao: "2026-10-03",
    validade: "2028-10-03",
  });
  // prática dentro do período: nada muda
  assert.deepEqual(periodoComPratica(teoria, ["2026-10-02"]), teoria);
  // sem início (matrícula antiga) ou sem data da prática
  assert.deepEqual(periodoComPratica({ ...teoria, inicio: null }, ["2026-10-05"]), {
    inicio: "2026-10-05",
    conclusao: "2026-10-05",
    validade: "2028-10-03",
  });
  assert.deepEqual(periodoComPratica(teoria, [null, "amanhã"]), teoria);
  assert.deepEqual(periodoComPratica(teoria, []), teoria);
});

test("periodoComPratica: a validade contada do fim do treinamento substitui a da teoria (e pode ser null)", () => {
  const teoria = { inicio: "2025-09-20", conclusao: "2025-10-01", validade: "2026-10-01" };
  assert.deepEqual(periodoComPratica(teoria, ["2026-10-05"], "2027-10-05"), {
    inicio: "2025-09-20",
    conclusao: "2026-10-05",
    validade: "2027-10-05",
  });
  // curso sem validade: a validade some (null), não fica a da teoria
  assert.equal(periodoComPratica(teoria, ["2026-10-05"], null).validade, null);
  // a validade nova vale mesmo sem dia de prática válido
  assert.equal(periodoComPratica(teoria, [], "2027-10-05").validade, "2027-10-05");
  // o objeto recebido não muda
  assert.equal(teoria.validade, "2026-10-01");
});

test("fimDoSemipresencial: o maior dia entre a conclusão da teoria e as sessões que valeram", () => {
  const s = (data: string | null, id = "x") => sessao({ id, data }) as never;
  // a prática depois da teoria (o caso comum)
  assert.equal(fimDoSemipresencial("2025-10-01", [s("2026-10-05")]), "2026-10-05");
  // vários dias: o último
  assert.equal(
    fimDoSemipresencial("2026-10-01", [s("2026-10-05", "a"), s("2026-10-12", "b")]),
    "2026-10-12"
  );
  // a prática ANTES de a teoria terminar: vale a conclusão da teoria
  assert.equal(fimDoSemipresencial("2026-10-10", [s("2026-10-05")]), "2026-10-10");
  // a conclusão pode vir como timestamp ou vazia; dia que não é data não conta
  assert.equal(fimDoSemipresencial("2026-10-01T10:00:00Z", [s("2026-09-30")]), "2026-10-01");
  assert.equal(fimDoSemipresencial(null, [s("2026-10-05")]), "2026-10-05");
  assert.equal(fimDoSemipresencial("2026-10-01", [s(null), s("amanhã", "y")]), "2026-10-01");
  assert.equal(fimDoSemipresencial(null, []), null);
});

// ---------------------------------------------------------------------------------- a carga da prática (I2)

/** A carga prática do curso nos casos abaixo: 16 h, em duas sessões de 8 h (a NR-10 do exemplo da revisão). */
const CARGA_PRATICA = 16;
const oito = (id: string, data: string, extra: Record<string, unknown> = {}) =>
  sessao({ id, data, carga_horas: 8, hora_inicio: "08:00:00", hora_fim: "17:00:00", ...extra });
const comCarga = (
  sessoes: unknown[],
  participacoes: unknown[],
  carga: number | string | null = CARGA_PRATICA
) => ({ ...entrada(sessoes, participacoes), cargaPraticaHoras: carga });

test("carga da prática: uma sessão de 8 h não libera o certificado de 16 h (o caso da revisão)", () => {
  const dia1 = oito("a", "2026-10-05");
  const so1 = comCarga([dia1], [participacao({ sessao_id: "a" })]);
  assert.equal(podeEmitirSemipresencial(so1), false);
  const r = situacaoDaPratica(so1);
  assert.equal(r.situacao, "parcial");
  assert.equal(r.cumpridaHoras, 8);
  assert.equal(r.exigidaHoras, 16);
  assert.equal(r.sessao, null);
  assert.deepEqual(r.sessoes, []);
  // o 409 explica quanto falta
  const b = bloqueioDeEmissaoPorPratica(r);
  assert.equal(b?.codigo, "PRATICA_PENDENTE");
  assert.match(b!.mensagem, /Cumpridas 8 h das 16 h/);
});

test("carga da prática: as duas sessões de 8 h somam 16 h e liberam, com as duas congeladas na ordem", () => {
  const dia1 = oito("a", "2026-10-05");
  const dia2 = oito("b", "2026-10-06");
  const dois = comCarga(
    [dia2, dia1],
    [participacao({ sessao_id: "a" }), participacao({ sessao_id: "b" })]
  );
  assert.equal(podeEmitirSemipresencial(dois), true);
  const r = situacaoDaPratica(dois);
  assert.equal(r.situacao, "realizada");
  assert.deepEqual(
    r.sessoes.map((s) => s.id),
    ["a", "b"]
  );
  assert.equal(r.sessao?.id, "b", "a sessão principal é a última que valeu");
  assert.equal(r.cumpridaHoras, 16);
  // e o que vai ao certificado soma as duas
  assert.equal(dadosDaPraticaNoCertificado(r.sessoes).carga_horas, 16);
});

test("carga da prática: uma sessão só de 16 h também vale, e o excesso de sessões fica fora do certificado", () => {
  // 16 h num dia só (06h às 23h): a carga cabe no relógio (a sessão com mais horas que o horário não existe: 0143)
  assert.equal(
    podeEmitirSemipresencial(
      comCarga(
        [
          oito("a", "2026-10-05", {
            carga_horas: 16,
            hora_inicio: "06:00:00",
            hora_fim: "23:00:00",
          }),
        ],
        [participacao({ sessao_id: "a" })]
      )
    ),
    true
  );
  // e a carga declarada acima do horário não rende mais que o horário (a conta limita ao relógio)
  assert.equal(
    podeEmitirSemipresencial(
      comCarga([oito("a", "2026-10-05", { carga_horas: 16 })], [participacao({ sessao_id: "a" })])
    ),
    false
  );
  // três sessões de 8 h para 16 h: valem as duas primeiras
  const tres = comCarga(
    [oito("a", "2026-10-05"), oito("b", "2026-10-06"), oito("c", "2026-10-07")],
    [
      participacao({ sessao_id: "a" }),
      participacao({ sessao_id: "b" }),
      participacao({ sessao_id: "c" }),
    ]
  );
  const r = situacaoDaPratica(tres);
  assert.equal(r.situacao, "realizada");
  assert.deepEqual(
    r.sessoes.map((s) => s.id),
    ["a", "b"]
  );
  assert.equal(
    r.cumpridaHoras,
    24,
    "o cumprido conta tudo; o certificado leva as que cobriram a carga"
  );
  // sessões de 6 h para 16 h: a soma passa de 16 (18 h) e as três entram
  const seis = comCarga(
    [
      oito("a", "2026-10-05", { carga_horas: 6 }),
      oito("b", "2026-10-06", { carga_horas: 6 }),
      oito("c", "2026-10-07", { carga_horas: 6 }),
    ],
    [
      participacao({ sessao_id: "a" }),
      participacao({ sessao_id: "b" }),
      participacao({ sessao_id: "c" }),
    ]
  );
  assert.equal(situacaoDaPratica(seis).sessoes.length, 3);
  assert.equal(dadosDaPraticaNoCertificado(situacaoDaPratica(seis).sessoes).carga_horas, 18);
});

test("carga da prática: só conta a sessão em que ele esteve presente, satisfatório e já realizada", () => {
  const dia1 = oito("a", "2026-10-05");
  const dia2 = oito("b", "2026-10-06");
  const futura = oito("c", "2026-10-20");
  const base = [participacao({ sessao_id: "a" })];
  for (const [nome, segunda] of [
    ["ausente", participacao({ sessao_id: "b", presente: false, resultado: "pendente" })],
    ["insatisfatória", participacao({ sessao_id: "b", resultado: "insatisfatorio" })],
    ["pendente", participacao({ sessao_id: "b", resultado: "pendente" })],
    ["apagada", participacao({ sessao_id: "b", deleted_at: "2026-10-06T10:00:00Z" })],
    ["de outra matrícula", participacao({ sessao_id: "b", matricula_id: "outra" })],
  ] as const) {
    assert.equal(podeEmitirSemipresencial(comCarga([dia1, dia2], [...base, segunda])), false, nome);
  }
  // a segunda sessão apagada (ou de outro curso) não conta, mesmo com a participação viva
  for (const outra of [
    { ...dia2, deleted_at: "2026-10-06T10:00:00Z" },
    { ...dia2, curso_id: "outro-curso" },
  ]) {
    assert.equal(
      podeEmitirSemipresencial(
        comCarga([dia1, outra], [...base, participacao({ sessao_id: "b" })])
      ),
      false
    );
  }
  // sessão marcada para depois de hoje (mesmo com "satisfatório" lançado) ainda não conta
  assert.equal(
    podeEmitirSemipresencial(comCarga([dia1, futura], [...base, participacao({ sessao_id: "c" })])),
    false
  );
});

test("carga da prática: reprovar numa sessão e cumprir a carga nas outras libera; sem sessão nova fica insatisfatória", () => {
  const dia1 = oito("a", "2026-10-03");
  const dia2 = oito("b", "2026-10-04");
  const dia3 = oito("c", "2026-10-05");
  // 8 h satisfatórias e uma sessão insatisfatória por último: o RH precisa de uma nova sessão
  const reprovado = situacaoDaPratica(
    comCarga(
      [dia1, dia2],
      [
        participacao({ sessao_id: "a" }),
        participacao({ sessao_id: "b", resultado: "insatisfatorio" }),
      ]
    )
  );
  assert.equal(reprovado.situacao, "insatisfatoria");
  assert.equal(reprovado.sessao?.id, "b");
  assert.equal(reprovado.cumpridaHoras, 8);
  assert.match(textoDaPratica(reprovado), /Cumpridas 8 h das 16 h/);
  // refeita numa terceira sessão: 8 + 8 cobre as 16 h
  const refeita = situacaoDaPratica(
    comCarga(
      [dia1, dia2, dia3],
      [
        participacao({ sessao_id: "a" }),
        participacao({ sessao_id: "b", resultado: "insatisfatorio" }),
        participacao({ sessao_id: "c" }),
      ]
    )
  );
  assert.equal(refeita.situacao, "realizada");
  assert.deepEqual(
    refeita.sessoes.map((s) => s.id),
    ["a", "c"]
  );
});

test("carga da prática: com sessão marcada para depois, a situação é 'agendada' e mostra o que já foi cumprido", () => {
  const dia1 = oito("a", "2026-10-05");
  const proxima = oito("b", "2026-10-20");
  const r = situacaoDaPratica(
    comCarga(
      [dia1, proxima],
      [
        participacao({ sessao_id: "a" }),
        participacao({ sessao_id: "b", presente: false, resultado: "pendente" }),
      ]
    )
  );
  assert.equal(r.situacao, "agendada");
  assert.equal(r.sessao?.id, "b");
  assert.match(textoDaPratica(r), /marcada para 20\/10\/2026.*Cumpridas 8 h das 16 h/);
});

test("carga da prática: sem a carga do curso vale uma sessão satisfatória (o requisito CARGAS trava a emissão à parte)", () => {
  const a = oito("a", "2026-10-05", { carga_horas: 2 });
  const semCarga = [
    // o curso sem carga prática: a propriedade ausente, nula, zero, vazia, inválida ou negativa
    entrada([a], [participacao({ sessao_id: "a" })]),
    ...[null, 0, "", "abc", -1].map((carga) =>
      comCarga([a], [participacao({ sessao_id: "a" })], carga as never)
    ),
  ];
  for (const [i, caso] of semCarga.entries()) {
    const r = situacaoDaPratica(caso);
    assert.equal(r.situacao, "realizada", `caso ${i}`);
    assert.equal(r.exigidaHoras, null);
    assert.deepEqual(
      r.sessoes.map((s) => s.id),
      ["a"]
    );
  }
});

test("carga da prática: carga em texto (numeric do banco), frações e sessão sem carga válida", () => {
  const a = oito("a", "2026-10-05", { carga_horas: "2.5" });
  const b = oito("b", "2026-10-06", { carga_horas: 1.5 });
  const dois = [participacao({ sessao_id: "a" }), participacao({ sessao_id: "b" })];
  // 2,5 + 1,5 = 4 h exatas (em centésimos de hora, sem erro de ponto flutuante)
  assert.equal(podeEmitirSemipresencial(comCarga([a, b], dois, "4.00")), true);
  assert.equal(podeEmitirSemipresencial(comCarga([a, b], dois, 4.01)), false);
  // 0,1 + 0,2 chega a 0,3
  const c = oito("c", "2026-10-05", { carga_horas: 0.1 });
  const d = oito("d", "2026-10-06", { carga_horas: 0.2 });
  assert.equal(
    podeEmitirSemipresencial(
      comCarga([c, d], [participacao({ sessao_id: "c" }), participacao({ sessao_id: "d" })], 0.3)
    ),
    true
  );
  // sessão sem carga válida conta zero
  for (const invalida of [null, "", "abc", 0, -2]) {
    const e = oito("e", "2026-10-05", { carga_horas: invalida });
    assert.equal(
      podeEmitirSemipresencial(comCarga([e], [participacao({ sessao_id: "e" })], 1)),
      false,
      String(invalida)
    );
  }
});

test("carga da prática: a mesma sessão com a participação repetida conta uma vez só", () => {
  const dia1 = oito("a", "2026-10-05");
  const repetida = comCarga(
    [dia1],
    [participacao({ sessao_id: "a" }), participacao({ sessao_id: "a" })]
  );
  assert.equal(podeEmitirSemipresencial(repetida), false);
  assert.equal(situacaoDaPratica(repetida).cumpridaHoras, 8);
});

test("carga da prática: o espelho do front diz o mesmo (situação, sessões e horas)", () => {
  const dia1 = oito("a", "2026-10-05");
  const dia2 = oito("b", "2026-10-06");
  const dia3 = oito("c", "2026-10-07");
  const futura = oito("f", "2026-10-20");
  const p = (sessao_id: string, extra: Record<string, unknown> = {}) =>
    participacao({ sessao_id, ...extra });
  const casos = [
    comCarga([dia1], [p("a")]),
    comCarga([dia1, dia2], [p("a"), p("b")]),
    comCarga([dia1, dia2, dia3], [p("a"), p("b"), p("c")]),
    comCarga([dia1, dia2], [p("a"), p("b", { resultado: "insatisfatorio" })]),
    comCarga([dia1, futura], [p("a"), p("f", { presente: false, resultado: "pendente" })]),
    comCarga([dia1, dia2], [p("a"), p("b", { presente: false, resultado: "pendente" })]),
    comCarga([dia1], [p("a")], null),
    comCarga([dia1], [p("a")], "16"),
    comCarga([dia1, dia1], [p("a"), p("a")]),
    comCarga([oito("a", "2026-10-05", { carga_horas: "2.5" }), dia2], [p("a"), p("b")], 10.5),
  ];
  for (const [i, caso] of casos.entries()) {
    assert.deepEqual(situacaoNoFront(caso), situacaoDaPratica(caso), `caso ${i}`);
    assert.equal(podeEmitirNoFront(caso), podeEmitirSemipresencial(caso), `caso ${i}`);
  }
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
    texto: textoDaPratica(situacao({ situacao: "pendente", sessao: null })),
  });
});

test("praticaParaOAluno: usa a carga prática do curso (a de 8 h não basta para 16 h) e lista os dias da prática", () => {
  const matricula = { id: MAT, curso_id: CURSO };
  const dia1 = oito("a", "2026-10-05");
  const dia2 = oito("b", "2026-10-06", { local: "Galpão B" });
  const curso = { id: CURSO, modalidade: "semipresencial", carga_pratica_horas: 16 };
  const so1 = praticaParaOAluno({
    curso,
    matricula,
    sessoes: [dia1] as never,
    participacoes: [participacao({ sessao_id: "a" })] as never,
    hoje: HOJE,
  });
  assert.equal(so1?.situacao, "parcial");
  assert.equal(so1?.data, null);
  assert.match(so1!.texto, /Cumpridas 8 h das 16 h de prática presencial/);
  const dois = praticaParaOAluno({
    curso,
    matricula,
    sessoes: [dia1, dia2] as never,
    participacoes: [participacao({ sessao_id: "a" }), participacao({ sessao_id: "b" })] as never,
    hoje: HOJE,
  });
  assert.deepEqual(dois, {
    situacao: "realizada",
    data: "2026-10-06",
    local: "Pátio de treinamento de teste e Galpão B",
    texto:
      "Parte prática: realizada em 05/10/2026 e 06/10/2026, em Pátio de treinamento de teste e Galpão B.",
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
  // só as sessões das participações da matrícula (A6, N6): não as do curso inteiro, que passam do teto do PostgREST
  assert.ok(tem(sessoes, ["in", "id", ["s1"]]));
  const parts = chamadas.find((c) => c.tabela === "treinamento_pratica_participante");
  assert.ok(tem(parts, ["eq", "matricula_id", MAT]));
  assert.ok(tem(parts, ["eq", "empresa_id", "empresa-1"]));
  assert.ok(tem(parts, ["is", "deleted_at", null]));
  // as participações são lidas ANTES das sessões (as sessões dependem delas)
  assert.ok(chamadas.indexOf(parts!) < chamadas.indexOf(sessoes!));
});

test("lerPratica: sem participação não lê sessão nenhuma (nada a contar), e a falha de uma delas não vira 'realizada' (A6, N6)", async () => {
  const { db, chamadas } = bancoDeTeste({
    treinamento_sessao_pratica: { data: [sessao()] },
    treinamento_pratica_participante: { data: [] },
  });
  const r = await lerPratica(db, {
    matriculaId: MAT,
    cursoId: CURSO,
    empresaId: "empresa-1",
    hoje: HOJE,
  });
  assert.equal(r.ok && r.pratica.situacao, "pendente");
  assert.equal(
    chamadas.filter((c) => c.tabela === "treinamento_sessao_pratica").length,
    0,
    "sem participação, nenhuma consulta de sessão"
  );
});

test("lerPratica: muitas participações viram várias consultas pequenas de sessão (o filtro vai na URL)", async () => {
  const ids = Array.from({ length: 170 }, (_, i) => `sessao-${i}`);
  const { db, chamadas } = bancoDeTeste({
    treinamento_sessao_pratica: { data: [] },
    treinamento_pratica_participante: { data: ids.map((sessao_id) => participacao({ sessao_id })) },
  });
  await lerPratica(db, { matriculaId: MAT, cursoId: CURSO, empresaId: "empresa-1", hoje: HOJE });
  const consultas = chamadas.filter((c) => c.tabela === "treinamento_sessao_pratica");
  assert.equal(consultas.length, 3);
  const tamanhos = consultas.map(
    (c) => (c.filtros.find((f) => f[0] === "in")![2] as string[]).length
  );
  assert.deepEqual(tamanhos, [80, 80, 10]);
  // e cada consulta leva o filtro da empresa e do curso
  for (const c of consultas) {
    assert.ok(tem(c, ["eq", "empresa_id", "empresa-1"]));
    assert.ok(tem(c, ["eq", "curso_id", CURSO]));
  }
});

test("lerPratica: a carga prática do curso decide se as sessões bastam", async () => {
  const cenario = {
    treinamento_sessao_pratica: { data: [oito("a", "2026-10-05")] },
    treinamento_pratica_participante: { data: [participacao({ sessao_id: "a" })] },
  };
  const ler = (cargaPraticaHoras?: number) =>
    lerPratica(bancoDeTeste(cenario).db, {
      matriculaId: MAT,
      cursoId: CURSO,
      empresaId: "empresa-1",
      hoje: HOJE,
      cargaPraticaHoras,
    });
  const bastam = await ler(8);
  assert.equal(bastam.ok && bastam.pratica.situacao, "realizada");
  const faltam = await ler(16);
  assert.equal(faltam.ok && faltam.pratica.situacao, "parcial");
  assert.equal(faltam.ok && faltam.pratica.cumpridaHoras, 8);
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
  assert.ok(tem(sessoes, ["in", "id", ["s1"]]), "só as sessões das participações (A6, N6)");
  assert.ok(tem(sessoes, ["eq", "empresa_id", "empresa-1"]));
  const parts = chamadas.find((c) => c.tabela === "treinamento_pratica_participante");
  assert.ok(tem(parts, ["in", "matricula_id", [MAT]]));
  assert.ok(tem(parts, ["eq", "empresa_id", "empresa-1"]));
  let falhou: unknown;
  await silenciar(async () => {
    falhou = await praticasDoBanco(
      bancoDeTeste({
        treinamento_sessao_pratica: { data: null, error: { message: "x" } },
        treinamento_pratica_participante: { data: [participacao()] },
      }).db,
      { cursoIds: [CURSO], matriculaIds: [MAT], empresaId: "e" }
    );
  });
  assert.deepEqual(falhou, { sessoes: [], participacoes: [] });
  // erro nas participações também devolve vazio
  let falhouParts: unknown;
  await silenciar(async () => {
    falhouParts = await praticasDoBanco(
      bancoDeTeste({
        treinamento_pratica_participante: { data: null, error: { message: "y" } },
      }).db,
      { cursoIds: [CURSO], matriculaIds: [MAT], empresaId: "e" }
    );
  });
  assert.deepEqual(falhouParts, { sessoes: [], participacoes: [] });
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
  assert.ok(t.includes("periodoDoSemipresencial("));
  assert.ok(/carga_teorica_horas/.test(t) && /carga_pratica_horas/.test(t));
  assert.ok(t.includes("textoDaModalidade(modalidadeDoCurso(curso), curso)"));
  // todas as sessões que valeram são congeladas (não só a última)
  assert.ok(/dadosDaPraticaNoCertificado\(sessoesDaPratica\)/.test(t));
  assert.ok(/localComPratica\(LOCAL_DO_CERTIFICADO, sessoesDaPratica\)/.test(t));
});

test("certificado: a prática só vale com a carga do curso, lida junto com a prática (I2)", () => {
  const t = trecho("certificado");
  const leitura = t.slice(t.indexOf("lerPratica("), t.indexOf("bloqueioDeEmissaoPorPratica("));
  assert.ok(/cargaPraticaHoras:\s*cursoDoCertificado\.carga_pratica_horas/.test(leitura));
});

test("periodoDoSemipresencial: a validade conta do fim do treinamento (o exemplo da revisão: 12 meses, teoria em 01/10/2025, prática em 05/10/2026)", () => {
  // o que a matrícula guardou quando a teoria concluiu: validade da TEORIA, já vencida na hora da prática
  const teoria = {
    inicio: "2025-09-20",
    conclusao: "2025-10-01",
    validade: "2026-10-01",
  };
  const r = periodoDoSemipresencial({
    periodo: teoria,
    sessoes: [sessao({ data: "2026-10-05" }) as never],
    validadeMeses: 12,
    modalidade: "semipresencial",
  });
  assert.deepEqual(r, {
    inicio: "2025-09-20",
    conclusao: "2026-10-05",
    // 12 meses depois do FIM do treinamento, não da teoria: o certificado não nasce vencido
    validade: "2027-10-05",
  });
  assert.ok(r.validade! > "2026-10-05", "a validade é posterior ao dia da prática");
  // o período recebido não muda
  assert.equal(teoria.validade, "2026-10-01");
});

test("periodoDoSemipresencial: vários dias contam do último; prática antes do fim da teoria conta da teoria", () => {
  const teoria = { inicio: "2026-10-01", conclusao: "2026-10-03", validade: "2027-10-03" };
  // a prática de dois dias, depois da teoria: vale o último dia
  const dois = periodoDoSemipresencial({
    periodo: teoria,
    sessoes: [
      sessao({ id: "a", data: "2026-10-05" }) as never,
      sessao({ id: "b", data: "2026-10-12" }) as never,
    ],
    validadeMeses: 24,
    modalidade: "semipresencial",
  });
  assert.equal(dois.conclusao, "2026-10-12");
  assert.equal(dois.validade, "2028-10-12");
  // a prática ANTES de a teoria terminar: o fim do treinamento é a conclusão da teoria (a validade não muda)
  const antes = periodoDoSemipresencial({
    periodo: teoria,
    sessoes: [sessao({ data: "2026-09-28" }) as never],
    validadeMeses: 12,
    modalidade: "semipresencial",
  });
  assert.equal(antes.inicio, "2026-09-28");
  assert.equal(antes.conclusao, "2026-10-03");
  assert.equal(antes.validade, "2027-10-03");
  assert.equal(antes.validade, renovacaoAPartirDe("2026-10-03", 12, "semipresencial"));
});

test("periodoDoSemipresencial: curso sem validade em meses não tem validade (nem a da teoria sobra)", () => {
  const teoria = { inicio: "2026-10-01", conclusao: "2026-10-03", validade: "2027-10-03" };
  for (const validadeMeses of [null, undefined, 0]) {
    const r = periodoDoSemipresencial({
      periodo: teoria,
      sessoes: [sessao({ data: "2026-10-05" }) as never],
      validadeMeses,
      modalidade: "semipresencial",
    });
    assert.equal(r.validade, null, String(validadeMeses));
    assert.equal(r.conclusao, "2026-10-05");
  }
});

test("certificado: a validade do semipresencial conta do fim do treinamento e a matrícula é regravada antes do INSERT (I1)", () => {
  const t = trecho("certificado");
  // período e validade vêm de periodoDoSemipresencial, com a validade em meses do curso
  const iConta = t.indexOf("periodoDoSemipresencial({");
  assert.ok(iConta > 0);
  const chamada = t.slice(iConta, iConta + 300);
  assert.ok(/periodo:\s*periodoDoCertificado\(mat\)/.test(chamada));
  assert.ok(/sessoes:\s*sessoesDaPratica/.test(chamada));
  assert.ok(/validadeMeses:\s*curso\.validade_meses/.test(chamada));
  // o período do certificado é esse (e não o da teoria); fora do semipresencial segue o de sempre
  assert.ok(/periodo:\s*periodoDoSemi \?\? periodoDoCertificado\(mat\)/.test(t));
  // a matrícula guarda a mesma: regravada pelo servidor, antes de gravar o certificado, e a falha não emite
  const iUpdate = t.indexOf("update({ proxima_renovacao: periodoDoSemi.validade })");
  const iInsert = t.indexOf(".insert({");
  assert.ok(iUpdate > 0 && iInsert > 0, "regrava a validade e grava o certificado");
  assert.ok(iUpdate < iInsert, "a validade da matrícula vem antes do INSERT do certificado");
  assert.ok(/erroValidade[\s\S]{0,300}503/.test(t.slice(iUpdate)), "falha ao regravar = 503");
  // só o semipresencial regrava (o EAD não passa por aqui) e só quando a validade mudou
  assert.ok(
    /periodoDoSemi && periodoDoSemi\.validade !== \(mat\.proxima_renovacao \?\? null\)/.test(t)
  );
  // o update da matrícula não lê nada (o teste de endurecimento só admite as leituras com colunas fixas)
  assert.ok(!/update\(\{ proxima_renovacao[\s\S]{0,200}\.select\(/.test(t.slice(iUpdate, iInsert)));
});

test("dados: o semipresencial recebe a parte prática e só emite com ela realizada", () => {
  const t = trecho("dados");
  assert.ok(t.includes("praticasDoBanco("));
  assert.ok(t.includes("praticaParaOAluno("));
  // com o certificado emitido a linha mostra a prática congelada nele (A6, M3); sem ele, a das sessões vivas
  assert.ok(
    /pratica:\s*\(cert \? praticaDoCertificado\(cert\.dados\) : null\) \?\? pratica\b/.test(t)
  );
  // curso que não é semipresencial não tem prática (null) e não depende dela
  assert.ok(/\(pratica === null \|\| pratica\.situacao === "realizada"\)/.test(t));
});

// ---------------------------------------------------------------------------------- sessões que se sobrepõem (A6, T12 N1)

/** Sessão de `carga` horas das `de` às `ate` (HH:MM), num dia: o resto do cenário da carga da prática. */
const no = (
  id: string,
  data: string,
  de: string,
  ate: string,
  carga: number,
  extra: Record<string, unknown> = {}
) =>
  sessao({
    id,
    data,
    hora_inicio: `${de}:00`,
    hora_fim: `${ate}:00`,
    carga_horas: carga,
    ...extra,
  });
const ambas = (...ids: string[]) => ids.map((sessao_id) => participacao({ sessao_id }));

test("sobreposição: a mesma sessão lançada duas vezes (mesmo dia e horário) vale uma vez só, não o dobro", () => {
  const original = no("a", "2026-10-05", "08:00", "16:00", 8);
  const duplicada = no("a2", "2026-10-05", "08:00", "16:00", 8);
  const caso = comCarga([original, duplicada], ambas("a", "a2"));
  const r = situacaoDaPratica(caso);
  // antes: 8 + 8 = 16 h e o certificado de 16 h de prática saía com 1 dia só
  assert.equal(r.cumpridaHoras, 8);
  assert.equal(r.situacao, "parcial");
  assert.equal(podeEmitirSemipresencial(caso), false);
  assert.match(bloqueioDeEmissaoPorPratica(r)!.mensagem, /Cumpridas 8 h das 16 h/);
});

test("sobreposição (A7): a mesma sessão lançada duas vezes com a carga MENOR que o horário também vale uma vez", () => {
  // 08 às 17 com 4 h, lançada duas vezes: a união dos horários dá 9 h e a soma declarada 8 h; contava 8 h (o dobro)
  const original = no("a", "2026-10-05", "08:00", "17:00", 4);
  const duplicada = no("a2", "2026-10-05", "08:00", "17:00", 4);
  const caso = comCarga([original, duplicada], ambas("a", "a2"), 8);
  const r = situacaoDaPratica(caso);
  assert.equal(r.cumpridaHoras, 4);
  assert.equal(r.situacao, "parcial");
  assert.equal(podeEmitirSemipresencial(caso), false);
  // com a carga do curso coberta, a repetida não acrescenta tempo e não vai para o certificado
  const realizada = situacaoDaPratica(comCarga([original, duplicada], ambas("a", "a2"), 4));
  assert.equal(realizada.situacao, "realizada");
  assert.deepEqual(
    realizada.sessoes.map((s) => s.id),
    ["a"]
  );
  // e a soma congelada das duas também não dobra
  assert.equal(dadosDaPraticaNoCertificado([original, duplicada] as never).carga_horas, 4);
});

test("sobreposição (A7): a mesma sessão repetida com cargas diferentes vale a maior, uma vez só", () => {
  const caso = comCarga(
    [no("a", "2026-10-05", "08:00", "17:00", 4), no("a2", "2026-10-05", "08:00", "17:00", 6)],
    ambas("a", "a2"),
    8
  );
  assert.equal(situacaoDaPratica(caso).cumpridaHoras, 6);
});

test("sobreposição (A7): horários diferentes no mesmo dia não são a mesma sessão (turnos somam, cruzadas seguem a união)", () => {
  // 08-12 e 13-17 com 3 h cada: dois turnos, 6 h
  const turnos = comCarga(
    [no("a", "2026-10-05", "08:00", "12:00", 3), no("b", "2026-10-05", "13:00", "17:00", 3)],
    ambas("a", "b"),
    8
  );
  assert.equal(situacaoDaPratica(turnos).cumpridaHoras, 6);
  // 08-17 (4 h) e 09-17 (4 h): horários diferentes, a regra de antes vale (soma 8 h, dentro das 9 h de relógio)
  const cruzadas = comCarga(
    [no("a", "2026-10-05", "08:00", "17:00", 4), no("b", "2026-10-05", "09:00", "17:00", 4)],
    ambas("a", "b"),
    8
  );
  assert.equal(situacaoDaPratica(cruzadas).cumpridaHoras, 8);
  // o mesmo horário em dias diferentes continua somando
  const dias = comCarga(
    [no("a", "2026-10-05", "08:00", "17:00", 4), no("b", "2026-10-06", "08:00", "17:00", 4)],
    ambas("a", "b"),
    8
  );
  assert.equal(situacaoDaPratica(dias).cumpridaHoras, 8);
});

test("sobreposição: sessões que se cruzam no mesmo dia valem o tempo coberto (a união dos horários)", () => {
  // 08-12 (4 h) e 10-14 (4 h): 8 h declaradas, mas só 6 h de relógio (08 às 14)
  const caso = comCarga(
    [no("a", "2026-10-05", "08:00", "12:00", 4), no("b", "2026-10-05", "10:00", "14:00", 4)],
    ambas("a", "b")
  );
  assert.equal(situacaoDaPratica(caso).cumpridaHoras, 6);
  // sessões do mesmo dia que NÃO se cruzam (manhã e tarde) somam normalmente
  const turnos = comCarga(
    [no("a", "2026-10-05", "08:00", "12:00", 4), no("b", "2026-10-05", "13:00", "17:00", 4)],
    ambas("a", "b")
  );
  assert.equal(situacaoDaPratica(turnos).cumpridaHoras, 8);
});

test("sobreposição: o limite é por dia: o mesmo horário em dias diferentes soma", () => {
  const dois = comCarga(
    [no("a", "2026-10-05", "08:00", "16:00", 8), no("b", "2026-10-06", "08:00", "16:00", 8)],
    ambas("a", "b")
  );
  const r = situacaoDaPratica(dois);
  assert.equal(r.cumpridaHoras, 16);
  assert.equal(r.situacao, "realizada");
});

test("sobreposição: a carga declarada menor que o horário continua valendo (8 h num dia de 9 h)", () => {
  const um = comCarga([no("a", "2026-10-05", "08:00", "17:00", 8)], ambas("a"));
  assert.equal(situacaoDaPratica(um).cumpridaHoras, 8);
});

test("sobreposição: sem horário válido (o banco não deixa, mas a regra não presume) vale a carga declarada", () => {
  const semHorario = comCarga(
    [
      no("a", "2026-10-05", "08:00", "16:00", 8),
      sessao({ id: "b", data: "2026-10-05", hora_inicio: null, hora_fim: null, carga_horas: 8 }),
    ],
    ambas("a", "b")
  );
  assert.equal(situacaoDaPratica(semHorario).cumpridaHoras, 16);
});

test("sobreposição: a sessão repetida não vai para o certificado, e a soma congelada é a que valeu", () => {
  const caso = comCarga(
    [
      no("a", "2026-10-05", "08:00", "16:00", 8),
      no("a2", "2026-10-05", "08:00", "16:00", 8),
      no("b", "2026-10-06", "08:00", "16:00", 8),
    ],
    ambas("a", "a2", "b")
  );
  const r = situacaoDaPratica(caso);
  assert.equal(r.situacao, "realizada");
  assert.deepEqual(
    r.sessoes.map((s) => s.id),
    ["a", "b"]
  );
  assert.equal(r.cumpridaHoras, 16);
  assert.equal(dadosDaPraticaNoCertificado(r.sessoes).carga_horas, 16);
  // e se o RH congelasse as duas repetidas, a soma declarada seria só a do tempo coberto
  const repetidas = [
    no("a", "2026-10-05", "08:00", "16:00", 8),
    no("a2", "2026-10-05", "08:00", "16:00", 8),
  ];
  assert.equal(dadosDaPraticaNoCertificado(repetidas).carga_horas, 8);
});

test("sobreposição: o espelho do front diz o mesmo (situação, sessões e horas)", () => {
  const casos = [
    comCarga(
      [no("a", "2026-10-05", "08:00", "16:00", 8), no("a2", "2026-10-05", "08:00", "16:00", 8)],
      ambas("a", "a2")
    ),
    // A7: repetida com a carga menor que o horário, e repetida com cargas diferentes
    comCarga(
      [no("a", "2026-10-05", "08:00", "17:00", 4), no("a2", "2026-10-05", "08:00", "17:00", 4)],
      ambas("a", "a2"),
      8
    ),
    comCarga(
      [no("a", "2026-10-05", "08:00", "17:00", 4), no("a2", "2026-10-05", "08:00", "17:00", 6)],
      ambas("a", "a2"),
      8
    ),
    comCarga(
      [no("a", "2026-10-05", "08:00", "12:00", 4), no("b", "2026-10-05", "10:00", "14:00", 4)],
      ambas("a", "b")
    ),
    comCarga(
      [
        no("a", "2026-10-05", "08:00", "16:00", 8),
        no("a2", "2026-10-05", "08:00", "16:00", 8),
        no("b", "2026-10-06", "08:00", "16:00", 8),
      ],
      ambas("a", "a2", "b")
    ),
    comCarga(
      [
        no("a", "2026-10-05", "08:00", "16:00", 8),
        sessao({ id: "b", data: "2026-10-05", hora_inicio: null, hora_fim: null, carga_horas: 8 }),
      ],
      ambas("a", "b")
    ),
  ];
  for (const [i, caso] of casos.entries()) {
    assert.deepEqual(situacaoNoFront(caso), situacaoDaPratica(caso), `caso ${i}`);
  }
});

// ---------------------------------------------------------------------------------- certificado emitido (A6, T12 M3)

test("praticaDoCertificado: com o certificado emitido, a parte prática mostrada é a que ficou congelada nele", () => {
  const dados = {
    pratica: dadosDaPraticaNoCertificado([
      no("b", "2026-10-06", "08:00", "16:00", 8, { local: "Galpão B" }) as never,
      no("a", "2026-10-05", "08:00", "16:00", 8) as never,
    ]),
  };
  const r = praticaDoCertificado(dados);
  assert.ok(r);
  assert.equal(r.situacao, "realizada");
  assert.equal(r.data, "2026-10-06"); // o último dia
  assert.equal(r.local, "Pátio de treinamento de teste e Galpão B");
  assert.equal(
    r.texto,
    "Parte prática: realizada em 05/10/2026 e 06/10/2026, em Pátio de treinamento de teste e Galpão B."
  );
});

test("praticaDoCertificado: certificado sem prática congelada (EAD, ou de antes da T12) devolve null", () => {
  for (const dados of [
    null,
    undefined,
    {},
    { pratica: null },
    { pratica: { sessoes: [] } },
    "x",
    7,
  ]) {
    assert.equal(praticaDoCertificado(dados), null, JSON.stringify(dados));
  }
  // linha que não é objeto no meio das sessões não derruba
  const r = praticaDoCertificado({
    pratica: { sessoes: [null, 3, { sessao_id: "a", data: "2026-10-05" }] },
  });
  assert.equal(r?.situacao, "realizada");
});

test("index.ts: dados mostra a prática do certificado quando há certificado, e a das sessões vivas quando não há (M3)", () => {
  const codigo = readFileSync(new URL("./index.ts", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.match(codigo, /praticaDoCertificado\(cert\.dados\)/);
  // a prática viva continua sendo calculada e é a que vale quando o certificado não a traz
  assert.match(codigo, /const pratica = praticaParaOAluno\(\{/);
  assert.match(
    codigo,
    /pratica:\s*\(cert \? praticaDoCertificado\(cert\.dados\) : null\) \?\? pratica\b/
  );
  // a emissão continua conferindo as sessões VIVAS (o certificado emitido não pode abrir caminho a outro)
  assert.match(codigo, /pratica === null \|\| pratica\.situacao === "realizada"/);
});
