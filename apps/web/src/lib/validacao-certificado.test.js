import { describe, it, expect } from "vitest";
import {
  apresentacaoDoResultado,
  avisoDeIntegridade,
  codigoCompleto,
  dataBr,
  mascararCodigo,
  situacaoDoResultado,
  urlSemCodigo,
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

describe("situacaoDoResultado falha fechado (T10, M3, A4)", () => {
  it("só a situação 'valido' vira válido: qualquer outra coisa que o servidor mande é indeterminada", () => {
    for (const situacao of [
      "suspenso",
      "VALIDO",
      " valido",
      "valido ",
      "",
      null,
      0,
      1,
      true,
      false,
      {},
      ["valido"],
    ]) {
      expect(situacaoDoResultado({ ...base, situacao }), JSON.stringify(situacao)).toBe(
        "indeterminada"
      );
    }
  });

  it("resposta sem situação e sem os campos do servidor antigo não vale como válida", () => {
    expect(situacaoDoResultado({ encontrado: true })).toBe("indeterminada");
    expect(situacaoDoResultado({ encontrado: true, certificado: {} })).toBe("indeterminada");
  });

  it("servidor antigo: válido só com `valido: true`; revogado continua revogado", () => {
    expect(situacaoDoResultado({ encontrado: true, valido: true })).toBe("valido");
    expect(situacaoDoResultado({ encontrado: true, valido: false, revogado: true })).toBe(
      "revogado"
    );
    expect(situacaoDoResultado({ encontrado: true, valido: false, revogado: false })).toBe(
      "indeterminada"
    );
  });

  it("'valido' com campos que o contradizem não vale como válido", () => {
    expect(situacaoDoResultado({ ...base, situacao: "valido", revogado: true })).toBe(
      "indeterminada"
    );
    expect(situacaoDoResultado({ ...base, situacao: "valido", integro: false })).toBe(
      "indeterminada"
    );
    expect(situacaoDoResultado({ ...base, situacao: "valido", vencido: true })).toBe(
      "indeterminada"
    );
    // 'vencido' também diz "autêntico": revogado ou dados que não conferem o contradizem
    expect(
      situacaoDoResultado({ ...base, situacao: "vencido", vencido: true, integro: false })
    ).toBe("indeterminada");
    expect(
      situacaoDoResultado({ ...base, situacao: "vencido", vencido: true, revogado: true })
    ).toBe("indeterminada");
  });

  it("'valido' com integridade não verificável (integro nulo, servidor antes do A3) continua válido", () => {
    expect(situacaoDoResultado({ ...base, situacao: "valido", integro: null })).toBe("valido");
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

  it("situação desconhecida: cinza, nunca verde, pedindo a confirmação com a empresa emissora (T10, M3)", () => {
    for (const situacao of ["suspenso", "", null, 7]) {
      const a = apresentacaoDoResultado({ ...base, situacao });
      expect(a.situacao).toBe("indeterminada");
      expect(a.tom).toBe("cinza");
      expect(a.titulo).not.toMatch(/autêntico|válido/i);
      expect(a.titulo).toMatch(/não foi possível confirmar/i);
      expect(a.detalhe).toMatch(/emissora/i);
    }
  });

  it("'valido' contradito por outro campo também vira indeterminada, não verde", () => {
    const a = apresentacaoDoResultado({ ...base, situacao: "valido", revogado: true });
    expect(a.tom).toBe("cinza");
    expect(a.situacao).toBe("indeterminada");
  });

  it("o verde só aparece para situacao === 'valido' (varre tudo o que a apresentação devolve)", () => {
    const verdes = [
      undefined,
      null,
      "",
      "valido",
      "VALIDO",
      "ok",
      "suspenso",
      "vencido",
      "revogado",
      "divergente",
    ]
      .map((situacao) => apresentacaoDoResultado({ ...base, situacao }))
      .filter((a) => a?.tom === "verde");
    expect(verdes).toHaveLength(1);
    expect(verdes[0].situacao).toBe("valido");
  });
});

describe("avisoDeIntegridade", () => {
  it("só avisa quando a integridade é 'não verificável' (certificado de hash antigo)", () => {
    expect(avisoDeIntegridade({ ...base, integro: null, hash_versao: 1 })).toMatch(/antes/i);
    expect(avisoDeIntegridade({ ...base, integro: true })).toBeNull();
    expect(avisoDeIntegridade({ ...base, integro: false })).toBeNull();
  });

  it("não diz que a conferência 'não se aplica': ela foi tentada e não bateu (T10, M4)", () => {
    const aviso = avisoDeIntegridade({ ...base, integro: null, hash_versao: 1 });
    expect(aviso).not.toMatch(/não se aplica/i);
    expect(aviso).toMatch(/não foi possível (conferir|confirmar)/i);
    expect(aviso).toMatch(/SHA-256/);
    expect(aviso).toMatch(/emissora/i);
  });

  it("servidor antigo (sem o campo integro) não mostra aviso", () => {
    expect(avisoDeIntegridade({ encontrado: true, valido: true })).toBeNull();
    expect(avisoDeIntegridade(null)).toBeNull();
  });
});

describe("mascararCodigo (campo do código de autenticidade, XXXX-XXXX-XXXX)", () => {
  it("coloca os hífens sozinho e deixa tudo em maiúsculas", () => {
    expect(mascararCodigo("abcd1234efgh")).toBe("ABCD-1234-EFGH");
    expect(mascararCodigo("ABCD-1234-EFGH")).toBe("ABCD-1234-EFGH");
  });

  it("digitando: o hífen só aparece quando vem o próximo caractere", () => {
    expect(mascararCodigo("a")).toBe("A");
    expect(mascararCodigo("abcd")).toBe("ABCD");
    expect(mascararCodigo("abcde")).toBe("ABCD-E");
    expect(mascararCodigo("abcd1234")).toBe("ABCD-1234");
    expect(mascararCodigo("abcd12345")).toBe("ABCD-1234-5");
  });

  it("apagando: o hífen que sobra no fim some (apagar o último caractere não trava no hífen)", () => {
    expect(mascararCodigo("ABCD-")).toBe("ABCD");
    expect(mascararCodigo("ABCD-1234-")).toBe("ABCD-1234");
  });

  it("ignora espaço, símbolo e acento (o servidor também só aceita A-Z e 0-9)", () => {
    expect(mascararCodigo("  ab cd/12.34 ef_gh ")).toBe("ABCD-1234-EFGH");
    expect(mascararCodigo("áb1")).toBe("B1");
    expect(mascararCodigo("---")).toBe("");
  });

  it("corta o excesso: o código tem 12 caracteres", () => {
    expect(mascararCodigo("ABCD-1234-EFGH-ZZZZ")).toBe("ABCD-1234-EFGH");
  });

  it("vazio ou valor que não é texto vira vazio; aceita número colado", () => {
    expect(mascararCodigo("")).toBe("");
    expect(mascararCodigo(null)).toBe("");
    expect(mascararCodigo(undefined)).toBe("");
    expect(mascararCodigo({})).toBe("");
    expect(mascararCodigo(123456)).toBe("1234-56");
  });

  it("aplicar duas vezes dá o mesmo resultado", () => {
    for (const v of ["a", "abcde", "abcd-1234-efgh", " x-y-z ", "ABCD-"]) {
      expect(mascararCodigo(mascararCodigo(v))).toBe(mascararCodigo(v));
    }
  });
});

describe("codigoCompleto", () => {
  it("só é verdade com os 12 caracteres, com ou sem hífen", () => {
    expect(codigoCompleto("ABCD-1234-EFGH")).toBe(true);
    expect(codigoCompleto("abcd1234efgh")).toBe(true);
    expect(codigoCompleto("ABCD-1234-EFG")).toBe(false);
    expect(codigoCompleto("")).toBe(false);
    expect(codigoCompleto(null)).toBe(false);
  });
});

describe("urlSemCodigo (botão 'Consultar outro código')", () => {
  it("tira o código do QR da URL e mantém o resto", () => {
    expect(urlSemCodigo("https://exemplo.test/ValidarCertificado?codigo=ABCD-1234-EFGH")).toBe(
      "/ValidarCertificado"
    );
    expect(urlSemCodigo("https://exemplo.test/ValidarCertificado?a=1&codigo=X&b=2#topo")).toBe(
      "/ValidarCertificado?a=1&b=2#topo"
    );
  });

  it("sem código na URL, devolve a mesma página", () => {
    expect(urlSemCodigo("https://exemplo.test/ValidarCertificado")).toBe("/ValidarCertificado");
    expect(urlSemCodigo("https://exemplo.test/ValidarCertificado?a=1")).toBe(
      "/ValidarCertificado?a=1"
    );
  });
});
