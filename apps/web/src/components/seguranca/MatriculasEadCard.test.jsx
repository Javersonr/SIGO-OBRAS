import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Os componentes importam utilitários que leem `window` ao carregar; o ambiente de teste não tem DOM.
vi.hoisted(() => {
  const janela = {};
  janela.self = janela;
  janela.top = janela;
  globalThis.window = janela;
});

// O teste NUNCA carrega o cliente de produção: o sigoClient criaria o cliente do Supabase com o
// `.env.local` da máquina. Qualquer chamada ao backend falha o teste.
vi.mock("@/api/sigoClient", () => ({
  sigo: {
    functions: {
      invoke: vi.fn(() => {
        throw new Error("a tela chamou o backend durante o teste");
      }),
    },
  },
  supabase: {},
  resolveStorageUrl: vi.fn(),
}));

import MatriculasEadCard from "./MatriculasEadCard";

/**
 * A tabela de matrículas do RH (T22) desenhada no servidor, só com dados sintéticos: o ambiente de teste
 * não tem DOM, então isto confere o que a tela mostra, não os cliques (a lógica de filtro, ordem, CSV e
 * prazo está em `lib/ead-matriculas.test.js`).
 */
const tela = (el) => renderToStaticMarkup(el);

const cursos = [
  { id: "c1", nome: "NR-10 Basico", ativo: true, max_tentativas: 3 },
  { id: "c2", nome: "NR-35 Apoio", ativo: true, modalidade: "apoio" },
];
const funcionario = (id, extra = {}) => ({
  id,
  nome_completo: `Funcionario ${id}`,
  ativo: true,
  funcao_nome: "Eletricista",
  ...extra,
});
const matricula = (id, funcionario_id, curso_id, extra = {}) => ({
  id,
  funcionario_id,
  curso_id,
  status: "pendente",
  created_at: "2026-09-01T12:00:00Z",
  ...extra,
});
const concluida = (id, funcionario_id, curso_id, extra = {}) =>
  matricula(id, funcionario_id, curso_id, {
    status: "concluido",
    data_conclusao: "2026-09-10",
    proxima_renovacao: "2027-09-10",
    nota_avaliacao: 90,
    avaliacao_aprovada: true,
    ...extra,
  });

const noop = () => {};
const base = (extra = {}) => ({
  empresaId: "emp",
  matriculas: [],
  cursos,
  funcionariosTodos: [],
  aulas: [],
  progresso: [],
  tentativas: [],
  certificados: [],
  andamento: { carregado: true, erro: false, parcial: false },
  cursoAceitaMatricula: () => true,
  onMatricular: noop,
  onDetalhes: noop,
  onAvisar: noop,
  onRemover: noop,
  onRenovar: noop,
  ...extra,
});
// linhas do corpo da tabela: tudo o que é <tr> menos o cabeçalho
const linhasDaTabela = (html) => (html.match(/<tr[ >]/g) || []).length - 1;

describe("MatriculasEadCard", () => {
  it("sem matrículas: mensagem e nenhum filtro", () => {
    const html = tela(<MatriculasEadCard {...base()} />);
    expect(html).toContain("Nenhuma matrícula");
    expect(html).not.toContain("Buscar");
  });

  it("com centenas de matrículas desenha 50 linhas e oferece mostrar mais", () => {
    const n = 600;
    const html = tela(
      <MatriculasEadCard
        {...base({
          funcionariosTodos: Array.from({ length: n }, (_, i) => funcionario(`f${i}`)),
          matriculas: Array.from({ length: n }, (_, i) => matricula(`m${i}`, `f${i}`, "c1")),
        })}
      />
    );
    expect(linhasDaTabela(html)).toBe(50);
    expect(html).toContain("Mostrando 50 de 600");
    expect(html).toContain("Mostrar mais 50");
    expect(html).toContain("Mostrar todas (600)");
    expect(html).toContain("Matrículas (600)");
  });

  it("tem busca, filtros de curso, status e vencimento, e exportar CSV", () => {
    const html = tela(
      <MatriculasEadCard
        {...base({
          funcionariosTodos: [funcionario("f1")],
          matriculas: [matricula("m1", "f1", "c1")],
        })}
      />
    );
    for (const texto of ["Buscar", "Curso", "Status", "Vencimento", "Exportar CSV"]) {
      expect(html).toContain(texto);
    }
    expect(html).toContain("Vencidos");
    expect(html).toContain("Atrasada");
  });

  it("os cabeçalhos dizem a ordem atual: a matrícula mais recente primeiro", () => {
    const html = tela(
      <MatriculasEadCard
        {...base({
          funcionariosTodos: [funcionario("f1")],
          matriculas: [matricula("m1", "f1", "c1")],
        })}
      />
    );
    expect(html).toMatch(/aria-sort="descending"[^>]*><button[^>]*>Matrícula/);
    expect(html).toContain('aria-sort="none"');
  });

  it("ex-funcionário aparece com (inativo) e não pode ser avisado", () => {
    const html = tela(
      <MatriculasEadCard
        {...base({
          funcionariosTodos: [funcionario("f1", { nome_completo: "Ana Souza", ativo: false })],
          matriculas: [matricula("m1", "f1", "c1")],
        })}
      />
    );
    expect(html).toContain("Ana Souza (inativo)");
    expect(html).toMatch(
      /<button[^>]*aria-label="Avisar no WhatsApp de Ana Souza"[^>]*disabled=""/
    );
  });

  it("mostra aulas feitas, nota e tentativas", () => {
    const html = tela(
      <MatriculasEadCard
        {...base({
          funcionariosTodos: [funcionario("f1")],
          matriculas: [
            matricula("m1", "f1", "c1", {
              status: "em_andamento",
              nota_avaliacao: 55,
              avaliacao_aprovada: false,
              tentativas_extras: 1,
            }),
          ],
          aulas: [
            { id: "a1", curso_id: "c1" },
            { id: "a2", curso_id: "c1" },
            { id: "a3", curso_id: "c1" },
          ],
          progresso: [{ matricula_id: "m1", aula_id: "a1", concluida: true }],
          tentativas: [
            { matricula_id: "m1", numero: 1, nota: 40 },
            { matricula_id: "m1", numero: 2, nota: 55 },
          ],
        })}
      />
    );
    expect(html).toContain("1/3");
    expect(html).toContain(">55<");
    expect(html).toContain("2 de 4");
    expect(html).toContain("Em andamento");
  });

  it("andamento ainda carregando: reticências no lugar de zero, e o CSV espera", () => {
    const html = tela(
      <MatriculasEadCard
        {...base({
          andamento: { carregado: false, erro: false, parcial: false },
          funcionariosTodos: [funcionario("f1")],
          matriculas: [matricula("m1", "f1", "c1")],
          aulas: [{ id: "a1", curso_id: "c1" }],
        })}
      />
    );
    expect(html).toContain("…");
    expect(html).not.toContain("0/1");
    expect(html).toContain("Aguarde: as aulas e tentativas ainda estão carregando");
  });

  it("falha ao carregar o andamento: avisa e deixa as colunas em branco", () => {
    const html = tela(
      <MatriculasEadCard
        {...base({
          andamento: { carregado: true, erro: true, parcial: false },
          funcionariosTodos: [funcionario("f1")],
          matriculas: [matricula("m1", "f1", "c1")],
          aulas: [{ id: "a1", curso_id: "c1" }],
        })}
      />
    );
    expect(html).toContain("Não foi possível carregar as aulas e tentativas");
    expect(html).not.toContain("0/1");
  });

  it("concluída de curso comum tem Renovar; a de apoio não renova e diz que não emite certificado", () => {
    const html = tela(
      <MatriculasEadCard
        {...base({
          funcionariosTodos: [funcionario("f1"), funcionario("f2")],
          matriculas: [concluida("m1", "f1", "c1"), concluida("m2", "f2", "c2")],
        })}
      />
    );
    expect(html).toContain('aria-label="Renovar o treinamento de Funcionario f1"');
    expect(html).not.toContain('aria-label="Renovar o treinamento de Funcionario f2"');
    const renovar = /<button[^>]*aria-label="Renovar o treinamento de Funcionario f1"[^>]*>/.exec(
      html
    )[0];
    expect(renovar).not.toContain('disabled=""');
    expect(html).toContain("não emite");
    expect(html).toContain("Apoio");
  });

  it("Renovar fica desligado quando o curso não aceita matrícula", () => {
    const html = tela(
      <MatriculasEadCard
        {...base({
          cursoAceitaMatricula: () => false,
          funcionariosTodos: [funcionario("f1")],
          matriculas: [concluida("m1", "f1", "c1")],
        })}
      />
    );
    expect(html).toMatch(/<button[^>]*aria-label="Renovar o treinamento de Funcionario f1"[^>]*/);
    const botao = /<button[^>]*aria-label="Renovar o treinamento de Funcionario f1"[^>]*>/.exec(
      html
    )[0];
    expect(botao).toContain('disabled=""');
    expect(botao).toContain("não aceita matrícula");
  });

  it("matrícula vencida mostra o vencimento; remover fica bloqueado com certificado válido", () => {
    const html = tela(
      <MatriculasEadCard
        {...base({
          funcionariosTodos: [funcionario("f1")],
          matriculas: [concluida("m1", "f1", "c1", { proxima_renovacao: "2020-01-01" })],
          certificados: [{ matricula_id: "m1", codigo: "ABC-1" }],
        })}
      />
    );
    expect(html).toContain("ABC-1");
    expect(html).toContain("Vencido há");
    expect(html).toContain("(bloqueado: revogue o certificado antes)");
  });

  it("com prazo no curso, matrícula aberta além do limite fica atrasada e aparece o aviso em lote", () => {
    const html = tela(
      <MatriculasEadCard
        {...base({
          cursos: [{ ...cursos[0], prazo_conclusao_dias: 30 }, cursos[1]],
          funcionariosTodos: [funcionario("f1"), funcionario("f2")],
          matriculas: [
            matricula("m1", "f1", "c1", { created_at: "2020-01-01T12:00:00Z" }),
            matricula("m2", "f2", "c1", { created_at: "2020-01-02T12:00:00Z" }),
          ],
        })}
      />
    );
    expect(html).toContain("Avisar atrasados (2)");
    expect(html).toContain("dia(s) de atraso");
    expect(html).toContain(">Prazo<");
  });

  it("sem prazo nenhum, ninguém fica atrasado e não há aviso em lote (o comportamento de antes)", () => {
    const html = tela(
      <MatriculasEadCard
        {...base({
          funcionariosTodos: [funcionario("f1")],
          matriculas: [matricula("m1", "f1", "c1", { created_at: "2020-01-01T12:00:00Z" })],
        })}
      />
    );
    expect(html).not.toContain("Avisar atrasados");
    expect(html).not.toContain("dia(s) de atraso");
  });
});

describe("MatriculasEadCard: tipo do treinamento (T23)", () => {
  const html = (matriculas) =>
    tela(
      <MatriculasEadCard
        {...base({
          funcionariosTodos: [funcionario("f1"), funcionario("f2"), funcionario("f3")],
          matriculas,
        })}
      />
    );

  it("periódico e eventual aparecem sob o nome do curso, o eventual com o motivo", () => {
    const saida = html([
      matricula("m1", "f1", "c1", { tipo: "periodico", motivo_eventual: null }),
      matricula("m2", "f2", "c1", { tipo: "eventual", motivo_eventual: "Mudança de procedimento" }),
    ]);
    expect(saida).toContain("Periódico");
    expect(saida).toContain("Eventual: Mudança de procedimento");
  });

  it("inicial (o comum) e matrícula sem a coluna não levam a linha", () => {
    const saida = html([
      matricula("m1", "f1", "c1", { tipo: "inicial", motivo_eventual: null }),
      matricula("m2", "f2", "c1"),
    ]);
    expect(saida).not.toContain("Periódico");
    expect(saida).not.toContain("Eventual");
    expect(saida).not.toContain("Inicial");
  });
});
