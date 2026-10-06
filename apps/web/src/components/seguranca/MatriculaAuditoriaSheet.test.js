import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// Guardas de contrato (T18). O painel usa Sheet e Dialog do Radix, que não renderizam sem DOM e o
// ambiente de teste do projeto não tem jsdom: o que dá para travar é o texto do componente. A lógica
// (rótulos, detalhes, motivo, aviso) está em `lib/` com testes de comportamento.
const ler = (nome) => readFileSync(new URL(nome, import.meta.url), "utf8");
const sheet = ler("./MatriculaAuditoriaSheet.jsx");
const aba = ler("./TreinamentosEadTab.jsx");

describe("MatriculaAuditoriaSheet: janelas e ações pelo servidor", () => {
  it("não usa window.confirm nem window.prompt (Dialog, como na T37)", () => {
    expect(sheet).not.toMatch(/window\.(confirm|prompt)|(^|[^.\w])(confirm|prompt)\(/m);
    expect(sheet).toContain("useConfirmar");
    expect(sheet).toContain("PedirMotivoDialog");
  });

  it("liberar tentativa e revogar passam pelo funcionario-acesso, não por escrita direta no banco", () => {
    expect(sheet).toContain("acessoPortal.liberarTentativa(");
    expect(sheet).toContain("acessoPortal.revogarCertificado(");
    expect(sheet).not.toMatch(/TreinamentoMatricula\.(update|create|delete)/);
    expect(sheet).not.toMatch(/TreinamentoCertificado\.(update|create|delete)/);
  });

  it("liberar manda as extras que a tela mostrava no clique (lidas antes do diálogo) e recarrega no conflito (T18, M4)", () => {
    const liberar = /const liberarTentativa = async[\s\S]*?\n {2}\};/.exec(sheet)?.[0] ?? "";
    const lida = liberar.indexOf("const extrasVistas = extrasDaMatricula(matricula)");
    const dialogo = liberar.indexOf("await confirmar(");
    expect(lida).toBeGreaterThan(-1);
    expect(dialogo).toBeGreaterThan(lida); // o número é o do clique, não o do fim do diálogo
    expect(liberar).toContain("acessoPortal.liberarTentativa(matricula.id, extrasVistas)");
    // falha: o texto do servidor, o aviso de "NÃO repita" com mais tempo e, no conflito, a matrícula recarregada
    const executar = /const executarAcao = async[\s\S]*?\n {2}\};/.exec(sheet)?.[0] ?? "";
    expect(executar).toContain("falhaDaAcaoDoRH(e)");
    expect(executar).toMatch(/if \(falha\.recarregarMatricula\) onMudou\?\.\(\)/);
    expect(executar).toMatch(/duration: falha\.duracao/);
  });

  it("depois de liberar ou revogar, avisa a tela de matrículas (onMudou)", () => {
    const aposAcao = /const aposAcao = \(\) => \{([\s\S]*?)\n {2}\};/.exec(sheet)?.[1] ?? "";
    expect(aposAcao).toContain("onMudou?.()");
    // as duas ações terminam em aposAcao()
    const liberar = /const liberarTentativa = async[\s\S]*?\n {2}\};/.exec(sheet)?.[0] ?? "";
    const revogar = /const revogar = async[\s\S]*?\n {2}\};/.exec(sheet)?.[0] ?? "";
    expect(liberar).toContain("aposAcao()");
    expect(revogar).toContain("aposAcao()");
  });

  it("as janelas ficam fora do SheetContent que recarrega (não somem no 'Carregando')", () => {
    const fimDoConteudo = sheet.indexOf("</SheetContent>");
    expect(fimDoConteudo).toBeGreaterThan(0);
    expect(sheet.indexOf("{dialogoConfirmar}")).toBeGreaterThan(fimDoConteudo);
    expect(sheet.indexOf("<PedirMotivoDialog")).toBeGreaterThan(fimDoConteudo);
  });

  it("recarrega os dados por baixo depois de agir, sem trocar o painel por 'Carregando'", () => {
    expect(sheet).toMatch(/carregar\(\{ silencioso: true \}\)/);
  });

  it("a tabela de tentativas abre a prova (linha expansível acessível)", () => {
    expect(sheet).toContain("aria-expanded={aberta}");
    expect(sheet).toContain("<ProvaDaTentativa");
  });
});

describe("TreinamentosEadTab: Detalhes da matrícula", () => {
  it("fechar os Detalhes não recarrega a tela (quem avisa é o onMudou do painel)", () => {
    const uso = /<MatriculaAuditoriaSheet([\s\S]*?)\/>/.exec(aba)?.[1] ?? "";
    expect(uso).toContain("onClose={() => setMatriculaDetalheId(null)}");
    expect(uso).toContain("onMudou={recarregar}");
    expect(uso).not.toMatch(/onClose=\{\(\) => \{[\s\S]*recarregar\(\)/);
  });
});
