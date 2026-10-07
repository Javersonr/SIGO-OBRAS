import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi, afterEach } from "vitest";
import VencimentosEadPainel from "./VencimentosEadPainel";

// `@/lib/utils` lê `window` ao ser importado (os componentes de `ui/` passam por ele) e o Vitest daqui roda
// em ambiente node, sem DOM: um `window` vazio basta para o import.
vi.hoisted(() => {
  globalThis.window ??= {};
});

// Renderização inicial do painel com dados sintéticos (sem DOM: só o HTML que sai no primeiro desenho).
// "Hoje" fixo em 06/10/2026 (meio-dia em Brasília) para as faixas não mudarem com o calendário.
afterEach(() => vi.useRealTimers());
function congelarHoje() {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-06T15:00:00Z"));
}

const funcionarios = [
  {
    id: "f1",
    nome_completo: "Ana Teste",
    ativo: true,
    funcao_id: "fn1",
    funcao_nome: "Eletricista",
  },
  {
    id: "f2",
    nome_completo: "Bruno Teste",
    ativo: true,
    funcao_id: "fn1",
    funcao_nome: "Eletricista",
  },
];
const cursos = [{ id: "c1", nome: "Curso Um", ativo: true, modelo_treinamento_id: "m1" }];
const treinamentos = [
  { id: "t1", funcao_id: "fn1", modelo_treinamento_id: "m1", ativo: true, obrigatorio: true },
];

function renderizar(extra = {}) {
  return renderToStaticMarkup(
    <VencimentosEadPainel
      cursos={cursos}
      matriculas={[]}
      certificados={[]}
      funcionarios={funcionarios}
      treinamentos={treinamentos}
      podeMatricular={() => true}
      onMatricular={() => {}}
      {...extra}
    />
  );
}

describe("VencimentosEadPainel", () => {
  it("sem matrículas: mostra o vazio dos vencimentos e a atividade sem treinamento", () => {
    congelarHoje();
    const html = renderizar();
    expect(html).toContain("Vencimentos");
    expect(html).toContain("Nenhum treinamento do portal vencido ou vencendo");
    expect(html).toContain("Atividade sem treinamento (2)");
    expect(html).toContain("Ana Teste");
    expect(html).toContain("Bruno Teste");
    expect(html).toContain("Sem matrícula");
    expect(html).toContain("Curso Um");
    expect(html).toContain("Matricular Ana Teste em Curso Um");
  });

  it("mostra os contadores e a linha do vencimento com o botão de matricular", () => {
    congelarHoje();
    const html = renderizar({
      matriculas: [
        // vencida há 5 dias, sem nova matrícula
        {
          id: "m1",
          funcionario_id: "f1",
          curso_id: "c1",
          status: "concluido",
          proxima_renovacao: "2026-10-01",
        },
        // vence em 20 dias, com renovação já em andamento
        {
          id: "m2",
          funcionario_id: "f2",
          curso_id: "c1",
          status: "concluido",
          proxima_renovacao: "2026-10-26",
        },
        {
          id: "m3",
          funcionario_id: "f2",
          curso_id: "c1",
          status: "pendente",
          proxima_renovacao: null,
        },
      ],
    });
    expect(html).toContain("Vencidos");
    expect(html).toContain("Em até 30 dias");
    expect(html).toContain("Sem nova matrícula");
    expect(html).toContain("Vencido há 5 dias");
    expect(html).toContain("Vence em 20 dias");
    expect(html).toContain("01/10/2026");
    expect(html).toContain("Nova matrícula em andamento");
    // Bruno está renovando e Ana tem a matrícula vencida (concluída): só a Ana volta para "atividade sem treinamento"
    expect(html).toContain("Atividade sem treinamento (1)");
    expect(html).toContain("Treinamento vencido, sem nova matrícula");
    // botão de matricular só onde falta a renovação (a Ana)
    expect(html).toContain("Matricular Ana Teste em Curso Um");
    expect(html).not.toContain("Matricular Bruno Teste em Curso Um");
  });

  it("curso que o painel de matrícula não aceita não ganha o botão", () => {
    congelarHoje();
    const html = renderizar({ podeMatricular: () => false });
    expect(html).toContain("Ana Teste");
    expect(html).not.toContain("Matricular Ana Teste");
  });

  it("tudo em dia: os dois avisos de vazio", () => {
    congelarHoje();
    const html = renderizar({
      matriculas: [
        {
          id: "m1",
          funcionario_id: "f1",
          curso_id: "c1",
          status: "concluido",
          proxima_renovacao: "2028-10-01",
        },
        {
          id: "m2",
          funcionario_id: "f2",
          curso_id: "c1",
          status: "concluido",
          proxima_renovacao: null,
        },
      ],
    });
    expect(html).toContain("Nenhum treinamento do portal vencido ou vencendo");
    expect(html).toContain("Nenhum funcionário ativo sem matrícula válida");
    expect(html).toContain("Atividade sem treinamento (0)");
  });

  describe("revisão do projeto pedagógico (T25)", () => {
    const cursosDoProjeto = [
      // nunca validado
      { id: "c1", nome: "Curso Sem Validação", ativo: true },
      // revisão vencida em 01/10/2026 (5 dias antes de "hoje")
      {
        id: "c2",
        nome: "Curso Vencido",
        ativo: true,
        projeto_validado_em: "2024-10-01",
        projeto_validado_por: "RT Teste",
        proxima_revisao: "2026-10-01",
      },
      // vence em 55 dias
      {
        id: "c3",
        nome: "Curso A Vencer",
        ativo: true,
        projeto_validado_em: "2024-12-01",
        projeto_validado_por: "RT Teste",
        proxima_revisao: "2026-12-01",
      },
      // em dia, rascunho e apoio: fora da lista
      {
        id: "c4",
        nome: "Curso Em Dia",
        ativo: true,
        projeto_validado_em: "2026-09-01",
        projeto_validado_por: "RT Teste",
      },
      { id: "c5", nome: "Curso Rascunho", ativo: false },
      { id: "c6", nome: "Curso Apoio", ativo: true, modalidade: "apoio" },
    ];

    it("lista os projetos sem validação, vencidos e a vencer, com o motivo e o botão de abrir o curso", () => {
      congelarHoje();
      const html = renderizar({ cursos: cursosDoProjeto, onAbrirCurso: () => {} });
      expect(html).toContain("Projeto pedagógico: revisão (3)");
      expect(html).toContain("Curso Sem Validação");
      expect(html).toContain("Sem validação registrada");
      expect(html).toContain("Curso Vencido");
      expect(html).toContain("Revisão vencida há 5 dias");
      expect(html).toContain("Curso A Vencer");
      expect(html).toContain("Revisão vence em 56 dias");
      expect(html).toContain("01/12/2026");
      expect(html).not.toContain("Curso Em Dia");
      expect(html).not.toContain("Curso Rascunho");
      expect(html).not.toContain("Curso Apoio");
      expect(html).toContain("Abrir o curso Curso Vencido");
    });

    it("mostra os contadores: sem validação, vencidas e a vencer", () => {
      congelarHoje();
      const html = renderizar({ cursos: cursosDoProjeto });
      expect(html).toContain("Sem validação");
      expect(html).toContain("Revisão vencida");
      expect(html).toContain("Vencem em até 90 dias");
    });

    it("a ordem põe a revisão vencida antes da que ainda não foi feita", () => {
      congelarHoje();
      const html = renderizar({ cursos: cursosDoProjeto });
      expect(html.indexOf("Curso Vencido")).toBeLessThan(html.indexOf("Curso Sem Validação"));
      expect(html.indexOf("Curso Sem Validação")).toBeLessThan(html.indexOf("Curso A Vencer"));
    });

    it("curso de NR que mudou depois da validação aparece como vencido pela norma", () => {
      congelarHoje();
      const html = renderizar({
        cursos: [
          {
            id: "c1",
            nome: "NR-35 — Trabalho em Altura",
            ativo: true,
            projeto_validado_em: "2025-03-01",
            projeto_validado_por: "RT Teste",
            proxima_revisao: "2027-03-01",
          },
        ],
      });
      expect(html).toContain("A NR-35 mudou em 16/07/2026, depois da última validação");
    });

    it("tudo validado e em dia: aviso de vazio", () => {
      congelarHoje();
      const html = renderizar({ cursos: [cursosDoProjeto[3]] });
      expect(html).toContain("Projeto pedagógico: revisão (0)");
      expect(html).toContain("Nenhum projeto pedagógico pendente de validação ou revisão");
    });
  });
});
