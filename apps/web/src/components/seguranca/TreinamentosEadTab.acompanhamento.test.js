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
    expect(aba).toMatch(/import \{ validarNumerosDoCurso \} from "@\/lib\/ead-curso-numeros"/);
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
