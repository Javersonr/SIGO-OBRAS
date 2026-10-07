import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// Guardas de contrato do projeto pedagógico na tela do curso (T25). A aba usa Sheet e o cliente do backend, que
// não rodam sem DOM e sem produção: o que dá para travar é o texto do componente. A lógica (os 15 itens, o que
// gravar, a revisão) está em `lib/ead-projeto.js` e o PDF em `lib/ead-projeto-pdf.js`, com testes de
// comportamento; o desenho da seção está em `ProjetoPedagogicoCurso.test.jsx`.
const ler = (caminho) => readFileSync(new URL(caminho, import.meta.url), "utf8");
const aba = ler("./TreinamentosEadTab.jsx");

const funcao = (texto, nome) =>
  new RegExp(`const ${nome} = async[\\s\\S]*?\\n {2}\\};`).exec(texto)?.[0] ?? "";

describe("Salvar curso: o projeto pedagógico só é gravado depois de validado", () => {
  const salvar = funcao(aba, "salvarCurso");

  it("valida pela regra testada, antes de montar os dados, e grava o que ela devolve", () => {
    expect(salvar).toMatch(/dadosDoProjetoParaGravar\(cursoSel,/);
    expect(salvar).toMatch(
      /if \(!projeto\.ok\) \{\s*toast\.error\(projeto\.erro\);\s*return;\s*\}/
    );
    expect(salvar).toContain("...projeto.dados");
    expect(salvar.indexOf("dadosDoProjetoParaGravar(")).toBeLessThan(
      salvar.indexOf("const dados = {")
    );
  });

  it("a validação usa as aulas e as questões do curso que está aberto", () => {
    expect(salvar).toMatch(/aulas: aulasDoCurso\(cursoSel\.id\)/);
    expect(salvar).toMatch(
      /questoes: todasQuestoes\.filter\(\(q\) => q\.curso_id === cursoSel\.id\)/
    );
  });

  it("Salvar curso não mexe no PDF do projeto (só 'Gerar PDF' e o anexo próprio gravam a referência)", () => {
    expect(salvar).not.toContain("projeto_pedagogico_ref");
  });
});

describe("Gerar PDF do projeto", () => {
  const gerar = funcao(aba, "gerarProjetoPedagogicoPdf");

  it("existe e roda um por vez (o ref vale já no 2º clique)", () => {
    expect(gerar).not.toBe("");
    expect(gerar).toMatch(/if \(!formulario\?\.id \|\| gerandoProjetoRef\.current\) return;/);
    expect(gerar).toContain("gerandoProjetoRef.current = true");
    expect(gerar).toMatch(/finally \{\s*gerandoProjetoRef\.current = false;/);
  });

  it("valida o projeto da tela antes de gerar e usa os dados JÁ SALVOS do curso no PDF", () => {
    expect(gerar).toMatch(
      /dadosDoProjetoParaGravar\(\s*\{ \.\.\.gravado, \.\.\.camposDoProjeto\(formulario\) \},/
    );
    expect(gerar).toMatch(/cursos\.find\(\(c\) => c\.id === formulario\.id\)/);
    expect(gerar).toMatch(/curso: \{ \.\.\.gravado, \.\.\.projeto\.dados \}/);
    expect(gerar.indexOf("dadosDoProjetoParaGravar(")).toBeLessThan(
      gerar.indexOf("pdfDoProjetoComoBlob(")
    );
  });

  it("sobe o PDF para o bucket treinamentos e grava a referência (nunca a URL assinada)", () => {
    expect(gerar).toMatch(/UploadFile\(\{\s*file: arquivo,\s*bucket: "treinamentos",?\s*\}\)/);
    expect(gerar).toContain("refDoUpload(res)");
    expect(gerar).not.toContain("file_url");
    expect(gerar.indexOf("UploadFile(")).toBeLessThan(gerar.indexOf("TreinamentoCurso.update("));
  });

  it("grava os campos do projeto e a referência do PDF numa gravação só", () => {
    expect(gerar).toMatch(
      /TreinamentoCurso\.update\(formulario\.id, \{\s*\.\.\.projeto\.dados,\s*projeto_pedagogico_ref: ref,\s*\}\)/
    );
  });

  it("só mexe na tela se ainda é a mesma empresa e o mesmo curso", () => {
    expect(gerar).toMatch(/empresaIdDaTelaRef\.current === empresaId/);
    expect(gerar).toMatch(/mesmoFormulario\(atual, formulario\)/);
  });

  it("erro de geração ou de envio aparece para o RH (não some em silêncio)", () => {
    expect(gerar).toMatch(
      /catch \(e\) \{[\s\S]*toast\.error\("Não foi possível gerar o PDF do projeto: "/
    );
  });
});

describe("a seção no formulário do curso", () => {
  it("usa o componente da seção, com o PDF próprio (anexo) e o botão de abrir o atual", () => {
    expect(aba).toContain(
      'import ProjetoPedagogicoCurso from "@/components/seguranca/ProjetoPedagogicoCurso"'
    );
    expect(aba).toMatch(/<ProjetoPedagogicoCurso[\s\S]*?curso=\{cursoSel\}[\s\S]*?\/>/);
    expect(aba).toMatch(
      /<ProjetoPedagogicoCurso[\s\S]*?podeGerarPdf=\{!!cursoSel\.id\}[\s\S]*?\/>/
    );
    expect(aba).toMatch(
      /<ProjetoPedagogicoCurso[\s\S]*?onGerarPdf=\{gerarProjetoPedagogicoPdf\}[\s\S]*?\/>/
    );
    expect(aba).toMatch(
      /<ProjetoPedagogicoCurso[\s\S]*?onAnexarPdf=\{enviarProjetoPedagogico\}[\s\S]*?\/>/
    );
    // mudar um campo usa o estado mais novo (digitação rápida não perde letras)
    expect(aba).toMatch(
      /onMudar=\{\(mudanca\) => setCursoSel\(\(prev\) => \(\{ \.\.\.prev, \.\.\.mudanca \}\)\)\}/
    );
  });

  it("o bloco antigo só do PDF saiu (a seção nova o substitui)", () => {
    expect(aba).not.toContain("anexar PDF");
    expect(aba).not.toMatch(/Projeto pedagógico \(PDF\)/);
  });

  it("o painel Vencimentos pode abrir o curso cuja revisão venceu", () => {
    expect(aba).toMatch(
      /<VencimentosEadPainel[\s\S]*?onAbrirCurso=\{[\s\S]*?setCursoSel\([\s\S]*?\/>/
    );
  });
});
