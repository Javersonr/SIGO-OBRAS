import { describe, expect, it } from "vitest";
import { ordenarItensOportunidade } from "./orcamento-registros";
import {
  descricaoVersaoProposta,
  montarDadosProposta,
  nomeArquivoProposta,
  validarRepresentante,
  valorPorExtenso,
} from "./proposta-orcamento";

// Orçamento importado (fora de ordem de propósito) + 1 item incluído à mão.
// 1.1.2: ref 50,00 com 12,35% → 43,82 (cortado); 10 × 43,82 = 438,20.
const ITENS = [
  { id: "e2", numero: "2", etapa: true, descricao: "Iluminação", ordem: 5 },
  {
    id: "i111",
    numero: "1.1.1",
    etapa: false,
    codigo: "93358",
    fonte: "SINAPI",
    descricao: "Escavação manual",
    unidade: "m³",
    quantidade: 125.5,
    valor_unitario_ref: 10.48,
    valor_unitario: 9.18,
    valor_total: 1152.09,
    ordem: 2,
  },
  { id: "e1", numero: "1", etapa: true, descricao: "Serviços preliminares", ordem: 0 },
  { id: "e11", numero: "1.1", etapa: true, descricao: "Movimento de terra", ordem: 1 },
  {
    id: "i112",
    numero: "1.1.2",
    etapa: false,
    codigo: "93382",
    fonte: "SINAPI",
    descricao: "Reaterro",
    unidade: "m³",
    quantidade: 10,
    valor_unitario_ref: 50,
    valor_unitario: 43.82,
    valor_total: 438.2,
    ordem: 3,
  },
  {
    id: "i12",
    numero: "1.2",
    etapa: false,
    codigo: null,
    fonte: "Próprio",
    descricao: "Placa de obra",
    unidade: "un",
    quantidade: 2,
    valor_unitario_ref: 114.1,
    valor_unitario: 100,
    valor_total: 200,
    ordem: 4,
  },
  {
    id: "i21",
    numero: "2.1",
    etapa: false,
    codigo: "C-01",
    fonte: "SETOP",
    descricao: "Luminária LED 100 W",
    unidade: "un",
    quantidade: 3,
    valor_unitario_ref: 1141.5,
    valor_unitario: 1000.5,
    valor_total: 3001.5,
    ordem: 6,
  },
  {
    id: "m1",
    numero: null,
    etapa: false,
    codigo: "",
    fonte: null,
    descricao: "Item incluído à mão",
    unidade: "un",
    quantidade: 1,
    valor_unitario_ref: null,
    valor_unitario: 99.99,
    valor_total: 99.99,
    ordem: 7,
  },
];

const EMPRESA = {
  razao_social: "Empresa Teste Ltda",
  nome: "Teste",
  cnpj: "11222333000181",
  endereco: "Rua A",
  numero: "100",
  bairro: "Centro",
  cidade: "Araxá",
  estado: "MG",
  cep: "38180000",
  telefone: "34999998888",
  email: "contato@teste.com.br",
};

const INFO = {
  orgao: "Prefeitura Municipal de Itatinga",
  objeto: "Iluminação pública da Praça Central",
  edital: "Pregão Eletrônico 12/2026",
  data_base: "03/2026",
  bdi: "25,00",
  fonte: "SINAPI",
  total_prefeitura: 5000,
  observacoes: null,
};

const OPORTUNIDADE = { id: "op1", nome: "PM Itatinga - LED", orgao: "PM Itatinga" };

function dados(extra = {}) {
  return montarDadosProposta({
    itens: ITENS,
    info: INFO,
    oportunidade: OPORTUNIDADE,
    empresa: EMPRESA,
    representante: { nome: " Fulano de Tal ", cargo: "Sócio-administrador", cpf: "52998224725" },
    opcoes: { validadeDias: 60, local: "Araxá/MG", dataISO: "2026-10-05" },
    ...extra,
  });
}

describe("valorPorExtenso", () => {
  it("casos da spec", () => {
    expect(valorPorExtenso(0.01)).toBe("um centavo");
    expect(valorPorExtenso(1)).toBe("um real");
    expect(valorPorExtenso(1000000.1)).toBe("um milhão de reais e dez centavos");
    expect(valorPorExtenso(2345678.9)).toBe(
      "dois milhões trezentos e quarenta e cinco mil seiscentos e setenta e oito reais e noventa centavos"
    );
  });

  it("outros valores", () => {
    expect(valorPorExtenso(1152.09)).toBe("mil cento e cinquenta e dois reais e nove centavos");
    expect(valorPorExtenso(1100)).toBe("mil e cem reais");
    expect(valorPorExtenso(2500)).toBe("dois mil e quinhentos reais");
    expect(valorPorExtenso(1000000)).toBe("um milhão de reais");
    expect(valorPorExtenso(100)).toBe("cem reais");
    expect(valorPorExtenso(101)).toBe("cento e um reais");
    expect(valorPorExtenso(21.21)).toBe("vinte e um reais e vinte e um centavos");
    expect(valorPorExtenso(0.5)).toBe("cinquenta centavos");
    expect(valorPorExtenso(0)).toBe("zero reais");
  });
});

describe("nomeArquivoProposta", () => {
  it("monta o nome com a data", () => {
    expect(nomeArquivoProposta("PM Itatinga - LED", "2026-09-29", "pdf")).toBe(
      "Proposta - PM Itatinga - LED - 2026-09-29.pdf"
    );
    expect(nomeArquivoProposta("PM Itatinga - LED", "2026-09-29T10:00:00Z", "xlsx")).toBe(
      "Proposta - PM Itatinga - LED - 2026-09-29.xlsx"
    );
  });

  it('troca \\ / : * ? " < > | e controles por "-"', () => {
    expect(nomeArquivoProposta("PM Itatinga: LED/Praça *01*", "2026-09-29", "pdf")).toBe(
      "Proposta - PM Itatinga- LED-Praça -01- - 2026-09-29.pdf"
    );
    expect(nomeArquivoProposta('A\\B"C<D>E|F?G', "2026-09-29", "pdf")).toBe(
      "Proposta - A-B-C-D-E-F-G - 2026-09-29.pdf"
    );
    expect(nomeArquivoProposta("Linha1\nLinha2\t", "2026-09-29", "pdf")).toBe(
      "Proposta - Linha1-Linha2- - 2026-09-29.pdf"
    );
  });

  it("nome vazio vira Oportunidade", () => {
    expect(nomeArquivoProposta("  ", "2026-09-29", "xlsx")).toBe(
      "Proposta - Oportunidade - 2026-09-29.xlsx"
    );
    expect(nomeArquivoProposta(null, "2026-09-29", "pdf")).toBe(
      "Proposta - Oportunidade - 2026-09-29.pdf"
    );
  });
});

describe("validarRepresentante", () => {
  it("nome preenchido e CPF vazio ou válido passam", () => {
    expect(validarRepresentante({ nome: "Fulano", cargo: "", cpf: "" })).toEqual({
      ok: true,
      erros: [],
    });
    expect(validarRepresentante({ nome: "Fulano", cargo: "Sócio", cpf: "529.982.247-25" })).toEqual(
      { ok: true, erros: [] }
    );
  });

  it("nome vazio e CPF inválido dão erro", () => {
    expect(validarRepresentante({ nome: "  ", cargo: "Sócio", cpf: "" })).toEqual({
      ok: false,
      erros: ["Informe o nome do representante legal"],
    });
    expect(validarRepresentante({ nome: "Fulano", cpf: "111.111.111-11" })).toEqual({
      ok: false,
      erros: ["CPF do representante legal inválido"],
    });
    expect(validarRepresentante({ nome: "", cpf: "123" }).erros).toHaveLength(2);
    expect(validarRepresentante(undefined).ok).toBe(false);
  });
});

describe("montarDadosProposta", () => {
  it("linhas: todos os itens, na ordem de `ordem`, com número e nível", () => {
    const d = dados();
    expect(d.linhas.map((l) => l.numero)).toEqual([
      "1",
      "1.1",
      "1.1.1",
      "1.1.2",
      "1.2",
      "2",
      "2.1",
      "8",
    ]);
    expect(d.linhas.map((l) => l.tipo)).toEqual([
      "etapa",
      "etapa",
      "item",
      "item",
      "item",
      "etapa",
      "item",
      "item",
    ]);
    expect(d.linhas.map((l) => l.nivel)).toEqual([1, 2, 3, 3, 2, 1, 2, 1]);
  });

  it("ordem e rótulo são os de ordenarItensOportunidade (a mesma da tela)", () => {
    // lista embaralhada (a ordem inversa) e outra sem `ordem`, só com o desempate pelo número
    const invertidos = [...ITENS].reverse();
    const semOrdem = ITENS.map((i) => ({ ...i, ordem: null }));
    for (const lista of [invertidos, semOrdem]) {
      const { linhas } = dados({ itens: lista });
      expect(linhas.map((l) => l.numero)).toEqual(
        ordenarItensOportunidade(lista).map((i) => i.item)
      );
    }
  });

  it("etapa leva o subtotal; item leva quantidade, unitário e total", () => {
    const d = dados();
    expect(d.linhas[1]).toEqual({
      tipo: "etapa",
      numero: "1.1",
      codigo: null,
      fonte: null,
      descricao: "Movimento de terra",
      nivel: 2,
      unidade: null,
      quantidade: null,
      valorUnitario: null,
      total: 1590.29,
    });
    expect(d.linhas[0].total).toBe(1790.29);
    expect(d.linhas[5].total).toBe(3001.5);
    expect(d.linhas[2]).toEqual({
      tipo: "item",
      numero: "1.1.1",
      codigo: "93358",
      fonte: "SINAPI",
      descricao: "Escavação manual",
      nivel: 3,
      unidade: "m³",
      quantidade: 125.5,
      valorUnitario: 9.18,
      total: 1152.09,
    });
    // item sem referência (incluído à mão) também sai, com o rótulo da posição
    expect(d.linhas[7]).toMatchObject({ numero: "8", codigo: null, total: 99.99 });
  });

  it("total geral em centavos, por extenso, validade, local/data e representante", () => {
    const d = dados();
    expect(d.totalGeral).toBe(4891.78);
    expect(d.totalExtenso).toBe(
      "quatro mil oitocentos e noventa e um reais e setenta e oito centavos"
    );
    expect(d.validade).toBe("Validade da proposta: 60 dias");
    expect(d.localData).toBe("Araxá/MG, 05 de outubro de 2026");
    expect(d.representante).toEqual({
      nome: "Fulano de Tal",
      cargo: "Sócio-administrador",
      cpf: "529.982.247-25",
    });
  });

  it("cabeçalho: empresa formatada e dados da planilha", () => {
    const d = dados();
    expect(d.empresa).toEqual({
      nome: "Empresa Teste Ltda",
      cnpj: "11.222.333/0001-81",
      endereco: "Rua A, 100 - Centro - Araxá/MG - CEP 38180-000",
      contato: "Telefone: (34) 99999-8888 | E-mail: contato@teste.com.br",
    });
    expect(d.titulo).toBe("Proposta de preços");
    expect(d.orgao).toBe("Prefeitura Municipal de Itatinga");
    expect(d.objeto).toBe("Iluminação pública da Praça Central");
    expect(d.edital).toBe("Pregão Eletrônico 12/2026");
    expect(d.dataBase).toBe("03/2026");
    expect(d.bdi).toBe("25,00%");
  });

  it("sem orcamento_info: campos da licitação e, por último, o nome como objeto", () => {
    const d = dados({
      info: {},
      oportunidade: {
        nome: "PM Teste - LED",
        orgao: "Prefeitura de Teste",
        licitacao_numero: "12/2026",
        licitacao_processo: "345/2026",
      },
    });
    expect(d.orgao).toBe("Prefeitura de Teste");
    expect(d.objeto).toBe("PM Teste - LED");
    expect(d.edital).toBe("Edital 12/2026 - Processo 345/2026");
    expect(d.dataBase).toBeNull();
    expect(d.bdi).toBeNull();

    const s = dados({ info: null, oportunidade: { nome: "Só o nome" } });
    expect([s.orgao, s.objeto, s.edital]).toEqual([null, "Só o nome", null]);

    // o objeto da planilha (quando existe) vale mais que o nome; em branco, cai no nome
    const o = dados({ info: { objeto: "Objeto da planilha" }, oportunidade: { nome: "Nome" } });
    expect(o.objeto).toBe("Objeto da planilha");
    const b = dados({ info: { objeto: "  " }, oportunidade: { nome: "Nome", titulo: "Título" } });
    expect(b.objeto).toBe("Nome");
  });

  it("desempate pelo número natural e soma sem erro de ponto flutuante", () => {
    const d = montarDadosProposta({
      itens: [
        {
          id: "a",
          numero: "1.10",
          etapa: false,
          quantidade: 1,
          valor_unitario: 0.1,
          valor_total: 0.1,
        },
        {
          id: "b",
          numero: "1.2",
          etapa: false,
          quantidade: 1,
          valor_unitario: 0.1,
          valor_total: 0.1,
        },
        {
          id: "c",
          numero: "1.1",
          etapa: false,
          quantidade: 1,
          valor_unitario: 0.1,
          valor_total: 0.1,
        },
      ],
      info: {},
      oportunidade: { nome: "X" },
      empresa: {},
      representante: { nome: "Fulano" },
      opcoes: { validadeDias: 1, local: "", dataISO: "2026-01-02" },
    });
    expect(d.linhas.map((l) => l.numero)).toEqual(["1.1", "1.2", "1.10"]);
    expect(d.totalGeral).toBe(0.3);
    expect(d.validade).toBe("Validade da proposta: 1 dia");
    expect(d.localData).toBe("02 de janeiro de 2026");
    expect(d.empresa).toEqual({ nome: "", cnpj: "", endereco: "", contato: "" });
  });

  it("não altera a lista recebida", () => {
    const antes = ITENS.map((i) => i.id);
    dados();
    expect(ITENS.map((i) => i.id)).toEqual(antes);
  });
});

describe("descricaoVersaoProposta", () => {
  it("usa vírgula decimal e o plural certo", () => {
    expect(descricaoVersaoProposta({ descontoPct: 12.35, descontoReal: 12.4, qtdItens: 57 })).toBe(
      "Orçamento com desconto de 12,35% (real 12,40%) — 57 itens"
    );
    expect(descricaoVersaoProposta({ descontoPct: 0, descontoReal: 0, qtdItens: 1 })).toBe(
      "Orçamento com desconto de 0,00% (real 0,00%) — 1 item"
    );
  });
});
