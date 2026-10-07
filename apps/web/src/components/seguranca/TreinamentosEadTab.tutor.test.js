import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// Guardas de contrato do tutor e das dúvidas (T21). A aba e a página usam Sheet, Tabs e o cliente do backend, que
// não rodam sem DOM e sem produção: o que dá para travar é o texto dos componentes. A lógica (telefone, gravação
// do tutor, filtros, contadores) está em `lib/` com testes de comportamento (`ead-tutor`, `ead-duvidas`,
// `telefone`, `ead-requisitos`), e o desenho do cartão em `DuvidasTutorCard.test.jsx`.
const ler = (caminho) => readFileSync(new URL(caminho, import.meta.url), "utf8");
const aba = ler("./TreinamentosEadTab.jsx");
const cartao = ler("./DuvidasTutorCard.jsx");
const pagina = ler("../../pages/SegurancaTrabalho.jsx");

const funcao = (texto, nome) =>
  new RegExp(`const ${nome} = async[\\s\\S]*?\\n {2}\\};`).exec(texto)?.[0] ?? "";

describe("curso: tutor gravado só depois de validado e normalizado", () => {
  it("salvarCurso valida o tutor antes de montar os dados e grava o que a regra devolve", () => {
    const salvar = funcao(aba, "salvarCurso");
    expect(salvar).toContain("dadosDoTutorParaGravar(cursoSel)");
    expect(salvar).toMatch(/if \(!tutor\.ok\) \{\s*toast\.error\(tutor\.erro\);\s*return;\s*\}/);
    expect(salvar).toContain("...tutor.dados");
    // o telefone não volta a ser gravado como o RH digitou
    expect(salvar).not.toMatch(/tutor_telefone: cursoSel\.tutor_telefone/);
    expect(salvar.indexOf("dadosDoTutorParaGravar(")).toBeLessThan(
      salvar.indexOf("const dados = {")
    );
  });

  it("o formulário tem nome, WhatsApp (com máscara) e atendimento do tutor, com os limites do banco", () => {
    expect(aba).toContain('import InputTelefone from "@/components/shared/InputTelefone"');
    expect(aba).toMatch(/<InputTelefone[\s\S]{0,120}cursoSel\.tutor_telefone/);
    expect(aba).toMatch(
      /value=\{cursoSel\.tutor_nome \|\| ""\}[\s\S]{0,80}maxLength=\{MAX_TUTOR_NOME\}/
    );
    expect(aba).toMatch(
      /value=\{cursoSel\.tutor_atendimento \|\| ""\}[\s\S]{0,80}maxLength=\{MAX_TUTOR_ATENDIMENTO\}/
    );
  });

  it("o tutor não vira requisito para publicar: a tela só diz que é opcional", () => {
    expect(aba).toContain("O tutor é opcional e não impede publicar o curso");
  });
});

describe("dúvidas: cartão do RH e contador da aba", () => {
  it("a aba passa ao cartão os nomes de todos os funcionários e o canal do contador", () => {
    expect(aba).toMatch(/<DuvidasTutorCard[\s\S]*?funcTodosPorId=\{funcTodosPorId\}[\s\S]*?\/>/);
    expect(aba).toMatch(/<DuvidasTutorCard[\s\S]*?onPendentes=\{onDuvidasPendentes\}[\s\S]*?\/>/);
    expect(aba).toMatch(
      /export default function TreinamentosEadTab\(\{[\s\S]*?onDuvidasPendentes,/
    );
  });

  it("o cartão só avisa o número depois de a lista chegar (o 0 da lista vazia não apaga o da tela)", () => {
    expect(cartao).toMatch(/if \(carregado\) onPendentes\?\.\(pendentes\)/);
  });

  it("a resposta nova grava só os três campos da resposta (o trigger do banco recusa o resto); a edição vai ao servidor (A6)", () => {
    const responder = funcao(cartao, "responder");
    expect(responder).toContain("TreinamentoDuvida.update(d.id, {");
    expect(responder).toMatch(
      /resposta: decisao\.texto,\s*respondida_por: [^\n]+,\s*respondida_em: [^\n]+,\s*\}\)/
    );
    // editar uma resposta já dada nunca é um UPDATE direto da tela: o servidor guarda a versão anterior na trilha
    expect(responder).toContain("acessoPortal.editarRespostaDuvida(d.id, decisao.texto)");
    expect(responder.match(/TreinamentoDuvida\.update\(/g)).toHaveLength(1);
    expect(responder.indexOf("if (edicao) {")).toBeLessThan(
      responder.indexOf("TreinamentoDuvida.update(")
    );
  });

  it("editar a resposta só avisa o aluno de novo no WhatsApp se o RH marcou a caixa", () => {
    const responder = funcao(cartao, "responder");
    expect(responder).toContain("if (!edicao || avisarDeNovo) await avisarAluno(d)");
    expect(cartao).toMatch(/useState\(false\)/); // a caixa nasce desmarcada
    expect(cartao).toMatch(/setAvisarDeNovo\(false\)/);
  });

  it("a página conta as dúvidas sem resposta da empresa, só para quem vê a aba, e mostra no gatilho", () => {
    // a MESMA conta do cartão (lib/ead-duvidas.js: resposta nula ou vazia), contada no banco (A6)
    expect(pagina).toMatch(
      /\.from\("treinamento_duvida"\)\s*\.select\("id", \{ count: "exact", head: true \}\)\s*\.eq\("empresa_id", empresaAtiva\.id\)\s*\.is\("deleted_at", null\)\s*\.or\(FILTRO_SEM_RESPOSTA\)/
    );
    // T33: quem vê a aba é quem tem a permissão própria "Treinamentos EAD" (qualquer função)
    expect(pagina).toMatch(/const podeEad = permissoesEad\(temPermissao\);/);
    expect(pagina).toMatch(/const verTreinamentos = podeEad\.visualizar;/);
    expect(pagina).toMatch(
      /if \(!empresaAtiva\?\.id \|\| !verTreinamentos\) \{\s*setDuvidasPendentes\(0\)/
    );
    expect(pagina).toContain("rotuloDaAbaTreinamentos(duvidasPendentes)"); // lista do celular
    expect(pagina).toMatch(/<TabsTrigger value="treinamentos_ead">[\s\S]*?duvidasPendentes > 0/);
    expect(pagina).toContain("onDuvidasPendentes={setDuvidasPendentes}");
  });

  it("a contagem não deixa resposta atrasada de outra empresa ou de outra aba aparecer", () => {
    const efeito = pagina.slice(pagina.indexOf("let vale = true;"));
    expect(efeito).toMatch(/if \(vale\) setDuvidasPendentes\(count \?\? 0\)/);
    expect(efeito).toMatch(/return \(\) => \{\s*vale = false;/);
  });
});
