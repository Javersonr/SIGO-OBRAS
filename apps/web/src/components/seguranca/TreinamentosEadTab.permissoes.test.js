import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// Guardas de contrato da T33 (permissões do EAD; spec docs/superpowers/specs/2026-10-06-permissoes-ead-design.md,
// §8). A aba usa Sheet, Dialog e o cliente do backend, que não rodam sem DOM e sem produção: o que dá para travar é
// o texto dos componentes. A regra (o objeto de permissões, o que o "Salvar curso" grava) está em
// lib/ead-permissoes.js, com teste de comportamento; os botões de cada cartão, nos testes de cada cartão.
const ler = (caminho) => readFileSync(new URL(caminho, import.meta.url), "utf8");
const aba = ler("./TreinamentosEadTab.jsx");
const pagina = ler("../../pages/SegurancaTrabalho.jsx");
const editor = ler("../shared/PermissoesGranularesEditor.jsx");
const saas = ler("../saas/PermissoesTab.jsx");
const documentos = ler("./DocumentosPortalCard.jsx");
const ficha = ler("./FichaFuncionarioSheet.jsx");
const sessoes = ler("./SessoesPraticasCurso.jsx");
const auditoria = ler("./MatriculaAuditoriaSheet.jsx");
const aula = ler("./AulaLinhaEad.jsx");

describe("a aba nova no editor de permissões", () => {
  it("as duas cópias de ESTRUTURA_PERMISSOES têm Treinamentos EAD com as 7 funções da lib", () => {
    for (const texto of [editor, saas]) {
      expect(texto).toContain('import { FUNCOES_EAD } from "@/lib/ead-permissoes"');
      expect(texto).toContain('"Treinamentos EAD": { funcoes: [...FUNCOES_EAD] }');
    }
  });
});

describe("RH & Segurança: a aba Treinamentos é da permissão própria", () => {
  it("o gatilho (celular e computador) e o conteúdo usam verTreinamentos, não mais Funcionários", () => {
    expect(pagina).toMatch(/\{verTreinamentos && \(\s*<SelectItem value="treinamentos_ead">/);
    expect(pagina).toMatch(/\{verTreinamentos && \(\s*<TabsTrigger value="treinamentos_ead">/);
    expect(pagina).toMatch(/<TabsContent value="treinamentos_ead">\s*\{verTreinamentos \? \(/);
    expect(pagina).toMatch(/<TreinamentosEadTab[\s\S]*?pode=\{podeEad\}/);
  });

  it("a sugestão de matrícula da admissão só aparece para quem matricula", () => {
    const sugerir = /const sugerirMatricula = \(anterior, atual\) => \{[\s\S]*?\n {2}\};/.exec(
      pagina
    )?.[0];
    expect(sugerir).toMatch(/if \(!podeEad\.matricular\) return;/);
  });

  it("a Ficha recebe as permissões dos documentos do portal (aba RH)", () => {
    expect(pagina).toContain("podeDocumentosPortal={permissoesDocumentosPortal(temPermissao)}");
    expect(ficha).toMatch(/podePublicar=\{podeDocumentosPortal\.publicar\}/);
    expect(ficha).toMatch(/podeRetirar=\{podeDocumentosPortal\.retirar\}/);
  });
});

describe("aba Treinamentos: os botões seguem as funções", () => {
  it("criar curso e preparar curso do cadastro central só com Editar", () => {
    expect(aba).toMatch(/\{pode\.editar && \(\s*<Button[\s\S]{0,300}Novo curso/);
    expect(aba).toContain(
      "{pode.editar && modelosSemCurso(treinamentosConfig, cursos).length > 0 && ("
    );
  });

  it("a chave Publicado fica visível e desligada sem Publicar, com a dica", () => {
    expect(aba).toMatch(/id="curso-publicado"[\s\S]{0,200}disabled=\{\s*!pode\.publicar \|\|/);
    expect(aba).toContain("{dicaDoPublicado(pode) && (");
  });

  it("Salvar curso aparece só para quem pode e grava só o que a permissão deixa", () => {
    expect(aba).toContain("{podeSalvarCurso(pode, { novo: !cursoSel.id }) && (");
    expect(aba).toContain(
      "const paraGravar = dadosDoCursoParaGravar(dados, pode, { novo: !cursoSel.id });"
    );
    expect(aba).toMatch(/TreinamentoCurso\.create\(paraGravar\)/);
    expect(aba).not.toMatch(/TreinamentoCurso\.(update\(cursoSel\.id|create\()dados\)/);
  });

  it("aulas, nova aula, questões e sessões práticas só com Editar", () => {
    expect(aba).toContain("somenteLeitura={!pode.editar}");
    expect(aba).toMatch(
      /\{pode\.editar && \(\s*<div className="space-y-2 rounded-lg border border-dashed p-3">/
    );
    expect(aba).toMatch(
      /\{pode\.editar && \(\s*<Button[\s\S]{0,400}<Plus className="w-4 h-4 mr-1" \/> Questão/
    );
    expect(aba).toMatch(/<SessoesPraticasCurso[\s\S]*?podeEditar=\{pode\.editar\}/);
    expect(sessoes).toMatch(
      /\{podeEditar && \(\s*<Button[^>]*onClick=\{\(\) => setEditando\(\{\}\)\}/
    );
    expect(aula).toMatch(/\{!somenteLeitura && \(/);
  });

  it("matrícula, aviso, dúvidas, liberar tentativa e revogar passam a função de cada um", () => {
    expect(aba).toMatch(/<MatriculasEadCard[\s\S]*?podeMatricular=\{pode\.matricular\}/);
    expect(aba).toMatch(/<MatriculasEadCard[\s\S]*?podeCriarAcesso=\{pode\.criarAcessoPortal\}/);
    expect(aba).toMatch(
      /<VencimentosEadPainel[\s\S]*?podeMatricular=\{pode\.matricular \? cursoAceitaMatricula : nenhumCursoMatricula\}/
    );
    expect(aba).toMatch(/<DuvidasTutorCard[\s\S]*?podeResponder=\{pode\.responderDuvidas\}/);
    expect(aba).toMatch(
      /<MatriculaAuditoriaSheet[\s\S]*?podeLiberarTentativa=\{pode\.liberarTentativa\}/
    );
    expect(aba).toMatch(/<MatriculaAuditoriaSheet[\s\S]*?podeRevogar=\{pode\.revogarCertificado\}/);
    expect(auditoria).toContain("{podeLiberarTentativa && !matricula.avaliacao_aprovada && (");
    expect(auditoria).toContain("{podeRevogar && !certificado.revogado_em && (");
  });

  it("o painel de matrícula da sugestão só abre para quem matricula", () => {
    expect(aba).toMatch(/if \(pode\.matricular\) \{\s*setPainelMatricula\(\{\s*modo: "funcao"/);
  });
});

describe("PDFs do portal: só pelas RPC (B2)", () => {
  it("publicar e retirar chamam as RPC; a tela não grava mais documentos_rh_anexos", () => {
    expect(documentos).toContain('supabase.rpc(\n        "portal_documento_publicar"');
    expect(documentos).toContain('supabase.rpc("portal_documento_retirar"');
    expect(documentos).not.toMatch(/\.update\(\{\s*documentos_rh_anexos/);
    expect(documentos).toContain("parametrosDaPublicacao({");
  });

  it("o upload diz que é PDF (o banco só publica objeto do Storage com mimetype application/pdf)", () => {
    expect(documentos).toMatch(/UploadFile\(\{[\s\S]*?mimeType: "application\/pdf"/);
  });

  it("enviar só com RH → Criar e retirar só com RH → Deletar (padrão: nenhum)", () => {
    expect(documentos).toMatch(/podePublicar = false,\s*podeRetirar = false,/);
    expect(documentos).toContain("{podePublicar ? (");
    expect(documentos).toContain("{podeRetirar && (");
  });
});
