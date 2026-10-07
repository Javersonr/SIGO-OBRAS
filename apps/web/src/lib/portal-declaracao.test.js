import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  MARCADOS_VAZIOS,
  corpoDaDeclaracao,
  itensFaltando,
  precisaDeclararAmbiente,
  todosMarcados,
  tratamentoDoErroDaDeclaracao,
} from "./portal-declaracao";
import { ITENS_DA_DECLARACAO } from "./ead-declaracao-ambiente";

/**
 * Declaração de ambiente e horário na tela do ALUNO (T35): quando ela aparece, o que o botão exige e o que fazer
 * quando o servidor recusa. A regra de verdade (a versão, os três itens, o dia) é do servidor; aqui só a tela.
 */
const HOJE = "2026-10-07";
const texto = {
  versao: 2,
  texto: "Texto do RT, com mais de vinte caracteres.",
  art: null,
  itens: [],
};
const item = (extra = {}) => ({
  matricula: { id: "m1", status: "em_andamento" },
  declaracao_hoje: { dia: HOJE, declarada: false },
  ...extra,
});
const tudo = Object.fromEntries(ITENS_DA_DECLARACAO.map((i) => [i.id, true]));

describe("precisaDeclararAmbiente: na 1ª abertura do curso em cada dia", () => {
  it("ainda não declarou hoje: a tela da declaração aparece antes do curso", () => {
    expect(precisaDeclararAmbiente({ item: item(), declaracao: texto, hoje: HOJE })).toBe(true);
    // matrícula que ainda nem começou também (a primeira abertura é justamente a do dia)
    expect(
      precisaDeclararAmbiente({
        item: item({ matricula: { id: "m1", status: "pendente" } }),
        declaracao: texto,
        hoje: HOJE,
      })
    ).toBe(true);
  });

  it("já declarou hoje: o curso abre direto", () => {
    expect(
      precisaDeclararAmbiente({
        item: item({ declaracao_hoje: { dia: HOJE, declarada: true } }),
        declaracao: texto,
        hoje: HOJE,
      })
    ).toBe(false);
  });

  it("a declaração dos dados é de OUTRO dia (portal aberto desde ontem): vale como não declarada", () => {
    expect(
      precisaDeclararAmbiente({
        item: item({ declaracao_hoje: { dia: "2026-10-06", declarada: true } }),
        declaracao: texto,
        hoje: HOJE,
      })
    ).toBe(true);
  });

  it("curso concluído não pede a declaração (só abre para o certificado e a revisão)", () => {
    expect(
      precisaDeclararAmbiente({
        item: item({ matricula: { id: "m1", status: "concluido" } }),
        declaracao: texto,
        hoje: HOJE,
      })
    ).toBe(false);
  });

  it("a prévia do RT ('Ver como aluno') não passa por aqui: nada é gravado (A6, T35)", () => {
    // o parâmetro `previa` não existia em nenhum chamador: a prévia monta o `CursoPortal` direto, sem a declaração.
    // O que trava é este teste de fiação, e a função não aceita mais a flag.
    const ler = (caminho) => readFileSync(new URL(caminho, import.meta.url), "utf8");
    for (const caminho of [
      "../components/seguranca/PreviaAlunoCurso.jsx",
      "../components/portal-funcionario/CursoPortal.jsx",
    ]) {
      expect(ler(caminho), caminho).not.toMatch(/precisaDeclararAmbiente|declarar_ambiente/);
    }
    // e a função não tem flag de prévia: quem a chamasse com previa: true continuaria sendo cobrado
    expect(
      precisaDeclararAmbiente({ item: item(), declaracao: texto, hoje: HOJE, previa: true })
    ).toBe(true);
  });

  it("sem o texto (o servidor não conseguiu lê-lo) ou sem o estado do curso: o portal não trava o aluno", () => {
    expect(precisaDeclararAmbiente({ item: item(), declaracao: null, hoje: HOJE })).toBe(false);
    expect(precisaDeclararAmbiente({ item: item(), declaracao: undefined, hoje: HOJE })).toBe(
      false
    );
    expect(
      precisaDeclararAmbiente({
        item: item({ declaracao_hoje: null }),
        declaracao: texto,
        hoje: HOJE,
      })
    ).toBe(false);
    expect(precisaDeclararAmbiente({ item: null, declaracao: texto, hoje: HOJE })).toBe(false);
    expect(precisaDeclararAmbiente()).toBe(false);
  });
});

describe("os três itens e o corpo do pedido", () => {
  it("começa tudo desmarcado e só libera o botão com os TRÊS marcados", () => {
    expect(todosMarcados(MARCADOS_VAZIOS)).toBe(false);
    expect(itensFaltando(MARCADOS_VAZIOS)).toBe(3);
    expect(todosMarcados(tudo)).toBe(true);
    expect(itensFaltando(tudo)).toBe(0);
    for (const i of ITENS_DA_DECLARACAO) {
      const faltando = { ...tudo, [i.id]: false };
      expect(todosMarcados(faltando), i.id).toBe(false);
      expect(itensFaltando(faltando), i.id).toBe(1);
    }
    expect(todosMarcados(undefined)).toBe(false);
    expect(itensFaltando(null)).toBe(3);
  });

  it("o corpo leva a matrícula, a versão que o aluno LEU e os três itens como true", () => {
    expect(corpoDaDeclaracao({ matriculaId: "m1", versao: 2, marcados: tudo })).toEqual({
      matricula_id: "m1",
      versao: 2,
      local_adequado: true,
      horario_reservado: true,
      sem_outra_atividade: true,
    });
  });

  it("sem os três marcados não há corpo (o clique não vai ao servidor)", () => {
    expect(
      corpoDaDeclaracao({ matriculaId: "m1", versao: 2, marcados: MARCADOS_VAZIOS })
    ).toBeNull();
    expect(
      corpoDaDeclaracao({
        matriculaId: "m1",
        versao: 2,
        marcados: { ...tudo, local_adequado: false },
      })
    ).toBeNull();
    expect(corpoDaDeclaracao({ matriculaId: "m1", versao: 2 })).toBeNull();
  });

  it("versão 0 (texto padrão, sem versão salva) é uma versão como as outras", () => {
    expect(corpoDaDeclaracao({ matriculaId: "m1", versao: 0, marcados: tudo })?.versao).toBe(0);
  });
});

describe("tratamentoDoErroDaDeclaracao", () => {
  it("sessão caída ou troca de senha: quem trata é o portal (volta ao login)", () => {
    for (const codigo of ["SESSAO", "TROCAR_SENHA"]) {
      expect(tratamentoDoErroDaDeclaracao({ codigo, message: "x" }).acao).toBe("sessao");
    }
  });

  it("o texto mudou: recarrega os dados, para o aluno ler a versão nova e confirmar de novo", () => {
    const t = tratamentoDoErroDaDeclaracao({
      codigo: "TEXTO_MUDOU",
      message: "O texto da declaração foi atualizado. Leia de novo e confirme.",
    });
    expect(t.acao).toBe("recarregar");
    expect(t.texto).toMatch(/atualizado/);
  });

  it("outro erro: mostra a frase em português (rede vira 'sem conexão')", () => {
    expect(
      tratamentoDoErroDaDeclaracao({
        codigo: null,
        message: "Não foi possível registrar a declaração agora. Tente de novo.",
      })
    ).toEqual({
      acao: "mostrar",
      texto: "Não foi possível registrar a declaração agora. Tente de novo.",
    });
    const rede = tratamentoDoErroDaDeclaracao(new Error("Failed to fetch"));
    expect(rede.acao).toBe("mostrar");
    expect(rede.texto).not.toMatch(/fetch/i);
  });
});
