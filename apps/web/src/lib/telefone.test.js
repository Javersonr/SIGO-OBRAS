import { describe, it, expect } from "vitest";
import {
  digitosTelefone,
  formatarTelefone,
  mascaraTelefone,
  normalizarTelefoneBR,
  telefoneValido,
} from "./telefone";

// Só números fictícios (o repositório é público): DDD 11 e final 0000.

describe("normalizarTelefoneBR (cópia da regra do servidor, _shared/whatsapp-envio.ts)", () => {
  it("DDD + 9 dígitos (celular) ou DDD + 8 dígitos (fixo) ganham o 55 na frente", () => {
    expect(normalizarTelefoneBR("11999990000")).toBe("5511999990000");
    expect(normalizarTelefoneBR("1133330000")).toBe("551133330000");
  });

  it("aceita máscara, espaços, +55 e hífen: só os dígitos contam", () => {
    expect(normalizarTelefoneBR("(11) 99999-0000")).toBe("5511999990000");
    expect(normalizarTelefoneBR(" (11) 3333-0000 ")).toBe("551133330000");
    expect(normalizarTelefoneBR("+55 11 99999-0000")).toBe("5511999990000");
    expect(normalizarTelefoneBR("55 11 99999 0000")).toBe("5511999990000");
  });

  it("número que já vem com 55 e 12 ou 13 dígitos fica como está", () => {
    expect(normalizarTelefoneBR("5511999990000")).toBe("5511999990000");
    expect(normalizarTelefoneBR("551133330000")).toBe("551133330000");
  });

  it("DDD 55 (RS) não é confundido com o código do país", () => {
    expect(normalizarTelefoneBR("(55) 99999-0000")).toBe("5555999990000");
    expect(normalizarTelefoneBR("55999990000")).toBe("5555999990000");
  });

  it("vazio, curto, longo demais ou sem número: não envia (null)", () => {
    for (const ruim of ["", "   ", null, undefined, "abc", "999990000", "119999900001", "1"]) {
      expect(normalizarTelefoneBR(ruim)).toBeNull();
    }
    // 14 dígitos: nem 55+11 nem nacional
    expect(normalizarTelefoneBR("55119999900001")).toBeNull();
  });

  it("texto no meio não atrapalha: só os dígitos contam", () => {
    expect(normalizarTelefoneBR("tel: 11 99999-0000")).toBe("5511999990000");
    expect(normalizarTelefoneBR("ramal 123")).toBeNull();
  });

  it("o número que a máscara do formulário grava é aceito do mesmo jeito", () => {
    for (const bruto of ["11999990000", "1133330000", "5511999990000", "(11) 99999-0000"]) {
      const gravado = formatarTelefone(bruto);
      expect(normalizarTelefoneBR(gravado)).toBe(normalizarTelefoneBR(bruto));
    }
  });

  it("tudo o que o formulário dá como válido, o servidor também aceita (a regra do front é a mais estrita)", () => {
    for (let ddd = 11; ddd <= 99; ddd += 11) {
      for (const resto of ["99999-0000", "9999-0000", "3333-0000", "99999-0001"]) {
        const texto = `(${ddd}) ${resto}`;
        if (telefoneValido(texto)) {
          expect(normalizarTelefoneBR(texto), texto).toMatch(/^55\d{10,11}$/);
          expect(normalizarTelefoneBR(texto)).toBe(`55${digitosTelefone(texto)}`);
        }
      }
    }
  });
});

describe("máscara e validação já existentes seguem iguais", () => {
  it("digitosTelefone tira +55 e o 0 de discagem; a máscara é a nacional", () => {
    expect(digitosTelefone("+55 (11) 99999-0000")).toBe("11999990000");
    expect(mascaraTelefone("11999990000")).toBe("(11) 99999-0000");
    expect(mascaraTelefone("1133330000")).toBe("(11) 3333-0000");
  });

  it("telefoneValido: vazio vale (campo opcional); celular começa com 9", () => {
    expect(telefoneValido("")).toBe(true);
    expect(telefoneValido("(11) 99999-0000")).toBe(true);
    expect(telefoneValido("(11) 3333-0000")).toBe(true);
    expect(telefoneValido("(11) 89999-0000")).toBe(false);
    expect(telefoneValido("(11) 9999-000")).toBe(false);
  });
});
