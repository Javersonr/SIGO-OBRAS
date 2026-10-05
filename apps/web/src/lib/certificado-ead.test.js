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
    expect(r).toEqual({ logoDesenhado: false });
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
    expect(r).toEqual({ logoDesenhado: true });
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
    expect(r).toEqual({ logoDesenhado: false });
    expect(salvos).toHaveLength(1);
    expect(erroNoConsole).toHaveBeenCalled();
  });
});
