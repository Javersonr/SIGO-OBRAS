import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COLUNAS_MATRICULA_ALUNO,
  COLUNAS_MATRICULA_PORTAL,
  ESCOPO_RECONFIRMAR_SENHA,
  EVENTO_CONCLUSAO_ADIADA,
  EVENTO_CONCLUSAO_REGISTRADA,
  EVENTO_PROVA_INICIADA,
  JANELA_RECONFIRMAR_SENHA_SEG,
  LOCAL_DO_CERTIFICADO,
  MAX_DETALHE,
  MAX_TENTATIVAS_RECONFIRMAR_SENHA,
  MSG_MUITAS_ACOES,
  MSG_SINAL_CONCORRENTE,
  PCT_CONCLUSAO,
  REPROVADO_VE_NOTA,
  TEMPO_MINIMO_PROVA_POR_QUESTAO_SEG,
  TOLERANCIA_SEG,
  VOLUME_POR_ACAO,
  type AcaoComVolume,
  acaoDeVolumeDoEvento,
  aulaLiberada,
  aulasParaAluno,
  conclusaoDaAula,
  comRastroDeFalha,
  conclusoesAdiadas,
  corrigirProva,
  creditarTempo,
  cursoPublicado,
  datasDeConclusao,
  decisaoDeConclusao,
  dentroDoVolume,
  detalheDaProvaIniciada,
  detalheLimitado,
  inicioDaProva,
  liberacaoDasAulas,
  liberacoesPorMatricula,
  logoAssinadoParaPdf,
  marcoDaTrilha,
  matriculaParaAluno,
  matriculasAbertasComTrilhaCompleta,
  matriculasComConclusaoPorRegistrar,
  ordemDaProva,
  periodoDoCertificado,
  proximaTentativaEm,
  provaDaOrdem,
  reconfirmarSenha,
  refsDasAulasLiberadas,
  renovacaoAPartirDe,
  respostaDaCorrecao,
  resultadoDoSinal,
  retomarConclusoes,
  situacaoDasTentativas,
  situacaoDaTrilha,
  sortearProva,
  textoDaModalidade,
  travaDoSinal,
  ultimaLiberacao,
  validarEnvio,
} from "./regras.ts";
import { assinarDaEmpresa } from "../_shared/storage-assinar.ts";
import { consumirTentativa, liberarTentativas } from "../_shared/limite-tentativas.ts";

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
  // Desde a T16 o validarEnvio recusa null (400) antes da correção, então isto não chega mais aqui.
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

// ------------------------------------------- liberação do RH zera o intervalo (T18)
const liberada = (min: number) => ({ created_at: new Date(minDepois(min)).toISOString() });

test("situacaoDasTentativas: liberação do RH depois da última tentativa ignora o intervalo", () => {
  const base = {
    usadas: 1,
    curso: { intervalo_tentativa_min: 30 },
    matricula: {},
    ultima: tentativa(false),
    agora: minDepois(5),
  };
  assert.equal(situacaoDasTentativas(base).aguardarAte, minDepois(30), "sem liberação espera");
  assert.equal(
    situacaoDasTentativas({ ...base, liberadaEm: minDepois(2) }).aguardarAte,
    null,
    "liberada depois da tentativa"
  );
});

test("situacaoDasTentativas: liberação ANTERIOR à última tentativa não vale (o aluno já usou)", () => {
  const base = {
    usadas: 2,
    curso: { intervalo_tentativa_min: 30 },
    matricula: { tentativas_extras: 1 },
    ultima: { aprovada: false, created_at: new Date(minDepois(10)).toISOString() },
    agora: minDepois(12),
  };
  // liberada aos 5 min, tentou aos 10 min e reprovou de novo: o intervalo volta a valer
  assert.equal(
    situacaoDasTentativas({ ...base, liberadaEm: minDepois(5) }).aguardarAte,
    minDepois(40)
  );
  // no mesmo instante da tentativa também não conta: a liberação tem de ser DEPOIS dela
  assert.equal(
    situacaoDasTentativas({ ...base, liberadaEm: minDepois(10) }).aguardarAte,
    minDepois(40)
  );
});

test("situacaoDasTentativas: sem liberação (null, undefined) o intervalo vale como antes", () => {
  const base = {
    usadas: 1,
    curso: { intervalo_tentativa_min: 30 },
    matricula: {},
    ultima: tentativa(false),
    agora: minDepois(5),
  };
  for (const liberadaEm of [null, undefined, Number.NaN])
    assert.equal(situacaoDasTentativas({ ...base, liberadaEm }).aguardarAte, minDepois(30));
});

test("situacaoDasTentativas: a liberação não mexe no limite (as extras são da matrícula)", () => {
  const s = situacaoDasTentativas({
    usadas: 3,
    curso: { max_tentativas: 3, intervalo_tentativa_min: 30 },
    matricula: { tentativas_extras: 0 },
    ultima: tentativa(false),
    liberadaEm: minDepois(2),
    agora: minDepois(5),
  });
  assert.equal(s.esgotada, true, "sem a tentativa extra o limite continua esgotado");
  assert.equal(s.aguardarAte, null);
});

test("ultimaLiberacao: devolve a mais recente, em qualquer ordem, e ignora data inválida", () => {
  assert.equal(ultimaLiberacao([liberada(3), liberada(9), liberada(1)]), minDepois(9));
  assert.equal(ultimaLiberacao([{ created_at: "lixo" }, liberada(4), {}]), minDepois(4));
  for (const vazio of [[], null, undefined, [{ created_at: "lixo" }]])
    assert.equal(ultimaLiberacao(vazio), null);
});

test("liberacoesPorMatricula: uma data por matrícula (a mais recente); sem matrícula é ignorada", () => {
  const mapa = liberacoesPorMatricula([
    { matricula_id: "m1", ...liberada(3) },
    { matricula_id: "m2", ...liberada(7) },
    { matricula_id: "m1", ...liberada(8) },
    { matricula_id: null, ...liberada(20) },
    { ...liberada(30) },
  ]);
  assert.deepEqual([...mapa.entries()].sort(), [
    ["m1", minDepois(8)],
    ["m2", minDepois(7)],
  ]);
  assert.equal(liberacoesPorMatricula(null).size, 0);
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

test("datasDeConclusao: curso de apoio não grava proxima_renovacao (D3: não há certificado a renovar)", () => {
  const hoje = new Date("2026-10-05T15:00:00.000Z");
  // mesmo com validade em meses no curso, o apoio só registra o dia da conclusão
  assert.deepEqual(datasDeConclusao(hoje, 24, "apoio"), { data_conclusao: "2026-10-05" });
  assert.equal("proxima_renovacao" in datasDeConclusao(hoje, 12, "apoio"), false);
  // as outras modalidades (e a ausência da coluna) seguem renovando como sempre
  for (const modalidade of ["ead", "semipresencial", undefined, null, ""]) {
    assert.equal(datasDeConclusao(hoje, 24, modalidade).proxima_renovacao, "2028-10-05");
  }
});

test("datasDeConclusao: não altera a data recebida", () => {
  const hoje = new Date("2026-10-05T15:00:00.000Z");
  datasDeConclusao(hoje, 12);
  assert.equal(hoje.toISOString(), "2026-10-05T15:00:00.000Z");
});

test("datasDeConclusao: usa o dia de Brasília (23h30 de 05/10 é 02h30Z de 06/10)", () => {
  const hoje = new Date("2026-10-06T02:30:00.000Z");
  assert.equal(datasDeConclusao(hoje, null).data_conclusao, "2026-10-05");
});

test("datasDeConclusao: a virada do dia é à meia-noite de Brasília", () => {
  assert.equal(
    datasDeConclusao(new Date("2026-10-06T02:59:59.999Z"), null).data_conclusao,
    "2026-10-05"
  );
  assert.equal(
    datasDeConclusao(new Date("2026-10-06T03:00:00.000Z"), null).data_conclusao,
    "2026-10-06"
  );
});

test("datasDeConclusao: renovação de 24 meses a partir da data de Brasília, não da do UTC", () => {
  const hoje = new Date("2026-10-06T02:30:00.000Z"); // 23h30 de 05/10 em Brasília
  assert.deepEqual(datasDeConclusao(hoje, 24), {
    data_conclusao: "2026-10-05",
    proxima_renovacao: "2028-10-05",
  });
  assert.equal(datasDeConclusao(hoje, 12).proxima_renovacao, "2027-10-05");
});

test("datasDeConclusao: virada de ano em Brasília (23h30 de 31/12 é 1º/01 em UTC)", () => {
  const hoje = new Date("2027-01-01T02:30:00.000Z");
  assert.deepEqual(datasDeConclusao(hoje, 12), {
    data_conclusao: "2026-12-31",
    proxima_renovacao: "2027-12-31",
  });
});

test("datasDeConclusao: dia 31 que não existe no mês de destino estoura (comportamento atual)", () => {
  const hoje = new Date("2026-01-31T12:00:00.000Z");
  // fevereiro de 2026 tem 28 dias: 31/02 vira 03/03
  assert.equal(datasDeConclusao(hoje, 1).proxima_renovacao, "2026-03-03");
});

test("datasDeConclusao: o dia 31 também estoura contando sobre a data de Brasília", () => {
  // 23h30 de 31/01 em Brasília (02h30Z de 1º/02): a data é 31/01 e fevereiro não tem dia 31
  const hoje = new Date("2026-02-01T02:30:00.000Z");
  assert.deepEqual(datasDeConclusao(hoje, 1), {
    data_conclusao: "2026-01-31",
    proxima_renovacao: "2026-03-03",
  });
});

// ----------------------------------------------------------- decisaoDeConclusao (A6)
const sitConcluida = { aulasOk: true, temAvaliacao: true, concluido: true };
const hojeConclusao = new Date("2026-10-05T15:00:00.000Z");

test("decisaoDeConclusao: aulas por fazer não concluem e ainda não é a hora da prova", () => {
  const d = decisaoDeConclusao({
    sit: { aulasOk: false, temAvaliacao: true, concluido: false },
    curso: { validade_meses: 12, modalidade: "ead" },
    hoje: hojeConclusao,
  });
  assert.deepEqual(d, {
    resultado: { status: "em_andamento", concluiu: false, precisaAvaliacao: false },
    patch: null,
    adiada: false,
  });
});

test("decisaoDeConclusao: aulas feitas e prova pendente: é a hora da prova", () => {
  const d = decisaoDeConclusao({
    sit: { aulasOk: true, temAvaliacao: true, concluido: false },
    curso: { validade_meses: 12, modalidade: "ead" },
    hoje: hojeConclusao,
  });
  assert.deepEqual(d.resultado, {
    status: "em_andamento",
    concluiu: false,
    precisaAvaliacao: true,
  });
  assert.equal(d.patch, null);
});

test("decisaoDeConclusao: concluída grava a data de Brasília e a renovação do curso", () => {
  const d = decisaoDeConclusao({
    sit: sitConcluida,
    curso: { validade_meses: 24, modalidade: "ead" },
    hoje: hojeConclusao,
  });
  assert.deepEqual(d.resultado, { status: "concluido", concluiu: true, precisaAvaliacao: false });
  assert.deepEqual(d.patch, {
    status: "concluido",
    data_conclusao: "2026-10-05",
    proxima_renovacao: "2028-10-05",
  });
});

test("decisaoDeConclusao: curso de apoio conclui sem renovação (D3)", () => {
  const d = decisaoDeConclusao({
    sit: sitConcluida,
    curso: { validade_meses: 24, modalidade: "apoio" },
    hoje: hojeConclusao,
  });
  assert.equal(d.resultado.concluiu, true);
  assert.deepEqual(d.patch, { status: "concluido", data_conclusao: "2026-10-05" });
});

test("decisaoDeConclusao: curso lido sem validade conclui só com a data (curso sem validade)", () => {
  const d = decisaoDeConclusao({
    sit: sitConcluida,
    curso: { validade_meses: null, modalidade: "ead" },
    hoje: hojeConclusao,
  });
  assert.deepEqual(d.patch, { status: "concluido", data_conclusao: "2026-10-05" });
});

test("decisaoDeConclusao: sem conseguir ler o curso NÃO conclui (a validade sumiria para sempre)", () => {
  // curso nulo por erro de leitura: concluir agora gravaria a matrícula sem renovação (ou, no apoio, com ela),
  // e o trabalho já estaria 'concluido'. Devolve em_andamento: quem tenta de novo é a abertura do portal
  // (matriculasComConclusaoPorRegistrar + retomarConclusoes, logo abaixo).
  for (const curso of [null, undefined, { validade_meses: 24, modalidade: "ead" }]) {
    const d = decisaoDeConclusao({
      sit: sitConcluida,
      curso,
      cursoLido: false,
      hoje: hojeConclusao,
    });
    // adiada: a trilha estava completa e só a leitura do curso impediu; é o que a abertura do portal retoma
    assert.deepEqual(d, {
      resultado: { status: "em_andamento", concluiu: false, precisaAvaliacao: false },
      patch: null,
      adiada: true,
    });
  }
});

test("decisaoDeConclusao: só é 'adiada' a trilha completa; aula por fazer ou prova pendente com o curso ilegível não marca nada", () => {
  for (const sit of [
    { aulasOk: false, temAvaliacao: true, concluido: false },
    { aulasOk: true, temAvaliacao: true, concluido: false },
  ]) {
    const d = decisaoDeConclusao({ sit, curso: null, cursoLido: false, hoje: hojeConclusao });
    assert.equal(d.adiada, false);
    assert.equal(d.patch, null);
  }
});

test("decisaoDeConclusao: concluída com sucesso não é 'adiada'", () => {
  const d = decisaoDeConclusao({
    sit: sitConcluida,
    curso: { validade_meses: 12, modalidade: "ead" },
    hoje: hojeConclusao,
  });
  assert.equal(d.adiada, false);
});

test("decisaoDeConclusao: a data da conclusão é o dia (Brasília) do último marco da trilha, não o de hoje (I1)", () => {
  // última aula feita às 23h30 de 1º/10 em Brasília (02h30Z de 2/10); o portal só a registrou em 5/10
  const marco = new Date("2026-10-02T02:30:00.000Z");
  const d = decisaoDeConclusao({
    sit: sitConcluida,
    curso: { validade_meses: 24, modalidade: "ead" },
    hoje: hojeConclusao,
    marco,
  });
  assert.deepEqual(d.patch, {
    status: "concluido",
    data_conclusao: "2026-10-01",
    proxima_renovacao: "2028-10-01",
  });
});

test("decisaoDeConclusao: curso de apoio também conta a data do marco e continua sem renovação", () => {
  const d = decisaoDeConclusao({
    sit: sitConcluida,
    curso: { validade_meses: 24, modalidade: "apoio" },
    hoje: hojeConclusao,
    marco: new Date("2026-09-20T15:00:00.000Z"),
  });
  assert.deepEqual(d.patch, { status: "concluido", data_conclusao: "2026-09-20" });
});

test("decisaoDeConclusao: marco ausente, inválido ou no futuro vale hoje (nunca grava data de amanhã)", () => {
  for (const marco of [
    null,
    undefined,
    new Date("lixo"),
    new Date("2026-10-06T15:00:00.000Z"), // depois de hoje (relógio adiantado)
  ]) {
    const d = decisaoDeConclusao({
      sit: sitConcluida,
      curso: { validade_meses: 12, modalidade: "ead" },
      hoje: hojeConclusao,
      marco,
    });
    assert.equal(d.patch?.data_conclusao, "2026-10-05");
    assert.equal(d.patch?.proxima_renovacao, "2027-10-05");
  }
});

test("decisaoDeConclusao: curso inexistente (sem erro) conclui como antes, sem validade", () => {
  // maybeSingle sem linha e sem erro: o comportamento antigo (curso apagado entre a leitura e a conclusão)
  const d = decisaoDeConclusao({ sit: sitConcluida, curso: null, hoje: hojeConclusao });
  assert.equal(d.resultado.concluiu, true);
  assert.deepEqual(d.patch, { status: "concluido", data_conclusao: "2026-10-05" });
});

// ------------------------------- segunda chance da conclusão (A6, revisões 1 e 2)
// Dados sintéticos: ids, status e datas inventados.

test("os dois eventos da conclusão têm nome próprio e não são os de estudo", () => {
  assert.equal(EVENTO_CONCLUSAO_ADIADA, "conclusao_adiada");
  assert.equal(EVENTO_CONCLUSAO_REGISTRADA, "conclusao_registrada");
  assert.notEqual(EVENTO_CONCLUSAO_REGISTRADA, "curso_concluido");
});

// marcoDaTrilha: o momento em que a trilha ficou completa
test("marcoDaTrilha: o mais recente entre a última aula concluída e a aprovação", () => {
  const aulas = [{ id: "a1" }, { id: "a2" }];
  const concluidaEm = new Map<unknown, string>([
    ["a1", "2026-10-01T12:00:00.000Z"],
    ["a2", "2026-10-02T12:00:00.000Z"],
  ]);
  assert.equal(
    marcoDaTrilha({ aulas, concluidaEm, aprovadaEm: "2026-10-03T09:00:00.000Z" })?.toISOString(),
    "2026-10-03T09:00:00.000Z"
  );
  // curso sem prova (ou prova aprovada antes da última aula, se o RH acrescentou aula depois)
  assert.equal(marcoDaTrilha({ aulas, concluidaEm })?.toISOString(), "2026-10-02T12:00:00.000Z");
  assert.equal(
    marcoDaTrilha({ aulas, concluidaEm, aprovadaEm: "2026-09-30T09:00:00.000Z" })?.toISOString(),
    "2026-10-02T12:00:00.000Z"
  );
});

test("marcoDaTrilha: aula apagada não conta; data inválida ou ausente é ignorada; sem nada, null", () => {
  const concluidaEm = new Map<unknown, string | null>([
    ["a1", "2026-10-01T12:00:00.000Z"],
    ["apagada", "2026-10-09T12:00:00.000Z"], // progresso de uma aula que o RH excluiu
    ["a2", null],
    ["a3", "lixo"],
  ]);
  const aulas = [{ id: "a1" }, { id: "a2" }, { id: "a3" }];
  assert.equal(
    marcoDaTrilha({ aulas, concluidaEm, aprovadaEm: "não é data" })?.toISOString(),
    "2026-10-01T12:00:00.000Z"
  );
  assert.equal(marcoDaTrilha({ aulas: [{ id: "a2" }], concluidaEm: new Map() }), null);
  assert.equal(marcoDaTrilha({ aulas: [], concluidaEm: new Map() }), null);
});

// conclusoesAdiadas: as matrículas com a conclusão adiada e ainda não registrada
test("conclusoesAdiadas: adiada e nunca registrada é pendente", () => {
  const pendentes = conclusoesAdiadas([
    { matricula_id: "a", evento: EVENTO_CONCLUSAO_ADIADA, created_at: "2026-10-01T10:00:00Z" },
    { matricula_id: "b", evento: EVENTO_CONCLUSAO_ADIADA, created_at: "2026-10-01T11:00:00Z" },
  ]);
  assert.deepEqual([...pendentes].sort(), ["a", "b"]);
});

test("conclusoesAdiadas: registrada depois da adiada deixa de ser pendente; adiada de novo depois, volta a ser", () => {
  const pendentes = conclusoesAdiadas([
    { matricula_id: "a", evento: EVENTO_CONCLUSAO_ADIADA, created_at: "2026-10-01T10:00:00Z" },
    { matricula_id: "a", evento: EVENTO_CONCLUSAO_REGISTRADA, created_at: "2026-10-02T10:00:00Z" },
    // b foi registrada e depois reaberta (a trilha ficou completa outra vez e a leitura falhou de novo)
    { matricula_id: "b", evento: EVENTO_CONCLUSAO_ADIADA, created_at: "2026-10-01T10:00:00Z" },
    { matricula_id: "b", evento: EVENTO_CONCLUSAO_REGISTRADA, created_at: "2026-10-02T10:00:00Z" },
    { matricula_id: "b", evento: EVENTO_CONCLUSAO_ADIADA, created_at: "2026-10-03T10:00:00Z" },
    // c: só registrada (não há o que retomar)
    { matricula_id: "c", evento: EVENTO_CONCLUSAO_REGISTRADA, created_at: "2026-10-02T10:00:00Z" },
  ]);
  assert.deepEqual([...pendentes], ["b"]);
});

test("conclusoesAdiadas: não depende da ordem das linhas e ignora linha sem matrícula, outro evento ou data inválida", () => {
  const pendentes = conclusoesAdiadas([
    { matricula_id: "a", evento: EVENTO_CONCLUSAO_REGISTRADA, created_at: "2026-10-02T10:00:00Z" },
    { matricula_id: "a", evento: EVENTO_CONCLUSAO_ADIADA, created_at: "2026-10-01T10:00:00Z" },
    { matricula_id: null, evento: EVENTO_CONCLUSAO_ADIADA, created_at: "2026-10-01T10:00:00Z" },
    { matricula_id: "d", evento: "curso_concluido", created_at: "2026-10-01T10:00:00Z" },
    { matricula_id: "e", evento: EVENTO_CONCLUSAO_ADIADA, created_at: "ontem" },
  ]);
  assert.equal(pendentes.size, 0);
  assert.equal(conclusoesAdiadas([]).size, 0);
});

test("conclusoesAdiadas: no mesmo instante da registrada a conclusão já foi feita (não retoma)", () => {
  const pendentes = conclusoesAdiadas([
    { matricula_id: "a", evento: EVENTO_CONCLUSAO_ADIADA, created_at: "2026-10-01T10:00:00Z" },
    { matricula_id: "a", evento: EVENTO_CONCLUSAO_REGISTRADA, created_at: "2026-10-01T10:00:00Z" },
  ]);
  assert.equal(pendentes.size, 0);
});

// matriculasAbertasComTrilhaCompleta
test("matriculasAbertasComTrilhaCompleta: completa na trilha e ainda aberta no banco", () => {
  const completas = new Set(["a", "b", "c"]);
  const lista = [
    { id: "a", status: "em_andamento" },
    { id: "b", status: "pendente" },
    { id: "c", status: "concluido" }, // já concluída: nada a fazer
    { id: "d", status: "em_andamento" }, // trilha incompleta
    { id: "e", status: null },
  ];
  const abertas = matriculasAbertasComTrilhaCompleta(lista, (m) => completas.has(m.id));
  assert.deepEqual(
    abertas.map((m) => m.id),
    ["a", "b"]
  );
});

test("matriculasAbertasComTrilhaCompleta: não consulta a trilha de quem já está concluído; sem matrícula, nada", () => {
  const consultadas: string[] = [];
  matriculasAbertasComTrilhaCompleta(
    [
      { id: "a", status: "concluido" },
      { id: "b", status: "em_andamento" },
    ],
    (m) => {
      consultadas.push(m.id);
      return false;
    }
  );
  assert.deepEqual(consultadas, ["b"]);
  assert.deepEqual(
    matriculasAbertasComTrilhaCompleta([], () => true),
    []
  );
});

// matriculasComConclusaoPorRegistrar: só as que tiveram a conclusão adiada
test("matriculasComConclusaoPorRegistrar: só a que tem a conclusão adiada, e nunca a que fez a prova e não passou", () => {
  const abertas = [
    { id: "a", status: "em_andamento" }, // adiada, trilha completa: retoma
    { id: "b", status: "em_andamento" }, // trilha completa, mas nada foi adiado (ex.: prova refeita pelo RH)
    { id: "c", status: "em_andamento" }, // adiada, mas fez a prova e não foi aprovado
  ];
  const escolhidas = matriculasComConclusaoPorRegistrar(
    abertas,
    new Set(["a", "c"]),
    (m) => m.id === "c"
  );
  assert.deepEqual(
    escolhidas.map((m) => m.id),
    ["a"]
  );
});

test("matriculasComConclusaoPorRegistrar: matrícula sem id nunca é escolhida", () => {
  assert.deepEqual(
    matriculasComConclusaoPorRegistrar(
      [{ status: "em_andamento" }],
      new Set(["undefined"]),
      () => false
    ),
    []
  );
});

// retomarConclusoes
type Mat = { id: string; status: string; data_conclusao?: string | null };
const abertaA = (): Mat => ({ id: "a", status: "em_andamento", data_conclusao: null });

/**
 * Dependências de uma abertura do portal em que tudo corre bem; cada teste troca só o que importa.
 * `quaisAdiadas` devolve, das matrículas candidatas, as que têm a conclusão adiada (todas, por padrão).
 */
function retomada(
  sobrescrever: Record<string, unknown> = {},
  quaisAdiadas: (ids: string[]) => string[] = (ids) => ids
) {
  const chamadas = { lidas: [] as string[][], concluidas: [] as string[], relidas: [] as string[] };
  const registros: { mensagem: string; causa?: unknown }[] = [];
  const p = {
    matriculas: [abertaA()] as Mat[],
    concluidoNaTrilha: (_m: Mat) => true,
    provaSemAprovacao: (_m: Mat) => false,
    lerAdiadas: async (ids: string[]) => {
      chamadas.lidas.push(ids);
      return new Set(quaisAdiadas(ids));
    },
    concluir: async (m: Mat): Promise<{ concluiu: boolean; data_conclusao?: string | null }> => {
      chamadas.concluidas.push(m.id);
      return { concluiu: true, data_conclusao: "2026-10-01" };
    },
    reler: async (m: Mat): Promise<Mat | null> => {
      chamadas.relidas.push(m.id);
      return { id: m.id, status: "concluido", data_conclusao: "2026-10-01" };
    },
    registrar: (mensagem: string, causa?: unknown) => registros.push({ mensagem, causa }),
    ...sobrescrever,
  };
  return { p, chamadas, registros };
}

test("retomarConclusoes: conclusão adiada e trilha completa conclui, relê e atualiza a linha no lugar", async () => {
  const { p, chamadas, registros } = retomada();
  await retomarConclusoes(p);
  assert.deepEqual(p.matriculas, [{ id: "a", status: "concluido", data_conclusao: "2026-10-01" }]);
  assert.deepEqual(chamadas.lidas, [["a"]]);
  assert.deepEqual(chamadas.concluidas, ["a"]);
  assert.deepEqual(chamadas.relidas, ["a"]);
  assert.deepEqual(registros, []);
});

test("retomarConclusoes (I1): prova refeita pelo RH, aluno reprovado, questões antigas excluídas: NÃO conclui", async () => {
  // O cenário da revisão 2: 3 tentativas reprovadas, o RH exclui as questões antigas antes de cadastrar as novas,
  // e nesse intervalo o aluno abre o portal. Sem questões a trilha parece completa, mas nada foi adiado: não conclui.
  const reprovado = abertaA();
  const { p, chamadas } = retomada(
    {
      matriculas: [reprovado],
      concluidoNaTrilha: () => true, // sem questões vivas
      provaSemAprovacao: () => true, // tentativas feitas, nenhuma aprovada
    },
    () => [] // nenhuma conclusão adiada
  );
  await retomarConclusoes(p);
  assert.deepEqual(chamadas.concluidas, []);
  assert.deepEqual(chamadas.relidas, []);
  assert.deepEqual(reprovado, { id: "a", status: "em_andamento", data_conclusao: null });
});

test("retomarConclusoes (I1): mesmo com a conclusão adiada, quem fez a prova e não passou não conclui", async () => {
  const { p, chamadas } = retomada({ provaSemAprovacao: () => true });
  await retomarConclusoes(p);
  assert.deepEqual(chamadas.concluidas, []);
});

test("retomarConclusoes (I1): trilha completa que nunca foi adiada (aula apagada pelo RH) não é concluída por aqui", async () => {
  const { p, chamadas } = retomada({}, () => []);
  await retomarConclusoes(p);
  assert.deepEqual(chamadas.concluidas, []);
});

test("retomarConclusoes: só lê os eventos quando há matrícula aberta com a trilha completa", async () => {
  const { p, chamadas } = retomada({
    matriculas: [
      { id: "a", status: "concluido" },
      { id: "b", status: "em_andamento" },
    ],
    concluidoNaTrilha: (m: Mat) => m.id === "a", // a de b não está completa
  });
  await retomarConclusoes(p);
  assert.deepEqual(chamadas.lidas, []);
  assert.deepEqual(chamadas.concluidas, []);
});

test("retomarConclusoes: pede os eventos só das matrículas candidatas, numa leitura só", async () => {
  const { p, chamadas } = retomada(
    {
      matriculas: [
        { id: "a", status: "em_andamento" },
        { id: "b", status: "em_andamento" },
        { id: "c", status: "concluido" },
        { id: "d", status: "em_andamento" },
      ],
      concluidoNaTrilha: (m: Mat) => m.id !== "d",
    },
    () => ["b"]
  );
  await retomarConclusoes(p);
  assert.deepEqual(chamadas.lidas, [["a", "b"]]);
  assert.deepEqual(chamadas.concluidas, ["b"]);
});

test("retomarConclusoes: a leitura do curso falhou de novo (não concluiu): não relê e a linha fica como estava", async () => {
  const { p, chamadas } = retomada({ concluir: async () => ({ concluiu: false }) });
  await retomarConclusoes(p);
  assert.deepEqual(chamadas.relidas, []);
  assert.deepEqual(p.matriculas, [{ id: "a", status: "em_andamento", data_conclusao: null }]);
});

test("retomarConclusoes: nunca lança; o erro de uma matrícula vai para o registro e não impede as outras", async () => {
  const falha = new Error("rede");
  const { p, registros } = retomada({
    matriculas: [
      { id: "a", status: "em_andamento" },
      { id: "b", status: "em_andamento" },
      { id: "c", status: "em_andamento" },
    ],
    concluir: async (m: Mat) => {
      if (m.id === "a") throw falha; // a conclusão lançou
      return { concluiu: true };
    },
    reler: async (m: Mat) => {
      if (m.id === "b") throw falha; // a releitura lançou
      return { id: m.id, status: "concluido" };
    },
  });
  await retomarConclusoes(p);
  assert.equal(registros.length, 2);
  assert.ok(registros.every((r) => r.causa === falha));
  assert.deepEqual(
    p.matriculas.map((m) => m.status),
    ["em_andamento", "em_andamento", "concluido"]
  );
});

test("retomarConclusoes: não conseguir ler os eventos só é registrado (nada é concluído, o portal segue)", async () => {
  const falha = new Error("banco fora");
  const { p, chamadas, registros } = retomada({
    lerAdiadas: async () => {
      throw falha;
    },
  });
  await retomarConclusoes(p); // não lança
  assert.deepEqual(chamadas.concluidas, []);
  assert.equal(registros.length, 1);
  assert.equal(registros[0].causa, falha);
});

test("retomarConclusoes: erro ao conferir a trilha também é só registrado", async () => {
  const falha = new Error("trilha");
  const { p, chamadas, registros } = retomada({
    concluidoNaTrilha: () => {
      throw falha;
    },
  });
  await retomarConclusoes(p);
  assert.deepEqual(chamadas.concluidas, []);
  assert.equal(registros[0]?.causa, falha);
});

test("retomarConclusoes: releitura sem linha só é registrada (a matrícula segue como estava)", async () => {
  const { p, registros } = retomada({ reler: async () => null });
  await retomarConclusoes(p);
  assert.equal(registros.length, 1);
  assert.deepEqual(p.matriculas, [{ id: "a", status: "em_andamento", data_conclusao: null }]);
});

test("retomarConclusoes: sem matrícula, não chama nada", async () => {
  const { p, chamadas, registros } = retomada({ matriculas: [] });
  await retomarConclusoes(p);
  assert.deepEqual(chamadas, { lidas: [], concluidas: [], relidas: [] });
  assert.deepEqual(registros, []);
});

// ----- os dois cenários da revisão 2, com as regras reais compostas (situacaoDaTrilha, marcoDaTrilha, decisaoDeConclusao)
test("I1, cenário da revisão: reprovado nas 3 tentativas e questões excluídas pelo RH: a abertura do portal NÃO conclui", async () => {
  const aulas = [{ id: "a1" }, { id: "a2" }];
  const feitas = new Set<unknown>(["a1", "a2"]);
  const tentativas = [
    { matricula_id: "m1", numero: 1, aprovada: false },
    { matricula_id: "m1", numero: 2, aprovada: false },
    { matricula_id: "m1", numero: 3, aprovada: false },
  ];
  const matricula = { id: "m1", status: "em_andamento", data_conclusao: null as string | null };
  const concluidas: string[] = [];
  const retomar = async (questoesVivas: number) => {
    await retomarConclusoes({
      matriculas: [matricula],
      // a mesma conta do dados: sem questões vivas a trilha "fecha"
      concluidoNaTrilha: () =>
        situacaoDaTrilha({ aulas, feitas, temAvaliacao: questoesVivas > 0, aprovacao: null })
          .concluido,
      provaSemAprovacao: (m) => {
        const dela = tentativas.filter((t) => t.matricula_id === m.id);
        return dela.length > 0 && !dela.some((t) => t.aprovada);
      },
      // nenhum evento conclusao_adiada: o aluno nunca chegou a completar a trilha
      lerAdiadas: async () => conclusoesAdiadas([]),
      concluir: async (m) => {
        concluidas.push(m.id);
        return { concluiu: true };
      },
      reler: async (m) => ({ ...m, status: "concluido" }),
      registrar: () => {},
    });
  };
  await retomar(5); // com as 5 questões vivas a trilha nem fecha
  await retomar(0); // o intervalo em que o RH apagou as questões antigas
  assert.deepEqual(concluidas, []);
  assert.deepEqual(matricula, { id: "m1", status: "em_andamento", data_conclusao: null });
});

test("I1: conclusão adiada e retomada dias depois mantém a data da trilha e a renovação que conta dela", async () => {
  const aulas = [{ id: "a1" }, { id: "a2" }];
  const concluidaEm = new Map<unknown, string>([
    ["a1", "2026-10-02T14:00:00.000Z"],
    ["a2", "2026-10-03T12:00:00.000Z"],
  ]);
  // a leitura do curso falhou na última aula (03/10); o aluno só reabre o portal em 07/10
  const marco = marcoDaTrilha({ aulas, concluidaEm });
  const hoje = new Date("2026-10-07T15:00:00.000Z");
  const matricula = { id: "m1", status: "em_andamento", data_conclusao: null as string | null };
  let gravado: Record<string, unknown> | null = null;
  await retomarConclusoes({
    matriculas: [matricula],
    concluidoNaTrilha: () => true,
    provaSemAprovacao: () => false,
    lerAdiadas: async () =>
      conclusoesAdiadas([
        { matricula_id: "m1", evento: EVENTO_CONCLUSAO_ADIADA, created_at: "2026-10-03T12:00:01Z" },
      ]),
    concluir: async () => {
      const d = decisaoDeConclusao({
        sit: { aulasOk: true, temAvaliacao: false, concluido: true },
        curso: { validade_meses: 24, modalidade: "ead" },
        cursoLido: true,
        hoje,
        marco,
      });
      gravado = d.patch;
      return { concluiu: d.resultado.concluiu, data_conclusao: d.patch?.data_conclusao as string };
    },
    reler: async (m) => ({ ...m, ...gravado }),
    registrar: () => {},
  });
  assert.deepEqual(gravado, {
    status: "concluido",
    data_conclusao: "2026-10-03",
    proxima_renovacao: "2028-10-03",
  });
  assert.equal(matricula.status, "concluido");
  assert.equal(matricula.data_conclusao, "2026-10-03");
});

// ----------------------------------------------------------- renovacaoAPartirDe (T12)
test("renovacaoAPartirDe: a validade conta de um dia dado, com a mesma conta de datasDeConclusao", () => {
  assert.equal(renovacaoAPartirDe("2026-10-05", 12), "2027-10-05");
  assert.equal(renovacaoAPartirDe("2026-10-05", 24, "semipresencial"), "2028-10-05");
  assert.equal(renovacaoAPartirDe("2026-10-05", 3), "2027-01-05"); // vira o ano
  // dia 31 que não existe no mês de destino estoura, como em datasDeConclusao
  assert.equal(renovacaoAPartirDe("2026-01-31", 1), "2026-03-03");
  // e dá o mesmo que datasDeConclusao quando o dia é o de hoje
  const hoje = new Date("2026-10-05T15:00:00.000Z");
  assert.equal(renovacaoAPartirDe("2026-10-05", 12), datasDeConclusao(hoje, 12).proxima_renovacao);
});

test("renovacaoAPartirDe: sem validade, de apoio ou sem dia válido não há renovação", () => {
  for (const validade of [null, undefined, 0]) {
    assert.equal(renovacaoAPartirDe("2026-10-05", validade), null);
  }
  assert.equal(renovacaoAPartirDe("2026-10-05", 12, "apoio"), null);
  for (const dia of [null, undefined, "", "amanhã", "05/10/2026"]) {
    assert.equal(renovacaoAPartirDe(dia, 12), null, String(dia));
  }
});

test("semipresencial: a validade conta do fim do treinamento, não da teoria (12 meses, teoria em 01/10/2025, prática em 05/10/2026)", () => {
  // a matrícula guardou a validade da TEORIA: 01/10/2026, anterior ao dia da prática
  const daTeoria = datasDeConclusao(new Date("2025-10-01T15:00:00.000Z"), 12, "semipresencial");
  assert.equal(daTeoria.proxima_renovacao, "2026-10-01");
  // contada do dia da prática, a validade vai a 05/10/2027 (o certificado não nasce vencido)
  assert.equal(renovacaoAPartirDe("2026-10-05", 12, "semipresencial"), "2027-10-05");
});

// ------------------------------------------------------- período do certificado (T8)
test("periodoDoCertificado: início, conclusão e validade; o início é o dia de Brasília", () => {
  const p = periodoDoCertificado({
    iniciado_em: "2026-10-06T02:30:00.000Z", // 23h30 de 05/10 em Brasília
    created_at: "2026-09-01T12:00:00.000Z",
    data_conclusao: "2026-10-05",
    proxima_renovacao: "2028-10-05",
  });
  assert.deepEqual(p, { inicio: "2026-10-05", conclusao: "2026-10-05", validade: "2028-10-05" });
});

test("periodoDoCertificado: sem início registrado usa a criação da matrícula (também em Brasília)", () => {
  const p = periodoDoCertificado({
    iniciado_em: null,
    created_at: "2026-09-02T01:00:00.000Z", // 22h de 01/09 em Brasília
    data_conclusao: "2026-09-10",
    proxima_renovacao: null,
  });
  assert.deepEqual(p, { inicio: "2026-09-01", conclusao: "2026-09-10", validade: null });
});

test("periodoDoCertificado: data que não é data não derruba a emissão", () => {
  const p = periodoDoCertificado({ iniciado_em: "lixo", created_at: null, data_conclusao: null });
  assert.deepEqual(p, { inicio: null, conclusao: null, validade: null });
});

// ------------------------------------------------- modalidade e local do certificado (T8)
test("textoDaModalidade: EAD mantém o texto que os certificados já emitidos trazem", () => {
  assert.equal(textoDaModalidade("ead"), "Ensino a distância (EAD) — NR-1, Anexo II");
  assert.equal(textoDaModalidade(undefined), "Ensino a distância (EAD) — NR-1, Anexo II");
});

test("textoDaModalidade: semipresencial e apoio têm o próprio texto", () => {
  assert.match(textoDaModalidade("semipresencial"), /^Semipresencial/);
  assert.match(textoDaModalidade("semipresencial"), /prática presencial/);
  assert.match(textoDaModalidade("apoio"), /apoio/i);
  // nenhum deles diz "a distância" no lugar do outro
  assert.ok(!/^Ensino a distância/.test(textoDaModalidade("semipresencial")));
  assert.ok(!/^Ensino a distância/.test(textoDaModalidade("apoio")));
});

test("textoDaModalidade: valor desconhecido nunca vira EAD", () => {
  assert.ok(!/EAD/.test(textoDaModalidade("inventada")));
});

test("textoDaModalidade (T12): semipresencial com as duas cargas do curso diz quanto é teoria e quanto é prática", () => {
  const curso = { modalidade: "semipresencial", carga_teorica_horas: 4, carga_pratica_horas: "36" };
  assert.equal(
    textoDaModalidade("semipresencial", curso),
    "Semipresencial: teoria EAD (4 h) + prática presencial (36 h)"
  );
  assert.equal(
    textoDaModalidade("semipresencial", { carga_teorica_horas: 1.5, carga_pratica_horas: 0.5 }),
    "Semipresencial: teoria EAD (1,5 h) + prática presencial (0,5 h)"
  );
  // sem as cargas (o requisito CARGAS não deixa emitir assim), o texto genérico
  assert.equal(textoDaModalidade("semipresencial", {}), textoDaModalidade("semipresencial"));
  // o curso só muda o texto do semipresencial: o EAD continua igual ao dos certificados já emitidos
  assert.equal(textoDaModalidade("ead", curso), "Ensino a distância (EAD) — NR-1, Anexo II");
});

test("local do certificado: a plataforma e o endereço do portal do funcionário", () => {
  assert.deepEqual(LOCAL_DO_CERTIFICADO, {
    ambiente: "Plataforma SIGO Obras — https://www.sigoobras.com.br/PortalFuncionario",
  });
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

// ============================================================================
// Prova no servidor (T16): sorteio, início, validação do envio e resposta
// ============================================================================
// Dados sintéticos: nenhum identificador, nome ou texto de curso reais.
const BANCO = [
  {
    id: "q1",
    pergunta: "Pergunta 1",
    opcoes: ["a1", "b1", "c1", "d1"],
    correta: 2,
    comentario: "x",
  },
  { id: "q2", pergunta: "Pergunta 2", opcoes: ["a2", "b2", "c2"], correta: 0, comentario: "y" },
  { id: "q3", pergunta: "Pergunta 3", opcoes: ["a3", "b3"], correta: 1, comentario: "z" },
];
const semBanco = BANCO.map(({ id, opcoes }) => ({ id, opcoes })); // o que o envio confere
// Gerador pseudoaleatório determinístico (mulberry32): o teste não depende do acaso.
function semente(s: number) {
  let a = s >>> 0;
  return (n: number) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n);
  };
}

// ------------------------------------------------------------- sortearProva
test("sortearProva: devolve cada questão uma vez, com as alternativas embaralhadas e o mapa de volta", () => {
  for (let s = 1; s <= 200; s++) {
    const sorteada = sortearProva(BANCO, semente(s));
    assert.deepEqual(sorteada.map((q) => q.id).sort(), ["q1", "q2", "q3"]);
    for (const q of sorteada) {
      const original = BANCO.find((b) => b.id === q.id)!;
      assert.equal(q.pergunta, original.pergunta);
      // é uma permutação dos índices originais...
      assert.deepEqual(
        [...q.ordem_opcoes].sort(),
        original.opcoes.map((_, i) => i)
      );
      // ...e cada texto mostrado é o da alternativa que o índice aponta
      assert.deepEqual(
        q.opcoes,
        q.ordem_opcoes.map((i) => original.opcoes[i])
      );
    }
  }
});

test("sortearProva: com sorteio que sempre devolve 0 a ordem gira uma casa (resultado conhecido)", () => {
  const sorteada = sortearProva(BANCO, () => 0);
  assert.deepEqual(
    sorteada.map((q) => q.id),
    ["q2", "q3", "q1"]
  );
  assert.deepEqual(
    sorteada.map((q) => q.ordem_opcoes),
    [
      [1, 2, 0],
      [1, 0],
      [1, 2, 3, 0],
    ]
  );
});

test("sortearProva: sorteio que sempre devolve o último mantém a ordem original", () => {
  const sorteada = sortearProva(BANCO, (n) => n - 1);
  assert.deepEqual(
    sorteada.map((q) => q.id),
    ["q1", "q2", "q3"]
  );
  assert.deepEqual(
    sorteada.map((q) => q.ordem_opcoes),
    [
      [0, 1, 2, 3],
      [0, 1, 2],
      [0, 1],
    ]
  );
});

test("sortearProva: sementes diferentes dão ordens diferentes (não é sempre a mesma prova)", () => {
  const ordens = new Set<string>();
  for (let s = 1; s <= 50; s++) {
    ordens.add(JSON.stringify(sortearProva(BANCO, semente(s)).map((q) => [q.id, q.ordem_opcoes])));
  }
  assert.ok(ordens.size > 20, `só ${ordens.size} ordens diferentes em 50 sorteios`);
});

test("sortearProva: nunca devolve o gabarito nem o comentário, mesmo se a questão vier com eles", () => {
  const sorteada = sortearProva(BANCO, semente(7));
  for (const q of sorteada) {
    assert.deepEqual(Object.keys(q).sort(), ["id", "opcoes", "ordem_opcoes", "pergunta"]);
  }
  const texto = JSON.stringify(sorteada);
  assert.equal(texto.includes("correta"), false);
  assert.equal(texto.includes("comentario"), false);
});

test("sortearProva: não altera o que recebe", () => {
  const copia = JSON.parse(JSON.stringify(BANCO));
  sortearProva(BANCO, semente(3));
  assert.deepEqual(BANCO, copia);
});

test("sortearProva: alternativas guardadas como texto JSON (legado) e prova vazia", () => {
  const legado = [{ id: "q1", pergunta: "P", opcoes: JSON.stringify(["x", "y", "z"]) }];
  const sorteada = sortearProva(legado, () => 0);
  assert.deepEqual(sorteada[0].opcoes, ["y", "z", "x"]);
  assert.deepEqual(
    sortearProva([], () => 0),
    []
  );
  const quebrada = sortearProva([{ id: "q1", pergunta: "P", opcoes: "não é json" }], () => 0);
  assert.deepEqual(quebrada[0].opcoes, []);
  assert.deepEqual(quebrada[0].ordem_opcoes, []);
});

test("sortearProva: sorteio fora do intervalo é erro, não resultado silencioso", () => {
  for (const ruim of [() => 99, () => -1, () => 1.5, () => Number.NaN]) {
    assert.throws(() => sortearProva(BANCO, ruim), /sorteio/i);
  }
});

// ----------------------------------------------- provaDaOrdem / ordemDaProva
const ORDEM = [
  { questao_id: "q2", ordem_opcoes: [2, 0, 1] },
  { questao_id: "q3", ordem_opcoes: [1, 0] },
  { questao_id: "q1", ordem_opcoes: [3, 2, 1, 0] },
];
const comOrdem = (primeira: Record<string, unknown>) => [primeira, ORDEM[1], ORDEM[2]];

test("provaDaOrdem: refaz a prova na ordem que o servidor gravou", () => {
  const prova = provaDaOrdem(BANCO, ORDEM);
  assert.ok(prova);
  assert.deepEqual(
    prova.map((q) => q.id),
    ["q2", "q3", "q1"]
  );
  assert.deepEqual(prova[0].opcoes, ["c2", "a2", "b2"]);
  assert.deepEqual(prova[2].opcoes, ["d1", "c1", "b1", "a1"]);
  assert.deepEqual(prova[2].ordem_opcoes, [3, 2, 1, 0]);
});

test("provaDaOrdem: o que sai de sortearProva volta igual (ordemDaProva é a ida)", () => {
  const sorteada = sortearProva(BANCO, semente(11));
  assert.deepEqual(provaDaOrdem(BANCO, ordemDaProva(sorteada)), sorteada);
});

test("provaDaOrdem: ordem que não bate com as questões de hoje vira null", () => {
  assert.equal(provaDaOrdem(BANCO, ORDEM.slice(1)), null); // faltou questão
  assert.equal(provaDaOrdem(BANCO, [...ORDEM, { questao_id: "q4", ordem_opcoes: [0] }]), null);
  assert.equal(provaDaOrdem(BANCO, [ORDEM[0], ORDEM[0], ORDEM[1]]), null); // repetida
  assert.equal(provaDaOrdem(BANCO, comOrdem({ ...ORDEM[0], questao_id: "q9" })), null);
  // número de alternativas mudou depois do sorteio
  assert.equal(provaDaOrdem(BANCO, comOrdem({ ...ORDEM[0], ordem_opcoes: [1, 0] })), null);
  // não é permutação: repete ou passa do intervalo
  assert.equal(provaDaOrdem(BANCO, comOrdem({ ...ORDEM[0], ordem_opcoes: [0, 0, 1] })), null);
  assert.equal(provaDaOrdem(BANCO, comOrdem({ ...ORDEM[0], ordem_opcoes: [0, 1, 3] })), null);
  assert.equal(provaDaOrdem(BANCO, comOrdem({ ...ORDEM[0], ordem_opcoes: [0, 1, "2"] })), null);
  assert.equal(provaDaOrdem(BANCO, null as never), null);
  assert.equal(provaDaOrdem(BANCO, "q1" as never), null);
});

// ------------------------------------------- detalheDaProvaIniciada / inicioDaProva
test("o início da prova gravado volta lido do jeito que foi gravado", () => {
  const prova = sortearProva(BANCO, semente(5));
  const detalhe = detalheDaProvaIniciada({ tentativa: 2, agora: T0, prova });
  assert.equal(detalhe.tentativa, 2);
  assert.equal(detalhe.iniciada_em, "2026-10-05T12:00:00.000Z");
  // o que vai para o jsonb passa por JSON e volta igual
  const lido = inicioDaProva({
    created_at: "2026-10-05T12:00:01.000Z",
    detalhe: JSON.parse(JSON.stringify(detalhe)),
  });
  assert.deepEqual(lido, { tentativa: 2, iniciadaEm: T0, ordem: ordemDaProva(prova) });
});

test("inicioDaProva: a hora do início é a do detalhe; sem ela, a da linha", () => {
  const base = { tentativa: 1, prova: ORDEM };
  const criado = "2026-10-05T13:00:00.000Z";
  assert.equal(
    inicioDaProva({ created_at: criado, detalhe: base })?.iniciadaEm,
    Date.parse(criado)
  );
  assert.equal(
    inicioDaProva({
      created_at: criado,
      detalhe: { ...base, iniciada_em: "2026-10-05T12:30:00.000Z" },
    })?.iniciadaEm,
    Date.parse("2026-10-05T12:30:00.000Z")
  );
  // hora do detalhe inválida: usa a da linha
  assert.equal(
    inicioDaProva({ created_at: criado, detalhe: { ...base, iniciada_em: "ontem" } })?.iniciadaEm,
    Date.parse(criado)
  );
  // sem hora nenhuma, não há como medir o tempo
  assert.equal(inicioDaProva({ detalhe: base }), null);
});

test("inicioDaProva: detalhe quebrado vira null (a prova conta como não iniciada)", () => {
  const ok = { tentativa: 1, iniciada_em: "2026-10-05T12:00:00.000Z", prova: ORDEM };
  assert.ok(inicioDaProva({ detalhe: ok }));
  for (const ruim of [
    null,
    undefined,
    "texto",
    [],
    { ...ok, tentativa: 0 },
    { ...ok, tentativa: 1.5 },
    { ...ok, tentativa: "1" },
    { ...ok, prova: null },
    { ...ok, prova: "q1" },
    { ...ok, prova: [{ questao_id: 1, ordem_opcoes: [0] }] },
    { ...ok, prova: [{ questao_id: "q1", ordem_opcoes: "012" }] },
    { ...ok, prova: [{ questao_id: "q1", ordem_opcoes: [0, "1"] }] },
  ]) {
    assert.equal(inicioDaProva({ detalhe: ruim }), null, JSON.stringify(ruim));
  }
  assert.equal(inicioDaProva(null), null);
  assert.equal(inicioDaProva(undefined), null);
});

// -------------------------------------------------------------- validarEnvio
const INICIO = { tentativa: 1, iniciadaEm: T0, ordem: ORDEM };
const COMPLETAS = [
  { questao_id: "q1", resposta: 0 },
  { questao_id: "q2", resposta: 1 },
  { questao_id: "q3", resposta: 1 },
];
const envio = (mudancas: Record<string, unknown> = {}) =>
  validarEnvio({
    questoes: semBanco,
    respostas: COMPLETAS,
    inicio: INICIO,
    numero: 1,
    agora: T0 + 5000,
    ...mudancas,
  } as Parameters<typeof validarEnvio>[0]);
const recusa = (r: ReturnType<typeof validarEnvio>) => {
  assert.equal(r.ok, false);
  return r as Extract<typeof r, { ok: false }>;
};

test("validarEnvio: prova iniciada e completa é aceita, na ordem que o servidor sorteou", () => {
  const r = envio();
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(
    r.prova.map((q) => q.id),
    ["q2", "q3", "q1"]
  );
  assert.deepEqual(r.prova[0].ordem_opcoes, [2, 0, 1]);
  // uma resposta por questão, na ordem da prova, só com número inteiro
  assert.deepEqual(r.respostas, [
    { questao_id: "q2", resposta: 1 },
    { questao_id: "q3", resposta: 1 },
    { questao_id: "q1", resposta: 0 },
  ]);
});

test("validarEnvio: sem início da prova é recusada (409 PROVA_NAO_INICIADA)", () => {
  const r = recusa(envio({ inicio: null }));
  assert.equal(r.status, 409);
  assert.equal(r.codigo, "PROVA_NAO_INICIADA");
  assert.match(r.mensagem, /prova/i);
});

test("validarEnvio: o início tem de ser DESTA tentativa; o de uma tentativa já enviada não vale", () => {
  // tentativa 1 já foi enviada: a próxima é a 2, e o início gravado ainda é o da 1
  assert.equal(recusa(envio({ numero: 2 })).codigo, "PROVA_NAO_INICIADA");
  // início de uma tentativa que ainda não chegou também não vale
  const adiante = recusa(envio({ inicio: { ...INICIO, tentativa: 3 }, numero: 2 }));
  assert.equal(adiante.codigo, "PROVA_NAO_INICIADA");
  assert.equal(envio({ inicio: { ...INICIO, tentativa: 2 }, numero: 2 }).ok, true);
});

test("validarEnvio: o RH mexeu nas questões depois do início: 409 PROVA_ALTERADA", () => {
  const nova = [...semBanco, { id: "q4", opcoes: ["a", "b"] }];
  const r = recusa(envio({ questoes: nova }));
  assert.equal(r.status, 409);
  assert.equal(r.codigo, "PROVA_ALTERADA");
  assert.equal(recusa(envio({ questoes: semBanco.slice(1) })).codigo, "PROVA_ALTERADA");
  const menosOpcoes = [{ id: "q1", opcoes: ["a1", "b1"] }, ...semBanco.slice(1)];
  assert.equal(recusa(envio({ questoes: menosOpcoes })).codigo, "PROVA_ALTERADA");
});

test("validarEnvio: falta resposta: 400 RESPOSTAS_INCOMPLETAS com quantas faltam", () => {
  const r = recusa(envio({ respostas: COMPLETAS.slice(0, 2) }));
  assert.equal(r.status, 400);
  assert.equal(r.codigo, "RESPOSTAS_INCOMPLETAS");
  assert.equal(r.extra?.faltam, 1);
  assert.match(r.mensagem, /falta 1\b/);
  const duas = recusa(envio({ respostas: COMPLETAS.slice(0, 1) }));
  assert.equal(duas.extra?.faltam, 2);
  assert.match(duas.mensagem, /faltam 2\b/);
});

test("validarEnvio: sem lista de respostas, vazia ou de tipo errado, todas faltam", () => {
  for (const respostas of [undefined, null, [], "q1", { q1: 0 }, 5]) {
    const r = recusa(envio({ respostas }));
    assert.equal(r.codigo, "RESPOSTAS_INCOMPLETAS");
    assert.equal(r.extra?.faltam, 3);
  }
});

test("validarEnvio: só inteiro dentro das alternativas conta como resposta (null deixa de valer 0)", () => {
  const com = (resposta: unknown) =>
    envio({ respostas: [{ questao_id: "q1", resposta }, ...COMPLETAS.slice(1)] });
  // q1 tem 4 alternativas: 0..3 valem
  for (const valida of [0, 1, 3]) assert.equal(com(valida).ok, true, String(valida));
  const invalidas = [null, undefined, "0", "", true, 4, -1, 1.5, Number.NaN, Infinity, [0], {}];
  for (const ruim of invalidas) {
    const r = recusa(com(ruim));
    assert.equal(r.codigo, "RESPOSTAS_INCOMPLETAS", String(ruim));
    assert.equal(r.extra?.faltam, 1);
  }
});

test("validarEnvio: resposta de questão que não é da prova é ignorada; a repetida vale pela última", () => {
  const extra = envio({ respostas: [...COMPLETAS, { questao_id: "q-alheia", resposta: 0 }] });
  assert.equal(extra.ok, true);
  if (extra.ok) assert.equal(extra.respostas.length, 3);
  // só a questão alheia respondida: as da prova continuam faltando
  const alheia = recusa(envio({ respostas: [{ questao_id: "q-alheia", resposta: 0 }] }));
  assert.equal(alheia.extra?.faltam, 3);
  const repetida = envio({ respostas: [{ questao_id: "q1", resposta: 3 }, ...COMPLETAS] });
  assert.equal(repetida.ok, true);
  if (repetida.ok) {
    assert.equal(repetida.respostas.find((r) => r.questao_id === "q1")?.resposta, 0);
  }
});

test("validarEnvio: itens soltos na lista (null, número) não derrubam a validação", () => {
  assert.equal(envio({ respostas: [null, 5, "x", ...COMPLETAS] }).ok, true);
});

test("validarEnvio: tempo mínimo desde o início, por questão, quando configurado", () => {
  // 10 s por questão, 3 questões: 30 s
  const regra = { tempoMinimoPorQuestaoSeg: 10 };
  const cedo = recusa(envio({ ...regra, agora: T0 + 10_000 }));
  assert.equal(cedo.status, 409);
  assert.equal(cedo.codigo, "TEMPO_MINIMO_PROVA");
  assert.equal(cedo.extra?.faltam_seg, 20);
  assert.match(cedo.mensagem, /20 s/);
  // fração de segundo sobe: falta 0,5 s -> 1 s
  assert.equal(recusa(envio({ ...regra, agora: T0 + 29_500 })).extra?.faltam_seg, 1);
  // no instante exato e depois, passa
  assert.equal(envio({ ...regra, agora: T0 + 30_000 }).ok, true);
  assert.equal(envio({ ...regra, agora: T0 + 3_600_000 }).ok, true);
});

test("validarEnvio: tempo mínimo longo é dito em minutos", () => {
  const r = recusa(envio({ tempoMinimoPorQuestaoSeg: 120, agora: T0 })); // 6 min no total
  assert.equal(r.extra?.faltam_seg, 360);
  assert.match(r.mensagem, /6 min/);
});

test("validarEnvio: relógio do início no futuro conta como zero decorrido (e não libera antes da hora)", () => {
  const r = recusa(
    envio({
      tempoMinimoPorQuestaoSeg: 10,
      inicio: { ...INICIO, iniciadaEm: T0 + 60_000 },
      agora: T0,
    })
  );
  assert.equal(r.codigo, "TEMPO_MINIMO_PROVA");
  assert.equal(r.extra?.faltam_seg, 30);
});

test("validarEnvio: sem mínimo configurado não há espera (padrão de hoje, D10 decide)", () => {
  assert.equal(TEMPO_MINIMO_PROVA_POR_QUESTAO_SEG, 0);
  // envio no mesmo instante do início, usando o padrão do módulo
  assert.equal(envio({ agora: T0 }).ok, true);
  for (const invalido of [0, -5, Number.NaN, undefined]) {
    const r = envio({ tempoMinimoPorQuestaoSeg: invalido, agora: T0 });
    assert.equal(r.ok, true, String(invalido));
  }
});

test("validarEnvio: a ordem das recusas é início, prova alterada, respostas, tempo", () => {
  const faltando = COMPLETAS.slice(0, 1);
  const regra = { tempoMinimoPorQuestaoSeg: 10, agora: T0 };
  // sem início vence tudo
  const semInicio = recusa(envio({ ...regra, inicio: null, respostas: faltando }));
  assert.equal(semInicio.codigo, "PROVA_NAO_INICIADA");
  // prova alterada vence resposta faltando
  const alterada = recusa(envio({ ...regra, questoes: semBanco.slice(1), respostas: faltando }));
  assert.equal(alterada.codigo, "PROVA_ALTERADA");
  // resposta faltando vence o tempo
  assert.equal(recusa(envio({ ...regra, respostas: faltando })).codigo, "RESPOSTAS_INCOMPLETAS");
  assert.equal(recusa(envio(regra)).codigo, "TEMPO_MINIMO_PROVA");
});

test("validarEnvio: o envio aceito corrige com corrigirProva sem mudar a conta de hoje", () => {
  const r = envio();
  assert.ok(r.ok);
  if (!r.ok) return;
  const res = corrigirProva({ questoes: BANCO, respostas: r.respostas, notaMinima: 70 });
  // q1 marcou 0 (certa é 2): erra; q2 marcou 1 (certa 0): erra; q3 marcou 1 (certa 1): acerta
  assert.equal(res.acertos, 1);
  assert.equal(res.nota, 33);
});

// ------------------------------------------------------------ respostaDaCorrecao
const REVISAO = [{ questao_id: "q1", acertou: true, resposta_correta: "c1", comentario: "x" }];
const CORRECAO = {
  nota: 80,
  notaMinima: 70,
  acertos: 4,
  total: 5,
  tentativa: 2,
  tentativasMax: 3,
  proximaEm: null,
  cursoConcluido: true,
  revisao: REVISAO,
};

test("respostaDaCorrecao: aprovado recebe tudo, como hoje, com o conceito satisfatório", () => {
  const r = respostaDaCorrecao({ ...CORRECAO, aprovada: true });
  assert.deepEqual(r, {
    resultado: "satisfatorio",
    aprovada: true,
    nota: 80,
    nota_minima: 70,
    acertos: 4,
    total: 5,
    tentativa: 2,
    tentativas_max: 3,
    proxima_em: null,
    curso_concluido: true,
    revisao: REVISAO,
  });
});

test("respostaDaCorrecao: com REPROVADO_VE_NOTA = false o reprovado recebe só 'insatisfatório', tentativas e liberação", () => {
  const r = respostaDaCorrecao(
    {
      ...CORRECAO,
      aprovada: false,
      nota: 40,
      acertos: 2,
      cursoConcluido: false,
      revisao: null,
      proximaEm: "2026-10-05T12:30:00.000Z",
    },
    false
  );
  assert.deepEqual(r, {
    resultado: "insatisfatorio",
    aprovada: false,
    nota_minima: 70,
    tentativa: 2,
    tentativas_max: 3,
    proxima_em: "2026-10-05T12:30:00.000Z",
    curso_concluido: false,
    revisao: null,
  });
  // nada que sirva para deduzir o gabarito: nem nota, nem acertos, nem total
  for (const chave of ["nota", "acertos", "total"]) assert.equal(chave in r, false, chave);
});

test("respostaDaCorrecao: reprovado nunca leva a correção comentada, mesmo se vier preenchida", () => {
  for (const veNota of [undefined, true, false]) {
    const r = respostaDaCorrecao({ ...CORRECAO, aprovada: false, revisao: REVISAO }, veNota);
    assert.equal(r.revisao, null, String(veNota));
    assert.equal(r.curso_concluido, false, String(veNota));
  }
});

test("respostaDaCorrecao: o reprovado vê só 'insatisfatório' (D10, 06/10/2026: REPROVADO_VE_NOTA = false)", () => {
  // D10 decidida: nota, acertos e total do reprovado deixariam deduzir o gabarito; o RH vê tudo na trilha
  assert.equal(REPROVADO_VE_NOTA, false);
  const reprovado = {
    ...CORRECAO,
    aprovada: false,
    nota: 40,
    acertos: 2,
    revisao: null,
    cursoConcluido: false,
  };
  const padrao = respostaDaCorrecao(reprovado); // sem o 2º argumento: vale a constante
  for (const chave of ["nota", "acertos", "total"]) assert.equal(chave in padrao, false, chave);
  assert.equal(padrao.resultado, "insatisfatorio");
  assert.equal(padrao.revisao, null); // a correção comentada continua só para o aprovado
  assert.deepEqual(padrao, respostaDaCorrecao(reprovado, false));
  // o aprovado continua recebendo a própria nota, com o padrão
  const aprovado = respostaDaCorrecao({ ...CORRECAO, aprovada: true, nota: 80, acertos: 4 });
  assert.equal(aprovado.nota, 80);
  assert.equal(aprovado.acertos, 4);
  assert.equal(aprovado.total, 5);
  // a constante ainda abre a nota quando alguém passa `true` de propósito (a regra é um interruptor)
  const aberto = respostaDaCorrecao(reprovado, true);
  assert.equal(aberto.nota, 40);
  assert.equal(aberto.acertos, 2);
  assert.equal(aberto.total, 5);
});

// ---------------------------------------------------------- matriculaParaAluno
test("matriculaParaAluno: com REPROVADO_VE_NOTA = false a nota de quem ainda não foi aprovado não sai", () => {
  const m = {
    id: "m1",
    status: "em_andamento",
    avaliacao_aprovada: false,
    nota_avaliacao: 40,
    tentativas_extras: 1,
  };
  const para = matriculaParaAluno(m, false);
  assert.equal(para.nota_avaliacao, null);
  assert.equal(para.id, "m1");
  assert.equal(para.status, "em_andamento");
  assert.equal("tentativas_extras" in para, false); // fora da lista fixa de colunas (T31)
  assert.equal(m.nota_avaliacao, 40); // o original não é alterado
});

test("matriculaParaAluno: o padrão (REPROVADO_VE_NOTA = false, D10) esconde a nota de quem não foi aprovado", () => {
  const reprovada = { id: "m1", avaliacao_aprovada: false, nota_avaliacao: 40 };
  assert.equal(matriculaParaAluno(reprovada).nota_avaliacao, null);
  assert.equal(matriculaParaAluno(reprovada, false).nota_avaliacao, null);
  // com a regra aberta de propósito a matrícula sai como está
  assert.equal(matriculaParaAluno(reprovada, true).nota_avaliacao, 40);
  // quem nunca fez a prova também não leva nota nenhuma
  assert.equal(matriculaParaAluno({ id: "m2", avaliacao_aprovada: null }).nota_avaliacao, null);
});

test("matriculaParaAluno: o aprovado vê a própria nota com a regra aberta ou fechada", () => {
  const aprovada = { id: "m1", avaliacao_aprovada: true, nota_avaliacao: 90 };
  for (const veNota of [undefined, true, false]) {
    assert.equal(matriculaParaAluno(aprovada, veNota).nota_avaliacao, 90, String(veNota));
  }
  // sem nota gravada continua sem nota (null/ausente)
  assert.equal(
    matriculaParaAluno({ id: "m1", avaliacao_aprovada: null }, false).nota_avaliacao,
    null
  );
  // com a regra aberta (`true`) a matrícula não é mexida: sem nota gravada, o campo continua ausente
  assert.equal(
    "nota_avaliacao" in matriculaParaAluno({ id: "m1", avaliacao_aprovada: null }, true),
    false
  );
});

// -------------------------------- aulas: liberação, URLs e texto só para as liberadas
const aulaBase = {
  modulo: null,
  fonte: "upload",
  youtube_id: null,
  video_ref: null,
  legenda_ref: null,
  arquivo_ref: null,
  conteudo_texto: null,
  duracao_seg: null,
};
const AULAS = [
  {
    ...aulaBase,
    id: "a1",
    ordem: 1,
    modulo: "M1",
    tipo: "video",
    titulo: "Aula 1",
    video_ref: "treinamentos/e/v1.mp4",
    legenda_ref: "treinamentos/e/v1.vtt",
    duracao_seg: 120,
  },
  {
    ...aulaBase,
    id: "a2",
    ordem: 2,
    modulo: "M1",
    tipo: "pdf",
    titulo: "Aula 2",
    arquivo_ref: "treinamentos/e/apostila.pdf",
    duracao_seg: 600,
  },
  {
    ...aulaBase,
    id: "a3",
    ordem: 3,
    modulo: "M2",
    tipo: "texto",
    titulo: "Aula 3",
    conteudo_texto: "Texto reservado da aula 3",
  },
  {
    ...aulaBase,
    id: "a4",
    ordem: 4,
    modulo: "M2",
    tipo: "video",
    titulo: "Aula 4",
    fonte: "youtube",
    youtube_id: "ID_YT_4",
    video_ref: "treinamentos/e/v4.mp4",
    legenda_ref: "treinamentos/e/v4.vtt",
  },
  {
    ...aulaBase,
    id: "a5",
    ordem: 5,
    tipo: "pdf",
    titulo: "Aula 5",
    legenda_ref: "treinamentos/e/leg5.vtt",
    arquivo_ref: "treinamentos/e/ap5.pdf",
    duracao_seg: 300,
  },
];
const progDe =
  (concluidas: string[], segundos: Record<string, number> = {}) =>
  (id: string) =>
    concluidas.includes(id) || id in segundos
      ? { concluida: concluidas.includes(id), segundos_assistidos: segundos[id] ?? 0 }
      : undefined;
const assinadaEm = (ref?: string | null) => (ref ? `https://assinada.exemplo/${ref}` : null);

test("liberacaoDasAulas: cada aula só libera com todas as anteriores concluídas", () => {
  const lib = liberacaoDasAulas(AULAS, progDe(["a1", "a2"]));
  assert.deepEqual(
    lib.map((a) => [a.id, a.concluida, a.liberada]),
    [
      ["a1", true, true],
      ["a2", true, true],
      ["a3", false, true],
      ["a4", false, false],
      ["a5", false, false],
    ]
  );
});

test("liberacaoDasAulas: aula concluída adiante não pula a pendente; nada concluído libera só a primeira", () => {
  const pulou = liberacaoDasAulas(AULAS, progDe(["a1", "a3"]));
  assert.deepEqual(
    pulou.map((a) => a.liberada),
    [true, true, false, false, false]
  );
  const nada = liberacaoDasAulas(AULAS, progDe([]));
  assert.deepEqual(
    nada.map((a) => a.liberada),
    [true, false, false, false, false]
  );
  assert.deepEqual(liberacaoDasAulas([], progDe([])), []);
});

test("liberacaoDasAulas: dá o mesmo que aulaLiberada, aula a aula", () => {
  const ids = AULAS.map((a) => a.id);
  for (const feitas of [[], ["a1"], ["a1", "a2"], ["a1", "a3"], ["a1", "a2", "a3", "a4"], ids]) {
    const lib = liberacaoDasAulas(AULAS, progDe(feitas));
    const trilha = { aulas: ids.map((id) => ({ id })), feitas: new Set<unknown>(feitas) };
    for (const a of lib) assert.equal(a.liberada, aulaLiberada(trilha, a.id), `${feitas}/${a.id}`);
  }
});

test("refsDasAulasLiberadas: só as aulas liberadas têm arquivo para assinar", () => {
  // a1 e a2 concluídas: libera a3 (sem arquivo); a4 e a5 estão bloqueadas
  assert.deepEqual(refsDasAulasLiberadas(AULAS, progDe(["a1", "a2"])).sort(), [
    "treinamentos/e/apostila.pdf",
    "treinamentos/e/v1.mp4",
    "treinamentos/e/v1.vtt",
  ]);
  // nada concluído: só a primeira
  assert.deepEqual(refsDasAulasLiberadas(AULAS, progDe([])).sort(), [
    "treinamentos/e/v1.mp4",
    "treinamentos/e/v1.vtt",
  ]);
});

test("refsDasAulasLiberadas: segue as mesmas regras de tipo de hoje e não traz vazios", () => {
  const todas = refsDasAulasLiberadas(AULAS, progDe(AULAS.map((a) => a.id)));
  assert.deepEqual(todas.sort(), [
    // a4 é YouTube: o video_ref dela não é assinado, só a legenda
    "treinamentos/e/ap5.pdf",
    "treinamentos/e/apostila.pdf",
    "treinamentos/e/leg5.vtt",
    "treinamentos/e/v1.mp4",
    "treinamentos/e/v1.vtt",
    "treinamentos/e/v4.vtt",
  ]);
  assert.deepEqual(refsDasAulasLiberadas([], progDe([])), []);
});

test("aulasParaAluno: aula bloqueada vai sem URL, sem texto e sem vídeo; a lista continua completa", () => {
  const aulas = aulasParaAluno({
    aulas: AULAS,
    progresso: progDe(["a1", "a2"]),
    urlDe: assinadaEm,
    tempoMinimoPadrao: 60,
  });
  assert.equal(aulas.length, 5);
  for (const bloqueada of aulas.filter((a) => !a.liberada)) {
    assert.equal(bloqueada.video_url, null, bloqueada.id);
    assert.equal(bloqueada.legenda_url, null, bloqueada.id);
    assert.equal(bloqueada.arquivo_url, null, bloqueada.id);
    assert.equal(bloqueada.conteudo_texto, null, bloqueada.id);
    assert.equal(bloqueada.youtube_id, null, bloqueada.id);
  }
  assert.deepEqual(
    aulas.map((a) => a.liberada),
    [true, true, true, false, false]
  );
  // o que o aluno precisa para ver a lista continua lá
  const a4 = aulas[3];
  assert.equal(a4.titulo, "Aula 4");
  assert.equal(a4.modulo, "M2");
  assert.equal(a4.ordem, 4);
  assert.equal(a4.tipo, "video");
  assert.equal(a4.fonte, "youtube");
  assert.equal(a4.concluida, false);
  // e nada do que é reservado aparece nas aulas que não estão liberadas
  const texto = JSON.stringify(aulas.filter((a) => !a.liberada));
  assert.equal(texto.includes("Texto reservado"), false);
  assert.equal(texto.includes("ID_YT_4"), false);
  assert.equal(texto.includes("assinada.exemplo"), false);
});

test("aulasParaAluno: vídeo próprio e texto de aula bloqueada não vazam; o da liberada, sim", () => {
  const aulas = [
    { ...aulaBase, id: "b1", tipo: "video", titulo: "B1", video_ref: "treinamentos/e/b1.mp4" },
    { ...aulaBase, id: "b2", tipo: "video", titulo: "B2", video_ref: "treinamentos/e/b2.mp4" },
    { ...aulaBase, id: "b3", tipo: "texto", titulo: "B3", conteudo_texto: "Texto reservado B3" },
  ];
  const [b1, b2, b3] = aulasParaAluno({
    aulas,
    progresso: progDe([]),
    urlDe: assinadaEm,
    tempoMinimoPadrao: 60,
  });
  assert.equal(b1.video_url, "https://assinada.exemplo/treinamentos/e/b1.mp4");
  assert.equal(b2.video_url, null);
  assert.equal(b3.conteudo_texto, null);
  assert.deepEqual(refsDasAulasLiberadas(aulas, progDe([])), ["treinamentos/e/b1.mp4"]);
  // concluída a primeira, a segunda recebe o vídeo e a terceira ainda não recebe o texto
  const depois = aulasParaAluno({
    aulas,
    progresso: progDe(["b1"]),
    urlDe: assinadaEm,
    tempoMinimoPadrao: 60,
  });
  assert.equal(depois[1].video_url, "https://assinada.exemplo/treinamentos/e/b2.mp4");
  assert.equal(depois[2].conteudo_texto, null);
  // concluídas as duas primeiras, o texto da terceira é liberado
  const fim = aulasParaAluno({
    aulas,
    progresso: progDe(["b1", "b2"]),
    urlDe: assinadaEm,
    tempoMinimoPadrao: 60,
  });
  assert.equal(fim[2].conteudo_texto, "Texto reservado B3");
});

test("aulasParaAluno: aula liberada recebe as URLs e o texto, e a concluída continua liberada", () => {
  const aulas = aulasParaAluno({
    aulas: AULAS,
    progresso: progDe(["a1", "a2"], { a1: 118 }),
    urlDe: assinadaEm,
    tempoMinimoPadrao: 60,
  });
  const [a1, a2, a3] = aulas;
  assert.equal(a1.video_url, "https://assinada.exemplo/treinamentos/e/v1.mp4");
  assert.equal(a1.legenda_url, "https://assinada.exemplo/treinamentos/e/v1.vtt");
  assert.equal(a1.arquivo_url, null);
  assert.equal(a1.concluida, true);
  assert.equal(a1.segundos_assistidos, 118);
  assert.equal(a2.arquivo_url, "https://assinada.exemplo/treinamentos/e/apostila.pdf");
  assert.equal(a2.video_url, null);
  assert.equal(a3.conteudo_texto, "Texto reservado da aula 3");
  assert.equal(a3.concluida, false);
  assert.equal(a3.segundos_assistidos, 0);
});

test("aulasParaAluno: nenhum arquivo de aula bloqueada chega a ser pedido ao assinador", () => {
  const pedidos: (string | null | undefined)[] = [];
  const urlDe = (ref?: string | null) => {
    pedidos.push(ref);
    return assinadaEm(ref);
  };
  aulasParaAluno({ aulas: AULAS, progresso: progDe([]), urlDe, tempoMinimoPadrao: 60 });
  // só a aula 1 está liberada: nenhuma referência de a2..a5 foi consultada
  assert.deepEqual(pedidos.filter(Boolean).sort(), [
    "treinamentos/e/v1.mp4",
    "treinamentos/e/v1.vtt",
  ]);
});

test("aulasParaAluno: YouTube liberado leva o id; vídeo próprio nunca; duração e tipo como hoje", () => {
  const todas = aulasParaAluno({
    aulas: AULAS,
    progresso: progDe(AULAS.map((a) => a.id)),
    urlDe: assinadaEm,
    tempoMinimoPadrao: 60,
  });
  const a4 = todas[3];
  assert.equal(a4.youtube_id, "ID_YT_4");
  assert.equal(a4.video_url, null); // fonte youtube: o video_ref não vira URL
  assert.equal(a4.legenda_url, "https://assinada.exemplo/treinamentos/e/v4.vtt");
  assert.equal(a4.duracao_seg, null); // vídeo sem duração segue sem duração (o portal avisa)
  assert.equal(todas[2].duracao_seg, 60); // texto sem tempo definido usa o padrão
  assert.equal(todas[0].duracao_seg, 120);
  assert.equal(todas[4].arquivo_url, "https://assinada.exemplo/treinamentos/e/ap5.pdf");
  assert.equal(todas[4].modulo, null);
});

test("aulasParaAluno: aula sem tipo (legado) aparece como vídeo, sem URL de vídeo, como hoje", () => {
  const legado = [
    {
      id: "x1",
      titulo: "Antiga",
      fonte: null,
      video_ref: "treinamentos/e/x.mp4",
      legenda_ref: null,
    },
  ];
  const [a] = aulasParaAluno({
    aulas: legado,
    progresso: progDe([]),
    urlDe: assinadaEm,
    tempoMinimoPadrao: 60,
  });
  assert.equal(a.tipo, "video");
  assert.equal(a.fonte, "youtube");
  assert.equal(a.video_url, null); // como hoje: só tipo "video" com fonte "upload" assina o vídeo
  assert.equal(a.duracao_seg, 60); // como hoje: sem tipo explícito não é "vídeo sem duração"
  assert.equal(a.liberada, true);
});

test("o evento da prova iniciada tem um nome só do servidor", () => {
  assert.equal(EVENTO_PROVA_INICIADA, "avaliacao_iniciada");
});

// -------------------------------------------------- reconfirmarSenha (T27)
// Limite de erros nas duas reconfirmações de senha da sessão (assinar o certificado e trocar a senha
// com a senha atual): uma fila de tentativas por funcionário, em escopo próprio, consumida ANTES de
// conferir a senha. Dados sintéticos.
type Consumo = Awaited<ReturnType<typeof consumirTentativa>>;

/** `consumir`/`conferir`/`liberar` falsos que registram a ordem das chamadas. */
function depsFalsas(opcoes: { permitido?: boolean; senhaCerta?: boolean } = {}) {
  const chamadas: string[] = [];
  const consumos: { escopo: string; janelaSeg: number; limites: unknown[] }[] = [];
  const consumo: Consumo = { permitido: opcoes.permitido ?? true, chaves: { conta: "k-conta" } };
  const liberados: Consumo[] = [];
  return {
    chamadas,
    consumos,
    liberados,
    consumo,
    deps: {
      consumir: async (escopo: string, janelaSeg: number, limites: unknown[]) => {
        chamadas.push("consumir");
        consumos.push({ escopo, janelaSeg, limites });
        return consumo;
      },
      conferir: async () => {
        chamadas.push("conferir");
        return opcoes.senhaCerta ?? true;
      },
      liberar: async (c: Consumo) => {
        chamadas.push("liberar");
        liberados.push(c);
      },
    },
  };
}

test("reconfirmarSenha: consome a tentativa ANTES de conferir, por funcionário e em escopo próprio", async () => {
  const f = depsFalsas({ senhaCerta: false });
  await reconfirmarSenha({ funcionarioId: "func-1", senha: "senha-digitada", ...f.deps });
  assert.deepEqual(f.chamadas, ["consumir", "conferir"]);
  assert.equal(f.consumos.length, 1);
  assert.equal(f.consumos[0].escopo, ESCOPO_RECONFIRMAR_SENHA);
  assert.equal(f.consumos[0].janelaSeg, JANELA_RECONFIRMAR_SENHA_SEG);
  // só por funcionário: um aparelho compartilhado (obra) não tranca os colegas
  assert.deepEqual(f.consumos[0].limites, [
    { tipo: "conta", valor: "func-1", max: MAX_TENTATIVAS_RECONFIRMAR_SENHA },
  ]);
});

test("reconfirmarSenha: o escopo não é o do login nem o das dúvidas, e o teto é 5 em 15 minutos", () => {
  assert.notEqual(ESCOPO_RECONFIRMAR_SENHA, "funcionario-login");
  assert.notEqual(ESCOPO_RECONFIRMAR_SENHA, "portal-duvida");
  assert.equal(MAX_TENTATIVAS_RECONFIRMAR_SENHA, 5);
  assert.equal(JANELA_RECONFIRMAR_SENHA_SEG, 15 * 60);
});

test("reconfirmarSenha: limite estourado devolve 'limite' sem nem conferir a senha", async () => {
  const f = depsFalsas({ permitido: false, senhaCerta: true });
  assert.equal(
    await reconfirmarSenha({ funcionarioId: "func-1", senha: "senha-digitada", ...f.deps }),
    "limite"
  );
  assert.deepEqual(f.chamadas, ["consumir"]);
});

test("reconfirmarSenha: senha certa devolve 'ok' e libera as tentativas (zera a conta)", async () => {
  const f = depsFalsas({ senhaCerta: true });
  assert.equal(
    await reconfirmarSenha({ funcionarioId: "func-1", senha: "senha-digitada", ...f.deps }),
    "ok"
  );
  assert.deepEqual(f.chamadas, ["consumir", "conferir", "liberar"]);
  assert.equal(f.liberados[0], f.consumo);
});

test("reconfirmarSenha: senha errada devolve 'incorreta' e não libera nada", async () => {
  const f = depsFalsas({ senhaCerta: false });
  assert.equal(
    await reconfirmarSenha({ funcionarioId: "func-1", senha: "senha-digitada", ...f.deps }),
    "incorreta"
  );
  assert.deepEqual(f.chamadas, ["consumir", "conferir"]);
});

/**
 * Banco falso do limitador: conta as chamadas de `auth_rate_limit_consumir` por chave (a chave é o
 * SHA-256 de "escopo:tipo:valor") e nega quando passa do teto, como a RPC da migração 0112.
 */
function limitadorFalso(falhar = false) {
  const contagem = new Map<string, number>();
  const zeradas: string[] = [];
  return {
    contagem,
    zeradas,
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (falhar) return { data: null, error: { message: "limitador fora do ar" } };
      if (fn === "auth_rate_limit_liberar") {
        for (const k of args.p_zerar as string[]) {
          contagem.delete(k);
          zeradas.push(k);
        }
        return { data: null, error: null };
      }
      const chaves = args.p_chaves as string[];
      const maximos = args.p_limites as number[];
      let permitido = true;
      chaves.forEach((k, i) => {
        const n = (contagem.get(k) ?? 0) + 1;
        contagem.set(k, n);
        if (n > maximos[i]) permitido = false;
      });
      return { data: permitido, error: null };
    },
  };
}

function reconfirmarComLimitador(
  admin: ReturnType<typeof limitadorFalso>,
  funcionarioId: string,
  senhaCerta: boolean
) {
  return reconfirmarSenha({
    funcionarioId,
    senha: "senha-digitada",
    consumir: (escopo, janelaSeg, limites) => consumirTentativa(admin, escopo, janelaSeg, limites),
    conferir: async () => senhaCerta,
    liberar: (c) => liberarTentativas(admin, c),
  });
}

test("reconfirmarSenha: cinco erros passam; a sexta tentativa é barrada, mesmo com a senha certa", async () => {
  const admin = limitadorFalso();
  for (let i = 0; i < MAX_TENTATIVAS_RECONFIRMAR_SENHA; i++) {
    assert.equal(await reconfirmarComLimitador(admin, "func-1", false), "incorreta");
  }
  assert.equal(await reconfirmarComLimitador(admin, "func-1", false), "limite");
  assert.equal(await reconfirmarComLimitador(admin, "func-1", true), "limite");
});

test("reconfirmarSenha: acertar zera a conta, e o contador recomeça", async () => {
  const admin = limitadorFalso();
  for (let i = 0; i < 4; i++) await reconfirmarComLimitador(admin, "func-1", false);
  assert.equal(await reconfirmarComLimitador(admin, "func-1", true), "ok");
  assert.equal(admin.zeradas.length, 1);
  for (let i = 0; i < MAX_TENTATIVAS_RECONFIRMAR_SENHA; i++) {
    assert.equal(await reconfirmarComLimitador(admin, "func-1", false), "incorreta");
  }
  assert.equal(await reconfirmarComLimitador(admin, "func-1", false), "limite");
});

test("reconfirmarSenha: o limite de um funcionário não afeta outro", async () => {
  const admin = limitadorFalso();
  for (let i = 0; i < MAX_TENTATIVAS_RECONFIRMAR_SENHA + 1; i++) {
    await reconfirmarComLimitador(admin, "func-1", false);
  }
  assert.equal(await reconfirmarComLimitador(admin, "func-1", true), "limite");
  assert.equal(await reconfirmarComLimitador(admin, "func-2", true), "ok");
});

test("reconfirmarSenha: senha vazia é 'incorreta' sem consumir tentativa nem conferir (T27)", async () => {
  for (const vazia of ["", undefined, null, 0 as unknown as string]) {
    const f = depsFalsas({ senhaCerta: true });
    const r = await reconfirmarSenha({
      funcionarioId: "func-1",
      senha: vazia as unknown as string,
      ...f.deps,
    });
    assert.equal(r, "incorreta", String(vazia));
    assert.deepEqual(f.chamadas, [], "nem consumiu a tentativa nem conferiu a senha");
  }
});

test("reconfirmarSenha: chamadas com senha vazia não queimam as tentativas de quem tem o token", async () => {
  const admin = limitadorFalso();
  // 20 pedidos de senha vazia (script com o token): nenhum conta
  for (let i = 0; i < 20; i++) {
    const r = await reconfirmarSenha({
      funcionarioId: "func-1",
      senha: "",
      consumir: (escopo, janelaSeg, limites) =>
        consumirTentativa(admin, escopo, janelaSeg, limites),
      conferir: async () => true,
      liberar: (c) => liberarTentativas(admin, c),
    });
    assert.equal(r, "incorreta");
  }
  assert.equal(admin.contagem.size, 0, "o limitador nem foi chamado");
  // as 5 tentativas de verdade continuam todas disponíveis, e a senha certa assina
  for (let i = 0; i < MAX_TENTATIVAS_RECONFIRMAR_SENHA - 1; i++) {
    assert.equal(await reconfirmarComLimitador(admin, "func-1", false), "incorreta");
  }
  assert.equal(await reconfirmarComLimitador(admin, "func-1", true), "ok");
});

test("reconfirmarSenha: senha só com espaços é uma senha como outra qualquer (consome e confere)", async () => {
  const f = depsFalsas({ senhaCerta: false });
  const r = await reconfirmarSenha({ funcionarioId: "func-1", senha: "   ", ...f.deps });
  assert.equal(r, "incorreta");
  assert.deepEqual(f.chamadas, ["consumir", "conferir"]);
});

test("reconfirmarSenha: limitador fora do ar não tranca (a conferência da senha segue valendo)", async () => {
  const admin = limitadorFalso(true);
  const erroOriginal = console.error;
  console.error = () => {};
  try {
    assert.equal(await reconfirmarComLimitador(admin, "func-1", true), "ok");
    assert.equal(await reconfirmarComLimitador(admin, "func-1", false), "incorreta");
  } finally {
    console.error = erroOriginal;
  }
});

// ------------------------------------------- matrícula com lista fixa de colunas (T31)
const matriculaDoBanco = {
  id: "m1",
  empresa_id: "emp-1",
  funcionario_id: "func-1",
  curso_id: "c1",
  status: "concluido",
  iniciado_em: "2026-10-01T12:00:00.000Z",
  data_conclusao: "2026-10-02",
  proxima_renovacao: "2027-10-02",
  nota_avaliacao: 90,
  avaliacao_aprovada: true,
  avaliacao_em: "2026-10-02T12:00:00.000Z",
  tentativas_extras: 2,
  created_at: "2026-09-30T12:00:00.000Z",
  updated_at: "2026-10-02T12:00:00.000Z",
  deleted_at: null,
  // coluna que alguém acrescente ao banco amanhã: não pode sair para o navegador sem ser pedida
  observacao_do_rh: "texto interno",
};

test("matriculaParaAluno: só as colunas da lista fixa vão para o aluno", () => {
  const saida = matriculaParaAluno(matriculaDoBanco);
  assert.deepEqual(Object.keys(saida).sort(), [...COLUNAS_MATRICULA_ALUNO].sort());
  for (const interna of [
    "empresa_id",
    "funcionario_id",
    "tentativas_extras",
    "updated_at",
    "deleted_at",
    "observacao_do_rh",
  ]) {
    assert.equal(interna in saida, false, interna);
  }
});

test("matriculaParaAluno: mantém o que a tela do aluno lê (id, curso, status, datas e aprovação)", () => {
  const saida: Record<string, unknown> = matriculaParaAluno(matriculaDoBanco);
  const original: Record<string, unknown> = matriculaDoBanco;
  for (const usada of [
    "id",
    "curso_id",
    "status",
    "data_conclusao",
    "proxima_renovacao",
    "created_at",
    "avaliacao_aprovada",
    "nota_avaliacao",
  ]) {
    assert.ok((COLUNAS_MATRICULA_ALUNO as readonly string[]).includes(usada), usada);
    assert.equal(saida[usada], original[usada], usada);
  }
});

test("matriculaParaAluno: coluna que a consulta não trouxe continua ausente (não vira undefined)", () => {
  // com a nota liberada (`true`) nada é acrescentado: só sai o que a consulta trouxe
  const saida = matriculaParaAluno({ id: "m1", curso_id: "c1", avaliacao_aprovada: false }, true);
  assert.deepEqual(Object.keys(saida).sort(), ["avaliacao_aprovada", "curso_id", "id"]);
  // com o padrão (D10, nota escondida de quem não foi aprovado) o campo da nota sai sempre `null`,
  // nunca ausente: a tela não distingue "sem nota" de "nota escondida"
  const padrao = matriculaParaAluno({ id: "m1", curso_id: "c1", avaliacao_aprovada: false });
  assert.deepEqual(Object.keys(padrao).sort(), [
    "avaliacao_aprovada",
    "curso_id",
    "id",
    "nota_avaliacao",
  ]);
  assert.equal(padrao.nota_avaliacao, null);
});

test("matriculaParaAluno: a nota escondida (regra fechada) continua escondida na lista fixa", () => {
  const reprovada = { ...matriculaDoBanco, avaliacao_aprovada: false, nota_avaliacao: 40 };
  const saida = matriculaParaAluno(reprovada, false);
  assert.equal(saida.nota_avaliacao, null);
  assert.equal("tentativas_extras" in saida, false);
});

test("COLUNAS_MATRICULA_PORTAL: lista explícita (sem *) com a do aluno mais o que só o servidor lê", () => {
  const colunas = COLUNAS_MATRICULA_PORTAL.split(",").map((c) => c.trim());
  assert.equal(colunas.includes("*"), false);
  for (const c of COLUNAS_MATRICULA_ALUNO) assert.ok(colunas.includes(c), c);
  // o limite de tentativas soma as extras do RH; sem esta coluna a conta ficaria errada
  assert.ok(colunas.includes("tentativas_extras"));
  assert.equal(new Set(colunas).size, colunas.length, "coluna repetida");
  // nada que identifique outra empresa ou funcionário sai da consulta: o servidor já filtra por eles
  for (const fora of ["empresa_id", "funcionario_id", "updated_at", "deleted_at"]) {
    assert.equal(colunas.includes(fora), false, fora);
  }
});

// ------------------------------------------------ limite de volume: evento e progresso (T31)
function volumeComLimitador(
  admin: ReturnType<typeof limitadorFalso>,
  acao: AcaoComVolume,
  funcionarioId: string
) {
  return dentroDoVolume({
    acao,
    funcionarioId,
    consumir: (escopo, janelaSeg, limites) => consumirTentativa(admin, escopo, janelaSeg, limites),
  });
}

test("dentroDoVolume: passa até o teto da ação e barra a partir da seguinte", async () => {
  for (const acao of Object.keys(VOLUME_POR_ACAO) as AcaoComVolume[]) {
    const admin = limitadorFalso();
    for (let i = 0; i < VOLUME_POR_ACAO[acao].max; i++) {
      assert.equal(await volumeComLimitador(admin, acao, "func-1"), true, `${acao} #${i + 1}`);
    }
    assert.equal(await volumeComLimitador(admin, acao, "func-1"), false, `${acao} acima do teto`);
    assert.equal(await volumeComLimitador(admin, acao, "func-1"), false, `${acao} segue barrado`);
  }
});

test("dentroDoVolume: o contador é por funcionário, nunca por IP", async () => {
  const chamadas: { escopo: string; janelaSeg: number; limites: unknown[] }[] = [];
  const consumir = async (escopo: string, janelaSeg: number, limites: unknown[]) => {
    chamadas.push({ escopo, janelaSeg, limites });
    return { permitido: true, chaves: {} };
  };
  await dentroDoVolume({ acao: "progresso", funcionarioId: "func-1", consumir });
  assert.equal(chamadas.length, 1);
  assert.deepEqual(chamadas[0].limites, [
    { tipo: "conta", valor: "func-1", max: VOLUME_POR_ACAO.progresso.max },
  ]);
  assert.equal(chamadas[0].escopo, VOLUME_POR_ACAO.progresso.escopo);
  assert.equal(chamadas[0].janelaSeg, VOLUME_POR_ACAO.progresso.janelaSeg);
});

test("dentroDoVolume: um funcionário no teto não atrapalha outro (aparelho compartilhado de obra)", async () => {
  const admin = limitadorFalso();
  for (let i = 0; i <= VOLUME_POR_ACAO.evento.max; i++) {
    await volumeComLimitador(admin, "evento", "func-1");
  }
  assert.equal(await volumeComLimitador(admin, "evento", "func-1"), false);
  assert.equal(await volumeComLimitador(admin, "evento", "func-2"), true);
});

test("dentroDoVolume: evento e progresso têm contadores separados, e nenhum é o do login ou da senha", async () => {
  const escopos = Object.values(VOLUME_POR_ACAO).map((v) => v.escopo);
  assert.equal(new Set(escopos).size, escopos.length, "cada ação tem o seu escopo");
  for (const e of escopos) {
    assert.notEqual(e, ESCOPO_RECONFIRMAR_SENHA);
    assert.notEqual(e, "funcionario-login");
    assert.notEqual(e, "portal-duvida");
  }
  const admin = limitadorFalso();
  for (let i = 0; i <= VOLUME_POR_ACAO.evento.max; i++) {
    await volumeComLimitador(admin, "evento", "func-1");
  }
  assert.equal(await volumeComLimitador(admin, "evento", "func-1"), false);
  assert.equal(await volumeComLimitador(admin, "progresso", "func-1"), true);
  // estourar o volume também não gasta as tentativas de senha
  assert.equal(await reconfirmarComLimitador(admin, "func-1", true), "ok");
});

test("dentroDoVolume: limitador fora do ar não derruba o portal (como no login)", async () => {
  const admin = limitadorFalso(true);
  const erroOriginal = console.error;
  console.error = () => {};
  try {
    assert.equal(await volumeComLimitador(admin, "progresso", "func-1"), true);
    assert.equal(await volumeComLimitador(admin, "evento", "func-1"), true);
  } finally {
    console.error = erroOriginal;
  }
});

// ------------- T31 (acompanhamento): trocar de aula não pode ser travado pelo teto do play
test("acaoDeVolumeDoEvento: abrir_aula e play/pausa têm teto próprio; o resto fica no teto geral", () => {
  assert.equal(acaoDeVolumeDoEvento("abrir_aula"), "abrir_aula");
  assert.equal(acaoDeVolumeDoEvento("play"), "player");
  assert.equal(acaoDeVolumeDoEvento("pausa"), "player");
  for (const nome of [
    "abrir_curso",
    "fim_video",
    "aba_oculta",
    "aba_visivel",
    "avaliacao_inicio",
    "abrir_projeto",
    "abrir_certificado",
  ]) {
    assert.equal(acaoDeVolumeDoEvento(nome), "evento", nome);
  }
});

test("acaoDeVolumeDoEvento: nome desconhecido, vazio ou que não é texto cai no teto geral", () => {
  for (const nome of ["", "login", "PLAY", " play", undefined, null, 7, {}]) {
    assert.equal(acaoDeVolumeDoEvento(nome), "evento", String(nome));
  }
});

test("play repetido (YouTube: BUFFERING→PLAYING) esgota só o teto do player, nunca o de abrir_aula", async () => {
  const admin = limitadorFalso();
  // internet ruim de obra: muito mais play/pausa do que o normal, até estourar o teto do player
  for (let i = 0; i < VOLUME_POR_ACAO.player.max; i++) {
    assert.equal(await volumeComLimitador(admin, acaoDeVolumeDoEvento("play"), "func-1"), true);
  }
  assert.equal(await volumeComLimitador(admin, acaoDeVolumeDoEvento("play"), "func-1"), false);
  // o aluno continua conseguindo trocar de aula (e registrar o resto da navegação)
  assert.equal(await volumeComLimitador(admin, acaoDeVolumeDoEvento("abrir_aula"), "func-1"), true);
  assert.equal(
    await volumeComLimitador(admin, acaoDeVolumeDoEvento("abrir_curso"), "func-1"),
    true
  );
  assert.equal(await volumeComLimitador(admin, acaoDeVolumeDoEvento("aba_oculta"), "func-1"), true);
});

test("o teto geral de evento esgotado também não trava a troca de aula nem o play", async () => {
  const admin = limitadorFalso();
  for (let i = 0; i <= VOLUME_POR_ACAO.evento.max; i++) {
    await volumeComLimitador(admin, acaoDeVolumeDoEvento("aba_visivel"), "func-1");
  }
  assert.equal(
    await volumeComLimitador(admin, acaoDeVolumeDoEvento("aba_visivel"), "func-1"),
    false
  );
  assert.equal(await volumeComLimitador(admin, acaoDeVolumeDoEvento("abrir_aula"), "func-1"), true);
  assert.equal(await volumeComLimitador(admin, acaoDeVolumeDoEvento("play"), "func-1"), true);
});

test("abrir_aula ainda tem teto (a trilha é só de inclusão): passou, 429, e só para quem passou", async () => {
  const admin = limitadorFalso();
  for (let i = 0; i < VOLUME_POR_ACAO.abrir_aula.max; i++) {
    assert.equal(await volumeComLimitador(admin, "abrir_aula", "func-1"), true);
  }
  assert.equal(await volumeComLimitador(admin, "abrir_aula", "func-1"), false);
  // e o teto de um funcionário não vale para outro
  assert.equal(await volumeComLimitador(admin, "abrir_aula", "func-2"), true);
});

test("VOLUME_POR_ACAO: os tetos de abrir_aula e do player têm folga sobre o pior caso plausível", () => {
  const { abrir_aula, player, evento } = VOLUME_POR_ACAO;
  const janela = player.janelaSeg;
  assert.equal(abrir_aula.janelaSeg, janela);
  assert.equal(evento.janelaSeg, janela);
  // trocar de aula: uma a cada 6 s, sem parar, durante 10 min (um aluno que anda pela lista)
  assert.ok(abrir_aula.max >= janela / 6, "abrir_aula");
  // internet ruim: cada travada do vídeo vira um par pausa/play; um par a cada 5 s por 10 min
  assert.ok(player.max >= (janela / 5) * 2, "player");
  // mas nenhum fica aberto a ponto de não limitar nada
  assert.ok(abrir_aula.max <= 300);
  assert.ok(player.max <= 600);
});

test("VOLUME_POR_ACAO: o teto deixa folga sobre o ritmo do portal (sinal a cada 10 s)", () => {
  const { progresso, evento } = VOLUME_POR_ACAO;
  // o front manda o progresso a cada 10 s com a aula tocando; duas abas abertas dobram o ritmo
  const sinaisNormais = Math.ceil(progresso.janelaSeg / 10);
  assert.ok(progresso.max >= sinaisNormais * 2, "progresso precisa de folga para duas abas");
  // play, pausa, aba oculta/visível e abrir aula: dezenas por 10 min já é uso intenso
  assert.ok(evento.max >= 100);
  // mas o teto não pode ser aberto a ponto de não limitar nada (a trilha é só de inclusão)
  assert.ok(progresso.max <= sinaisNormais * 6);
  assert.ok(evento.max <= 600);
  assert.ok(MSG_MUITAS_ACOES.length > 0);
});

// --------------------------------- trava otimista em ultimo_sinal_em (T31)
type Filtro = [string, string, unknown];

/** Consulta falsa do supabase-js: só anota os filtros que a trava aplica. */
function consultaFalsa() {
  const filtros: Filtro[] = [];
  const consulta = {
    filtros,
    eq(coluna: string, valor: unknown) {
      filtros.push(["eq", coluna, valor]);
      return consulta;
    },
    is(coluna: string, valor: null) {
      filtros.push(["is", coluna, valor]);
      return consulta;
    },
  };
  return consulta;
}

test("travaDoSinal: com sinal anterior, só atualiza se o valor lido continua o mesmo", () => {
  const c = travaDoSinal(consultaFalsa(), "2026-10-06T10:00:00.123+00:00");
  assert.deepEqual(c.filtros, [["eq", "ultimo_sinal_em", "2026-10-06T10:00:00.123+00:00"]]);
});

test("travaDoSinal: sem sinal anterior (null, undefined), só atualiza se ainda não há sinal", () => {
  for (const lido of [null, undefined]) {
    const c = travaDoSinal(consultaFalsa(), lido);
    assert.deepEqual(c.filtros, [["is", "ultimo_sinal_em", null]], String(lido));
  }
});

test("travaDoSinal: devolve a própria consulta, para o chamador seguir a cadeia (.select)", () => {
  const base = consultaFalsa();
  assert.equal(travaDoSinal(base, "2026-10-06T10:00:00+00:00"), base);
  assert.equal(travaDoSinal(base, null), base);
});

/**
 * A linha de funcionario_portal_acesso como o banco a trata: o UPDATE confere os filtros no momento
 * em que roda (cada chamada vê o que a anterior gravou), como a trava de linha do Postgres.
 */
function acessoFalso(inicial: string | null) {
  const linha: Record<string, unknown> = { funcionario_id: "func-1", ultimo_sinal_em: inicial };
  return {
    linha,
    atualizar(novo: string) {
      const filtros: Filtro[] = [];
      const consulta = {
        eq(coluna: string, valor: unknown) {
          filtros.push(["eq", coluna, valor]);
          return consulta;
        },
        is(coluna: string, valor: null) {
          filtros.push(["is", coluna, valor]);
          return consulta;
        },
        async select(_colunas?: string) {
          if (!filtros.every(([, coluna, valor]) => linha[coluna] === valor)) {
            return { data: [] as unknown[], error: null };
          }
          linha.ultimo_sinal_em = novo;
          return { data: [{ funcionario_id: linha.funcionario_id }], error: null };
        },
      };
      return consulta.eq("funcionario_id", "func-1");
    },
  };
}

test("trava do sinal: de dois progressos que leram o mesmo sinal, só o primeiro grava", async () => {
  const lido = "2026-10-06T10:00:00.000+00:00";
  const banco = acessoFalso(lido);
  const a = await travaDoSinal(banco.atualizar("2026-10-06T10:00:10.000Z"), lido).select();
  const b = await travaDoSinal(banco.atualizar("2026-10-06T10:00:10.050Z"), lido).select();
  assert.equal(resultadoDoSinal({ erro: a.error, linhas: a.data.length }), "gravado");
  assert.equal(resultadoDoSinal({ erro: b.error, linhas: b.data.length }), "mudou");
  assert.equal(banco.linha.ultimo_sinal_em, "2026-10-06T10:00:10.000Z"); // o segundo não sobrescreve
});

test("trava do sinal: a primeira vez (sem sinal) também só deixa um gravar", async () => {
  const banco = acessoFalso(null);
  const a = await travaDoSinal(banco.atualizar("2026-10-06T10:00:10.000Z"), null).select();
  const b = await travaDoSinal(banco.atualizar("2026-10-06T10:00:10.050Z"), null).select();
  assert.equal(a.data.length, 1);
  assert.equal(b.data.length, 0);
});

test("trava do sinal: pedidos em sequência (cada um lê o sinal que o anterior gravou) passam", async () => {
  const banco = acessoFalso("2026-10-06T10:00:00.000Z");
  for (const novo of ["2026-10-06T10:00:10.000Z", "2026-10-06T10:00:20.000Z"]) {
    const lido = banco.linha.ultimo_sinal_em as string;
    const r = await travaDoSinal(banco.atualizar(novo), lido).select();
    assert.equal(resultadoDoSinal({ erro: r.error, linhas: r.data.length }), "gravado", novo);
  }
});

test("resultadoDoSinal: uma linha = gravado; nenhuma = outro pedido chegou antes; erro = falhou", () => {
  assert.equal(resultadoDoSinal({ erro: null, linhas: 1 }), "gravado");
  assert.equal(resultadoDoSinal({ erro: null, linhas: 0 }), "mudou");
  assert.equal(resultadoDoSinal({ erro: null, linhas: null }), "mudou");
  assert.equal(resultadoDoSinal({ erro: { message: "x" }, linhas: 0 }), "erro");
  assert.equal(resultadoDoSinal({ erro: { message: "x" }, linhas: 1 }), "erro");
  assert.ok(MSG_SINAL_CONCORRENTE.length > 0);
});
