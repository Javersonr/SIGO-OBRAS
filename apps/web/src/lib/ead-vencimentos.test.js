import { describe, it, expect } from "vitest";
import {
  JANELA_VENCIMENTO_DIAS,
  DIAS_DO_AVISO_DIARIO,
  hojeEmBrasilia,
  diasParaVencer,
  faixaDoVencimento,
  matriculaValida,
  selecionarVencimentos,
  precisaDeAviso,
  atividadeSemTreinamento,
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

  it("curso de apoio, semipresencial, rascunho ou removido não habilita ninguém", () => {
    const r = atividadeSemTreinamento({
      ...base,
      cursos: [
        curso("c1", { modelo_treinamento_id: "m1", modalidade: "apoio" }),
        curso("c2", { modelo_treinamento_id: "m2", modalidade: "semipresencial" }),
        curso("c3", { modelo_treinamento_id: "m1", ativo: false }),
        curso("c4", { modelo_treinamento_id: "m1", deleted_at: "2026-09-01" }),
      ],
      matriculas: [],
    });
    // nenhuma exigência tem curso EAD publicado: o EAD não sabe julgar, ninguém é alertado
    expect(r).toEqual([]);
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
