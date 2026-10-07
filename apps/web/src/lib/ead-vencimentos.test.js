import { describe, it, expect } from "vitest";
import {
  JANELA_VENCIMENTO_DIAS,
  DIAS_DO_AVISO_DIARIO,
  hojeEmBrasilia,
  diasParaVencer,
  faixaDoVencimento,
  matriculaValida,
  selecionarVencimentos,
  conclusoesVigentes,
  exigenciasPorFuncao,
  precisaDeAviso,
  atividadeSemTreinamento,
  tentativasEsgotadas,
  rotuloDoVencimento,
  rotuloDoMotivo,
} from "./ead-vencimentos";

// Dados sintéticos (nenhum nome, CPF ou id real). "Hoje" fixo: 2026-10-06.
const HOJE = "2026-10-06";

const func = (id, extra = {}) => ({
  id,
  nome_completo: `Funcionário ${id}`,
  ativo: true,
  ...extra,
});
const curso = (id, extra = {}) => ({ id, nome: `Curso ${id}`, ativo: true, ...extra });
const mat = (id, funcionario_id, curso_id, extra = {}) => ({
  id,
  funcionario_id,
  curso_id,
  status: "concluido",
  proxima_renovacao: "2026-12-01",
  ...extra,
});

describe("hojeEmBrasilia", () => {
  it("devolve o dia de Brasília, não o de UTC (23h30 em Brasília já é o dia seguinte em UTC)", () => {
    // 2026-10-07T02:30Z = 2026-10-06 23:30 em Brasília
    expect(hojeEmBrasilia(new Date("2026-10-07T02:30:00Z"))).toBe("2026-10-06");
  });

  it("depois da meia-noite de Brasília vira o dia seguinte", () => {
    // 2026-10-07T03:10Z = 2026-10-07 00:10 em Brasília
    expect(hojeEmBrasilia(new Date("2026-10-07T03:10:00Z"))).toBe("2026-10-07");
  });
});

describe("diasParaVencer", () => {
  it("conta dias de calendário até a data de renovação", () => {
    expect(diasParaVencer("2026-11-05", HOJE)).toBe(30);
    expect(diasParaVencer("2026-10-07", HOJE)).toBe(1);
  });

  it("vence hoje = 0 e data passada é negativa", () => {
    expect(diasParaVencer(HOJE, HOJE)).toBe(0);
    expect(diasParaVencer("2026-10-01", HOJE)).toBe(-5);
  });

  it("aceita timestamp (usa só os 10 primeiros caracteres)", () => {
    expect(diasParaVencer("2026-10-16T00:00:00+00:00", HOJE)).toBe(10);
  });

  it("virada de ano e ano bissexto", () => {
    expect(diasParaVencer("2027-01-01", "2026-12-31")).toBe(1);
    expect(diasParaVencer("2028-03-01", "2028-02-28")).toBe(2);
  });

  it("data vazia ou inválida devolve null", () => {
    expect(diasParaVencer(null, HOJE)).toBeNull();
    expect(diasParaVencer("", HOJE)).toBeNull();
    expect(diasParaVencer("amanhã", HOJE)).toBeNull();
    expect(diasParaVencer("2026-13-45", HOJE)).toBeNull();
    expect(diasParaVencer("2026-02-30", HOJE)).toBeNull();
  });
});

describe("faixaDoVencimento", () => {
  it("classifica nas faixas 30/60/90 (limites inclusivos) e vencido", () => {
    expect(faixaDoVencimento(-1)).toBe("vencido");
    expect(faixaDoVencimento(0)).toBe("ate30");
    expect(faixaDoVencimento(30)).toBe("ate30");
    expect(faixaDoVencimento(31)).toBe("ate60");
    expect(faixaDoVencimento(60)).toBe("ate60");
    expect(faixaDoVencimento(61)).toBe("ate90");
    expect(faixaDoVencimento(90)).toBe("ate90");
  });

  it("além da janela, ou sem dias, não tem faixa", () => {
    expect(faixaDoVencimento(91)).toBeNull();
    expect(faixaDoVencimento(null)).toBeNull();
  });

  it("a janela e o aviso diário seguem as constantes", () => {
    expect(JANELA_VENCIMENTO_DIAS).toBe(90);
    expect(DIAS_DO_AVISO_DIARIO).toBe(30);
  });
});

describe("matriculaValida", () => {
  it("concluída sem validade (curso que não vence) vale", () => {
    expect(matriculaValida(mat("m", "f", "c", { proxima_renovacao: null }), false, HOJE)).toBe(
      true
    );
  });

  it("concluída com renovação hoje ou depois vale; ontem já não vale", () => {
    expect(matriculaValida(mat("m", "f", "c", { proxima_renovacao: HOJE }), false, HOJE)).toBe(
      true
    );
    expect(
      matriculaValida(mat("m", "f", "c", { proxima_renovacao: "2026-10-05" }), false, HOJE)
    ).toBe(false);
  });

  it("certificado revogado invalida, mesmo dentro do prazo", () => {
    expect(matriculaValida(mat("m", "f", "c"), true, HOJE)).toBe(false);
  });

  it("matrícula em andamento ou pendente conta como matrícula válida", () => {
    expect(matriculaValida(mat("m", "f", "c", { status: "pendente" }), false, HOJE)).toBe(true);
    expect(matriculaValida(mat("m", "f", "c", { status: "em_andamento" }), false, HOJE)).toBe(true);
  });

  it("matrícula removida (deleted_at) nunca vale", () => {
    expect(matriculaValida(mat("m", "f", "c", { deleted_at: "2026-10-01" }), false, HOJE)).toBe(
      false
    );
  });
});

describe("selecionarVencimentos", () => {
  const base = {
    funcionarios: [func("f1"), func("f2"), func("f3")],
    cursos: [curso("c1"), curso("c2")],
    certificados: [],
    hoje: HOJE,
  };

  it("lista vencidos e a vencer em 30/60/90 dias, ordenados pela data", () => {
    const r = selecionarVencimentos({
      ...base,
      matriculas: [
        mat("a", "f1", "c1", { proxima_renovacao: "2026-12-20" }), // 75 dias: ate90
        mat("b", "f2", "c1", { proxima_renovacao: "2026-09-20" }), // -16: vencido
        mat("c", "f3", "c1", { proxima_renovacao: "2026-10-26" }), // 20: ate30
        mat("d", "f1", "c2", { proxima_renovacao: "2026-11-25" }), // 50: ate60
      ],
    });
    expect(r.itens.map((i) => [i.matricula.id, i.faixa, i.dias])).toEqual([
      ["b", "vencido", -16],
      ["c", "ate30", 20],
      ["d", "ate60", 50],
      ["a", "ate90", 75],
    ]);
    expect(r.resumo).toMatchObject({ vencidos: 1, ate30: 1, ate60: 1, ate90: 1, total: 4 });
  });

  it("fora da janela de 90 dias não entra", () => {
    const r = selecionarVencimentos({
      ...base,
      matriculas: [mat("a", "f1", "c1", { proxima_renovacao: "2027-01-05" })], // 91 dias
    });
    expect(r.itens).toEqual([]);
    expect(r.resumo.total).toBe(0);
  });

  it("curso que não vence (renovação nula) e matrícula não concluída ficam de fora", () => {
    const r = selecionarVencimentos({
      ...base,
      matriculas: [
        mat("a", "f1", "c1", { proxima_renovacao: null }),
        mat("b", "f2", "c1", { status: "em_andamento", proxima_renovacao: "2026-10-10" }),
        mat("c", "f3", "c1", { status: "pendente", proxima_renovacao: "2026-10-10" }),
      ],
    });
    expect(r.itens).toEqual([]);
  });

  it("matrícula removida, funcionário inativo ou ausente e curso removido ficam de fora", () => {
    const r = selecionarVencimentos({
      funcionarios: [func("f1"), func("f2", { ativo: false })],
      cursos: [curso("c1"), curso("c2", { deleted_at: "2026-09-01" })],
      certificados: [],
      hoje: HOJE,
      matriculas: [
        mat("a", "f1", "c1", { deleted_at: "2026-09-30" }),
        mat("b", "f2", "c1"),
        mat("c", "f9", "c1"),
        mat("d", "f1", "c2"),
        mat("e", "f1", "c9"),
      ],
    });
    expect(r.itens).toEqual([]);
  });

  it("curso de apoio não renova: a data gravada numa matrícula antiga não aparece", () => {
    const r = selecionarVencimentos({
      ...base,
      cursos: [curso("c1", { modalidade: "apoio" })],
      matriculas: [mat("a", "f1", "c1", { proxima_renovacao: "2026-10-20" })],
    });
    expect(r.itens).toEqual([]);
  });

  it("certificado revogado tira a matrícula do painel (não há o que renovar)", () => {
    const r = selecionarVencimentos({
      ...base,
      certificados: [{ matricula_id: "a", revogado_em: "2026-10-01T10:00:00Z" }],
      matriculas: [mat("a", "f1", "c1", { proxima_renovacao: "2026-10-20" })],
    });
    expect(r.itens).toEqual([]);
  });

  it("certificado emitido e não revogado não muda nada", () => {
    const r = selecionarVencimentos({
      ...base,
      certificados: [{ matricula_id: "a", revogado_em: null }],
      matriculas: [mat("a", "f1", "c1", { proxima_renovacao: "2026-10-20" })],
    });
    expect(r.itens).toHaveLength(1);
  });

  it("sem nova matrícula = renovação 'sem'; com matrícula aberta no mesmo curso = 'andamento'", () => {
    const r = selecionarVencimentos({
      ...base,
      matriculas: [
        mat("a", "f1", "c1", { proxima_renovacao: "2026-10-20" }),
        mat("b", "f2", "c1", { proxima_renovacao: "2026-10-20" }),
        mat("b2", "f2", "c1", { status: "pendente", proxima_renovacao: null }),
        mat("c", "f3", "c1", { proxima_renovacao: "2026-10-20" }),
        // matrícula aberta de OUTRO curso não renova este
        mat("c2", "f3", "c2", { status: "em_andamento", proxima_renovacao: null }),
      ],
    });
    const por = Object.fromEntries(r.itens.map((i) => [i.matricula.id, i.renovacao]));
    expect(por).toEqual({ a: "sem", b: "andamento", c: "sem" });
    expect(r.resumo.semRenovacao).toBe(2);
  });

  it("matrícula aberta removida não conta como renovação", () => {
    const r = selecionarVencimentos({
      ...base,
      matriculas: [
        mat("a", "f1", "c1", { proxima_renovacao: "2026-10-20" }),
        mat("a2", "f1", "c1", {
          status: "pendente",
          proxima_renovacao: null,
          deleted_at: "2026-10-02",
        }),
      ],
    });
    expect(r.itens[0].renovacao).toBe("sem");
  });

  it("depois de renovar, só a conclusão mais recente do mesmo curso aparece (a antiga é histórico)", () => {
    const r = selecionarVencimentos({
      ...base,
      matriculas: [
        mat("velha", "f1", "c1", { proxima_renovacao: "2026-09-01" }),
        mat("nova", "f1", "c1", { proxima_renovacao: "2028-09-01" }),
      ],
    });
    // a nova está fora da janela e a velha foi substituída por ela: nada a mostrar
    expect(r.itens).toEqual([]);
  });

  it("empate de renovação entre duas concluídas escolhe a criada por último", () => {
    const r = selecionarVencimentos({
      ...base,
      matriculas: [
        mat("x", "f1", "c1", { proxima_renovacao: "2026-10-20", created_at: "2026-01-01" }),
        mat("y", "f1", "c1", { proxima_renovacao: "2026-10-20", created_at: "2026-02-01" }),
      ],
    });
    expect(r.itens.map((i) => i.matricula.id)).toEqual(["y"]);
  });

  it("desempata por funcionário e curso quando a data é a mesma", () => {
    const r = selecionarVencimentos({
      funcionarios: [func("f1", { nome_completo: "Beta" }), func("f2", { nome_completo: "Alfa" })],
      cursos: [curso("c1", { nome: "Curso Z" }), curso("c2", { nome: "Curso A" })],
      certificados: [],
      hoje: HOJE,
      matriculas: [
        mat("a", "f1", "c1", { proxima_renovacao: "2026-10-20" }),
        mat("b", "f2", "c1", { proxima_renovacao: "2026-10-20" }),
        mat("c", "f2", "c2", { proxima_renovacao: "2026-10-20" }),
      ],
    });
    expect(r.itens.map((i) => i.matricula.id)).toEqual(["c", "b", "a"]);
  });

  it("entradas ausentes não quebram", () => {
    const r = selecionarVencimentos({ hoje: HOJE });
    expect(r.itens).toEqual([]);
    expect(r.resumo).toEqual({
      vencidos: 0,
      ate30: 0,
      ate60: 0,
      ate90: 0,
      semRenovacao: 0,
      total: 0,
    });
  });

  it("vence hoje ainda está a vencer (0 dias), não vencido", () => {
    const r = selecionarVencimentos({
      ...base,
      matriculas: [mat("a", "f1", "c1", { proxima_renovacao: HOJE })],
    });
    expect(r.itens[0]).toMatchObject({ dias: 0, faixa: "ate30" });
  });
});

describe("conclusoesVigentes", () => {
  const dados = (matriculas, extra = {}) => ({
    matriculas,
    cursos: [curso("c1"), curso("c-apoio", { modalidade: "apoio" })],
    funcionarios: [func("f1"), func("f2", { ativo: false })],
    certificados: [],
    ...extra,
  });
  const ids = (mapa) => [...mapa.values()].map((m) => m.id).sort();

  it("por funcionário e curso fica a conclusão de renovação mais distante", () => {
    const r = conclusoesVigentes(
      dados([
        mat("antiga", "f1", "c1", { proxima_renovacao: "2026-10-01" }),
        mat("nova", "f1", "c1", { proxima_renovacao: "2028-10-01" }),
      ])
    );
    expect(ids(r)).toEqual(["nova"]);
    expect(r.get("f1|c1").id).toBe("nova");
  });

  it("empate de data: vale a criada por último", () => {
    const r = conclusoesVigentes(
      dados([
        mat("a", "f1", "c1", { created_at: "2026-01-01T00:00:00Z" }),
        mat("b", "f1", "c1", { created_at: "2026-02-01T00:00:00Z" }),
      ])
    );
    expect(ids(r)).toEqual(["b"]);
  });

  it("deixa de fora não concluída, sem data, revogada, de apoio, de inativo e excluída", () => {
    const r = conclusoesVigentes(
      dados(
        [
          mat("aberta", "f1", "c1", { status: "em_andamento" }),
          mat("sem-data", "f1", "c1", { proxima_renovacao: null }),
          mat("revogada", "f1", "c1"),
          mat("apoio", "f1", "c-apoio"),
          mat("inativo", "f2", "c1"),
          mat("excluida", "f1", "c1", { deleted_at: "2026-09-01T00:00:00Z" }),
        ],
        { certificados: [{ matricula_id: "revogada", revogado_em: "2026-10-01T00:00:00Z" }] }
      )
    );
    expect(ids(r)).toEqual([]);
  });
});

describe("exigenciasPorFuncao", () => {
  const t = (id, funcao_id, modelo, extra = {}) => ({
    id,
    funcao_id,
    modelo_treinamento_id: modelo,
    ativo: true,
    obrigatorio: true,
    ...extra,
  });

  it("agrupa por função, uma por modelo", () => {
    const r = exigenciasPorFuncao([t("a", "fn1", "m1"), t("b", "fn1", "m1"), t("c", "fn1", "m2")]);
    expect(r.get("fn1").map((e) => e.id)).toEqual(["a", "c"]);
  });

  it("opcional, inativa, excluída, sem função ou sem modelo não entram", () => {
    const r = exigenciasPorFuncao([
      t("a", "fn1", "m1", { obrigatorio: false }),
      t("b", "fn1", "m2", { ativo: false }),
      t("c", "fn1", "m3", { deleted_at: "2026-09-01T00:00:00Z" }),
      t("d", null, "m4"),
      t("e", "fn1", null),
    ]);
    expect(r.size).toBe(0);
  });

  it("sem lista: mapa vazio", () => {
    expect(exigenciasPorFuncao(undefined).size).toBe(0);
  });
});

describe("precisaDeAviso (regra do aviso diário do banco)", () => {
  const item = (dias, renovacao) => ({ dias, renovacao });
  it("vencido ou vencendo em até 30 dias, sem nova matrícula", () => {
    expect(precisaDeAviso(item(-3, "sem"))).toBe(true);
    expect(precisaDeAviso(item(0, "sem"))).toBe(true);
    expect(precisaDeAviso(item(30, "sem"))).toBe(true);
  });
  it("com renovação em andamento ou além de 30 dias, não avisa", () => {
    expect(precisaDeAviso(item(-3, "andamento"))).toBe(false);
    expect(precisaDeAviso(item(31, "sem"))).toBe(false);
  });
});

describe("atividadeSemTreinamento", () => {
  // F1 exige o modelo M1 (curso EAD c1) e o modelo M2 (curso EAD c2); F2, a mesma função, idem.
  const exigencia = (id, funcao_id, modelo, extra = {}) => ({
    id,
    funcao_id,
    modelo_treinamento_id: modelo,
    ativo: true,
    obrigatorio: true,
    ...extra,
  });
  const base = {
    funcionarios: [
      func("f1", { funcao_id: "fn1" }),
      func("f2", { funcao_id: "fn1" }),
      func("f3", { funcao_id: "fn2" }),
      func("f4"),
    ],
    treinamentos: [
      exigencia("t1", "fn1", "m1"),
      exigencia("t2", "fn1", "m2"),
      exigencia("t3", "fn2", "m3"),
    ],
    cursos: [
      curso("c1", { modelo_treinamento_id: "m1" }),
      curso("c2", { modelo_treinamento_id: "m2" }),
    ],
    certificados: [],
    hoje: HOJE,
  };

  it("funcionário sem matrícula nos cursos da função aparece com os cursos faltantes", () => {
    const r = atividadeSemTreinamento({ ...base, matriculas: [] });
    const f1 = r.find((x) => x.funcionario.id === "f1");
    expect(f1.pendencias.map((p) => [p.exigencia.id, p.motivo])).toEqual([
      ["t1", "sem_matricula"],
      ["t2", "sem_matricula"],
    ]);
    expect(f1.pendencias[0].cursos.map((c) => c.id)).toEqual(["c1"]);
  });

  it("função sem curso EAD (modelo m3) não gera alerta: o EAD não tem como saber", () => {
    const r = atividadeSemTreinamento({ ...base, matriculas: [] });
    expect(r.find((x) => x.funcionario.id === "f3")).toBeUndefined();
  });

  it("funcionário sem função não gera alerta", () => {
    const r = atividadeSemTreinamento({ ...base, matriculas: [] });
    expect(r.find((x) => x.funcionario.id === "f4")).toBeUndefined();
  });

  it("matrícula concluída e vigente, ou em andamento, resolve a exigência", () => {
    const r = atividadeSemTreinamento({
      ...base,
      matriculas: [
        mat("a", "f1", "c1", { proxima_renovacao: "2027-01-01" }),
        mat("b", "f1", "c2", { status: "em_andamento", proxima_renovacao: null }),
      ],
    });
    expect(r.find((x) => x.funcionario.id === "f1")).toBeUndefined();
    expect(r.find((x) => x.funcionario.id === "f2")).toBeDefined();
  });

  it("matrícula concluída que venceu (sem outra aberta) volta a ser pendência 'vencida'", () => {
    const r = atividadeSemTreinamento({
      ...base,
      matriculas: [
        mat("a", "f1", "c1", { proxima_renovacao: "2026-09-30" }),
        mat("b", "f1", "c2", { proxima_renovacao: null }),
      ],
    });
    const f1 = r.find((x) => x.funcionario.id === "f1");
    expect(f1.pendencias.map((p) => [p.exigencia.id, p.motivo])).toEqual([["t1", "vencida"]]);
  });

  it("vencida mas com matrícula de renovação aberta já está resolvida", () => {
    const r = atividadeSemTreinamento({
      ...base,
      matriculas: [
        mat("a", "f1", "c1", { proxima_renovacao: "2026-09-30" }),
        mat("a2", "f1", "c1", { status: "pendente", proxima_renovacao: null }),
        mat("b", "f1", "c2", { proxima_renovacao: null }),
      ],
    });
    expect(r.find((x) => x.funcionario.id === "f1")).toBeUndefined();
  });

  it("certificado revogado vira pendência 'revogada'", () => {
    const r = atividadeSemTreinamento({
      ...base,
      certificados: [{ matricula_id: "a", revogado_em: "2026-10-02T00:00:00Z" }],
      matriculas: [
        mat("a", "f1", "c1", { proxima_renovacao: "2027-01-01" }),
        mat("b", "f1", "c2", { proxima_renovacao: null }),
      ],
    });
    const f1 = r.find((x) => x.funcionario.id === "f1");
    expect(f1.pendencias.map((p) => [p.exigencia.id, p.motivo])).toEqual([["t1", "revogada"]]);
  });

  it("matrícula removida não vale", () => {
    const r = atividadeSemTreinamento({
      ...base,
      matriculas: [
        mat("a", "f1", "c1", { deleted_at: "2026-10-01" }),
        mat("b", "f1", "c2", { proxima_renovacao: null }),
      ],
    });
    const f1 = r.find((x) => x.funcionario.id === "f1");
    expect(f1.pendencias.map((p) => p.exigencia.id)).toEqual(["t1"]);
  });

  it("matrícula de outro funcionário ou de outro curso não resolve", () => {
    const r = atividadeSemTreinamento({
      ...base,
      matriculas: [mat("a", "f2", "c1"), mat("b", "f1", "c9")],
    });
    expect(r.find((x) => x.funcionario.id === "f1").pendencias).toHaveLength(2);
  });

  it("curso de apoio, rascunho ou removido não habilita ninguém", () => {
    const r = atividadeSemTreinamento({
      ...base,
      cursos: [
        curso("c1", { modelo_treinamento_id: "m1", modalidade: "apoio" }),
        curso("c3", { modelo_treinamento_id: "m1", ativo: false }),
        curso("c4", { modelo_treinamento_id: "m1", deleted_at: "2026-09-01" }),
      ],
      matriculas: [],
    });
    // nenhuma exigência tem curso EAD publicado: o EAD não sabe julgar, ninguém é alertado
    expect(r).toEqual([]);
  });

  it("T12: o curso semipresencial publicado habilita a exigência (ele emite certificado, com a prática)", () => {
    const r = atividadeSemTreinamento({
      ...base,
      cursos: [curso("c2", { modelo_treinamento_id: "m2", modalidade: "semipresencial" })],
      matriculas: [],
    });
    const f1 = r.find((x) => x.funcionario.id === "f1");
    expect(f1.pendencias.map((p) => [p.exigencia.id, p.motivo])).toEqual([["t2", "sem_matricula"]]);
    expect(f1.pendencias[0].cursos.map((c) => c.id)).toEqual(["c2"]);
  });

  it("a exigência fica satisfeita por qualquer um dos cursos EAD ligados ao mesmo modelo", () => {
    const r = atividadeSemTreinamento({
      ...base,
      treinamentos: [exigencia("t1", "fn1", "m1")],
      cursos: [
        curso("c1", { modelo_treinamento_id: "m1" }),
        curso("c1b", { modelo_treinamento_id: "m1" }),
      ],
      matriculas: [mat("a", "f1", "c1b", { proxima_renovacao: null })],
    });
    expect(r.find((x) => x.funcionario.id === "f1")).toBeUndefined();
    const f2 = r.find((x) => x.funcionario.id === "f2");
    expect(f2.pendencias[0].cursos.map((c) => c.id)).toEqual(["c1", "c1b"]);
  });

  describe("curso despublicado do mesmo modelo (A6): o certificado já emitido não perde a validade", () => {
    // M1 tem a versão antiga (despublicada, c1old) e a nova (publicada, c1); só a nova aceita matrícula agora
    const comVersaoAntiga = {
      ...base,
      treinamentos: [exigencia("t1", "fn1", "m1")],
      cursos: [
        curso("c1", { modelo_treinamento_id: "m1" }),
        curso("c1old", { modelo_treinamento_id: "m1", ativo: false }),
      ],
    };

    it("conclusão válida no curso despublicado resolve a exigência (o painel Vencimentos já a mostra)", () => {
      const r = atividadeSemTreinamento({
        ...comVersaoAntiga,
        matriculas: [mat("a", "f1", "c1old", { proxima_renovacao: "2028-05-01" })],
      });
      expect(r.find((x) => x.funcionario.id === "f1")).toBeUndefined();
      // quem não fez continua pendente, e o botão de matricular só oferece o curso PUBLICADO
      const f2 = r.find((x) => x.funcionario.id === "f2");
      expect(f2.pendencias[0].cursos.map((c) => c.id)).toEqual(["c1"]);
    });

    it("conclusão vencida no despublicado é 'vencida' (e não 'sem matrícula')", () => {
      const r = atividadeSemTreinamento({
        ...comVersaoAntiga,
        matriculas: [mat("a", "f1", "c1old", { proxima_renovacao: "2026-09-30" })],
      });
      const f1 = r.find((x) => x.funcionario.id === "f1");
      expect(f1.pendencias.map((p) => [p.exigencia.id, p.motivo])).toEqual([["t1", "vencida"]]);
      expect(f1.pendencias[0].cursos.map((c) => c.id)).toEqual(["c1"]);
    });

    it("certificado revogado no despublicado é 'revogada'", () => {
      const r = atividadeSemTreinamento({
        ...comVersaoAntiga,
        certificados: [{ matricula_id: "a", revogado_em: "2026-10-02T00:00:00Z" }],
        matriculas: [mat("a", "f1", "c1old", { proxima_renovacao: "2028-05-01" })],
      });
      const f1 = r.find((x) => x.funcionario.id === "f1");
      expect(f1.pendencias.map((p) => p.motivo)).toEqual(["revogada"]);
    });

    it("matrícula em andamento no despublicado também conta como válida", () => {
      const r = atividadeSemTreinamento({
        ...comVersaoAntiga,
        matriculas: [mat("a", "f1", "c1old", { status: "em_andamento", proxima_renovacao: null })],
      });
      expect(r.find((x) => x.funcionario.id === "f1")).toBeUndefined();
    });

    it("curso despublicado de APOIO ou removido não cumpre a exigência", () => {
      const r = atividadeSemTreinamento({
        ...comVersaoAntiga,
        cursos: [
          curso("c1", { modelo_treinamento_id: "m1" }),
          curso("c1apoio", { modelo_treinamento_id: "m1", ativo: false, modalidade: "apoio" }),
          curso("c1apagado", {
            modelo_treinamento_id: "m1",
            ativo: false,
            deleted_at: "2026-09-01",
          }),
        ],
        matriculas: [
          mat("a", "f1", "c1apoio", { proxima_renovacao: "2028-05-01" }),
          mat("b", "f1", "c1apagado", { proxima_renovacao: "2028-05-01" }),
        ],
      });
      expect(r.find((x) => x.funcionario.id === "f1").pendencias[0].motivo).toBe("sem_matricula");
    });

    it("sem nenhum curso PUBLICADO a exigência continua fora: o despublicado sozinho não a habilita", () => {
      const r = atividadeSemTreinamento({
        ...comVersaoAntiga,
        cursos: [curso("c1old", { modelo_treinamento_id: "m1", ativo: false })],
        matriculas: [],
      });
      expect(r).toEqual([]);
    });
  });

  it("exigência opcional, inativa, removida ou sem modelo não conta", () => {
    const r = atividadeSemTreinamento({
      ...base,
      treinamentos: [
        exigencia("t1", "fn1", "m1", { obrigatorio: false }),
        exigencia("t2", "fn1", "m2", { ativo: false }),
        exigencia("t5", "fn1", "m1", { deleted_at: "2026-09-01" }),
        exigencia("t6", "fn1", null),
      ],
      matriculas: [],
    });
    expect(r).toEqual([]);
  });

  it("obrigatorio nulo conta como obrigatório (a tela de Funções trata só 'false' como opcional)", () => {
    const r = atividadeSemTreinamento({
      ...base,
      treinamentos: [exigencia("t1", "fn1", "m1", { obrigatorio: null })],
      matriculas: [],
    });
    expect(r.find((x) => x.funcionario.id === "f1").pendencias).toHaveLength(1);
  });

  it("duas exigências para o mesmo modelo viram uma pendência só", () => {
    const r = atividadeSemTreinamento({
      ...base,
      treinamentos: [exigencia("t1", "fn1", "m1"), exigencia("t1b", "fn1", "m1")],
      matriculas: [],
    });
    expect(r.find((x) => x.funcionario.id === "f1").pendencias).toHaveLength(1);
  });

  it("funcionário inativo não entra e a lista sai ordenada pelo nome", () => {
    const r = atividadeSemTreinamento({
      ...base,
      funcionarios: [
        func("f1", { funcao_id: "fn1", nome_completo: "Zeca" }),
        func("f2", { funcao_id: "fn1", nome_completo: "Ana" }),
        func("f5", { funcao_id: "fn1", ativo: false }),
      ],
      matriculas: [],
    });
    expect(r.map((x) => x.funcionario.nome_completo)).toEqual(["Ana", "Zeca"]);
  });

  it("entradas ausentes não quebram", () => {
    expect(atividadeSemTreinamento({ hoje: HOJE })).toEqual([]);
  });
});

describe("rotuloDoVencimento", () => {
  it("diz há quantos dias venceu, ou em quantos vence", () => {
    expect(rotuloDoVencimento(-1)).toBe("Vencido há 1 dia");
    expect(rotuloDoVencimento(-16)).toBe("Vencido há 16 dias");
    expect(rotuloDoVencimento(0)).toBe("Vence hoje");
    expect(rotuloDoVencimento(1)).toBe("Vence em 1 dia");
    expect(rotuloDoVencimento(45)).toBe("Vence em 45 dias");
  });
});

describe("rotuloDoMotivo", () => {
  it("traduz o motivo da pendência", () => {
    expect(rotuloDoMotivo("sem_matricula")).toBe("Sem matrícula");
    expect(rotuloDoMotivo("vencida")).toBe("Treinamento vencido, sem nova matrícula");
    expect(rotuloDoMotivo("revogada")).toBe("Certificado revogado, sem nova matrícula");
  });
});

describe("tentativasEsgotadas (A6): o painel mostra quem esgotou, mesmo se o aviso do sino se perder", () => {
  // curso com 3 tentativas; a matrícula pode ter extras liberadas pelo RH
  const cursoDeProva = (extra = {}) => curso("cp", { max_tentativas: 3, ...extra });
  const tent = (matricula_id, numero, extra = {}) => ({
    matricula_id,
    numero,
    nota: 40,
    aprovada: false,
    ...extra,
  });
  const base = {
    funcionarios: [func("f1", { nome_completo: "Zeca" }), func("f2", { nome_completo: "Ana" })],
    cursos: [cursoDeProva()],
  };
  const aberta = (id, funcionario_id, extra = {}) =>
    mat(id, funcionario_id, "cp", { status: "em_andamento", proxima_renovacao: null, ...extra });
  const tres = (id) => [tent(id, 1), tent(id, 2), tent(id, 3)];

  it("lista a matrícula que usou todas as tentativas sem ser aprovada", () => {
    const r = tentativasEsgotadas({
      ...base,
      matriculas: [aberta("a", "f1")],
      tentativas: tres("a"),
    });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ usadas: 3, maximo: 3 });
    expect(r[0].matricula.id).toBe("a");
    expect(r[0].funcionario.id).toBe("f1");
    expect(r[0].curso.id).toBe("cp");
  });

  it("ainda com tentativa sobrando, não lista; as extras liberadas somam ao limite", () => {
    expect(
      tentativasEsgotadas({
        ...base,
        matriculas: [aberta("a", "f1")],
        tentativas: [tent("a", 1), tent("a", 2)],
      })
    ).toEqual([]);
    // 3 usadas, limite 3 + 1 extra liberada pelo RH: ainda pode tentar
    expect(
      tentativasEsgotadas({
        ...base,
        matriculas: [aberta("a", "f1", { tentativas_extras: 1 })],
        tentativas: tres("a"),
      })
    ).toEqual([]);
    // 4 usadas de 3 + 1: esgotou de novo, e o máximo mostrado é 4
    const r = tentativasEsgotadas({
      ...base,
      matriculas: [aberta("a", "f1", { tentativas_extras: 1 })],
      tentativas: [...tres("a"), tent("a", 4)],
    });
    expect(r.map((i) => [i.usadas, i.maximo])).toEqual([[4, 4]]);
  });

  it("quem foi aprovado em alguma tentativa, ou já concluiu, não está esgotado", () => {
    expect(
      tentativasEsgotadas({
        ...base,
        matriculas: [aberta("a", "f1")],
        tentativas: [tent("a", 1), tent("a", 2), tent("a", 3, { aprovada: true })],
      })
    ).toEqual([]);
    expect(
      tentativasEsgotadas({
        ...base,
        matriculas: [mat("a", "f1", "cp", { status: "concluido" })],
        tentativas: tres("a"),
      })
    ).toEqual([]);
  });

  it("curso sem limite (0 ou ausente), matrícula removida e funcionário inativo ou fora da lista não entram", () => {
    const tentativas = [...tres("a"), ...tres("b"), ...tres("c")];
    expect(
      tentativasEsgotadas({
        ...base,
        cursos: [cursoDeProva({ max_tentativas: 0 })],
        matriculas: [aberta("a", "f1")],
        tentativas,
      })
    ).toEqual([]);
    expect(
      tentativasEsgotadas({
        ...base,
        cursos: [cursoDeProva({ max_tentativas: undefined })],
        matriculas: [aberta("a", "f1")],
        tentativas,
      })
    ).toEqual([]);
    expect(
      tentativasEsgotadas({
        ...base,
        matriculas: [aberta("a", "f1", { deleted_at: "2026-10-01" })],
        tentativas,
      })
    ).toEqual([]);
    expect(
      tentativasEsgotadas({
        ...base,
        funcionarios: [func("f1", { ativo: false })],
        matriculas: [aberta("a", "f1"), aberta("b", "f9")],
        tentativas,
      })
    ).toEqual([]);
    // curso removido: o aluno não consegue mais fazer a prova, não há o que liberar
    expect(
      tentativasEsgotadas({
        ...base,
        cursos: [cursoDeProva({ deleted_at: "2026-10-01" })],
        matriculas: [aberta("a", "f1")],
        tentativas,
      })
    ).toEqual([]);
  });

  it("tentativa de outra matrícula não conta, e a lista sai pelo nome do funcionário", () => {
    const r = tentativasEsgotadas({
      ...base,
      matriculas: [aberta("a", "f1"), aberta("b", "f2"), aberta("c", "f2", { curso_id: "cp" })],
      tentativas: [...tres("a"), ...tres("b"), tent("c", 1)],
    });
    expect(r.map((i) => i.funcionario.nome_completo)).toEqual(["Ana", "Zeca"]);
    expect(r.map((i) => i.matricula.id)).toEqual(["b", "a"]);
  });

  it("o curso de apoio também tem prova: entra", () => {
    const r = tentativasEsgotadas({
      ...base,
      cursos: [cursoDeProva({ modalidade: "apoio" })],
      matriculas: [aberta("a", "f1")],
      tentativas: tres("a"),
    });
    expect(r).toHaveLength(1);
  });

  it("entradas ausentes não quebram", () => {
    expect(tentativasEsgotadas()).toEqual([]);
    expect(tentativasEsgotadas({ matriculas: [aberta("a", "f1")] })).toEqual([]);
  });
});
