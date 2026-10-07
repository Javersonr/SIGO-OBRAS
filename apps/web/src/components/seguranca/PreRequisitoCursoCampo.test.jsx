import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Os componentes importam utilitários que leem `window` ao carregar; o ambiente de teste não tem DOM.
vi.hoisted(() => {
  const janela = {};
  janela.self = janela;
  janela.top = janela;
  globalThis.window = janela;
});

import PreRequisitoCursoCampo from "./PreRequisitoCursoCampo";

/**
 * O campo "Pré-requisito" do formulário do curso (T23), só com dados sintéticos. A regra de quais cursos entram na
 * lista e dos avisos está em `lib/ead-pre-requisito.js` (testada); aqui se confere o que a tela mostra.
 */
const campo = (curso, cursos) =>
  renderToStaticMarkup(
    <PreRequisitoCursoCampo curso={curso} cursos={cursos} onChange={() => {}} />
  );

const cursos = [
  { id: "basico", nome: "NR-10 Básico", modalidade: "ead", ativo: true },
  {
    id: "sep",
    nome: "NR-10 SEP",
    modalidade: "ead",
    ativo: true,
    pre_requisito_curso_id: "basico",
  },
  { id: "apoio", nome: "NR-35 Apoio", modalidade: "apoio", ativo: true },
  { id: "rascunho", nome: "Curso em rascunho", modalidade: "ead", ativo: false },
];

describe("PreRequisitoCursoCampo", () => {
  it("lista 'Nenhum' e os cursos que podem ser exigidos, sem o próprio curso e sem o de apoio", () => {
    const html = campo(cursos[1], cursos);
    expect(html).toContain("Pré-requisito");
    expect(html).toContain("Nenhum");
    expect(html).toContain("NR-10 Básico");
    expect(html).toContain("Curso em rascunho");
    expect(html).not.toContain("NR-35 Apoio");
    // o próprio curso não aparece como opção dele mesmo
    expect(html).not.toMatch(/<option[^>]*>NR-10 SEP<\/option>/);
  });

  it("mostra o pré-requisito gravado como selecionado", () => {
    const html = campo(cursos[1], cursos);
    expect(html).toMatch(/<option value="basico" selected/);
    expect(html).not.toMatch(/<option value="" selected/);
  });

  it("curso sem pré-requisito começa em 'Nenhum'", () => {
    const html = campo(cursos[0], cursos);
    expect(html).toMatch(/<option value="" selected/);
  });

  it("não deixa escolher quem já exige este curso (fecharia um círculo)", () => {
    // o NR-10 Básico não pode exigir o NR-10 SEP, que já o exige
    const html = campo(cursos[0], cursos);
    expect(html).not.toMatch(/<option[^>]*>NR-10 SEP<\/option>/);
  });

  it("explica a regra: não matricula nem emite sem o curso exigido", () => {
    const html = campo(cursos[0], cursos);
    expect(html).toContain("não pode ser matriculado");
    expect(html).toContain("não emite o certificado");
  });

  it("curso novo (ainda sem id) pode exigir qualquer curso que emite", () => {
    const html = campo({ nome: "Novo", modalidade: "ead" }, cursos);
    expect(html).toContain("NR-10 Básico");
    expect(html).toContain("NR-10 SEP");
  });

  it("avisa quando o curso exigido está em rascunho", () => {
    const html = campo({ ...cursos[0], pre_requisito_curso_id: "rascunho" }, cursos);
    expect(html).toContain("não está publicado");
    expect(html).toMatch(/role="alert"/);
  });

  it("vínculo para um curso que a lista não tem (excluído) continua visível, com o aviso", () => {
    const html = campo({ ...cursos[0], pre_requisito_curso_id: "fantasma" }, cursos);
    expect(html).toMatch(/<option value="fantasma" selected/);
    expect(html).toContain("curso excluído");
    expect(html).toMatch(/role="alert"/);
  });

  it("sem nenhum aviso quando o curso exigido está em ordem", () => {
    const html = campo(cursos[1], cursos);
    expect(html).not.toMatch(/role="alert"/);
  });
});
