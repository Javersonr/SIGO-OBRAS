import React from "react";
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import PrazoDoCurso from "./PrazoDoCurso";

/**
 * Prazo para concluir e dedicação diária do projeto pedagógico (T25), como o aluno os lê no curso. Só dados
 * fictícios; `hoje` entra por parâmetro para o texto não mudar com o calendário.
 */
const matricula = (extra = {}) => ({
  id: "m1",
  status: "em_andamento",
  created_at: "2026-10-01T15:00:00Z",
  ...extra,
});
const html = (props) => renderToStaticMarkup(<PrazoDoCurso hoje="2026-10-06" {...props} />);

describe("PrazoDoCurso", () => {
  it("mostra o prazo (com a data limite) e a dedicação diária mínima", () => {
    const saida = html({
      item: {
        matricula: matricula(),
        curso: { prazo_conclusao_dias: 30, dedicacao_diaria_min: 90 },
      },
    });
    expect(saida).toContain("Prazo para concluir: até 31/10/2026 (faltam 25 dias)");
    expect(saida).toContain("Dedicação mínima estimada: 1 h 30 min por dia");
    expect(saida).toContain('role="status"');
  });

  it("curso sem prazo e sem dedicação não desenha nada", () => {
    expect(html({ item: { matricula: matricula(), curso: {} } })).toBe("");
    expect(html({ item: { matricula: matricula(), curso: { prazo_conclusao_dias: null } } })).toBe(
      ""
    );
    expect(html({ item: null })).toBe("");
  });

  it("só dedicação: mostra só ela", () => {
    const saida = html({
      item: { matricula: matricula(), curso: { dedicacao_diaria_min: 30 } },
    });
    expect(saida).toContain("Dedicação mínima estimada: 30 min por dia");
    expect(saida).not.toContain("Prazo para concluir");
  });

  it("curso já concluído não mostra prazo nem dedicação", () => {
    const saida = html({
      item: {
        matricula: matricula({ status: "concluido" }),
        curso: { prazo_conclusao_dias: 30, dedicacao_diaria_min: 30 },
      },
    });
    expect(saida).toBe("");
  });

  it("prazo vencido avisa o aluno, em tom de alerta, sem trancar o curso", () => {
    const saida = html({
      hoje: "2026-11-02",
      item: { matricula: matricula(), curso: { prazo_conclusao_dias: 30 } },
    });
    expect(saida).toContain("O prazo para concluir terminou em 31/10/2026. Fale com o RH.");
    expect(saida).toContain("text-red-");
  });

  it("últimos dias pedem atenção (âmbar)", () => {
    const saida = html({
      hoje: "2026-10-29",
      item: { matricula: matricula(), curso: { prazo_conclusao_dias: 30 } },
    });
    expect(saida).toContain("faltam 2 dias");
    expect(saida).toContain("text-amber-");
  });

  it("na prévia do RT não há matrícula: mostra o prazo em dias, sem data", () => {
    const saida = html({
      previa: true,
      item: {
        matricula: { id: "previa", status: "em_andamento" },
        curso: { prazo_conclusao_dias: 30, dedicacao_diaria_min: 45 },
      },
    });
    expect(saida).toContain("Prazo para concluir: 30 dias, contados da matrícula");
    expect(saida).toContain("Dedicação mínima estimada: 45 min por dia");
  });
});

// As telas do aluno usam Cartão, abas e o cliente do portal, que não rodam sem DOM: o que dá para travar é o texto
// de onde o prazo entra.
describe("onde o prazo aparece para o aluno", () => {
  const ler = (caminho) => readFileSync(new URL(caminho, import.meta.url), "utf8");

  it("no curso: antes da prova e do certificado, e na prévia do RT também", () => {
    const curso = ler("./CursoPortal.jsx");
    expect(curso).toContain('import PrazoDoCurso from "./PrazoDoCurso"');
    expect(curso).toMatch(
      /modo !== "avaliacao" && <PrazoDoCurso item=\{item\} previa=\{previa\} \/>/
    );
  });

  it("na lista de cursos: só para quem ainda não concluiu, com a cor do tom", () => {
    const lista = ler("../../pages/PortalFuncionario.jsx");
    expect(lista).toContain('import { prazoParaOAluno } from "@/lib/portal-prazo"');
    expect(lista).toMatch(/const prazo = concluido\s*\?\s*null\s*:\s*prazoParaOAluno\(/);
    expect(lista).toContain("{prazo.texto}");
    expect(lista).toContain('prazo.tom === "atraso"');
  });
});
