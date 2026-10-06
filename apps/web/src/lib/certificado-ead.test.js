import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { baixarCertificadoPdf } from "./certificado-ead";
import { ErroCertificado, MSG_QR_FALHOU } from "./certificado-ead-falhas";

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
