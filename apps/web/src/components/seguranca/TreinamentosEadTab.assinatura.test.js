import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// Guarda de contrato (T29, revisão 1; A6). A aba usa Sheet/Dialog do Radix e o ambiente de teste não tem DOM:
// o que dá para travar é a fiação do texto da tela. As regras (quando a imagem sai, quando entra, quando é
// descartada) têm teste de comportamento em `lib/ead-assinatura.test.js` (`aoMudarNomeDaPessoa`,
// `aoEscolherPessoa`, `aoTrocarImagemDaAssinatura`, `semMarcasDeAssinatura`).
const aba = readFileSync(new URL("./TreinamentosEadTab.jsx", import.meta.url), "utf8");
const campo = readFileSync(new URL("./AssinaturaCursoCampo.jsx", import.meta.url), "utf8");

/** O corpo de `const <nome> = ... {` da aba, até o `};` na mesma indentação (duas colunas). */
const corpoDe = (nome) => new RegExp(`const ${nome} = [\\s\\S]*?\\n {2}\\};`).exec(aba)?.[0] ?? "";

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
    const handler = corpoDe("mudarNomeDaPessoa");
    expect(handler).toContain("aoMudarNomeDaPessoa(cursoSel, pessoa, valor)");
    expect(handler).toContain("setCursoSel(");
    expect(handler).toMatch(/if \(\w+\.aviso\) toast\.warning\(\w+\.aviso/);
    // o toast fica no evento, não dentro de um setState funcional (que o React pode rodar duas vezes)
    expect(handler).not.toMatch(/setCursoSel\(\(/);
  });

  it("escolher da lista passa pela regra da lib e avisa como o nome digitado (A6, N4)", () => {
    expect(aba).toMatch(/import \{[^}]*\baoEscolherPessoa\b[^}]*\} from "@\/lib\/ead-assinatura"/);
    expect(aba).toContain('onEscolher={(p) => escolherPessoa("responsavel_tecnico", p)}');
    expect(aba).toContain('onEscolher={(p) => escolherPessoa("instrutor", p)}');
    const handler = corpoDe("escolherPessoa");
    expect(handler).toContain("aoEscolherPessoa(cursoSel, pessoa, escolhida)");
    expect(handler).toContain("setCursoSel(mudanca.curso)");
    expect(handler).toMatch(/if \(mudanca\.aviso\) toast\.warning\(mudanca\.aviso/);
    expect(handler).not.toMatch(/setCursoSel\(\(/);
    // nome e imagem juntos: a forma antiga (montar o curso à mão no seletor) não pode voltar
    expect(aba).not.toMatch(/onEscolher=\{\(p\) =>\s*setCursoSel/);
    expect(aba).not.toContain("responsavel_tecnico_assinatura_ref: p.assinatura_ref");
    expect(aba).not.toContain("instrutor_assinatura_ref: p.assinatura_ref");
  });

  it("a imagem enviada confere o formulário E a pessoa, pelo curso de agora, e devolve o resultado (A6, N3)", () => {
    const handler = corpoDe("trocarAssinatura");
    expect(handler).toContain("aoTrocarImagemDaAssinatura({");
    // o formulário de AGORA (a ref), nunca o de quando o envio começou
    expect(handler).toContain("atual: cursoSelRef.current");
    expect(handler).toContain("formulario,");
    expect(handler).toContain("if (resultado.aplicada) setCursoSel(resultado.curso)");
    expect(handler).toContain("return resultado;");
    expect(aba).toContain('onChange={trocarAssinatura("responsavel_tecnico")}');
    expect(aba).toContain('onChange={trocarAssinatura("instrutor")}');
    // a forma antiga (por nome de campo, só conferindo o formulário) não pode voltar
    expect(aba).not.toMatch(/trocarAssinatura\("\w+_assinatura_ref"\)/);
  });

  it("o campo da imagem só diz 'anexada' quando ela entrou; descartada vira aviso", () => {
    expect(campo).toMatch(/const resultado = onChange\(nova\)/);
    expect(campo).toMatch(
      /resultado && resultado\.aplicada === false[\s\S]{0,80}toast\.warning\(resultado\.aviso/
    );
    expect(campo).toContain('toast.success("Imagem anexada. Salve o curso para guardá-la.")');
  });

  it("depois de salvar, as marcas de 'imagem sem dono' saem do formulário que foi gravado", () => {
    expect(aba).toMatch(
      /import \{[^}]*\bsemMarcasDeAssinatura\b[^}]*\} from "@\/lib\/ead-assinatura"/
    );
    const salvar =
      /await gravar\("curso", "Erro ao salvar o curso", async \(\) => \{[\s\S]*?recarregar\(\);\s*\}\);/.exec(
        aba
      )?.[0];
    expect(salvar).toBeTruthy();
    // curso existente e curso novo (o id do novo entra no mesmo setCursoSel)
    // T33: grava o que a permissão deixa (paraGravar, lib/ead-permissoes.js)
    expect(salvar).toMatch(
      /await sigo\.entities\.TreinamentoCurso\.update\(cursoSel\.id, paraGravar\);\s*setCursoSel\(\(atual\) =>\s*mesmoFormulario\(atual, cursoSel\) \? semMarcasDeAssinatura\(atual\) : atual/
    );
    expect(salvar).toMatch(/\.\.\.semMarcasDeAssinatura\(atual\), id: novo\.id/);
  });
});
