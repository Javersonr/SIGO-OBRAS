import { describe, it, expect } from "vitest";
import {
  avisoDoCursoExigido,
  comLeituraFrescaDoPreRequisito,
  cursoExigidoDe,
  cursosQuePodemSerPreRequisito,
  motivoDoBloqueioNaMatricula,
  preRequisitoFechariaCiclo,
  resumoDosBloqueios,
  separarPorPreRequisito,
  situacaoDoPreRequisito,
  situacaoDoPreRequisitoDoFuncionario,
} from "./ead-pre-requisito";

// Só dados sintéticos. O espelho do servidor (supabase/functions/portal-funcionario/pre-requisito.ts) é conferido
// contra esta regra em pre-requisito.test.ts: aqui ficam a regra da tela do RH e o que é só da tela.

const HOJE = "2026-10-07";
const BASICO = { id: "c-basico", nome: "NR-10 Básico", modalidade: "ead" };
const SEP = {
  id: "c-sep",
  nome: "NR-10 SEP",
  modalidade: "ead",
  pre_requisito_curso_id: "c-basico",
};
const CURSOS = [BASICO, SEP, { id: "c-outro", nome: "NR-35", modalidade: "ead" }];

const concluida = (extra = {}) => ({
  id: "m1",
  funcionario_id: "f1",
  curso_id: "c-basico",
  status: "concluido",
  proxima_renovacao: "2028-10-07",
  deleted_at: null,
  ...extra,
});
const nova = (extra = {}) => ({
  empresa_id: "e1",
  curso_id: "c-sep",
  funcionario_id: "f1",
  status: "pendente",
  tipo: "inicial",
  motivo_eventual: null,
  ...extra,
});

describe("a leitura fresca do pré-requisito troca o que a tela sabia daquele par (A6, T23)", () => {
  const certificado = (extra = {}) => ({
    id: "k1",
    matricula_id: "m1",
    revogado_em: null,
    ...extra,
  });

  it("a tela achava que o Básico estava aberto; o banco já diz concluído: vale o banco", () => {
    const velha = { id: "m1", funcionario_id: "f1", curso_id: "c-basico", status: "em_andamento" };
    const fresca = { ...velha, status: "concluido", proxima_renovacao: "2027-10-01" };
    const outraPessoa = {
      id: "m9",
      funcionario_id: "f2",
      curso_id: "c-basico",
      status: "concluido",
    };
    const outroCurso = { id: "m8", funcionario_id: "f1", curso_id: "c-outro", status: "concluido" };
    const r = comLeituraFrescaDoPreRequisito({
      matriculas: [velha, outraPessoa, outroCurso],
      certificados: [certificado({ matricula_id: "m9", id: "k9" }), certificado({ id: "k-velho" })],
      funcionarioId: "f1",
      cursoId: "c-basico",
      matriculasFrescas: [fresca],
      certificadosFrescos: [certificado({ id: "k-novo", revogado_em: "2026-10-05T00:00:00Z" })],
    });
    expect(r.matriculas.map((m) => m.id).sort()).toEqual(["m1", "m8", "m9"]);
    expect(r.matriculas.find((m) => m.id === "m1").status).toBe("concluido");
    // o certificado velho do par sai; o de outra pessoa fica; o fresco entra
    expect(r.certificados.map((c) => c.id).sort()).toEqual(["k-novo", "k9"]);
    // e a regra enxerga a revogação que a tela ainda não sabia
    const nova = { funcionario_id: "f1", curso_id: "c-sep" };
    const { liberadas, bloqueadas } = separarPorPreRequisito({
      novas: [nova],
      cursos: CURSOS,
      matriculas: r.matriculas,
      certificados: r.certificados,
      hoje: HOJE,
    });
    expect(liberadas).toEqual([]);
    expect(bloqueadas[0].motivo).toBe("revogado");
  });

  it("sem nada fresco no par (matrícula apagada), o par fica vazio: o pré-requisito não é atendido", () => {
    const velha = { id: "m1", funcionario_id: "f1", curso_id: "c-basico", status: "concluido" };
    const r = comLeituraFrescaDoPreRequisito({
      matriculas: [velha],
      certificados: [certificado()],
      funcionarioId: "f1",
      cursoId: "c-basico",
      matriculasFrescas: [],
      certificadosFrescos: [],
    });
    expect(r).toEqual({ matriculas: [], certificados: [] });
  });

  it("entrada nula não derruba", () => {
    expect(comLeituraFrescaDoPreRequisito({ funcionarioId: "f1", cursoId: "c-basico" })).toEqual({
      matriculas: [],
      certificados: [],
    });
  });
});

describe("situacaoDoPreRequisito (a regra, igual à do servidor)", () => {
  const situacao = (p) =>
    situacaoDoPreRequisito({
      curso: BASICO,
      matriculas: [],
      revogadas: new Set(),
      hoje: HOJE,
      ...p,
    });

  it("concluído e dentro da validade atende; no último dia ainda vale; sem validade vale sempre", () => {
    expect(situacao({ matriculas: [concluida()] })).toEqual({
      atendido: true,
      motivo: "concluido",
    });
    expect(situacao({ matriculas: [concluida({ proxima_renovacao: HOJE })] }).atendido).toBe(true);
    expect(situacao({ matriculas: [concluida({ proxima_renovacao: null })] }).atendido).toBe(true);
  });

  it("vencido, revogado, ainda aberto e sem matrícula não atendem, cada um com o seu motivo", () => {
    expect(situacao({ matriculas: [concluida({ proxima_renovacao: "2026-10-06" })] })).toEqual({
      atendido: false,
      motivo: "vencido",
    });
    expect(situacao({ matriculas: [concluida()], revogadas: new Set(["m1"]) })).toEqual({
      atendido: false,
      motivo: "revogado",
    });
    expect(situacao({ matriculas: [concluida({ status: "em_andamento" })] })).toEqual({
      atendido: false,
      motivo: "em_andamento",
    });
    expect(situacao({ matriculas: [] })).toEqual({ atendido: false, motivo: "sem_matricula" });
    expect(
      situacao({ matriculas: [concluida({ deleted_at: "2026-10-01T00:00:00Z" })] }).motivo
    ).toBe("sem_matricula");
  });

  it("uma conclusão válida basta, mesmo com outra vencida ou revogada ao lado", () => {
    const antiga = concluida({ id: "m0", proxima_renovacao: "2026-01-01" });
    const revogada = concluida({ id: "m00" });
    expect(
      situacao({
        matriculas: [antiga, revogada, concluida({ id: "m2" })],
        revogadas: new Set(["m00"]),
      }).atendido
    ).toBe(true);
  });

  it("curso exigido que sumiu, foi excluído ou nunca emite certificado falha fechado", () => {
    expect(situacao({ curso: null, matriculas: [concluida()] }).motivo).toBe("curso_excluido");
    expect(
      situacao({
        curso: { ...BASICO, deleted_at: "2026-10-01T00:00:00Z" },
        matriculas: [concluida()],
      }).motivo
    ).toBe("curso_excluido");
    expect(
      situacao({ curso: { ...BASICO, modalidade: "apoio" }, matriculas: [concluida()] }).motivo
    ).toBe("curso_sem_certificado");
  });
});

describe("situacaoDoPreRequisitoDoFuncionario (o que a tela do RH tem em mãos)", () => {
  it("usa as matrículas e os certificados da empresa, só do funcionário e do curso exigido", () => {
    const r = situacaoDoPreRequisitoDoFuncionario({
      curso: SEP,
      cursos: CURSOS,
      funcionarioId: "f1",
      matriculas: [
        concluida({ funcionario_id: "f2" }), // de outra pessoa
        concluida({ id: "m9", curso_id: "c-outro" }), // de outro curso
      ],
      certificados: [],
      hoje: HOJE,
    });
    expect(r.atendido).toBe(false);
    expect(r.motivo).toBe("sem_matricula");
    expect(
      situacaoDoPreRequisitoDoFuncionario({
        curso: SEP,
        cursos: CURSOS,
        funcionarioId: "f1",
        matriculas: [concluida()],
        certificados: [{ matricula_id: "m1", revogado_em: "2026-10-02T00:00:00Z" }],
        hoje: HOJE,
      }).motivo
    ).toBe("revogado");
  });

  it("curso sem pré-requisito: não há o que conferir (null)", () => {
    expect(
      situacaoDoPreRequisitoDoFuncionario({
        curso: BASICO,
        cursos: CURSOS,
        funcionarioId: "f1",
        matriculas: [],
        certificados: [],
        hoje: HOJE,
      })
    ).toBeNull();
  });
});

describe("cursoExigidoDe", () => {
  it("acha o curso exigido na lista; sem vínculo é null; vínculo para curso que não está na lista é 'sumido'", () => {
    expect(cursoExigidoDe(SEP, CURSOS)).toEqual({ id: "c-basico", curso: BASICO });
    expect(cursoExigidoDe(BASICO, CURSOS)).toBeNull();
    expect(cursoExigidoDe({ ...SEP, pre_requisito_curso_id: "c-fantasma" }, CURSOS)).toEqual({
      id: "c-fantasma",
      curso: null,
    });
  });
});

describe("separarPorPreRequisito (a matrícula é recusada para quem não tem o curso exigido)", () => {
  const entrada = (extra = {}) => ({
    novas: [nova()],
    cursos: CURSOS,
    matriculas: [],
    certificados: [],
    hoje: HOJE,
    ...extra,
  });

  it("quem concluiu o curso exigido é liberado", () => {
    const r = separarPorPreRequisito(entrada({ matriculas: [concluida()] }));
    expect(r.liberadas).toHaveLength(1);
    expect(r.bloqueadas).toEqual([]);
  });

  it("quem não o concluiu é bloqueado, com o curso, o pré-requisito e o motivo", () => {
    const r = separarPorPreRequisito(entrada());
    expect(r.liberadas).toEqual([]);
    expect(r.bloqueadas).toEqual([
      {
        nova: nova(),
        funcionarioId: "f1",
        cursoId: "c-sep",
        cursoNome: "NR-10 SEP",
        preRequisitoId: "c-basico",
        preRequisitoNome: "NR-10 Básico",
        motivo: "sem_matricula",
      },
    ]);
  });

  it("matrícula nova num curso sem pré-requisito sempre passa", () => {
    const r = separarPorPreRequisito(entrada({ novas: [nova({ curso_id: "c-outro" })] }));
    expect(r.liberadas).toHaveLength(1);
  });

  it("separa o lote: libera quem tem e bloqueia quem não tem, na mesma lista", () => {
    const r = separarPorPreRequisito(
      entrada({
        novas: [nova({ funcionario_id: "f1" }), nova({ funcionario_id: "f2" })],
        matriculas: [concluida({ funcionario_id: "f1" })],
      })
    );
    expect(r.liberadas.map((n) => n.funcionario_id)).toEqual(["f1"]);
    expect(r.bloqueadas.map((b) => b.funcionarioId)).toEqual(["f2"]);
  });

  it("pré-requisito vencido ou revogado bloqueia (a conclusão antiga não vale)", () => {
    const vencida = separarPorPreRequisito(
      entrada({ matriculas: [concluida({ proxima_renovacao: "2026-10-06" })] })
    );
    expect(vencida.bloqueadas[0].motivo).toBe("vencido");
    const revogada = separarPorPreRequisito(
      entrada({
        matriculas: [concluida()],
        certificados: [{ matricula_id: "m1", revogado_em: "2026-10-02T00:00:00Z" }],
      })
    );
    expect(revogada.bloqueadas[0].motivo).toBe("revogado");
  });

  it("curso exigido que não está na lista (excluído) bloqueia, sem inventar nome", () => {
    const r = separarPorPreRequisito(
      entrada({ cursos: [{ ...SEP, pre_requisito_curso_id: "c-fantasma" }] })
    );
    expect(r.bloqueadas[0].motivo).toBe("curso_excluido");
    expect(r.bloqueadas[0].preRequisitoNome).toBe("");
  });

  it("lista vazia ou sem nada para conferir não quebra", () => {
    expect(separarPorPreRequisito(entrada({ novas: [] }))).toEqual({
      liberadas: [],
      bloqueadas: [],
    });
    expect(separarPorPreRequisito({ novas: [nova()], hoje: HOJE })).toEqual({
      liberadas: [nova()],
      bloqueadas: [],
    });
  });
});

describe("textos do bloqueio", () => {
  it("motivoDoBloqueioNaMatricula: uma explicação curta por motivo, todas diferentes", () => {
    const motivos = [
      "sem_matricula",
      "em_andamento",
      "vencido",
      "revogado",
      "curso_excluido",
      "curso_sem_certificado",
    ];
    const textos = motivos.map(motivoDoBloqueioNaMatricula);
    expect(new Set(textos).size).toBe(motivos.length);
    for (const t of textos) expect(t.length).toBeGreaterThan(8);
  });

  it("resumoDosBloqueios: agrupa por curso e pré-requisito, com o nome de quem falta", () => {
    const bloqueadas = [
      {
        funcionarioId: "f1",
        cursoNome: "NR-10 SEP",
        preRequisitoNome: "NR-10 Básico",
        motivo: "sem_matricula",
      },
      {
        funcionarioId: "f2",
        cursoNome: "NR-10 SEP",
        preRequisitoNome: "NR-10 Básico",
        motivo: "vencido",
      },
      { funcionarioId: "f3", cursoNome: "NR-35", preRequisitoNome: "NR-1", motivo: "em_andamento" },
    ];
    const nomes = { f1: "Aluno Um", f2: "Aluno Dois", f3: "Aluno Três" };
    const r = resumoDosBloqueios(bloqueadas, (id) => nomes[id]);
    expect(r).toHaveLength(2);
    expect(r[0].titulo).toBe('Para "NR-10 SEP" é preciso ter concluído "NR-10 Básico"');
    expect(r[0].pessoas).toEqual([
      {
        funcionarioId: "f1",
        nome: "Aluno Um",
        motivo: motivoDoBloqueioNaMatricula("sem_matricula"),
      },
      { funcionarioId: "f2", nome: "Aluno Dois", motivo: motivoDoBloqueioNaMatricula("vencido") },
    ]);
    expect(r[1].pessoas).toHaveLength(1);
    expect(resumoDosBloqueios([], () => "")).toEqual([]);
  });

  it("resumoDosBloqueios: pessoa sem nome cadastrado aparece como 'Funcionário'", () => {
    const r = resumoDosBloqueios(
      [{ funcionarioId: "f9", cursoNome: "A", preRequisitoNome: "B", motivo: "sem_matricula" }],
      () => undefined
    );
    expect(r[0].pessoas[0].nome).toBe("Funcionário");
  });
});

describe("escolha do pré-requisito na tela do curso", () => {
  const cursos = [
    { id: "a", nome: "A", modalidade: "ead" },
    { id: "b", nome: "B", modalidade: "ead", pre_requisito_curso_id: "a" },
    { id: "c", nome: "C", modalidade: "ead", pre_requisito_curso_id: "b" },
    { id: "d", nome: "D (apoio)", modalidade: "apoio" },
    { id: "e", nome: "E excluído", modalidade: "ead", deleted_at: "2026-10-01T00:00:00Z" },
    { id: "f", nome: "F semipresencial", modalidade: "semipresencial" },
  ];

  it("preRequisitoFechariaCiclo: o curso não pode exigir a si mesmo nem quem já o exige, direta ou indiretamente", () => {
    expect(preRequisitoFechariaCiclo("a", "a", cursos)).toBe(true);
    expect(preRequisitoFechariaCiclo("a", "b", cursos)).toBe(true); // b exige a
    expect(preRequisitoFechariaCiclo("a", "c", cursos)).toBe(true); // c exige b, que exige a
    expect(preRequisitoFechariaCiclo("c", "a", cursos)).toBe(false);
    expect(preRequisitoFechariaCiclo("b", "d", cursos)).toBe(false);
    // curso novo (ainda sem id) não fecha ciclo com ninguém
    expect(preRequisitoFechariaCiclo(null, "a", cursos)).toBe(false);
  });

  it("preRequisitoFechariaCiclo: cadeia que já era circular não trava a tela", () => {
    const torta = [
      { id: "x", pre_requisito_curso_id: "y" },
      { id: "y", pre_requisito_curso_id: "x" },
    ];
    expect(preRequisitoFechariaCiclo("z", "x", torta)).toBe(false);
  });

  it("cursosQuePodemSerPreRequisito: sem o próprio curso, sem apoio, sem excluído e sem ciclo", () => {
    const ids = (lista) => lista.map((c) => c.id);
    expect(ids(cursosQuePodemSerPreRequisito({ cursoId: "a", cursos }))).toEqual(["f"]);
    expect(ids(cursosQuePodemSerPreRequisito({ cursoId: "c", cursos }))).toEqual(["a", "b", "f"]);
    // curso novo: todos os vivos que não são de apoio
    expect(ids(cursosQuePodemSerPreRequisito({ cursoId: null, cursos }))).toEqual([
      "a",
      "b",
      "c",
      "f",
    ]);
  });

  it("o pré-requisito já escolhido continua na lista, mesmo que hoje não pudesse ser escolhido", () => {
    // o curso 'd' é de apoio: não se escolhe, mas se ele já estava marcado a tela precisa mostrá-lo
    const r = cursosQuePodemSerPreRequisito({ cursoId: "c", cursos, atualId: "d" });
    expect(r.map((c) => c.id)).toContain("d");
  });
});

describe("avisoDoCursoExigido (o que a tela do curso diz sobre o pré-requisito escolhido)", () => {
  it("curso publicado que emite certificado: nada a avisar", () => {
    expect(avisoDoCursoExigido({ id: "a", ativo: true, modalidade: "ead" })).toBeNull();
    expect(avisoDoCursoExigido({ id: "a" })).toBeNull();
    expect(avisoDoCursoExigido(null)).toBeNull();
    expect(avisoDoCursoExigido(undefined)).toBeNull();
  });

  it("rascunho: ninguém cumpre o pré-requisito enquanto o curso exigido não for publicado", () => {
    const aviso = avisoDoCursoExigido({ id: "a", ativo: false, modalidade: "ead" });
    expect(aviso).toMatch(/não está publicado/);
  });

  it("semipresencial (T12) só vale com o certificado emitido; apoio nunca emite", () => {
    const semi = avisoDoCursoExigido({ id: "a", ativo: true, modalidade: "semipresencial" });
    expect(semi).toMatch(/semipresencial/);
    expect(semi).toMatch(/certificado emitido/);
    expect(semi).toMatch(/prática presencial/);
    expect(semi).not.toMatch(/ainda não emite certificado/);
    expect(avisoDoCursoExigido({ id: "a", ativo: true, modalidade: "apoio" })).toMatch(
      /não emite certificado/
    );
  });
});

describe("curso exigido semipresencial (T12): a teoria concluída não basta", () => {
  const cursos = [
    { id: "basico", nome: "Básico semipresencial", modalidade: "semipresencial", ativo: true },
    { id: "sep", nome: "SEP", modalidade: "ead", ativo: true, pre_requisito_curso_id: "basico" },
  ];
  const concluida = {
    id: "m1",
    funcionario_id: "f1",
    curso_id: "basico",
    status: "concluido",
    proxima_renovacao: "2028-10-01",
  };
  const hoje = "2026-10-07";
  it("sem o certificado do curso exigido: falta a prática; com ele vivo, atende", () => {
    const base = { curso: cursos[1], cursos, funcionarioId: "f1", matriculas: [concluida], hoje };
    expect(situacaoDoPreRequisitoDoFuncionario({ ...base, certificados: [] })).toEqual({
      atendido: false,
      motivo: "pratica_pendente",
    });
    expect(
      situacaoDoPreRequisitoDoFuncionario({
        ...base,
        certificados: [{ matricula_id: "m1", revogado_em: null }],
      })
    ).toEqual({ atendido: true, motivo: "concluido" });
    expect(
      situacaoDoPreRequisitoDoFuncionario({
        ...base,
        certificados: [{ matricula_id: "m1", revogado_em: "2026-10-02T00:00:00Z" }],
      }).motivo
    ).toBe("revogado");
  });
  it("o painel de matrícula barra quem só concluiu a teoria, com o motivo", () => {
    const { liberadas, bloqueadas } = separarPorPreRequisito({
      novas: [{ curso_id: "sep", funcionario_id: "f1" }],
      cursos,
      matriculas: [concluida],
      certificados: [],
      hoje,
    });
    expect(liberadas).toEqual([]);
    expect(bloqueadas[0].motivo).toBe("pratica_pendente");
    expect(motivoDoBloqueioNaMatricula("pratica_pendente")).toMatch(/parte prática/);
  });
});
