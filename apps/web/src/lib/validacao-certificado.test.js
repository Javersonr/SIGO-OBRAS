import { describe, it, expect } from "vitest";
import {
  apresentacaoDoResultado,
  avisoDeIntegridade,
  dataBr,
  situacaoDoResultado,
} from "./validacao-certificado";

// Dados sintéticos: só o que a página usa para decidir o estado.
const base = { encontrado: true, revogado: false, vencido: false, integro: true, hash_versao: 2 };

describe("situacaoDoResultado", () => {
  it("usa a situação que o servidor devolveu", () => {
    for (const situacao of ["valido", "vencido", "revogado", "divergente"]) {
      expect(situacaoDoResultado({ ...base, situacao })).toBe(situacao);
    }
  });

  it("servidor antigo (sem situação): revogado ou válido, como antes", () => {
    expect(situacaoDoResultado({ encontrado: true, valido: true, revogado: false })).toBe("valido");
    expect(situacaoDoResultado({ encontrado: true, valido: false, revogado: true })).toBe(
      "revogado"
    );
  });

  it("sem resultado ou código não encontrado, não há situação", () => {
    expect(situacaoDoResultado(null)).toBeNull();
    expect(situacaoDoResultado({ encontrado: false, valido: false })).toBeNull();
  });
});

describe("dataBr", () => {
  it("AAAA-MM-DD vira DD/MM/AAAA, também com hora; vazio vira travessão", () => {
    expect(dataBr("2026-10-04")).toBe("04/10/2026");
    expect(dataBr("2026-10-04T10:00:00Z")).toBe("04/10/2026");
    expect(dataBr(null)).toBe("—");
    expect(dataBr("")).toBe("—");
  });
});

describe("apresentacaoDoResultado", () => {
  it("válido: verde, 'Autêntico e válido'", () => {
    const a = apresentacaoDoResultado({ ...base, situacao: "valido" });
    expect(a.tom).toBe("verde");
    expect(a.titulo).toBe("Autêntico e válido");
  });

  it("vencido: âmbar, com a data da validade em DD/MM/AAAA", () => {
    const a = apresentacaoDoResultado(
      { ...base, situacao: "vencido", vencido: true },
      { validade: "2026-10-04" }
    );
    expect(a.tom).toBe("ambar");
    expect(a.titulo).toBe("Autêntico, vencido em 04/10/2026");
  });

  it("vencido sem a data na resposta ainda diz que venceu", () => {
    const a = apresentacaoDoResultado({ ...base, situacao: "vencido", vencido: true });
    expect(a.tom).toBe("ambar");
    expect(a.titulo).toBe("Autêntico, vencido");
  });

  it("revogado: vermelho, 'Revogado'", () => {
    const a = apresentacaoDoResultado({ ...base, situacao: "revogado", revogado: true });
    expect(a.tom).toBe("vermelho");
    expect(a.titulo).toBe("Revogado");
  });

  it("dados que não conferem: vermelho, 'Dados não conferem com o registro', com orientação", () => {
    const a = apresentacaoDoResultado({ ...base, situacao: "divergente", integro: false });
    expect(a.tom).toBe("vermelho");
    expect(a.titulo).toBe("Dados não conferem com o registro");
    expect(a.detalhe).toMatch(/emissora/i);
  });

  it("sem resultado, não há apresentação", () => {
    expect(apresentacaoDoResultado(null)).toBeNull();
  });
});

describe("avisoDeIntegridade", () => {
  it("só avisa quando a integridade é 'não verificável' (certificado de hash antigo)", () => {
    expect(avisoDeIntegridade({ ...base, integro: null, hash_versao: 1 })).toMatch(/antes/i);
    expect(avisoDeIntegridade({ ...base, integro: true })).toBeNull();
    expect(avisoDeIntegridade({ ...base, integro: false })).toBeNull();
  });

  it("servidor antigo (sem o campo integro) não mostra aviso", () => {
    expect(avisoDeIntegridade({ encontrado: true, valido: true })).toBeNull();
    expect(avisoDeIntegridade(null)).toBeNull();
  });
});
