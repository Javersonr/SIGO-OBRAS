import { describe, it, expect } from "vitest";
import { pessoasDosTreinamentos } from "./instrutores-config";

// Dados sintéticos: nenhuma empresa ou pessoa real.
const EMPRESA = "empresa-teste";
const ref = (nome) => `assinaturas/${EMPRESA}/2026/10/${nome}`;

describe("pessoasDosTreinamentos: instrutores e responsáveis do catálogo de Configurações", () => {
  it("lê instrutor em lista JSON (legado) e em texto puro, sem repetir o nome", () => {
    const { instrutores } = pessoasDosTreinamentos([
      {
        instrutor_nome: JSON.stringify([
          { nome: "Instrutor Um", formacao: "Eng. de Teste" },
          { nome: "  instrutor um  ", formacao: "outra" }, // mesmo nome (sem diferenciar caixa)
        ]),
      },
      { instrutor_nome: "Instrutor Dois" },
      { instrutor_nome: "[json quebrado" }, // JSON quebrado: ignora
    ]);
    expect(instrutores.map((i) => i.nome)).toEqual(["Instrutor Dois", "Instrutor Um"]);
    expect(instrutores.find((i) => i.nome === "Instrutor Um").qualificacao).toBe("Eng. de Teste");
  });

  it("lê o responsável técnico e o engenheiro responsável com o registro", () => {
    const { responsaveis } = pessoasDosTreinamentos([
      { responsavel_tecnico_nome: "RT Um", responsavel_tecnico_criacao: "CREA-XX 1" },
      { engenheiro_responsavel_nome: "Eng Dois", engenheiro_responsavel_crea: "CREA-XX 2" },
    ]);
    expect(responsaveis).toEqual([
      { nome: "Eng Dois", registro: "CREA-XX 2", assinatura_ref: null },
      { nome: "RT Um", registro: "CREA-XX 1", assinatura_ref: null },
    ]);
  });

  it("sem lista, devolve listas vazias", () => {
    expect(pessoasDosTreinamentos(null)).toEqual({ instrutores: [], responsaveis: [] });
    expect(pessoasDosTreinamentos([])).toEqual({ instrutores: [], responsaveis: [] });
  });
});

describe("pessoasDosTreinamentos: imagem da assinatura que o RH já anexou em Configurações (T29)", () => {
  it("leva a referência válida da assinatura do instrutor e do responsável", () => {
    const { instrutores, responsaveis } = pessoasDosTreinamentos(
      [
        {
          instrutor_nome: JSON.stringify([
            { nome: "Instrutor Um", formacao: "Eng.", assinatura_url: ref("instrutor.png") },
          ]),
          responsavel_tecnico_nome: "RT Um",
          responsavel_tecnico_criacao: "CREA-XX 1",
          responsavel_tecnico_assinatura_url: ref("rt.jpg"),
          engenheiro_responsavel_nome: "Eng Dois",
          engenheiro_responsavel_crea: "CREA-XX 2",
          engenheiro_responsavel_assinatura_url: ref("eng.png"),
        },
      ],
      EMPRESA
    );
    expect(instrutores).toEqual([
      { nome: "Instrutor Um", qualificacao: "Eng.", assinatura_ref: ref("instrutor.png") },
    ]);
    expect(responsaveis).toEqual([
      { nome: "Eng Dois", registro: "CREA-XX 2", assinatura_ref: ref("eng.png") },
      { nome: "RT Um", registro: "CREA-XX 1", assinatura_ref: ref("rt.jpg") },
    ]);
  });

  it("instrutor em texto puro usa a assinatura do próprio treinamento", () => {
    const { instrutores } = pessoasDosTreinamentos(
      [{ instrutor_nome: "Instrutor Um", instrutor_assinatura_url: ref("instrutor.png") }],
      EMPRESA
    );
    expect(instrutores[0].assinatura_ref).toBe(ref("instrutor.png"));
  });

  it("ignora a assinatura do Base44 (arquivo perdido), URL assinada e pasta de outra empresa", () => {
    const { instrutores, responsaveis } = pessoasDosTreinamentos(
      [
        {
          instrutor_nome: JSON.stringify([
            { nome: "Instrutor Um", assinatura_url: "https://exemplo.base44.app/api/x/a.png" },
            {
              nome: "Instrutor Dois",
              assinatura_url: `https://armazenamento.exemplo/storage/v1/object/sign/assinaturas/${EMPRESA}/a.png?token=x`,
            },
            { nome: "Instrutor Tres", assinatura_url: "assinaturas/outra-empresa/2026/10/a.png" },
          ]),
          responsavel_tecnico_nome: "RT Um",
          responsavel_tecnico_assinatura_url: "https://media.base44.com/images/public/x/rt.png",
        },
      ],
      EMPRESA
    );
    expect(instrutores.map((i) => i.assinatura_ref)).toEqual([null, null, null]);
    expect(responsaveis[0].assinatura_ref).toBeNull();
    // o nome continua disponível para escolher: só a imagem é descartada
    expect(instrutores.map((i) => i.nome)).toEqual([
      "Instrutor Dois",
      "Instrutor Tres",
      "Instrutor Um",
    ]);
  });

  it("a junção com '|' que Configurações grava (todas as linhas num campo só) não vira imagem (A6)", () => {
    // TreinamentoModal junta as assinaturas de todas as linhas de instrutor com "|" em instrutor_assinatura_url;
    // o instrutor em texto puro lê esse campo inteiro, e a junção nunca carrega como imagem
    const { instrutores } = pessoasDosTreinamentos(
      [
        {
          instrutor_nome: "Instrutor Um",
          instrutor_assinatura_url: `${ref("a.png")}|${ref("b.png")}`,
        },
        { instrutor_nome: "Instrutor Dois", instrutor_assinatura_url: ref("b.png") },
      ],
      EMPRESA
    );
    expect(instrutores.map((i) => [i.nome, i.assinatura_ref])).toEqual([
      ["Instrutor Dois", ref("b.png")],
      ["Instrutor Um", null],
    ]);
  });

  it("o mesmo nome em vários treinamentos: a primeira assinatura válida encontrada vale", () => {
    const { instrutores, responsaveis } = pessoasDosTreinamentos(
      [
        {
          instrutor_nome: JSON.stringify([{ nome: "Instrutor Um", assinatura_url: "" }]),
          responsavel_tecnico_nome: "RT Um",
        },
        {
          instrutor_nome: JSON.stringify([
            { nome: "Instrutor Um", assinatura_url: ref("instrutor.png") },
          ]),
          responsavel_tecnico_nome: "RT Um",
          responsavel_tecnico_assinatura_url: ref("rt.png"),
        },
      ],
      EMPRESA
    );
    expect(instrutores).toHaveLength(1);
    expect(instrutores[0].assinatura_ref).toBe(ref("instrutor.png"));
    expect(responsaveis).toHaveLength(1);
    expect(responsaveis[0].assinatura_ref).toBe(ref("rt.png"));
  });
});
