import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// Guardas de contrato da parte prática presencial (T12) na aba Treinamentos e nos componentes novos. A aba usa
// Sheet, Dialog e o cliente do backend, que não rodam sem DOM e sem produção: o que dá para travar é o texto do
// componente. A regra (quem pode emitir, a sessão, a lista, as cargas) está em `lib/` com testes de comportamento
// (`ead-pratica`, `ead-lista-presenca`, `ead-requisitos`).
const ler = (caminho) => readFileSync(new URL(caminho, import.meta.url), "utf8");
const aba = ler("./TreinamentosEadTab.jsx");
const secao = ler("./SessoesPraticasCurso.jsx");
const dialogoSessao = ler("./SessaoPraticaDialog.jsx");
const dialogoPresenca = ler("./PresencaSessaoDialog.jsx");
/** O código sem comentários (o texto explicativo cita a lista antiga). */
const codigo = (texto) => texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("aba Treinamentos: a lista de presença antiga do EAD saiu (T12)", () => {
  it("sem prompt(), sem 10 h por dia e sem horário fixo", () => {
    const c = codigo(aba);
    expect(c).not.toMatch(/\bprompt\(/);
    expect(c).not.toContain("HORAS_DIA");
    expect(c).not.toContain("gerarListasPresenca");
    expect(c).not.toContain("10h/dia");
    expect(c).not.toContain("07:00 às 12:00");
  });

  it("o curso semipresencial salvo mostra a seção Sessões práticas; os outros, a explicação", () => {
    expect(aba).toContain(
      'import SessoesPraticasCurso from "@/components/seguranca/SessoesPraticasCurso"'
    );
    // a seção segue a modalidade GRAVADA do curso, não a do formulário (A6, T12 M7): ver
    // TreinamentosEadTab.acompanhamento.test.js
    expect(aba).toMatch(
      /modalidadeDoCurso\(cursoGravadoDoFormulario\) === "semipresencial" \? \(\s*<SessoesPraticasCurso[\s\S]{0,400}onAbrirArquivo=\{abrirReferencia\}/
    );
    expect(aba).toContain("A lista de presença é da sessão prática presencial dos cursos");
  });
});

describe("aba Treinamentos: carga teórica e prática do curso semipresencial (T12)", () => {
  it("salvarCurso grava as duas cargas pela regra da lib (null fora do semipresencial)", () => {
    const salvar = /const salvarCurso = async[\s\S]*?\n {2}\};/.exec(aba)?.[0] ?? "";
    expect(salvar).toContain("...cargasDoCursoParaGravar(cursoSel, gravado)");
  });

  it("os campos aparecem só no semipresencial e não ficam travados pelo vínculo com o cadastro central", () => {
    const campos =
      /modalidadeDoCurso\(cursoSel\) === "semipresencial" && \(\s*<div className="grid grid-cols-2 gap-3 pt-1">([\s\S]*?)<\/div>\s*\)\}/.exec(
        aba
      )?.[1] ?? "";
    expect(campos).toContain('id="curso-carga-teorica"');
    expect(campos).toContain('id="curso-carga-pratica"');
    expect(campos).toContain("carga_teorica_horas: e.target.value");
    expect(campos).toContain("carga_pratica_horas: e.target.value");
    // nome, código e carga total ficam travados pelo vínculo; a divisão é só do curso EAD
    expect(campos).not.toContain("disabled={!!cursoSel.modelo_treinamento_id}");
  });
});

describe("Sessões práticas: o que a tela grava (T12)", () => {
  const c = codigo(secao);

  it("a sessão nova leva a empresa ativa e o curso; a edição só o que o formulário conferiu", () => {
    expect(c).toMatch(
      /TreinamentoSessaoPratica\.create\(\{\s*\.\.\.dados,\s*empresa_id: empresaId,\s*curso_id: cursoId,/
    );
    expect(c).toContain("TreinamentoSessaoPratica.update(editando.sessao.id, dados)");
    expect(dialogoSessao).toContain("const conferido = validarSessao(form);");
  });

  it("os participantes entram pendentes e sem presença; a tela nunca grava quem avaliou nem quando", () => {
    expect(c).toMatch(/presente: false,\s*resultado: "pendente",/);
    expect(c).not.toMatch(/avaliado_por\s*:/);
    expect(c).not.toMatch(/avaliado_em\s*:/);
    expect(codigo(dialogoPresenca)).toContain("participanteParaGravar(linhas[p.id])");
  });

  it("remover é sempre lógico e pede confirmação", () => {
    expect(c).toContain("TreinamentoSessaoPratica.delete(sessao.id)");
    expect(c).toContain("TreinamentoPraticaParticipante.delete(p.id)");
    expect(c.match(/await confirmar\(\{/g)?.length).toBe(2);
  });

  it("a lista assinada vai para o bucket treinamentos e o banco guarda a referência, não a URL", () => {
    expect(c).toContain("validarArquivoDaLista(arquivo)");
    expect(c).toMatch(
      /refDoUpload\(\s*await sigo\.integrations\.Core\.UploadFile\(\{ file: arquivo, bucket: "treinamentos" \}\)\s*\)/
    );
    expect(c).toContain("{ lista_presenca_ref: ref }");
    expect(c).not.toContain("file_url");
  });

  it("a lista de presença em PDF sai da sessão gravada (sem prompt)", () => {
    expect(c).toContain("desenharListaDePresenca(doc, {");
    expect(c).toContain("doc.save(nomeDoArquivoDaLista(curso, sessao))");
    expect(c).not.toMatch(/\bprompt\(/);
  });

  it("a presença e o resultado não são lançados numa sessão futura (o banco também recusa)", () => {
    expect(dialogoPresenca).toContain("const futura = sessaoNoFuturo(sessao, hoje);");
    expect(dialogoPresenca.match(/disabled=\{futura \|\| gravando\}/g)?.length).toBe(2);
  });
});
