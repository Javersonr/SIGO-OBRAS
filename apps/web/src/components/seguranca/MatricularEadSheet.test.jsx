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

// O `Sheet` do Radix não desenha sem DOM (o conteúdo vai para um portal): troca por caixas simples para
// conferir o formulário. O teste NUNCA carrega o cliente de produção.
vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children }) => <div>{children}</div>,
  SheetContent: ({ children, className }) => <div className={className}>{children}</div>,
  SheetHeader: ({ children }) => <div>{children}</div>,
  SheetTitle: ({ children }) => <h2>{children}</h2>,
}));

import { FormularioDeMatricula } from "./MatricularEadSheet";

/**
 * O painel de matrícula (T22) como o RH o vê ao abrir, só com dados sintéticos: por funcionário e por
 * função (função → exigência → treinamento central → curso do portal). A conta de quem falta e do que
 * criar está em `lib/ead-matricula-funcao.test.js`; aqui se confere o que a tela mostra e marca.
 */
const tela = (el) => renderToStaticMarkup(el);

const cursos = [
  { id: "c1", nome: "NR-10 Basico", ativo: true, modelo_treinamento_id: "m1" },
  {
    id: "c2",
    nome: "NR-35 Material de apoio",
    ativo: true,
    modalidade: "apoio",
    modelo_treinamento_id: "m2",
  },
  { id: "c4", nome: "Curso em rascunho", ativo: false, modelo_treinamento_id: "m4" },
];
const exigencia = (id, modelo, nome) => ({
  id,
  funcao_id: "fn1",
  modelo_treinamento_id: modelo,
  nome,
  ativo: true,
  obrigatorio: true,
});
const treinamentos = [
  exigencia("e1", "m1", "NR-10"),
  exigencia("e2", "m2", "NR-35"),
  exigencia("e3", "m3", "NR-33 (sem curso)"),
  exigencia("e4", "m4", "Rascunho"),
];
const funcionario = (id, extra = {}) => ({
  id,
  nome_completo: `Funcionario ${id}`,
  ativo: true,
  funcao_id: "fn1",
  funcao_nome: "Eletricista",
  ...extra,
});
const funcionarios = [
  funcionario("f1"),
  funcionario("f2"),
  funcionario("f3", { funcao_id: "fn2" }),
];
const matriculas = [
  {
    id: "mt1",
    funcionario_id: "f2",
    curso_id: "c1",
    status: "concluido",
    proxima_renovacao: "2999-01-01",
  },
];

const cursoMatriculavel = (c) => (c.ativo === false ? "Curso em rascunho (não publicado)" : null);

const formulario = (inicial = {}, extra = {}) => (
  <FormularioDeMatricula
    inicial={{ modo: "funcionario", chave: 1, ...inicial }}
    cursos={cursos}
    funcionarios={funcionarios}
    treinamentos={treinamentos}
    matriculas={matriculas}
    certificados={[]}
    empresaId="emp"
    cursoMatriculavel={cursoMatriculavel}
    gravando={false}
    onConfirmar={() => {}}
    {...extra}
  />
);

describe("MatricularEadSheet: por funcionário", () => {
  it("só oferece cursos que aceitam matrícula e marca o curso de apoio", () => {
    const html = tela(formulario());
    expect(html).toContain("NR-10 Basico");
    expect(html).toContain("NR-35 Material de apoio (apoio, sem certificado)");
    expect(html).not.toContain("Curso em rascunho<");
    expect(html).toContain("Matricular (0)");
  });

  it("vem com o curso e a pessoa marcados quando abre pelo painel de vencimentos", () => {
    const html = tela(formulario({ cursoId: "c1", funcionarioIds: ["f1"] }));
    expect(html).toContain("Matricular (1)");
    expect(html).toMatch(/<option value="c1" selected/);
  });

  it("curso de apoio escolhido: avisa que o funcionário não recebe certificado", () => {
    const html = tela(formulario({ cursoId: "c2", funcionarioIds: ["f1"] }));
    expect(html).toContain("não recebe certificado");
  });

  it("curso que emite certificado não leva esse aviso", () => {
    const html = tela(formulario({ cursoId: "c1", funcionarioIds: ["f1"] }));
    expect(html).not.toContain("não recebe certificado");
  });

  it("tem as duas formas de matricular", () => {
    const html = tela(formulario());
    expect(html).toContain("Por funcionário");
    expect(html).toContain("Por função");
  });
});

describe("MatricularEadSheet: por função", () => {
  const porFuncao = (inicial = {}) => formulario({ modo: "funcao", funcaoId: "fn1", ...inicial });

  it("lista os treinamentos que a função exige, com o curso de cada um", () => {
    const html = tela(porFuncao());
    expect(html).toContain("Treinamentos que a função exige");
    expect(html).toContain("NR-10");
    expect(html).toContain("Curso: NR-10 Basico");
    expect(html).toContain("Curso: NR-35 Material de apoio");
  });

  it("exigência sem curso no portal e com curso em rascunho ficam desligadas, com o motivo", () => {
    const html = tela(porFuncao());
    expect(html).toContain("Sem curso no portal: não dá para matricular.");
    expect(html).toContain("Curso indisponível: Curso em rascunho (não publicado).");
  });

  it("curso de apoio vem com selo e aviso de que não emite certificado", () => {
    const html = tela(porFuncao());
    expect(html).toContain("Apoio, sem certificado");
    expect(html).toContain(
      "O funcionário estuda o material no portal, mas não recebe certificado."
    );
  });

  it("marca só quem falta: f1 sem nada, f2 já fez a NR-10 mas não a NR-35; só as 3 do que tem curso", () => {
    const html = tela(porFuncao());
    expect(html).toContain("Funcionários (2)"); // f3 é de outra função
    expect(html).toContain("NR-10: sem matrícula");
    expect(html).toContain("NR-10: em dia");
    // f1 precisa de NR-10 e NR-35; f2 só da NR-35: 3 matrículas
    expect(html).toContain("Matricular (3)");
    expect(html).toContain("3 matrícula(s) serão criadas");
  });

  it("abre pela sugestão de admissão com só a pessoa sugerida marcada", () => {
    const html = tela(porFuncao({ funcionarioIds: ["f1"] }));
    // f1 falta NR-10 e NR-35 (2 matrículas); f2 fica desmarcado
    expect(html).toContain("Matricular (2)");
  });

  it("função sem treinamento obrigatório ligado ao cadastro central explica o que fazer", () => {
    const html = tela(porFuncao({ funcaoId: "fn2" }));
    expect(html).toContain("não tem treinamento obrigatório ligado ao cadastro central");
    expect(html).toContain("Matricular (0)");
  });

  it("sem função escolhida, o botão está desligado", () => {
    const html = tela(formulario({ modo: "funcao" }));
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Matricular \(0\)/);
  });

  it("a lista de funções traz quantas pessoas ativas cada uma tem", () => {
    const html = tela(porFuncao());
    expect(html).toContain("Eletricista (2)");
  });
});
