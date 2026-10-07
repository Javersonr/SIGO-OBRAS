import { describe, it, expect } from "vitest";
import {
  reordenarAulas,
  matriculasNovas,
  podeRemoverMatricula,
  MSG_REVOGUE_ANTES,
  textoConfirmarRemocao,
  novoRascunho,
  mesmoFormulario,
  formularioDeAulaSegueOMesmo,
  criarControleDeCarga,
  certificadosPorMatricula,
  erroDeMatricula,
  MSG_MATRICULA_JA_ABERTA,
} from "./ead-gestao";

const aula = (id, ordem) => ({ id, ordem });

describe("reordenarAulas", () => {
  it("troca duas aulas vizinhas e só grava as duas que mudaram", () => {
    const r = reordenarAulas([aula("a", 1), aula("b", 2), aula("c", 3)], "b", -1);
    expect(r.ids).toEqual(["b", "a", "c"]);
    expect(r.mudancas).toEqual([
      { id: "b", ordem: 1 },
      { id: "a", ordem: 2 },
    ]);
  });

  it("desce a aula uma posição", () => {
    const r = reordenarAulas([aula("a", 1), aula("b", 2), aula("c", 3)], "b", 1);
    expect(r.ids).toEqual(["a", "c", "b"]);
    expect(r.mudancas).toEqual([
      { id: "c", ordem: 2 },
      { id: "b", ordem: 3 },
    ]);
  });

  it("renumera 1..n quando a lista tem buracos (aula removida antes)", () => {
    const r = reordenarAulas([aula("a", 1), aula("b", 4), aula("c", 9)], "c", -1);
    expect(r.ids).toEqual(["a", "c", "b"]);
    expect(r.mudancas).toEqual([
      { id: "c", ordem: 2 },
      { id: "b", ordem: 3 },
    ]);
  });

  it("desfaz empate de ordem: aulas com a mesma ordem ficam 1..n", () => {
    const r = reordenarAulas([aula("a", 2), aula("b", 2), aula("c", 2)], "c", -1);
    expect(r.ids).toEqual(["a", "c", "b"]);
    // "c" já tem ordem 2, a posição nova: não precisa gravar
    expect(r.mudancas).toEqual([
      { id: "a", ordem: 1 },
      { id: "b", ordem: 3 },
    ]);
  });

  it("trata ordem vazia ou texto como diferente da posição", () => {
    const r = reordenarAulas([aula("a", null), aula("b", "2")], "b", -1);
    expect(r.ids).toEqual(["b", "a"]);
    expect(r.mudancas).toEqual([
      { id: "b", ordem: 1 },
      { id: "a", ordem: 2 },
    ]);
  });

  it("não move a primeira para cima nem a última para baixo", () => {
    const lista = [aula("a", 1), aula("b", 2)];
    expect(reordenarAulas(lista, "a", -1)).toBeNull();
    expect(reordenarAulas(lista, "b", 1)).toBeNull();
  });

  it("recusa aula inexistente, sentido inválido e lista inválida", () => {
    const lista = [aula("a", 1), aula("b", 2)];
    expect(reordenarAulas(lista, "x", 1)).toBeNull();
    expect(reordenarAulas(lista, "a", 0)).toBeNull();
    expect(reordenarAulas(lista, "a", 2)).toBeNull();
    expect(reordenarAulas(lista, "a", 0.5)).toBeNull();
    expect(reordenarAulas(null, "a", 1)).toBeNull();
    expect(reordenarAulas([], "a", 1)).toBeNull();
  });

  it("não altera a lista recebida", () => {
    const lista = [aula("a", 1), aula("b", 2)];
    reordenarAulas(lista, "b", -1);
    expect(lista).toEqual([aula("a", 1), aula("b", 2)]);
  });
});

describe("matriculasNovas", () => {
  const base = { empresaId: "emp", cursoId: "c1" };

  it("monta as matrículas pendentes, todas com o mesmo conjunto de chaves", () => {
    const r = matriculasNovas({ ...base, matriculas: [], funcionarioIds: ["f1", "f2"] });
    expect(r.novas).toEqual([
      {
        empresa_id: "emp",
        curso_id: "c1",
        funcionario_id: "f1",
        status: "pendente",
        tipo: "inicial",
        motivo_eventual: null,
      },
      {
        empresa_id: "emp",
        curso_id: "c1",
        funcionario_id: "f2",
        status: "pendente",
        tipo: "inicial",
        motivo_eventual: null,
      },
    ]);
    expect(r.ignorados).toBe(0);
    expect(new Set(r.novas.map((n) => Object.keys(n).join())).size).toBe(1);
  });

  it("ignora quem já está matriculado no curso e ainda não concluiu", () => {
    const matriculas = [
      { curso_id: "c1", funcionario_id: "f1", status: "pendente" },
      { curso_id: "c1", funcionario_id: "f2", status: "em_andamento" },
    ];
    const r = matriculasNovas({ ...base, matriculas, funcionarioIds: ["f1", "f2", "f3"] });
    expect(r.novas.map((n) => n.funcionario_id)).toEqual(["f3"]);
    expect(r.ignorados).toBe(2);
  });

  it("deixa rematricular quem já concluiu o curso (renovação)", () => {
    const matriculas = [{ curso_id: "c1", funcionario_id: "f1", status: "concluido" }];
    const r = matriculasNovas({ ...base, matriculas, funcionarioIds: ["f1"] });
    expect(r.novas.map((n) => n.funcionario_id)).toEqual(["f1"]);
    expect(r.ignorados).toBe(0);
  });

  it("matrícula em outro curso não conta", () => {
    const matriculas = [{ curso_id: "c2", funcionario_id: "f1", status: "pendente" }];
    const r = matriculasNovas({ ...base, matriculas, funcionarioIds: ["f1"] });
    expect(r.novas).toHaveLength(1);
  });

  it("não repete o funcionário selecionado duas vezes", () => {
    const r = matriculasNovas({ ...base, matriculas: [], funcionarioIds: ["f1", "f1", "f2"] });
    expect(r.novas.map((n) => n.funcionario_id)).toEqual(["f1", "f2"]);
    expect(r.ignorados).toBe(0);
  });

  it("tolera entradas vazias", () => {
    expect(matriculasNovas({ ...base, matriculas: null, funcionarioIds: null })).toEqual({
      novas: [],
      ignorados: 0,
    });
  });

  describe("tipo do treinamento (T23)", () => {
    const concluida = { curso_id: "c1", funcionario_id: "f1", status: "concluido" };

    it("sem escolha vale o automático: periódico para quem já concluiu o curso, inicial para os outros", () => {
      const r = matriculasNovas({
        ...base,
        matriculas: [concluida],
        funcionarioIds: ["f1", "f2"],
      });
      expect(r.novas.map((n) => [n.funcionario_id, n.tipo, n.motivo_eventual])).toEqual([
        ["f1", "periodico", null],
        ["f2", "inicial", null],
      ]);
    });

    it("a escolha do RH vale para todos, e só o eventual leva o motivo", () => {
      const comTipo = (tipo, motivo) =>
        matriculasNovas({
          ...base,
          matriculas: [concluida],
          funcionarioIds: ["f1", "f2"],
          tipo,
          motivo,
        }).novas.map((n) => [n.tipo, n.motivo_eventual]);
      expect(comTipo("inicial", "sobrou")).toEqual([
        ["inicial", null],
        ["inicial", null],
      ]);
      expect(comTipo("periodico", null)).toEqual([
        ["periodico", null],
        ["periodico", null],
      ]);
      expect(comTipo("eventual", "Mudança de procedimento")).toEqual([
        ["eventual", "Mudança de procedimento"],
        ["eventual", "Mudança de procedimento"],
      ]);
    });

    it("todas as linhas levam as mesmas chaves, também no eventual (o bulkCreate exige)", () => {
      const r = matriculasNovas({
        ...base,
        matriculas: [],
        funcionarioIds: ["f1", "f2"],
        tipo: "eventual",
        motivo: "Retorno de afastamento",
      });
      expect(new Set(r.novas.map((n) => Object.keys(n).sort().join())).size).toBe(1);
      expect(Object.keys(r.novas[0]).sort()).toEqual([
        "curso_id",
        "empresa_id",
        "funcionario_id",
        "motivo_eventual",
        "status",
        "tipo",
      ]);
    });

    it("quem já tem matrícula aberta continua ignorado, qualquer que seja o tipo", () => {
      const r = matriculasNovas({
        ...base,
        matriculas: [{ curso_id: "c1", funcionario_id: "f1", status: "pendente" }],
        funcionarioIds: ["f1"],
        tipo: "eventual",
        motivo: "Ocorrência",
      });
      expect(r).toEqual({ novas: [], ignorados: 1 });
    });
  });
});

describe("podeRemoverMatricula (T20)", () => {
  const mat = { id: "m1", status: "concluido" };
  const certValido = { id: "c1", matricula_id: "m1", codigo: "AAAA-BBBB-CCCC", revogado_em: null };
  const certRevogado = { ...certValido, revogado_em: "2026-10-01T12:00:00Z" };

  it("bloqueia quando o certificado está emitido e não foi revogado", () => {
    expect(podeRemoverMatricula(mat, certValido)).toBe(false);
  });

  it("libera quando o certificado já foi revogado", () => {
    expect(podeRemoverMatricula(mat, certRevogado)).toBe(true);
  });

  it("libera quando não há certificado (curso em andamento ou concluído sem assinatura)", () => {
    expect(podeRemoverMatricula({ id: "m2", status: "em_andamento" }, null)).toBe(true);
    expect(podeRemoverMatricula({ id: "m3", status: "pendente" }, undefined)).toBe(true);
    expect(podeRemoverMatricula(mat, undefined)).toBe(true);
  });

  it("trata revogado_em ausente como certificado válido (não revogado)", () => {
    expect(podeRemoverMatricula(mat, { id: "c1", matricula_id: "m1" })).toBe(false);
  });

  it("sem matrícula não há o que remover", () => {
    expect(podeRemoverMatricula(null, null)).toBe(false);
    expect(podeRemoverMatricula(undefined, certRevogado)).toBe(false);
  });

  it("a mensagem de bloqueio manda revogar antes e diz onde", () => {
    expect(MSG_REVOGUE_ANTES).toMatch(/revogue/i);
    expect(MSG_REVOGUE_ANTES).toMatch(/certificado/i);
    expect(MSG_REVOGUE_ANTES).toMatch(/revogar/i);
  });
});

describe("textoConfirmarRemocao (T20)", () => {
  const base = { nomeFuncionario: "Fulano de Tal", nomeCurso: "NR-10 Básico" };

  it("cita o funcionário e o curso", () => {
    const t = textoConfirmarRemocao({ ...base, matricula: { status: "pendente" } });
    expect(t).toContain("Fulano de Tal");
    expect(t).toContain("NR-10 Básico");
  });

  it("sempre diz o que acontece com progresso, tentativas e nova matrícula", () => {
    for (const status of ["pendente", "em_andamento", "concluido"]) {
      const t = textoConfirmarRemocao({ ...base, matricula: { status } });
      expect(t).toMatch(/progresso/i);
      expect(t).toMatch(/tentativas/i);
      expect(t).toMatch(/portal/i);
      expect(t).toMatch(/do zero/i);
    }
  });

  it("curso em andamento: avisa que o andamento deixa de aparecer", () => {
    const t = textoConfirmarRemocao({ ...base, matricula: { status: "em_andamento" } });
    expect(t).toMatch(/em andamento/i);
  });

  it("curso ainda não iniciado: diz que ele não começou", () => {
    const t = textoConfirmarRemocao({ ...base, matricula: { status: "pendente" } });
    expect(t).toMatch(/ainda não iniciou/i);
  });

  it("concluído sem certificado: avisa que perde a conclusão e não poderá assinar", () => {
    const t = textoConfirmarRemocao({ ...base, matricula: { status: "concluido" } });
    expect(t).toMatch(/concluiu/i);
    expect(t).toMatch(/não assinou/i);
    expect(t).toMatch(/não poderá/i);
  });

  it("certificado revogado: diz que ele segue como revogado na consulta pública", () => {
    const t = textoConfirmarRemocao({
      ...base,
      matricula: { status: "concluido" },
      certificado: { revogado_em: "2026-10-01T12:00:00Z" },
    });
    expect(t).toMatch(/revogado/i);
    expect(t).toMatch(/consulta pública/i);
    expect(t).not.toMatch(/não assinou/i);
  });

  it("tolera nome e curso ausentes", () => {
    const t = textoConfirmarRemocao({ matricula: { status: "pendente" } });
    expect(t).toContain("este funcionário");
    expect(t).toContain("este curso");
  });
});

describe("novoRascunho", () => {
  it("copia os dados e acrescenta um token de rascunho", () => {
    const r = novoRascunho({ nome: "", ativo: false });
    expect(r).toMatchObject({ nome: "", ativo: false });
    expect(typeof r.rascunho).toBe("string");
    expect(r.rascunho).not.toBe("");
  });

  it("cada rascunho tem um token diferente (dois formulários abertos em sequência não se confundem)", () => {
    const tokens = new Set(Array.from({ length: 50 }, () => novoRascunho().rascunho));
    expect(tokens.size).toBe(50);
  });

  it("não altera o objeto original", () => {
    const base = { nome: "NR-10" };
    novoRascunho(base);
    expect(base).toEqual({ nome: "NR-10" });
  });
});

describe("mesmoFormulario", () => {
  it("rascunho sem id: o mesmo token é o mesmo formulário, mesmo depois de editar campos", () => {
    const aberto = novoRascunho({ nome: "" });
    const editado = { ...aberto, nome: "NR-35", validade_meses: "24" };
    expect(mesmoFormulario(editado, aberto)).toBe(true);
  });

  it("rascunho sem id: outro rascunho (token diferente) NÃO é o mesmo formulário", () => {
    // o RH fechou o painel durante a gravação e abriu outro curso novo
    expect(mesmoFormulario(novoRascunho({ nome: "B" }), novoRascunho({ nome: "A" }))).toBe(false);
  });

  it("registro em edição: vale o id, e outro registro não é o mesmo", () => {
    expect(mesmoFormulario({ id: "a1", titulo: "novo texto" }, { id: "a1", titulo: "texto" })).toBe(
      true
    );
    expect(mesmoFormulario({ id: "a2" }, { id: "a1" })).toBe(false);
  });

  it("um rascunho nunca é o mesmo que um registro já gravado, nem o contrário", () => {
    const rascunho = novoRascunho({});
    expect(mesmoFormulario({ id: "a1" }, rascunho)).toBe(false);
    expect(mesmoFormulario(rascunho, { id: "a1" })).toBe(false);
  });

  it("rascunho que já recebeu o id gravado deixa de ser o rascunho (não enxerta duas vezes)", () => {
    const rascunho = novoRascunho({ nome: "A" });
    const gravado = { ...rascunho, id: "c1" };
    expect(mesmoFormulario(gravado, rascunho)).toBe(false);
  });

  it("painel fechado (null/undefined) nunca é o mesmo formulário", () => {
    const rascunho = novoRascunho({});
    expect(mesmoFormulario(null, rascunho)).toBe(false);
    expect(mesmoFormulario(undefined, { id: "a1" })).toBe(false);
  });

  it("formulário sem id e sem token (não dá para identificar) nunca confere", () => {
    expect(mesmoFormulario({ nome: "A" }, { nome: "A" })).toBe(false);
    expect(mesmoFormulario(null, null)).toBe(false);
  });
});

describe("criarControleDeCarga", () => {
  it("sem empresa ativa não inicia carga (evita consultar com empresa indefinida)", () => {
    const c = criarControleDeCarga();
    expect(c.iniciar()).toBeNull();
    c.definirEmpresa(undefined);
    expect(c.iniciar()).toBeNull();
    c.definirEmpresa("");
    expect(c.iniciar()).toBeNull();
  });

  it("a carga nasce presa à empresa ativa NA HORA de iniciar, não à de um render antigo", () => {
    const c = criarControleDeCarga();
    c.definirEmpresa("emp-a");
    // uma gravação lenta de A chama `recarregar` do render antigo depois da troca para B
    c.definirEmpresa("emp-b");
    const carga = c.iniciar();
    expect(carga.empresaId).toBe("emp-b");
    expect(c.vale(carga)).toBe(true);
  });

  it("carga em andamento deixa de valer quando a empresa ativa muda", () => {
    const c = criarControleDeCarga();
    c.definirEmpresa("emp-a");
    const carga = c.iniciar();
    c.definirEmpresa("emp-b");
    expect(c.vale(carga)).toBe(false);
  });

  it("voltar para a mesma empresa não faz valer uma carga de antes (a mais nova é que vale)", () => {
    const c = criarControleDeCarga();
    c.definirEmpresa("emp-a");
    const antiga = c.iniciar();
    c.definirEmpresa("emp-b");
    const nova = c.iniciar();
    c.definirEmpresa("emp-a");
    expect(c.vale(antiga)).toBe(false);
    expect(c.vale(nova)).toBe(false);
  });

  it("a carga mais nova substitui a anterior da mesma empresa", () => {
    const c = criarControleDeCarga();
    c.definirEmpresa("emp-a");
    const primeira = c.iniciar();
    const segunda = c.iniciar();
    expect(c.vale(primeira)).toBe(false);
    expect(c.vale(segunda)).toBe(true);
  });

  it("descartarPendentes invalida as cargas já iniciadas (a gravação atualizou a tela sozinha)", () => {
    const c = criarControleDeCarga();
    c.definirEmpresa("emp-a");
    const carga = c.iniciar();
    c.descartarPendentes();
    expect(c.vale(carga)).toBe(false);
    expect(c.vale(c.iniciar())).toBe(true);
  });

  it("repetir a mesma empresa a cada render não invalida a carga em andamento", () => {
    const c = criarControleDeCarga();
    c.definirEmpresa("emp-a");
    const carga = c.iniciar();
    c.definirEmpresa("emp-a");
    c.definirEmpresa("emp-a");
    expect(c.vale(carga)).toBe(true);
  });

  it("carga nula ou sem número nunca vale", () => {
    const c = criarControleDeCarga();
    c.definirEmpresa("emp-a");
    expect(c.vale(null)).toBe(false);
    expect(c.vale(undefined)).toBe(false);
    expect(c.vale({})).toBe(false);
  });

  it("mesmaEmpresa confere o id com a empresa ativa agora (resultado de consulta avulsa)", () => {
    const c = criarControleDeCarga();
    c.definirEmpresa("emp-a");
    expect(c.mesmaEmpresa("emp-a")).toBe(true);
    expect(c.mesmaEmpresa("emp-b")).toBe(false);
    expect(c.mesmaEmpresa(undefined)).toBe(false);
    c.definirEmpresa("emp-b");
    expect(c.mesmaEmpresa("emp-a")).toBe(false);
  });

  it("empresaAtual devolve a empresa ativa agora", () => {
    const c = criarControleDeCarga();
    expect(c.empresaAtual()).toBeNull();
    c.definirEmpresa("emp-a");
    expect(c.empresaAtual()).toBe("emp-a");
  });
});

describe("certificadosPorMatricula", () => {
  it("indexa os certificados pelo id da matrícula (uma consulta por linha da tabela, sem find)", () => {
    const mapa = certificadosPorMatricula([
      { id: "c1", matricula_id: "m1", codigo: "A" },
      { id: "c2", matricula_id: "m2", codigo: "B" },
    ]);
    expect(mapa.get("m1").codigo).toBe("A");
    expect(mapa.get("m2").codigo).toBe("B");
    expect(mapa.get("m3")).toBeUndefined();
  });

  it("havendo mais de um para a mesma matrícula, vale o primeiro (como o find que ele substitui)", () => {
    const mapa = certificadosPorMatricula([
      { id: "c1", matricula_id: "m1" },
      { id: "c2", matricula_id: "m1" },
    ]);
    expect(mapa.get("m1").id).toBe("c1");
  });

  it("ignora entradas inválidas e aceita lista ausente", () => {
    expect(certificadosPorMatricula(undefined).size).toBe(0);
    expect(certificadosPorMatricula(null).size).toBe(0);
    const mapa = certificadosPorMatricula([null, {}, { id: "c1", matricula_id: null }]);
    expect(mapa.size).toBe(0);
  });
});

describe("formularioDeAulaSegueOMesmo (depois do envio lento de uma aula, A2)", () => {
  const cursoA = { id: "curso-a", nome: "Curso A" };
  const cursoB = { id: "curso-b", nome: "Curso B" };

  it("mesma empresa e o mesmo curso ainda aberto: o formulário da aula enviada pode ser limpo", () => {
    expect(
      formularioDeAulaSegueOMesmo({
        mesmaEmpresa: true,
        // o RH segue digitando no curso A (o objeto mudou, o id é o mesmo)
        cursoAberto: { ...cursoA, nome: "Curso A (editado)" },
        cursoDoEnvio: cursoA,
      })
    ).toBe(true);
  });

  it("o RH abriu OUTRO curso durante o envio: o que ele digitou lá não pode ser apagado", () => {
    expect(
      formularioDeAulaSegueOMesmo({ mesmaEmpresa: true, cursoAberto: cursoB, cursoDoEnvio: cursoA })
    ).toBe(false);
  });

  it("o painel foi fechado durante o envio: não há formulário a limpar", () => {
    expect(
      formularioDeAulaSegueOMesmo({ mesmaEmpresa: true, cursoAberto: null, cursoDoEnvio: cursoA })
    ).toBe(false);
    expect(
      formularioDeAulaSegueOMesmo({
        mesmaEmpresa: true,
        cursoAberto: undefined,
        cursoDoEnvio: cursoA,
      })
    ).toBe(false);
  });

  it("a empresa mudou durante o envio: o formulário já é de outra empresa, mesmo com o mesmo id", () => {
    expect(
      formularioDeAulaSegueOMesmo({
        mesmaEmpresa: false,
        cursoAberto: cursoA,
        cursoDoEnvio: cursoA,
      })
    ).toBe(false);
  });

  it("curso novo ainda sem id (rascunho) não identifica o formulário: nunca confere", () => {
    const rascunho = novoRascunho({ nome: "Novo" });
    expect(
      formularioDeAulaSegueOMesmo({
        mesmaEmpresa: true,
        cursoAberto: rascunho,
        cursoDoEnvio: rascunho,
      })
    ).toBe(true); // o mesmo rascunho (token) ainda aberto vale
    expect(
      formularioDeAulaSegueOMesmo({
        mesmaEmpresa: true,
        cursoAberto: novoRascunho({ nome: "Outro" }),
        cursoDoEnvio: rascunho,
      })
    ).toBe(false);
    expect(
      formularioDeAulaSegueOMesmo({
        mesmaEmpresa: true,
        cursoAberto: { nome: "sem id nem token" },
        cursoDoEnvio: { nome: "sem id nem token" },
      })
    ).toBe(false);
  });

  it("aceita a consulta da empresa que o controle de carga faz (mesmaEmpresa)", () => {
    const cargas = criarControleDeCarga();
    cargas.definirEmpresa("empresa-1");
    const doEnvio = cargas.mesmaEmpresa("empresa-1");
    cargas.definirEmpresa("empresa-2");
    expect(
      formularioDeAulaSegueOMesmo({
        mesmaEmpresa: cargas.mesmaEmpresa("empresa-1"),
        cursoAberto: cursoA,
        cursoDoEnvio: cursoA,
      })
    ).toBe(false);
    expect(doEnvio).toBe(true);
  });
});

describe("erroDeMatricula (A6): matrícula aberta repetida (23505) com mensagem clara", () => {
  it("23505 do índice único da matrícula aberta vira a mensagem da tela, guardando a causa", () => {
    const bruto = {
      code: "23505",
      message: 'duplicate key value violates unique constraint "treinamento_matricula_viva_uidx"',
      details: "Key (funcionario_id, curso_id)=(...) already exists.",
    };
    const erro = erroDeMatricula(bruto);
    expect(erro).toBeInstanceOf(Error);
    expect(erro.message).toBe(MSG_MATRICULA_JA_ABERTA);
    expect(erro.message).toMatch(/já tem uma matrícula aberta/i);
    expect(erro.message).toMatch(/lista foi atualizada/i);
    expect(erro.message).not.toMatch(/duplicate key|unique constraint|23505/i);
    expect(erro.cause).toBe(bruto);
  });

  it("reconhece pela mensagem quando o código não vem (erro de rede reescrito, proxy)", () => {
    const erro = erroDeMatricula(new Error('duplicate key value violates unique constraint "x"'));
    expect(erro.message).toBe(MSG_MATRICULA_JA_ABERTA);
  });

  it("qualquer outro erro passa como veio (a tela mostra a mensagem dele)", () => {
    const outro = { code: "42501", message: "permission denied for table treinamento_matricula" };
    expect(erroDeMatricula(outro)).toBe(outro);
    const rede = new Error("Failed to fetch");
    expect(erroDeMatricula(rede)).toBe(rede);
    expect(erroDeMatricula(null)).toBeNull();
    expect(erroDeMatricula(undefined)).toBeUndefined();
  });
});
