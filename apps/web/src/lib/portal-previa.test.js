import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import {
  ID_MATRICULA_PREVIA,
  refsDaPrevia,
  montarItemPrevia,
  corrigirPrevia,
  sortearPrevia,
  criarApiPrevia,
} from "./portal-previa";
import { provaParaTela } from "./portal-curso";
import { MAX_DEDICACAO_MIN, MAX_PRAZO_DIAS } from "./ead-projeto";

// dados sintéticos: nada de produção
const curso = {
  id: "curso-1",
  nome: "NR-35 Trabalho em altura",
  codigo: "NR35",
  descricao: "Curso de teste",
  carga_horaria_horas: 8,
  nota_minima: 70,
  max_tentativas: 3,
  projeto_pedagogico_ref: "treinamentos/emp/projeto.pdf",
  ativo: false,
};

const aulas = [
  {
    id: "a2",
    ordem: 2,
    modulo: "Módulo B",
    tipo: "pdf",
    titulo: "Apostila",
    fonte: "upload",
    arquivo_ref: "treinamentos/emp/apostila.pdf",
    video_ref: "treinamentos/emp/lixo.mp4",
    duracao_seg: 300,
  },
  {
    id: "a1",
    ordem: 1,
    modulo: "Módulo A",
    tipo: "video",
    titulo: "Abertura",
    fonte: "upload",
    video_ref: "treinamentos/emp/abertura.mp4",
    legenda_ref: "treinamentos/emp/abertura.vtt",
    duracao_seg: 600,
  },
  {
    id: "a3",
    ordem: 3,
    modulo: null,
    tipo: "video",
    titulo: "Vídeo do YouTube",
    fonte: "youtube",
    youtube_id: "abc123",
    video_ref: "treinamentos/emp/nao-deve-assinar.mp4",
    duracao_seg: null,
  },
  {
    id: "a4",
    ordem: 4,
    tipo: "texto",
    titulo: "Leitura",
    conteudo_texto: "Texto da aula",
    arquivo_ref: "treinamentos/emp/nao-deve-assinar.pdf",
    duracao_seg: null,
  },
];

const questoes = [
  {
    id: "q2",
    ordem: 2,
    pergunta: "Segunda?",
    opcoes: ["a", "b", "c"],
    correta: 2,
    comentario: null,
  },
  {
    id: "q1",
    ordem: 1,
    pergunta: "Primeira?",
    opcoes: ["a", "b"],
    correta: 0,
    comentario: "Porque sim",
  },
];

const urls = {
  "treinamentos/emp/projeto.pdf": "https://sig/projeto",
  "treinamentos/emp/apostila.pdf": "https://sig/apostila",
  "treinamentos/emp/abertura.mp4": "https://sig/abertura",
  "treinamentos/emp/abertura.vtt": "https://sig/legenda",
};

afterEach(() => vi.unstubAllGlobals());

describe("os limites do prazo e da dedicação são os da regra do projeto (A6, T25 R6)", () => {
  it("o máximo vale, o máximo mais um vira null (sem número repetido na prévia)", () => {
    const item = (extra) =>
      montarItemPrevia({ curso: { ...curso, ...extra }, aulas, questoes }).curso;
    expect(item({ prazo_conclusao_dias: MAX_PRAZO_DIAS }).prazo_conclusao_dias).toBe(
      MAX_PRAZO_DIAS
    );
    expect(item({ prazo_conclusao_dias: MAX_PRAZO_DIAS + 1 }).prazo_conclusao_dias).toBeNull();
    expect(item({ dedicacao_diaria_min: MAX_DEDICACAO_MIN }).dedicacao_diaria_min).toBe(
      MAX_DEDICACAO_MIN
    );
    expect(item({ dedicacao_diaria_min: MAX_DEDICACAO_MIN + 1 }).dedicacao_diaria_min).toBeNull();
  });

  it("a prévia não repete os números 3650 e 1440 (importa as constantes da regra)", () => {
    const fonte = readFileSync(new URL("./portal-previa.js", import.meta.url), "utf8");
    expect(fonte).not.toMatch(/\b3650\b|\b1440\b/);
    expect(fonte).toMatch(/MAX_PRAZO_DIAS/);
    expect(fonte).toMatch(/MAX_DEDICACAO_MIN/);
  });
});

describe("refsDaPrevia", () => {
  it("lista só as referências que o portal assinaria, sem repetir", () => {
    const refs = refsDaPrevia({
      curso,
      aulas: [...aulas, { ...aulas[1], id: "a5", ordem: 5 }],
    });
    expect(refs.sort()).toEqual(
      [
        "treinamentos/emp/abertura.mp4",
        "treinamentos/emp/abertura.vtt",
        "treinamentos/emp/apostila.pdf",
        "treinamentos/emp/projeto.pdf",
      ].sort()
    );
  });

  it("não quebra sem curso nem aulas", () => {
    expect(refsDaPrevia({})).toEqual([]);
    expect(refsDaPrevia({ curso: null, aulas: null })).toEqual([]);
  });
});

describe("montarItemPrevia", () => {
  const item = montarItemPrevia({ curso, aulas, questoes, urls });

  it("monta a matrícula de prévia, que nunca existe no banco", () => {
    expect(item.matricula).toMatchObject({
      id: ID_MATRICULA_PREVIA,
      curso_id: "curso-1",
      status: "em_andamento",
      avaliacao_aprovada: false,
    });
    expect(item.certificado).toBeNull();
    expect(item.pode_emitir_certificado).toBe(false);
    expect(item.duvidas).toEqual([]);
  });

  it("leva o nome e o atendimento do tutor, como o servidor devolve em `dados` (T21), e nunca o telefone", () => {
    expect(item.curso.tutor_nome).toBeNull();
    expect(item.curso.tutor_atendimento).toBeNull();
    const comTutor = montarItemPrevia({
      curso: {
        ...curso,
        tutor_nome: "Tutor Teste",
        tutor_atendimento: "Dias úteis, 8h às 17h",
        tutor_telefone: "(11) 99999-0000",
      },
      aulas,
      questoes,
    });
    expect(comTutor.curso.tutor_nome).toBe("Tutor Teste");
    expect(comTutor.curso.tutor_atendimento).toBe("Dias úteis, 8h às 17h");
    expect("tutor_telefone" in comTutor.curso).toBe(false);
    expect(JSON.stringify(comTutor)).not.toContain("99999");
  });

  it("leva o prazo e a dedicação diária do projeto (T25), como o servidor devolve em `dados`, e nunca o texto do projeto", () => {
    expect(item.curso.prazo_conclusao_dias).toBeNull();
    expect(item.curso.dedicacao_diaria_min).toBeNull();
    const comProjeto = montarItemPrevia({
      curso: {
        ...curso,
        prazo_conclusao_dias: 30,
        dedicacao_diaria_min: "45",
        objetivo_geral: "Texto do objetivo de teste",
        projeto_validado_por: "RT Teste",
      },
      aulas,
      questoes,
    });
    expect(comProjeto.curso.prazo_conclusao_dias).toBe(30);
    expect(comProjeto.curso.dedicacao_diaria_min).toBe(45);
    expect(JSON.stringify(comProjeto)).not.toContain("Texto do objetivo de teste");
    expect(JSON.stringify(comProjeto)).not.toContain("RT Teste");
    // valor fora do que o banco aceita não chega à tela
    const ruim = montarItemPrevia({
      curso: { ...curso, prazo_conclusao_dias: 0, dedicacao_diaria_min: 1441 },
      aulas,
      questoes,
    });
    expect(ruim.curso.prazo_conclusao_dias).toBeNull();
    expect(ruim.curso.dedicacao_diaria_min).toBeNull();
  });

  it("leva a modalidade do curso (ausente = EAD), como o servidor devolve em `dados`", () => {
    expect(item.curso.modalidade).toBe("ead");
    const apoio = montarItemPrevia({ curso: { ...curso, modalidade: "apoio" }, aulas, questoes });
    expect(apoio.curso.modalidade).toBe("apoio");
    expect(apoio.pode_emitir_certificado).toBe(false);
  });

  it("libera todas as aulas, nenhuma concluída, na ordem do curso", () => {
    expect(item.aulas.map((a) => a.id)).toEqual(["a1", "a2", "a3", "a4"]);
    expect(item.aulas.every((a) => a.liberada === true)).toBe(true);
    expect(item.aulas.every((a) => a.concluida === false)).toBe(true);
    expect(item.aulas.every((a) => a.segundos_assistidos === 0)).toBe(true);
  });

  it("usa as URLs já resolvidas pela tela, só onde o portal usaria", () => {
    const [video, pdf, youtube, texto] = item.aulas;
    expect(video.video_url).toBe("https://sig/abertura");
    expect(video.legenda_url).toBe("https://sig/legenda");
    expect(video.arquivo_url).toBeNull();
    expect(pdf.arquivo_url).toBe("https://sig/apostila");
    expect(pdf.video_url).toBeNull();
    expect(youtube.video_url).toBeNull();
    expect(youtube.youtube_id).toBe("abc123");
    expect(texto.arquivo_url).toBeNull();
    expect(texto.conteudo_texto).toBe("Texto da aula");
    expect(item.curso.projeto_pedagogico_url).toBe("https://sig/projeto");
  });

  it("referência sem URL resolvida vira null (o player mostra 'arquivo indisponível')", () => {
    const sem = montarItemPrevia({ curso, aulas, questoes, urls: {} });
    expect(sem.aulas[0].video_url).toBeNull();
    expect(sem.curso.projeto_pedagogico_url).toBeNull();
  });

  it("aceita as URLs num Map", () => {
    const comMap = montarItemPrevia({
      curso,
      aulas,
      questoes,
      urls: new Map(Object.entries(urls)),
    });
    expect(comMap.aulas[0].video_url).toBe("https://sig/abertura");
  });

  it("repete a regra do servidor para duração e fonte padrão", () => {
    const [video, pdf, youtube, texto] = item.aulas;
    expect(video.duracao_seg).toBe(600);
    expect(pdf.duracao_seg).toBe(300);
    expect(youtube.duracao_seg).toBeNull(); // vídeo sem duração: a tela avisa o RT
    expect(texto.duracao_seg).toBe(60); // leitura sem tempo definido
    expect(texto.fonte).toBe("youtube"); // como o servidor: fonte ausente = youtube
  });

  it("leva as questões COM gabarito e comentário (só o RT vê), na ordem", () => {
    expect(item.questoes.map((q) => q.id)).toEqual(["q1", "q2"]);
    expect(item.questoes[0]).toMatchObject({ correta: 0, comentario: "Porque sim" });
    expect(item.questoes[1].opcoes).toEqual(["a", "b", "c"]);
    expect(item.curso.tem_avaliacao).toBe(true);
    expect(item.avaliacao.total_questoes).toBe(2);
  });

  it("opções vindas como texto JSON (legado) ou inválidas não quebram", () => {
    const r = montarItemPrevia({
      curso,
      aulas: [],
      questoes: [
        { id: "x", ordem: 1, pergunta: "?", opcoes: '["um","dois"]', correta: 1 },
        { id: "y", ordem: 2, pergunta: "?", opcoes: "não é json", correta: 0 },
        { id: "z", ordem: 3, pergunta: "?", opcoes: null, correta: 0 },
      ],
      urls: {},
    });
    expect(r.questoes.map((q) => q.opcoes)).toEqual([["um", "dois"], [], []]);
  });

  it("curso sem questões não tem avaliação; sem aulas fica com lista vazia", () => {
    const r = montarItemPrevia({ curso, aulas: undefined, questoes: undefined, urls: {} });
    expect(r.aulas).toEqual([]);
    expect(r.questoes).toEqual([]);
    expect(r.curso.tem_avaliacao).toBe(false);
  });

  it("a prévia nunca mostra o selo de curso despublicado nem esgota tentativas", () => {
    expect(item.curso.ativo).toBe(true);
    expect(item.avaliacao).toEqual({
      total_questoes: 2,
      tentativas_usadas: 0,
      tentativas_max: 3,
      limite_atingido: false,
      proxima_em: null,
      nota_minima: 70,
    });
  });

  it("nota mínima do formulário (texto) e limite zero = sem limite", () => {
    const r = montarItemPrevia({
      curso: { ...curso, nota_minima: "85", max_tentativas: 0 },
      aulas: [],
      questoes,
      urls: {},
    });
    expect(r.avaliacao.nota_minima).toBe(85);
    expect(r.avaliacao.tentativas_max).toBeNull();
    const padrao = montarItemPrevia({
      curso: { id: "c", nome: "x" },
      aulas: [],
      questoes,
      urls: {},
    });
    expect(padrao.avaliacao.nota_minima).toBe(70);
  });

  it("nota mínima 0 vale 0, como no servidor (`nota_minima ?? 70`); só ausente ou vazia vira 70", () => {
    const nota = (valor) =>
      montarItemPrevia({
        curso: { id: "c", nome: "x", nota_minima: valor },
        aulas: [],
        questoes,
        urls: {},
      }).avaliacao.nota_minima;
    expect(nota(0)).toBe(0);
    expect(nota("0")).toBe(0);
    expect(nota(100)).toBe(100);
    for (const ausente of [null, undefined, "", "  "]) expect(nota(ausente)).toBe(70);
  });

  it("não altera o que recebeu", () => {
    const antes = JSON.stringify({ curso, aulas, questoes });
    montarItemPrevia({ curso, aulas, questoes, urls });
    expect(JSON.stringify({ curso, aulas, questoes })).toBe(antes);
  });
});

describe("sortearPrevia (o sorteio da prova na prévia)", () => {
  it("devolve cada questão uma vez, com as alternativas embaralhadas e o mapa de volta", () => {
    for (let i = 0; i < 100; i++) {
      const sorteada = sortearPrevia(questoes);
      expect(sorteada.map((q) => q.id).sort()).toEqual(["q1", "q2"]);
      for (const q of sorteada) {
        const original = questoes.find((o) => o.id === q.id);
        expect([...q.ordem_opcoes].sort()).toEqual(original.opcoes.map((_, k) => k));
        expect(q.opcoes).toEqual(q.ordem_opcoes.map((k) => original.opcoes[k]));
        // a alternativa certa é pelo índice ORIGINAL, que não muda com o sorteio
        expect(q.correta).toBe(original.correta);
        expect(q.comentario).toBe(original.comentario ?? null);
      }
    }
  });

  it("com sorteio que sempre devolve 0 a ordem gira uma casa (igual ao servidor)", () => {
    const sorteada = sortearPrevia(questoes, () => 0);
    // as questões vieram [q2, q1]: com duas questões, girar uma casa as inverte
    expect(sorteada.map((q) => q.id)).toEqual(["q1", "q2"]);
    expect(sorteada[0].ordem_opcoes).toEqual([1, 0]); // q1 tem 2 alternativas
    expect(sorteada[1].ordem_opcoes).toEqual([1, 2, 0]); // q2 tem 3
  });

  it("sorteio que sempre devolve o último mantém a ordem original", () => {
    const sorteada = sortearPrevia(questoes, (n) => n - 1);
    expect(sorteada.map((q) => q.id)).toEqual(["q2", "q1"]); // a ordem em que vieram
    expect(sorteada[0].ordem_opcoes).toEqual([0, 1, 2]);
  });

  it("usa o sorteio do navegador quando não recebe outro, sem alterar o que recebeu", () => {
    const copia = JSON.parse(JSON.stringify(questoes));
    const sorteio = vi.spyOn(Math, "random").mockReturnValue(0);
    const sorteada = sortearPrevia(questoes);
    sorteio.mockRestore();
    expect(sorteada).toHaveLength(2);
    expect(questoes).toEqual(copia);
  });

  it("alternativas em texto JSON (legado), inválidas ou sem questões não quebram", () => {
    const r = sortearPrevia(
      [
        { id: "x", pergunta: "?", opcoes: JSON.stringify(["um", "dois"]), correta: 1 },
        { id: "y", pergunta: "?", opcoes: "não é json", correta: 0 },
      ],
      () => 0
    );
    expect(r.find((q) => q.id === "x").opcoes).toEqual(["dois", "um"]);
    expect(r.find((q) => q.id === "y").opcoes).toEqual([]);
    expect(sortearPrevia(undefined)).toEqual([]);
    expect(sortearPrevia(null, () => 0)).toEqual([]);
  });
});

describe("corrigirPrevia", () => {
  const prova = [
    { id: "q1", correta: 0 },
    { id: "q2", correta: 2 },
    { id: "q3", correta: 1 },
    { id: "q4", correta: 1 },
  ];

  it("conta acertos, arredonda a nota e compara com a mínima", () => {
    const r = corrigirPrevia({
      questoes: prova,
      respostas: [
        { questao_id: "q1", resposta: 0 },
        { questao_id: "q2", resposta: 2 },
        { questao_id: "q3", resposta: 0 },
      ],
      notaMinima: 50,
    });
    expect(r).toMatchObject({ acertos: 2, total: 4, nota: 50, minima: 50, aprovada: true });
    expect(r.acertou(prova[0])).toBe(true);
    expect(r.acertou(prova[3])).toBe(false); // sem resposta erra
  });

  it("reprova abaixo da mínima, aceita índice como texto e ignora questão estranha", () => {
    const r = corrigirPrevia({
      questoes: prova,
      respostas: [
        { questao_id: "q1", resposta: "0" },
        { questao_id: "fora", resposta: 0 },
      ],
      notaMinima: 70,
    });
    expect(r).toMatchObject({ acertos: 1, nota: 25, aprovada: false });
  });

  it("nota mínima 0 vale 0: até quem errou tudo passa, como no servidor", () => {
    const r = corrigirPrevia({ questoes: prova, respostas: [], notaMinima: 0 });
    expect(r).toMatchObject({ nota: 0, minima: 0, aprovada: true });
    expect(corrigirPrevia({ questoes: prova, respostas: [], notaMinima: "0" }).minima).toBe(0);
    expect(corrigirPrevia({ questoes: prova, respostas: [], notaMinima: "" }).minima).toBe(70);
    expect(corrigirPrevia({ questoes: prova, respostas: [], notaMinima: null }).minima).toBe(70);
  });

  it("nota mínima ausente vale 70; prova vazia não vira NaN", () => {
    expect(corrigirPrevia({ questoes: prova, respostas: [] }).minima).toBe(70);
    const vazia = corrigirPrevia({ questoes: [], respostas: [] });
    expect(vazia).toMatchObject({ total: 0, acertos: 0, nota: 0, aprovada: false });
  });
});

describe("criarApiPrevia", () => {
  const item = montarItemPrevia({ curso, aulas, questoes, urls });

  it("é marcada como prévia (os componentes mudam o que mostram)", () => {
    expect(criarApiPrevia({ item }).previa).toBe(true);
  });

  it("nenhuma ação toca a rede: nem fetch, nem XHR", async () => {
    const fetchEspiao = vi.fn();
    vi.stubGlobal("fetch", fetchEspiao);
    const xhrEspiao = vi.fn();
    vi.stubGlobal("XMLHttpRequest", xhrEspiao);
    const api = criarApiPrevia({ item });
    const acoes = [
      "evento",
      "progresso",
      "iniciar_avaliacao",
      "avaliacao",
      "questionario_abrir",
      "questionario_enviar",
      "caso_abrir",
      "caso_escolher",
      "caso_concluir",
      "duvida",
      "certificado",
      "ciencia",
      "dados",
      "login",
      "qualquer_outra",
    ];
    for (const acao of acoes) {
      await api
        .chamarPortal(acao, { matricula_id: ID_MATRICULA_PREVIA, respostas: [] }, "token")
        .catch(() => {});
    }
    expect(fetchEspiao).not.toHaveBeenCalled();
    expect(xhrEspiao).not.toHaveBeenCalled();
  });

  it("evento é aceito e descartado", async () => {
    const api = criarApiPrevia({ item });
    await expect(
      api.chamarPortal("evento", { evento: "play", matricula_id: ID_MATRICULA_PREVIA })
    ).resolves.toMatchObject({ success: true });
  });

  it("progresso devolve o que recebeu e nunca conclui a aula", async () => {
    const api = criarApiPrevia({ item });
    const r = await api.chamarPortal("progresso", {
      aula_id: "a1",
      segundos_assistidos: 42,
      concluir: true,
    });
    expect(r).toMatchObject({ segundos_assistidos: 42, aula_concluida: false });
  });

  it("a prova é corrigida aqui, na hora, com o gabarito do item", async () => {
    const api = criarApiPrevia({ item });
    const r = await api.chamarPortal("avaliacao", {
      matricula_id: ID_MATRICULA_PREVIA,
      respostas: [
        { questao_id: "q1", resposta: 0 },
        { questao_id: "q2", resposta: 2 },
      ],
    });
    expect(r).toMatchObject({
      nota: 100,
      nota_minima: 70,
      aprovada: true,
      acertos: 2,
      total: 2,
      tentativa: 1,
      tentativas_max: 3,
      proxima_em: null,
      curso_concluido: false,
    });
    expect(r.revisao).toEqual([
      { questao_id: "q1", acertou: true, resposta_correta: "a", comentario: "Porque sim" },
      { questao_id: "q2", acertou: true, resposta_correta: "c", comentario: null },
    ]);
  });

  it("curso com nota mínima 0: a API corrige com 0 (não troca por 70)", async () => {
    const semMinima = montarItemPrevia({
      curso: { ...curso, nota_minima: 0 },
      aulas,
      questoes,
      urls,
    });
    const api = criarApiPrevia({ item: semMinima });
    const r = await api.chamarPortal("avaliacao", { respostas: [] });
    expect(r).toMatchObject({ nota: 0, nota_minima: 0, aprovada: true });
  });

  it("reprovado: sem espera, sem correção comentada e só 'insatisfatório', sem nota (D10: como o aluno vê)", async () => {
    const api = criarApiPrevia({ item });
    const r = await api.chamarPortal("avaliacao", {
      respostas: [
        { questao_id: "q1", resposta: 1 },
        { questao_id: "q2", resposta: 0 },
      ],
    });
    expect(r).toMatchObject({
      resultado: "insatisfatorio",
      aprovada: false,
      nota_minima: 70,
      tentativa: 1,
      proxima_em: null,
      revisao: null,
    });
    // REPROVADO_VE_NOTA = false (D10, 06/10/2026): nota, acertos e total deixariam deduzir o gabarito
    for (const chave of ["nota", "acertos", "total"]) expect(r).not.toHaveProperty(chave);
  });

  it("aprovado recebe nota, acertos e o conceito satisfatório", async () => {
    const api = criarApiPrevia({ item });
    const r = await api.chamarPortal("avaliacao", {
      respostas: [
        { questao_id: "q1", resposta: 0 },
        { questao_id: "q2", resposta: 2 },
      ],
    });
    expect(r).toMatchObject({ resultado: "satisfatorio", aprovada: true, nota: 100, acertos: 2 });
  });

  it("iniciar_avaliacao entrega a prova sorteada, no formato do servidor, com gabarito só para o RT", async () => {
    const api = criarApiPrevia({ item });
    const r = await api.chamarPortal("iniciar_avaliacao", { matricula_id: ID_MATRICULA_PREVIA });
    expect(r).toMatchObject({ success: true, tentativa: 1, tentativas_max: 3, nota_minima: 70 });
    expect(r.questoes.map((q) => q.id).sort()).toEqual(["q1", "q2"]);
    // a tela da prévia lê isso com provaParaTela({ previa: true }) e enxerga o gabarito
    const prova = provaParaTela(r, { previa: true });
    expect(prova).not.toBeNull();
    const q1 = prova.questoes.find((q) => q.id === "q1");
    expect(q1.correta).toBe(0);
    expect(q1.comentario).toBe("Porque sim");
    // o gabarito (índice original) aponta a mesma alternativa, onde ela cair na tela
    const certa = q1.exibicao.find((o) => o.indice === q1.correta);
    expect(certa.texto).toBe("a");
  });

  it("o que só existe com aluno de verdade falha com mensagem clara, sem código de sessão", async () => {
    const api = criarApiPrevia({ item });
    for (const acao of ["duvida", "certificado", "ciencia", "dados", "login", "outra"]) {
      const erro = await api.chamarPortal(acao, {}).catch((e) => e);
      expect(erro).toBeInstanceOf(Error);
      expect(erro.codigo).toBe("PREVIA");
      expect(erro.message).toMatch(/prévia/i);
    }
  });
});

describe("paridade da prévia com o servidor (A6)", () => {
  // `REPROVADO_VE_NOTA` existe em duas cópias (regras.ts e portal-previa.js): cada lado tem teste que fixa o
  // próprio valor, e este confere que os DOIS dizem a mesma coisa, para a prévia do RT nunca mostrar ao
  // reprovado o que o aluno de verdade não vê (nem o contrário).
  const valorDe = (texto, onde) => {
    const m = /\bREPROVADO_VE_NOTA(?::\s*boolean)?\s*=\s*(true|false)\b/.exec(texto);
    if (!m) throw new Error(`REPROVADO_VE_NOTA não encontrado em ${onde}`);
    return m[1] === "true";
  };
  const previa = readFileSync(new URL("./portal-previa.js", import.meta.url), "utf8");
  const servidor = readFileSync(
    new URL("../../../../supabase/functions/portal-funcionario/regras.ts", import.meta.url),
    "utf8"
  );

  it("REPROVADO_VE_NOTA vale o mesmo em regras.ts e em portal-previa.js", () => {
    expect(valorDe(previa, "portal-previa.js")).toBe(valorDe(servidor, "regras.ts"));
  });

  it("o leitor da constante não passa em branco: texto sem a constante falha, e troca de valor aparece", () => {
    expect(() => valorDe("const OUTRA = true;", "teste")).toThrow(/não encontrado/);
    expect(valorDe("export const REPROVADO_VE_NOTA = true;", "teste")).toBe(true);
    expect(valorDe("const REPROVADO_VE_NOTA = false;", "teste")).toBe(false);
    expect(valorDe("export const REPROVADO_VE_NOTA: boolean = true;", "teste")).toBe(true);
  });
});

describe("atividades dos módulos na prévia (questionário, caso e tarefa)", () => {
  // roteiro sintético (nenhum texto do material do curso): e1 -> e2 -> fim; a insegura de e1 vai à recuperação r1
  const roteiro = {
    contexto: "Situação sintética: um quadro de teste precisa de manutenção.",
    etapas: [
      {
        id: "e1",
        pergunta: "Primeira decisão?",
        opcoes: [
          {
            texto: "Testar a ausência de tensão",
            comentario: "Certo: teste antes.",
            segura: true,
            proxima: "e2",
          },
          {
            texto: "Ligar sem testar",
            comentario: "Arriscado: teste antes.",
            segura: false,
            proxima: "r1",
          },
        ],
      },
      {
        id: "r1",
        pergunta: "O que fazer agora?",
        opcoes: [
          {
            texto: "Voltar e testar",
            comentario: "Isso: volte e teste.",
            segura: true,
            proxima: "e1",
          },
          {
            texto: "Seguir assim mesmo",
            comentario: "Ainda arriscado.",
            segura: false,
            proxima: "r1",
          },
        ],
      },
      {
        id: "e2",
        pergunta: "Como liberar o quadro?",
        opcoes: [
          {
            texto: "Liberar com tudo conferido",
            comentario: "Fim seguro.",
            segura: true,
            proxima: null,
          },
          {
            texto: "Liberar sem avisar a equipe",
            comentario: "Avise sempre.",
            segura: false,
            proxima: "e2",
          },
        ],
      },
    ],
    reflexao: "Reflexão sintética: o teste vem antes do toque.",
  };
  const aulasAtividades = [
    {
      id: "t1",
      ordem: 1,
      tipo: "tarefa",
      titulo: "Tarefa",
      conteudo_texto: "Instruções sintéticas",
      duracao_seg: 2100,
    },
    {
      id: "qz",
      ordem: 2,
      tipo: "questionario",
      titulo: "Questionário do módulo",
      conteudo_texto: "não vai",
      duracao_seg: 900,
    },
    { id: "cs", ordem: 3, tipo: "caso", titulo: "Caso 1", duracao_seg: 600 },
    { id: "cv", ordem: 4, tipo: "caso", titulo: "Caso com roteiro apagado", duracao_seg: 600 },
    { id: "qv", ordem: 5, tipo: "questionario", titulo: "Questionário vazio", duracao_seg: 900 },
  ];
  const questoesDoModulo = Array.from({ length: 8 }, (_, i) => ({
    id: `m${i + 1}`,
    aula_id: "qz",
    ordem: i + 1,
    pergunta: `Questão sintética ${i + 1}?`,
    opcoes: ["certa", "errada", "outra"],
    correta: 0,
    comentario: `Comentário ${i + 1}`,
  }));
  const montar = (extra = {}) =>
    montarItemPrevia({
      curso: { ...curso, ...extra },
      aulas: aulasAtividades,
      questoes: [
        ...questoes,
        ...questoesDoModulo,
        { ...questoesDoModulo[0], id: "apagada", deleted_at: "2026-10-01T00:00:00Z" },
      ],
      casos: [
        { aula_id: "cs", conteudo: roteiro },
        { aula_id: "cv", conteudo: roteiro, deleted_at: "2026-10-01T00:00:00Z" },
      ],
      urls,
    });
  const respostasCom = (acertos) =>
    questoesDoModulo.map((q, i) => ({ questao_id: q.id, resposta: i < acertos ? 0 : 1 }));
  const indice = (etapa, texto) => etapa.opcoes.find((o) => o.texto === texto).indice;

  it("a prova final usa só as questões sem aula; as dos questionários e os roteiros ficam à parte", () => {
    const item = montar();
    expect(item.questoes.map((q) => q.id)).toEqual(["q1", "q2"]);
    expect(item.avaliacao.total_questoes).toBe(2);
    expect(item.curso.tem_avaliacao).toBe(true);
    expect(item.atividades_previa.questionarios.qz.map((q) => q.id)).toEqual(
      questoesDoModulo.map((q) => q.id)
    );
    expect(JSON.stringify(item.atividades_previa)).not.toContain("apagada");
    expect(Object.keys(item.atividades_previa.casos)).toEqual(["cs"]);
  });

  it("a tarefa leva o texto da aula; questionário e caso, não (vêm das ações próprias)", () => {
    const item = montar();
    expect(item.aulas.find((a) => a.id === "t1").conteudo_texto).toBe("Instruções sintéticas");
    expect(item.aulas.find((a) => a.id === "qz").conteudo_texto).toBeNull();
    expect(item.aulas.find((a) => a.id === "cs").conteudo_texto).toBeNull();
  });

  it("nota mínima dos questionários: a do curso (0 a 100), ou 80", () => {
    expect(montar().atividades_previa.nota_minima_modulo).toBe(80);
    expect(montar({ nota_minima_modulo: 70 }).atividades_previa.nota_minima_modulo).toBe(70);
    expect(montar({ nota_minima_modulo: "90" }).atividades_previa.nota_minima_modulo).toBe(90);
    expect(montar({ nota_minima_modulo: 0 }).atividades_previa.nota_minima_modulo).toBe(0);
    for (const ruim of [150, -1, "", "abc", 7.5, true]) {
      expect(montar({ nota_minima_modulo: ruim }).atividades_previa.nota_minima_modulo).toBe(80);
    }
  });

  it("questionario_abrir sorteia as questões da aula, com gabarito só para o RT", async () => {
    const api = criarApiPrevia({ item: montar() });
    const r = await api.chamarPortal("questionario_abrir", { aula_id: "qz" });
    expect(r).toMatchObject({ success: true, concluida: false, tentativa: 1, nota_minima: 80 });
    expect(r.questoes.map((q) => q.id).sort()).toEqual(questoesDoModulo.map((q) => q.id).sort());
    const prova = provaParaTela(r, { previa: true });
    expect(prova).not.toBeNull();
    const q = prova.questoes[0];
    expect(q.exibicao.find((o) => o.indice === q.correta).texto).toBe("certa");
  });

  it("6 de 8 não aprova (75%) e 7 de 8 aprova (88%); a correção comentada vem nos dois (A2) e nada conclui", async () => {
    const api = criarApiPrevia({ item: montar() });
    await api.chamarPortal("questionario_abrir", { aula_id: "qz" });
    const reprovado = await api.chamarPortal("questionario_enviar", {
      aula_id: "qz",
      respostas: respostasCom(6),
    });
    expect(reprovado).toMatchObject({
      resultado: "insatisfatorio",
      aprovada: false,
      nota: 75,
      acertos: 6,
      total: 8,
      nota_minima: 80,
      tentativa: 1,
      aula_concluida: false,
    });
    expect(reprovado.revisao).toHaveLength(8);
    expect(reprovado.revisao[7]).toEqual({
      questao_id: "m8",
      acertou: false,
      resposta_correta: "certa",
      comentario: "Comentário 8",
    });
    await api.chamarPortal("questionario_abrir", { aula_id: "qz" });
    const aprovado = await api.chamarPortal("questionario_enviar", {
      aula_id: "qz",
      respostas: respostasCom(7),
    });
    expect(aprovado).toMatchObject({
      resultado: "satisfatorio",
      aprovada: true,
      nota: 88,
      tentativa: 2,
      aula_concluida: false,
      curso_concluido: false,
    });
    expect(aprovado.revisao).toHaveLength(8);
  });

  it("tentativas livres: cada abertura depois de um envio é a tentativa seguinte", async () => {
    const api = criarApiPrevia({ item: montar() });
    expect((await api.chamarPortal("questionario_abrir", { aula_id: "qz" })).tentativa).toBe(1);
    expect((await api.chamarPortal("questionario_abrir", { aula_id: "qz" })).tentativa).toBe(1);
    await api.chamarPortal("questionario_enviar", { aula_id: "qz", respostas: respostasCom(0) });
    expect((await api.chamarPortal("questionario_abrir", { aula_id: "qz" })).tentativa).toBe(2);
  });

  it("questionário sem questões: QUESTIONARIO_VAZIO; aula de outro tipo: recusa", async () => {
    const api = criarApiPrevia({ item: montar() });
    const vazio = await api.chamarPortal("questionario_abrir", { aula_id: "qv" }).catch((e) => e);
    expect(vazio.codigo).toBe("QUESTIONARIO_VAZIO");
    expect(vazio.message).toMatch(/avise o RH/);
    const outro = await api.chamarPortal("questionario_abrir", { aula_id: "cs" }).catch((e) => e);
    expect(outro).toBeInstanceOf(Error);
    expect(outro.message).toMatch(/não é um questionário/);
    const alheia = await api.chamarPortal("questionario_abrir", { aula_id: "x" }).catch((e) => e);
    expect(alheia.message).toBe("Aula não pertence ao curso");
  });

  it("caso: etapa só com os textos; a insegura vai à recuperação e volta; a segura leva ao fim", async () => {
    const api = criarApiPrevia({ item: montar() });
    const abrir = () => api.chamarPortal("caso_abrir", { aula_id: "cs" });
    const escolher = (etapa_id, opcao) =>
      api.chamarPortal("caso_escolher", { aula_id: "cs", etapa_id, opcao });

    const inicio = await abrir();
    expect(inicio).toMatchObject({
      situacao: "etapa",
      contexto: roteiro.contexto,
      passagem: 1,
      ultimo: null,
    });
    expect(inicio.etapa.id).toBe("e1");
    for (const op of inicio.etapa.opcoes)
      expect(Object.keys(op).sort()).toEqual(["indice", "texto"]);

    const insegura = await escolher("e1", indice(inicio.etapa, "Ligar sem testar"));
    expect(insegura).toMatchObject({
      comentario: "Arriscado: teste antes.",
      segura: false,
      fim: false,
      passagem: 1,
      reflexao: null,
    });
    expect(insegura.etapa.id).toBe("r1");

    const volta = await escolher("r1", indice(insegura.etapa, "Voltar e testar"));
    expect(volta.etapa.id).toBe("e1");
    const retomado = await abrir();
    expect(retomado).toMatchObject({
      situacao: "etapa",
      passagem: 2,
      ultimo: { comentario: "Isso: volte e teste.", segura: true },
    });

    const segura = await escolher("e1", indice(retomado.etapa, "Testar a ausência de tensão"));
    expect(segura).toMatchObject({ segura: true, fim: false, passagem: 2 });
    const fim = await escolher("e2", indice(segura.etapa, "Liberar com tudo conferido"));
    expect(fim).toMatchObject({ segura: true, fim: true, etapa: null, reflexao: roteiro.reflexao });
    expect(await abrir()).toMatchObject({ situacao: "fim", reflexao: roteiro.reflexao });
  });

  it("escolha numa etapa que não é a atual: CASO_FORA_DE_ORDEM com o estado atual", async () => {
    const api = criarApiPrevia({ item: montar() });
    const inicio = await api.chamarPortal("caso_abrir", { aula_id: "cs" });
    await api.chamarPortal("caso_escolher", {
      aula_id: "cs",
      etapa_id: "e1",
      opcao: indice(inicio.etapa, "Ligar sem testar"),
    });
    const erro = await api
      .chamarPortal("caso_escolher", { aula_id: "cs", etapa_id: "e1", opcao: 0 })
      .catch((e) => e);
    expect(erro.codigo).toBe("CASO_FORA_DE_ORDEM");
    expect(erro.extra.estado).toMatchObject({ situacao: "etapa", contexto: roteiro.contexto });
    expect(erro.extra.estado.etapa.id).toBe("r1");
  });

  it("concluir antes do fim: CASO_INCOMPLETO; no fim, nada é gravado e o caso recomeça", async () => {
    const api = criarApiPrevia({ item: montar() });
    const antes = await api.chamarPortal("caso_concluir", { aula_id: "cs" }).catch((e) => e);
    expect(antes.codigo).toBe("CASO_INCOMPLETO");
    const inicio = await api.chamarPortal("caso_abrir", { aula_id: "cs" });
    const meio = await api.chamarPortal("caso_escolher", {
      aula_id: "cs",
      etapa_id: "e1",
      opcao: indice(inicio.etapa, "Testar a ausência de tensão"),
    });
    await api.chamarPortal("caso_escolher", {
      aula_id: "cs",
      etapa_id: "e2",
      opcao: indice(meio.etapa, "Liberar com tudo conferido"),
    });
    const encerrado = await api
      .chamarPortal("caso_escolher", { aula_id: "cs", etapa_id: "e2", opcao: 0 })
      .catch((e) => e);
    expect(encerrado.codigo).toBe("CASO_ENCERRADO");
    expect(await api.chamarPortal("caso_concluir", { aula_id: "cs" })).toMatchObject({
      aula_concluida: false,
      curso_concluido: false,
    });
    const deNovo = await api.chamarPortal("caso_abrir", { aula_id: "cs" });
    expect(deNovo).toMatchObject({ situacao: "etapa", passagem: 1 });
    expect(deNovo.etapa.id).toBe("e1");
  });

  it("caso sem roteiro (ou com o roteiro apagado): CASO_INVALIDO, como o servidor", async () => {
    const api = criarApiPrevia({ item: montar() });
    const erro = await api.chamarPortal("caso_abrir", { aula_id: "cv" }).catch((e) => e);
    expect(erro.codigo).toBe("CASO_INVALIDO");
    expect(erro.message).toBe("Este caso está com problema — avise o RH");
  });
});
