import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bloqueioDeEmissaoPorModalidade,
  duracaoParaProgresso,
  emiteCertificado,
  modalidadeDoCurso,
  motivoSemCertificado,
  requisitosDoCurso,
} from "./requisitos.ts";
import {
  emiteCertificado as emiteFront,
  modalidadeDoCurso as modalidadeFront,
  motivoSemCertificado as motivoFront,
  requisitosDoCurso as requisitosFront,
} from "../../../apps/web/src/lib/ead-requisitos.js";
const curso = {
  nome: "Curso teste",
  carga_horaria_horas: 1,
  instrutor_nome: "Instrutor teste",
  responsavel_tecnico_nome: "RT teste",
};
const aulas = [{ tipo: "texto", conteudo_texto: "Texto teste", duracao_seg: 3600 }];
const questoes = Array.from({ length: 5 }, () => ({}));
const pendencias = (dados: Parameters<typeof requisitosDoCurso>[0]) =>
  requisitosDoCurso(dados)
    .filter((r) => r.bloqueia && !r.ok)
    .map((r) => r.codigo);
test("vídeo sem duração de cadastro nunca recebe duração do aluno", () => {
  for (const valor of [null, 0, -1, Infinity, "inválido"])
    assert.equal(duracaoParaProgresso({ tipo: "video", duracao_seg: valor }), null);
  assert.equal(duracaoParaProgresso({ tipo: "video", duracao_seg: 90 }), 90);
  assert.equal(duracaoParaProgresso({ tipo: "pdf" }), 60);
});
test("front e servidor usam os mesmos requisitos, inclusive bordas", () => {
  const casos = [
    {},
    { curso, aulas, questoes },
    {
      curso: { ...curso, carga_horaria_horas: 40 },
      aulas: [{ ...aulas[0], duracao_seg: 7200 }],
      questoes,
    },
    { curso, aulas: [{ ...aulas[0], duracao_seg: 0 }], questoes },
    { curso, aulas, questoes: questoes.slice(1) },
    { curso: { ...curso, instrutor_nome: "" }, aulas, questoes },
    { curso: { ...curso, modalidade: "ead" }, aulas, questoes },
    { curso: { ...curso, modalidade: "apoio" }, aulas, questoes },
    { curso: { ...curso, modalidade: "semipresencial" }, aulas, questoes },
    { curso: { ...curso, modalidade: "outra" }, aulas, questoes },
    { curso: { ...curso, nome: "NR-35 — apoio", modalidade: "apoio" }, aulas, questoes },
    { curso: { ...curso, nome: "NR-35", modalidade: "ead" }, aulas, questoes },
  ];
  for (const caso of casos) assert.deepEqual(requisitosDoCurso(caso), requisitosFront(caso));
  assert.equal(
    requisitosDoCurso({ curso, aulas, questoes }).filter((r) => r.bloqueia && !r.ok).length,
    0
  );
  // só o 2º caso (curso completo) e os que são EAD de fato passam sem pendência
  const completos = [1, 6, 11];
  for (const [i, caso] of casos.entries()) {
    assert.equal(
      requisitosDoCurso(caso).some((r) => r.bloqueia && !r.ok),
      !completos.includes(i),
      `caso ${i}`
    );
  }
});
test("modalidade do curso: a coluna decide; sem coluna (curso lido antes da migração) vale EAD", () => {
  assert.equal(modalidadeDoCurso({}), "ead");
  assert.equal(modalidadeDoCurso({ modalidade: null }), "ead");
  assert.equal(modalidadeDoCurso({ modalidade: "" }), "ead");
  assert.equal(modalidadeDoCurso(null), "ead");
  assert.equal(modalidadeDoCurso({ modalidade: "ead" }), "ead");
  assert.equal(modalidadeDoCurso({ modalidade: "semipresencial" }), "semipresencial");
  assert.equal(modalidadeDoCurso({ modalidade: "apoio" }), "apoio");
});
test("o nome ou o código do curso NÃO decidem a modalidade (o filtro por 'NR-35' saiu na T8)", () => {
  for (const nome of ["NR-35", "NR35 Trabalho em Altura", "NR 35 Reciclagem (8h)"]) {
    for (const codigo of [undefined, "NR-35"]) {
      assert.deepEqual(pendencias({ curso: { ...curso, nome, codigo }, aulas, questoes }), []);
    }
  }
  // quem decide é a modalidade marcada no curso
  assert.deepEqual(
    pendencias({ curso: { ...curso, nome: "NR-35", modalidade: "apoio" }, aulas, questoes }),
    ["MODALIDADE"]
  );
});
test("apoio, semipresencial e modalidade desconhecida bloqueiam; EAD libera", () => {
  const mod = (modalidade?: string) =>
    requisitosDoCurso({ curso: { ...curso, modalidade }, aulas, questoes }).find(
      (r) => r.codigo === "MODALIDADE"
    )!;
  assert.equal(mod("ead").ok, true);
  assert.equal(mod(undefined).ok, true);
  for (const m of ["apoio", "semipresencial", "inventada"]) {
    assert.equal(mod(m).ok, false, m);
    assert.equal(mod(m).bloqueia, true, m);
  }
  // o texto diz o motivo certo de cada modalidade
  assert.match(mod("apoio").texto, /apoio/i);
  assert.match(mod("apoio").texto, /não emite certificado/i);
  assert.match(mod("semipresencial").texto, /semipresencial/i);
  assert.match(mod("semipresencial").texto, /prática presencial/i);
});
test("motivoSemCertificado e emiteCertificado: servidor e front dizem o mesmo", () => {
  for (const m of ["ead", "apoio", "semipresencial", "inventada", undefined, null, ""]) {
    assert.equal(emiteCertificado(m as string), emiteFront(m), String(m));
    assert.equal(motivoSemCertificado(m as string), motivoFront(m), String(m));
  }
  for (const c of [{}, { modalidade: "apoio" }, { modalidade: "semipresencial" }, null]) {
    assert.equal(modalidadeDoCurso(c), modalidadeFront(c));
  }
  assert.equal(emiteCertificado("ead"), true);
  assert.equal(emiteCertificado("apoio"), false);
  assert.equal(emiteCertificado("semipresencial"), false);
});
test("emissão pela modalidade: apoio e semipresencial têm código próprio (409), EAD passa", () => {
  assert.equal(bloqueioDeEmissaoPorModalidade("ead"), null);
  const apoio = bloqueioDeEmissaoPorModalidade("apoio");
  assert.equal(apoio?.codigo, "CURSO_DE_APOIO");
  assert.equal(apoio?.mensagem, motivoSemCertificado("apoio"));
  const semi = bloqueioDeEmissaoPorModalidade("semipresencial");
  assert.equal(semi?.codigo, "PRATICA_PENDENTE");
  assert.equal(semi?.mensagem, motivoSemCertificado("semipresencial"));
  // valor que o banco não aceita (CHECK da 0136): não emite, e o código diz o porquê
  assert.equal(bloqueioDeEmissaoPorModalidade("inventada")?.codigo, "MODALIDADE_INVALIDA");
});
