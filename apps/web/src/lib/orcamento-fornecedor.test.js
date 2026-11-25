import { describe, it, expect } from "vitest";
import {
  anexosDoOrcamento,
  aplicarSugestoes,
  campoLido,
  contarValoresLidos,
  erroArquivoOrcamento,
  limparSugeridos,
  marcaDoItem,
  perguntaAntesDeEnviar,
  reais,
  resumoDaLeitura,
  tamanhoLegivel,
  textoForaDaCotacao,
  valorParaCampo,
} from "./orcamento-fornecedor";

const MB = 1024 * 1024;

describe("erroArquivoOrcamento", () => {
  it("aceita PDF, JPG, JPEG e PNG dentro do limite", () => {
    for (const name of ["Orçamento 12.pdf", "foto.JPG", "foto.jpeg", "print.png"]) {
      expect(erroArquivoOrcamento({ name, size: 300_000 })).toBeNull();
    }
    expect(erroArquivoOrcamento({ name: "a.pdf", size: 10 * MB })).toBeNull();
  });

  it("recusa formato, HEIC, vazio, grande demais e sem arquivo", () => {
    expect(erroArquivoOrcamento({ name: "planilha.xlsx", size: 10 })).toMatch(/PDF, JPG ou PNG/);
    expect(erroArquivoOrcamento({ name: "IMG_1.heic", size: 10 })).toMatch(/HEIC/);
    expect(erroArquivoOrcamento({ name: "a.pdf", size: 0 })).toMatch(/vazio/);
    expect(erroArquivoOrcamento({ name: "a.pdf", size: 10 * MB + 1 })).toMatch(/10 MB/);
    expect(erroArquivoOrcamento(null)).toMatch(/Escolha o arquivo/);
  });
});

describe("formatos", () => {
  it("tamanhoLegivel", () => {
    expect(tamanhoLegivel(340 * 1024)).toBe("340 KB");
    expect(tamanhoLegivel(100)).toBe("1 KB");
    expect(tamanhoLegivel(1.25 * MB)).toBe("1,3 MB");
    expect(tamanhoLegivel(0)).toBe("");
    expect(tamanhoLegivel("x")).toBe("");
  });

  it("valorParaCampo usa ponto e até 4 casas", () => {
    expect(valorParaCampo(48.9)).toBe("48.9");
    expect(valorParaCampo(1.23456789)).toBe("1.2346");
    expect(valorParaCampo(312.5)).toBe("312.5");
    expect(valorParaCampo("abc")).toBe("");
  });

  it("reais", () => {
    expect(reais(48.9)).toBe("R$ 48,90");
    expect(reais(1234.5)).toBe("R$ 1.234,50");
    expect(reais(0.1234)).toBe("R$ 0,1234");
    expect(reais(undefined)).toBe("");
  });
});

const sugestoes = {
  a: { valor_unitario: 48.9, prazo_entrega: 7, observacoes: "Marca/modelo: X", atencao: [] },
  b: {
    valor_unitario: 185,
    prazo_entrega: null,
    observacoes: "",
    atencao: ['No documento a unidade é "CX C/100"; nesta cotação é "UN".'],
    descricao_no_documento: "TERMINAL COMPR CX100",
  },
};

describe("aplicarSugestoes", () => {
  it("preenche os campos vazios e marca o que pôs", () => {
    const r = aplicarSugestoes({}, sugestoes);
    expect(r.respostas).toEqual({
      a: { valor_unitario: "48.9", prazo_entrega: "7", observacoes: "Marca/modelo: X" },
      b: { valor_unitario: "185", prazo_entrega: "", observacoes: "" },
    });
    expect(r.sugerido).toEqual({
      a: { valor_unitario: "48.9", prazo_entrega: "7", observacoes: "Marca/modelo: X" },
      b: { valor_unitario: "185" },
    });
    expect(r.mantidos).toEqual([]);
  });

  it("não apaga o que o fornecedor já digitou; valor diferente mantém a linha inteira", () => {
    const antes = {
      a: { valor_unitario: "50", prazo_entrega: "", observacoes: "" },
      c: { valor_unitario: "9.9", prazo_entrega: "3", observacoes: "meu item" },
    };
    const r = aplicarSugestoes(antes, sugestoes);
    expect(r.respostas.a).toEqual({ valor_unitario: "50", prazo_entrega: "", observacoes: "" });
    expect(r.respostas.c).toEqual(antes.c);
    expect(r.mantidos).toEqual(["a"]);
    expect(r.sugerido.a).toBeUndefined();
    expect(r.sugerido.b).toEqual({ valor_unitario: "185" });
    // o objeto de entrada não é alterado
    expect(antes.a.valor_unitario).toBe("50");
  });

  it("valor digitado igual ao lido só completa prazo e observação vazios", () => {
    const r = aplicarSugestoes(
      { a: { valor_unitario: "48,90", prazo_entrega: "", observacoes: "minha obs" } },
      sugestoes
    );
    expect(r.respostas.a).toEqual({
      valor_unitario: "48,90",
      prazo_entrega: "7",
      observacoes: "minha obs",
    });
    expect(r.sugerido.a).toEqual({ prazo_entrega: "7" });
    expect(r.mantidos).toEqual([]);
  });

  it("prazo 0 (pronta entrega) é preenchido", () => {
    const r = aplicarSugestoes({}, { a: { valor_unitario: 10, prazo_entrega: 0 } });
    expect(r.respostas.a.prazo_entrega).toBe("0");
  });

  it("ignora sugestão sem valor positivo", () => {
    const r = aplicarSugestoes(
      {},
      { a: { valor_unitario: 0 }, b: { valor_unitario: "abc" }, c: { valor_unitario: -1 }, d: null }
    );
    expect(r.respostas).toEqual({});
    expect(r.sugerido).toEqual({});
  });

  it("nova leitura troca o que a anterior pôs e o fornecedor não mexeu", () => {
    const primeira = aplicarSugestoes({}, sugestoes);
    // o fornecedor corrigiu o item b; o item a ficou como a leitura pôs
    const editado = {
      ...primeira.respostas,
      b: { ...primeira.respostas.b, valor_unitario: "1.85" },
    };
    const segunda = aplicarSugestoes(
      editado,
      { b: { valor_unitario: 200 }, c: { valor_unitario: 5 } },
      primeira.sugerido
    );
    // a: a leitura nova não traz o item → o valor da leitura antiga sai
    expect(segunda.respostas.a).toEqual({ valor_unitario: "", prazo_entrega: "", observacoes: "" });
    // b: valor do fornecedor fica
    expect(segunda.respostas.b.valor_unitario).toBe("1.85");
    expect(segunda.mantidos).toEqual(["b"]);
    expect(segunda.respostas.c.valor_unitario).toBe("5");
    expect(segunda.sugerido).toEqual({ c: { valor_unitario: "5" } });
  });
});

describe("limparSugeridos, campoLido e contarValoresLidos", () => {
  it("campo conta como lido só enquanto está igual ao sugerido", () => {
    const { respostas, sugerido } = aplicarSugestoes({}, sugestoes);
    expect(campoLido(respostas, sugerido, "a", "valor_unitario")).toBe(true);
    expect(campoLido(respostas, sugerido, "b", "prazo_entrega")).toBe(false);
    expect(contarValoresLidos(respostas, sugerido)).toBe(2);

    const editado = { ...respostas, a: { ...respostas.a, valor_unitario: "49" } };
    expect(campoLido(editado, sugerido, "a", "valor_unitario")).toBe(false);
    expect(contarValoresLidos(editado, sugerido)).toBe(1);
    expect(campoLido({}, {}, "x", "valor_unitario")).toBe(false);
  });

  it("limparSugeridos tira só o que veio da leitura e está intocado", () => {
    const { respostas, sugerido } = aplicarSugestoes(
      { z: { valor_unitario: "3", prazo_entrega: "", observacoes: "" } },
      sugestoes
    );
    const editado = { ...respostas, a: { ...respostas.a, valor_unitario: "49" } };
    const limpo = limparSugeridos(editado, sugerido);
    expect(limpo.a).toEqual({ valor_unitario: "49", prazo_entrega: "", observacoes: "" });
    expect(limpo.b).toEqual({ valor_unitario: "", prazo_entrega: "", observacoes: "" });
    expect(limpo.z).toEqual({ valor_unitario: "3", prazo_entrega: "", observacoes: "" });
    expect(limparSugeridos(null, null)).toEqual({});
  });
});

describe("marcaDoItem", () => {
  const leitura = { feita: true, sugestoes, nao_encontrados: ["c"], lidos: 2, total: 3 };
  const aplicado = aplicarSugestoes({}, sugestoes);
  const ctx = { ...aplicado, leitura };

  it("lido, atenção e não encontrado", () => {
    expect(marcaDoItem("a", ctx)).toEqual({ tipo: "lido", textos: [], noDocumento: "" });
    expect(marcaDoItem("b", ctx)).toEqual({
      tipo: "atencao",
      textos: ['No documento a unidade é "CX C/100"; nesta cotação é "UN".'],
      noDocumento: "TERMINAL COMPR CX100",
    });
    expect(marcaDoItem("c", ctx)).toEqual({ tipo: "nao_encontrado", textos: [], noDocumento: "" });
    expect(marcaDoItem("fora-da-leitura", ctx)).toBeNull();
  });

  it("some quando o fornecedor mexe no valor ou preenche o item não encontrado", () => {
    const respostas = {
      ...aplicado.respostas,
      a: { ...aplicado.respostas.a, valor_unitario: "49" },
      c: { valor_unitario: "7", prazo_entrega: "", observacoes: "" },
    };
    expect(marcaDoItem("a", { ...ctx, respostas })).toBeNull();
    expect(marcaDoItem("c", { ...ctx, respostas })).toBeNull();
  });

  it("valor que o fornecedor já tinha digitado mostra o do arquivo sem trocar", () => {
    const antes = { a: { valor_unitario: "50", prazo_entrega: "", observacoes: "" } };
    const r = aplicarSugestoes(antes, sugestoes);
    expect(marcaDoItem("a", { ...r, leitura })).toEqual({
      tipo: "mantido",
      textos: ["No arquivo o valor é R$ 48,90. Mantivemos o que você digitou."],
      noDocumento: "",
    });
  });

  it("sem leitura feita não marca nada", () => {
    expect(marcaDoItem("a", { ...aplicado, leitura: null })).toBeNull();
    expect(marcaDoItem("a", { ...aplicado, leitura: { feita: false, mensagem: "x" } })).toBeNull();
    expect(marcaDoItem("a")).toBeNull();
  });
});

describe("textos da leitura", () => {
  it("resumoDaLeitura", () => {
    expect(resumoDaLeitura(null)).toBeNull();
    expect(resumoDaLeitura({ feita: true, lidos: 3, total: 4 })).toEqual({
      tom: "ok",
      titulo: "Lemos 3 de 4 itens do seu orçamento",
      detalhe: "Confira os valores destacados antes de enviar. Nada foi enviado ainda.",
    });
    expect(resumoDaLeitura({ feita: true, lidos: 1, total: 1 }).titulo).toBe(
      "Lemos 1 de 1 item do seu orçamento"
    );
    expect(resumoDaLeitura({ feita: true, lidos: 0, total: 4 }).tom).toBe("aviso");
    expect(resumoDaLeitura({ feita: false, mensagem: "Limite atingido. Preencha à mão." })).toEqual(
      {
        tom: "aviso",
        titulo: "Arquivo anexado, mas os valores não foram lidos",
        detalhe: "Limite atingido. Preencha à mão.",
      }
    );
  });

  it("textoForaDaCotacao", () => {
    expect(textoForaDaCotacao([])).toBe("");
    expect(textoForaDaCotacao(null)).toBe("");
    expect(textoForaDaCotacao([{ descricao: "Fita isolante 20 m" }])).toBe(
      "No seu arquivo há 1 item que não faz parte desta cotação e foi ignorado: Fita isolante 20 m."
    );
    const sete = Array.from({ length: 7 }, (_, i) => ({ descricao: `Item ${i + 1}` }));
    expect(textoForaDaCotacao(sete)).toBe(
      "No seu arquivo há 7 itens que não fazem parte desta cotação e foram ignorados: Item 1; Item 2; Item 3; Item 4; Item 5 e mais 2."
    );
  });

  it("perguntaAntesDeEnviar só pergunta enquanto houver valor intocado da leitura", () => {
    const { respostas, sugerido } = aplicarSugestoes({}, sugestoes);
    expect(perguntaAntesDeEnviar(respostas, sugerido)).toMatch(/^2 valores foram preenchidos/);
    const um = { ...respostas, a: { ...respostas.a, valor_unitario: "49" } };
    expect(perguntaAntesDeEnviar(um, sugerido)).toMatch(/^1 valor foi preenchido/);
    expect(perguntaAntesDeEnviar({}, {})).toBe("");
  });
});

describe("anexosDoOrcamento (comparação de preços)", () => {
  const ref = "anexos-cotacao/emp/cot/part/arquivo.pdf";
  const doPortal = { ref, nome: "orcamento.pdf", tamanho: 1234, origem: "portal-fornecedor" };

  it("devolve só o que veio do portal e é do bucket de cotação", () => {
    const lista = [
      { nome: "legado.pdf", url: "https://exemplo.invalid/legado.pdf" },
      { ...doPortal, origem: "outra" },
      { ...doPortal, ref: "templates/emp/x.pdf" },
      { ...doPortal, ref: "anexos-cotacao/emp/../outra/x.pdf" },
      { ...doPortal, ref: 5 },
      null,
      doPortal,
    ];
    expect(anexosDoOrcamento(lista)).toEqual([
      { ref, nome: "orcamento.pdf", tamanho: 1234, enviado_em: "" },
    ]);
  });

  it("aceita a lista como texto JSON e ignora lixo", () => {
    expect(anexosDoOrcamento(JSON.stringify([doPortal]))).toHaveLength(1);
    for (const lixo of [null, undefined, "não é json", 7, {}, []]) {
      expect(anexosDoOrcamento(lixo)).toEqual([]);
    }
  });
});
