import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// Guardas de contrato da tela de matrículas (T22). A aba usa Sheet, Dialog e o cliente do backend, que
// não rodam sem DOM e sem produção: o que dá para travar é o texto dos componentes. A lógica (linhas,
// filtros, ordem, CSV, prazo, matrícula por função, aviso em lote) está em `lib/` com testes de
// comportamento, e o desenho da tabela e do painel em `MatriculasEadCard.test.jsx` e
// `MatricularEadSheet.test.jsx`.
const ler = (caminho) => readFileSync(new URL(caminho, import.meta.url), "utf8");
const aba = ler("./TreinamentosEadTab.jsx");
const aviso = ler("./AvisoAcessoDialog.jsx");
const lote = ler("./AvisoAtrasadosDialog.jsx");
const tabela = ler("./MatriculasEadCard.jsx");
const pagina = ler("../../pages/SegurancaTrabalho.jsx");

const funcao = (texto, nome) =>
  new RegExp(`const ${nome} = async[\\s\\S]*?\\n {2}\\};`).exec(texto)?.[0] ?? "";

describe("aviso ao funcionário: a mensagem com a senha não é copiada sozinha", () => {
  it("a aba não escreve na área de transferência", () => {
    expect(aba).not.toMatch(/clipboard/);
    expect(aba).not.toMatch(/copiarOuOferecer|copiarTexto/);
    expect(tabela).not.toMatch(/clipboard/);
  });

  it("a janela do aviso só copia no clique de 'Copiar mensagem'", () => {
    const copiar = funcao(aviso, "copiar");
    expect(copiar).toContain("copiarTexto(");
    expect(aviso.match(/copiarTexto\(/g)).toHaveLength(1);
    expect(aviso).toContain("onClick={copiar}");
    expect(aviso).toContain("Copiar mensagem");
  });

  it("havendo senha nova, a senha vai para a janela (uma vez) e não para um toast", () => {
    const avisar = funcao(aba, "avisarFuncionario");
    expect(avisar).toContain("decidirAvisoAoRH(");
    expect(avisar).toContain("setAvisoAcesso(");
    expect(avisar).toContain("senha: r.credenciais?.senha_provisoria");
    expect(avisar).not.toMatch(/toast[^\n]*senha/i);
    expect(aba).toContain(
      "<AvisoAcessoDialog aviso={avisoAcesso} onFechar={() => setAvisoAcesso(null)} />"
    );
  });

  it("um aviso por funcionário de cada vez: clique duplo não cria o acesso em dobro nem apaga a senha da janela (A6)", () => {
    const avisar = funcao(aba, "avisarFuncionario");
    // a trava (a mesma `gravar` das outras gravações, uma por chave) vem antes de qualquer chamada ao backend
    expect(avisar).toContain("gravar(`avisar-${funcionario.id}`");
    expect(avisar.indexOf("gravar(")).toBeGreaterThan(-1);
    expect(avisar.indexOf("gravar(")).toBeLessThan(avisar.indexOf("avisarNoPortal("));
    // o erro vira o toast da própria `gravar`: nenhum catch solto engole a falha
    expect(avisar).not.toMatch(/catch \(e\) \{\s*toast\.error/);
  });

  it("ex-funcionário não recebe aviso (nem ganha acesso ao portal)", () => {
    const avisar = funcao(aba, "avisarFuncionario");
    expect(avisar).toMatch(/funcionario\.ativo === false/);
    expect(avisar.indexOf("funcionario.ativo === false")).toBeLessThan(
      avisar.indexOf("avisarNoPortal(")
    );
  });

  it("trocar de empresa fecha a janela e esquece a senha", () => {
    expect(aba).toMatch(/setAvisoAcesso\(null\);\s*setProgresso\(\[\]\)/);
  });
});

describe("carga dos dados da tabela", () => {
  it("lê todos os funcionários (inclusive ex-funcionários) e separa os ativos para as matrículas", () => {
    expect(aba).toContain("sigo.entities.Funcionario.filter(filtro, SEM_SOFT_DELETE)");
    expect(aba).toContain("setFuncionarios(fs.filter((f) => f.ativo === true && !f.deleted_at))");
    expect(aba).toContain("setFuncionariosTodos(fs)");
  });

  it("progresso e tentativas vêm da empresa, sem `deleted_at` e só com as colunas da tabela", () => {
    expect(aba).toMatch(
      /from\("treinamento_progresso"\)\s*\.select\("matricula_id, aula_id, concluida"\)/
    );
    expect(aba).toMatch(
      /from\("treinamento_tentativa"\)\s*\.select\("matricula_id, numero, nota, aprovada"\)/
    );
    // a tentativa guarda a prova inteira em jsonb: nunca `select *`
    expect(aba).not.toMatch(/TreinamentoTentativa\.filter/);
    expect(aba).not.toMatch(/treinamento_tentativa"\)\s*\.select\("\*"\)/);
    expect(aba).toContain('.eq("empresa_id", filtroEmpresa)');
  });

  it("falhar o andamento não derruba a tela: tem try/catch próprio e respeita a carga superada", () => {
    const carregar = /const carregarAndamento = async[\s\S]*?\n {2}\};/.exec(aba)?.[0] ?? "";
    expect(carregar).toContain("try {");
    expect(carregar).toContain("catch (e)");
    expect(carregar.match(/cargas\.vale\(carga\)/g).length).toBeGreaterThanOrEqual(2);
  });

  it("o andamento é pedido assim que a carga começa, sem depender de a leitura principal dar certo (A6)", () => {
    // antes só era pedido no fim do `try` principal: se a carga B (uma gravação qualquer) falhasse depois de a
    // carga A ter o andamento descartado, o andamento de B nunca era pedido e a tabela ficava em "..."
    const recarregar = /const recarregar = async[\s\S]*?\n {2}\};/.exec(aba)?.[0] ?? "";
    expect(recarregar).toContain("carregarAndamento(carga)");
    expect(recarregar.match(/carregarAndamento\(carga\)/g)).toHaveLength(1);
    const andamento = recarregar.indexOf("carregarAndamento(carga)");
    expect(andamento).toBeGreaterThan(recarregar.indexOf("cargas.iniciar()"));
    expect(andamento).toBeLessThan(recarregar.indexOf("try {"));
  });
});

describe("matricular e renovar", () => {
  it("cada curso é conferido de novo antes de gravar, e as linhas vão em lotes", () => {
    const criar = funcao(aba, "criarMatriculas");
    expect(criar).toContain("cursoMatriculavel(");
    expect(criar).toContain("LOTE_DE_MATRICULAS");
    expect(criar).toContain("bulkCreate(");
    expect(criar).toMatch(/finally \{\s*recarregar\(\)/);
  });

  it("renovar confirma, consulta o banco de novo e só então cria a matrícula nova", () => {
    const renovar = funcao(aba, "renovarMatricula");
    const confirmar = renovar.indexOf("await confirmar(");
    const consulta = renovar.indexOf("TreinamentoMatricula.filter(");
    const cria = renovar.indexOf("bulkCreate(");
    expect(confirmar).toBeGreaterThan(-1);
    expect(consulta).toBeGreaterThan(confirmar);
    expect(cria).toBeGreaterThan(consulta);
    // não mexe na matrícula antiga: o histórico e o certificado ficam como estão
    expect(renovar).not.toMatch(/TreinamentoMatricula\.(update|delete)/);
    expect(renovar).not.toMatch(/TreinamentoCertificado/);
  });

  it("o painel por função usa o vínculo da migração 0131 (exigência → modelo → curso)", () => {
    const lib = ler("../../lib/ead-matricula-funcao.js");
    expect(lib).toContain("exigenciasPorFuncao(");
    expect(lib).toContain("modelo_treinamento_id");
  });
});

describe("aviso em lote aos atrasados", () => {
  it("manda só pelo canal automático (nada de abrir janela do WhatsApp) e sem a senha", () => {
    expect(lote).toContain('sigo.functions.invoke("enviarWhatsApp"');
    expect(lote).not.toMatch(/dispararWhatsApp|window\.open|wa\.me/);
    expect(lote).not.toMatch(/senha_provisoria/);
  });

  it("pára quando o canal recusa, espera entre as mensagens e lembra quem já recebeu hoje", () => {
    expect(lote).toContain("deveInterromperOLote(classe)");
    expect(lote).toContain("PAUSA_ENTRE_ENVIOS_MS");
    expect(lote).toContain("avisadosHoje");
    expect(lote).toContain("gravarAvisados(");
  });

  it("confere o acesso ao portal de cada um antes de montar o lote", () => {
    expect(lote).toContain("acessoPortal");
    expect(lote).toContain(".status(empresaId)");
  });
});

describe("admissão e troca de função: sugere a matrícula por função", () => {
  it("a página sugere ao salvar o funcionário (novo e alterado) e ao registrar a contratação", () => {
    expect(pagina).toContain("sugerirMatricula(null, novoFuncionario)");
    expect(pagina).toContain(
      "sugerirMatricula(selectedFuncionario, { ...selectedFuncionario, ...data })"
    );
    expect(pagina).toMatch(
      /onRegistrado=\{\(novo\) => \{\s*loadData\(\);\s*sugerirMatricula\(null, novo\);/
    );
  });

  it("a aba abre o painel por função com a pessoa marcada e consome a sugestão uma vez", () => {
    expect(aba).toContain('modo: "funcao"');
    expect(aba).toContain("funcionarioIds: [sugestaoMatricula.funcionarioId]");
    expect(aba).toContain("aoConsumirSugestaoRef.current?.()");
  });
});
