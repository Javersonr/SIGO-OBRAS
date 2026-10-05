import { describe, it, expect } from "vitest";
import {
  AVISO_SEM_LOGO,
  ErroCertificado,
  MSG_PDF_FALHOU,
  MSG_QR_FALHOU,
  MSG_SEM_BIBLIOTECA_PDF,
  aguardarResultado,
  mensagemFalhaCertificado,
  pngDoQrSePronto,
} from "./certificado-ead-falhas";

describe("ErroCertificado", () => {
  it("é um Error com mensagem em português e código", () => {
    const erro = new ErroCertificado(MSG_QR_FALHOU, "QR_FALHOU");
    expect(erro).toBeInstanceOf(Error);
    expect(erro.name).toBe("ErroCertificado");
    expect(erro.message).toBe(MSG_QR_FALHOU);
    expect(erro.codigo).toBe("QR_FALHOU");
  });
});

describe("mensagemFalhaCertificado", () => {
  it("usa a mensagem do próprio ErroCertificado (já escrita para o aluno)", () => {
    expect(mensagemFalhaCertificado(new ErroCertificado(MSG_QR_FALHOU, "QR_FALHOU"))).toBe(
      MSG_QR_FALHOU
    );
    expect(
      mensagemFalhaCertificado(new ErroCertificado(MSG_SEM_BIBLIOTECA_PDF, "SEM_BIBLIOTECA"))
    ).toBe(MSG_SEM_BIBLIOTECA_PDF);
  });

  it("erro qualquer (texto técnico em inglês) vira a frase padrão, sem vazar o texto", () => {
    expect(mensagemFalhaCertificado(new Error("Invalid image data at offset 12"))).toBe(
      MSG_PDF_FALHOU
    );
    expect(mensagemFalhaCertificado(new TypeError("Cannot read properties of undefined"))).toBe(
      MSG_PDF_FALHOU
    );
  });

  it("valor que nem é erro (null, string, objeto) também vira a frase padrão", () => {
    expect(mensagemFalhaCertificado(null)).toBe(MSG_PDF_FALHOU);
    expect(mensagemFalhaCertificado(undefined)).toBe(MSG_PDF_FALHOU);
    expect(mensagemFalhaCertificado("falhou")).toBe(MSG_PDF_FALHOU);
    expect(mensagemFalhaCertificado({})).toBe(MSG_PDF_FALHOU);
  });

  it("as mensagens mandam o aluno procurar o RH quando insistir (o RH baixa pela Ficha)", () => {
    expect(MSG_QR_FALHOU).toMatch(/RH/);
    expect(MSG_PDF_FALHOU).toMatch(/RH/);
    expect(AVISO_SEM_LOGO).toMatch(/logotipo/i);
  });

  it("o aviso de PDF sem logo diz a quem recorrer quando atualizar a página não resolve", () => {
    // logo em formato que o PDF não lê (SVG) não se conserta atualizando: o aluno precisa saber a
    // quem avisar, porque só o RH troca o logo da empresa
    expect(AVISO_SEM_LOGO).toMatch(/atualize a página/i);
    expect(AVISO_SEM_LOGO).toMatch(/se continuar.*avise o RH/i);
  });
});

describe("pngDoQrSePronto", () => {
  /** Canvas de mentira: só o que o desenho do QR e a conferência tocam. */
  const canvasDe = ({
    width = 240,
    alfa = 255,
    contexto = true,
    png = "data:image/png;base64,QR",
  }) => {
    const chamadas = { getImageData: [], toDataURL: [] };
    const ctx = {
      getImageData: (...args) => {
        chamadas.getImageData.push(args);
        return { data: [0, 0, 0, alfa] };
      },
    };
    return {
      chamadas,
      width,
      getContext: (tipo) => (contexto && tipo === "2d" ? ctx : null),
      toDataURL: (...args) => {
        chamadas.toDataURL.push(args);
        return png;
      },
    };
  };

  it("canvas já desenhado devolve o PNG (data URL)", () => {
    const canvas = canvasDe({});
    expect(pngDoQrSePronto(canvas)).toBe("data:image/png;base64,QR");
    expect(canvas.chamadas.toDataURL).toEqual([["image/png"]]);
  });

  it("confere só o 1º pixel: o fundo branco do QR é pintado antes dos módulos", () => {
    const canvas = canvasDe({});
    pngDoQrSePronto(canvas);
    expect(canvas.chamadas.getImageData).toEqual([[0, 0, 1, 1]]);
  });

  it("1º pixel transparente (alfa 0) = o QR ainda não foi desenhado: devolve null e não exporta", () => {
    const canvas = canvasDe({ alfa: 0 });
    expect(pngDoQrSePronto(canvas)).toBeNull();
    expect(canvas.chamadas.toDataURL).toEqual([]);
  });

  it("qualquer alfa acima de zero conta como desenhado", () => {
    expect(pngDoQrSePronto(canvasDe({ alfa: 1 }))).toBe("data:image/png;base64,QR");
  });

  it("sem canvas (o React ainda não montou) ou canvas sem tamanho: null", () => {
    expect(pngDoQrSePronto(null)).toBeNull();
    expect(pngDoQrSePronto(undefined)).toBeNull();
    expect(pngDoQrSePronto(canvasDe({ width: 0 }))).toBeNull();
  });

  it("navegador sem contexto 2d: null (a espera acaba e o aluno recebe a mensagem do QR)", () => {
    expect(pngDoQrSePronto(canvasDe({ contexto: false }))).toBeNull();
  });

  it("erro do navegador ao ler o canvas (proteção contra impressão digital) sobe, não vira PNG", () => {
    const bloqueado = {
      width: 240,
      getContext: () => ({
        getImageData: () => {
          throw new Error("canvas bloqueado");
        },
      }),
      toDataURL: () => "data:image/png;base64,QR",
    };
    expect(() => pngDoQrSePronto(bloqueado)).toThrow("canvas bloqueado");
  });

  it("com a espera do QR: tenta de novo até o canvas ser desenhado e então devolve o PNG", async () => {
    let tentativas = 0;
    const canvas = canvasDe({});
    canvas.getContext = () => ({
      getImageData: () => ({ data: [0, 0, 0, ++tentativas < 3 ? 0 : 255] }),
    });
    const png = await aguardarResultado(() => pngDoQrSePronto(canvas), { esperar: async () => {} });
    expect(png).toBe("data:image/png;base64,QR");
    expect(tentativas).toBe(3);
  });
});

describe("aguardarResultado", () => {
  /** Relógio de mentira: soma o que foi "esperado" sem esperar de verdade. */
  const relogio = () => {
    const esperas = [];
    return { esperas, esperar: async (ms) => void esperas.push(ms) };
  };

  it("devolve na hora o que a primeira tentativa achar", async () => {
    const { esperas, esperar } = relogio();
    const r = await aguardarResultado(() => "pronto", { esperar });
    expect(r).toBe("pronto");
    expect(esperas).toEqual([25]);
  });

  it("repete a tentativa a cada passo até achar", async () => {
    const { esperas, esperar } = relogio();
    let chamadas = 0;
    const r = await aguardarResultado(() => (++chamadas === 4 ? "qr" : null), { esperar });
    expect(r).toBe("qr");
    expect(chamadas).toBe(4);
    expect(esperas).toEqual([25, 25, 25, 25]);
  });

  it("sem resultado até o limite, devolve null (quem chamou mostra a mensagem)", async () => {
    const { esperas, esperar } = relogio();
    let chamadas = 0;
    const r = await aguardarResultado(
      () => {
        chamadas++;
        return null;
      },
      { esperar, limiteMs: 100, passoMs: 25 }
    );
    expect(r).toBeNull();
    expect(chamadas).toBe(4);
    expect(esperas.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("o limite padrão dá ao celular lento 3 segundos (antes eram 0,5 s)", async () => {
    const { esperas, esperar } = relogio();
    await aguardarResultado(() => null, { esperar });
    expect(esperas.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(3000);
  });

  it("tentativa que lança não é engolida: o erro sobe", async () => {
    const { esperar } = relogio();
    await expect(
      aguardarResultado(
        () => {
          throw new Error("canvas bloqueado");
        },
        { esperar }
      )
    ).rejects.toThrow("canvas bloqueado");
  });
});
