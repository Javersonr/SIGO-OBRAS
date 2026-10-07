/**
 * Parte prática presencial do curso semipresencial (T12): módulo PURO, mais duas leituras de banco com o cliente
 * por parâmetro.
 *
 * O curso semipresencial tem a teoria no portal (EAD) e a prática presencial, que o RH registra em sessões
 * (`treinamento_sessao_pratica`: data, horário, local, instrutor e carga) com a presença e o resultado de cada
 * matrícula (`treinamento_pratica_participante`: `presente` e `resultado` em pendente, satisfatorio ou
 * insatisfatorio), migração 0143. É a CONDIÇÃO DA MATRÍCULA, separada do requisito do curso (requisitos.ts):
 * o aluno só emite o certificado com uma participação "presente" e "satisfatório" numa sessão NÃO APAGADA do
 * MESMO curso e já realizada (data até hoje, em Brasília). Senão o servidor responde 409 `PRATICA_PENDENTE`.
 *
 * Na emissão, a sessão que valeu (a satisfatória mais recente) é CONGELADA em `dados.pratica` (data, horário,
 * local, instrutor, carga e resultado), `dados.local` ganha o local da prática e o período passa a cobrir o
 * dia da prática: editar ou apagar a sessão depois não muda o certificado emitido (que o banco não deixa
 * alterar, 0119/0135).
 *
 * Espelho do front: `apps/web/src/lib/ead-pratica.js` (`situacaoDaPratica` e `podeEmitirSemipresencial`); o
 * `pratica.test.ts` confere os dois contra os mesmos casos.
 */
import { modalidadeDoCurso } from "./requisitos.ts";

/** A sessão prática como o banco a devolve (só o que a regra e o certificado leem). */
export interface SessaoPratica {
  id: string;
  curso_id?: string | null;
  /** AAAA-MM-DD */
  data?: string | null;
  /** HH:MM ou HH:MM:SS (coluna time) */
  hora_inicio?: string | null;
  hora_fim?: string | null;
  carga_horas?: number | string | null;
  local?: string | null;
  instrutor_nome?: string | null;
  instrutor_qualificacao?: string | null;
  deleted_at?: string | null;
}

/** A participação de uma matrícula numa sessão (só o que a regra lê). */
export interface ParticipacaoNaPratica {
  sessao_id: string;
  matricula_id: string;
  presente?: boolean | null;
  resultado?: string | null;
  deleted_at?: string | null;
}

/**
 * - realizada: presente e satisfatório numa sessão já realizada (`sessao` = a mais recente delas);
 * - agendada: participa de uma sessão de hoje em diante ainda sem resultado (`sessao` = a mais próxima);
 * - insatisfatoria: o último resultado lançado é insatisfatório (`sessao` = essa sessão);
 * - pendente: nada disso (sem sessão, ausente ou resultado ainda não lançado; `sessao` = null).
 */
export type SituacaoDaPratica = "realizada" | "agendada" | "insatisfatoria" | "pendente";

export interface PraticaDaMatricula {
  situacao: SituacaoDaPratica;
  sessao: SessaoPratica | null;
}

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const diaValido = (data: unknown): string | null =>
  typeof data === "string" && DIA.test(data.trim()) ? data.trim() : null;
/** "AAAA-MM-DD|HH:MM:SS" para ordenar as sessões no tempo (sem horário, o começo do dia). */
const momento = (s: SessaoPratica) => `${diaValido(s.data)}|${String(s.hora_inicio ?? "")}`;
const maisRecente = (a: SessaoPratica, b: SessaoPratica) => (momento(a) >= momento(b) ? a : b);
const maisProxima = (a: SessaoPratica, b: SessaoPratica) => (momento(a) <= momento(b) ? a : b);

/**
 * Situação da parte prática de uma matrícula. `sessoes` pode trazer sessões de outros cursos e apagadas, e
 * `participacoes`, as de outras matrículas: a regra filtra. `hoje` é o dia de Brasília (AAAA-MM-DD).
 */
export function situacaoDaPratica(p: {
  matriculaId: string;
  cursoId: string;
  sessoes: SessaoPratica[];
  participacoes: ParticipacaoNaPratica[];
  hoje: string;
}): PraticaDaMatricula {
  const sessaoPorId = new Map<string, SessaoPratica>();
  for (const s of p.sessoes ?? []) {
    if (s && !s.deleted_at && s.curso_id === p.cursoId && diaValido(s.data)) {
      sessaoPorId.set(s.id, s);
    }
  }
  const minhas = (p.participacoes ?? [])
    .filter((x) => x && !x.deleted_at && x.matricula_id === p.matriculaId)
    .map((x) => ({ participacao: x, sessao: sessaoPorId.get(x.sessao_id) }))
    .filter((x): x is { participacao: ParticipacaoNaPratica; sessao: SessaoPratica } => !!x.sessao);

  const realizada = (s: SessaoPratica) => (diaValido(s.data) as string) <= p.hoje;
  const satisfatorias = minhas
    .filter(
      (x) =>
        x.participacao.presente === true &&
        x.participacao.resultado === "satisfatorio" &&
        realizada(x.sessao)
    )
    .map((x) => x.sessao);
  if (satisfatorias.length) {
    return { situacao: "realizada", sessao: satisfatorias.reduce(maisRecente) };
  }

  const marcadas = minhas
    .filter(
      (x) =>
        (diaValido(x.sessao.data) as string) >= p.hoje &&
        x.participacao.resultado !== "satisfatorio" &&
        x.participacao.resultado !== "insatisfatorio"
    )
    .map((x) => x.sessao);
  if (marcadas.length) return { situacao: "agendada", sessao: marcadas.reduce(maisProxima) };

  const avaliadas = minhas.filter(
    (x) =>
      realizada(x.sessao) &&
      (x.participacao.resultado === "satisfatorio" || x.participacao.resultado === "insatisfatorio")
  );
  if (avaliadas.length) {
    const ultima = avaliadas.reduce((a, b) =>
      maisRecente(a.sessao, b.sessao) === a.sessao ? a : b
    );
    if (ultima.participacao.resultado === "insatisfatorio") {
      return { situacao: "insatisfatoria", sessao: ultima.sessao };
    }
  }
  return { situacao: "pendente", sessao: null };
}

/** O critério do aceite da T12: o semipresencial só emite com a prática realizada (presente e satisfatório). */
export function podeEmitirSemipresencial(p: Parameters<typeof situacaoDaPratica>[0]): boolean {
  return situacaoDaPratica(p).situacao === "realizada";
}

/** "AAAA-MM-DD" → "DD/MM/AAAA" (o dia já é de calendário: sem fuso). */
const fmtDia = (dia: string | null | undefined) =>
  dia && DIA.test(dia) ? dia.split("-").reverse().join("/") : "";
const textoLimpo = (v: unknown): string | null => {
  const t = typeof v === "string" ? v.trim() : "";
  return t ? t : null;
};

/** O que o aluno lê sobre a parte prática (e o fim da mensagem do 409). */
export function textoDaPratica(pratica: PraticaDaMatricula): string {
  const s = pratica.sessao;
  const onde = s && textoLimpo(s.local) ? `, em ${textoLimpo(s.local)}` : "";
  switch (pratica.situacao) {
    case "realizada":
      return `Parte prática: realizada em ${fmtDia(s?.data)}${onde}.`;
    case "agendada":
      return `Parte prática: pendente. Sessão presencial marcada para ${fmtDia(s?.data)}${onde}.`;
    case "insatisfatoria":
      return "Parte prática: resultado insatisfatório. Procure o RH para participar de uma nova sessão.";
    default:
      return "Parte prática: pendente. O RH registra a sessão presencial e o resultado de cada aluno.";
  }
}

/**
 * Resposta 409 da emissão pela prática, ou null se ela foi realizada. O código é `PRATICA_PENDENTE` (o mesmo que
 * a T8 reservou): a tela do aluno e o roteiro de teste o distinguem de `REQUISITOS` e `PRE_REQUISITO`.
 */
export function bloqueioDeEmissaoPorPratica(
  pratica: PraticaDaMatricula
): { codigo: "PRATICA_PENDENTE"; mensagem: string } | null {
  if (pratica.situacao === "realizada") return null;
  return {
    codigo: "PRATICA_PENDENTE",
    mensagem:
      "O certificado deste curso semipresencial só é emitido com a parte prática presencial registrada como " +
      `satisfatória. ${textoDaPratica(pratica)}`,
  };
}

/** HH:MM de uma coluna time ("08:00:00" → "08:00"); vazio ou fora do formato vira null. */
const horaCurta = (hora: unknown): string | null => {
  const m = typeof hora === "string" ? /^(\d{2}:\d{2})/.exec(hora.trim()) : null;
  return m ? m[1] : null;
};

export interface PraticaNoCertificado {
  sessao_id: string;
  data: string | null;
  hora_inicio: string | null;
  hora_fim: string | null;
  local: string | null;
  instrutor: { nome: string | null; qualificacao: string | null };
  carga_horas: number | null;
  resultado: "satisfatorio";
}

/**
 * `dados.pratica` do certificado: a sessão que valeu, CONGELADA (entra no hash). Só valores copiados (nenhuma
 * referência ao objeto da sessão): o RH editar a sessão depois não muda o certificado.
 */
export function dadosDaPraticaNoCertificado(sessao: SessaoPratica): PraticaNoCertificado {
  const carga = Number(sessao.carga_horas);
  return {
    sessao_id: sessao.id,
    data: diaValido(sessao.data),
    hora_inicio: horaCurta(sessao.hora_inicio),
    hora_fim: horaCurta(sessao.hora_fim),
    local: textoLimpo(sessao.local),
    instrutor: {
      nome: textoLimpo(sessao.instrutor_nome),
      qualificacao: textoLimpo(sessao.instrutor_qualificacao),
    },
    carga_horas: Number.isFinite(carga) && carga > 0 ? carga : null,
    resultado: "satisfatorio",
  };
}

/** `dados.local` do semipresencial: o ambiente da teoria (a plataforma) e o local da prática presencial. */
export function localComPratica(
  base: { ambiente: string },
  sessao: SessaoPratica
): { ambiente: string; pratica: string | null } {
  return { ambiente: base.ambiente, pratica: textoLimpo(sessao.local) };
}

/**
 * `dados.periodo` do semipresencial: o início e a conclusão passam a cobrir o dia da prática (que pode ser
 * antes do início da teoria ou depois da conclusão dela). A validade não muda: é a que o servidor gravou na
 * matrícula ao concluir a teoria (`datasDeConclusao`), contada desde então.
 */
export function periodoComPratica<
  P extends { inicio: string | null; conclusao: string | null; validade: string | null },
>(periodo: P, diaDaPratica: string | null): P {
  const dia = diaValido(diaDaPratica);
  if (!dia) return periodo;
  const inicio = periodo.inicio && periodo.inicio < dia ? periodo.inicio : dia;
  const conclusao = periodo.conclusao && periodo.conclusao > dia ? periodo.conclusao : dia;
  return { ...periodo, inicio, conclusao };
}

/** A parte prática como o `dados` a entrega ao aluno (sem instrutor, horário nem observações). */
export interface PraticaParaOAluno {
  situacao: SituacaoDaPratica;
  data: string | null;
  local: string | null;
  texto: string;
}

/** O item `pratica` de um curso do aluno em `dados`: null se o curso não é semipresencial. */
export function praticaParaOAluno(p: {
  curso: { id: string; modalidade?: string | null } | null | undefined;
  matricula: { id: string; curso_id: string };
  sessoes: SessaoPratica[];
  participacoes: ParticipacaoNaPratica[];
  hoje: string;
}): PraticaParaOAluno | null {
  if (!p.curso || modalidadeDoCurso(p.curso) !== "semipresencial") return null;
  const pratica = situacaoDaPratica({
    matriculaId: p.matricula.id,
    cursoId: p.matricula.curso_id,
    sessoes: p.sessoes,
    participacoes: p.participacoes,
    hoje: p.hoje,
  });
  return {
    situacao: pratica.situacao,
    data: pratica.sessao ? diaValido(pratica.sessao.data) : null,
    local: pratica.sessao ? textoLimpo(pratica.sessao.local) : null,
    texto: textoDaPratica(pratica),
  };
}

/** Deixa nos logs a causa de um erro do banco (a resposta ao aluno é genérica). Nada de dado pessoal. */
function registrarErro(etapa: string, erro: unknown) {
  const e = erro as { message?: unknown; code?: unknown } | null;
  console.error(
    "[portal-funcionario] prática presencial:",
    etapa,
    "falhou:",
    e?.code ? `[${String(e.code)}]` : "",
    String(e?.message ?? erro)
  );
}

const COLUNAS_SESSAO =
  "id, curso_id, data, hora_inicio, hora_fim, carga_horas, local, instrutor_nome, instrutor_qualificacao, deleted_at";
const COLUNAS_PARTICIPACAO = "sessao_id, matricula_id, presente, resultado, deleted_at";

/**
 * Lê no banco, na hora da emissão, a prática de UMA matrícula: as sessões vivas do curso e as participações vivas
 * da matrícula. Service role ignora a RLS: as duas consultas levam a empresa da SESSÃO do portal, e a matrícula
 * já foi conferida como do aluno (`minhaMatricula`). Falha em qualquer uma = `{ ok: false }` (quem emite
 * responde 503): leitura que falha nunca vira "realizada".
 */
export async function lerPratica(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  p: { matriculaId: string; cursoId: string; empresaId: string; hoje: string }
): Promise<{ ok: true; pratica: PraticaDaMatricula } | { ok: false }> {
  const [sessoes, participacoes] = await Promise.all([
    supabase
      .from("treinamento_sessao_pratica")
      .select(COLUNAS_SESSAO)
      .eq("curso_id", p.cursoId)
      .eq("empresa_id", p.empresaId)
      .is("deleted_at", null),
    supabase
      .from("treinamento_pratica_participante")
      .select(COLUNAS_PARTICIPACAO)
      .eq("matricula_id", p.matriculaId)
      .eq("empresa_id", p.empresaId)
      .is("deleted_at", null),
  ]);
  for (const [etapa, r] of [
    ["sessões", sessoes],
    ["participações", participacoes],
  ] as const) {
    if (r.error) {
      registrarErro(etapa, r.error);
      return { ok: false };
    }
  }
  return {
    ok: true,
    pratica: situacaoDaPratica({
      matriculaId: p.matriculaId,
      cursoId: p.cursoId,
      sessoes: sessoes.data ?? [],
      participacoes: participacoes.data ?? [],
      hoje: p.hoje,
    }),
  };
}

/**
 * As sessões dos cursos semipresenciais do aluno e as participações das matrículas dele, só da empresa da sessão
 * (para a ação `dados`). Sem curso semipresencial não consulta. Falha de leitura devolve vazio e deixa o rastro
 * no log: o aluno vê a prática "pendente" (falha fechado) e a emissão, que lê de novo e é quem decide, responde
 * 503.
 */
export async function praticasDoBanco(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  p: { cursoIds: (string | null | undefined)[]; matriculaIds: string[]; empresaId: string }
): Promise<{ sessoes: SessaoPratica[]; participacoes: ParticipacaoNaPratica[] }> {
  const vazio = { sessoes: [], participacoes: [] };
  const cursos = [
    ...new Set(p.cursoIds.filter((id): id is string => typeof id === "string" && !!id)),
  ];
  const matriculas = [...new Set(p.matriculaIds.filter(Boolean))];
  if (!cursos.length || !matriculas.length) return vazio;
  const [sessoes, participacoes] = await Promise.all([
    supabase
      .from("treinamento_sessao_pratica")
      .select(COLUNAS_SESSAO)
      .in("curso_id", cursos)
      .eq("empresa_id", p.empresaId)
      .is("deleted_at", null),
    supabase
      .from("treinamento_pratica_participante")
      .select(COLUNAS_PARTICIPACAO)
      .in("matricula_id", matriculas)
      .eq("empresa_id", p.empresaId)
      .is("deleted_at", null),
  ]);
  if (sessoes.error || participacoes.error) {
    registrarErro("leitura para o portal", sessoes.error ?? participacoes.error);
    return vazio;
  }
  return { sessoes: sessoes.data ?? [], participacoes: participacoes.data ?? [] };
}
