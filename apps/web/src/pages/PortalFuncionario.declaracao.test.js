import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// Guarda de contrato da declaração de ambiente e horário na página do portal (T35). A página usa o cliente do
// backend e vários componentes que não rodam sem DOM e sem produção: o que dá para travar é o texto. A regra de
// quando a tela aparece está em `lib/portal-declaracao.js` (teste de comportamento) e o desenho da tela em
// `components/portal-funcionario/DeclaracaoAmbientePortal.test.jsx`.
const pagina = readFileSync(new URL("./PortalFuncionario.jsx", import.meta.url), "utf8");

describe("PortalFuncionario: declaração antes de abrir o curso", () => {
  it("a decisão é tomada UMA vez, no clique que abre o curso, com o texto e o dia de Brasília", () => {
    expect(pagina).toMatch(
      /setAberta\(\{[\s\S]{0,200}declarar:\s*precisaDeclararAmbiente\(\{[\s\S]{0,200}item:\s*c,[\s\S]{0,120}declaracao:\s*dados\?\.declaracao_ambiente,[\s\S]{0,120}hoje:\s*hojeEmBrasilia\(\)/
    );
    // nenhuma conta por render: passar da meia-noite com o curso aberto não troca a tela do aluno
    expect(pagina.match(/precisaDeclararAmbiente\(/g)).toHaveLength(1);
  });

  it("a tela da declaração vem antes do curso e só enquanto a matrícula aberta pede a declaração", () => {
    const declaracao = pagina.indexOf("<DeclaracaoAmbientePortal");
    const curso = pagina.indexOf("<CursoPortal");
    expect(declaracao).toBeGreaterThan(0);
    expect(declaracao).toBeLessThan(curso);
    expect(pagina).toMatch(
      /if \(item && aberta\.declarar\) \{\s*return \(\s*<DeclaracaoAmbientePortal/
    );
  });

  it("declarou: só desliga o `declarar` da matrícula que está aberta (o curso abre; nada é recalculado)", () => {
    expect(pagina).toMatch(
      /onDeclarada=\{\(\) =>\s*setAberta\(\(atual\) => \(atual \? \{ \.\.\.atual, declarar: false \} : atual\)\)\s*\}/
    );
  });

  it("a tela recebe o texto dos dados, busca os dados de novo quando o RT muda o texto e trata a sessão caída", () => {
    const trecho = pagina.slice(pagina.indexOf("<DeclaracaoAmbientePortal"));
    const fim = trecho.indexOf("/>");
    const props = trecho.slice(0, fim);
    expect(props).toContain("declaracao={dados?.declaracao_ambiente || null}");
    expect(props).toContain("recarregar={carregar}");
    expect(props).toContain("onErroSessao={onErroSessao}");
    expect(props).toContain("token={token}");
  });
});
