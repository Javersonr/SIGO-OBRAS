import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi } from "vitest";
import ProjetoPedagogicoCurso from "./ProjetoPedagogicoCurso";

// `@/lib/utils` lê `window` ao ser importado (os componentes de `ui/` passam por ele) e o Vitest daqui roda
// em ambiente node, sem DOM: um `window` vazio basta para o import.
vi.hoisted(() => {
  globalThis.window ??= {};
});

// Só dados sintéticos: o repositório é público e o texto do projeto é do responsável técnico (D5).
const aulas = [
  { id: "a1", ordem: 1, modulo: "Módulo 1", titulo: "Aula 1", tipo: "video" },
  { id: "a2", ordem: 2, modulo: "Módulo 2", titulo: "Aula 2", tipo: "pdf" },
];
const questoes = Array.from({ length: 5 }, (_, i) => ({ id: `q${i}` }));
const completo = {
  id: "c1",
  nome: "Curso de Teste",
  carga_horaria_horas: 1,
  responsavel_tecnico_nome: "RT Teste",
  responsavel_tecnico_registro: "CREA 0000",
  instrutor_nome: "Instrutor Teste",
  conteudo_programatico: "Item 1",
  objetivo_geral: "Objetivo geral de teste",
  principios_sst: "Princípios de teste",
  estrategia_pedagogica: "Estratégia de teste",
  infraestrutura_apoio: "Infraestrutura de teste",
  publico_alvo: "Público de teste",
  instrumentos_aprendizagem: "Instrumentos de teste",
  dedicacao_diaria_min: 30,
  prazo_conclusao_dias: 45,
  modulos_objetivos: [
    { modulo: "Módulo 1", objetivo: "Objetivo do módulo 1" },
    { modulo: "Módulo 2", objetivo: "Objetivo do módulo 2" },
  ],
};

function renderizar(curso, extra = {}) {
  return renderToStaticMarkup(
    <ProjetoPedagogicoCurso
      curso={curso}
      aulas={aulas}
      questoes={questoes}
      hoje="2026-10-07"
      onMudar={() => {}}
      podeGerarPdf
      {...extra}
    />
  );
}

describe("ProjetoPedagogicoCurso", () => {
  it("mostra o título da seção, os 15 itens de (a) a (o) e a contagem", () => {
    const html = renderizar({ id: "c1", nome: "Curso vazio" }, { aulas: [], questoes: [] });
    expect(html).toContain("Projeto pedagógico (Anexo II 3.1)");
    expect(html).toContain("0/15 itens");
    for (const [letra, titulo] of [
      ["a", "Objetivo geral"],
      ["d", "Responsável técnico"],
      ["h", "Objetivo de cada módulo"],
      ["k", "Prazo máximo para conclusão"],
      ["o", "Avaliação de aprendizagem"],
    ]) {
      expect(html).toContain(`${letra}) ${titulo}`);
    }
    expect((html.match(/<li class="space-y-1.5/g) || []).length).toBe(15);
  });

  it("projeto completo: 15/15, todos 'Preenchido' e o texto escrito aparece nos campos", () => {
    const html = renderizar(completo);
    expect(html).toContain("15/15 itens");
    expect((html.match(/>Preenchido</g) || []).length).toBe(15);
    expect(html).not.toContain(">Falta<");
    expect(html).toContain("Objetivo geral de teste");
    expect(html).toContain("Objetivo do módulo 2");
    expect(html).toContain('value="45"');
  });

  it("item pendente diz o que fazer, e os itens do curso dizem onde editar", () => {
    const html = renderizar({ ...completo, principios_sst: "" });
    expect(html).toContain("14/15 itens");
    expect(html).toContain(">Falta<");
    expect(html).toContain("Escreva os princípios e conceitos de SST do curso.");
    // os seis itens que vêm do curso só se leem aqui
    expect(html).toContain("Edite em: campos Responsável técnico e Registro, acima.");
    expect(html).toContain("RT Teste — CREA 0000");
    expect((html.match(/do curso<\/span>/g) || []).length).toBe(6);
  });

  it("objetivo por módulo: um campo para cada módulo das aulas; sem aulas, manda cadastrá-las", () => {
    const html = renderizar({ ...completo, modulos_objetivos: [] });
    expect(html).toContain("Objetivo de: Módulo 1");
    expect(html).toContain("Objetivo de: Módulo 2");
    expect(html).toContain("Escreva o objetivo de: Módulo 1, Módulo 2.");
    const semAulas = renderizar(completo, { aulas: [] });
    expect(semAulas).toContain("Cadastre as aulas do curso");
    expect(semAulas).not.toContain("Objetivo de: Módulo 1");
  });

  it("validação: quem, quando e a próxima revisão, com a situação da revisão", () => {
    const html = renderizar({
      ...completo,
      projeto_validado_por: "RT Teste",
      projeto_validado_em: "2026-10-01",
      proxima_revisao: "2028-10-01",
    });
    expect(html).toContain("Validação do projeto (Anexo II 3.3)");
    expect(html).toContain('value="RT Teste"');
    expect(html).toContain('value="2026-10-01"');
    expect(html).toContain('value="2028-10-01"');
    expect(html).toContain("Revisão em dia");
    expect(html).toContain("bg-emerald-50");
  });

  it("sem validação o selo diz isso; revisão vencida fica em vermelho", () => {
    expect(renderizar(completo)).toContain("Sem validação registrada");
    const vencida = renderizar({
      ...completo,
      projeto_validado_por: "RT Teste",
      projeto_validado_em: "2024-01-01",
      proxima_revisao: "2026-01-01",
    });
    expect(vencida).toMatch(/Revisão vencida há \d+ dias/);
    expect(vencida).toContain("bg-red-50");
  });

  it("curso de NR com gatilho mostra a mudança da norma", () => {
    const html = renderizar({ ...completo, nome: "NR-35 — Trabalho em Altura" });
    expect(html).toContain("NR-35, a partir de 16/07/2026");
  });

  it("oferece usar o responsável técnico como quem validou, até ele já estar no campo", () => {
    expect(renderizar(completo)).toContain("Usar o responsável técnico do curso");
    expect(renderizar({ ...completo, projeto_validado_por: "RT Teste" })).not.toContain(
      "Usar o responsável técnico do curso"
    );
    expect(renderizar({ ...completo, responsavel_tecnico_nome: "" })).not.toContain(
      "Usar o responsável técnico do curso"
    );
  });

  it("botão Gerar PDF do projeto: habilitado com o curso salvo, desabilitado sem ele ou gerando", () => {
    const habilitado = renderizar(completo);
    expect(habilitado).toContain("Gerar PDF do projeto");
    expect(habilitado).toMatch(/<button[^>]*title="Grava o projeto[^>]*>/);
    expect(habilitado).not.toMatch(/<button[^>]*disabled=""[^>]*title="Grava o projeto/);
    const semCurso = renderizar({ ...completo, id: undefined }, { podeGerarPdf: false });
    expect(semCurso).toMatch(/<button[^>]*disabled=""[^>]*title="Salve o curso antes de gerar/);
    expect(semCurso).toContain("Salve o curso para gerar o PDF do projeto.");
    expect(semCurso).not.toContain("PDF próprio");
    expect(renderizar(completo, { gerandoPdf: true })).toMatch(
      /<button[^>]*disabled=""[^>]*title="Grava o projeto/
    );
  });

  it("PDF já anexado: oferece abrir o atual e trocar por um PDF próprio", () => {
    const html = renderizar({ ...completo, projeto_pedagogico_ref: "treinamentos/x/projeto.pdf" });
    expect(html).toContain("ver atual");
    expect(html).toContain("trocar por PDF próprio");
    expect(renderizar(completo)).toContain("anexar PDF próprio");
    expect(renderizar(completo)).not.toContain("ver atual");
  });
});
