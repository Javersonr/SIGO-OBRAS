import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// Guardas de contrato do dossiê e do certificado na Ficha (T34). A aba e a Ficha usam Sheet e o cliente do
// backend, que não rodam sem DOM e sem produção: o que dá para travar é o texto dos componentes. A lógica
// está em `lib/ead-dossie.js` (testes de comportamento) e a leitura do banco e o ZIP em
// `exportarDossieEad.test.js`.
const ler = (caminho) => readFileSync(new URL(caminho, import.meta.url), "utf8");
const aba = ler("./TreinamentosEadTab.jsx");
const ficha = ler("./FichaFuncionarioSheet.jsx");
const exportador = ler("./exportarDossieEad.js");
const gerador = ler("./certificadoParaRH.js");

const corpoDe = (texto, nome) =>
  new RegExp(`const ${nome} = async[\\s\\S]*?\\n {2}\\};`).exec(texto)?.[0] ?? "";

describe("aba de cursos: botão Exportar dossiê", () => {
  const exportar = corpoDe(aba, "exportarDossie");

  it("chama o exportador com a empresa da tela e o curso do cartão", () => {
    expect(exportar).toContain("exportarDossieDoCurso(");
    expect(exportar).toContain("empresa: empresaAtiva");
    expect(exportar).toContain("cursoId: curso.id");
  });

  it("um dossiê por vez: o ref trava já no 2º clique e sempre é solto no fim", () => {
    const trava = exportar.indexOf("if (exportandoDossieRef.current) return;");
    const liga = exportar.indexOf("exportandoDossieRef.current = true;");
    expect(trava).toBeGreaterThan(-1);
    expect(liga).toBeGreaterThan(trava);
    const final = exportar.slice(exportar.indexOf("finally"));
    expect(final).toContain("exportandoDossieRef.current = false;");
    expect(final).toContain("setExportandoDossie(null);");
  });

  it("o andamento é anunciado a leitores de tela (aria-live), já que o texto do botão muda sozinho (A6)", () => {
    // o aria-label do botão é fixo; a região avisa "Certificados 3/12..." sem tirar o foco do botão
    const regiao = aba.slice(
      aba.indexOf('aria-live="polite"') - 120,
      aba.indexOf('aria-live="polite"') + 360
    );
    expect(aba).toContain('aria-live="polite"');
    expect(regiao).toContain('role="status"');
    expect(regiao).toContain('className="sr-only"');
    expect(regiao).toContain("exportandoDossie?.cursoId === c.id");
    expect(regiao).toContain("`Exportando o dossiê do curso ${c.nome}: ${exportandoDossie.texto}`");
  });

  it("não baixa o dossiê de uma empresa que já foi trocada na tela", () => {
    expect(exportar).toContain("aindaVale: () => empresaIdDaTelaRef.current === empresaId");
    expect(exportar).toMatch(/if \(!resumo\) return;/);
  });

  it("o resultado e a falha viram toast (nenhuma rejeição escapa do botão)", () => {
    expect(exportar).toContain("avisoDoDossie(resumo)");
    expect(exportar).toMatch(/toast\[aviso\.tipo\]/);
    expect(exportar).toMatch(/toast\.error\(`Não foi possível exportar o dossiê/);
  });

  it("o botão tem nome acessível, fica parado durante a exportação e não é um botão dentro de outro", () => {
    const chamada = aba.indexOf("onClick={() => exportarDossie(c)}");
    expect(chamada).toBeGreaterThan(-1);
    const botao = aba.slice(aba.lastIndexOf("<Button", chamada), aba.indexOf("</Button>", chamada));
    expect(botao).toContain("aria-label={`Exportar dossiê de fiscalização do curso ${c.nome}`}");
    expect(botao).toContain("disabled={!!exportandoDossie}");
    expect(botao).toContain('type="button"');
    // o botão do cartão (abre o curso) fecha ANTES do botão do dossiê: HTML não aceita botão dentro de botão
    const abre = aba.lastIndexOf(
      "<button",
      aba.lastIndexOf("onClick={() => setCursoSel(c)}", chamada)
    );
    const fecha = aba.indexOf("</button>", abre);
    expect(abre).toBeGreaterThan(-1);
    expect(fecha).toBeGreaterThan(abre);
    expect(fecha).toBeLessThan(chamada);
  });
});

describe("Ficha do funcionário: certificado de cada curso EAD", () => {
  it("lê os certificados do funcionário da empresa, e a falha não derruba o histórico", () => {
    expect(ficha).toMatch(
      /TreinamentoCertificado\.filter\(\s*\{ empresa_id: empresaAtiva\.id, funcionario_id: f\.id \},\s*\{ includeDeleted: true \}/
    );
    expect(ficha).toMatch(/\.catch\(\(e\) => \{[\s\S]*?return null;/);
  });

  it("quem decide mostrar o certificado é a regra pura (curso de apoio não mostra)", () => {
    expect(ficha).toContain("certificadoDaFicha({");
    expect(ficha).toContain("m.certificadoEad && (");
  });

  it("o PDF sai do gerador do RH, um por vez, com aviso de falha e de assinatura que faltou", () => {
    const baixar = corpoDe(ficha, "baixarCertificado");
    expect(baixar).toContain("if (baixandoCertificadoRef.current) return;");
    expect(baixar).toContain("criarGeradorDeCertificado(empresaAtiva)(certificado)");
    expect(baixar).toContain("avisoAssinaturasNaoCarregadas(faltaram)");
    expect(baixar).toContain("mensagemFalhaCertificado(e)");
    expect(baixar).toContain("baixandoCertificadoRef.current = false;");
  });

  it("a linha do curso quebra em telas estreitas (nome, status, data, selo e botão), sem espremer o nome (A6)", () => {
    const fim = ficha.indexOf("{m.curso_nome}</span>");
    expect(fim).toBeGreaterThan(-1);
    const linha = ficha.slice(Math.max(0, fim - 300), fim);
    // o contêiner da linha quebra, e o nome aceita encolher e quebrar sem sumir
    expect(linha).toContain(
      'className="flex flex-wrap items-center gap-2 text-sm bg-white border rounded p-2"'
    );
    expect(linha).toMatch(/<span className="min-w-0 flex-1 basis-40[^"]*">$/);
  });

  it("o botão tem nome acessível e o selo de revogado aparece", () => {
    expect(ficha).toContain("aria-label={`Baixar o certificado do curso ${m.curso_nome}`}");
    expect(ficha).toContain("certificado revogado");
  });
});

describe("o exportador e o gerador só leem e nunca guardam URL assinada", () => {
  for (const [nome, texto] of [
    ["exportarDossieEad.js", exportador],
    ["certificadoParaRH.js", gerador],
  ]) {
    it(`${nome} não grava no banco`, () => {
      expect(texto).not.toMatch(/\.(insert|update|upsert|delete)\(/);
      expect(texto).not.toMatch(/sigo\.entities/);
    });

    it(`${nome} não guarda URL nem arquivo no navegador`, () => {
      expect(texto).not.toMatch(/file_url|localStorage|sessionStorage|indexedDB/);
    });
  }

  it("toda consulta do exportador parte da tabela já filtrada pela empresa", () => {
    expect(exportador).toContain('supabase.from(nome).select(colunas).eq("empresa_id", empresaId)');
    expect(exportador.match(/supabase\.from\(/g)).toHaveLength(1);
  });

  it("os arquivos do Storage vêm por URL assinada criada na hora (resolveStorageUrl)", () => {
    expect(exportador).toContain("resolveStorageUrl(ref)");
    expect(exportador).not.toMatch(/createSignedUrl/);
  });
});
