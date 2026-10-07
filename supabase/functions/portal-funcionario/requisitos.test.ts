import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bloqueioDeEmissaoPorModalidade,
  duracaoParaProgresso,
  emiteCertificado,
  modalidadeDoCurso,
  motivoSemCertificado,
  pendenciasParaEmitir,
  pendenciasParaPublicar,
  requisitosDoCurso,
} from "./requisitos.ts";
import {
  emiteCertificado as emiteFront,
  modalidadeDoCurso as modalidadeFront,
  motivoSemCertificado as motivoFront,
  pendenciasParaEmitir as emitirFront,
  pendenciasParaPublicar as publicarFront,
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
// o que impede PUBLICAR e MATRICULAR
const pendencias = (dados: Parameters<typeof requisitosDoCurso>[0]) =>
  pendenciasParaPublicar(requisitosDoCurso(dados)).map((r) => r.codigo);
// o que impede EMITIR o certificado
const pendenciasDeEmissao = (dados: Parameters<typeof requisitosDoCurso>[0]) =>
  pendenciasParaEmitir(requisitosDoCurso(dados)).map((r) => r.codigo);
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
    // T21: o aviso do tutor segue a mesma regra de telefone nas duas cópias (números fictícios)
    { curso: { ...curso, tutor_telefone: "(11) 99999-0000" }, aulas, questoes },
    { curso: { ...curso, tutor_telefone: "11999990000" }, aulas, questoes },
    { curso: { ...curso, tutor_telefone: "5511999990000" }, aulas, questoes },
    { curso: { ...curso, tutor_telefone: "(11) 9999-000" }, aulas, questoes },
    { curso: { ...curso, tutor_telefone: "   " }, aulas, questoes },
    { curso: { ...curso, tutor_telefone: "abc", tutor_nome: "Tutor teste" }, aulas, questoes },
  ];
  for (const caso of casos) {
    assert.deepEqual(requisitosDoCurso(caso), requisitosFront(caso));
    // as duas leituras (publicar/matricular x emitir) também são iguais nas duas cópias
    assert.deepEqual(
      pendenciasParaPublicar(requisitosDoCurso(caso)),
      publicarFront(requisitosFront(caso))
    );
    assert.deepEqual(
      pendenciasParaEmitir(requisitosDoCurso(caso)),
      emitirFront(requisitosFront(caso))
    );
  }
  assert.equal(pendencias({ curso, aulas, questoes }).length, 0);
  // PUBLICAR/MATRICULAR: só o 2º caso (curso completo), o EAD marcado e o de apoio completo passam
  // (D3: apoio não trava a publicação nem a matrícula)
  // (o tutor é só aviso: os casos 12 a 17, curso completo com ou sem telefone, publicam e emitem)
  const publicaveis = [1, 6, 7, 10, 11, 12, 13, 14, 15, 16, 17];
  // EMITIR: só o curso completo EAD (o apoio nunca emite)
  const emissiveis = [1, 6, 11, 12, 13, 14, 15, 16, 17];
  for (const [i, caso] of casos.entries()) {
    assert.equal(
      pendenciasParaPublicar(requisitosDoCurso(caso)).length > 0,
      !publicaveis.includes(i),
      `publicar, caso ${i}`
    );
    assert.equal(
      pendenciasParaEmitir(requisitosDoCurso(caso)).length > 0,
      !emissiveis.includes(i),
      `emitir, caso ${i}`
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
  // quem decide é a modalidade marcada no curso: apoio não emite (D3), mesmo com o nome "NR-35"
  assert.deepEqual(
    pendenciasDeEmissao({
      curso: { ...curso, nome: "NR-35", modalidade: "apoio" },
      aulas,
      questoes,
    }),
    ["MODALIDADE"]
  );
  assert.deepEqual(
    pendenciasDeEmissao({ curso: { ...curso, nome: "NR-35", modalidade: "ead" }, aulas, questoes }),
    []
  );
});
test("D3: apoio não trava publicar nem matricular, só emitir; semipresencial e desconhecida travam tudo", () => {
  const mod = (modalidade?: string) =>
    requisitosDoCurso({ curso: { ...curso, modalidade }, aulas, questoes }).find(
      (r) => r.codigo === "MODALIDADE"
    )!;
  assert.equal(mod("ead").ok, true);
  assert.equal(mod(undefined).ok, true);
  for (const m of ["apoio", "semipresencial", "inventada"]) {
    assert.equal(mod(m).ok, false, m); // nenhum dos três emite certificado
    assert.equal(mod(m).bloqueiaEmissao, true, m);
  }
  // publicar e matricular: o apoio passa (material de estudo); os outros dois continuam travados
  assert.equal(mod("apoio").bloqueia, false);
  assert.equal(mod("semipresencial").bloqueia, true);
  assert.equal(mod("inventada").bloqueia, true);
  const dados = (modalidade: string) => ({ curso: { ...curso, modalidade }, aulas, questoes });
  assert.deepEqual(pendencias(dados("apoio")), []);
  assert.deepEqual(pendenciasDeEmissao(dados("apoio")), ["MODALIDADE"]);
  assert.deepEqual(pendencias(dados("semipresencial")), ["MODALIDADE"]);
  assert.deepEqual(pendenciasDeEmissao(dados("semipresencial")), ["MODALIDADE"]);
  // os outros requisitos do curso continuam valendo para o apoio (a D3 só separa a modalidade)
  assert.deepEqual(
    pendencias({ curso: { ...curso, modalidade: "apoio", instrutor_nome: "" }, aulas, questoes }),
    ["INSTRUTOR"]
  );
  // só os requisitos "bloqueia" travam a emissão; os de revisão (TUTOR, PROJETO...) nunca travam
  for (const r of requisitosDoCurso({ curso, aulas, questoes })) {
    assert.equal(typeof r.bloqueiaEmissao, "boolean");
    assert.equal(r.bloqueiaEmissao, r.bloqueia, r.codigo);
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

test("requisito TUTOR (T21, D4): só avisa, e só some com um WhatsApp que o servidor aceita", () => {
  const tutor = (valores: Record<string, unknown>) =>
    requisitosDoCurso({ curso: { ...curso, ...valores }, aulas, questoes }).find(
      (r) => r.codigo === "TUTOR"
    )!;
  for (const tutor_telefone of [undefined, null, "", "   ", "abc", "99999", "(11) 9999-000"]) {
    assert.equal(tutor({ tutor_telefone }).ok, false, String(tutor_telefone));
  }
  for (const tutor_telefone of [
    "(11) 99999-0000",
    "11999990000",
    "5511999990000",
    "(11) 3333-0000",
  ]) {
    assert.equal(tutor({ tutor_telefone }).ok, true, tutor_telefone);
  }
  // nome e atendimento são opcionais e não tiram o aviso
  assert.equal(tutor({ tutor_nome: "Tutor teste", tutor_atendimento: "dias úteis" }).ok, false);
  assert.match(tutor({}).texto, /WhatsApp do tutor/);
  // é só aviso: nunca trava publicar, matricular nem emitir
  assert.equal(tutor({}).bloqueia, false);
  assert.equal(tutor({}).bloqueiaEmissao, false);
  assert.deepEqual(pendencias({ curso, aulas, questoes }), []);
  assert.deepEqual(pendenciasDeEmissao({ curso, aulas, questoes }), []);
});
