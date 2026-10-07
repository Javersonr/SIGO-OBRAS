import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// A página lê `window.location` ao montar e os utilitários leem `window` ao carregar; o ambiente de
// teste não tem DOM, então a janela é um objeto simples (a busca da URL muda de um teste para outro).
vi.hoisted(() => {
  const janela = { location: { search: "" } };
  janela.self = janela;
  janela.top = janela;
  globalThis.window = janela;
});

// O teste NUNCA carrega o cliente de produção: a página importa o sigoClient, que criaria o cliente do
// Supabase com o `.env.local` da máquina. Qualquer consulta ao backend falha o teste.
vi.mock("@/api/sigoClient", () => ({
  sigo: {
    functions: {
      invoke: vi.fn(() => {
        throw new Error("a validação chamou o backend durante o teste");
      }),
    },
  },
  supabase: {},
  resolveStorageUrl: vi.fn(),
}));

import ValidarCertificado from "./ValidarCertificado";
import ResultadoValidacao from "@/components/portal-funcionario/ResultadoValidacao";

/**
 * Primeira tela da validação pública de certificado (T36) e o resultado, só com dados sintéticos.
 * `renderToStaticMarkup` não roda efeitos nem eventos: nenhuma consulta é feita aqui. A máscara do
 * código e a URL do "consultar outro" estão em lib/validacao-certificado.test.js.
 */
const tela = (el) => renderToStaticMarkup(el);
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
// atributo `disabled` do botão (a classe "disabled:opacity-50" do estilo não conta)
const DESABILITADO = /\sdisabled(="")?[\s>]/;
const campoDoCodigo = (html) => html.match(/<input[^>]*>/)?.[0] ?? "";
const botaoComTexto = (html, texto) =>
  [...html.matchAll(/<button[^>]*>[\s\S]*?<\/button>/g)].find((m) => m[0].includes(texto))?.[0] ??
  null;

const certificado = {
  codigo: "ABCD-1234-EFGH",
  aluno: "Aluno de Teste",
  cpf: "***.456.789-**",
  curso: "Curso de Teste",
  carga_horaria_horas: 8,
  modalidade: "EAD",
  inicio: "2026-09-01",
  conclusao: "2026-09-02",
  validade: "2028-09-02",
  empresa: "Empresa de Teste",
  cnpj: "12345678000190",
  responsavel_tecnico: { nome: "RT de Teste", registro: "CREA 0000" },
  assinado_pelo_aluno_em: "2026-09-02T12:00:00Z",
  hash_sha256: "0".repeat(64),
};
const achado = {
  encontrado: true,
  situacao: "valido",
  valido: true,
  revogado: false,
  vencido: false,
  integro: true,
  certificado,
};

describe("ValidarCertificado (primeira tela)", () => {
  it("mostra o logo e o título, sem emoji", () => {
    window.location.search = "";
    const html = tela(<ValidarCertificado />);
    expect(html).toMatch(/<img[^>]*src="\/favicon\.svg"[^>]*alt="SIGO Obras"/);
    expect(html).toContain("Validar certificado");
    expect(html).not.toMatch(EMOJI);
  });

  it("campo do código com a máscara no exemplo, nome acessível e consulta bloqueada enquanto vazio", () => {
    window.location.search = "";
    const html = tela(<ValidarCertificado />);
    const campo = campoDoCodigo(html);
    expect(campo).toContain('placeholder="XXXX-XXXX-XXXX"');
    expect(campo).toContain('aria-label="Código de autenticidade"');
    expect(campo).toContain('autoComplete="off"');
    const consultar = botaoComTexto(html, "") ?? "";
    expect(consultar).toContain('aria-label="Consultar"');
    expect(consultar).toMatch(DESABILITADO);
  });

  it("código vindo do QR (sem hífen, minúsculo) entra com a máscara", () => {
    window.location.search = "?codigo=abcd1234efgh";
    const html = tela(<ValidarCertificado />);
    expect(campoDoCodigo(html)).toContain('value="ABCD-1234-EFGH"');
    expect(botaoComTexto(html, "")).not.toMatch(DESABILITADO);
  });

  it("sem resultado ainda, não há o que imprimir nem outro código a consultar", () => {
    window.location.search = "";
    const html = tela(<ValidarCertificado />);
    expect(html).not.toContain("Imprimir");
    expect(html).not.toContain("Consultar outro código");
  });
});

describe("ResultadoValidacao", () => {
  const aoLado = { onImprimir: () => {}, onConsultarOutro: () => {} };

  it("sem resultado não desenha nada", () => {
    expect(tela(<ResultadoValidacao resultado={null} {...aoLado} />)).toBe("");
  });

  it("certificado encontrado: dados, data da consulta e os dois botões (que não saem na impressão)", () => {
    const html = tela(
      <ResultadoValidacao resultado={achado} consultadoEm="2026-10-06T12:00:00Z" {...aoLado} />
    );
    expect(html).toContain("Autêntico e válido");
    expect(html).toContain("Aluno de Teste");
    expect(html).toContain("***.456.789-**");
    expect(html).toContain("12.345.678/0001-90");
    expect(html).toContain("ABCD-1234-EFGH");
    expect(html).toContain("Consulta feita em 06/10/2026");
    const imprimir = botaoComTexto(html, "Imprimir");
    const outro = botaoComTexto(html, "Consultar outro código");
    expect(imprimir).not.toBeNull();
    expect(outro).not.toBeNull();
    // os botões ficam numa faixa escondida na impressão
    expect(html).toMatch(/class="[^"]*print:hidden[^"]*"[^>]*>\s*<button[\s\S]*Imprimir/);
    expect(html).not.toMatch(EMOJI);
  });

  describe("tipo do treinamento (T23)", () => {
    const com = (extra) => ({ ...achado, certificado: { ...certificado, ...extra } });
    const exibir = (resultado) =>
      tela(
        <ResultadoValidacao resultado={resultado} consultadoEm="2026-10-06T12:00:00Z" {...aoLado} />
      );

    it("mostra o tipo do treinamento que o certificado traz", () => {
      const html = exibir(com({ tipo_treinamento: "periodico", motivo_eventual: null }));
      expect(html).toContain("Tipo de treinamento");
      expect(html).toContain("Periódico");
      expect(html).not.toContain("Motivo");
    });

    it("eventual mostra também o motivo", () => {
      const html = exibir(
        com({ tipo_treinamento: "eventual", motivo_eventual: "Mudança de procedimento de teste" })
      );
      expect(html).toContain("Eventual");
      expect(html).toContain("Motivo");
      expect(html).toContain("Mudança de procedimento de teste");
    });

    it("certificado de antes da T23 (sem o tipo) não ganha as linhas", () => {
      for (const extra of [{}, { tipo_treinamento: null, motivo_eventual: null }]) {
        const html = exibir(com(extra));
        expect(html).not.toContain("Tipo de treinamento");
        expect(html).not.toContain("Motivo");
      }
    });

    it("tipo que a página não conhece não é impresso", () => {
      const html = exibir(com({ tipo_treinamento: "reciclagem" }));
      expect(html).not.toContain("Tipo de treinamento");
      expect(html).not.toContain("reciclagem");
    });
  });

  it("código que não existe: mensagem, sem imprimir, com 'consultar outro código'", () => {
    const html = tela(
      <ResultadoValidacao resultado={{ valido: false, encontrado: false }} {...aoLado} />
    );
    expect(html).toContain("Nenhum certificado com esse código");
    expect(botaoComTexto(html, "Imprimir")).toBeNull();
    expect(botaoComTexto(html, "Consultar outro código")).not.toBeNull();
  });

  it("situação que a página não conhece: cartão cinza, nunca 'Autêntico e válido' nem verde (T10, M3)", () => {
    for (const situacao of ["suspenso", "", null, "VALIDO"]) {
      const html = tela(<ResultadoValidacao resultado={{ ...achado, situacao }} {...aoLado} />);
      expect(html, String(situacao)).toContain("Não foi possível confirmar este certificado");
      expect(html).toContain("confirmar com a empresa emissora");
      expect(html).not.toContain("Autêntico e válido");
      expect(html).not.toMatch(/emerald/);
      expect(html).toContain("border-slate-300");
      // o fiscal ainda pode imprimir o que viu
      expect(botaoComTexto(html, "Imprimir")).not.toBeNull();
    }
  });

  it("o aviso do hash antigo não diz que a conferência 'não se aplica'", () => {
    const html = tela(
      <ResultadoValidacao resultado={{ ...achado, integro: null, hash_versao: 1 }} {...aoLado} />
    );
    expect(html).toContain("Não foi possível conferir o selo de integridade");
    expect(html).not.toMatch(/não se aplica/i);
  });

  it("revogado e vencido continuam podendo ser impressos (a página registra o que o fiscal viu)", () => {
    const revogado = tela(
      <ResultadoValidacao
        resultado={{
          ...achado,
          situacao: "revogado",
          valido: false,
          revogado: true,
          motivo_revogacao: "Emitido por engano",
        }}
        {...aoLado}
      />
    );
    expect(revogado).toContain("Revogado");
    expect(revogado).toContain("Motivo: Emitido por engano");
    expect(botaoComTexto(revogado, "Imprimir")).not.toBeNull();
    const vencido = tela(
      <ResultadoValidacao
        resultado={{ ...achado, situacao: "vencido", vencido: true }}
        {...aoLado}
      />
    );
    expect(vencido).toContain("Autêntico, vencido em 02/09/2028");
    expect(botaoComTexto(vencido, "Imprimir")).not.toBeNull();
  });
});
