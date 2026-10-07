import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// Guardas de contrato do acompanhamento técnico A6 na aba de cursos. A aba usa Sheet, Dialog e o cliente do
// backend, que não rodam sem DOM e sem produção: o que dá para travar é o texto do componente. As regras têm
// testes de comportamento em `lib/` (ead-curso-numeros, ead-gestao, ead-assinatura, ...).
const ler = (caminho) => readFileSync(new URL(caminho, import.meta.url), "utf8");
const aba = ler("./TreinamentosEadTab.jsx");

const funcao = (nome) =>
  new RegExp(`const ${nome} = async[\\s\\S]*?\\n {2}\\};`).exec(aba)?.[0] ?? "";

describe("salvar o curso: números conferidos antes de gravar (T32)", () => {
  const salvar = funcao("salvarCurso");

  it("nota, tentativas, carga e validade passam por validarNumerosDoCurso, com o erro em português no toast", () => {
    // (A7: a mesma linha importa também notaMinimaParaGravar)
    expect(aba).toMatch(
      /import \{ (?:notaMinimaParaGravar, )?validarNumerosDoCurso \} from "@\/lib\/ead-curso-numeros"/
    );
    expect(salvar).toContain("validarNumerosDoCurso(cursoSel)");
    expect(salvar).toMatch(
      /if \(!numeros\.ok\) \{\s*toast\.error\(numeros\.erro\);\s*return;\s*\}/
    );
  });

  it("a conferência vem antes de qualquer gravação", () => {
    const confere = salvar.indexOf("validarNumerosDoCurso(");
    expect(confere).toBeGreaterThan(-1);
    expect(confere).toBeLessThan(salvar.indexOf("await gravar("));
    expect(confere).toBeLessThan(salvar.indexOf("TreinamentoCurso.update("));
    expect(confere).toBeLessThan(salvar.indexOf("TreinamentoCurso.create("));
  });

  it("os campos numéricos dizem os limites (min, max e passo inteiro)", () => {
    expect(aba).toMatch(/type="number"\s*min=\{0\}\s*max=\{100\}\s*step=\{1\}/);
    expect(aba).toMatch(/type="number"\s*min=\{1\}\s*step=\{1\}/);
    expect(aba).toMatch(/type="number"\s*min=\{0\}\s*step=\{1\}/);
  });
});

describe("matrícula aberta repetida (23505) com mensagem clara (T32)", () => {
  it("o erro de criar matrícula e de renovar passa por erroDeMatricula", () => {
    expect(aba).toMatch(/\berroDeMatricula,\s*\n\} from "@\/lib\/ead-gestao"/);
    const criar = funcao("criarMatriculas");
    expect(criar).toMatch(
      /catch \(e\) \{[\s\S]*?throw erroDeMatricula\(e\);[\s\S]*?\} finally \{\s*recarregar\(\)/
    );
    const renovar = funcao("renovarMatricula");
    expect(renovar).toMatch(
      /catch \(e\) \{\s*throw erroDeMatricula\(e\);\s*\} finally \{\s*recarregar\(\)/
    );
  });
});

describe("a lista de presença não perde o rascunho ao recarregar (A6, T12 M6)", () => {
  const dialogo = ler("./PresencaSessaoDialog.jsx");

  it("recarregar os participantes mescla com o rascunho (mesclarRascunhos); só trocar de sessão zera", () => {
    expect(dialogo).toContain("mesclarRascunhos({");
    expect(dialogo).toMatch(/gravadasAntigasRef\.current = gravadas/);
    // a forma antiga (setLinhas(gravadas) a cada recarga) não pode voltar
    expect(dialogo).not.toMatch(/setLinhas\(gravadas\)/);
    // trocar de sessão começa do que está gravado
    expect(dialogo).toMatch(/mesmaSessao = sessaoDasLinhasRef\.current === sessao\?\.id/);
  });
});

describe("sessões práticas seguem a modalidade GRAVADA do curso, não a do formulário (A6, T12 M7)", () => {
  it("o formulário muda para semipresencial sem salvar: a seção não abre; o aviso manda salvar", () => {
    const secao = aba.slice(aba.indexOf("T12: a lista de presença é da sessão prática presencial"));
    const trecho = secao.slice(0, 1800);
    expect(aba).toContain("const cursoGravadoDoFormulario =");
    expect(trecho).toContain('modalidadeDoCurso(cursoGravadoDoFormulario) === "semipresencial"');
    expect(trecho).toContain("curso={cursoGravadoDoFormulario}");
    // a forma antiga (a modalidade do formulário abria a seção) não pode voltar
    expect(trecho).not.toMatch(
      /modalidadeDoCurso\(cursoSel\) === "semipresencial" \? \(\s*<SessoesPraticasCurso/
    );
    expect(trecho).toContain("Salve o curso como semipresencial");
  });
});
