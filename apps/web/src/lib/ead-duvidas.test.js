import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  FILTRO_SEM_RESPOSTA,
  contarPendentes,
  decidirResposta,
  edicaoDepoisDeResponder,
  ehPendente,
  filtrarDuvidas,
  opcoesDoFiltro,
  rotuloDaAbaTreinamentos,
  textoPendentes,
} from "./ead-duvidas";

// Dados fictícios (o repositório é público).
const d = (id, extra = {}) => ({
  id,
  curso_id: "curso-a",
  funcionario_id: "func-1",
  pergunta: `Pergunta ${id}`,
  resposta: null,
  created_at: `2026-10-0${id}T12:00:00Z`,
  ...extra,
});
const lista = [
  d(1),
  d(2, { resposta: "Resposta 2" }),
  d(3, { curso_id: "curso-b", funcionario_id: "func-2" }),
  d(4, { curso_id: "curso-b", funcionario_id: "func-1", resposta: "Resposta 4" }),
  d(5, { funcionario_id: "func-2", resposta: "" }),
];

describe("dúvida pendente", () => {
  it("sem resposta (nula, ausente ou vazia) está pendente: a mesma conta do banco (A6)", () => {
    expect(ehPendente(d(1))).toBe(true);
    expect(ehPendente(d(1, { resposta: undefined }))).toBe(true);
    expect(ehPendente(d(1, { resposta: "" }))).toBe(true);
    expect(ehPendente(d(1, { resposta: "Resposta" }))).toBe(false);
    expect(ehPendente(null)).toBe(true);
  });

  it("só espaços NÃO é pendente: o contador da aba (no banco) e o cartão dizem a mesma coisa (A6)", () => {
    // o banco só sabe separar nula e vazia ("resposta.is.null,resposta.eq."); uma conta diferente no cartão
    // deixaria o número do gatilho da aba diferente do número de cartões. A tela nunca grava só espaços.
    expect(ehPendente(d(1, { resposta: "   " }))).toBe(false);
    expect(ehPendente(d(1, { resposta: " \n " }))).toBe(false);
  });

  it("o filtro do banco para 'sem resposta' é nula ou vazia, e é o que a página usa", () => {
    expect(FILTRO_SEM_RESPOSTA).toBe("resposta.is.null,resposta.eq.");
    const pagina = readFileSync(new URL("../pages/SegurancaTrabalho.jsx", import.meta.url), "utf8");
    expect(pagina).toContain(".or(FILTRO_SEM_RESPOSTA)");
    // a contagem antiga (só nula, pelo SDK) não pode voltar
    expect(pagina).not.toMatch(/TreinamentoDuvida\.count\(/);
  });

  it("conta as pendentes, com ou sem recorte", () => {
    expect(contarPendentes(lista)).toBe(3); // 1, 3 e 5 (resposta só com espaços)
    expect(contarPendentes(lista, { cursoId: "curso-b" })).toBe(1);
    expect(contarPendentes(lista, { funcionarioId: "func-2" })).toBe(2);
    expect(contarPendentes(lista, { cursoId: "curso-a", funcionarioId: "func-2" })).toBe(1);
    expect(contarPendentes([])).toBe(0);
    expect(contarPendentes(null)).toBe(0);
  });
});

describe("decidirResposta e edicaoDepoisDeResponder (A6)", () => {
  const respondida = d(7, { resposta: "Resposta original" });

  it("dúvida sem resposta: 'responder' (grava direto, como sempre), com o texto sem as pontas", () => {
    expect(decidirResposta({ duvida: d(1), texto: "  Olá  \n", editando: null })).toEqual({
      acao: "responder",
      texto: "Olá",
    });
  });

  it("dúvida em edição: 'editar' (vai pelo servidor, que guarda a versão anterior na trilha)", () => {
    expect(
      decidirResposta({ duvida: respondida, texto: "Resposta corrigida", editando: 7 })
    ).toEqual({ acao: "editar", texto: "Resposta corrigida" });
  });

  it("a mesma resposta (fora os espaços das pontas) só fecha a edição, sem gravar nem avisar", () => {
    expect(
      decidirResposta({ duvida: respondida, texto: "  Resposta original ", editando: 7 })
    ).toEqual({ acao: "fechar_edicao" });
  });

  it("texto vazio não faz nada, em resposta nova e em edição", () => {
    for (const texto of ["", "  \n ", null, undefined]) {
      expect(decidirResposta({ duvida: d(1), texto, editando: null })).toEqual({ acao: "nada" });
      expect(decidirResposta({ duvida: respondida, texto, editando: 7 })).toEqual({
        acao: "nada",
      });
    }
  });

  it("responder a dúvida A enquanto a B está em edição grava A como resposta nova (não é edição)", () => {
    const r = decidirResposta({ duvida: d(1), texto: "Resposta de A", editando: 2 });
    expect(r.acao).toBe("responder");
  });

  it("responder uma dúvida só fecha a edição se for a MESMA que estava em edição", () => {
    expect(edicaoDepoisDeResponder(2, 1)).toBe(2); // editava a B, respondeu a A: B continua aberta
    expect(edicaoDepoisDeResponder(2, 2)).toBeNull(); // editava e salvou a própria B
    expect(edicaoDepoisDeResponder(null, 1)).toBeNull();
    expect(edicaoDepoisDeResponder(undefined, 1)).toBeNull();
  });

  it("o cartão grava a resposta nova direto e a edição pelo servidor, e só fecha a edição da própria dúvida", () => {
    const cartao = readFileSync(
      new URL("../components/seguranca/DuvidasTutorCard.jsx", import.meta.url),
      "utf8"
    );
    expect(cartao).toContain("decidirResposta({");
    expect(cartao).toContain("acessoPortal.editarRespostaDuvida(d.id, decisao.texto)");
    expect(cartao).toContain("sigo.entities.TreinamentoDuvida.update(d.id, {");
    expect(cartao).toContain("setEditando((atual) => edicaoDepoisDeResponder(atual, d.id))");
    // a forma antiga (fechar a edição de qualquer dúvida ao responder) não pode voltar
    const responder = /const responder = async[\s\S]*?\n {2}\};/.exec(cartao)?.[0] ?? "";
    expect(responder).not.toMatch(/\bcancelarEdicao\(\);\s*toast\.success/);
    // a edição que falha (conflito, sem permissão) mostra a mensagem do servidor e relê a lista se ficou velha
    expect(responder).toContain("falhaDaAcaoDoRH(e)");
  });
});

describe("filtrarDuvidas", () => {
  const ids = (r) => r.map((x) => x.id);

  it("por padrão só as pendentes, da mais nova para a mais antiga", () => {
    expect(ids(filtrarDuvidas(lista))).toEqual([5, 3, 1]);
  });

  it("'todas' traz também as respondidas", () => {
    expect(ids(filtrarDuvidas(lista, { mostrar: "todas" }))).toEqual([5, 4, 3, 2, 1]);
  });

  it("filtra por curso e por aluno, juntos ou separados", () => {
    expect(ids(filtrarDuvidas(lista, { mostrar: "todas", cursoId: "curso-b" }))).toEqual([4, 3]);
    expect(ids(filtrarDuvidas(lista, { mostrar: "todas", funcionarioId: "func-1" }))).toEqual([
      4, 2, 1,
    ]);
    expect(
      ids(filtrarDuvidas(lista, { cursoId: "curso-a", funcionarioId: "func-2", mostrar: "todas" }))
    ).toEqual([5]);
    expect(ids(filtrarDuvidas(lista, { cursoId: "curso-b", funcionarioId: "func-1" }))).toEqual([]);
  });

  it("filtro vazio ('') vale como 'todos'; não altera a lista recebida", () => {
    const copia = [...lista];
    expect(
      ids(filtrarDuvidas(lista, { cursoId: "", funcionarioId: "", mostrar: "todas" }))
    ).toEqual([5, 4, 3, 2, 1]);
    expect(lista).toEqual(copia);
    expect(filtrarDuvidas(null)).toEqual([]);
  });

  it("duas dúvidas no mesmo instante mantêm uma ordem estável", () => {
    const mesmas = [
      d(1, { created_at: "2026-10-01T12:00:00Z" }),
      d(2, { created_at: "2026-10-01T12:00:00Z" }),
    ];
    expect(ids(filtrarDuvidas(mesmas))).toEqual([1, 2]);
  });
});

describe("opcoesDoFiltro: só curso e aluno que têm dúvida, com o nome e o contador", () => {
  const nomeDoCurso = (id) => ({ "curso-a": "Curso A", "curso-b": "Curso B" })[id];
  const nomeDoFuncionario = (id) => ({ "func-1": "Ana Teste", "func-2": "Beto Teste" })[id];

  it("lista curso e aluno com total e pendentes, em ordem alfabética", () => {
    const o = opcoesDoFiltro(lista, { nomeDoCurso, nomeDoFuncionario });
    expect(o.cursos).toEqual([
      { id: "curso-a", nome: "Curso A", total: 3, pendentes: 2 },
      { id: "curso-b", nome: "Curso B", total: 2, pendentes: 1 },
    ]);
    expect(o.alunos).toEqual([
      { id: "func-1", nome: "Ana Teste", total: 3, pendentes: 1 },
      { id: "func-2", nome: "Beto Teste", total: 2, pendentes: 2 },
    ]);
  });

  it("nome que não se acha (aluno removido, curso apagado) vira um rótulo e não some", () => {
    const o = opcoesDoFiltro([d(1, { curso_id: "x", funcionario_id: "y" })], {
      nomeDoCurso: () => undefined,
      nomeDoFuncionario: () => undefined,
    });
    expect(o.cursos[0].nome).toBe("Curso removido");
    expect(o.alunos[0].nome).toBe("Aluno não encontrado");
  });
});

describe("textos do contador", () => {
  it("singular e plural", () => {
    expect(textoPendentes(0)).toBe("Nenhuma dúvida sem resposta");
    expect(textoPendentes(1)).toBe("1 dúvida sem resposta");
    expect(textoPendentes(7)).toBe("7 dúvidas sem resposta");
  });

  it("o gatilho da aba só ganha número quando há dúvida sem resposta", () => {
    expect(rotuloDaAbaTreinamentos(0)).toBe("Treinamentos");
    expect(rotuloDaAbaTreinamentos(undefined)).toBe("Treinamentos");
    expect(rotuloDaAbaTreinamentos(null)).toBe("Treinamentos");
    expect(rotuloDaAbaTreinamentos(3)).toBe("Treinamentos (3)");
    // o contador é limitado: milhares não cabem no gatilho
    expect(rotuloDaAbaTreinamentos(150)).toBe("Treinamentos (99+)");
  });
});
