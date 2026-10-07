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
});
