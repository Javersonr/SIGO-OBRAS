import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// Guarda de contrato (T29, revisão 1). A aba usa Sheet/Dialog do Radix e o ambiente de teste não tem DOM:
// o que dá para travar é a fiação do texto da tela. A regra (quando a imagem sai) tem teste de comportamento
// em `lib/ead-assinatura.test.js` (`aoMudarNomeDaPessoa`).
const aba = readFileSync(new URL("./TreinamentosEadTab.jsx", import.meta.url), "utf8");

describe("TreinamentosEadTab: a imagem da assinatura acompanha o nome de quem assina", () => {
  it("os dois seletores de pessoa trocam o nome pela regra da lib, não por setCursoSel direto", () => {
    expect(aba).toMatch(
      /import \{[^}]*\baoMudarNomeDaPessoa\b[^}]*\} from "@\/lib\/ead-assinatura"/
    );
    expect(aba).toContain('onNome={(v) => mudarNomeDaPessoa("responsavel_tecnico", v)}');
    expect(aba).toContain('onNome={(v) => mudarNomeDaPessoa("instrutor", v)}');
    // a forma antiga (só o nome muda e a imagem de quem estava antes fica) não pode voltar
    expect(aba).not.toMatch(/onNome=\{\(v\) => setCursoSel/);
  });

  it("avisa com toast quando a imagem é retirada (e só então)", () => {
    const handler = /const mudarNomeDaPessoa = [\s\S]*?\n {2}\};/.exec(aba)?.[0] ?? "";
    expect(handler).toContain("aoMudarNomeDaPessoa(cursoSel, pessoa, valor)");
    expect(handler).toContain("setCursoSel(");
    expect(handler).toMatch(/if \(\w+\.aviso\) toast\.warning\(\w+\.aviso/);
    // o toast fica no evento, não dentro de um setState funcional (que o React pode rodar duas vezes)
    expect(handler).not.toMatch(/setCursoSel\(\(/);
  });

  it("escolher da lista continua trocando nome e imagem juntos (nunca a imagem de quem estava antes)", () => {
    expect(aba).toContain("responsavel_tecnico_assinatura_ref: p.assinatura_ref || null");
    expect(aba).toContain("instrutor_assinatura_ref: p.assinatura_ref || null");
  });
});
