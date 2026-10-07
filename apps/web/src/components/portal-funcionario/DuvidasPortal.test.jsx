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

// O teste NUNCA carrega o cliente de produção: qualquer chamada ao backend falha.
vi.mock("@/api/sigoClient", () => ({
  sigo: {
    functions: {
      invoke: vi.fn(() => {
        throw new Error("o portal chamou o backend durante o teste");
      }),
    },
  },
  supabase: {},
  resolveStorageUrl: vi.fn(),
}));

import DuvidasPortal from "./DuvidasPortal";

/**
 * "Fale com o tutor" na tela do aluno (T21): quem é o tutor e quando atende, a aula de cada dúvida, a resposta
 * e o botão "Atualizar". Só dados fictícios; `renderToStaticMarkup` não roda efeitos (nada vai ao servidor).
 */
const semOperacao = () => {};
const aulas = [
  // como o servidor entrega: sem número (o portal numera pela posição na lista)
  { id: "a1", titulo: "Aula um" },
  { id: "a2", titulo: "Aula dois" },
];
const duvidas = [
  {
    id: "d1",
    aula_id: "a2",
    pergunta: "Pergunta sobre a aula dois?",
    resposta: "Resposta do tutor.",
    respondida_em: "2026-10-07T15:30:00Z",
    created_at: "2026-10-07T12:00:00Z",
  },
  {
    id: "d2",
    aula_id: null,
    pergunta: "Pergunta sobre o curso todo?",
    resposta: null,
    respondida_em: null,
    created_at: "2026-10-06T12:00:00Z",
  },
];
const item = (extra = {}, cursoExtra = {}) => ({
  matricula: { id: "m1", curso_id: "c1" },
  curso: { id: "c1", nome: "Curso de teste", ...cursoExtra },
  aulas,
  duvidas: [],
  ...extra,
});
const desenhar = (it, props = {}) =>
  renderToStaticMarkup(
    <DuvidasPortal
      item={it}
      token="token"
      aulaId={null}
      recarregar={async () => ({})}
      tratarErro={semOperacao}
      {...props}
    />
  );
const botoes = (html) => [...html.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map((m) => m[0]);
const botaoComTexto = (html, texto) => botoes(html).find((b) => b.includes(texto)) ?? null;

describe("o tutor do curso na tela do aluno", () => {
  it("sem tutor cadastrado, a tela segue como antes (nenhuma linha de tutor ou atendimento)", () => {
    const html = desenhar(item());
    expect(html).toContain("Fale com o tutor");
    expect(html).not.toContain("Tutor:");
    expect(html).not.toContain("Atendimento:");
  });

  it("mostra o nome do tutor e o horário e prazo de atendimento", () => {
    const html = desenhar(
      item(
        {},
        {
          tutor_nome: "Tutor Teste",
          tutor_atendimento: "Dias úteis, 8h às 17h; resposta em até 1 dia útil",
        }
      )
    );
    expect(html).toContain("Tutor:");
    expect(html).toContain("Tutor Teste");
    expect(html).toContain("Atendimento:");
    expect(html).toContain("Dias úteis, 8h às 17h; resposta em até 1 dia útil");
  });

  it("só o atendimento ou só o nome também aparecem", () => {
    const soNome = desenhar(item({}, { tutor_nome: "Tutor Teste" }));
    expect(soNome).toContain("Tutor Teste");
    expect(soNome).not.toContain("Atendimento:");
    const soAtendimento = desenhar(item({}, { tutor_atendimento: "Dias úteis" }));
    expect(soAtendimento).toContain("Atendimento:");
    expect(soAtendimento).not.toContain("Tutor:");
  });

  it("o telefone do tutor nunca aparece, mesmo que o curso o traga", () => {
    const html = desenhar(
      item({}, { tutor_nome: "Tutor Teste", tutor_telefone: "(11) 99999-0000" })
    );
    expect(html).not.toContain("99999");
  });
});

describe("as dúvidas do aluno", () => {
  const html = desenhar(item({ duvidas }, { tutor_nome: "Tutor Teste" }));

  it("cada dúvida mostra a aula em que foi feita; a do curso todo não mostra aula", () => {
    expect(html).toContain("Aula 2: Aula dois");
    expect(html).not.toContain("Aula 1: Aula um"); // só aparece quando é a aula aberta (outro teste)
    const depoisDaSegunda = html.slice(html.indexOf("Pergunta sobre o curso todo?") - 400);
    expect(depoisDaSegunda).not.toMatch(/Aula \d:/);
  });

  it("mostra a resposta, com a data, e avisa a que ainda aguarda", () => {
    expect(html).toContain("Resposta do tutor.");
    expect(html).toContain("Aguardando resposta do tutor");
  });

  it("resume quantas já têm resposta", () => {
    expect(html).toContain("2 dúvidas: 1 respondida, 1 aguardando");
  });

  it("tem o botão Atualizar para ver a resposta sem sair do curso", () => {
    const botao = botaoComTexto(html, "Atualizar");
    expect(botao).not.toBeNull();
    expect(botao).not.toMatch(/ disabled=""/);
  });

  it("sem nenhuma dúvida não há o que atualizar", () => {
    expect(botaoComTexto(desenhar(item()), "Atualizar")).toBeNull();
  });

  it("a dúvida nova diz a que aula vai ligada: a aula aberta, ou o curso todo", () => {
    expect(desenhar(item(), { aulaId: "a1" })).toContain("Aula 1: Aula um");
    expect(desenhar(item(), { aulaId: "a1" })).toMatch(/enviada com a aula/i);
    expect(desenhar(item(), { aulaId: null })).toMatch(/sobre o curso/i);
  });

  it("o botão de enviar fica desativado até haver uma pergunta", () => {
    const botao = botaoComTexto(html, "Enviar dúvida");
    expect(botao).toMatch(/ disabled=""/);
  });
});

describe("prévia do responsável técnico", () => {
  it("não há botão Atualizar (nada vai ao servidor) e o tutor aparece como o aluno vê", () => {
    const html = desenhar(item({}, { tutor_nome: "Tutor Teste" }), {
      api: { previa: true, chamarPortal: async () => ({}) },
    });
    expect(html).toContain("Tutor Teste");
    expect(html).toContain("Prévia: aqui o aluno escreve a dúvida");
    expect(botaoComTexto(html, "Atualizar")).toBeNull();
  });
});
