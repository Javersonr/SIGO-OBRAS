import { describe, it, expect } from "vitest";
import { jsPDF } from "jspdf";
import {
  gerarPdfDoProjeto,
  modeloDoPdfDoProjeto,
  nomeDoArquivoDoProjeto,
  textoParaPdf,
} from "./ead-projeto-pdf";

// Só dados sintéticos: o repositório é público e o texto do projeto é do responsável técnico (D5).
const aulas = [
  { id: "a1", ordem: 1, modulo: "Módulo 1", titulo: "Aula 1", tipo: "video" },
  { id: "a2", ordem: 2, modulo: "Módulo 2", titulo: "Aula 2", tipo: "pdf" },
];
const questoes = Array.from({ length: 5 }, (_, i) => ({ id: `q${i}` }));
const curso = {
  nome: "Curso de Teste",
  codigo: "CT-1",
  modalidade: "ead",
  carga_horaria_horas: 2,
  validade_meses: 24,
  responsavel_tecnico_nome: "RT Teste",
  responsavel_tecnico_registro: "CREA 0000",
  instrutor_nome: "Instrutor Teste",
  instrutor_qualificacao: "Qualificação Teste",
  conteudo_programatico: "Item 1\nItem 2",
  objetivo_geral: "Objetivo geral de teste",
  principios_sst: "Princípios de teste",
  estrategia_pedagogica: "Estratégia de teste",
  infraestrutura_apoio: "Infraestrutura de teste",
  publico_alvo: "Público de teste",
  instrumentos_aprendizagem: "Instrumentos de teste",
  dedicacao_diaria_min: 30,
  prazo_conclusao_dias: 30,
  modulos_objetivos: [
    { modulo: "Módulo 1", objetivo: "Objetivo do módulo 1" },
    { modulo: "Módulo 2", objetivo: "Objetivo do módulo 2" },
  ],
};
const empresa = { razao_social: "Empresa de Teste Ltda", cnpj: "00.000.000/0001-00" };
const validado = {
  ...curso,
  projeto_validado_em: "2026-10-01",
  projeto_validado_por: "RT Teste",
  proxima_revisao: "2028-10-01",
};
const dados = (c = curso) => ({ curso: c, aulas, questoes, empresa, geradoEm: "2026-10-07" });

// jsPDF no PC do escritório (i3) é lento: folga no tempo-limite dos testes de PDF
const LIMITE_PDF = 20000;

describe("modeloDoPdfDoProjeto", () => {
  it("tem os 15 itens, de (a) a (o), cada um com o rótulo da norma", () => {
    const m = modeloDoPdfDoProjeto(dados());
    expect(m.itens).toHaveLength(15);
    expect(m.itens[0].rotulo).toBe("a) Objetivo geral");
    expect(m.itens[14].rotulo).toBe("o) Avaliação de aprendizagem");
    expect(m.itens.map((i) => i.rotulo[0]).join("")).toBe("abcdefghijklmno");
  });

  it("identifica a empresa, o curso e o dia da geração", () => {
    const m = modeloDoPdfDoProjeto(dados());
    expect(m.titulo).toBe("PROJETO PEDAGÓGICO");
    expect(m.subtitulo).toMatch(/NR-1, Anexo II, item 3\.1/);
    const id = Object.fromEntries(m.identificacao);
    expect(id.Empresa).toBe("Empresa de Teste Ltda");
    expect(id.CNPJ).toBe("00.000.000/0001-00");
    expect(id.Curso).toBe("Curso de Teste (CT-1)");
    expect(id.Modalidade).toMatch(/EAD/);
    expect(id["Validade do treinamento"]).toBe("24 meses");
    expect(id["Gerado em"]).toBe("07/10/2026");
  });

  it("projeto completo não leva aviso de rascunho; incompleto diz o que falta e o item sai 'Não preenchido'", () => {
    expect(modeloDoPdfDoProjeto(dados()).rascunho).toBeNull();
    const m = modeloDoPdfDoProjeto(dados({ ...curso, principios_sst: "", publico_alvo: "" }));
    expect(m.rascunho).toMatch(/2 de 15/);
    expect(m.rascunho).toMatch(/\bb\b/);
    expect(m.rascunho).toMatch(/\bl\b/);
    const b = m.itens.find((i) => i.rotulo.startsWith("b)"));
    expect(b.linhas).toEqual(["Não preenchido."]);
    expect(b.preenchido).toBe(false);
  });

  it("curso sem nome de empresa, sem código e sem modalidade ainda gera o modelo", () => {
    const m = modeloDoPdfDoProjeto({ curso: { nome: "Só o nome" }, aulas: [], questoes: [] });
    expect(m.itens).toHaveLength(15);
    expect(Object.fromEntries(m.identificacao).Curso).toBe("Só o nome");
    expect(modeloDoPdfDoProjeto({}).itens).toHaveLength(15);
  });

  it("validação (3.3): quem validou, quando e a próxima revisão", () => {
    const m = modeloDoPdfDoProjeto(dados(validado));
    expect(m.validacao.validado).toBe(true);
    expect(m.validacao.linhas).toContain("Validado por RT Teste em 01/10/2026.");
    expect(m.validacao.linhas).toContain("Próxima revisão até 01/10/2028.");
  });

  it("sem validação o PDF diz que ela ainda não existe", () => {
    const m = modeloDoPdfDoProjeto(dados());
    expect(m.validacao.validado).toBe(false);
    expect(m.validacao.linhas[0]).toMatch(/ainda não foi validado/i);
  });

  it("curso de NR com gatilho de revisão cita a mudança da norma", () => {
    const nr35 = { ...validado, nome: "NR-35 — Trabalho em Altura" };
    const texto = modeloDoPdfDoProjeto(dados(nr35)).validacao.linhas.join("\n");
    expect(texto).toMatch(/NR-35/);
    expect(texto).toMatch(/16\/07\/2026/);
  });

  it("a assinatura é a do responsável técnico do curso, só com o que está cadastrado", () => {
    expect(modeloDoPdfDoProjeto(dados()).assinatura).toEqual({
      nome: "RT Teste",
      registro: "CREA 0000",
    });
    const sem = { ...curso, responsavel_tecnico_nome: "", responsavel_tecnico_registro: "" };
    expect(modeloDoPdfDoProjeto(dados(sem)).assinatura).toEqual({
      nome: "Responsável técnico",
      registro: "",
    });
  });
});

describe("nomeDoArquivoDoProjeto", () => {
  it("é um nome seguro, sem acento nem espaço", () => {
    expect(nomeDoArquivoDoProjeto({ nome: "NR-10 Básico — Reciclagem (8h)" })).toBe(
      "projeto-pedagogico-nr-10-basico-reciclagem-8h.pdf"
    );
    expect(nomeDoArquivoDoProjeto({})).toBe("projeto-pedagogico-curso.pdf");
    expect(nomeDoArquivoDoProjeto(null)).toBe("projeto-pedagogico-curso.pdf");
  });
});

describe("textoParaPdf", () => {
  it("mantém acentos do português e troca o que a fonte do PDF não tem", () => {
    expect(textoParaPdf("Avaliação — nº 1 ≥ 70%")).toBe("Avaliação — nº 1 >= 70%");
    expect(textoParaPdf("emoji 😀")).toBe("emoji ?");
    expect(textoParaPdf("linha\ncom\tquebra")).toBe("linha com quebra");
    expect(textoParaPdf(null)).toBe("");
  });
});

describe("gerarPdfDoProjeto", () => {
  it(
    "gera um PDF de verdade com o título, os 15 itens e a validação",
    () => {
      const doc = gerarPdfDoProjeto(modeloDoPdfDoProjeto(dados(validado)), { jsPDF });
      const saida = doc.output();
      expect(saida.startsWith("%PDF-")).toBe(true);
      expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
      expect(saida).toContain("PROJETO PEDAGÓGICO");
      // no PDF o parêntese vai com barra (é o escape das strings do formato)
      expect(saida).toContain("a\\) Objetivo geral");
      expect(saida).toContain("o\\) Avaliação de aprendizagem");
      expect(saida).toContain("Objetivo geral de teste");
      expect(saida).toContain("Validado por RT Teste em 01/10/2026.");
      expect(saida).toContain("Responsável técnico");
    },
    LIMITE_PDF
  );

  it(
    "quebra páginas com textos longos e numera todas no rodapé",
    () => {
      const longo = Array.from({ length: 80 }, (_, i) => `Parágrafo ${i + 1} do objetivo.`).join(
        "\n"
      );
      const doc = gerarPdfDoProjeto(
        modeloDoPdfDoProjeto(dados({ ...curso, objetivo_geral: longo })),
        {
          jsPDF,
        }
      );
      const n = doc.getNumberOfPages();
      expect(n).toBeGreaterThan(1);
      const saida = doc.output();
      expect(saida).toContain(`Página 1 de ${n}`);
      expect(saida).toContain(`Página ${n} de ${n}`);
    },
    LIMITE_PDF
  );

  it(
    "não lança com caracteres fora da fonte do PDF",
    () => {
      const doc = gerarPdfDoProjeto(
        modeloDoPdfDoProjeto(dados({ ...curso, objetivo_geral: "Tensão ≤ 1 kV Ω 😀" })),
        { jsPDF }
      );
      expect(doc.output().startsWith("%PDF-")).toBe(true);
    },
    LIMITE_PDF
  );

  it(
    "o logo é opcional: sem imagem o PDF sai igual, e imagem recusada não derruba o PDF",
    () => {
      const modelo = modeloDoPdfDoProjeto(dados());
      expect(gerarPdfDoProjeto(modelo, { jsPDF, logo: null }).output().startsWith("%PDF-")).toBe(
        true
      );
      const logoRuim = { dataUrl: "data:image/png;base64,naoeumapng", w: 10, h: 10 };
      expect(
        gerarPdfDoProjeto(modelo, { jsPDF, logo: logoRuim }).output().startsWith("%PDF-")
      ).toBe(true);
    },
    LIMITE_PDF
  );
});
