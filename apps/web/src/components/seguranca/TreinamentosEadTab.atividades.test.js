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

describe("aba Treinamentos: caso com decisões (Task 17)", () => {
  it("caso novo cria a aula e depois o roteiro; se o roteiro falhar, a aula sai", () => {
    const salvar = funcao(aba, "salvarCaso");
    const aula = salvar.indexOf("TreinamentoAula.create(editando.dados)");
    const roteiro = salvar.indexOf("TreinamentoCaso.create({");
    expect(aula).toBeGreaterThan(-1);
    expect(roteiro).toBeGreaterThan(aula);
    expect(salvar).toMatch(/aula_id: aula\.id,\s*conteudo: editando\.conteudo/);
    expect(salvar).toContain("TreinamentoAula.delete(aula.id)");
    expect(salvar).toContain('confirmarImpacto("aula_nova"');
  });

  it("se nem a aula sair, o editor aberto passa a ser o da aula criada (salvar de novo não a duplica)", () => {
    const salvar = funcao(aba, "salvarCaso");
    expect(salvar).toMatch(
      /mesmoFormulario\(atual, editando\)\s*\?\s*\{\s*modo: "editar",\s*id: aula\.id,\s*aula,\s*casoId: null,\s*conteudo: editando\.conteudo,\s*original: null,?\s*\}\s*:\s*atual/
    );
    expect(salvar).toContain("A aula não foi criada");
    expect(salvar).toContain("A aula ficou no curso sem roteiro");
  });

  it("editar o caso só muda o conteúdo, com o aviso de impacto quando o roteiro muda", () => {
    const salvar = funcao(aba, "salvarCaso");
    expect(salvar).toMatch(
      /TreinamentoCaso\.update\(editando\.casoId, \{\s*conteudo: editando\.conteudo,?\s*\}\)/
    );
    expect(salvar).toContain('confirmarImpacto("caso_alterar"');
    expect(salvar).toContain("casoMudou(editando.original, editando.conteudo)");
  });

  it("Salvar fica desabilitado com problema no roteiro (a mesma validarCaso do editor)", () => {
    expect(aba).toContain(
      "const problemasDoCaso = casoEditando ? validarCaso(casoEditando.conteudo) : [];"
    );
    expect(aba).toMatch(/disabled=\{gravando\.has\("caso"\) \|\| problemasDoCaso\.length > 0\}/);
    expect(aba).toMatch(
      /<CasoEditor[\s\S]*?desabilitado=\{!pode\.editar \|\| gravando\.has\("caso"\)\}/
    );
  });

  it("a linha da aula de caso abre o editor (Editar caso / Ver caso)", () => {
    expect(aba).toContain("onCaso={() => abrirCasoDaAula(a)}");
  });
});

describe("aba Treinamentos: remover aula de atividade (Task 17)", () => {
  it("o diálogo avisa que o roteiro ou as questões saem junto", () => {
    const remover = funcao(aba, "removerAula");
    expect(remover).toMatch(/textoConfirmarRemocaoAula\(\{[\s\S]*?tipo: aula\.tipo,/);
    expect(remover).toContain("temRoteiro: casoPorAula.has(aula.id)");
    expect(remover).toContain("todasQuestoes.filter((q) => q.aula_id === aula.id).length");
  });

  it("depois da aula, o roteiro e as questões vivas dela também recebem exclusão lógica", () => {
    const remover = funcao(aba, "removerAula");
    const aula = remover.indexOf("TreinamentoAula.delete(aula.id)");
    const roteiro = remover.indexOf("TreinamentoCaso.deleteMany(filhos)");
    const questoes = remover.indexOf("TreinamentoQuestao.deleteMany(filhos)");
    expect(aula).toBeGreaterThan(-1);
    expect(roteiro).toBeGreaterThan(aula);
    expect(questoes).toBeGreaterThan(aula);
    expect(remover).toMatch(
      /filhos = \{\s*empresa_id: aula\.empresa_id,\s*aula_id: aula\.id,\s*deleted_at: null,?\s*\}/
    );
  });
});
