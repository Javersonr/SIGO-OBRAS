import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_DETALHE,
  PCT_CONCLUSAO,
  TOLERANCIA_SEG,
  aulaLiberada,
  conclusaoDaAula,
  comRastroDeFalha,
  corrigirProva,
  creditarTempo,
  cursoPublicado,
  datasDeConclusao,
  detalheLimitado,
  logoAssinadoParaPdf,
  proximaTentativaEm,
  situacaoDasTentativas,
  situacaoDaTrilha,
} from "./regras.ts";
import { assinarDaEmpresa } from "../_shared/storage-assinar.ts";

// Dados sintéticos: nenhum identificador ou nome real.
const trilhaDe = (ids: string[], feitas: string[]) => ({
  aulas: ids.map((id) => ({ id })),
  feitas: new Set<unknown>(feitas),
});

// ------------------------------------------------------------ aulaLiberada
test("aulaLiberada: a primeira aula é sempre liberada", () => {
  assert.equal(aulaLiberada(trilhaDe(["a1", "a2", "a3"], []), "a1"), true);
});

test("aulaLiberada: cada aula só libera depois da anterior concluída", () => {
  const trilha = trilhaDe(["a1", "a2", "a3"], ["a1"]);
  assert.equal(aulaLiberada(trilha, "a2"), true);
  assert.equal(aulaLiberada(trilha, "a3"), false);
});

test("aulaLiberada: concluir uma aula adiante não pula a anterior pendente", () => {
  const trilha = trilhaDe(["a1", "a2", "a3"], ["a1", "a3"]);
  assert.equal(aulaLiberada(trilha, "a2"), true);
  assert.equal(aulaLiberada(trilha, "a3"), false);
});

test("aulaLiberada: aula fora da trilha e trilha vazia nunca liberam", () => {
  assert.equal(aulaLiberada(trilhaDe(["a1"], ["a1"]), "outra"), false);
  assert.equal(aulaLiberada(trilhaDe([], []), "a1"), false);
});

// --------------------------------------------------------- situacaoDaTrilha
test("situacaoDaTrilha: trilha vazia nunca conclui, nem sem avaliação", () => {
  const s = situacaoDaTrilha({ ...trilhaDe([], []), temAvaliacao: false, aprovacao: null });
  assert.equal(s.aulasOk, false);
  assert.equal(s.concluido, false);
});

test("situacaoDaTrilha: todas as aulas e curso sem avaliação concluem", () => {
  const s = situacaoDaTrilha({
    ...trilhaDe(["a1", "a2"], ["a1", "a2"]),
    temAvaliacao: false,
    aprovacao: null,
  });
  assert.deepEqual(s, { aulasOk: true, temAvaliacao: false, aprovacao: null, concluido: true });
});

test("situacaoDaTrilha: com avaliação, só a tentativa aprovada conclui", () => {
  const base = { ...trilhaDe(["a1"], ["a1"]), temAvaliacao: true };
  const sem = situacaoDaTrilha({ ...base, aprovacao: null });
  assert.equal(sem.aulasOk, true);
  assert.equal(sem.concluido, false);
  const aprovacao = { numero: 2, nota: 80 };
  const com = situacaoDaTrilha({ ...base, aprovacao });
  assert.equal(com.concluido, true);
  assert.deepEqual(com.aprovacao, aprovacao);
});

test("situacaoDaTrilha: aula pendente não conclui, mesmo aprovado", () => {
  const s = situacaoDaTrilha({
    ...trilhaDe(["a1", "a2"], ["a1"]),
    temAvaliacao: true,
    aprovacao: { numero: 1, nota: 100 },
  });
  assert.equal(s.aulasOk, false);
  assert.equal(s.concluido, false);
});

test("situacaoDaTrilha: progresso de aula que não é da trilha não conta", () => {
  const s = situacaoDaTrilha({
    ...trilhaDe(["a1", "a2"], ["a1", "a-removida"]),
    temAvaliacao: false,
    aprovacao: null,
  });
  assert.equal(s.aulasOk, false);
});

// ------------------------------------------------------------ creditarTempo
const T0 = Date.parse("2026-10-05T12:00:00.000Z");
const sinalHa = (seg: number) => new Date(T0 - seg * 1000).toISOString();

test("creditarTempo: aceita o que o relógio do servidor comporta", () => {
  const c = creditarTempo({
    jaTinha: 0,
    informado: 20,
    ultimoSinalEm: sinalHa(30),
    agora: T0,
    duracao: 600,
  });
  assert.equal(c.decorrido, 30);
  assert.equal(c.pedido, 20);
  assert.equal(c.aceito, 20);
  assert.equal(c.novoSeg, 20);
  assert.equal(c.ajustado, false);
});

test("creditarTempo: pedido maior que o decorrido é cortado e marcado como ajustado", () => {
  const c = creditarTempo({
    jaTinha: 0,
    informado: 600,
    ultimoSinalEm: sinalHa(10),
    agora: T0,
    duracao: 3600,
  });
  assert.equal(c.pedido, 600);
  assert.equal(c.aceito, 10 + TOLERANCIA_SEG);
  assert.equal(c.novoSeg, 12);
  assert.equal(c.ajustado, true);
});

test("creditarTempo: o ajuste só é marcado acima da tolerância", () => {
  const base = { jaTinha: 0, ultimoSinalEm: sinalHa(10), agora: T0, duracao: 3600 };
  // teto aceito = 12; pedido 14 = teto + tolerância (não marca), 15 marca
  assert.equal(creditarTempo({ ...base, informado: 14 }).ajustado, false);
  assert.equal(creditarTempo({ ...base, informado: 15 }).ajustado, true);
  assert.equal(creditarTempo({ ...base, informado: 14 }).aceito, 12);
});

test("creditarTempo: pedido pouco acima do decorrido, dentro da folga de rede, passa inteiro", () => {
  const c = creditarTempo({
    jaTinha: 0,
    informado: 11,
    ultimoSinalEm: sinalHa(10),
    agora: T0,
    duracao: 600,
  });
  assert.equal(c.aceito, 11);
  assert.equal(c.ajustado, false);
});

test("creditarTempo: o total informado é descontado do que o aluno já tinha", () => {
  const c = creditarTempo({
    jaTinha: 100,
    informado: 130,
    ultimoSinalEm: sinalHa(60),
    agora: T0,
    duracao: 600,
  });
  assert.equal(c.pedido, 30);
  assert.equal(c.novoSeg, 130);
});

test("creditarTempo: total menor que o já gravado (vídeo voltou) não tira nem põe tempo", () => {
  const c = creditarTempo({
    jaTinha: 100,
    informado: 40,
    ultimoSinalEm: sinalHa(60),
    agora: T0,
    duracao: 600,
  });
  assert.equal(c.pedido, 0);
  assert.equal(c.aceito, 0);
  assert.equal(c.novoSeg, 100);
});

test("creditarTempo: o tempo nunca passa da duração cadastrada", () => {
  const c = creditarTempo({
    jaTinha: 50,
    informado: 100,
    ultimoSinalEm: sinalHa(100),
    agora: T0,
    duracao: 60,
  });
  assert.equal(c.aceito, 50);
  assert.equal(c.novoSeg, 60);
});

test("creditarTempo: aula sem duração (null) não tem teto", () => {
  const c = creditarTempo({
    jaTinha: 0,
    informado: 5000,
    ultimoSinalEm: sinalHa(9000),
    agora: T0,
    duracao: null,
  });
  assert.equal(c.novoSeg, 5000);
});

test("creditarTempo: sem sinal anterior só a folga de rede é aceita", () => {
  for (const ultimoSinalEm of [null, undefined]) {
    const c = creditarTempo({ jaTinha: 0, informado: 500, ultimoSinalEm, agora: T0, duracao: 600 });
    assert.equal(c.decorrido, 0);
    assert.equal(c.aceito, TOLERANCIA_SEG);
    assert.equal(c.novoSeg, TOLERANCIA_SEG);
    assert.equal(c.ajustado, true);
  }
});

test("creditarTempo: sinal no futuro (relógio adiantado) conta como zero decorrido", () => {
  const c = creditarTempo({
    jaTinha: 0,
    informado: 500,
    ultimoSinalEm: sinalHa(-300),
    agora: T0,
    duracao: 600,
  });
  assert.equal(c.decorrido, 0);
  assert.equal(c.aceito, TOLERANCIA_SEG);
});

test("creditarTempo: o decorrido tem fração e a folga entra arredondada para baixo", () => {
  const c = creditarTempo({
    jaTinha: 0,
    informado: 100,
    ultimoSinalEm: new Date(T0 - 10_900).toISOString(),
    agora: T0,
    duracao: 600,
  });
  assert.equal(c.decorrido, 10.9);
  assert.equal(c.aceito, 12); // floor(10,9 + 2)
});

test("creditarTempo: total informado inválido vale zero e fração é arredondada para baixo", () => {
  const base = { jaTinha: 0, ultimoSinalEm: sinalHa(60), agora: T0, duracao: 600 };
  for (const informado of [undefined, null, "abc", NaN, -5, {}, ""])
    assert.equal(creditarTempo({ ...base, informado }).pedido, 0, String(informado));
  assert.equal(creditarTempo({ ...base, informado: 10.9 }).pedido, 10);
  assert.equal(creditarTempo({ ...base, informado: "40" }).pedido, 40);
});

// ---------------------------------------------------------- conclusaoDaAula
test("conclusaoDaAula: vídeo conclui sozinho aos 90% (arredondado para cima)", () => {
  assert.equal(PCT_CONCLUSAO, 0.9);
  const v = (segundos: number, duracao = 100) =>
    conclusaoDaAula({ tipo: "video", duracao, segundos });
  assert.equal(v(89).atingiuTempo, false);
  assert.equal(v(89).concluiu, false);
  assert.equal(v(90).minimoSeg, 90);
  assert.equal(v(90).atingiuTempo, true);
  assert.equal(v(90).concluiu, true);
  assert.equal(v(100).concluiu, true);
  // 90% de 101 s = 90,9: exige 91 s
  assert.equal(v(90, 101).concluiu, false);
  assert.equal(v(91, 101).concluiu, true);
});

test("conclusaoDaAula: aula sem tipo é tratada como vídeo", () => {
  for (const tipo of [undefined, null, ""]) {
    const c = conclusaoDaAula({ tipo, duracao: 100, segundos: 90 });
    assert.equal(c.ehVideo, true);
    assert.equal(c.concluiu, true);
  }
});

test("conclusaoDaAula: vídeo ignora o pedido de concluir e nunca vira 'pode concluir'", () => {
  const cedo = conclusaoDaAula({ tipo: "video", duracao: 100, segundos: 10, pediuConcluir: true });
  assert.equal(cedo.concluirCedo, false);
  assert.equal(cedo.concluiu, false);
  const pronto = conclusaoDaAula({ tipo: "video", duracao: 100, segundos: 95 });
  assert.equal(pronto.podeConcluir, false);
});

test("conclusaoDaAula: apostila exige o tempo completo, não 90%", () => {
  for (const tipo of ["pdf", "texto"]) {
    const quase = conclusaoDaAula({ tipo, duracao: 120, segundos: 119, pediuConcluir: true });
    assert.equal(quase.minimoSeg, 120);
    assert.equal(quase.atingiuTempo, false);
    assert.equal(quase.concluiu, false);
    assert.equal(quase.faltamSeg, 1);
    assert.equal(quase.concluirCedo, true);
  }
});

test("conclusaoDaAula: apostila com o tempo completo mas sem clique fica aguardando o clique", () => {
  const c = conclusaoDaAula({ tipo: "pdf", duracao: 120, segundos: 120 });
  assert.equal(c.atingiuTempo, true);
  assert.equal(c.concluiu, false);
  assert.equal(c.podeConcluir, true);
  assert.equal(c.concluirCedo, false);
});

test("conclusaoDaAula: apostila com o tempo completo e o clique conclui", () => {
  const c = conclusaoDaAula({ tipo: "texto", duracao: 120, segundos: 130, pediuConcluir: true });
  assert.equal(c.concluiu, true);
  assert.equal(c.podeConcluir, false);
  assert.equal(c.concluirCedo, false);
  assert.equal(c.faltamSeg, -10);
});

test("conclusaoDaAula: só o clique literal (true) vale", () => {
  for (const pediuConcluir of ["true", 1, "sim", null, undefined, false]) {
    const c = conclusaoDaAula({ tipo: "pdf", duracao: 60, segundos: 60, pediuConcluir });
    assert.equal(c.concluiu, false, String(pediuConcluir));
    assert.equal(c.podeConcluir, true, String(pediuConcluir));
  }
});

test("conclusaoDaAula: a aula já concluída continua concluída", () => {
  for (const tipo of ["video", "pdf"]) {
    const c = conclusaoDaAula({ tipo, duracao: 100, segundos: 0, jaConcluida: true });
    assert.equal(c.concluiu, true);
    assert.equal(c.podeConcluir, false);
  }
  // null/undefined (sem linha de progresso) não contam como concluída
  assert.equal(
    conclusaoDaAula({ tipo: "video", duracao: 100, segundos: 0, jaConcluida: null }).concluiu,
    false
  );
});

test("conclusaoDaAula: aula sem duração (0) nunca atinge o tempo", () => {
  for (const tipo of ["video", "pdf"]) {
    const c = conclusaoDaAula({ tipo, duracao: 0, segundos: 0, pediuConcluir: true });
    assert.equal(c.atingiuTempo, false, tipo);
    assert.equal(c.concluiu, false, tipo);
  }
});

// ------------------------------------------------------------- corrigirProva
const prova = (corretas: number[]) => corretas.map((correta, i) => ({ id: `q${i + 1}`, correta }));
const resp = (...marcadas: (number | null | string)[]) =>
  marcadas.map((resposta, i) => ({ questao_id: `q${i + 1}`, resposta }));

test("corrigirProva: todas certas dá 100 e aprova", () => {
  const r = corrigirProva({ questoes: prova([0, 1, 2]), respostas: resp(0, 1, 2), notaMinima: 70 });
  assert.equal(r.acertos, 3);
  assert.equal(r.total, 3);
  assert.equal(r.nota, 100);
  assert.equal(r.aprovada, true);
});

test("corrigirProva: nenhuma certa dá 0 e reprova", () => {
  const r = corrigirProva({ questoes: prova([0, 1, 2]), respostas: resp(1, 0, 0), notaMinima: 70 });
  assert.equal(r.acertos, 0);
  assert.equal(r.nota, 0);
  assert.equal(r.aprovada, false);
});

test("corrigirProva: a nota é arredondada ao inteiro mais próximo", () => {
  const nota = (certas: number, total: number) => {
    const q = prova(Array.from({ length: total }, () => 0));
    const r = Array.from({ length: total }, (_, i) => ({
      questao_id: `q${i + 1}`,
      resposta: i < certas ? 0 : 1,
    }));
    return corrigirProva({ questoes: q, respostas: r, notaMinima: 70 }).nota;
  };
  assert.equal(nota(2, 3), 67); // 66,67
  assert.equal(nota(1, 3), 33); // 33,33
  assert.equal(nota(5, 8), 63); // 62,5 sobe
  assert.equal(nota(1, 8), 13); // 12,5 sobe
  assert.equal(nota(3, 8), 38); // 37,5 sobe
});

test("corrigirProva: a nota mínima exata aprova, um ponto abaixo reprova", () => {
  const q = prova(Array.from({ length: 10 }, () => 0));
  const certas = (n: number) =>
    Array.from({ length: 10 }, (_, i) => ({ questao_id: `q${i + 1}`, resposta: i < n ? 0 : 1 }));
  assert.equal(corrigirProva({ questoes: q, respostas: certas(7), notaMinima: 70 }).aprovada, true);
  assert.equal(
    corrigirProva({ questoes: q, respostas: certas(6), notaMinima: 70 }).aprovada,
    false
  );
});

test("corrigirProva: a aprovação usa a nota já arredondada (comportamento atual)", () => {
  // 5 de 8 = 62,5% -> nota 63: com mínimo 63 o aluno é aprovado
  const q = prova(Array.from({ length: 8 }, () => 0));
  const r = Array.from({ length: 8 }, (_, i) => ({
    questao_id: `q${i + 1}`,
    resposta: i < 5 ? 0 : 1,
  }));
  const res = corrigirProva({ questoes: q, respostas: r, notaMinima: 63 });
  assert.equal(res.nota, 63);
  assert.equal(res.aprovada, true);
});

test("corrigirProva: sem nota mínima o padrão é 70; zero é respeitado", () => {
  const q = prova([0, 0]);
  const meio = resp(0, 1); // 50
  for (const notaMinima of [null, undefined])
    assert.equal(corrigirProva({ questoes: q, respostas: meio, notaMinima }).minima, 70);
  assert.equal(corrigirProva({ questoes: q, respostas: meio }).aprovada, false);
  const zero = corrigirProva({ questoes: q, respostas: resp(1, 1), notaMinima: 0 });
  assert.equal(zero.minima, 0);
  assert.equal(zero.aprovada, true);
});

test("corrigirProva: questão sem resposta erra e resposta de questão inexistente é ignorada", () => {
  const r = corrigirProva({
    questoes: prova([0, 1]),
    respostas: [
      { questao_id: "q1", resposta: 0 },
      { questao_id: "q-estranha", resposta: 0 },
    ],
    notaMinima: 70,
  });
  assert.equal(r.acertos, 1);
  assert.equal(r.total, 2);
  assert.equal(r.nota, 50);
  assert.equal(r.acertou({ id: "q2", correta: 1 }), false);
  assert.equal(r.marcada.has("q2"), false);
});

test("corrigirProva: resposta numérica em texto vale; texto não numérico erra; a última repetida vale", () => {
  const r = corrigirProva({
    questoes: prova([2, 1, 0]),
    respostas: [
      { questao_id: "q1", resposta: "2" },
      { questao_id: "q2", resposta: "x" },
      { questao_id: "q3", resposta: 1 },
      { questao_id: "q3", resposta: 0 },
    ],
    notaMinima: 70,
  });
  assert.equal(r.acertos, 2); // q1 e q3
  assert.equal(r.marcada.get("q1"), 2);
  assert.ok(Number.isNaN(r.marcada.get("q2")));
  assert.equal(r.marcada.get("q3"), 0);
});

test("corrigirProva: resposta null vira 0 (comportamento atual, anotado fora do escopo da T3)", () => {
  // Number(null) === 0: a questão em branco que tem a alternativa 0 como correta acerta.
  // O portal nunca envia null (bloqueia envio com questão em branco); só chamada direta à API.
  const r = corrigirProva({ questoes: prova([0]), respostas: resp(null), notaMinima: 70 });
  assert.equal(r.marcada.get("q1"), 0);
  assert.equal(r.acertos, 1);
});

test("corrigirProva: acertou() confere questão a questão com o mesmo gabarito", () => {
  const r = corrigirProva({ questoes: prova([1, 2]), respostas: resp(1, 0), notaMinima: 70 });
  assert.equal(r.acertou({ id: "q1", correta: 1 }), true);
  assert.equal(r.acertou({ id: "q2", correta: 2 }), false);
});

// -------------------------------------------------- situacaoDasTentativas
const HORA = Date.parse("2026-10-05T10:00:00.000Z");
const minDepois = (min: number) => HORA + min * 60_000;
const tentativa = (aprovada: boolean) => ({ aprovada, created_at: new Date(HORA).toISOString() });

test("situacaoDasTentativas: sem limite no curso, nunca esgota", () => {
  for (const max_tentativas of [null, undefined, 0, -1]) {
    const s = situacaoDasTentativas({
      usadas: 99,
      curso: { max_tentativas },
      matricula: { tentativas_extras: 5 },
      agora: HORA,
    });
    assert.equal(s.max, null);
    assert.equal(s.esgotada, false);
  }
  assert.equal(
    situacaoDasTentativas({ usadas: 99, curso: null, matricula: {}, agora: HORA }).max,
    null
  );
});

test("situacaoDasTentativas: a última tentativa dentro do limite ainda é permitida", () => {
  const curso = { max_tentativas: 3 };
  const com = (usadas: number) =>
    situacaoDasTentativas({ usadas, curso, matricula: {}, agora: HORA });
  assert.equal(com(0).max, 3);
  assert.equal(com(2).esgotada, false);
  assert.equal(com(3).esgotada, true);
  assert.equal(com(4).esgotada, true);
});

test("situacaoDasTentativas: tentativas extras da matrícula somam ao limite do curso", () => {
  const curso = { max_tentativas: 3 };
  const matricula = { tentativas_extras: 2 };
  const com = (usadas: number) => situacaoDasTentativas({ usadas, curso, matricula, agora: HORA });
  assert.equal(com(0).max, 5);
  assert.equal(com(4).esgotada, false);
  assert.equal(com(5).esgotada, true);
  for (const tentativas_extras of [null, undefined, 0])
    assert.equal(
      situacaoDasTentativas({ usadas: 0, curso, matricula: { tentativas_extras }, agora: HORA })
        .max,
      3
    );
});

test("situacaoDasTentativas: reprovado espera o intervalo desde a última tentativa", () => {
  const base = { usadas: 1, curso: { intervalo_tentativa_min: 30 }, matricula: {} };
  const s = situacaoDasTentativas({ ...base, ultima: tentativa(false), agora: minDepois(10) });
  assert.equal(s.aguardarAte, minDepois(30));
});

test("situacaoDasTentativas: no instante exato do intervalo, ou depois, já libera", () => {
  const base = { usadas: 1, curso: { intervalo_tentativa_min: 30 }, matricula: {} };
  const ultima = tentativa(false);
  assert.equal(situacaoDasTentativas({ ...base, ultima, agora: minDepois(30) }).aguardarAte, null);
  assert.equal(situacaoDasTentativas({ ...base, ultima, agora: minDepois(31) }).aguardarAte, null);
  assert.equal(
    situacaoDasTentativas({ ...base, ultima, agora: minDepois(30) - 1 }).aguardarAte,
    minDepois(30)
  );
});

test("situacaoDasTentativas: sem espera quando aprovado, sem intervalo ou sem tentativa anterior", () => {
  const agora = minDepois(1);
  const curso = { intervalo_tentativa_min: 30 };
  assert.equal(
    situacaoDasTentativas({ usadas: 1, curso, matricula: {}, ultima: tentativa(true), agora })
      .aguardarAte,
    null
  );
  assert.equal(
    situacaoDasTentativas({ usadas: 0, curso, matricula: {}, ultima: undefined, agora })
      .aguardarAte,
    null
  );
  assert.equal(
    situacaoDasTentativas({ usadas: 0, curso, matricula: {}, ultima: null, agora }).aguardarAte,
    null
  );
  for (const intervalo_tentativa_min of [0, null, undefined, -5])
    assert.equal(
      situacaoDasTentativas({
        usadas: 1,
        curso: { intervalo_tentativa_min },
        matricula: {},
        ultima: tentativa(false),
        agora,
      }).aguardarAte,
      null
    );
});

test("situacaoDasTentativas: limite esgotado e intervalo correndo são avaliados juntos", () => {
  const s = situacaoDasTentativas({
    usadas: 3,
    curso: { max_tentativas: 3, intervalo_tentativa_min: 30 },
    matricula: {},
    ultima: tentativa(false),
    agora: minDepois(5),
  });
  assert.equal(s.esgotada, true);
  assert.equal(s.aguardarAte, minDepois(30));
});

// --------------------------------------------------------- proximaTentativaEm
test("proximaTentativaEm: reprovado com intervalo ganha a hora da próxima tentativa", () => {
  assert.equal(proximaTentativaEm(false, 30, HORA), minDepois(30));
});

test("proximaTentativaEm: aprovado ou sem intervalo não tem próxima tentativa agendada", () => {
  assert.equal(proximaTentativaEm(true, 30, HORA), null);
  for (const intervalo of [0, null, undefined, -1])
    assert.equal(proximaTentativaEm(false, intervalo, HORA), null);
});

// ----------------------------------------------------------- datasDeConclusao
test("datasDeConclusao: sem validade só grava a data de conclusão", () => {
  const hoje = new Date("2026-10-05T15:00:00.000Z");
  for (const validade of [null, undefined, 0])
    assert.deepEqual(datasDeConclusao(hoje, validade), { data_conclusao: "2026-10-05" });
});

test("datasDeConclusao: a renovação vem a N meses da conclusão", () => {
  const hoje = new Date("2026-10-05T15:00:00.000Z");
  assert.deepEqual(datasDeConclusao(hoje, 12), {
    data_conclusao: "2026-10-05",
    proxima_renovacao: "2027-10-05",
  });
  assert.equal(datasDeConclusao(hoje, 24).proxima_renovacao, "2028-10-05");
  assert.equal(datasDeConclusao(hoje, 3).proxima_renovacao, "2027-01-05"); // vira o ano
});

test("datasDeConclusao: não altera a data recebida", () => {
  const hoje = new Date("2026-10-05T15:00:00.000Z");
  datasDeConclusao(hoje, 12);
  assert.equal(hoje.toISOString(), "2026-10-05T15:00:00.000Z");
});

test("datasDeConclusao: usa o dia em UTC (comportamento atual; a T8 passa para Brasília)", () => {
  // 23h30 de 05/10 em Brasília já é 06/10 em UTC
  const hoje = new Date("2026-10-06T02:30:00.000Z");
  assert.equal(datasDeConclusao(hoje, null).data_conclusao, "2026-10-06");
});

test("datasDeConclusao: dia 31 que não existe no mês de destino estoura (comportamento atual)", () => {
  const hoje = new Date("2026-01-31T12:00:00.000Z");
  // fevereiro de 2026 tem 28 dias: 31/02 vira 03/03
  assert.equal(datasDeConclusao(hoje, 1).proxima_renovacao, "2026-03-03");
});

// ------------------------------------------------------------ detalheLimitado
test("detalheLimitado: ausente vira null", () => {
  assert.equal(detalheLimitado(null), null);
  assert.equal(detalheLimitado(undefined), null);
});

test("detalheLimitado: objeto pequeno passa como veio", () => {
  const d = { segundos: 12, origem: "teste" };
  assert.equal(detalheLimitado(d), d);
});

test("detalheLimitado: o limite de caracteres do JSON é inclusivo", () => {
  assert.equal(MAX_DETALHE, 2000);
  const noLimite = { a: "x".repeat(MAX_DETALHE - 8) }; // {"a":"..."} = 2000
  assert.equal(JSON.stringify(noLimite).length, MAX_DETALHE);
  assert.equal(detalheLimitado(noLimite), noLimite);
  const passou = { a: "x".repeat(MAX_DETALHE - 7) };
  const cortado = detalheLimitado(passou);
  assert.equal(cortado?.cortado, true);
  assert.equal(cortado?.tamanho, MAX_DETALHE + 1);
  assert.equal((cortado?.json as string).length, MAX_DETALHE);
  assert.equal(cortado?.json, JSON.stringify(passou).slice(0, MAX_DETALHE));
});

test("detalheLimitado: objeto grande vira resumo com o JSON cortado", () => {
  const d = { texto: "y".repeat(5000) };
  const r = detalheLimitado(d);
  assert.equal(r?.cortado, true);
  assert.equal(r?.tamanho, JSON.stringify(d).length);
  assert.equal((r?.json as string).length, MAX_DETALHE);
});

test("detalheLimitado: array e valor simples nunca passam como objeto", () => {
  assert.deepEqual(detalheLimitado([1, 2]), { cortado: false, tamanho: 5, json: "[1,2]" });
  assert.deepEqual(detalheLimitado("abc"), { cortado: false, tamanho: 5, json: '"abc"' });
  assert.deepEqual(detalheLimitado(42), { cortado: false, tamanho: 2, json: "42" });
  assert.deepEqual(detalheLimitado(false), { cortado: false, tamanho: 5, json: "false" });
});

test("detalheLimitado: o que não serializa vira { invalido: true } ou null", () => {
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  assert.deepEqual(detalheLimitado(circular), { invalido: true });
  assert.deepEqual(detalheLimitado(10n), { invalido: true });
  // JSON.stringify devolve undefined para função e símbolo
  assert.equal(
    detalheLimitado(() => 1),
    null
  );
  assert.equal(detalheLimitado(Symbol("s")), null);
});

// ----------------------------------------------------------- cursoPublicado
test("cursoPublicado: só `ativo === false` é curso despublicado", () => {
  assert.equal(cursoPublicado({ ativo: true }), true);
  assert.equal(cursoPublicado({ ativo: false }), false);
});

test("cursoPublicado: campo ausente ou nulo (legado) conta como publicado", () => {
  assert.equal(cursoPublicado({}), true);
  assert.equal(cursoPublicado({ ativo: null }), true);
  assert.equal(cursoPublicado(null), true);
  assert.equal(cursoPublicado(undefined), true);
});

// ------------------------------------------------------ logoAssinadoParaPdf
// Dados sintéticos: empresas "empresa-a" e "empresa-b", logo "logo.png".
const assinarSempre = (url: string) => async (refs: string[]) =>
  new Map(refs.map((r) => [r, url] as [string, string]));

test("logoAssinadoParaPdf: referência da pasta da empresa vira a URL assinada", async () => {
  const pedidos: string[][] = [];
  const url = await logoAssinadoParaPdf("empresas/empresa-a/logo.png", async (refs) => {
    pedidos.push(refs);
    return new Map([["empresas/empresa-a/logo.png", "https://assinada.exemplo/logo?token=t"]]);
  });
  assert.equal(url, "https://assinada.exemplo/logo?token=t");
  assert.deepEqual(pedidos, [["empresas/empresa-a/logo.png"]]);
});

test("logoAssinadoParaPdf: URL do Base44 (arquivo perdido) fica sem logo e nem tenta assinar", async () => {
  let chamou = false;
  const assinar = async () => {
    chamou = true;
    return new Map<string, string>();
  };
  assert.equal(await logoAssinadoParaPdf("https://base44.app/api/files/logo.png", assinar), null);
  assert.equal(await logoAssinadoParaPdf("HTTPS://Files.BASE44.com/logo.png", assinar), null);
  assert.equal(chamou, false);
});

test("logoAssinadoParaPdf: vazio, espaços ou valor que não é texto ficam sem logo", async () => {
  let chamou = false;
  const assinar = async () => {
    chamou = true;
    return new Map<string, string>();
  };
  for (const v of [null, undefined, "", "   ", 0, {}, ["empresas/empresa-a/logo.png"]]) {
    assert.equal(await logoAssinadoParaPdf(v, assinar), null);
  }
  assert.equal(chamou, false);
});

test("logoAssinadoParaPdf: o que o helper não assinou (link externo, outra empresa) fica sem logo", async () => {
  const naoAssina = async () => new Map<string, string>();
  assert.equal(await logoAssinadoParaPdf("https://site.exemplo/logo.png", naoAssina), null);
  assert.equal(await logoAssinadoParaPdf("empresas/empresa-b/logo.png", naoAssina), null);
  assert.equal(await logoAssinadoParaPdf("data:image/png;base64,AAAA", naoAssina), null);
});

test("logoAssinadoParaPdf: falha ao assinar não derruba o `dados` (o PDF sai sem logo)", async () => {
  const quebra = async () => {
    throw new Error("storage fora do ar");
  };
  assert.equal(await logoAssinadoParaPdf("empresas/empresa-a/logo.png", quebra), null);
  assert.equal(await logoAssinadoParaPdf("empresas/empresa-a/logo.png", assinarSempre("")), null);
});

// Com o helper de verdade (`assinarDaEmpresa`) e um Storage de mentira: só a pasta da empresa da sessão.
const storageDeMentira = () => ({
  storage: {
    from: (bucket: string) => ({
      createSignedUrls: async (caminhos: string[], ttl: number) => ({
        data: caminhos.map((path) => ({
          path,
          signedUrl: `https://assinada.exemplo/${bucket}/${path}?ttl=${ttl}`,
        })),
        error: null,
      }),
    }),
  },
});

test("logoAssinadoParaPdf + assinarDaEmpresa: assina a pasta da empresa e barra a de outra", async () => {
  const supabase = storageDeMentira();
  const assinar = (empresaId: string) => (refs: string[]) =>
    assinarDaEmpresa(supabase, refs, empresaId);
  const propria = await logoAssinadoParaPdf("empresas/empresa-a/logo.png", assinar("empresa-a"));
  assert.match(
    String(propria),
    /^https:\/\/assinada\.exemplo\/empresas\/empresa-a\/logo\.png\?ttl=/
  );
  const alheia = await logoAssinadoParaPdf("empresas/empresa-b/logo.png", assinar("empresa-a"));
  assert.equal(alheia, null);
  const escapando = await logoAssinadoParaPdf(
    "empresas/empresa-a/../empresa-b/x.png",
    assinar("empresa-a")
  );
  assert.equal(escapando, null);
});

// -------------------------------------------------------------- comRastroDeFalha
test("comRastroDeFalha: sucesso devolve o resultado e não registra nada", async () => {
  const registros: unknown[] = [];
  const assinar = comRastroDeFalha(assinarSempre("https://assinada.exemplo/logo"), (e) =>
    registros.push(e)
  );
  const mapa = await assinar(["empresas/empresa-a/logo.png"]);
  assert.equal(mapa.get("empresas/empresa-a/logo.png"), "https://assinada.exemplo/logo");
  assert.deepEqual(registros, []);
});

test("comRastroDeFalha: falha ao assinar é registrada e relançada, com o mesmo erro", async () => {
  const registros: unknown[] = [];
  const erro = new Error("storage fora do ar");
  const assinar = comRastroDeFalha(
    async () => {
      throw erro;
    },
    (e) => registros.push(e)
  );
  await assert.rejects(
    () => assinar(["empresas/empresa-a/logo.png"]),
    (e) => e === erro
  );
  assert.deepEqual(registros, [erro]);
});

test("comRastroDeFalha: função que lança antes de devolver a promessa também vira rejeição registrada", async () => {
  const registros: unknown[] = [];
  const erro = new Error("falha síncrona");
  const assinar = comRastroDeFalha(
    () => {
      throw erro;
    },
    (e) => registros.push(e)
  );
  await assert.rejects(
    () => assinar(["x"]),
    (e) => e === erro
  );
  assert.deepEqual(registros, [erro]);
});

test("comRastroDeFalha: com logoAssinadoParaPdf o PDF sai sem logo e a falha deixa rastro", async () => {
  const registros: unknown[] = [];
  const assinar = comRastroDeFalha(
    async () => {
      throw new Error("sem rede");
    },
    (e) => registros.push(e)
  );
  assert.equal(await logoAssinadoParaPdf("empresas/empresa-a/logo.png", assinar), null);
  assert.equal(registros.length, 1);
});

test("comRastroDeFalha: o logo sem referência utilizável nem chama o assinar (nada a registrar)", async () => {
  const registros: unknown[] = [];
  const assinar = comRastroDeFalha(assinarSempre("https://assinada.exemplo/logo"), (e) =>
    registros.push(e)
  );
  assert.equal(await logoAssinadoParaPdf("https://base44.app/api/files/logo.png", assinar), null);
  assert.deepEqual(registros, []);
});

test("comRastroDeFalha: registrar que também falha não esconde o erro de verdade", async () => {
  const erro = new Error("storage fora do ar");
  const assinar = comRastroDeFalha(
    async () => {
      throw erro;
    },
    () => {
      throw new Error("o log quebrou");
    }
  );
  await assert.rejects(
    () => assinar(["x"]),
    (e) => e === erro
  );
});
