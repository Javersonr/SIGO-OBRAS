import { test } from "node:test";
import assert from "node:assert/strict";
import { requisitosDoCurso, duracaoParaProgresso } from "./requisitos.ts";
import { requisitosDoCurso as requisitosFront } from "../../../apps/web/src/lib/ead-requisitos.js";
const curso = {
  nome: "Curso teste",
  carga_horaria_horas: 1,
  instrutor_nome: "Instrutor teste",
  responsavel_tecnico_nome: "RT teste",
};
const aulas = [{ tipo: "texto", conteudo_texto: "Texto teste", duracao_seg: 3600 }];
const questoes = Array.from({ length: 5 }, () => ({}));
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
    { curso: { ...curso, modalidade: "apoio" }, aulas, questoes },
    { curso: { ...curso, nome: "NR-35 — apoio" }, aulas, questoes },
  ];
  for (const caso of casos) assert.deepEqual(requisitosDoCurso(caso), requisitosFront(caso));
  assert.equal(
    requisitosDoCurso({ curso, aulas, questoes }).filter((r) => r.bloqueia && !r.ok).length,
    0
  );
  for (const caso of casos.filter((_, i) => i !== 1))
    assert.ok(requisitosDoCurso(caso).some((r) => r.bloqueia && !r.ok));
});
