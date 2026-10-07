import { describe, it, expect } from "vitest";
import {
  funcoesDosFuncionarios,
  planoDaFuncao,
  idsQueFaltam,
  selecaoDaFuncao,
  rotuloDaSituacao,
  matriculasDoPlano,
  sugestaoDeMatricula,
  textoDaSugestao,
} from "./ead-matricula-funcao";

// Dados sintéticos (nenhum nome, CPF ou id real). "Hoje" fixo: 2026-10-06.
const HOJE = "2026-10-06";

const func = (id, funcao_id, extra = {}) => ({
  id,
  nome_completo: `Funcionario ${id}`,
  ativo: true,
  funcao_id,
  funcao_nome: funcao_id ? `Função ${funcao_id}` : null,
  ...extra,
});
// exigência da função: treinamento com funcao_id, ligado ao modelo central
const exigencia = (id, funcao_id, modelo, extra = {}) => ({
  id,
  funcao_id,
  modelo_treinamento_id: modelo,
  nome: `Exigência ${id}`,
  ativo: true,
  obrigatorio: true,
  ...extra,
});
const curso = (id, modelo, extra = {}) => ({
  id,
  nome: `Curso ${id}`,
  modelo_treinamento_id: modelo,
  ativo: true,
  ...extra,
});
const mat = (id, funcionario_id, curso_id, extra = {}) => ({
  id,
  funcionario_id,
  curso_id,
  status: "pendente",
  ...extra,
});
const concluida = (id, funcionario_id, curso_id, renovacao = "2027-06-01") =>
  mat(id, funcionario_id, curso_id, { status: "concluido", proxima_renovacao: renovacao });

const aceitaTodos = () => null;
const base = (dados = {}) => ({
  funcaoId: "fn1",
  funcionarios: [],
  treinamentos: [],
  cursos: [],
  matriculas: [],
  certificados: [],
  hoje: HOJE,
  cursoMatriculavel: aceitaTodos,
  ...dados,
});

describe("funcoesDosFuncionarios", () => {
  it("lista as funções de quem está ativo, com quantas pessoas, em ordem de nome", () => {
    const r = funcoesDosFuncionarios([
      func("f1", "b", { funcao_nome: "Zelador" }),
      func("f2", "a", { funcao_nome: "Eletricista" }),
      func("f3", "a", { funcao_nome: "Eletricista" }),
      func("f4", "b", { funcao_nome: "Zelador", ativo: false }),
      func("f5", null),
    ]);
    expect(r).toEqual([
      { id: "a", nome: "Eletricista", total: 2 },
      { id: "b", nome: "Zelador", total: 1 },
    ]);
  });

  it("ignora excluídos e usa um nome mesmo se o primeiro estiver vazio", () => {
    const r = funcoesDosFuncionarios([
      func("f1", "a", { funcao_nome: "", deleted_at: "2026-09-01T00:00:00Z" }),
      func("f2", "a", { funcao_nome: "" }),
      func("f3", "a", { funcao_nome: "Eletricista" }),
    ]);
    expect(r).toEqual([{ id: "a", nome: "Eletricista", total: 2 }]);
  });

  it("sem lista: vazio", () => {
    expect(funcoesDosFuncionarios(undefined)).toEqual([]);
  });
});

describe("planoDaFuncao: exigências", () => {
  it("função → exigência → modelo → curso do portal", () => {
    const plano = planoDaFuncao(
      base({
        treinamentos: [exigencia("e1", "fn1", "m1"), exigencia("e2", "outra", "m2")],
        cursos: [curso("c1", "m1"), curso("c2", "m2")],
      })
    );
    expect(plano.exigencias).toHaveLength(1);
    expect(plano.exigencias[0]).toMatchObject({ id: "e1", modeloId: "m1", motivo: null });
    expect(plano.exigencias[0].curso.id).toBe("c1");
  });

  it("exigência sem curso no portal: motivo sem_curso", () => {
    const plano = planoDaFuncao(base({ treinamentos: [exigencia("e1", "fn1", "m1")] }));
    expect(plano.exigencias[0].curso).toBeNull();
    expect(plano.exigencias[0].motivo).toBe("sem_curso");
  });

  it("curso que não aceita matrícula (rascunho, pendências): motivo indisponivel com o texto", () => {
    const plano = planoDaFuncao(
      base({
        treinamentos: [exigencia("e1", "fn1", "m1")],
        cursos: [curso("c1", "m1", { ativo: false })],
        cursoMatriculavel: (c) => (c.ativo === false ? "Curso em rascunho" : null),
      })
    );
    expect(plano.exigencias[0].curso).toBeNull();
    expect(plano.exigencias[0].motivo).toBe("indisponivel");
    expect(plano.exigencias[0].detalheMotivo).toBe("Curso em rascunho");
  });

  it("com mais de um curso no modelo, escolhe o que emite certificado e aceita matrícula", () => {
    const plano = planoDaFuncao(
      base({
        treinamentos: [exigencia("e1", "fn1", "m1")],
        cursos: [
          curso("a-apoio", "m1", { nome: "A apoio", modalidade: "apoio" }),
          curso("b-ead", "m1", { nome: "B ead" }),
          curso("c-ead", "m1", { nome: "C ead" }),
        ],
        cursoMatriculavel: (c) => (c.id === "b-ead" ? "pendências" : null),
      })
    );
    expect(plano.exigencias[0].curso.id).toBe("c-ead");
    expect(plano.exigencias[0].cursos.map((c) => c.id)).toEqual(["b-ead", "c-ead", "a-apoio"]);
  });

  it("se só há curso de apoio, ele é matriculável e a exigência avisa que é de apoio", () => {
    const plano = planoDaFuncao(
      base({
        treinamentos: [exigencia("e1", "fn1", "m1")],
        cursos: [curso("c1", "m1", { modalidade: "apoio" })],
      })
    );
    expect(plano.exigencias[0].curso.id).toBe("c1");
    expect(plano.exigencias[0].apoio).toBe(true);
  });

  it("exigência opcional, inativa ou sem vínculo com o cadastro central não entra", () => {
    const plano = planoDaFuncao(
      base({
        treinamentos: [
          exigencia("e1", "fn1", "m1", { obrigatorio: false }),
          exigencia("e2", "fn1", "m2", { ativo: false }),
          exigencia("e3", "fn1", null),
          exigencia("e4", "fn1", "m4", { deleted_at: "2026-09-01T00:00:00Z" }),
        ],
        cursos: [curso("c1", "m1"), curso("c2", "m2"), curso("c4", "m4")],
      })
    );
    expect(plano.exigencias).toEqual([]);
  });

  it("curso excluído não conta", () => {
    const plano = planoDaFuncao(
      base({
        treinamentos: [exigencia("e1", "fn1", "m1")],
        cursos: [curso("c1", "m1", { deleted_at: "2026-09-01T00:00:00Z" })],
      })
    );
    expect(plano.exigencias[0].motivo).toBe("sem_curso");
  });
});

describe("planoDaFuncao: pessoas", () => {
  const dados = (matriculas, extra = {}) =>
    base({
      funcionarios: [func("f1", "fn1"), func("f2", "outra")],
      treinamentos: [exigencia("e1", "fn1", "m1")],
      cursos: [curso("c1", "m1")],
      matriculas,
      ...extra,
    });

  it("só as pessoas ativas da função, por nome", () => {
    const plano = planoDaFuncao(
      base({
        funcionarios: [
          func("f1", "fn1", { nome_completo: "Zélia" }),
          func("f2", "fn1", { nome_completo: "Ana" }),
          func("f3", "fn1", { ativo: false }),
          func("f4", "outra"),
        ],
        treinamentos: [exigencia("e1", "fn1", "m1")],
        cursos: [curso("c1", "m1")],
      })
    );
    expect(plano.pessoas.map((p) => p.funcionario.id)).toEqual(["f2", "f1"]);
  });

  it("sem matrícula: falta", () => {
    const [p] = planoDaFuncao(dados([])).pessoas;
    expect(p.itens.e1).toBe("sem_matricula");
    expect(p.faltam).toEqual(["e1"]);
  });

  it("matrícula em andamento ou concluída dentro da validade: não falta", () => {
    expect(planoDaFuncao(dados([mat("m1", "f1", "c1")])).pessoas[0]).toMatchObject({
      itens: { e1: "em_andamento" },
      faltam: [],
    });
    expect(planoDaFuncao(dados([concluida("m1", "f1", "c1")])).pessoas[0]).toMatchObject({
      itens: { e1: "em_dia" },
      faltam: [],
    });
  });

  it("concluída sem validade (curso sem renovação): em dia para sempre", () => {
    const [p] = planoDaFuncao(dados([concluida("m1", "f1", "c1", null)])).pessoas;
    expect(p.itens.e1).toBe("em_dia");
  });

  it("concluída e vencida: falta (vencida)", () => {
    const [p] = planoDaFuncao(dados([concluida("m1", "f1", "c1", "2026-10-01")])).pessoas;
    expect(p.itens.e1).toBe("vencida");
    expect(p.faltam).toEqual(["e1"]);
  });

  it("certificado revogado: falta (revogada)", () => {
    const [p] = planoDaFuncao(
      dados([concluida("m1", "f1", "c1")], {
        certificados: [{ matricula_id: "m1", revogado_em: "2026-10-02T00:00:00Z" }],
      })
    ).pessoas;
    expect(p.itens.e1).toBe("revogada");
    expect(p.faltam).toEqual(["e1"]);
  });

  it("vencida mas com matrícula nova aberta: não falta", () => {
    const [p] = planoDaFuncao(
      dados([concluida("m1", "f1", "c1", "2026-10-01"), mat("m2", "f1", "c1")])
    ).pessoas;
    expect(p.faltam).toEqual([]);
  });

  it("exigência sem curso disponível nunca entra em 'faltam', mas a situação aparece", () => {
    const plano = planoDaFuncao(
      base({
        funcionarios: [func("f1", "fn1")],
        treinamentos: [exigencia("e1", "fn1", "m1")],
      })
    );
    expect(plano.pessoas[0].faltam).toEqual([]);
    expect(plano.pessoas[0].itens.e1).toBe("sem_matricula");
  });

  it("curso de apoio concluído não cumpre a exigência de um modelo que também tem curso EAD", () => {
    const [p] = planoDaFuncao(
      base({
        funcionarios: [func("f1", "fn1")],
        treinamentos: [exigencia("e1", "fn1", "m1")],
        cursos: [curso("ead", "m1"), curso("apoio", "m1", { modalidade: "apoio" })],
        matriculas: [concluida("m1", "f1", "apoio", null)],
      })
    ).pessoas;
    expect(p.itens.e1).toBe("sem_matricula");
    expect(p.faltam).toEqual(["e1"]);
  });

  it("modelo só com curso de apoio: a matrícula nele conta (senão a pessoa seria cobrada para sempre)", () => {
    const [p] = planoDaFuncao(
      base({
        funcionarios: [func("f1", "fn1")],
        treinamentos: [exigencia("e1", "fn1", "m1")],
        cursos: [curso("apoio", "m1", { modalidade: "apoio" })],
        matriculas: [concluida("m1", "f1", "apoio", null)],
      })
    ).pessoas;
    expect(p.itens.e1).toBe("em_dia");
  });
});

// Revisão 1 (Important): o modelo tem um curso EAD que emite, mas ele não aceita matrícula agora
// (rascunho ou pendência), e um curso de apoio publicado. O painel matricula no apoio; quem já fez o
// apoio não pode voltar a "faltar", senão ganharia outra matrícula no mesmo curso a cada conclusão.
describe("planoDaFuncao: curso EAD indisponível e apoio publicado", () => {
  const rascunho = (c) => (c.id === "ead" ? "Curso em rascunho" : null);
  const dados = (matriculas, extra = {}) =>
    base({
      funcionarios: [func("f1", "fn1")],
      treinamentos: [exigencia("e1", "fn1", "m1")],
      cursos: [curso("ead", "m1", { ativo: false }), curso("apoio", "m1", { modalidade: "apoio" })],
      matriculas,
      cursoMatriculavel: rascunho,
      ...extra,
    });

  it("o curso escolhido é o de apoio, que aceita matrícula", () => {
    const [e] = planoDaFuncao(dados([])).exigencias;
    expect(e.curso.id).toBe("apoio");
    expect(e.apoio).toBe(true);
  });

  it("quem nunca fez o apoio continua faltando (sem matrícula)", () => {
    const [p] = planoDaFuncao(dados([])).pessoas;
    expect(p.itens.e1).toBe("sem_matricula");
    expect(p.faltam).toEqual(["e1"]);
  });

  it("apoio concluído e dentro da validade: não falta e a situação diz que é só o apoio", () => {
    const [p] = planoDaFuncao(dados([concluida("m1", "f1", "apoio", null)])).pessoas;
    expect(p.itens.e1).toBe("apoio_feito");
    expect(p.faltam).toEqual([]);
  });

  it("apoio em andamento: não falta", () => {
    const [p] = planoDaFuncao(dados([mat("m1", "f1", "apoio")])).pessoas;
    expect(p.itens.e1).toBe("apoio_em_andamento");
    expect(p.faltam).toEqual([]);
  });

  it("apoio concluído com a validade vencida: falta de novo", () => {
    const [p] = planoDaFuncao(dados([concluida("m1", "f1", "apoio", "2026-10-01")])).pessoas;
    expect(p.faltam).toEqual(["e1"]);
  });

  it("apoio concluído e vencido, mas com outro apoio aberto: não falta", () => {
    const [p] = planoDaFuncao(
      dados([concluida("m1", "f1", "apoio", "2026-10-01"), mat("m2", "f1", "apoio")])
    ).pessoas;
    expect(p.itens.e1).toBe("apoio_em_andamento");
    expect(p.faltam).toEqual([]);
  });

  it("conclusão no curso EAD que emite (mesmo em rascunho agora) continua valendo como em dia", () => {
    const [p] = planoDaFuncao(dados([concluida("m1", "f1", "ead")])).pessoas;
    expect(p.itens.e1).toBe("em_dia");
    expect(p.faltam).toEqual([]);
  });

  it("EAD vencido e apoio feito: o apoio é o que há para matricular, então não falta", () => {
    const [p] = planoDaFuncao(
      dados([concluida("m1", "f1", "ead", "2026-10-01"), concluida("m2", "f1", "apoio", null)])
    ).pessoas;
    expect(p.itens.e1).toBe("apoio_feito");
    expect(p.faltam).toEqual([]);
  });

  it("matrícula num curso de apoio de OUTRO modelo não conta", () => {
    const [p] = planoDaFuncao(
      dados([concluida("m1", "f1", "apoio-de-outro", null)], {
        cursos: [
          curso("ead", "m1", { ativo: false }),
          curso("apoio", "m1", { modalidade: "apoio" }),
          curso("apoio-de-outro", "m2", { modalidade: "apoio" }),
        ],
      })
    ).pessoas;
    expect(p.itens.e1).toBe("sem_matricula");
    expect(p.faltam).toEqual(["e1"]);
  });

  it("a matrícula por função não cria outra matrícula no apoio para quem já o concluiu", () => {
    const matriculas = [concluida("m1", "f1", "apoio", null)];
    const plano = planoDaFuncao(dados(matriculas));
    const r = matriculasDoPlano({
      plano,
      exigenciaIds: ["e1"],
      funcionarioIds: ["f1"],
      matriculas,
      empresaId: "emp",
    });
    expect(r.novas).toEqual([]);
    expect(selecaoDaFuncao(plano).funcionarioIds).toEqual([]);
  });

  it("quem ainda não fez o apoio é matriculado nele", () => {
    const plano = planoDaFuncao(dados([]));
    const r = matriculasDoPlano({
      plano,
      exigenciaIds: ["e1"],
      funcionarioIds: ["f1"],
      matriculas: [],
      empresaId: "emp",
    });
    expect(r.novas.map((n) => `${n.funcionario_id}>${n.curso_id}`)).toEqual(["f1>apoio"]);
  });

  it("com o curso EAD de volta a aceitar matrícula, o apoio feito não cumpre mais a exigência", () => {
    const [p] = planoDaFuncao(
      dados([concluida("m1", "f1", "apoio", null)], { cursoMatriculavel: aceitaTodos })
    ).pessoas;
    expect(p.itens.e1).toBe("sem_matricula");
    expect(p.faltam).toEqual(["e1"]);
  });
});

describe("idsQueFaltam", () => {
  const plano = planoDaFuncao(
    base({
      funcionarios: [func("f1", "fn1"), func("f2", "fn1"), func("f3", "fn1")],
      treinamentos: [exigencia("e1", "fn1", "m1"), exigencia("e2", "fn1", "m2")],
      cursos: [curso("c1", "m1"), curso("c2", "m2")],
      matriculas: [
        concluida("a", "f1", "c1"), // f1 em dia no e1, falta e2
        concluida("b", "f2", "c1"),
        concluida("c", "f2", "c2"), // f2 em dia nos dois
      ],
    })
  );

  it("quem precisa de pelo menos uma das exigências marcadas", () => {
    expect(idsQueFaltam(plano, ["e1", "e2"]).sort()).toEqual(["f1", "f3"]);
    expect(idsQueFaltam(plano, ["e1"])).toEqual(["f3"]);
    expect(idsQueFaltam(plano, ["e2"]).sort()).toEqual(["f1", "f3"]);
  });

  it("nenhuma exigência marcada: ninguém", () => {
    expect(idsQueFaltam(plano, [])).toEqual([]);
  });
});

describe("selecaoDaFuncao", () => {
  const plano = planoDaFuncao(
    base({
      funcionarios: [func("f1", "fn1"), func("f2", "fn1"), func("f3", "fn1")],
      treinamentos: [
        exigencia("e1", "fn1", "m1"),
        exigencia("e2", "fn1", "m2"),
        exigencia("e3", "fn1", "m3"),
      ],
      cursos: [curso("c1", "m1"), curso("c2", "m2")], // e3 não tem curso no portal
      matriculas: [
        concluida("a", "f1", "c1"),
        concluida("b", "f2", "c1"),
        concluida("c", "f2", "c2"),
      ],
    })
  );

  it("marca os treinamentos com curso e quem falta neles", () => {
    expect(selecaoDaFuncao(plano)).toEqual({
      exigenciaIds: ["e1", "e2"],
      funcionarioIds: ["f1", "f3"],
    });
  });

  it("com pessoas preferidas, só elas e só se faltar algo a elas", () => {
    expect(selecaoDaFuncao(plano, ["f3"]).funcionarioIds).toEqual(["f3"]);
    expect(selecaoDaFuncao(plano, ["f2"]).funcionarioIds).toEqual([]); // f2 está em dia
    expect(selecaoDaFuncao(plano, ["f1", "f3"]).funcionarioIds).toEqual(["f1", "f3"]);
  });

  it("função sem exigência ou sem plano: nada marcado", () => {
    expect(selecaoDaFuncao(planoDaFuncao(base()))).toEqual({
      exigenciaIds: [],
      funcionarioIds: [],
    });
    expect(selecaoDaFuncao(null)).toEqual({ exigenciaIds: [], funcionarioIds: [] });
  });
});

describe("rotuloDaSituacao", () => {
  it("texto de tela para cada situação", () => {
    expect(rotuloDaSituacao("em_dia")).toBe("em dia");
    expect(rotuloDaSituacao("em_andamento")).toBe("em andamento");
    expect(rotuloDaSituacao("vencida")).toBe("vencida");
    expect(rotuloDaSituacao("revogada")).toBe("certificado revogado");
    expect(rotuloDaSituacao("sem_matricula")).toBe("sem matrícula");
    expect(rotuloDaSituacao("apoio_feito")).toBe("apoio feito (sem certificado)");
    expect(rotuloDaSituacao("apoio_em_andamento")).toBe("apoio em andamento (sem certificado)");
    expect(rotuloDaSituacao(undefined)).toBe("sem matrícula");
  });
});

describe("matriculasDoPlano", () => {
  const plano = planoDaFuncao(
    base({
      funcionarios: [func("f1", "fn1"), func("f2", "fn1"), func("f3", "fn1")],
      treinamentos: [exigencia("e1", "fn1", "m1"), exigencia("e2", "fn1", "m2")],
      cursos: [curso("c1", "m1"), curso("c2", "m2")],
      matriculas: [concluida("a", "f1", "c1")],
    })
  );
  const chaves = (r) => r.novas.map((n) => `${n.funcionario_id}>${n.curso_id}`).sort();

  it("cria só as matrículas que faltam, uma por pessoa e curso", () => {
    const r = matriculasDoPlano({
      plano,
      exigenciaIds: ["e1", "e2"],
      funcionarioIds: ["f1", "f2", "f3"],
      matriculas: [concluida("a", "f1", "c1")],
      empresaId: "emp",
    });
    expect(chaves(r)).toEqual(["f1>c2", "f2>c1", "f2>c2", "f3>c1", "f3>c2"]);
    expect(r.novas[0]).toMatchObject({ empresa_id: "emp", status: "pendente" });
  });

  it("só as exigências marcadas", () => {
    const r = matriculasDoPlano({
      plano,
      exigenciaIds: ["e2"],
      funcionarioIds: ["f1", "f2"],
      matriculas: [],
      empresaId: "emp",
    });
    expect(chaves(r)).toEqual(["f1>c2", "f2>c2"]);
  });

  it("só as pessoas marcadas, e quem não precisa do curso fica de fora mesmo se marcado", () => {
    const r = matriculasDoPlano({
      plano,
      exigenciaIds: ["e1"],
      funcionarioIds: ["f1", "f3"],
      matriculas: [],
      empresaId: "emp",
    });
    expect(chaves(r)).toEqual(["f3>c1"]);
  });

  it("não cria matrícula que já existe aberta (o estado da tela pode estar velho)", () => {
    const r = matriculasDoPlano({
      plano,
      exigenciaIds: ["e1"],
      funcionarioIds: ["f3"],
      matriculas: [mat("x", "f3", "c1")],
      empresaId: "emp",
    });
    expect(r.novas).toEqual([]);
    expect(r.ignorados).toBe(1);
  });

  it("todas as linhas têm as mesmas chaves (o bulkCreate exige)", () => {
    const r = matriculasDoPlano({
      plano,
      exigenciaIds: ["e1", "e2"],
      funcionarioIds: ["f2", "f3"],
      matriculas: [],
      empresaId: "emp",
    });
    expect(new Set(r.novas.map((n) => Object.keys(n).join())).size).toBe(1);
  });

  it("exigência sem curso disponível não gera nada", () => {
    const semCurso = planoDaFuncao(
      base({
        funcionarios: [func("f1", "fn1")],
        treinamentos: [exigencia("e1", "fn1", "m1")],
      })
    );
    const r = matriculasDoPlano({
      plano: semCurso,
      exigenciaIds: ["e1"],
      funcionarioIds: ["f1"],
      matriculas: [],
      empresaId: "emp",
    });
    expect(r.novas).toEqual([]);
  });

  describe("tipo do treinamento (T23)", () => {
    // f1 concluiu c1 e c2 há muito tempo (vencidos); f2 nunca fez nada
    const vencidas = [
      concluida("a", "f1", "c1", "2026-01-01"),
      concluida("b", "f1", "c2", "2026-01-01"),
    ];
    const planoComVencidas = planoDaFuncao(
      base({
        funcionarios: [func("f1", "fn1"), func("f2", "fn1")],
        treinamentos: [exigencia("e1", "fn1", "m1"), exigencia("e2", "fn1", "m2")],
        cursos: [curso("c1", "m1"), curso("c2", "m2")],
        matriculas: vencidas,
      })
    );
    const gerar = (extra = {}) =>
      matriculasDoPlano({
        plano: planoComVencidas,
        exigenciaIds: ["e1", "e2"],
        funcionarioIds: ["f1", "f2"],
        matriculas: vencidas,
        empresaId: "emp",
        ...extra,
      });
    const tipos = (r) => r.novas.map((n) => `${n.funcionario_id}>${n.curso_id}:${n.tipo}`).sort();

    it("sem escolha é o automático: renovação de quem já fez é periódica, a primeira vez é inicial", () => {
      expect(tipos(gerar())).toEqual([
        "f1>c1:periodico",
        "f1>c2:periodico",
        "f2>c1:inicial",
        "f2>c2:inicial",
      ]);
    });

    it("a escolha do RH vale para todas as linhas do plano, com o motivo só no eventual", () => {
      const eventual = gerar({ tipo: "eventual", motivo: "Mudança de equipamento" });
      expect(eventual.novas).toHaveLength(4);
      for (const n of eventual.novas) {
        expect(n.tipo).toBe("eventual");
        expect(n.motivo_eventual).toBe("Mudança de equipamento");
      }
      const inicial = gerar({ tipo: "inicial", motivo: "sobrou" });
      for (const n of inicial.novas) {
        expect(n.tipo).toBe("inicial");
        expect(n.motivo_eventual).toBeNull();
      }
    });
  });
});

describe("sugestaoDeMatricula", () => {
  it("admissão: funcionário novo com função sugere matricular", () => {
    expect(sugestaoDeMatricula({ anterior: null, atual: func("f1", "fn1") })).toEqual({
      motivo: "admissao",
      funcionarioId: "f1",
      funcaoId: "fn1",
    });
  });

  it("troca de função sugere matricular na função nova", () => {
    expect(sugestaoDeMatricula({ anterior: func("f1", "fn1"), atual: func("f1", "fn2") })).toEqual({
      motivo: "troca_de_funcao",
      funcionarioId: "f1",
      funcaoId: "fn2",
    });
  });

  it("sem mudança de função: nada a sugerir", () => {
    expect(
      sugestaoDeMatricula({ anterior: func("f1", "fn1"), atual: func("f1", "fn1") })
    ).toBeNull();
  });

  it("sem função, ou funcionário inativo: nada a sugerir", () => {
    expect(sugestaoDeMatricula({ anterior: null, atual: func("f1", null) })).toBeNull();
    expect(
      sugestaoDeMatricula({ anterior: null, atual: func("f1", "fn1", { ativo: false }) })
    ).toBeNull();
    expect(
      sugestaoDeMatricula({ anterior: func("f1", "fn1"), atual: func("f1", null) })
    ).toBeNull();
  });

  it("sem registro do funcionário: nada a sugerir", () => {
    expect(sugestaoDeMatricula({ anterior: null, atual: null })).toBeNull();
    expect(sugestaoDeMatricula({})).toBeNull();
  });

  it("função que aparece pela primeira vez num funcionário já existente conta como troca", () => {
    expect(
      sugestaoDeMatricula({ anterior: func("f1", null), atual: func("f1", "fn1") })?.motivo
    ).toBe("troca_de_funcao");
  });
});

describe("textoDaSugestao", () => {
  it("diz o motivo e para quem", () => {
    expect(textoDaSugestao({ motivo: "admissao" }, "Ana Souza")).toContain("Ana Souza");
    expect(textoDaSugestao({ motivo: "admissao" }, "Ana Souza")).toMatch(/cadastrad/i);
    expect(textoDaSugestao({ motivo: "troca_de_funcao" }, "Ana Souza")).toMatch(/função/i);
  });

  it("sem nome, ainda faz sentido", () => {
    expect(textoDaSugestao({ motivo: "admissao" }, "")).toMatch(/Funcionário/);
  });
});
