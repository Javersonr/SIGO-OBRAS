import { describe, it, expect } from "vitest";
import {
  VERSAO_DA_MARCA,
  camposCanonicosDoProjeto,
  estadoDoPdfDoProjeto,
  marcaDoProjeto,
} from "./ead-projeto-marca";
import { CAMPOS_DO_PROJETO } from "./ead-projeto";

// Só dados sintéticos: o repositório é público e o texto do projeto é do responsável técnico (D5).
const PDF = "treinamentos/empresa/2026/10/projeto.pdf";
const projeto = {
  objetivo_geral: "Objetivo de teste",
  principios_sst: "Princípios de teste",
  estrategia_pedagogica: "Estratégia de teste",
  infraestrutura_apoio: "Infraestrutura de teste",
  publico_alvo: "Público de teste",
  instrumentos_aprendizagem: "Instrumentos de teste",
  dedicacao_diaria_min: 30,
  prazo_conclusao_dias: 45,
  modulos_objetivos: [
    { modulo: "Módulo 2", objetivo: "Objetivo do módulo 2" },
    { modulo: "Módulo 1", objetivo: "Objetivo do módulo 1" },
  ],
  projeto_validado_em: "2026-10-01",
  projeto_validado_por: "RT Teste",
  proxima_revisao: "2028-10-01",
};

// Estes valores também estão em supabase/functions/portal-funcionario/projeto.test.ts: as duas cópias da regra
// (front e servidor) precisam dar a MESMA marca, senão o requisito do projeto diverge entre a tela e o portal.
const MARCA_DO_PROJETO_DE_TESTE = "v1:15ea345e713e2a";
const MARCA_DO_CURSO_SEM_PROJETO = "v1:0c548973284055";

describe("marcaDoProjeto", () => {
  it("tem a forma v1: e 14 dígitos hexadecimais, e os valores de referência não mudam", () => {
    expect(VERSAO_DA_MARCA).toBe("v1");
    expect(marcaDoProjeto(projeto)).toMatch(/^v1:[0-9a-f]{14}$/);
    expect(marcaDoProjeto(projeto)).toBe(MARCA_DO_PROJETO_DE_TESTE);
    expect(marcaDoProjeto({})).toBe(MARCA_DO_CURSO_SEM_PROJETO);
  });

  it("curso vazio, nulo ou sem os campos dá a mesma marca e não lança", () => {
    expect(marcaDoProjeto(null)).toBe(MARCA_DO_CURSO_SEM_PROJETO);
    expect(marcaDoProjeto(undefined)).toBe(MARCA_DO_CURSO_SEM_PROJETO);
    expect(
      marcaDoProjeto({
        objetivo_geral: null,
        publico_alvo: "   ",
        dedicacao_diaria_min: "",
        modulos_objetivos: null,
        projeto_validado_em: null,
      })
    ).toBe(MARCA_DO_CURSO_SEM_PROJETO);
  });

  it("mesmo conteúdo, mesma marca: espaços nas pontas, número como texto e a ordem dos módulos não contam", () => {
    const igual = marcaDoProjeto({
      ...projeto,
      objetivo_geral: "  Objetivo de teste \n",
      dedicacao_diaria_min: "30",
      prazo_conclusao_dias: " 45 ",
      modulos_objetivos: [...projeto.modulos_objetivos].reverse(),
      projeto_validado_por: " RT Teste ",
      // a coluna date pode chegar com hora
      projeto_validado_em: "2026-10-01T00:00:00",
    });
    expect(igual).toBe(MARCA_DO_PROJETO_DE_TESTE);
    // dado do legado: o jsonb pode vir como texto
    expect(
      marcaDoProjeto({ ...projeto, modulos_objetivos: JSON.stringify(projeto.modulos_objetivos) })
    ).toBe(MARCA_DO_PROJETO_DE_TESTE);
  });

  it("objetivo de módulo vazio ou lixo na lista não conta (como o que se grava)", () => {
    const comLixo = marcaDoProjeto({
      ...projeto,
      modulos_objetivos: [
        ...projeto.modulos_objetivos,
        { modulo: "Módulo 3", objetivo: "   " },
        { modulo: "Módulo 4" },
        null,
        "texto",
        { modulo: "Módulo 5", objetivo: 7 },
      ],
    });
    expect(comLixo).toBe(MARCA_DO_PROJETO_DE_TESTE);
    expect(marcaDoProjeto({ ...projeto, modulos_objetivos: "não é json" })).toBe(
      marcaDoProjeto({ ...projeto, modulos_objetivos: [] })
    );
  });

  it("mudar qualquer um dos 12 campos do projeto muda a marca", () => {
    const novoValor = {
      objetivo_geral: "Outro objetivo",
      principios_sst: "Outros princípios",
      estrategia_pedagogica: "Outra estratégia",
      infraestrutura_apoio: "Outra infraestrutura",
      publico_alvo: "Outro público",
      instrumentos_aprendizagem: "Outros instrumentos",
      dedicacao_diaria_min: 31,
      prazo_conclusao_dias: 46,
      modulos_objetivos: [{ modulo: "Módulo 1", objetivo: "Objetivo do módulo 1" }],
      projeto_validado_em: "2026-10-02",
      projeto_validado_por: "Outro RT",
      proxima_revisao: "2028-10-02",
    };
    // a lista dos 12 é a da lib do projeto: se um campo entrar lá e não aqui, este teste acusa
    expect(Object.keys(novoValor).sort()).toEqual([...CAMPOS_DO_PROJETO].sort());
    for (const campo of CAMPOS_DO_PROJETO) {
      expect(marcaDoProjeto({ ...projeto, [campo]: novoValor[campo] }), campo).not.toBe(
        MARCA_DO_PROJETO_DE_TESTE
      );
      // e tirar o campo também
      expect(marcaDoProjeto({ ...projeto, [campo]: null }), `sem ${campo}`).not.toBe(
        MARCA_DO_PROJETO_DE_TESTE
      );
    }
  });

  it("trocar o texto de módulo ou o nome do módulo muda a marca", () => {
    const troca = (i, mudanca) =>
      marcaDoProjeto({
        ...projeto,
        modulos_objetivos: projeto.modulos_objetivos.map((m, j) =>
          j === i ? { ...m, ...mudanca } : m
        ),
      });
    expect(troca(0, { objetivo: "Outro objetivo" })).not.toBe(MARCA_DO_PROJETO_DE_TESTE);
    expect(troca(1, { modulo: "Módulo 9" })).not.toBe(MARCA_DO_PROJETO_DE_TESTE);
  });

  it("o que o PDF busca em outras partes do curso (nome, carga, aulas, o próprio PDF) não entra na marca", () => {
    expect(
      marcaDoProjeto({
        ...projeto,
        nome: "Curso de teste",
        carga_horaria_horas: 8,
        instrutor_nome: "Instrutor teste",
        projeto_pedagogico_ref: PDF,
        projeto_pdf_marca: "v1:qualquer",
        updated_at: "2026-10-07T10:00:00Z",
      })
    ).toBe(MARCA_DO_PROJETO_DE_TESTE);
  });

  it("camposCanonicosDoProjeto: texto, números, objetivos em ordem e validação", () => {
    expect(camposCanonicosDoProjeto(projeto)).toEqual([
      [
        "Objetivo de teste",
        "Princípios de teste",
        "Estratégia de teste",
        "Infraestrutura de teste",
        "Público de teste",
        "Instrumentos de teste",
      ],
      [30, 45],
      [
        ["Módulo 1", "Objetivo do módulo 1"],
        ["Módulo 2", "Objetivo do módulo 2"],
      ],
      ["2026-10-01", "RT Teste", "2028-10-01"],
    ]);
    // número que não é inteiro não vira marca
    expect(
      camposCanonicosDoProjeto({ dedicacao_diaria_min: 1.5, prazo_conclusao_dias: "abc" })[1]
    ).toEqual([null, null]);
  });
});

describe("estadoDoPdfDoProjeto", () => {
  it("sem referência do PDF (ou só espaços): sem_pdf, mesmo com marca", () => {
    expect(estadoDoPdfDoProjeto({})).toBe("sem_pdf");
    expect(estadoDoPdfDoProjeto(null)).toBe("sem_pdf");
    expect(estadoDoPdfDoProjeto({ ...projeto, projeto_pedagogico_ref: "   " })).toBe("sem_pdf");
    expect(
      estadoDoPdfDoProjeto({
        ...projeto,
        projeto_pedagogico_ref: "",
        projeto_pdf_marca: MARCA_DO_PROJETO_DE_TESTE,
      })
    ).toBe("sem_pdf");
  });

  it("a marca do PDF bate com a do projeto: atual", () => {
    expect(
      estadoDoPdfDoProjeto({
        ...projeto,
        projeto_pedagogico_ref: PDF,
        projeto_pdf_marca: MARCA_DO_PROJETO_DE_TESTE,
      })
    ).toBe("atual");
  });

  it("PDF sem marca (anexado antes da regra, ou gravado por fora) fica desatualizado", () => {
    expect(estadoDoPdfDoProjeto({ ...projeto, projeto_pedagogico_ref: PDF })).toBe("desatualizado");
    expect(
      estadoDoPdfDoProjeto({ ...projeto, projeto_pedagogico_ref: PDF, projeto_pdf_marca: "" })
    ).toBe("desatualizado");
  });

  it("o cenário da revisão: o PDF sai antes da validação, e registrar a validação o deixa desatualizado", () => {
    const semValidacao = {
      ...projeto,
      projeto_validado_em: null,
      projeto_validado_por: null,
      proxima_revisao: null,
    };
    // o RH gera o PDF para o RT ler: a marca é a do projeto sem validação
    const comPdf = {
      ...semValidacao,
      projeto_pedagogico_ref: PDF,
      projeto_pdf_marca: marcaDoProjeto(semValidacao),
    };
    expect(estadoDoPdfDoProjeto(comPdf)).toBe("atual");
    // o RT aprova, o RH registra a validação e clica em "Salvar curso" (que não mexe no PDF)
    const validado = {
      ...comPdf,
      projeto_validado_em: "2026-10-01",
      projeto_validado_por: "RT Teste",
      proxima_revisao: "2028-10-01",
    };
    expect(estadoDoPdfDoProjeto(validado)).toBe("desatualizado");
    // gerar o PDF de novo grava a marca nova
    expect(estadoDoPdfDoProjeto({ ...validado, projeto_pdf_marca: marcaDoProjeto(validado) })).toBe(
      "atual"
    );
  });

  it("editar um texto depois de gerar o PDF o deixa desatualizado; voltar ao texto de antes o atualiza", () => {
    const comPdf = {
      ...projeto,
      projeto_pedagogico_ref: PDF,
      projeto_pdf_marca: MARCA_DO_PROJETO_DE_TESTE,
    };
    const editado = { ...comPdf, objetivo_geral: "Objetivo mudado" };
    expect(estadoDoPdfDoProjeto(editado)).toBe("desatualizado");
    expect(estadoDoPdfDoProjeto({ ...editado, objetivo_geral: "Objetivo de teste" })).toBe("atual");
  });
});
