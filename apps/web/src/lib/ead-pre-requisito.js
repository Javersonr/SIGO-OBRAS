/**
 * Pré-requisito entre cursos na tela do RH (T23) — regras puras, sem DOM e sem rede.
 *
 * O NR-10 Complementar (SEP) exige o NR-10 Básico. O RH escolhe o curso exigido na tela do curso (coluna
 * `treinamento_curso.pre_requisito_curso_id`, migração 0142). Quem não o concluiu, dentro da validade, não pode ser
 * MATRICULADO no curso que o exige (o painel de matrícula separa quem falta e não grava a matrícula dele) e o
 * servidor também recusa EMITIR o certificado (409 `PRE_REQUISITO`, `supabase/functions/portal-funcionario/
 * pre-requisito.ts`, o espelho desta regra: o `pre-requisito.test.ts` confere os dois contra os mesmos casos).
 *
 * Quando o pré-requisito está "atendido": o funcionário tem, no curso exigido, uma matrícula viva, concluída, sem
 * certificado revogado e com a validade em dia (sem validade vale sempre; no último dia ainda vale). Uma conclusão
 * boa basta: a antiga, vencida ou revogada, não derruba a renovação que já foi feita. Matrícula aberta NÃO conta.
 * O motivo de "não atendido" serve só ao texto (em andamento > vencido > revogado > sem matrícula). Curso exigido
 * que não existe mais, foi excluído ou é de apoio (conclui sem certificado) falha fechado.
 *
 * Os testes ficam em ead-pre-requisito.test.js. Este arquivo só importa `ead-requisitos.js` (com a extensão, como
 * ele mesmo faz): o teste do servidor (node:test) o carrega direto, sem o resolvedor do Vite.
 */
import { modalidadeDoCurso } from "./ead-requisitos.js";

const DIA = /^(\d{4}-\d{2}-\d{2})/;
const viva = (linha) => !!linha && !linha.deleted_at;

/** Vencida = validade ANTERIOR a hoje. Sem validade, ou valor que não é data, não vence. */
function venceu(validade, hoje) {
  const dia = typeof validade === "string" ? DIA.exec(validade.trim())?.[1] : undefined;
  return dia !== undefined && dia < hoje;
}

/**
 * Situação do pré-requisito de UM funcionário. `curso` é o curso EXIGIDO (null = não achado); `matriculas`, as do
 * funcionário nele; `revogadas` (Set), os ids das matrículas cujo certificado foi revogado; `hoje`, "AAAA-MM-DD"
 * de Brasília.
 * @returns {{ atendido: boolean, motivo: "concluido"|"sem_matricula"|"em_andamento"|"vencido"|"revogado"|
 *   "curso_excluido"|"curso_sem_certificado" }}
 */
export function situacaoDoPreRequisito({ curso, matriculas = [], revogadas = new Set(), hoje }) {
  if (!curso || curso.deleted_at) return { atendido: false, motivo: "curso_excluido" };
  if (modalidadeDoCurso(curso) === "apoio") {
    return { atendido: false, motivo: "curso_sem_certificado" };
  }
  const vivas = (matriculas ?? []).filter(viva);
  const concluidas = vivas.filter((m) => m.status === "concluido");
  const vale = (m) => !revogadas.has(m.id) && !venceu(m.proxima_renovacao, hoje);
  if (concluidas.some(vale)) return { atendido: true, motivo: "concluido" };
  if (vivas.some((m) => m.status !== "concluido"))
    return { atendido: false, motivo: "em_andamento" };
  if (concluidas.some((m) => !revogadas.has(m.id) && venceu(m.proxima_renovacao, hoje))) {
    return { atendido: false, motivo: "vencido" };
  }
  if (concluidas.some((m) => revogadas.has(m.id))) return { atendido: false, motivo: "revogado" };
  return { atendido: false, motivo: "sem_matricula" };
}

/**
 * O curso que `curso` exige, na lista de cursos da tela: `{ id, curso }`, ou null se ele não exige nenhum. `curso`
 * vem `null` quando o vínculo aponta para um curso que a lista não tem (excluído): o chamador trata como falta.
 */
export function cursoExigidoDe(curso, cursos) {
  const id = curso?.pre_requisito_curso_id;
  if (!id) return null;
  return { id, curso: (cursos ?? []).find((c) => c?.id === id && viva(c)) ?? null };
}

const revogadasDe = (certificados) =>
  new Set(
    (Array.isArray(certificados) ? certificados : [])
      .filter((c) => c?.revogado_em)
      .map((c) => c.matricula_id)
  );

/**
 * A situação do pré-requisito de `curso` para o funcionário, com o que a tela da empresa tem em mãos (todas as
 * matrículas e certificados). null quando o curso não tem pré-requisito.
 */
export function situacaoDoPreRequisitoDoFuncionario({
  curso,
  cursos,
  funcionarioId,
  matriculas,
  certificados,
  hoje,
}) {
  const exigido = cursoExigidoDe(curso, cursos);
  if (!exigido) return null;
  return situacaoDoPreRequisito({
    curso: exigido.curso,
    matriculas: (matriculas ?? []).filter(
      (m) => m?.funcionario_id === funcionarioId && m.curso_id === exigido.id
    ),
    revogadas: revogadasDe(certificados),
    hoje,
  });
}

/**
 * Separa as matrículas que o painel quer criar entre as que podem ser gravadas e as que o pré-requisito barra.
 * `novas` são as linhas de `matriculasNovas` (precisam de `curso_id` e `funcionario_id`). Cada bloqueada traz
 * `{ nova, funcionarioId, cursoId, cursoNome, preRequisitoId, preRequisitoNome, motivo }` para a tela explicar.
 * @returns {{ liberadas: object[], bloqueadas: object[] }}
 */
export function separarPorPreRequisito({
  novas = [],
  cursos = [],
  matriculas = [],
  certificados = [],
  hoje,
}) {
  const cursoPorId = new Map((cursos ?? []).map((c) => [c?.id, c]));
  const revogadas = revogadasDe(certificados);
  const porPar = new Map();
  for (const m of matriculas ?? []) {
    const chave = `${m?.funcionario_id}|${m?.curso_id}`;
    if (!porPar.has(chave)) porPar.set(chave, []);
    porPar.get(chave).push(m);
  }
  const liberadas = [];
  const bloqueadas = [];
  for (const nova of novas ?? []) {
    const curso = cursoPorId.get(nova.curso_id);
    const exigido = cursoExigidoDe(curso, cursos);
    if (!exigido) {
      liberadas.push(nova);
      continue;
    }
    const situacao = situacaoDoPreRequisito({
      curso: exigido.curso,
      matriculas: porPar.get(`${nova.funcionario_id}|${exigido.id}`) ?? [],
      revogadas,
      hoje,
    });
    if (situacao.atendido) {
      liberadas.push(nova);
      continue;
    }
    bloqueadas.push({
      nova,
      funcionarioId: nova.funcionario_id,
      cursoId: nova.curso_id,
      cursoNome: curso?.nome ?? "",
      preRequisitoId: exigido.id,
      preRequisitoNome: exigido.curso?.nome ?? "",
      motivo: situacao.motivo,
    });
  }
  return { liberadas, bloqueadas };
}

const MOTIVOS_NA_MATRICULA = {
  sem_matricula: "ainda não fez o curso",
  em_andamento: "ainda não concluiu o curso",
  vencido: "o certificado venceu",
  revogado: "o certificado foi revogado",
  curso_excluido: "o curso exigido foi excluído",
  curso_sem_certificado: "o curso exigido não emite certificado",
};

/** Por que a pessoa não pode ser matriculada, em poucas palavras. */
export function motivoDoBloqueioNaMatricula(motivo) {
  return MOTIVOS_NA_MATRICULA[motivo] ?? "pré-requisito não cumprido";
}

/**
 * Os bloqueios do painel de matrícula em blocos para a tela: um por curso e pré-requisito, com o nome de cada
 * pessoa e o motivo. `nomeDe(funcionarioId)` devolve o nome cadastrado (ou nada: vira "Funcionário").
 * @returns {{ titulo: string, pessoas: { funcionarioId: string, nome: string, motivo: string }[] }[]}
 */
export function resumoDosBloqueios(bloqueadas, nomeDe) {
  const grupos = new Map();
  for (const b of bloqueadas ?? []) {
    const chave = `${b.cursoId ?? b.cursoNome}|${b.preRequisitoId ?? b.preRequisitoNome}`;
    if (!grupos.has(chave)) {
      const pre = b.preRequisitoNome ? `"${b.preRequisitoNome}"` : "o curso exigido";
      grupos.set(chave, {
        titulo: `Para "${b.cursoNome}" é preciso ter concluído ${pre}`,
        pessoas: [],
      });
    }
    grupos.get(chave).pessoas.push({
      funcionarioId: b.funcionarioId,
      nome: nomeDe?.(b.funcionarioId) || "Funcionário",
      motivo: motivoDoBloqueioNaMatricula(b.motivo),
    });
  }
  return [...grupos.values()];
}

// ---------------------------------------------------------------- escolha na tela do curso

/**
 * Escolher `candidatoId` como pré-requisito de `cursoId` fecharia um círculo? É quando o candidato é o próprio
 * curso, ou quando a cadeia de pré-requisitos do candidato passa por `cursoId` (o banco recusa o mesmo, o trigger
 * `pre_requisito_sem_ciclo`). Curso novo (sem id) não fecha círculo. Cadeia que já era circular sem passar por
 * `cursoId` não trava: a conta para ao rever um curso.
 */
export function preRequisitoFechariaCiclo(cursoId, candidatoId, cursos) {
  if (!cursoId || !candidatoId) return false;
  if (cursoId === candidatoId) return true;
  const porId = new Map((cursos ?? []).map((c) => [c?.id, c]));
  const vistos = new Set();
  let atual = candidatoId;
  while (atual && !vistos.has(atual)) {
    if (atual === cursoId) return true;
    vistos.add(atual);
    atual = porId.get(atual)?.pre_requisito_curso_id ?? null;
  }
  return false;
}

/**
 * Os cursos que o RH pode escolher como pré-requisito de `cursoId`: vivos, que não sejam o próprio curso, que não
 * fechem um círculo e que não sejam de apoio (o apoio conclui sem certificado, então nunca valeria). Na ordem de
 * `cursos`. `atualId` é o pré-requisito que o curso já tem: continua na lista mesmo que hoje não pudesse ser
 * escolhido, para a tela mostrar o que está gravado.
 */
export function cursosQuePodemSerPreRequisito({ cursoId, cursos, atualId = null }) {
  return (cursos ?? []).filter((c) => {
    if (!viva(c)) return false;
    if (c.id === atualId) return true;
    if (c.id === cursoId) return false;
    if (modalidadeDoCurso(c) === "apoio") return false;
    return !preRequisitoFechariaCiclo(cursoId, c.id, cursos);
  });
}

/**
 * O que a tela do curso avisa sobre o curso exigido que o RH escolheu, ou null se está tudo certo. É só aviso (não
 * bloqueia salvar): o RH pode estar montando os dois cursos ao mesmo tempo.
 * - rascunho (`ativo === false`): ninguém conclui o curso exigido enquanto ele não for publicado;
 * - apoio: nunca emite certificado, então nunca vale como pré-requisito (o servidor falha fechado);
 * - semipresencial: ainda não emite certificado (T12), então ninguém o cumpre até a prática presencial existir.
 */
export function avisoDoCursoExigido(exigido) {
  if (!exigido) return null;
  const modalidade = modalidadeDoCurso(exigido);
  if (modalidade === "apoio") {
    return "O curso exigido é de apoio: ele não emite certificado e por isso não vale como pré-requisito.";
  }
  if (modalidade === "semipresencial") {
    return "O curso exigido é semipresencial e ainda não emite certificado: ninguém consegue cumprir o pré-requisito até isso mudar.";
  }
  if (exigido.ativo === false) {
    return "O curso exigido não está publicado: ninguém consegue cumpri-lo até ele ser publicado e concluído.";
  }
  return null;
}
