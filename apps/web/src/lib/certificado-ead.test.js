import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { baixarCertificadoPdf, distribuirConteudo, textoDoLocalResumido } from "./certificado-ead";
import { ErroCertificado, MSG_QR_FALHOU } from "./certificado-ead-falhas";

// Registro das chamadas a doc.text (texto e posição em mm), para conferir a geometria do certificado. O jsPDF
// real continua fazendo o PDF: a troca só anota o que foi desenhado, sem mudar nada.
const registro = vi.hoisted(() => ({ textos: [] }));
vi.mock("jspdf", async (importarOriginal) => {
  const real = await importarOriginal();
  function JsPdfComRegistro(...args) {
    const doc = new real.jsPDF(...args);
    const desenhar = doc.text.bind(doc);
    doc.text = (texto, x, y, ...resto) => {
      registro.textos.push({ texto, x, y, pagina: doc.internal.getCurrentPageInfo().pageNumber });
      return desenhar(texto, x, y, ...resto);
    };
    return doc;
  }
  return { ...real, jsPDF: JsPdfComRegistro };
});

// PNG de 1x1 pixel: serve de QR e de logo nos testes (nada de dado real).
const PNG_1X1 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const certificado = (extra = {}) => ({
  codigo: "EAD-TESTE-0001",
  hash_sha256: "0".repeat(64),
  emitido_em: "2026-01-10T12:00:00.000Z",
  assinatura_aluno: { assinado_em: "2026-01-10T12:00:00.000Z", ip: "203.0.113.7" },
  dados: {
    aluno: { nome: "Aluno de Teste", cpf: "00000000000" },
    curso: {
      nome: "Curso de Teste",
      codigo: "CT-1",
      modalidade: "EAD",
      carga_horaria_horas: 1,
      aulas: [{ modulo: "Módulo 1", titulo: "Aula 1" }],
    },
    periodo: { inicio: "2026-01-05", conclusao: "2026-01-10", validade: "2028-01-10" },
    empresa: { nome: "Empresa de Teste", cnpj: "00000000000000" },
    avaliacao: { nota: 100 },
  },
  ...extra,
});

// as falhas são registradas no console (para o suporte); aqui só queremos conferir isso, sem ruído
let erroNoConsole;
beforeEach(() => {
  erroNoConsole = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

/** `salvar` de mentira: guarda o que seria baixado, sem tocar no disco. */
const gravador = () => {
  const salvos = [];
  return { salvos, salvar: (doc, nome) => salvos.push({ nome, bytes: doc.output("arraybuffer") }) };
};

describe("baixarCertificadoPdf: QR do certificado", () => {
  it("QR que não ficou pronto: não baixa e avisa (antes saía um PDF sem QR, em silêncio)", async () => {
    const { salvos, salvar } = gravador();
    const erro = await baixarCertificadoPdf(certificado(), {
      gerarQr: async () => null,
      salvar,
    }).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroCertificado);
    expect(erro.codigo).toBe("QR_FALHOU");
    expect(erro.message).toBe(MSG_QR_FALHOU);
    expect(salvos).toHaveLength(0);
  });

  it("QR que lança erro técnico: vira a mesma falha prevista, sem vazar o texto em inglês", async () => {
    const { salvos, salvar } = gravador();
    const erro = await baixarCertificadoPdf(certificado(), {
      gerarQr: async () => {
        throw new Error("canvas is not defined");
      },
      salvar,
    }).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroCertificado);
    expect(erro.codigo).toBe("QR_FALHOU");
    expect(erro.message).toBe(MSG_QR_FALHOU);
    expect(salvos).toHaveLength(0);
    // o texto técnico não vai para o aluno, mas fica no console
    expect(erroNoConsole).toHaveBeenCalled();
  });

  it("com o QR pronto, baixa o PDF com o nome do aluno e o código", async () => {
    const { salvos, salvar } = gravador();
    await baixarCertificadoPdf(certificado(), { gerarQr: async () => PNG_1X1, salvar });
    expect(salvos).toHaveLength(1);
    expect(salvos[0].nome).toBe("Certificado_Aluno_de_Teste_EAD-TESTE-0001.pdf");
    expect(salvos[0].bytes.byteLength).toBeGreaterThan(1000);
  });
});

describe("baixarCertificadoPdf: logo da empresa", () => {
  it("sem logo: baixa e informa que não desenhou logo", async () => {
    const { salvos, salvar } = gravador();
    const r = await baixarCertificadoPdf(certificado(), { gerarQr: async () => PNG_1X1, salvar });
    expect(r).toMatchObject({ logoDesenhado: false });
    expect(salvos).toHaveLength(1);
  });

  it("com logo válido: desenha e informa", async () => {
    const { salvos, salvar } = gravador();
    const semLogo = gravador();
    await baixarCertificadoPdf(certificado(), {
      gerarQr: async () => PNG_1X1,
      salvar: semLogo.salvar,
    });
    const r = await baixarCertificadoPdf(certificado(), {
      logo: { dataUrl: PNG_1X1, w: 200, h: 80 },
      gerarQr: async () => PNG_1X1,
      salvar,
    });
    expect(r).toMatchObject({ logoDesenhado: true });
    expect(salvos).toHaveLength(1);
    // a imagem do logo entra no PDF, que fica maior que o sem logo
    expect(salvos[0].bytes.byteLength).toBeGreaterThan(semLogo.salvos[0].bytes.byteLength);
  });

  it("logo que o PDF não aceita não derruba o certificado: baixa sem ele e informa", async () => {
    const { salvos, salvar } = gravador();
    const r = await baixarCertificadoPdf(certificado(), {
      // base64 válido, mas o conteúdo é texto (um SVG, por exemplo, o PDF não desenha)
      logo: { dataUrl: `data:image/svg+xml;base64,${btoa("<svg></svg>")}`, w: 200, h: 80 },
      gerarQr: async () => PNG_1X1,
      salvar,
    });
    expect(r).toMatchObject({ logoDesenhado: false });
    expect(salvos).toHaveLength(1);
    expect(erroNoConsole).toHaveBeenCalled();
  });
});

describe("baixarCertificadoPdf: local de realização (T8)", () => {
  /** Conteúdo do PDF como texto: o jsPDF grava o texto das páginas sem compressão. */
  const textoDoPdf = async (cert) => {
    let texto = "";
    await baixarCertificadoPdf(cert, {
      gerarQr: async () => PNG_1X1,
      salvar: (doc) => {
        texto = doc.output();
      },
    });
    return texto;
  };
  const comLocal = () =>
    certificado({
      dados: {
        ...certificado().dados,
        local: { ambiente: "Plataforma de Teste — https://exemplo.test/portal" },
      },
    });

  it("imprime o local gravado no certificado, na frente", async () => {
    const texto = await textoDoPdf(comLocal());
    expect(texto).toContain("Local de realiza");
    expect(texto).toContain("Plataforma de Teste");
    expect(texto).toContain("https://exemplo.test/portal");
  });

  it("certificado de antes da T8, sem local, sai sem a linha", async () => {
    const texto = await textoDoPdf(certificado());
    expect(texto).not.toContain("Local de realiza");
  });

  it("local e validade juntos: as duas linhas saem", async () => {
    const texto = await textoDoPdf(comLocal());
    expect(texto).toContain("Validade: at");
    expect(texto).toContain("Local de realiza");
  });

  it("sem validade, o local sobe para o lugar dela (continua na frente)", async () => {
    const c = comLocal();
    c.dados.periodo = { ...c.dados.periodo, validade: null };
    const texto = await textoDoPdf(c);
    expect(texto).not.toContain("Validade: at");
    expect(texto).toContain("Local de realiza");
  });
});

describe("baixarCertificadoPdf: tipo do treinamento (T23)", () => {
  const textoDoPdf = async (cert) => {
    let texto = "";
    await baixarCertificadoPdf(cert, {
      gerarQr: async () => PNG_1X1,
      salvar: (doc) => {
        texto = doc.output();
      },
    });
    return texto;
  };
  const comTipo = (extra, base = certificado()) => ({
    ...base,
    dados: { ...base.dados, ...extra },
  });

  it("imprime o tipo do treinamento gravado no certificado", async () => {
    for (const [tipo, rotulo] of [
      ["inicial", "Inicial"],
      ["periodico", "Peri"],
    ]) {
      const texto = await textoDoPdf(comTipo({ tipo_treinamento: tipo }));
      expect(texto).toContain("Tipo de treinamento: " + rotulo);
      expect(texto).not.toContain("Motivo:");
    }
  });

  it("tipo e validade saem na mesma linha (o certificado não ganha altura)", async () => {
    const texto = await textoDoPdf(comTipo({ tipo_treinamento: "inicial" }));
    expect(texto).toMatch(/Tipo de treinamento: Inicial\s+\S+\s+Validade: at/);
  });

  it("eventual imprime o motivo", async () => {
    const texto = await textoDoPdf(
      comTipo({ tipo_treinamento: "eventual", motivo_eventual: "Mudança de procedimento de teste" })
    );
    expect(texto).toContain("Tipo de treinamento: Eventual");
    expect(texto).toContain("Motivo: Mudan");
    expect(texto).toContain("procedimento de teste");
  });

  it("motivo comprido (200 caracteres) quebra em linhas e o PDF sai inteiro", async () => {
    const motivo = "palavra ".repeat(40).trim().slice(0, 200);
    const { salvos, salvar } = gravador();
    await baixarCertificadoPdf(comTipo({ tipo_treinamento: "eventual", motivo_eventual: motivo }), {
      gerarQr: async () => PNG_1X1,
      salvar,
    });
    expect(salvos).toHaveLength(1);
  });

  it("o bloco de detalhes (tipo, motivo, validade e local) termina acima das imagens das assinaturas", async () => {
    // Pior caso: motivo de 200 caracteres (duas linhas), validade e local, com as duas imagens de assinatura.
    // As imagens começam em y = 142 - 1,5 - 18 = 122,5 mm (a linha das assinaturas fica em 142); o texto do
    // bloco tem de acabar antes disso. Os y vêm das chamadas a doc.text, em milímetros.
    registro.textos.length = 0;
    const motivo = "palavra ".repeat(40).trim().slice(0, 200);
    const cert = comTipo({
      tipo_treinamento: "eventual",
      motivo_eventual: motivo,
      local: { ambiente: "Plataforma de Teste — https://exemplo.test/portal" },
      instrutor: { nome: "Instrutor de Teste", qualificacao: "Eng. de Teste" },
      responsavel_tecnico: { nome: "RT de Teste", registro: "CREA-XX 0000" },
    });
    const IMAGEM = { dataUrl: PNG_1X1, w: 300, h: 100 };
    await baixarCertificadoPdf(cert, {
      gerarQr: async () => PNG_1X1,
      assinaturas: { instrutor: IMAGEM, responsavel_tecnico: IMAGEM },
      salvar: () => {},
    });
    const doTexto = (re) => registro.textos.find((c) => re.test([c.texto].flat().join(" ")));
    const tipo = doTexto(/Tipo de treinamento/);
    const rotuloMotivo = doTexto(/Motivo:/);
    const local = doTexto(/Local de realiza/);
    expect(tipo && rotuloMotivo && local).toBeTruthy();
    // de cima para baixo: tipo e validade, motivo, local
    expect(tipo.y).toBeLessThan(rotuloMotivo.y);
    expect(rotuloMotivo.y).toBeLessThan(local.y);
    // o motivo de 200 caracteres ocupa duas linhas (~4,6 mm cada) e o local, uma
    expect(
      Array.isArray(rotuloMotivo.texto) ? rotuloMotivo.texto.length : 1
    ).toBeGreaterThanOrEqual(2);
    const ultimaLinhaDoLocal = local.y + ([local.texto].flat().length - 1) * 4.6;
    expect(ultimaLinhaDoLocal).toBeLessThan(122.5);
    // e nada do bloco encosta nas assinaturas, nem no texto de abertura que vem antes
    expect(tipo.y).toBeGreaterThan(90);
  });

  it("certificado de antes da T23, sem o tipo, sai sem a linha e sem o motivo", async () => {
    const texto = await textoDoPdf(certificado());
    expect(texto).not.toContain("Tipo de treinamento");
    expect(texto).not.toContain("Motivo:");
    expect(texto).toContain("Validade: at");
  });

  it("motivo de certificado que não é eventual não sai impresso", async () => {
    const texto = await textoDoPdf(
      comTipo({ tipo_treinamento: "inicial", motivo_eventual: "não deve sair" })
    );
    expect(texto).not.toContain("não deve sair");
  });
});

describe("baixarCertificadoPdf: assinaturas do instrutor e do responsável técnico (T29)", () => {
  const IMAGEM = { dataUrl: PNG_1X1, w: 300, h: 100 };
  const comPessoas = () =>
    certificado({
      dados: {
        ...certificado().dados,
        instrutor: { nome: "Instrutor de Teste", qualificacao: "Eng. de Teste" },
        responsavel_tecnico: { nome: "RT de Teste", registro: "CREA-XX 0000" },
      },
    });
  /** O PDF gerado como texto e o resultado. */
  const gerar = async (cert, opcoes = {}) => {
    let texto = "";
    let tamanho = 0;
    const r = await baixarCertificadoPdf(cert, {
      gerarQr: async () => PNG_1X1,
      salvar: (doc) => {
        texto = doc.output();
        tamanho = doc.output("arraybuffer").byteLength;
      },
      ...opcoes,
    });
    return { r, texto, tamanho };
  };
  // objetos de imagem do PDF (um PNG com transparência gera dois: a imagem e a máscara)
  const imagensNoPdf = (texto) => (texto.match(/\/Subtype \/Image/g) ?? []).length;

  it("sem imagens, o certificado sai como antes: nome e registro, sem imagem de assinatura", async () => {
    const { r, texto } = await gerar(comPessoas());
    expect(r.assinaturasDesenhadas).toEqual([]);
    expect(texto).toContain("Instrutor de Teste");
    expect(texto).toContain("CREA-XX 0000");
    expect(imagensNoPdf(texto)).toBeGreaterThan(0); // só o QR
  });

  it("com as duas imagens, desenha as duas e continua imprimindo nome e registro", async () => {
    const sem = await gerar(comPessoas());
    const uma = await gerar(comPessoas(), { assinaturas: { instrutor: IMAGEM } });
    const { r, texto, tamanho } = await gerar(comPessoas(), {
      assinaturas: { instrutor: IMAGEM, responsavel_tecnico: IMAGEM },
    });
    expect(r.assinaturasDesenhadas).toEqual(["instrutor", "responsavel_tecnico"]);
    // cada assinatura acrescenta o mesmo tanto de imagem ao PDF, e o PDF cresce
    const porAssinatura = imagensNoPdf(uma.texto) - imagensNoPdf(sem.texto);
    expect(porAssinatura).toBeGreaterThan(0);
    expect(imagensNoPdf(texto) - imagensNoPdf(sem.texto)).toBe(2 * porAssinatura);
    expect(tamanho).toBeGreaterThan(sem.tamanho);
    expect(texto).toContain("Instrutor de Teste");
    expect(texto).toContain("RT de Teste");
    expect(texto).toContain("CREA-XX 0000");
  });

  it("só uma das imagens: desenha só ela", async () => {
    const sem = await gerar(comPessoas());
    const { r, texto } = await gerar(comPessoas(), {
      assinaturas: { instrutor: null, responsavel_tecnico: IMAGEM },
    });
    expect(r.assinaturasDesenhadas).toEqual(["responsavel_tecnico"]);
    expect(imagensNoPdf(texto)).toBeGreaterThan(imagensNoPdf(sem.texto));
  });

  it("imagem que o PDF não aceita não derruba o certificado: sai sem ela e o retorno diz", async () => {
    const { r, salvos } = await (async () => {
      const g = gravador();
      const r = await baixarCertificadoPdf(comPessoas(), {
        gerarQr: async () => PNG_1X1,
        salvar: g.salvar,
        assinaturas: {
          // base64 válido, mas o conteúdo é texto (um SVG, por exemplo, o PDF não desenha)
          instrutor: {
            dataUrl: "data:image/svg+xml;base64," + btoa("<svg></svg>"),
            w: 300,
            h: 100,
          },
          responsavel_tecnico: IMAGEM,
        },
      });
      return { r, salvos: g.salvos };
    })();
    expect(salvos).toHaveLength(1);
    expect(r.assinaturasDesenhadas).toEqual(["responsavel_tecnico"]);
    expect(erroNoConsole).toHaveBeenCalled();
  });

  it("imagem sem medida (0x0) não é desenhada nem derruba o certificado", async () => {
    const { r } = await gerar(comPessoas(), {
      assinaturas: { instrutor: { dataUrl: PNG_1X1, w: 0, h: 0 }, responsavel_tecnico: null },
    });
    expect(r.assinaturasDesenhadas).toEqual([]);
  });

  it("o logo e as assinaturas convivem (cada um informado no seu campo)", async () => {
    const { r } = await gerar(comPessoas(), {
      logo: { dataUrl: PNG_1X1, w: 200, h: 80 },
      assinaturas: { instrutor: IMAGEM, responsavel_tecnico: IMAGEM },
    });
    expect(r.logoDesenhado).toBe(true);
    expect(r.assinaturasDesenhadas).toEqual(["instrutor", "responsavel_tecnico"]);
  });
});

describe("baixarCertificadoPdf: semipresencial (T12)", () => {
  const textoDoPdf = async (cert) => {
    let texto = "";
    await baixarCertificadoPdf(cert, {
      gerarQr: async () => PNG_1X1,
      salvar: (doc) => {
        texto = doc.output();
      },
    });
    return texto;
  };
  const LOCAL_PRATICA = "Pátio de treinamento de teste";
  const semipresencial = (extra = {}) =>
    certificado({
      dados: {
        ...certificado().dados,
        curso: {
          ...certificado().dados.curso,
          modalidade: "Semipresencial: teoria EAD (32 h) + prática presencial (8 h)",
          carga_horaria_horas: 40,
          carga_teorica_horas: 32,
          carga_pratica_horas: 8,
        },
        local: {
          ambiente: "Plataforma de Teste — https://exemplo.test/portal",
          pratica: LOCAL_PRATICA,
        },
        pratica: {
          carga_horas: 8,
          resultado: "satisfatorio",
          sessoes: [
            {
              sessao_id: "sessao-teste",
              data: "2026-10-05",
              hora_inicio: "08:00",
              hora_fim: "17:00",
              local: LOCAL_PRATICA,
              instrutor: { nome: "Instrutor da Prática", qualificacao: "Técnico de Teste" },
              carga_horas: 8,
            },
          ],
        },
        ...extra,
      },
    });

  it("a frente mostra as duas cargas (na modalidade) e o local da prática", async () => {
    const texto = await textoDoPdf(semipresencial());
    // (o PDF escapa os parênteses: confere sem eles)
    expect(texto).toContain("Semipresencial: teoria EAD");
    expect(texto).toContain("32 h");
    expect(texto).toContain("presencial");
    expect(texto).toContain("8 h");
    expect(texto).toContain("Local de realiza");
    expect(texto).toContain("Plataforma de Teste");
    expect(texto).toContain(LOCAL_PRATICA);
    // a URL da plataforma sai da linha do semipresencial (o QR e o rodapé já levam o endereço)
    expect(texto).not.toContain("https://exemplo.test/portal");
  });

  it("o verso traz a parte prática: dia, horário, local, instrutor, carga e resultado", async () => {
    const texto = await textoDoPdf(semipresencial());
    expect(texto).toContain("PARTE PR");
    expect(texto).toContain("05/10/2026");
    expect(texto).toContain("08:00 às 17:00");
    expect(texto).toContain("Instrutor da Pr");
    expect(texto).toContain("Técnico de Teste");
    // (o PDF escapa os parênteses): a carga da sessão vem logo depois do horário
    expect(texto).toContain("17:00 \\(8 h\\)");
    expect(texto).toContain("satisfatório");
    expect(texto).toContain("prática presencial registrada pela empresa");
  });

  it("certificado EAD continua sem a parte prática e com a nota de sempre", async () => {
    const texto = await textoDoPdf(certificado());
    expect(texto).not.toContain("PARTE PR");
    expect(texto).toContain("Treinamento a distância com registro individual");
  });

  it("local da prática comprido em maiúsculas e motivo de 200 caracteres: o bloco termina acima das assinaturas", async () => {
    registro.textos.length = 0;
    const motivo = "palavra ".repeat(40).trim().slice(0, 200);
    const local = "W".repeat(120);
    const cert = semipresencial({
      tipo_treinamento: "eventual",
      motivo_eventual: motivo,
      local: { ambiente: "Plataforma SIGO Obras — https://exemplo.test/portal", pratica: local },
      instrutor: { nome: "Instrutor de Teste", qualificacao: "Eng. de Teste" },
      responsavel_tecnico: { nome: "RT de Teste", registro: "CREA-XX 0000" },
    });
    cert.dados.curso.nome =
      "NR-10 BÁSICO — SEGURANÇA EM INSTALAÇÕES E SERVIÇOS EM ELETRICIDADE (CURSO DE TESTE COMPRIDO)";
    const IMAGEM = { dataUrl: PNG_1X1, w: 300, h: 100 };
    await baixarCertificadoPdf(cert, {
      gerarQr: async () => PNG_1X1,
      assinaturas: { instrutor: IMAGEM, responsavel_tecnico: IMAGEM },
      salvar: () => {},
    });
    const doTexto = (re) => registro.textos.find((c) => re.test([c.texto].flat().join(" ")));
    const corpo = doTexto(/^Certificamos que/);
    const tipo = doTexto(/Tipo de treinamento/);
    const linhaDoLocal = doTexto(/Local de realiza/);
    expect(corpo && tipo && linhaDoLocal).toBeTruthy();
    // o local cabe em duas linhas (a fonte diminui se for preciso) e termina antes das imagens (122,5 mm)
    const linhas = [linhaDoLocal.texto].flat().length;
    expect(linhas).toBeLessThanOrEqual(2);
    expect(linhaDoLocal.y + (linhas - 1) * 4.6).toBeLessThan(122.5);
    // o texto de abertura (com a modalidade maior) termina antes do bloco de detalhes
    const linhasDoCorpo = [corpo.texto].flat().length;
    const fimDoCorpo = corpo.y + (linhasDoCorpo - 1) * 12.5 * 1.6 * 0.3528;
    expect(fimDoCorpo).toBeLessThan(tipo.y - 3);
  });

  it("três locais longos da prática: a linha da frente resume (primeiro local e 'mais N', ver o verso) e cabe em 2 linhas (A6, T12 N4)", async () => {
    registro.textos.length = 0;
    const locais = ["W", "X", "Y"].map((c) => c.repeat(120));
    const cert = semipresencial({
      local: {
        ambiente: "Plataforma SIGO Obras — https://exemplo.test/portal",
        pratica: `${locais[0]}; ${locais[1]} e ${locais[2]}`,
      },
      pratica: {
        carga_horas: 24,
        resultado: "satisfatorio",
        sessoes: locais.map((local, i) => ({
          sessao_id: `s${i}`,
          data: `2026-10-0${i + 1}`,
          hora_inicio: "08:00",
          hora_fim: "17:00",
          local,
          instrutor: { nome: "Instrutor da Prática", qualificacao: "Técnico de Teste" },
          carga_horas: 8,
        })),
      },
      instrutor: { nome: "Instrutor de Teste", qualificacao: "Eng. de Teste" },
      responsavel_tecnico: { nome: "RT de Teste", registro: "CREA-XX 0000" },
    });
    const IMAGEM = { dataUrl: PNG_1X1, w: 300, h: 100 };
    await baixarCertificadoPdf(cert, {
      gerarQr: async () => PNG_1X1,
      assinaturas: { instrutor: IMAGEM, responsavel_tecnico: IMAGEM },
      salvar: () => {},
    });
    const linha = registro.textos.find((c) => /Local de realiza/.test([c.texto].flat().join(" ")));
    expect(linha).toBeTruthy();
    const linhas = [linha.texto].flat();
    expect(linhas.length).toBeLessThanOrEqual(2);
    // termina antes das imagens das assinaturas (122,5 mm)
    expect(linha.y + (linhas.length - 1) * 4.6).toBeLessThan(122.5);
    const texto = linhas.join(" ");
    expect(texto).toMatch(/e mais 2 locais/);
    expect(texto).toMatch(/ver o verso/);
    expect(texto).toContain("W");
    // o verso continua listando todos os locais (cada sessão com o seu)
    const todo = registro.textos.map((c) => [c.texto].flat().join(" ")).join("\n");
    expect(todo).toContain("X".repeat(30));
    expect(todo).toContain("Y".repeat(30));
  });

  it("textoDoLocalResumido: só resume quando há mais de um local; um local só segue inteiro na linha normal", () => {
    const sessao = (local) => ({ local });
    expect(textoDoLocalResumido({ pratica: { sessoes: [sessao("A")] } })).toBeNull();
    expect(textoDoLocalResumido({ pratica: { sessoes: [sessao("A"), sessao("A")] } })).toBeNull();
    expect(textoDoLocalResumido({})).toBeNull();
    const dois = textoDoLocalResumido({
      local: { ambiente: "Plataforma SIGO Obras — https://exemplo.test/portal" },
      pratica: { sessoes: [sessao("Local A"), sessao("Local B")] },
    });
    expect(dois).toBe(
      "Local de realização: teoria a distância na Plataforma SIGO Obras; prática presencial em Local A e mais 1 local (ver o verso)"
    );
    const longo = textoDoLocalResumido({
      local: { ambiente: "Plataforma SIGO Obras — https://exemplo.test/portal" },
      pratica: { sessoes: [sessao("Z".repeat(120)), sessao("Local B")] },
    });
    expect(longo).toContain(`${"Z".repeat(37)}...`);
    expect(longo).not.toContain("Z".repeat(38));
  });

  it("o bloco da prática no verso não invade o QR nem o rodapé", async () => {
    registro.textos.length = 0;
    const longo = semipresencial();
    longo.dados.pratica.sessoes[0].local = "W".repeat(120);
    longo.dados.pratica.sessoes[0].instrutor = {
      nome: "N".repeat(120),
      qualificacao: "Q".repeat(200),
    };
    await baixarCertificadoPdf(longo, { gerarQr: async () => PNG_1X1, salvar: () => {} });
    const bloco = registro.textos.filter((c) => c.y > 140 && c.y < 190 && c.x < 30);
    expect(bloco.length).toBeGreaterThan(0);
    // o texto do verso (fora o rodapé, que fica em H - 17,5 e H - 13,5) acaba antes de H - 20 = 190 mm
    for (const c of registro.textos.filter((t) => t.y > 150 && t.y < 192)) {
      const ultima = c.y + ([c.texto].flat().length - 1) * 3.6;
      expect(ultima).toBeLessThan(190);
    }
  });
});

describe("baixarCertificadoPdf: verso com conteúdo programático longo e parte prática (T12, revisão 1)", () => {
  const H = 210;
  const TITULO = "PARTE PRÁTICA PRESENCIAL";
  const LOCAL = "Pátio de treinamento de teste";
  const sessaoDeTeste = (dia, extra = {}) => ({
    sessao_id: `sessao-${dia}`,
    data: `2026-10-${String(dia).padStart(2, "0")}`,
    hora_inicio: "08:00",
    hora_fim: "17:00",
    local: LOCAL,
    instrutor: { nome: "Instrutor da Prática", qualificacao: "Técnico de Teste" },
    carga_horas: 8,
    ...extra,
  });
  /** Certificado semipresencial (ou EAD, com `semPratica`) com o conteúdo programático dado. */
  const comConteudo = ({ conteudo, sessoes = [sessaoDeTeste(5)], semPratica = false }) => {
    const base = certificado();
    return certificado({
      dados: {
        ...base.dados,
        curso: {
          ...base.dados.curso,
          carga_horaria_horas: 40,
          conteudo_programatico: conteudo,
          ...(semPratica
            ? {}
            : {
                modalidade: "Semipresencial: teoria EAD (24 h) + prática presencial (16 h)",
                carga_teorica_horas: 24,
                carga_pratica_horas: 16,
              }),
        },
        ...(semPratica
          ? {}
          : {
              local: { ambiente: "Plataforma de Teste — https://exemplo.test", pratica: LOCAL },
              pratica: {
                carga_horas: sessoes.reduce((t, s) => t + s.carga_horas, 0),
                resultado: "satisfatorio",
                sessoes,
              },
            }),
      },
    });
  };
  /** Gera o PDF e devolve o que foi desenhado (com a página) e quantas páginas saíram. */
  const gerar = async (cert) => {
    registro.textos.length = 0;
    let paginas = 0;
    let bruto = "";
    await baixarCertificadoPdf(cert, {
      gerarQr: async () => PNG_1X1,
      salvar: (doc) => {
        paginas = doc.getNumberOfPages();
        bruto = doc.output();
      },
    });
    const textos = registro.textos.map((c) => ({ ...c, linhas: [c.texto].flat() }));
    return { paginas, bruto, textos };
  };
  /** As linhas de conteúdo (as que começam com "Item") e a última linha de cada texto desenhado. */
  const doConteudo = (textos) => textos.filter((c) => c.linhas[0].startsWith("Item "));
  const ultimaLinhaY = (c) => c.y + (c.linhas.length - 1) * 3.65;
  const corrido = (n) =>
    Array.from(
      { length: n },
      (_, i) => `Item ${i + 1}: texto corrido do conteúdo programático da NR-10`
    ).join("\n");

  it("texto corrido de 36 linhas (sem '# ') no semipresencial: usa a 2ª coluna e fica acima do bloco da prática", async () => {
    const { paginas, textos } = await gerar(comConteudo({ conteudo: corrido(36) }));
    expect(paginas).toBe(2);
    const titulo = textos.find((c) => c.linhas[0] === TITULO);
    expect(titulo).toBeTruthy();
    const conteudo = doConteudo(textos);
    expect(conteudo.length).toBe(36);
    // o título e o texto da prática estão no verso e nada do conteúdo passa por cima deles
    expect(titulo.pagina).toBe(2);
    for (const c of conteudo) {
      expect(c.pagina).toBe(2);
      expect(ultimaLinhaY(c)).toBeLessThan(titulo.y - 3);
    }
    // a 2ª coluna foi usada (antes, um bloco só ficava na 1ª e escorria pela página)
    expect(new Set(conteudo.map((c) => Math.round(c.x))).size).toBe(2);
    // nenhuma linha começa abaixo do limite nem chega à folha de baixo
    expect(Math.max(...conteudo.map((c) => c.y))).toBeLessThan(titulo.y - 5);
  });

  it("o mesmo conteúdo com módulos ('# ') também fica acima do bloco da prática", async () => {
    const conteudo = Array.from({ length: 9 }, (_, m) =>
      [
        `# Módulo ${m + 1}`,
        ...Array.from({ length: 4 }, (_, i) => `Item ${m * 4 + i + 1}: aula do módulo`),
      ].join("\n")
    ).join("\n");
    const { paginas, textos } = await gerar(comConteudo({ conteudo }));
    expect(paginas).toBe(2);
    const titulo = textos.find((c) => c.linhas[0] === TITULO);
    const aulas = doConteudo(textos);
    expect(aulas.length).toBe(36);
    for (const c of aulas) expect(ultimaLinhaY(c)).toBeLessThan(titulo.y - 3);
  });

  it("conteúdo que não cabe nem com a fonte menor abre página nova, sem nada por cima da prática", async () => {
    const { paginas, textos, bruto } = await gerar(comConteudo({ conteudo: corrido(180) }));
    expect(paginas).toBeGreaterThanOrEqual(3);
    const titulos = textos.filter((c) => c.linhas[0] === TITULO);
    expect(titulos.length).toBe(1);
    // a prática está na última página; as páginas a mais repetem o cabeçalho e levam o código e o QR
    expect(titulos[0].pagina).toBe(paginas);
    expect(textos.filter((c) => c.linhas[0].startsWith("CONTEÚDO PROGRAMÁTICO")).length).toBe(
      paginas - 1
    );
    expect(bruto).toContain("continua");
    expect(textos.filter((c) => c.linhas[0].startsWith("Código de autenticidade")).length).toBe(
      paginas
    );
    // todo o conteúdo está lá (nenhuma linha se perdeu) e acima do limite em TODAS as páginas
    const conteudo = doConteudo(textos);
    const todas = conteudo.flatMap((c) => c.linhas.filter((l) => l.startsWith("Item ")));
    expect(todas.length).toBe(180);
    for (const c of conteudo) expect(ultimaLinhaY(c)).toBeLessThan(titulos[0].y - 3);
  });

  it("certificado EAD com texto corrido muito longo: nada passa da nota do pé nem do rodapé", async () => {
    const { paginas, textos } = await gerar(
      comConteudo({ conteudo: corrido(160), semPratica: true })
    );
    expect(paginas).toBeGreaterThanOrEqual(3);
    expect(textos.some((c) => c.linhas[0] === TITULO)).toBe(false);
    for (const c of doConteudo(textos)) expect(ultimaLinhaY(c)).toBeLessThan(H - 48);
  });

  it("conteúdo curto sai como sempre saiu: 1 coluna, fonte inteira e uma página de verso", async () => {
    const { paginas, textos } = await gerar(comConteudo({ conteudo: corrido(8) }));
    expect(paginas).toBe(2);
    const conteudo = doConteudo(textos);
    expect(new Set(conteudo.map((c) => c.x)).size).toBe(1);
    expect(conteudo[0].y).toBe(40);
    expect(conteudo[1].y).toBeCloseTo(44.4, 5);
  });

  it("a prática de vários dias lista cada sessão no verso, com a carga somada, e o bloco cresce sem cortar texto", async () => {
    const sessoes = [5, 6, 7, 8].map((dia) =>
      sessaoDeTeste(dia, dia === 7 ? { local: "Galpão B de teste" } : {})
    );
    const { textos, bruto } = await gerar(comConteudo({ conteudo: corrido(30), sessoes }));
    for (const dia of ["05/10/2026", "06/10/2026", "07/10/2026", "08/10/2026"]) {
      expect(bruto).toContain(dia);
    }
    expect(bruto).toContain("4 sess");
    expect(bruto).toContain("32 h no total");
    expect(bruto).toContain("Galpão B de teste");
    expect(bruto).toContain("em todas as sess");
    // o bloco termina acima da nota do pé (H - 30) e o conteúdo, acima do título dele
    const titulo = textos.find((c) => c.linhas[0] === TITULO);
    const bloco = textos.find(
      (c) => c.x === 18 && c.pagina === 2 && c.y > titulo.y && c.linhas.length > 3
    );
    expect(bloco).toBeTruthy();
    expect(ultimaLinhaY({ ...bloco, linhas: bloco.linhas })).toBeLessThan(H - 33);
    for (const c of doConteudo(textos)) expect(ultimaLinhaY(c)).toBeLessThan(titulo.y - 3);
    // com 4 sessões o título sobe em relação ao de uma sessão só
    const umaSessao = await gerar(comConteudo({ conteudo: corrido(30) }));
    const tituloUma = umaSessao.textos.find((c) => c.linhas[0] === TITULO);
    expect(titulo.y).toBeLessThan(tituloUma.y);
  });

  it("com uma sessão só, o bloco termina em H - 36,5 (acima da nota do pé, que continua em H - 30)", async () => {
    const { textos } = await gerar(comConteudo({ conteudo: corrido(8) }));
    const titulo = textos.find((c) => c.linhas[0] === TITULO);
    const bloco = textos.find(
      (c) => c.pagina === 2 && c.x === 18 && c.y > titulo.y && c.y < titulo.y + 6
    );
    expect(bloco.linhas[0]).toContain("Realizada em 05/10/2026");
    // o título fica 4,5 mm acima da 1ª linha; a última linha do bloco, em H - 36,5 (fonte de 8,5 pt)
    expect(bloco.y - titulo.y).toBeCloseTo(4.5, 5);
    expect(bloco.y + (bloco.linhas.length - 1) * 8.5 * 0.3528 * 1.15).toBeCloseTo(H - 36.5, 5);
    const nota = textos.find((c) => c.linhas[0].startsWith("Teoria a distância"));
    expect(nota.y).toBe(H - 30);
  });
});

describe("distribuirConteudo: colunas, fonte e páginas do conteúdo programático (T12, revisão 1)", () => {
  // jsPDF de mentira: cada texto vira uma linha só (60 caracteres por linha de cada coluna não importam aqui)
  const doc = {
    setFont: () => {},
    setFontSize: () => {},
    splitTextToSize: (texto) => [texto],
  };
  const linhas = (n, prefixo = "Item") =>
    Array.from({ length: n }, (_, i) => `${prefixo} ${i + 1}`);
  const CFG = { colunasBase: 2, limite: 144, largura: 261 };

  it("um bloco que cabe numa coluna vazia não é partido entre colunas", () => {
    // 3 módulos de 8 linhas: 8 x 4,4 = 35 mm cada; dois cabem na 1ª coluna (40 a 144), o 3º vai para a 2ª
    const blocos = [0, 1, 2].map((m) => [`# Módulo ${m}`, ...linhas(7, `M${m} aula`)]);
    const r = distribuirConteudo(doc, blocos, CFG);
    expect(r.paginas).toBe(1);
    expect(r.escala).toBe(1);
    for (const m of [0, 1, 2]) {
      const doModulo = r.itens.filter(
        (i) => i.partes[0].startsWith(`M${m} aula`) || i.partes[0] === `Módulo ${m}`
      );
      expect(new Set(doModulo.map((i) => i.col)).size).toBe(1);
    }
    expect(r.itens.find((i) => i.partes[0] === "Módulo 2").col).toBe(1);
  });

  it("um bloco mais alto que uma coluna (texto corrido) é partido por linha e usa a 2ª coluna", () => {
    const r = distribuirConteudo(doc, [linhas(40)], CFG);
    expect(r.paginas).toBe(1);
    expect(r.escala).toBe(1);
    expect(r.itens.length).toBe(40);
    expect(new Set(r.itens.map((i) => i.col))).toEqual(new Set([0, 1]));
    for (const i of r.itens) expect(i.y + 4.4).toBeLessThanOrEqual(CFG.limite + 1e-6);
    // na ordem do texto: a 1ª coluna inteira antes da 2ª
    const colunas = r.itens.map((i) => i.col);
    expect(colunas).toEqual([...colunas].sort());
  });

  it("conteúdo curto com 1 coluna fica em 1 coluna e na fonte inteira", () => {
    const r = distribuirConteudo(doc, [linhas(10)], { ...CFG, colunasBase: 1 });
    expect(r.colunas).toBe(1);
    expect(r.escala).toBe(1);
    r.itens.forEach((item, k) => expect(item.y).toBeCloseTo(40 + k * 4.4, 6));
    expect(r.itens.length).toBe(10);
  });

  it("conteúdo de 1 coluna que não cabe passa para 2 colunas antes de reduzir a fonte", () => {
    const r = distribuirConteudo(doc, [linhas(30)], { ...CFG, colunasBase: 1 });
    expect(r.colunas).toBe(2);
    expect(r.escala).toBe(1);
  });

  it("o que não cabe com a fonte inteira usa uma fonte menor antes de abrir página", () => {
    // 2 colunas de (144 - 40) / 4,4 = 23 linhas = 46; com 0,92 (4,05 mm): 25 por coluna = 50
    const r = distribuirConteudo(doc, [linhas(49)], CFG);
    expect(r.paginas).toBe(1);
    expect(r.escala).toBeLessThan(1);
    for (const i of r.itens) expect(i.y).toBeLessThan(CFG.limite);
  });

  it("passando da menor fonte, segue em páginas a mais, sem perder linha e sem passar do limite", () => {
    const r = distribuirConteudo(doc, [linhas(300)], CFG);
    expect(r.paginas).toBeGreaterThanOrEqual(3);
    expect(r.escala).toBe(0.78);
    expect(r.itens.length).toBe(300);
    for (const i of r.itens) expect(i.y + 4.4 * 0.78).toBeLessThanOrEqual(CFG.limite + 1e-6);
    // as páginas se enchem em ordem
    const paginas = r.itens.map((i) => i.pagina);
    expect(paginas).toEqual([...paginas].sort((a, b) => a - b));
  });

  it("um parágrafo mais alto que uma coluna inteira é partido (nada passa do limite)", () => {
    const longo = { ...doc, splitTextToSize: () => linhas(80, "L") };
    const r = distribuirConteudo(longo, [["texto muito longo"]], CFG);
    const todas = r.itens.flatMap((i) => i.partes);
    expect(todas.length).toBe(80);
    for (const i of r.itens) {
      expect(i.y + i.partes.length * 4.4 * r.escala).toBeLessThanOrEqual(CFG.limite + 1e-6);
    }
  });

  it("limite absurdo (o bloco da prática ocupando quase a página) não trava: uma linha por coluna", () => {
    const r = distribuirConteudo(doc, [linhas(5)], { ...CFG, limite: 41 });
    expect(r.itens.length).toBe(5);
    expect(r.paginas).toBeGreaterThanOrEqual(2);
  });

  it("sem conteúdo, nada é distribuído", () => {
    const r = distribuirConteudo(doc, [], CFG);
    expect(r.itens).toEqual([]);
    expect(r.paginas).toBe(1);
  });
});
