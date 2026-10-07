import { describe, it, expect, vi, beforeEach } from "vitest";

// O teste NUNCA carrega o cliente de produção nem desenha PDF (jsPDF e React precisam de DOM): tudo o que o
// gerador usa fora dele entra de mentira. O que se confere é o cache do logo e das imagens de assinatura, que
// não pode guardar FALHA (A6, T34): uma queda de rede na primeira imagem tirava a imagem de todo o lote.
const h = vi.hoisted(() => ({
  resolveStorageUrl: vi.fn(),
  logoParaPdf: vi.fn(),
  logoParaPdfDeUrl: vi.fn(),
  baixarCertificadoPdf: vi.fn(),
}));
vi.mock("@/api/sigoClient", () => ({ resolveStorageUrl: h.resolveStorageUrl }));
vi.mock("@/lib/pdf-empresa", () => ({
  logoParaPdf: h.logoParaPdf,
  logoParaPdfDeUrl: h.logoParaPdfDeUrl,
}));
vi.mock("@/lib/certificado-ead", () => ({ baixarCertificadoPdf: h.baixarCertificadoPdf }));

import { criarGeradorDeCertificado } from "./certificadoParaRH";

const IMG = { dataUrl: "data:image/png;base64,AAAA", w: 300, h: 100 };
const LOGO = { dataUrl: "data:image/png;base64,BBBB", w: 200, h: 80 };
const certificado = (codigo) => ({
  codigo,
  dados: {
    instrutor: { nome: "Instrutor Teste", assinatura_ref: "assinaturas/emp/instrutor.png" },
    responsavel_tecnico: { nome: "RT Teste" },
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  h.resolveStorageUrl.mockImplementation(async (ref) => `https://arquivos.invalid/${ref}`);
  h.baixarCertificadoPdf.mockImplementation(async (_cert, opcoes) => ({
    assinaturasDesenhadas: Object.keys(opcoes.assinaturas).filter((k) => opcoes.assinaturas[k]),
  }));
});

describe("criarGeradorDeCertificado: o cache do lote só guarda sucesso", () => {
  it("o logo que carregou é pedido uma vez só para o lote inteiro", async () => {
    h.logoParaPdf.mockResolvedValue(LOGO);
    h.logoParaPdfDeUrl.mockResolvedValue(IMG);
    const gerar = criarGeradorDeCertificado({ logo_url: "empresa/logo.png" });
    for (const codigo of ["A", "B", "C"]) await gerar(certificado(codigo), () => {});
    expect(h.logoParaPdf).toHaveBeenCalledTimes(1);
    for (const [, opcoes] of h.baixarCertificadoPdf.mock.calls) expect(opcoes.logo).toBe(LOGO);
  });

  it("logo que falhou (null) na primeira vez é pedido de novo no certificado seguinte", async () => {
    h.logoParaPdf.mockResolvedValueOnce(null).mockResolvedValue(LOGO);
    h.logoParaPdfDeUrl.mockResolvedValue(IMG);
    const gerar = criarGeradorDeCertificado({ logo_url: "empresa/logo.png" });
    await gerar(certificado("A"), () => {});
    await gerar(certificado("B"), () => {});
    expect(h.baixarCertificadoPdf.mock.calls[0][1].logo).toBeNull();
    expect(h.baixarCertificadoPdf.mock.calls[1][1].logo).toBe(LOGO);
  });

  it("empresa sem logo cadastrado nunca tenta carregar (não é falha)", async () => {
    h.logoParaPdfDeUrl.mockResolvedValue(IMG);
    const gerar = criarGeradorDeCertificado({ nome: "Empresa Teste" });
    await gerar(certificado("A"), () => {});
    await gerar(certificado("B"), () => {});
    expect(h.logoParaPdf).not.toHaveBeenCalled();
    expect(h.baixarCertificadoPdf.mock.calls[0][1].logo).toBeNull();
  });

  it("imagem de assinatura que falhou na primeira vez entra nos certificados seguintes", async () => {
    h.logoParaPdf.mockResolvedValue(LOGO);
    h.logoParaPdfDeUrl.mockResolvedValueOnce(null).mockResolvedValue(IMG);
    const gerar = criarGeradorDeCertificado({ logo_url: "empresa/logo.png" });
    const primeiro = await gerar(certificado("A"), () => {});
    const segundo = await gerar(certificado("B"), () => {});
    // o primeiro sai sem a imagem (e o aviso diz quem faltou); o segundo já a recebe
    expect(primeiro.faltaram).toEqual(["instrutor"]);
    expect(segundo.faltaram).toEqual([]);
    expect(h.baixarCertificadoPdf.mock.calls[1][1].assinaturas.instrutor).toBe(IMG);
  });

  it("URL assinada que falhou (null ou erro) também é pedida de novo", async () => {
    h.logoParaPdf.mockResolvedValue(LOGO);
    h.logoParaPdfDeUrl.mockResolvedValue(IMG);
    h.resolveStorageUrl.mockRejectedValueOnce(new Error("rede")).mockResolvedValueOnce(null);
    const gerar = criarGeradorDeCertificado({ logo_url: "empresa/logo.png" });
    const r1 = await gerar(certificado("A"), () => {});
    const r2 = await gerar(certificado("B"), () => {});
    const r3 = await gerar(certificado("C"), () => {});
    expect(r1.faltaram).toEqual(["instrutor"]);
    expect(r2.faltaram).toEqual(["instrutor"]);
    expect(r3.faltaram).toEqual([]);
  });

  it("a imagem que carregou é lida uma vez só para o lote", async () => {
    h.logoParaPdf.mockResolvedValue(LOGO);
    h.logoParaPdfDeUrl.mockResolvedValue(IMG);
    const gerar = criarGeradorDeCertificado({ logo_url: "empresa/logo.png" });
    for (const codigo of ["A", "B", "C", "D"]) await gerar(certificado(codigo), () => {});
    expect(h.resolveStorageUrl).toHaveBeenCalledTimes(1);
    expect(h.logoParaPdfDeUrl).toHaveBeenCalledTimes(1);
  });

  it("arquivo que nunca carrega: desiste depois de algumas tentativas, sem refazer a rede a cada certificado", async () => {
    h.logoParaPdf.mockResolvedValue(LOGO);
    h.logoParaPdfDeUrl.mockResolvedValue(null);
    const gerar = criarGeradorDeCertificado({ logo_url: "empresa/logo.png" });
    for (let i = 0; i < 10; i += 1) await gerar(certificado(`C${i}`), () => {});
    expect(h.logoParaPdfDeUrl.mock.calls.length).toBeLessThanOrEqual(3);
    expect(h.logoParaPdfDeUrl.mock.calls.length).toBeGreaterThan(1);
  });
});
