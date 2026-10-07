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

// O teste NUNCA carrega o cliente de produção: qualquer chamada ao backend falha o teste.
vi.mock("@/api/sigoClient", () => ({
  sigo: {
    functions: {
      invoke: vi.fn(() => {
        throw new Error("a tela chamou o backend durante o teste");
      }),
    },
    entities: {
      TreinamentoDuvida: {
        filter: vi.fn(() => {
          throw new Error("a tela leu o banco durante o teste");
        }),
        update: vi.fn(() => {
          throw new Error("a tela gravou no banco durante o teste");
        }),
      },
    },
  },
  supabase: {},
  resolveStorageUrl: vi.fn(),
}));

import DuvidasTutorCard, { CartaoDeDuvida } from "./DuvidasTutorCard";

/**
 * O cartão de dúvidas dos alunos na tela do RH (T21), desenhado no servidor com dados fictícios. O ambiente de
 * teste não tem DOM: isto confere o que a tela mostra (filtros, contador, "Editar resposta"), não os cliques. A
 * lógica de filtro e de contagem está em `lib/ead-duvidas.test.js`.
 */
const cursos = [
  { id: "c1", nome: "Curso Um" },
  { id: "c2", nome: "Curso Dois" },
];
const funcionarios = [
  { id: "f1", nome_completo: "Ana Teste", telefone: "(11) 99999-0000" },
  { id: "f2", nome_completo: "Beto Teste", telefone: null },
];
const mapa = (lista) => new Map(lista.map((x) => [x.id, x]));
const duvida = (id, extra = {}) => ({
  id,
  curso_id: "c1",
  funcionario_id: "f1",
  aula_id: null,
  pergunta: `Pergunta ${id}?`,
  resposta: null,
  respondida_por: null,
  respondida_em: null,
  created_at: `2026-10-0${id}T12:00:00Z`,
  ...extra,
});
const todas = [
  duvida(1),
  duvida(2, { resposta: "Resposta 2", respondida_por: "Tutor Teste" }),
  duvida(3, { curso_id: "c2", funcionario_id: "f2" }),
];
const botoes = (html) => [...html.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map((m) => m[0]);
const botaoComTexto = (html, texto) => botoes(html).find((b) => b.includes(texto)) ?? null;

const cartao = (props = {}) =>
  renderToStaticMarkup(
    <DuvidasTutorCard
      empresaAtiva={{ id: "e1" }}
      cursos={cursos}
      funcPorId={mapa(funcionarios)}
      funcTodosPorId={mapa(funcionarios)}
      aulas={[]}
      user={{ full_name: "Tutor Teste" }}
      duvidasIniciais={todas}
      {...props}
    />
  );

describe("cartão de dúvidas do RH", () => {
  it("mostra só as dúvidas sem resposta e o quanto há delas", () => {
    const html = cartao();
    expect(html).toContain("2 sem resposta");
    expect(html).toContain("Pergunta 1?");
    expect(html).toContain("Pergunta 3?");
    expect(html).not.toContain("Pergunta 2?"); // respondida: só em "Ver todas"
    expect(html).toContain("Ver todas (3)");
  });

  it("filtra por curso e por aluno: só aparece quem tem dúvida, com quantas estão sem resposta", () => {
    const html = cartao();
    expect(html).toContain("Curso Um (1 sem resposta)");
    expect(html).toContain("Curso Dois (1 sem resposta)");
    expect(html).toContain("Ana Teste (1 sem resposta)");
    expect(html).toContain("Beto Teste (1 sem resposta)");
    expect(html).toContain('id="duvida-filtro-curso"');
    expect(html).toContain('id="duvida-filtro-aluno"');
  });

  it("curso e aluno sem dúvida não entram nos filtros", () => {
    const html = cartao({
      cursos: [...cursos, { id: "c9", nome: "Curso Sem Dúvida" }],
      funcPorId: mapa([...funcionarios, { id: "f9", nome_completo: "Zé Sem Dúvida" }]),
    });
    expect(html).not.toContain("Curso Sem Dúvida");
    expect(html).not.toContain("Zé Sem Dúvida");
  });

  it("sem nenhuma dúvida não há filtros nem contador", () => {
    const html = cartao({ duvidasIniciais: [] });
    expect(html).not.toContain("duvida-filtro-curso");
    expect(html).not.toContain("sem resposta");
    expect(html).toContain("Nenhuma dúvida esperando resposta.");
  });

  it("tem o botão Atualizar (dúvidas novas chegam sem recarregar a página)", () => {
    expect(botaoComTexto(cartao(), "Atualizar")).not.toBeNull();
  });

  it("mostra o nome de quem já saiu da empresa (a lista de ativos não o tem)", () => {
    const html = cartao({
      funcPorId: mapa([funcionarios[0]]),
      funcTodosPorId: mapa(funcionarios),
    });
    expect(html).toContain("Beto Teste");
  });
});

describe("CartaoDeDuvida", () => {
  const props = (extra = {}) => ({
    duvida: duvida(1),
    cursoNome: "Curso Um",
    alunoNome: "Ana Teste",
    aulaTitulo: null,
    emEdicao: false,
    texto: "",
    onTexto: () => {},
    salvando: false,
    podeAvisarDeNovo: true,
    avisarDeNovo: false,
    onAvisarDeNovo: () => {},
    onEditar: () => {},
    onCancelar: () => {},
    onSalvar: () => {},
    ...extra,
  });
  const tela = (extra) => renderToStaticMarkup(<CartaoDeDuvida {...props(extra)} />);

  it("dúvida sem resposta mostra o campo para responder, sem 'Editar resposta'", () => {
    const html = tela();
    expect(html).toContain("Pergunta 1?");
    expect(html).toContain("Ana Teste");
    expect(html).toContain("Curso Um");
    expect(html).toContain("<textarea");
    expect(html).not.toContain("Editar resposta");
    expect(html).not.toContain("Avisar o aluno de novo");
  });

  it("o botão de enviar fica desativado até haver texto", () => {
    expect(tela({ texto: "" })).toMatch(/ disabled=""/);
    expect(botoes(tela({ texto: "Resposta" })).join("")).not.toMatch(/ disabled=""/);
  });

  it("dúvida respondida mostra a resposta, quem respondeu e o botão 'Editar resposta'", () => {
    const html = tela({
      duvida: duvida(2, {
        resposta: "Resposta 2",
        respondida_por: "Tutor Teste",
        respondida_em: "2026-10-03T12:00:00Z",
      }),
    });
    expect(html).toContain("Resposta 2");
    expect(html).toContain("Tutor Teste");
    expect(botaoComTexto(html, "Editar resposta")).not.toBeNull();
    expect(html).not.toContain("<textarea");
  });

  it("editando, volta o campo com a resposta e a caixa para avisar o aluno de novo (desmarcada)", () => {
    const html = tela({
      duvida: duvida(2, { resposta: "Resposta 2", respondida_por: "Tutor Teste" }),
      emEdicao: true,
      texto: "Resposta 2",
    });
    expect(html).toContain("<textarea");
    expect(html).toContain("Resposta 2");
    expect(html).toContain("Avisar o aluno de novo pelo WhatsApp");
    expect(html).not.toMatch(/<input[^>]*checked/);
    expect(html).toContain("Cancelar edição");
    expect(html).not.toContain("Editar resposta");
  });

  it("aluno sem telefone (ou que já saiu) não oferece o aviso por WhatsApp", () => {
    const html = tela({
      duvida: duvida(2, { resposta: "Resposta 2" }),
      emEdicao: true,
      texto: "Resposta 2",
      podeAvisarDeNovo: false,
    });
    expect(html).not.toContain("Avisar o aluno de novo");
    expect(html).toContain("Cancelar edição");
  });

  it("mostra a aula da dúvida quando há", () => {
    expect(tela({ aulaTitulo: "Aula de Teste" })).toContain("Aula de Teste");
  });
});
