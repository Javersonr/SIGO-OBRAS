import { describe, expect, it } from "vitest";
import { formatarCpf, validarCpf } from "./cpf";

describe("validarCpf", () => {
  it("aceita CPF válido com e sem máscara", () => {
    expect(validarCpf("529.982.247-25")).toBe(true);
    expect(validarCpf("52998224725")).toBe(true);
    expect(validarCpf("123.456.789-09")).toBe(true);
    expect(validarCpf(" 529.982.247-25 ")).toBe(true);
  });

  it("recusa dígito verificador errado", () => {
    expect(validarCpf("529.982.247-24")).toBe(false);
    expect(validarCpf("529.982.247-15")).toBe(false);
    expect(validarCpf("123.456.789-00")).toBe(false);
  });

  it("recusa todos os dígitos iguais", () => {
    expect(validarCpf("111.111.111-11")).toBe(false);
    expect(validarCpf("00000000000")).toBe(false);
  });

  it("recusa tamanho errado, vazio, null e letras", () => {
    expect(validarCpf("5299822472")).toBe(false);
    expect(validarCpf("529982247255")).toBe(false);
    expect(validarCpf("")).toBe(false);
    expect(validarCpf(null)).toBe(false);
    expect(validarCpf(undefined)).toBe(false);
    expect(validarCpf("529.982.247-25a")).toBe(false);
  });
});

describe("formatarCpf", () => {
  it("formata 11 dígitos", () => {
    expect(formatarCpf("52998224725")).toBe("529.982.247-25");
    expect(formatarCpf("529.982.247-25")).toBe("529.982.247-25");
  });

  it("é progressivo enquanto digita", () => {
    expect(formatarCpf("529")).toBe("529");
    expect(formatarCpf("5299")).toBe("529.9");
    expect(formatarCpf("529982")).toBe("529.982");
    expect(formatarCpf("5299822")).toBe("529.982.2");
    expect(formatarCpf("529982247")).toBe("529.982.247");
    expect(formatarCpf("5299822472")).toBe("529.982.247-2");
    // apagar o último dígito de um CPF mascarado volta à máscara parcial
    expect(formatarCpf("529.982.247-")).toBe("529.982.247");
    expect(formatarCpf("529.982.247-2")).toBe("529.982.247-2");
  });

  it("corta em 11 dígitos e trata vazio", () => {
    expect(formatarCpf("5299822472599")).toBe("529.982.247-25");
    expect(formatarCpf("abc")).toBe("");
    expect(formatarCpf("")).toBe("");
    expect(formatarCpf(null)).toBe("");
    expect(formatarCpf(undefined)).toBe("");
  });
});
