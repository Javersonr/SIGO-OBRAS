import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

// Guarda de contrato do cartão "Ambiente e horário do aluno" (T35). O cartão lê e grava pelo cliente do backend e
// usa o Dialog do Radix (portal), que não rodam sem DOM e sem produção: o que dá para travar é o texto. A regra
// de verdade está em `lib/ead-declaracao-ambiente.js` e `lib/ead-atividade-diaria.js` (testes de comportamento) e
// o desenho da janela do RT em `DeclaracaoTextoDialog.test.jsx`.
const ler = (caminho) => readFileSync(new URL(caminho, import.meta.url), "utf8");
const cartao = ler("./AmbienteHorarioEadCard.jsx");
const aba = ler("./TreinamentosEadTab.jsx");

describe("texto da declaração: lido da empresa e gravado como versão nova", () => {
  it("lê as versões da empresa (tabela sem deleted_at: includeDeleted)", () => {
    expect(cartao).toMatch(
      /TreinamentoDeclaracaoTexto\.filter\(\s*\{ empresa_id: empresaId \},\s*SEM_SOFT_DELETE\s*\)/
    );
    expect(cartao).toContain("const SEM_SOFT_DELETE = { includeDeleted: true }");
  });

  it("salvar é INSERT de texto e ART: versão, autor e hora são do banco (o cliente não manda)", () => {
    const criar = /TreinamentoDeclaracaoTexto\.create\(\{([\s\S]*?)\}\)/.exec(cartao)?.[1] ?? "";
    expect(criar).toContain("empresa_id: empresaId");
    expect(criar).toContain("texto");
    expect(criar).toContain("art");
    for (const campo of ["versao", "salvo_por", "salvo_por_email", "created_at"]) {
      expect(criar, campo).not.toContain(campo);
    }
  });

  it("antes de gravar relê as versões: se outro RT salvou uma depois, avisa e não grava (A6, T35)", () => {
    const salvar = /const salvarTexto = async[\s\S]*?\n {2}\};/.exec(cartao)?.[0] ?? "";
    expect(salvar).toContain("conflitoDeEdicao(vigente.versao, atuais)");
    expect(salvar).toMatch(
      /if \(conflito\) \{\s*setVersoes\(atuais\);\s*toast\.error\(mensagemDeConflitoDeEdicao\(conflito\)\);\s*return false;\s*\}/
    );
    // a leitura vem antes do INSERT
    expect(salvar.indexOf("conflitoDeEdicao(")).toBeLessThan(
      salvar.indexOf("TreinamentoDeclaracaoTexto.create(")
    );
  });

  it("nenhuma tela corrige ou apaga uma versão (só inclusão, como o banco)", () => {
    const raiz = fileURLToPath(new URL("../../", import.meta.url));
    const achados = [];
    const varrer = (pasta) => {
      for (const e of readdirSync(pasta, { withFileTypes: true })) {
        const caminho = join(pasta, e.name);
        if (e.isDirectory()) varrer(caminho);
        else if (/\.(js|jsx)$/.test(e.name) && !/\.test\.(js|jsx)$/.test(e.name)) {
          if (
            /TreinamentoDeclaracaoTexto\.(update|delete|deleteMany|restore|bulkCreate)\(/.test(
              readFileSync(caminho, "utf8")
            )
          ) {
            achados.push(caminho);
          }
        }
      }
    };
    varrer(raiz);
    expect(achados).toEqual([]);
  });

  it("o texto padrão aparece como pendente de aprovação do RT, e a ART como 'não informada' quando falta", () => {
    expect(cartao).toContain("Texto padrão: pendente de aprovação do RT");
    expect(cartao).toContain('vigente.art || "não informada"');
    expect(cartao).toContain("Revisar e aprovar o texto");
  });

  it("não deixa editar sem ter lido as versões (erro de leitura trava o botão)", () => {
    expect(cartao).toMatch(/disabled=\{carregandoTexto \|\| erroTexto\}/);
  });
});

describe("relatório: eventos de servidor do período, só quando o RH pede", () => {
  it("a consulta é da empresa, só origem servidor, desde o início do período e do mais novo para o mais antigo", () => {
    const consulta =
      /lerEventosDoPeriodo = \(empresaId, inicio\) =>\s*sigo\.entities\.TreinamentoEvento\.filter\(([\s\S]*?)\n {2}\);/.exec(
        cartao
      )?.[1] ?? "";
    expect(consulta).toContain("empresa_id: empresaId");
    expect(consulta).toContain('origem: "servidor"');
    expect(consulta).toContain("created_at: { $gte: desdeDaConsulta(inicio) }");
    expect(consulta).toContain("SEM_SOFT_DELETE");
    // empate de hora entre páginas: o id desempata, para a linha da fronteira não sumir nem repetir (A6, T35)
    expect(consulta).toContain('sort_by: "-created_at,-id"');
  });

  it("não consulta ao montar: só no botão (a trilha pode ter dezenas de milhares de linhas)", () => {
    const efeitos = [...cartao.matchAll(/useEffect\(\(\) => \{([\s\S]*?)\}, \[[^\]]*\]\);/g)].map(
      (m) => m[1]
    );
    expect(efeitos.length).toBeGreaterThan(0);
    for (const corpo of efeitos) expect(corpo).not.toContain("carregarRelatorio(");
    expect(cartao).toContain("onClick={() => carregarRelatorio()}");
  });

  it("só a última consulta vale e a lista cortada pelo teto do SDK é avisada", () => {
    expect(cartao).toContain("if (pedido !== pedidoRef.current) return;");
    expect(cartao).toContain("TETO_DE_EVENTOS_DO_SDK = 30_000");
    expect(cartao).toContain("Escolha um período menor.");
  });

  it("o CSV leva as linhas do filtro, com BOM para o Excel", () => {
    expect(cartao).toContain('new Blob(["\\uFEFF" + csvDaAtividade(filtradas)]');
  });
});

describe("relatório: a declaração só é cobrada do dia em que ela passou a existir", () => {
  it("busca a PRIMEIRA declaração da empresa (de qualquer época, a mais antiga primeiro, só uma linha)", () => {
    const consulta =
      /lerPrimeiraDeclaracao = async \(empresaId\) => \{\s*const \[primeira\] = await sigo\.entities\.TreinamentoEvento\.filter\(([\s\S]*?)\n {2}\);/.exec(
        cartao
      )?.[1] ?? "";
    expect(consulta).toContain("empresa_id: empresaId");
    expect(consulta).toContain('origem: "servidor"');
    expect(consulta).toContain("evento: EVENTO_DECLARACAO_AMBIENTE");
    expect(consulta).toContain("SEM_SOFT_DELETE");
    expect(consulta).toContain('sort_by: "created_at"');
    expect(consulta).toContain("limit: 1");
    // sem filtro de data: a primeira declaração pode ser mais antiga que o período mostrado
    expect(consulta).not.toContain("$gte");
  });

  it("carrega os eventos do período e a primeira declaração juntos: se um falha, o relatório todo falha", () => {
    expect(cartao).toMatch(
      /Promise\.all\(\[\s*lerEventosDoPeriodo\(empresaId, inicio\),\s*lerPrimeiraDeclaracao\(empresaId\),\s*\]\)/
    );
    expect(cartao).toContain("setInicioCobranca(inicioDaCobranca(primeiraDeclaracao));");
  });

  it("monta as linhas com o corte da cobrança e mostra o aviso dele", () => {
    expect(cartao).toMatch(/montarLinhasDeAtividade\(\{[^}]*cobrarDesde: inicioCobranca,?\s*\}\)/);
    expect(cartao).toContain("avisoDaCobranca({ inicioCobranca, diaInicial })");
    expect(cartao).toContain("{avisoCobranca.texto}");
  });

  it("trocar de empresa zera o corte junto com o relatório (não vale o da empresa anterior)", () => {
    const efeito =
      /useEffect\(\(\) => \{\s*pedidoRef\.current \+= 1;([\s\S]*?)\}, \[empresaId\]\);/.exec(
        cartao
      )?.[1] ?? "";
    expect(efeito).toContain("setEventos(null)");
    expect(efeito).toContain("setInicioCobranca(null)");
  });
});

describe("a aba monta o cartão", () => {
  it("com a empresa da tela (key) e a lista de TODOS os funcionários (nome de quem já saiu)", () => {
    expect(aba).toMatch(
      /<AmbienteHorarioEadCard\s+key=\{empresaAtiva\?\.id\}\s+empresaId=\{empresaAtiva\?\.id\}\s+funcionariosTodos=\{funcionariosTodos\}\s*\/>/
    );
  });
});
