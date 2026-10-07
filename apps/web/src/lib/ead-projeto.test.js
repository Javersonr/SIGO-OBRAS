import { describe, it, expect } from "vitest";
import {
  ANOS_ENTRE_REVISOES,
  AVISO_PDF_DESATUALIZADO,
  CAMPOS_DE_TEXTO_DO_PROJETO,
  CAMPOS_DO_PROJETO,
  GATILHOS_DE_REVISAO,
  ITENS_DO_PROJETO,
  LIMITE_TEXTO_PROJETO,
  aoMudarValidacao,
  avisoDoPdfAoSalvar,
  camposDoProjeto,
  comObjetivoDoModulo,
  comProjetoNormalizado,
  dadosDoProjetoParaGravar,
  estadoDoPdfDoFormulario,
  estadoDoPdfDoProjeto,
  gatilhosDoCurso,
  marcaDoProjeto,
  modulosDoCurso,
  montarProjeto,
  objetivoDoModulo,
  objetivosDosModulos,
  rotuloDaRevisao,
  selecionarRevisoes,
  situacaoDaRevisao,
  somarAnos,
} from "./ead-projeto";
import { camposCanonicosDoProjeto } from "./ead-projeto-marca";
import { requisitosDoCurso } from "./ead-requisitos";

// Só dados sintéticos: o repositório é público e o texto do projeto é do responsável técnico (D5).
const aulas = [
  { id: "a1", ordem: 1, modulo: "Módulo 1", titulo: "Aula 1", tipo: "video", legenda_ref: "l.vtt" },
  { id: "a2", ordem: 2, modulo: "Módulo 1", titulo: "Aula 2", tipo: "pdf" },
  { id: "a3", ordem: 3, modulo: "Módulo 2", titulo: "Aula 3", tipo: "texto" },
];
const questoes = Array.from({ length: 5 }, (_, i) => ({ id: `q${i}` }));
const curso = {
  nome: "Curso de Teste",
  codigo: "CT-1",
  carga_horaria_horas: 1,
  nota_minima: 70,
  max_tentativas: 3,
  intervalo_tentativa_min: 30,
  responsavel_tecnico_nome: "RT Teste",
  responsavel_tecnico_registro: "CREA 0000",
  instrutor_nome: "Instrutor Teste",
  instrutor_qualificacao: "Qualificação Teste",
  conteudo_programatico: "Item 1\nItem 2",
  objetivo_geral: "Objetivo geral de teste",
  principios_sst: "Princípios de teste",
  estrategia_pedagogica: "Estratégia de teste",
  infraestrutura_apoio: "Infraestrutura de teste",
  publico_alvo: "Público de teste",
  instrumentos_aprendizagem: "Instrumentos de teste",
  dedicacao_diaria_min: 30,
  prazo_conclusao_dias: 30,
  modulos_objetivos: [
    { modulo: "Módulo 1", objetivo: "Objetivo do módulo 1" },
    { modulo: "Módulo 2", objetivo: "Objetivo do módulo 2" },
  ],
};
const HOJE = "2026-10-07";
const item = (projeto, letra) => projeto.itens.find((i) => i.letra === letra);

describe("os 15 itens do Anexo II, 3.1", () => {
  it("são 15, de a até o, na ordem da norma, cada um com título", () => {
    expect(ITENS_DO_PROJETO).toHaveLength(15);
    expect(ITENS_DO_PROJETO.map((i) => i.letra).join("")).toBe("abcdefghijklmno");
    for (const i of ITENS_DO_PROJETO) expect(i.titulo.length).toBeGreaterThan(3);
  });

  it("nove são preenchidos no projeto (colunas novas) e seis vêm de campos que o curso já tinha", () => {
    const doProjeto = ITENS_DO_PROJETO.filter((i) => i.origem === "projeto").map((i) => i.letra);
    const doCurso = ITENS_DO_PROJETO.filter((i) => i.origem === "curso").map((i) => i.letra);
    expect(doProjeto.join("")).toBe("abcfhjkln");
    expect(doCurso.join("")).toBe("degimo");
  });
});

describe("camposDoProjeto", () => {
  it("são as 12 colunas do projeto no curso: os 9 itens escritos pelo RH e os 3 da validação", () => {
    expect(CAMPOS_DO_PROJETO).toHaveLength(12);
    expect(new Set(CAMPOS_DO_PROJETO).size).toBe(12);
  });

  it("separa só os campos do projeto de um formulário de curso, sem tocar nos outros", () => {
    const form = {
      id: "c1",
      nome: "Curso de Teste",
      carga_horaria_horas: 8,
      conteudo_programatico: "Item",
      projeto_pedagogico_ref: "treinamentos/x.pdf",
      objetivo_geral: "Objetivo",
      dedicacao_diaria_min: "30",
      modulos_objetivos: [{ modulo: "A", objetivo: "x" }],
      proxima_revisao: "",
    };
    expect(camposDoProjeto(form)).toEqual({
      objetivo_geral: "Objetivo",
      dedicacao_diaria_min: "30",
      modulos_objetivos: [{ modulo: "A", objetivo: "x" }],
      proxima_revisao: "",
    });
    expect(camposDoProjeto(null)).toEqual({});
    expect(camposDoProjeto({})).toEqual({});
  });
});

describe("montarProjeto", () => {
  it("curso vazio: nenhum dos 15 itens preenchido", () => {
    const p = montarProjeto({});
    expect(p.itens).toHaveLength(15);
    expect(p.total).toBe(15);
    expect(p.preenchidos).toBe(0);
    expect(p.completo).toBe(false);
    expect(p.faltam).toEqual("abcdefghijklmno".split(""));
  });

  it("curso completo: 15 de 15", () => {
    const p = montarProjeto({ curso, aulas, questoes });
    expect(p.preenchidos).toBe(15);
    expect(p.completo).toBe(true);
    expect(p.faltam).toEqual([]);
  });

  it("texto só com espaços não conta como preenchido", () => {
    const p = montarProjeto({ curso: { ...curso, objetivo_geral: "   \n " }, aulas, questoes });
    expect(item(p, "a").preenchido).toBe(false);
    expect(p.faltam).toEqual(["a"]);
  });

  it("(d) e (e): responsável técnico e instrutor vêm dos campos do curso, com registro e qualificação", () => {
    const p = montarProjeto({ curso, aulas, questoes });
    expect(item(p, "d").linhas).toEqual(["RT Teste — CREA 0000"]);
    expect(item(p, "e").linhas).toEqual(["Instrutor Teste — Qualificação Teste"]);
    const sem = montarProjeto({
      curso: { ...curso, instrutor_nome: "", responsavel_tecnico_nome: " " },
      aulas,
      questoes,
    });
    expect(item(sem, "d").preenchido).toBe(false);
    expect(item(sem, "e").preenchido).toBe(false);
  });

  it("(g) conteúdo programático: o campo do curso, ou a lista de aulas por módulo quando ele está vazio", () => {
    const campo = montarProjeto({ curso, aulas, questoes });
    expect(item(campo, "g").linhas).toEqual(["Item 1", "Item 2"]);
    expect(item(campo, "g").fonte).toBe("campo");

    const lista = montarProjeto({
      curso: { ...curso, conteudo_programatico: "" },
      aulas,
      questoes,
    });
    expect(item(lista, "g").preenchido).toBe(true);
    expect(item(lista, "g").fonte).toBe("aulas");
    expect(item(lista, "g").linhas).toEqual([
      "Módulo 1",
      "1. Aula 1",
      "2. Aula 2",
      "Módulo 2",
      "3. Aula 3",
    ]);

    const nada = montarProjeto({
      curso: { ...curso, conteudo_programatico: "" },
      aulas: [],
      questoes,
    });
    expect(item(nada, "g").preenchido).toBe(false);
  });

  it("(g) sem módulos nas aulas, a lista é só a numeração", () => {
    const semModulo = aulas.map((a) => ({ ...a, modulo: null }));
    const p = montarProjeto({
      curso: { ...curso, conteudo_programatico: "" },
      aulas: semModulo,
      questoes,
    });
    expect(item(p, "g").linhas).toEqual(["1. Aula 1", "2. Aula 2", "3. Aula 3"]);
  });

  it("(h) objetivo de cada módulo: só está completo quando TODO módulo tem objetivo", () => {
    expect(item(montarProjeto({ curso, aulas, questoes }), "h").linhas).toEqual([
      "Módulo 1: Objetivo do módulo 1",
      "Módulo 2: Objetivo do módulo 2",
    ]);
    const faltando = montarProjeto({
      curso: { ...curso, modulos_objetivos: [{ modulo: "Módulo 1", objetivo: "Só este" }] },
      aulas,
      questoes,
    });
    expect(item(faltando, "h").preenchido).toBe(false);
    expect(item(faltando, "h").pendentes).toEqual(["Módulo 2"]);
    // sem aulas não há módulo para ter objetivo
    expect(item(montarProjeto({ curso, aulas: [], questoes }), "h").preenchido).toBe(false);
  });

  it("(h) curso sem módulos nomeados tem um módulo só, o curso inteiro", () => {
    const semModulo = aulas.map((a) => ({ ...a, modulo: "" }));
    const p = montarProjeto({
      curso: { ...curso, modulos_objetivos: [{ modulo: "", objetivo: "Objetivo único" }] },
      aulas: semModulo,
      questoes,
    });
    expect(item(p, "h").linhas).toEqual(["Curso inteiro: Objetivo único"]);
    expect(item(p, "h").preenchido).toBe(true);
  });

  it("(h) lê a lista mesmo quando o jsonb vem como texto ou lixo", () => {
    const comoTexto = montarProjeto({
      curso: { ...curso, modulos_objetivos: JSON.stringify(curso.modulos_objetivos) },
      aulas,
      questoes,
    });
    expect(item(comoTexto, "h").preenchido).toBe(true);
    for (const lixo of ["{não é json", 42, { a: 1 }, null, undefined]) {
      const p = montarProjeto({ curso: { ...curso, modulos_objetivos: lixo }, aulas, questoes });
      expect(item(p, "h").preenchido).toBe(false);
    }
  });

  it("(i) carga horária, (j) dedicação diária e (k) prazo máximo", () => {
    const p = montarProjeto({ curso, aulas, questoes });
    expect(item(p, "i").linhas).toEqual(["1 h"]);
    expect(item(p, "j").linhas).toEqual(["30 min por dia"]);
    expect(item(p, "k").linhas).toEqual(["30 dias, contados da data da matrícula"]);
    const sem = montarProjeto({
      curso: {
        ...curso,
        carga_horaria_horas: 0,
        dedicacao_diaria_min: 0,
        prazo_conclusao_dias: null,
      },
      aulas,
      questoes,
    });
    for (const letra of ["i", "j", "k"]) expect(item(sem, letra).preenchido).toBe(false);
  });

  it("(m) material didático: resumo das aulas por tipo, sem contar as removidas", () => {
    const p = montarProjeto({
      curso,
      aulas: [...aulas, { id: "a4", tipo: "video", titulo: "Removida", deleted_at: "2026-10-01" }],
      questoes,
    });
    expect(item(p, "m").linhas).toEqual([
      "Vídeos: 1 (1 com legenda)",
      "Apostilas em PDF: 1",
      "Aulas de texto: 1",
    ]);
    expect(item(montarProjeto({ curso, aulas: [], questoes }), "m").preenchido).toBe(false);
  });

  it("(o) avaliação: questões, nota mínima, tentativas e intervalo (com os padrões do servidor)", () => {
    const p = montarProjeto({ curso, aulas, questoes });
    expect(item(p, "o").linhas).toEqual([
      "5 questões de múltipla escolha",
      "Nota mínima para aprovação: 70%",
      "Tentativas na prova: até 3",
      "Intervalo entre tentativas: 30 min",
    ]);
    const padroes = montarProjeto({
      curso: { ...curso, nota_minima: null, max_tentativas: 0, intervalo_tentativa_min: null },
      aulas,
      questoes,
    });
    expect(item(padroes, "o").linhas).toEqual([
      "5 questões de múltipla escolha",
      "Nota mínima para aprovação: 70%",
      "Tentativas na prova: sem limite",
      "Intervalo entre tentativas: 30 min",
    ]);
  });

  it("(o) exige o mínimo de questões do requisito de publicação", () => {
    const poucas = montarProjeto({ curso, aulas, questoes: questoes.slice(0, 4) });
    expect(item(poucas, "o").preenchido).toBe(false);
    expect(item(poucas, "o").pendencia).toMatch(/5 questões/);
    const apagadas = montarProjeto({
      curso,
      aulas,
      questoes: questoes.map((q, i) => (i === 0 ? { ...q, deleted_at: "2026-10-01" } : q)),
    });
    expect(item(apagadas, "o").preenchido).toBe(false);
  });

  it("todo item pendente diz o que fazer", () => {
    for (const i of montarProjeto({}).itens) {
      expect(i.pendencia, i.letra).toMatch(/\S/);
    }
    for (const i of montarProjeto({ curso, aulas, questoes }).itens) {
      expect(i.pendencia, i.letra).toBeNull();
    }
  });
});

describe("módulos do curso", () => {
  it("lista cada módulo uma vez, na ordem das aulas, ignorando as removidas", () => {
    expect(
      modulosDoCurso([
        { ordem: 2, modulo: "B" },
        { ordem: 1, modulo: "A" },
        { ordem: 3, modulo: "B" },
        { ordem: 4, modulo: "C", deleted_at: "2026-10-01" },
      ]).map((m) => m.modulo)
    ).toEqual(["A", "B"]);
  });

  it("aulas sem módulo ficam num grupo próprio, ou no curso inteiro quando nenhuma tem módulo", () => {
    expect(
      modulosDoCurso([
        { ordem: 1, modulo: "A" },
        { ordem: 2, modulo: " " },
      ]).map((m) => [m.modulo, m.rotulo])
    ).toEqual([
      ["A", "A"],
      ["", "Aulas sem módulo"],
    ]);
    expect(modulosDoCurso([{ ordem: 1 }, { ordem: 2 }]).map((m) => [m.modulo, m.rotulo])).toEqual([
      ["", "Curso inteiro"],
    ]);
    expect(modulosDoCurso([])).toEqual([]);
    expect(modulosDoCurso(null)).toEqual([]);
  });

  it("objetivosDosModulos e comObjetivoDoModulo tratam a lista como o banco a guarda", () => {
    expect(objetivosDosModulos([{ modulo: "A", objetivo: " x " }, { modulo: "B" }, null])).toEqual([
      { modulo: "A", objetivo: "x" },
    ]);
    expect(comObjetivoDoModulo([{ modulo: "A", objetivo: "x" }], "A", "y")).toEqual([
      { modulo: "A", objetivo: "y" },
    ]);
    expect(comObjetivoDoModulo([{ modulo: "A", objetivo: "x" }], "B", "z")).toEqual([
      { modulo: "A", objetivo: "x" },
      { modulo: "B", objetivo: "z" },
    ]);
    expect(comObjetivoDoModulo(undefined, "", "q")).toEqual([{ modulo: "", objetivo: "q" }]);
    // o que o RH está digitando não é aparado (senão não dá para escrever um espaço)
    expect(comObjetivoDoModulo([], "A", "duas palavras ")).toEqual([
      { modulo: "A", objetivo: "duas palavras " },
    ]);
    expect(objetivoDoModulo([{ modulo: "A", objetivo: " x " }], "A")).toBe(" x ");
    expect(objetivoDoModulo([{ modulo: "A", objetivo: "x" }], "B")).toBe("");
    expect(objetivoDoModulo(null, "A")).toBe("");
    // não altera a lista recebida
    const original = [{ modulo: "A", objetivo: "x" }];
    comObjetivoDoModulo(original, "A", "mudou");
    expect(original[0].objetivo).toBe("x");
  });
});

describe("dadosDoProjetoParaGravar", () => {
  const contexto = { aulas, questoes, hoje: HOJE };
  const chaves = [
    ...CAMPOS_DE_TEXTO_DO_PROJETO,
    "dedicacao_diaria_min",
    "prazo_conclusao_dias",
    "modulos_objetivos",
    "projeto_validado_em",
    "projeto_validado_por",
    "proxima_revisao",
  ];

  it("formulário vazio grava tudo como nulo (os 12 campos do projeto, nenhum a mais)", () => {
    const r = dadosDoProjetoParaGravar({}, contexto);
    expect(r.ok).toBe(true);
    expect(Object.keys(r.dados).sort()).toEqual([...chaves].sort());
    for (const k of chaves) expect(r.dados[k], k).toBeNull();
  });

  it("apara os textos e esvazia o que só tem espaços", () => {
    const r = dadosDoProjetoParaGravar(
      { objetivo_geral: "  Objetivo  ", principios_sst: "   ", publico_alvo: "Todos\n" },
      contexto
    );
    expect(r.dados.objetivo_geral).toBe("Objetivo");
    expect(r.dados.principios_sst).toBeNull();
    expect(r.dados.publico_alvo).toBe("Todos");
  });

  it("recusa texto acima do limite do banco, dizendo qual campo", () => {
    const r = dadosDoProjetoParaGravar(
      { estrategia_pedagogica: "x".repeat(LIMITE_TEXTO_PROJETO + 1) },
      contexto
    );
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/Estratégia pedagógica/);
    expect(r.erro).toMatch(String(LIMITE_TEXTO_PROJETO));
    expect(
      dadosDoProjetoParaGravar(
        { estrategia_pedagogica: "x".repeat(LIMITE_TEXTO_PROJETO) },
        contexto
      ).ok
    ).toBe(true);
  });

  it("dedicação diária e prazo viram inteiros; o que não for inteiro dentro do limite é recusado", () => {
    const ok = dadosDoProjetoParaGravar(
      { dedicacao_diaria_min: "45", prazo_conclusao_dias: "60" },
      contexto
    );
    expect(ok.dados.dedicacao_diaria_min).toBe(45);
    expect(ok.dados.prazo_conclusao_dias).toBe(60);
    const vazio = dadosDoProjetoParaGravar(
      { dedicacao_diaria_min: "", prazo_conclusao_dias: "" },
      contexto
    );
    expect(vazio.dados.dedicacao_diaria_min).toBeNull();
    expect(vazio.dados.prazo_conclusao_dias).toBeNull();
    for (const ruim of ["0", "-1", "1.5", "abc", "1441"]) {
      const r = dadosDoProjetoParaGravar({ dedicacao_diaria_min: ruim }, contexto);
      expect(r.ok, ruim).toBe(false);
      expect(r.erro).toMatch(/dedicação diária/i);
    }
    for (const ruim of ["0", "-3", "2.5", "x", "3651"]) {
      const r = dadosDoProjetoParaGravar({ prazo_conclusao_dias: ruim }, contexto);
      expect(r.ok, ruim).toBe(false);
      expect(r.erro).toMatch(/prazo/i);
    }
    expect(dadosDoProjetoParaGravar({ prazo_conclusao_dias: "3650" }, contexto).ok).toBe(true);
    expect(dadosDoProjetoParaGravar({ dedicacao_diaria_min: 1440 }, contexto).ok).toBe(true);
  });

  it("objetivos dos módulos: só os módulos que existem, na ordem das aulas, sem objetivo vazio", () => {
    const r = dadosDoProjetoParaGravar(
      {
        modulos_objetivos: [
          { modulo: "Módulo 2", objetivo: " Dois " },
          { modulo: "Módulo que não existe mais", objetivo: "Sobra" },
          { modulo: "Módulo 1", objetivo: "   " },
        ],
      },
      contexto
    );
    expect(r.dados.modulos_objetivos).toEqual([{ modulo: "Módulo 2", objetivo: "Dois" }]);
    expect(
      dadosDoProjetoParaGravar({ modulos_objetivos: [] }, contexto).dados.modulos_objetivos
    ).toBeNull();
  });

  it("objetivo de módulo acima do limite é recusado", () => {
    const r = dadosDoProjetoParaGravar(
      {
        modulos_objetivos: [{ modulo: "Módulo 1", objetivo: "x".repeat(LIMITE_TEXTO_PROJETO + 1) }],
      },
      contexto
    );
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/Módulo 1/);
  });

  describe("validação do responsável técnico (3.3)", () => {
    const completo = {
      ...curso,
      projeto_validado_em: "2026-10-01",
      projeto_validado_por: "RT Teste",
    };

    it("quem validou e a data andam juntos: um sem o outro é recusado", () => {
      const soData = dadosDoProjetoParaGravar(
        { ...curso, projeto_validado_em: "2026-10-01" },
        contexto
      );
      expect(soData.ok).toBe(false);
      expect(soData.erro).toMatch(/quem validou/i);
      const soNome = dadosDoProjetoParaGravar(
        { ...curso, projeto_validado_por: "RT Teste" },
        contexto
      );
      expect(soNome.ok).toBe(false);
      expect(soNome.erro).toMatch(/data da validação/i);
    });

    it("projeto completo validado: grava nome, data e a próxima revisão dois anos depois", () => {
      const r = dadosDoProjetoParaGravar(completo, contexto);
      expect(r.ok).toBe(true);
      expect(r.dados.projeto_validado_em).toBe("2026-10-01");
      expect(r.dados.projeto_validado_por).toBe("RT Teste");
      expect(r.dados.proxima_revisao).toBe("2028-10-01");
    });

    it("a próxima revisão que o RH escreveu vale mais que a sugerida", () => {
      const r = dadosDoProjetoParaGravar({ ...completo, proxima_revisao: "2027-04-01" }, contexto);
      expect(r.dados.proxima_revisao).toBe("2027-04-01");
    });

    it("só se valida projeto com os 15 itens: o erro diz quais faltam", () => {
      const r = dadosDoProjetoParaGravar(
        { ...completo, principios_sst: "", infraestrutura_apoio: "" },
        contexto
      );
      expect(r.ok).toBe(false);
      expect(r.erro).toMatch(/15 itens/);
      expect(r.erro).toMatch(/\(b\)/);
      expect(r.erro).toMatch(/\(f\)/);
    });

    it("sem validação, o projeto incompleto grava normalmente (rascunho)", () => {
      const r = dadosDoProjetoParaGravar({ ...curso, principios_sst: "" }, contexto);
      expect(r.ok).toBe(true);
      expect(r.dados.projeto_validado_em).toBeNull();
      expect(r.dados.proxima_revisao).toBeNull();
    });

    it("recusa data inexistente, futura, e revisão anterior à validação", () => {
      expect(
        dadosDoProjetoParaGravar({ ...completo, projeto_validado_em: "2026-02-30" }, contexto).ok
      ).toBe(false);
      expect(
        dadosDoProjetoParaGravar({ ...completo, projeto_validado_em: "01/10/2026" }, contexto).ok
      ).toBe(false);
      const futura = dadosDoProjetoParaGravar(
        { ...completo, projeto_validado_em: "2026-10-08" },
        contexto
      );
      expect(futura.ok).toBe(false);
      expect(futura.erro).toMatch(/futura/i);
      const antes = dadosDoProjetoParaGravar(
        { ...completo, proxima_revisao: "2026-09-30" },
        contexto
      );
      expect(antes.ok).toBe(false);
      expect(antes.erro).toMatch(/revisão/i);
      expect(
        dadosDoProjetoParaGravar({ ...completo, proxima_revisao: "amanhã" }, contexto).ok
      ).toBe(false);
    });

    it("quem validou tem limite de 120 caracteres; hoje (o dia da validação) vale", () => {
      expect(
        dadosDoProjetoParaGravar({ ...completo, projeto_validado_por: "n".repeat(121) }, contexto)
          .ok
      ).toBe(false);
      expect(
        dadosDoProjetoParaGravar({ ...completo, projeto_validado_em: HOJE }, contexto).ok
      ).toBe(true);
    });
  });
});

describe("datas da revisão", () => {
  it("somarAnos mantém o dia e, em 29/02, cai em 28/02 quando o ano de destino não é bissexto", () => {
    expect(somarAnos("2026-10-07", 2)).toBe("2028-10-07");
    expect(somarAnos("2028-02-29", 2)).toBe("2030-02-28");
    expect(somarAnos("2028-02-29", 4)).toBe("2032-02-29");
    expect(somarAnos("2026-02-30", 2)).toBeNull();
    expect(somarAnos("", 2)).toBeNull();
    expect(somarAnos(null, 2)).toBeNull();
    expect(ANOS_ENTRE_REVISOES).toBe(2);
  });

  it("aoMudarValidacao sugere a próxima revisão sem pisar numa data escolhida pelo RH", () => {
    expect(aoMudarValidacao({}, "2026-10-10")).toEqual({
      projeto_validado_em: "2026-10-10",
      proxima_revisao: "2028-10-10",
    });
    // a revisão ainda era a sugerida da data antiga: acompanha a nova
    expect(
      aoMudarValidacao(
        { projeto_validado_em: "2026-10-01", proxima_revisao: "2028-10-01" },
        "2026-10-10"
      )
    ).toEqual({ projeto_validado_em: "2026-10-10", proxima_revisao: "2028-10-10" });
    // o RH escolheu outra data: fica
    expect(
      aoMudarValidacao(
        { projeto_validado_em: "2026-10-01", proxima_revisao: "2027-03-01" },
        "2026-10-10"
      )
    ).toEqual({ projeto_validado_em: "2026-10-10" });
    // apagou a data da validação: a sugestão some junto
    expect(
      aoMudarValidacao({ projeto_validado_em: "2026-10-01", proxima_revisao: "2028-10-01" }, "")
    ).toEqual({ projeto_validado_em: "", proxima_revisao: "" });
    // data ainda incompleta no campo: não inventa revisão
    expect(aoMudarValidacao({}, "2026-1")).toEqual({ projeto_validado_em: "2026-1" });
  });
});

describe("gatilhos de revisão (D5: NR-35 mudou em 16/07/2026; NR-10 muda em 01/06/2027)", () => {
  it("há os dois gatilhos do handoff, com data e texto", () => {
    const porNorma = Object.fromEntries(GATILHOS_DE_REVISAO.map((g) => [g.norma, g]));
    expect(porNorma["NR-35"].data).toBe("2026-07-16");
    expect(porNorma["NR-10"].data).toBe("2027-06-01");
    for (const g of GATILHOS_DE_REVISAO) expect(g.texto.length).toBeGreaterThan(10);
  });

  it("reconhece a NR pelo nome ou código do curso, sem confundir NR-1 com NR-10 nem NR-100", () => {
    const normas = (c) => gatilhosDoCurso(c).map((g) => g.norma);
    expect(normas({ nome: "NR-35 — Trabalho em Altura" })).toEqual(["NR-35"]);
    expect(normas({ nome: "NR 10 Básico" })).toEqual(["NR-10"]);
    expect(normas({ nome: "Curso", codigo: "nr10-sep" })).toEqual(["NR-10"]);
    expect(normas({ nome: "NR-10 Complementar — SEP" })).toEqual(["NR-10"]);
    expect(normas({ nome: "NR-1 — Integração (GRO/PGR)" })).toEqual([]);
    expect(normas({ nome: "NR-6 — EPI" })).toEqual([]);
    expect(normas({ nome: "NR-100 hipotética" })).toEqual([]);
    expect(normas(null)).toEqual([]);
  });
});

describe("situacaoDaRevisao", () => {
  const validado = (extra) => ({
    nome: "Curso de Teste",
    projeto_validado_em: "2026-01-10",
    projeto_validado_por: "RT Teste",
    ...extra,
  });

  it("nunca validado (ou data ilegível): sem validação", () => {
    expect(situacaoDaRevisao({ nome: "Curso" }, HOJE).estado).toBe("sem_validacao");
    expect(situacaoDaRevisao(validado({ projeto_validado_em: "lixo" }), HOJE).estado).toBe(
      "sem_validacao"
    );
    expect(situacaoDaRevisao(null, HOJE).estado).toBe("sem_validacao");
  });

  it("validado há pouco e sem revisão escrita: vale dois anos", () => {
    const s = situacaoDaRevisao(validado(), HOJE);
    expect(s).toMatchObject({
      estado: "em_dia",
      data: "2028-01-10",
      motivo: "prazo",
      gatilho: null,
    });
    expect(s.dias).toBe(460);
  });

  it("a revisão escrita pelo RH é a que vale", () => {
    expect(situacaoDaRevisao(validado({ proxima_revisao: "2026-12-01" }), HOJE)).toMatchObject({
      estado: "a_vencer",
      dias: 55,
      data: "2026-12-01",
    });
  });

  it("passou da data: vencida, com os dias de atraso", () => {
    const s = situacaoDaRevisao(
      validado({ projeto_validado_em: "2024-10-01", proxima_revisao: "2026-10-01" }),
      HOJE
    );
    expect(s).toMatchObject({ estado: "vencida", dias: -6, motivo: "prazo" });
  });

  it("a revisão de hoje ainda não venceu (vence hoje); 90 dias é o limite do aviso", () => {
    expect(situacaoDaRevisao(validado({ proxima_revisao: HOJE }), HOJE)).toMatchObject({
      estado: "a_vencer",
      dias: 0,
    });
    expect(situacaoDaRevisao(validado({ proxima_revisao: "2027-01-05" }), HOJE)).toMatchObject({
      estado: "a_vencer",
      dias: 90,
    });
    expect(situacaoDaRevisao(validado({ proxima_revisao: "2027-01-06" }), HOJE)).toMatchObject({
      estado: "em_dia",
      dias: 91,
    });
  });

  it("a NR já mudou depois da validação: vencida pelo gatilho, mesmo com a data do RH longe", () => {
    const s = situacaoDaRevisao(
      {
        nome: "NR-35 — Trabalho em Altura",
        projeto_validado_em: "2025-03-01",
        proxima_revisao: "2027-03-01",
      },
      HOJE
    );
    expect(s.estado).toBe("vencida");
    expect(s.motivo).toBe("norma");
    expect(s.gatilho.norma).toBe("NR-35");
    expect(s.data).toBe("2026-07-16");
    expect(s.dias).toBeLessThan(0);
  });

  it("validado depois da mudança da NR: o gatilho já foi atendido", () => {
    const s = situacaoDaRevisao(
      { nome: "NR-35 — Trabalho em Altura", projeto_validado_em: "2026-08-01" },
      HOJE
    );
    expect(s.estado).toBe("em_dia");
    expect(s.motivo).toBe("prazo");
  });

  it("NR que ainda vai mudar antes da revisão normal: a data de revisão é a da mudança", () => {
    const base = { nome: "NR-10 Básico", projeto_validado_em: "2026-10-01" };
    const longe = situacaoDaRevisao(base, HOJE);
    expect(longe).toMatchObject({ estado: "em_dia", data: "2027-06-01", motivo: "norma_futura" });
    expect(longe.gatilho.norma).toBe("NR-10");
    expect(situacaoDaRevisao(base, "2027-04-01")).toMatchObject({ estado: "a_vencer", dias: 61 });
    // no dia seguinte à mudança, sem nova validação, vence
    expect(situacaoDaRevisao(base, "2027-06-02")).toMatchObject({
      estado: "vencida",
      motivo: "norma",
    });
    // revisão normal antes da mudança da NR: vale a normal
    expect(situacaoDaRevisao({ ...base, proxima_revisao: "2027-01-01" }, HOJE)).toMatchObject({
      data: "2027-01-01",
      motivo: "prazo",
    });
  });
});

describe("selecionarRevisoes (painel de vencimentos)", () => {
  const c = (id, extra) => ({ id, nome: `Curso ${id}`, ativo: true, ...extra });

  it("lista só curso vivo, publicado e que não seja de apoio; em dia fica de fora", () => {
    const { itens, resumo } = selecionarRevisoes({
      hoje: HOJE,
      cursos: [
        c("sem"),
        c("em-dia", { projeto_validado_em: "2026-09-01" }),
        c("vencido", { projeto_validado_em: "2024-01-01", proxima_revisao: "2026-01-01" }),
        c("a-vencer", { projeto_validado_em: "2024-12-01", proxima_revisao: "2026-12-01" }),
        c("rascunho", { ativo: false }),
        c("apagado", { deleted_at: "2026-10-01" }),
        c("apoio", { modalidade: "apoio" }),
      ],
    });
    expect(itens.map((i) => i.curso.id)).toEqual(["vencido", "sem", "a-vencer"]);
    expect(resumo).toEqual({
      semValidacao: 1,
      vencidas: 1,
      aVencer: 1,
      emDia: 1,
      pdfDesatualizado: 0,
    });
  });

  it("ordena vencidas pela mais atrasada, sem validação por nome e a vencer pela mais próxima", () => {
    const { itens } = selecionarRevisoes({
      hoje: HOJE,
      cursos: [
        c("v1", { projeto_validado_em: "2024-01-01", proxima_revisao: "2026-10-01" }),
        c("v2", { projeto_validado_em: "2024-01-01", proxima_revisao: "2026-01-01" }),
        c("zeta", { nome: "Zeta" }),
        c("alfa", { nome: "Alfa" }),
        c("p2", { projeto_validado_em: "2025-01-01", proxima_revisao: "2026-12-30" }),
        c("p1", { projeto_validado_em: "2025-01-01", proxima_revisao: "2026-11-01" }),
      ],
    });
    expect(itens.map((i) => i.curso.id)).toEqual(["v2", "v1", "alfa", "zeta", "p1", "p2"]);
  });

  it("sem cursos, nada a mostrar", () => {
    expect(selecionarRevisoes({ cursos: [], hoje: HOJE })).toEqual({
      itens: [],
      resumo: { semValidacao: 0, vencidas: 0, aVencer: 0, emDia: 0, pdfDesatualizado: 0 },
    });
    expect(selecionarRevisoes({ hoje: HOJE }).itens).toEqual([]);
  });

  describe("PDF desatualizado (o projeto mudou depois do PDF que o aluno e a fiscalização abrem)", () => {
    const PDF = "treinamentos/empresa/2026/10/projeto.pdf";
    const validado = {
      ...curso,
      projeto_validado_em: "2026-09-01",
      projeto_validado_por: "RT Teste",
    };
    const comPdfAtual = (extra) => ({
      ...validado,
      ...extra,
      projeto_pedagogico_ref: PDF,
      projeto_pdf_marca: marcaDoProjeto({ ...validado, ...extra }),
    });

    it("curso em dia na revisão, mas com o PDF antigo, entra na lista e no contador", () => {
      const antigo = { ...comPdfAtual(), objetivo_geral: "Objetivo mudado depois do PDF" };
      const { itens, resumo } = selecionarRevisoes({
        hoje: HOJE,
        cursos: [
          { id: "ok", nome: "Curso ok", ativo: true, ...comPdfAtual() },
          { id: "antigo", nome: "Curso antigo", ativo: true, ...antigo },
        ],
      });
      expect(itens.map((i) => [i.curso.id, i.situacao.estado, i.pdfDesatualizado])).toEqual([
        ["antigo", "em_dia", true],
      ]);
      expect(resumo).toEqual({
        semValidacao: 0,
        vencidas: 0,
        aVencer: 0,
        emDia: 2,
        pdfDesatualizado: 1,
      });
    });

    it("o PDF antigo de um curso vencido ou sem validação marca o item sem trocar a situação", () => {
      const { itens, resumo } = selecionarRevisoes({
        hoje: HOJE,
        cursos: [
          c("vencido", {
            projeto_validado_em: "2024-01-01",
            projeto_validado_por: "RT Teste",
            proxima_revisao: "2026-01-01",
            projeto_pedagogico_ref: PDF,
          }),
          c("sem", { projeto_pedagogico_ref: PDF }),
          c("sem-pdf"),
        ],
      });
      expect(itens.map((i) => [i.curso.id, i.situacao.estado, i.pdfDesatualizado])).toEqual([
        ["vencido", "vencida", true],
        ["sem", "sem_validacao", true],
        ["sem-pdf", "sem_validacao", false],
      ]);
      expect(resumo).toMatchObject({ semValidacao: 2, vencidas: 1, pdfDesatualizado: 2 });
    });

    it("os que só têm o PDF antigo vêm depois dos vencidos e dos que vencem", () => {
      const { itens } = selecionarRevisoes({
        hoje: HOJE,
        cursos: [
          { id: "pdf", nome: "Curso pdf", ativo: true, ...comPdfAtual(), objetivo_geral: "mudado" },
          c("a-vencer", { projeto_validado_em: "2024-12-01", proxima_revisao: "2026-12-01" }),
          c("vencido", { projeto_validado_em: "2024-01-01", proxima_revisao: "2026-01-01" }),
        ],
      });
      expect(itens.map((i) => i.curso.id)).toEqual(["vencido", "a-vencer", "pdf"]);
    });

    it("rascunho e apoio com PDF antigo não entram (como o resto do painel)", () => {
      const antigo = { ...comPdfAtual(), objetivo_geral: "mudado" };
      const { itens, resumo } = selecionarRevisoes({
        hoje: HOJE,
        cursos: [
          { id: "r", ativo: false, ...antigo },
          { id: "ap", ativo: true, modalidade: "apoio", ...antigo },
        ],
      });
      expect(itens).toEqual([]);
      expect(resumo.pdfDesatualizado).toBe(0);
    });
  });
});

describe("PDF x projeto (revisão da T25): a marca do que foi para o PDF", () => {
  const PDF = "treinamentos/empresa/2026/10/projeto.pdf";
  const gravadoSemPdf = {
    ...curso,
    projeto_validado_em: null,
    projeto_validado_por: null,
    proxima_revisao: null,
  };
  const comPdf = (base) => ({
    ...base,
    projeto_pedagogico_ref: PDF,
    projeto_pdf_marca: marcaDoProjeto(base),
  });

  it("a marca e o estado do PDF são os da lib de marca (a tela e o requisito usam a mesma regra)", () => {
    expect(marcaDoProjeto(curso)).toMatch(/^v1:[0-9a-f]{14}$/);
    expect(estadoDoPdfDoProjeto(curso)).toBe("sem_pdf");
    expect(estadoDoPdfDoProjeto(comPdf(curso))).toBe("atual");
  });

  describe("estadoDoPdfDoFormulario (o que a tela mostra)", () => {
    const contexto = { aulas, questoes };

    it("compara o PDF com o projeto da tela, já como seria gravado", () => {
      const gravado = comPdf(gravadoSemPdf);
      expect(estadoDoPdfDoFormulario(gravado, contexto)).toBe("atual");
      // espaços e módulo que não existe mais não mudam o que seria gravado
      expect(
        estadoDoPdfDoFormulario(
          {
            ...gravado,
            objetivo_geral: "  Objetivo geral de teste  ",
            modulos_objetivos: [
              ...gravado.modulos_objetivos,
              { modulo: "Módulo que saiu", objetivo: "Texto de um módulo que não existe mais" },
            ],
          },
          contexto
        )
      ).toBe("atual");
      expect(
        estadoDoPdfDoFormulario({ ...gravado, objetivo_geral: "Objetivo mudado" }, contexto)
      ).toBe("desatualizado");
    });

    it("sem PDF não há o que comparar", () => {
      expect(estadoDoPdfDoFormulario(gravadoSemPdf, contexto)).toBe("sem_pdf");
    });

    it("registrar a validação na tela, depois de gerar o PDF, o deixa desatualizado", () => {
      const gravado = comPdf(gravadoSemPdf);
      const naTela = {
        ...gravado,
        projeto_validado_em: "2026-10-01",
        projeto_validado_por: "RT Teste",
      };
      expect(estadoDoPdfDoFormulario(naTela, contexto)).toBe("desatualizado");
      // a revisão (2 anos depois) é preenchida ao gravar: a tela e o que vai para o banco concordam
      const dados = dadosDoProjetoParaGravar(naTela, { ...contexto, hoje: HOJE });
      expect(dados.ok).toBe(true);
      expect(dados.dados.proxima_revisao).toBe("2028-10-01");
    });

    it("formulário que não dá para gravar (data inválida) ainda é comparado, sem lançar", () => {
      const gravado = comPdf(gravadoSemPdf);
      expect(
        estadoDoPdfDoFormulario({ ...gravado, projeto_validado_em: "2026-02-30" }, contexto)
      ).toBe("desatualizado");
    });
  });

  describe("avisoDoPdfAoSalvar (o aviso depois de Salvar curso)", () => {
    const dadosGravados = (formulario) =>
      dadosDoProjetoParaGravar(formulario, { aulas, questoes, hoje: HOJE }).dados;

    it("projeto mudou e o curso já tem PDF: avisa para gerar de novo", () => {
      const gravado = comPdf(gravadoSemPdf);
      const aviso = avisoDoPdfAoSalvar(
        gravado,
        dadosGravados({ ...gravado, objetivo_geral: "Objetivo mudado" })
      );
      expect(aviso).toBe(AVISO_PDF_DESATUALIZADO);
      expect(aviso).toMatch(/Gerar PDF do projeto/);
    });

    it("registrar a validação depois do PDF (o cenário do RH) também avisa", () => {
      const gravado = comPdf(gravadoSemPdf);
      expect(
        avisoDoPdfAoSalvar(
          gravado,
          dadosGravados({
            ...gravado,
            projeto_validado_em: "2026-10-01",
            projeto_validado_por: "RT Teste",
          })
        )
      ).toBe(AVISO_PDF_DESATUALIZADO);
    });

    it("sem PDF, ou com o projeto igual, não avisa", () => {
      expect(
        avisoDoPdfAoSalvar(gravadoSemPdf, dadosGravados({ ...gravadoSemPdf, objetivo_geral: "x" }))
      ).toBeNull();
      const gravado = comPdf(gravadoSemPdf);
      expect(avisoDoPdfAoSalvar(gravado, dadosGravados(gravado))).toBeNull();
      // curso novo (ainda não gravado)
      expect(avisoDoPdfAoSalvar(null, dadosGravados(gravadoSemPdf))).toBeNull();
    });

    it("PDF que já estava antigo e projeto sem mudança: não repete o aviso a cada salvar", () => {
      const antigo = { ...comPdf(gravadoSemPdf), objetivo_geral: "mudado antes, já avisado" };
      expect(avisoDoPdfAoSalvar(antigo, dadosGravados(antigo))).toBeNull();
    });

    it("voltar ao projeto que o PDF diz deixa o PDF atual: não avisa", () => {
      const original = comPdf(gravadoSemPdf);
      const mudado = { ...original, objetivo_geral: "Objetivo mudado" };
      // o curso gravado está mudado (PDF antigo); o RH volta o texto e salva
      expect(avisoDoPdfAoSalvar(mudado, dadosGravados(original))).toBeNull();
    });
  });
});

describe("a lista de requisitos do formulário lê o projeto como seria gravado (A6, T25 R1)", () => {
  const PDF = "treinamentos/empresa/2026/10/projeto.pdf";
  const contexto = { aulas, questoes, hoje: HOJE };
  const requisito = (linha) =>
    requisitosDoCurso({ curso: linha, aulas, questoes }).find((r) => r.codigo === "PROJETO");

  it("validação sem data de revisão: o banco recebe a sugestão de 2 anos, e a lista não pode dizer 'desatualizado'", () => {
    // o RH preenche a validação, deixa "Próxima revisão" vazia e clica em "Gerar PDF do projeto": o banco recebe
    // a revisão sugerida (2 anos) e a marca dela, mas o campo da tela continua vazio
    const formulario = {
      ...curso,
      projeto_validado_por: "RT Teste",
      projeto_validado_em: "2026-10-01",
      proxima_revisao: "",
    };
    const gravado = dadosDoProjetoParaGravar(formulario, contexto);
    expect(gravado.ok).toBe(true);
    expect(gravado.dados.proxima_revisao).toBe("2028-10-01");
    const comPdf = {
      ...formulario,
      projeto_pedagogico_ref: PDF,
      projeto_pdf_marca: marcaDoProjeto(gravado.dados),
    };
    // o formulário cru destoa do que foi para o PDF (o defeito)
    expect(requisito(comPdf).ok).toBe(false);
    // a mesma conta que a seção usa: com o projeto normalizado a lista concorda com ela
    expect(estadoDoPdfDoFormulario(comPdf, contexto)).toBe("atual");
    expect(requisito(comProjetoNormalizado(comPdf, contexto)).ok).toBe(true);
    expect(comProjetoNormalizado(comPdf, contexto).proxima_revisao).toBe("2028-10-01");
  });

  it("módulo que deixou de existir nas aulas: o objetivo dele não conta na marca da lista", () => {
    const formulario = {
      ...curso,
      modulos_objetivos: [...curso.modulos_objetivos, { modulo: "Módulo apagado", objetivo: "x" }],
    };
    const gravado = dadosDoProjetoParaGravar(formulario, contexto);
    const comPdf = {
      ...formulario,
      projeto_pedagogico_ref: PDF,
      projeto_pdf_marca: marcaDoProjeto(gravado.dados),
    };
    expect(comProjetoNormalizado(comPdf, contexto).modulos_objetivos).toHaveLength(2);
    expect(estadoDoPdfDoFormulario(comPdf, contexto)).toBe("atual");
  });

  it("projeto que não passa na conferência (limite de texto, data futura) fica como está: sem inventar valor", () => {
    const ruim = { ...curso, projeto_validado_em: "2999-01-01", projeto_validado_por: "RT Teste" };
    expect(comProjetoNormalizado(ruim, contexto)).toBe(ruim);
    expect(comProjetoNormalizado(null, contexto)).toBeNull();
  });
});

describe("a lista de objetivos tem uma leitura só (A6, T25 R6)", () => {
  it("objetivosDosModulos e a forma canônica da marca leem do mesmo jeito, nos mesmos casos", () => {
    const casos = [
      undefined,
      null,
      "",
      "não é json",
      "[]",
      "{}",
      JSON.stringify([{ modulo: " M1 ", objetivo: " Texto " }]),
      JSON.stringify([
        { modulo: "M1", objetivo: "   " },
        { modulo: "M2", objetivo: "ok" },
      ]),
      [
        { modulo: "B", objetivo: "segundo" },
        { modulo: "A", objetivo: "primeiro" },
      ],
      [{ modulo: "M1", objetivo: 5 }, null, "x", { objetivo: "sem módulo" }],
      { modulo: "M1", objetivo: "objeto solto" },
    ];
    for (const valor of casos) {
      const doModulo = objetivosDosModulos(valor).map((e) => [e.modulo, e.objetivo]);
      const canonico = camposCanonicosDoProjeto({ modulos_objetivos: valor })[2];
      // a marca ordena pelo nome do módulo: a mesma lista, só em outra ordem
      const ordenado = [...doModulo].sort((a, b) =>
        a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0
      );
      expect(canonico, JSON.stringify(valor)).toEqual(ordenado);
    }
  });
});

describe("o aviso de PDF desatualizado diz o que fazer com o PDF próprio também (A6, T25 R4)", () => {
  it("o toast e o requisito mandam gerar o PDF de novo OU anexar o seu de novo", () => {
    expect(AVISO_PDF_DESATUALIZADO).toMatch(/anexe o seu de novo/);
    const r = requisitosDoCurso({
      curso: {
        ...curso,
        projeto_validado_por: "RT Teste",
        projeto_validado_em: "2026-10-01",
        projeto_pedagogico_ref: "treinamentos/e/p.pdf",
        projeto_pdf_marca: "v1:x",
      },
      aulas,
      questoes,
    }).find((x) => x.codigo === "PROJETO");
    expect(r.texto).toMatch(/anexe o seu de novo/);
  });
});

describe("o cenário da revisão 1 da T25: PDF gerado antes da validação, validação registrada em Salvar curso", () => {
  const PDF = "treinamentos/empresa/2026/10/projeto.pdf";
  const contexto = { aulas, questoes, hoje: HOJE };
  const requisito = (linha) =>
    requisitosDoCurso({ curso: linha, aulas, questoes }).find((r) => r.codigo === "PROJETO");

  it("o requisito só fica em ordem quando o PDF diz o mesmo que o projeto validado", () => {
    // 1. o RH escreve os 15 itens e clica em "Gerar PDF do projeto" para o RT ler: a gravação leva os campos
    //    da tela, a referência do PDF e a marca do que foi para o PDF (ainda sem validação)
    const gerado = dadosDoProjetoParaGravar(curso, contexto);
    expect(gerado.ok).toBe(true);
    let linha = {
      ...curso,
      ...gerado.dados,
      projeto_pedagogico_ref: PDF,
      projeto_pdf_marca: marcaDoProjeto(gerado.dados),
    };
    expect(estadoDoPdfDoProjeto(linha)).toBe("atual");
    expect(requisito(linha).ok).toBe(false); // falta a validação do RT

    // 2. o RT aprova; o RH escreve "Validado por" e a data e clica em "Salvar curso", que grava os campos do
    //    projeto mas não mexe no PDF nem na marca dele
    const salvar = dadosDoProjetoParaGravar(
      { ...linha, projeto_validado_por: "RT Teste", projeto_validado_em: "2026-10-01" },
      contexto
    );
    expect(salvar.ok).toBe(true);
    expect(avisoDoPdfAoSalvar(linha, salvar.dados)).toBe(AVISO_PDF_DESATUALIZADO);
    linha = { ...linha, ...salvar.dados };
    expect(linha.projeto_validado_em).toBe("2026-10-01");
    expect(linha.projeto_pedagogico_ref).toBe(PDF);
    // o PDF que o aluno abre ainda diz "não foi validado": o requisito NÃO pode ficar em ordem
    expect(estadoDoPdfDoProjeto(linha)).toBe("desatualizado");
    expect(requisito(linha).ok).toBe(false);
    expect(requisito(linha).texto).toMatch(/desatualizado/);
    expect(requisito(linha).bloqueia).toBe(false); // é aviso

    // 3. o RH clica em "Gerar PDF do projeto" de novo: o PDF e a marca passam a ter a validação
    const novo = dadosDoProjetoParaGravar(linha, contexto);
    linha = { ...linha, ...novo.dados, projeto_pdf_marca: marcaDoProjeto(novo.dados) };
    expect(estadoDoPdfDoProjeto(linha)).toBe("atual");
    expect(requisito(linha).ok).toBe(true);

    // 4. um texto editado depois (Salvar curso) volta a pedir o PDF novo, e a seção avisa na hora
    const editado = dadosDoProjetoParaGravar(
      { ...linha, publico_alvo: "Público mudado" },
      contexto
    );
    expect(avisoDoPdfAoSalvar(linha, editado.dados)).toBe(AVISO_PDF_DESATUALIZADO);
    linha = { ...linha, ...editado.dados };
    expect(requisito(linha).ok).toBe(false);
  });

  it("PDF próprio anexado: a marca é a do projeto salvo e o requisito segue a mesma regra", () => {
    const validado = dadosDoProjetoParaGravar(
      { ...curso, projeto_validado_por: "RT Teste", projeto_validado_em: "2026-10-01" },
      contexto
    );
    const salvo = { ...curso, ...validado.dados };
    // o RH anexa o PDF do RT depois de salvar: a marca vai junto (marcaDoProjeto do curso gravado)
    const anexado = {
      ...salvo,
      projeto_pedagogico_ref: PDF,
      projeto_pdf_marca: marcaDoProjeto(salvo),
    };
    expect(requisito(anexado).ok).toBe(true);
    // anexado antes de validar: precisa anexar de novo depois
    const antes = {
      ...curso,
      projeto_pedagogico_ref: PDF,
      projeto_pdf_marca: marcaDoProjeto(curso),
    };
    expect(requisito({ ...antes, ...validado.dados }).ok).toBe(false);
  });
});

describe("rotuloDaRevisao", () => {
  it("diz o que aconteceu em cada situação", () => {
    expect(rotuloDaRevisao({ estado: "sem_validacao" })).toBe("Sem validação registrada");
    expect(rotuloDaRevisao({ estado: "vencida", motivo: "prazo", dias: -6 })).toBe(
      "Revisão vencida há 6 dias"
    );
    expect(rotuloDaRevisao({ estado: "vencida", motivo: "prazo", dias: -1 })).toBe(
      "Revisão vencida há 1 dia"
    );
    expect(rotuloDaRevisao({ estado: "a_vencer", motivo: "prazo", dias: 55 })).toBe(
      "Revisão vence em 55 dias"
    );
    expect(rotuloDaRevisao({ estado: "a_vencer", motivo: "prazo", dias: 1 })).toBe(
      "Revisão vence em 1 dia"
    );
    expect(rotuloDaRevisao({ estado: "a_vencer", motivo: "prazo", dias: 0 })).toBe(
      "Revisão vence hoje"
    );
    expect(rotuloDaRevisao({ estado: "em_dia", motivo: "prazo", dias: 400 })).toBe(
      "Revisão em dia"
    );
  });

  it("quando é a NR que mudou ou vai mudar, diz a data", () => {
    const g = { norma: "NR-35", data: "2026-07-16" };
    expect(
      rotuloDaRevisao({ estado: "vencida", motivo: "norma", dias: -83, gatilho: g, data: g.data })
    ).toBe("A NR-35 mudou em 16/07/2026, depois da última validação");
    const f = { norma: "NR-10", data: "2027-06-01" };
    expect(
      rotuloDaRevisao({
        estado: "a_vencer",
        motivo: "norma_futura",
        dias: 61,
        gatilho: f,
        data: f.data,
      })
    ).toBe("A NR-10 muda em 01/06/2027: revise o projeto antes (faltam 61 dias)");
  });
});
