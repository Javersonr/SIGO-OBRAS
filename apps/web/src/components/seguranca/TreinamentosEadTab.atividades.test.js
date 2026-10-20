import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// Guardas de contrato das atividades interativas na aba Treinamentos (spec 2026-10-14, §5). A aba usa Sheet, Dialog
// e o cliente do backend, que não rodam sem DOM e sem produção: o que dá para travar é o texto do componente. A
// lógica está em lib/ead-aula-nova.js, lib/ead-impacto.js, lib/ead-curso-numeros.js e lib/ead-caso-edicao.js.
const ler = (caminho) => readFileSync(new URL(caminho, import.meta.url), "utf8");
const aba = ler("./TreinamentosEadTab.jsx");
const linha = ler("./AulaLinhaEad.jsx");

const funcao = (texto, nome) =>
  new RegExp(`const ${nome} = async[\\s\\S]*?\\n {2}\\};`).exec(texto)?.[0] ?? "";

describe("aba Treinamentos: atividades interativas (Task 16)", () => {
  it("requisitos e 'Ver como aluno' recebem os roteiros dos casos do curso", () => {
    expect(aba).toContain("sigo.entities.TreinamentoCaso.filter(filtro)");
    expect(
      aba.match(/casos: todosCasos\.filter\(\(c\) => c\.curso_id === curso\.id\)/g)
    ).toHaveLength(2);
    expect(aba).toMatch(
      /<PreviaAlunoCurso[\s\S]*?casos=\{todosCasos\.filter\(\(c\) => c\.curso_id === cursoSel\.id\)\}/
    );
  });

  it("a avaliação final lista só as questões sem aula; o questionário, as da aula", () => {
    expect(aba).toContain("questoes={questoesSeparadas.prova}");
    expect(aba).toMatch(/Avaliação final \(\{questoesSeparadas\.prova\.length\}/);
    expect(aba).toContain("questoesSeparadas.porAula.get(questionarioAberto.id)");
  });

  it("questão nova do questionário grava a aula; a da prova, não", () => {
    const salvar = funcao(aba, "salvarQuestao");
    expect(salvar).toContain("...(aulaId ? { aula_id: aulaId } : {})");
    expect(salvar).toContain('aulaId ? "gabarito_questionario" : "gabarito"');
    expect(salvar).toContain("ordem: proximaOrdem(doGrupo)");
  });

  it("a nota mínima dos questionários vai pela regra, com o aviso de impacto", () => {
    const salvar = funcao(aba, "salvarCurso");
    expect(salvar).toContain(
      "nota_minima_modulo: notaMinimaDoModuloParaGravar(cursoSel.nota_minima_modulo),"
    );
    expect(salvar).toContain('confirmarImpacto("nota_minima_modulo"');
  });

  it("aula sem arquivo passa pela regra da lib; o caso abre o editor antes do aviso de aula nova", () => {
    const adicionar = funcao(aba, "adicionarAula");
    expect(adicionar).toContain("montarAulaSemArquivo(novaAula)");
    expect(adicionar).toMatch(/if \(novaAula\.tipo === "caso"\) \{\s*abrirCasoNovo\(/);
    expect(adicionar.indexOf("abrirCasoNovo(")).toBeLessThan(
      adicionar.indexOf('confirmarImpacto("aula_nova"')
    );
  });

  it("a edição da aula de texto e de tarefa grava o texto", () => {
    expect(funcao(aba, "salvarAulaEdicao")).toContain("camposDaEdicaoSemVideo(aulaEditando)");
    expect(aba).toMatch(/texto: a\.conteudo_texto \|\| ""/);
  });

  it("a linha da aula tem ícone e rótulo dos tipos novos e o menu Questões", () => {
    for (const icone of ["ListChecks", "GitBranch", "ClipboardList"]) {
      expect(linha).toContain(icone);
    }
    expect(linha).toContain("nomeDoTipoDeAula(tipo)");
    expect(linha).toContain("onQuestoes");
    expect(aba).toContain("onQuestoes={() => abrirQuestionario(a)}");
  });
});
