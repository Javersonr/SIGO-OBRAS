/**
 * Pré-requisito entre cursos (T23): módulo PURO, mais duas leituras de banco com o cliente por parâmetro.
 *
 * O NR-10 Complementar (SEP) exige o NR-10 Básico. O RH escolhe o curso exigido na tela do curso (coluna
 * `treinamento_curso.pre_requisito_curso_id`, migração 0142). Quem não tem o curso exigido CONCLUÍDO e DENTRO DA
 * VALIDADE não emite o certificado do curso que o exige: o servidor responde 409 `PRE_REQUISITO`. A tela do RH
 * também bloqueia a matrícula (`apps/web/src/lib/ead-pre-requisito.js`, o espelho desta regra; o
 * `pre-requisito.test.ts` confere os dois contra os mesmos casos).
 *
 * Quando o pré-requisito está "atendido": o funcionário tem, no curso exigido, uma matrícula viva, concluída,
 * sem certificado revogado e com a validade em dia (`proxima_renovacao` vazia = sem validade; no último dia ainda
 * vale, como em `estaVencido` do `validar-certificado`). Uma conclusão boa basta: a antiga, vencida ou revogada,
 * não derruba a renovação que já foi feita. Matrícula ainda aberta NÃO conta. O motivo de "não atendido" é só para
 * o texto (em andamento > vencido > revogado > sem matrícula).
 *
 * Falha fechado: curso exigido que não existe mais (ou foi excluído) e curso exigido de apoio (que conclui sem
 * certificado e sem data de renovação, então nunca poderia valer) não atendem o pré-requisito. A leitura que falha
 * não vira "atendido": quem emite responde 503.
 *
 * Só o curso EXIGIDO diretamente é conferido: se o NR-10 Básico exige outro curso, essa exigência já foi conferida
 * quando o Básico foi emitido.
 */
import { modalidadeDoCurso } from "./requisitos.ts";

export type MotivoDoPreRequisito =
  | "concluido"
  | "sem_matricula"
  | "em_andamento"
  | "vencido"
  | "revogado"
  | "curso_excluido"
  | "curso_sem_certificado";

export interface SituacaoDoPreRequisito {
  atendido: boolean;
  motivo: MotivoDoPreRequisito;
}

/** O curso exigido como o banco o devolve (só o que a regra lê). */
export interface CursoExigido {
  id: string;
  nome?: string | null;
  modalidade?: string | null;
  deleted_at?: string | null;
}

/** A matrícula do funcionário no curso exigido (só o que a regra lê). */
export interface MatriculaNoCursoExigido {
  id: string;
  curso_id?: string;
  status?: string | null;
  proxima_renovacao?: string | null;
  deleted_at?: string | null;
}

const DIA = /^(\d{4}-\d{2}-\d{2})/;

/** Vencida = validade ANTERIOR a hoje. Sem validade, ou valor que não é data, não vence. */
function venceu(validade: unknown, hoje: string): boolean {
  const dia = typeof validade === "string" ? DIA.exec(validade.trim())?.[1] : undefined;
  return dia !== undefined && dia < hoje;
}

/**
 * Situação do pré-requisito de um funcionário. `curso` é o curso EXIGIDO (null = não achado); `matriculas`, as do
 * funcionário nele; `revogadas`, os ids das matrículas cujo certificado foi revogado; `hoje`, o dia de Brasília.
 */
export function situacaoDoPreRequisito(p: {
  curso: CursoExigido | null | undefined;
  matriculas: MatriculaNoCursoExigido[];
  revogadas: ReadonlySet<string>;
  hoje: string;
}): SituacaoDoPreRequisito {
  if (!p.curso || p.curso.deleted_at) return { atendido: false, motivo: "curso_excluido" };
  if (modalidadeDoCurso(p.curso) === "apoio") {
    return { atendido: false, motivo: "curso_sem_certificado" };
  }
  const vivas = (p.matriculas ?? []).filter((m) => !m.deleted_at);
  const concluidas = vivas.filter((m) => m.status === "concluido");
  const vale = (m: MatriculaNoCursoExigido) =>
    !p.revogadas.has(m.id) && !venceu(m.proxima_renovacao, p.hoje);
  if (concluidas.some(vale)) return { atendido: true, motivo: "concluido" };
  if (vivas.some((m) => m.status !== "concluido")) {
    return { atendido: false, motivo: "em_andamento" };
  }
  if (concluidas.some((m) => !p.revogadas.has(m.id) && venceu(m.proxima_renovacao, p.hoje))) {
    return { atendido: false, motivo: "vencido" };
  }
  if (concluidas.some((m) => p.revogadas.has(m.id))) {
    return { atendido: false, motivo: "revogado" };
  }
  return { atendido: false, motivo: "sem_matricula" };
}

/** Texto para o aluno (e para o 409): o que falta, ou a confirmação de que está em dia. */
export function textoDoPreRequisito(
  motivo: MotivoDoPreRequisito,
  nomeDoCurso: string | null | undefined
): string {
  const nome = String(nomeDoCurso ?? "").trim();
  const curso = nome ? `o curso "${nome}"` : "o curso exigido";
  const exige = `Para emitir este certificado é preciso ter concluído antes ${curso}, dentro da validade.`;
  switch (motivo) {
    case "concluido":
      return `Pré-requisito em dia: ${curso} concluído e dentro da validade.`;
    case "sem_matricula":
      return `${exige} Você ainda não fez esse curso: procure o RH.`;
    case "em_andamento":
      return `${exige} Termine esse curso primeiro.`;
    case "vencido":
      return `${exige} O seu certificado nele venceu: procure o RH para renovar.`;
    case "revogado":
      return `${exige} O certificado dele foi revogado pela empresa: procure o RH.`;
    case "curso_sem_certificado":
      return `${exige} Esse curso não emite certificado e por isso não vale como pré-requisito: procure o RH.`;
    default:
      return "O curso exigido antes deste não está mais disponível. Procure o RH para revisar o pré-requisito.";
  }
}

/**
 * Resposta 409 da emissão pelo pré-requisito, ou null se está atendido. O código é `PRE_REQUISITO`: a tela do
 * aluno e o roteiro de teste o distinguem de `REQUISITOS` (o que o RH precisa regularizar no curso).
 */
export function bloqueioDeEmissaoPorPreRequisito(
  situacao: SituacaoDoPreRequisito,
  nomeDoCurso: string | null | undefined
): { codigo: "PRE_REQUISITO"; mensagem: string } | null {
  if (situacao.atendido) return null;
  return { codigo: "PRE_REQUISITO", mensagem: textoDoPreRequisito(situacao.motivo, nomeDoCurso) };
}

/** O pré-requisito de um curso como o `dados` o entrega ao aluno. */
export interface PreRequisitoParaOAluno extends SituacaoDoPreRequisito {
  curso_id: string;
  nome: string | null;
  texto: string;
}

/**
 * O item `pre_requisito` de um curso do aluno em `dados`: null se o curso não exige nenhum. Usa o que a ação já
 * carregou: as matrículas do aluno (de todos os cursos), os certificados dele e os cursos exigidos
 * (`cursosExigidosDoBanco`). Curso exigido que a consulta não trouxe falha fechado ("curso excluído").
 */
export function preRequisitoDoCurso(p: {
  curso: { pre_requisito_curso_id?: string | null } | null | undefined;
  cursosExigidos: CursoExigido[];
  matriculas: MatriculaNoCursoExigido[];
  certificados: { matricula_id?: string | null; revogado_em?: string | null }[];
  hoje: string;
}): PreRequisitoParaOAluno | null {
  const preId = p.curso?.pre_requisito_curso_id;
  if (!preId) return null;
  const exigido = (p.cursosExigidos ?? []).find((c) => c.id === preId) ?? null;
  const revogadas = new Set<string>();
  for (const c of p.certificados ?? [])
    if (c?.revogado_em && c.matricula_id) revogadas.add(c.matricula_id);
  const situacao = situacaoDoPreRequisito({
    curso: exigido,
    matriculas: (p.matriculas ?? []).filter((m) => m.curso_id === preId),
    revogadas,
    hoje: p.hoje,
  });
  const nome = exigido?.nome ?? null;
  return {
    curso_id: preId,
    nome,
    ...situacao,
    texto: textoDoPreRequisito(situacao.motivo, nome),
  };
}

/** Deixa nos logs a causa de um erro do banco (a resposta ao aluno é genérica). Nada de dado pessoal. */
function registrarErro(etapa: string, erro: unknown) {
  const e = erro as { message?: unknown; code?: unknown } | null;
  console.error(
    "[portal-funcionario] pré-requisito:",
    etapa,
    "falhou:",
    e?.code ? `[${String(e.code)}]` : "",
    String(e?.message ?? erro)
  );
}

/**
 * Os cursos exigidos (id, nome, modalidade, exclusão) por um conjunto de cursos do aluno, só da empresa da
 * sessão. Sem ids não consulta. Falha de leitura devolve vazio e deixa o rastro no log: o `dados` mostra o
 * pré-requisito como "não atendido" (falha fechado) e a emissão, que lê de novo e é quem decide, responde 503.
 */
export async function cursosExigidosDoBanco(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  ids: (string | null | undefined)[],
  empresaId: string
): Promise<CursoExigido[]> {
  const unicos = [...new Set(ids.filter((id): id is string => typeof id === "string" && !!id))];
  if (unicos.length === 0) return [];
  const { data, error } = await supabase
    .from("treinamento_curso")
    .select("id, nome, modalidade, deleted_at")
    .in("id", unicos)
    .eq("empresa_id", empresaId);
  if (error) {
    registrarErro("leitura dos cursos exigidos", error);
    return [];
  }
  return data ?? [];
}

/**
 * Lê no banco, na hora da emissão, o pré-requisito de um funcionário: o curso exigido, as matrículas dele nele
 * e os certificados revogados. Service role ignora a RLS: as três consultas levam a empresa (e o funcionário) da
 * SESSÃO, nunca do corpo da requisição. Falha em qualquer uma = `{ ok: false }` (quem emite responde 503).
 */
export async function lerPreRequisito(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  p: { preCursoId: string; funcionarioId: string; empresaId: string; hoje: string }
): Promise<{ ok: true; nome: string | null; situacao: SituacaoDoPreRequisito } | { ok: false }> {
  const [curso, matriculas, certificados] = await Promise.all([
    supabase
      .from("treinamento_curso")
      .select("id, nome, modalidade, deleted_at")
      .eq("id", p.preCursoId)
      .eq("empresa_id", p.empresaId)
      .maybeSingle(),
    supabase
      .from("treinamento_matricula")
      .select("id, status, proxima_renovacao")
      .eq("curso_id", p.preCursoId)
      .eq("funcionario_id", p.funcionarioId)
      .eq("empresa_id", p.empresaId)
      .is("deleted_at", null),
    supabase
      .from("treinamento_certificado")
      .select("matricula_id")
      .eq("curso_id", p.preCursoId)
      .eq("funcionario_id", p.funcionarioId)
      .eq("empresa_id", p.empresaId)
      .not("revogado_em", "is", null),
  ]);
  for (const [etapa, r] of [
    ["curso", curso],
    ["matrículas", matriculas],
    ["certificados", certificados],
  ] as const) {
    if (r.error) {
      registrarErro(etapa, r.error);
      return { ok: false };
    }
  }
  const exigido: CursoExigido | null = curso.data ?? null;
  const revogadas = new Set<string>(
    (certificados.data ?? []).map((c: { matricula_id: string }) => c.matricula_id)
  );
  return {
    ok: true,
    nome: exigido?.nome ?? null,
    situacao: situacaoDoPreRequisito({
      curso: exigido,
      matriculas: matriculas.data ?? [],
      revogadas,
      hoje: p.hoje,
    }),
  };
}
