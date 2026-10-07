import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// Guardas de contrato do tipo do treinamento e do pré-requisito entre cursos na aba Treinamentos (T23). A aba usa
// Sheet, Tabs e o cliente do backend, que não rodam sem DOM e sem produção: o que dá para travar é o texto do
// componente. A lógica (quem falta o pré-requisito, o tipo de cada matrícula, os ciclos) está em `lib/` com testes
// de comportamento (`ead-pre-requisito`, `ead-tipo-matricula`, `ead-gestao`), e o desenho do painel e do campo em
// `MatricularEadSheet.test.jsx` e `PreRequisitoCursoCampo.test.jsx`.
const ler = (caminho) => readFileSync(new URL(caminho, import.meta.url), "utf8");
const aba = ler("./TreinamentosEadTab.jsx");

const funcao = (texto, nome) =>
  new RegExp(`const ${nome} = async[\\s\\S]*?\\n {2}\\};`).exec(texto)?.[0] ?? "";

describe("curso: o pré-requisito escolhido na tela", () => {
  it("o formulário do curso tem o campo de pré-requisito ligado ao curso aberto", () => {
    expect(aba).toContain(
      'import PreRequisitoCursoCampo from "@/components/seguranca/PreRequisitoCursoCampo"'
    );
    expect(aba).toMatch(
      /<PreRequisitoCursoCampo[\s\S]{0,200}curso=\{cursoSel\}[\s\S]{0,200}cursos=\{cursos\}[\s\S]{0,300}pre_requisito_curso_id/
    );
  });

  it("salvarCurso grava o pré-requisito (ou null) e recusa o que fecharia um círculo antes de gravar", () => {
    const salvar = funcao(aba, "salvarCurso");
    expect(salvar).toContain("pre_requisito_curso_id: cursoSel.pre_requisito_curso_id || null");
    expect(salvar).toContain(
      "preRequisitoFechariaCiclo(cursoSel.id, cursoSel.pre_requisito_curso_id, cursos)"
    );
    expect(salvar.indexOf("preRequisitoFechariaCiclo(")).toBeLessThan(
      salvar.indexOf("const dados = {")
    );
  });

  it("a lista de cursos diz qual curso cada um exige", () => {
    expect(aba).toMatch(/cursoExigidoDe\(c, cursos\)/);
    expect(aba).toContain("Exige:");
  });
});

describe("matrícula: tipo do treinamento e pré-requisito", () => {
  it("criarMatriculas confere o pré-requisito de novo e grava só as liberadas", () => {
    const criar = funcao(aba, "criarMatriculas");
    expect(criar).toContain("separarPorPreRequisito({");
    expect(criar).toMatch(/const \{ liberadas, bloqueadas \} = separarPorPreRequisito/);
    expect(criar).toContain("liberadas.slice(i, i + LOTE_DE_MATRICULAS)");
    expect(criar).not.toContain("novas.slice(i, i + LOTE_DE_MATRICULAS)");
    // o que o painel já barrou entra na mensagem
    expect(criar).toContain("bloqueados");
  });

  it("criarMatriculas recebe o que o painel barrou e o diz ao RH, sem esconder", () => {
    expect(aba).toMatch(
      /const criarMatriculas = async \(\{ novas, ignorados, bloqueados = 0 \}\) =>/
    );
    const criar = funcao(aba, "criarMatriculas");
    expect(criar).toMatch(/pré-requisito/);
  });

  it("renovar cria a matrícula como periódica e respeita o pré-requisito do curso", () => {
    const renovar = funcao(aba, "renovarMatricula");
    expect(renovar).toContain('tipo: "periodico"');
    expect(renovar).toContain("separarPorPreRequisito({");
    // o pré-requisito é conferido antes de gravar
    expect(renovar.indexOf("separarPorPreRequisito(")).toBeLessThan(
      renovar.indexOf("TreinamentoMatricula.bulkCreate")
    );
  });

  it("a renovação grava a matrícula que a regra montou (com tipo e motivo), não uma linha à mão", () => {
    const renovar = funcao(aba, "renovarMatricula");
    expect(renovar).toMatch(/TreinamentoMatricula\.bulkCreate\(liberadas\)/);
  });

  it("o painel de matrícula recebe os certificados (o pré-requisito considera certificado revogado)", () => {
    expect(aba).toMatch(/<MatricularEadSheet[\s\S]*?certificados=\{certificados\}[\s\S]*?\/>/);
  });
});

describe("matrícula: o tipo aparece na tela e nos detalhes", () => {
  const detalhes = ler("./MatriculaAuditoriaSheet.jsx");

  it("os detalhes da matrícula mostram o tipo e, no eventual, o motivo", () => {
    expect(detalhes).toContain("textoDoTipoDaMatricula(matricula)");
    expect(detalhes).toContain("Tipo de treinamento");
  });
});
