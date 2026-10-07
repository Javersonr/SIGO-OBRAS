import { describe, it, expect, vi, beforeEach } from "vitest";

// O pdf.js real não roda sem navegador: aqui só se confere o carregador (memoriza, aponta o
// worker e deixa tentar de novo se o chunk falhar), que é o mesmo do leitor de edital.
const estado = vi.hoisted(() => ({ falhar: false, acessos: 0, opcoes: {} }));

vi.mock("pdfjs-dist", () => ({
  getDocument: () => ({}),
  // o carregador acessa isto uma vez por carga concluída; o getter simula o chunk quebrado
  get GlobalWorkerOptions() {
    estado.acessos += 1;
    if (estado.falhar) throw new Error("chunk falhou");
    return estado.opcoes;
  },
}));
vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({ default: "/assets/pdf.worker.mjs" }));

describe("carregarPdfjs", () => {
  beforeEach(() => {
    vi.resetModules();
    estado.falhar = false;
    estado.acessos = 0;
    estado.opcoes = {};
  });

  it("carrega uma vez só e aponta o worker", async () => {
    const { carregarPdfjs } = await import("./pdfjs");
    const [a, b] = await Promise.all([carregarPdfjs(), carregarPdfjs()]);
    expect(a).toBe(b);
    expect(await carregarPdfjs()).toBe(a);
    expect(estado.acessos).toBe(1);
    expect(estado.opcoes.workerSrc).toBe("/assets/pdf.worker.mjs");
  });

  it("se a carga falhar, a próxima chamada tenta de novo", async () => {
    estado.falhar = true;
    const { carregarPdfjs } = await import("./pdfjs");
    await expect(carregarPdfjs()).rejects.toThrow("chunk falhou");
    estado.falhar = false;
    const pdfjs = await carregarPdfjs();
    expect(typeof pdfjs.getDocument).toBe("function");
    expect(estado.opcoes.workerSrc).toBe("/assets/pdf.worker.mjs");
  });
});
