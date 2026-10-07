/**
 * Parte prática presencial do curso semipresencial (T12): módulo PURO, mais duas leituras de banco com o cliente
 * por parâmetro.
 *
 * O curso semipresencial tem a teoria no portal (EAD) e a prática presencial, que o RH registra em sessões
 * (`treinamento_sessao_pratica`: data, horário, local, instrutor e carga) com a presença e o resultado de cada
 * matrícula (`treinamento_pratica_participante`: `presente` e `resultado` em pendente, satisfatorio ou
 * insatisfatorio), migração 0143. É a CONDIÇÃO DA MATRÍCULA, separada do requisito do curso (requisitos.ts):
 * o aluno só emite o certificado com a CARGA da prática cumprida, isto é, com a soma das cargas das sessões em que
 * ele esteve "presente" e "satisfatório" (sessões NÃO APAGADAS do MESMO curso e já realizadas: data até hoje, em
 * Brasília) chegando à `carga_pratica_horas` do curso. O certificado declara essa carga: uma sessão curta não a
 * cobre sozinha, e a prática de vários dias vale pela soma dos dias. Senão o servidor responde 409
 * `PRATICA_PENDENTE`. Curso sem `carga_pratica_horas` (o requisito CARGAS trava a emissão do mesmo jeito) cai na
 * regra mais simples: uma sessão satisfatória.
 *
 * Na emissão, as sessões que valeram (da mais antiga em diante, até cobrir a carga) são CONGELADAS em
 * `dados.pratica` (data, horário, local, instrutor e carga de cada uma, mais a soma), `dados.local` ganha os locais
 * da prática e o período passa a cobrir os dias da prática. A VALIDADE do semipresencial conta do FIM do
 * treinamento, o maior dia entre a conclusão da teoria e o último dia da prática (`periodoDoSemipresencial`):
 * contada da teoria, o certificado de um curso de 12 meses com a teoria feita 13 meses antes nasceria vencido. O
 * servidor grava a mesma validade na matrícula antes de emitir. Editar ou apagar a sessão depois não muda o
 * certificado emitido (que o banco não deixa alterar, 0119/0135).
 *
 * Espelho do front: `apps/web/src/lib/ead-pratica.js` (`situacaoDaPratica` e `podeEmitirSemipresencial`); o
 * `pratica.test.ts` confere os dois contra os mesmos casos.
 */
import { modalidadeDoCurso } from "./requisitos.ts";
import { renovacaoAPartirDe } from "./regras.ts";

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
 * - realizada: a carga prática do curso está coberta pelas sessões já realizadas em que a matrícula esteve presente
 *   e satisfatória (`sessoes` = as que valeram, da mais antiga à mais recente; `sessao` = a última delas);
 * - agendada: participa de uma sessão de hoje em diante ainda sem resultado (`sessao` = a mais próxima);
 * - insatisfatoria: o último resultado lançado é insatisfatório (`sessao` = essa sessão);
 * - parcial: há sessão satisfatória, mas a soma delas ainda não cobre a carga prática do curso;
 * - pendente: nada disso (sem sessão, ausente ou resultado ainda não lançado; `sessao` = null).
 */
export type SituacaoDaPratica =
  | "realizada"
  | "agendada"
  | "insatisfatoria"
  | "parcial"
  | "pendente";

export interface PraticaDaMatricula {
  situacao: SituacaoDaPratica;
  sessao: SessaoPratica | null;
  /** Só na situação "realizada": as sessões que valeram, da mais antiga à mais recente. Nas outras, vazio. */
  sessoes: SessaoPratica[];
  /** Soma das cargas das sessões já realizadas em que a matrícula esteve presente e satisfatória (horas). */
  cumpridaHoras: number;
  /** A carga prática do curso (horas); null = o curso não a informou. */
  exigidaHoras: number | null;
}

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const diaValido = (data: unknown): string | null =>
  typeof data === "string" && DIA.test(data.trim()) ? data.trim() : null;
/** "AAAA-MM-DD|HH:MM:SS" para ordenar as sessões no tempo (sem horário, o começo do dia). */
const momento = (s: SessaoPratica) => `${diaValido(s.data)}|${String(s.hora_inicio ?? "")}`;
const maisRecente = (a: SessaoPratica, b: SessaoPratica) => (momento(a) >= momento(b) ? a : b);
const maisProxima = (a: SessaoPratica, b: SessaoPratica) => (momento(a) <= momento(b) ? a : b);
const noTempo = (a: SessaoPratica, b: SessaoPratica) =>
  momento(a) < momento(b) ? -1 : momento(a) > momento(b) ? 1 : 0;

/** Horas em centésimos de hora (inteiro: a soma não carrega erro de ponto flutuante). Valor que não é > 0 vale 0. */
const emCentesimos = (horas: unknown): number => {
  const n = Number(horas);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
};

/**
 * As sessões que valem no certificado: da mais antiga em diante, as primeiras cuja soma cobre a carga exigida (as
 * que sobram, de quem fez mais sessões do que o curso pede, ficam de fora). Sem carga exigida, a mais recente.
 * `satisfatorias` já vem da mais antiga à mais recente.
 */
function sessoesQueValeram(
  satisfatorias: SessaoPratica[],
  exigida: number | null
): SessaoPratica[] {
  if (exigida === null) return satisfatorias.slice(-1);
  const valeram: SessaoPratica[] = [];
  let soma = 0;
  for (const s of satisfatorias) {
    valeram.push(s);
    soma += emCentesimos(s.carga_horas);
    if (soma >= exigida) break;
  }
  return valeram;
}

/**
 * Situação da parte prática de uma matrícula. `sessoes` pode trazer sessões de outros cursos e apagadas, e
 * `participacoes`, as de outras matrículas: a regra filtra. `hoje` é o dia de Brasília (AAAA-MM-DD).
 * `cargaPraticaHoras` é a `carga_pratica_horas` do curso: a prática só está "realizada" quando a soma das sessões
 * satisfatórias chega a ela (sem o valor, vale uma sessão satisfatória).
 */
export function situacaoDaPratica(p: {
  matriculaId: string;
  cursoId: string;
  sessoes: SessaoPratica[];
  participacoes: ParticipacaoNaPratica[];
  hoje: string;
  cargaPraticaHoras?: number | string | null;
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
  // uma sessão conta uma vez só, mesmo que a matrícula apareça duas vezes nela
  const satisfatoriasPorId = new Map<string, SessaoPratica>();
  for (const x of minhas) {
    if (
      x.participacao.presente === true &&
      x.participacao.resultado === "satisfatorio" &&
      realizada(x.sessao)
    ) {
      satisfatoriasPorId.set(x.sessao.id, x.sessao);
    }
  }
  const satisfatorias = [...satisfatoriasPorId.values()].sort(noTempo);
  const cumprida = satisfatorias.reduce((soma, s) => soma + emCentesimos(s.carga_horas), 0);
  const exigida = emCentesimos(p.cargaPraticaHoras) || null;
  const horas = {
    cumpridaHoras: cumprida / 100,
    exigidaHoras: exigida === null ? null : exigida / 100,
  };

  if (satisfatorias.length && (exigida === null || cumprida >= exigida)) {
    const valeram = sessoesQueValeram(satisfatorias, exigida);
    return {
      situacao: "realizada",
      sessao: valeram[valeram.length - 1],
      sessoes: valeram,
      ...horas,
    };
  }

  const marcadas = minhas
    .filter(
      (x) =>
        (diaValido(x.sessao.data) as string) >= p.hoje &&
        x.participacao.resultado !== "satisfatorio" &&
        x.participacao.resultado !== "insatisfatorio"
    )
    .map((x) => x.sessao);
  if (marcadas.length) {
    return { situacao: "agendada", sessao: marcadas.reduce(maisProxima), sessoes: [], ...horas };
  }

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
      return { situacao: "insatisfatoria", sessao: ultima.sessao, sessoes: [], ...horas };
    }
  }
  if (satisfatorias.length) return { situacao: "parcial", sessao: null, sessoes: [], ...horas };
  return { situacao: "pendente", sessao: null, sessoes: [], ...horas };
}

/**
 * O critério do aceite da T12: o semipresencial só emite com a prática realizada (presente e satisfatório, com a
 * carga prática do curso coberta pela soma das sessões).
 */
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
/** "8 h", "2,5 h" */
const fmtHoras = (horas: number) => `${String(Math.round(horas * 100) / 100).replace(".", ",")} h`;
/** "a", "a e b", "a, b e c": sem repetir o que já saiu (dois turnos no mesmo dia ou no mesmo local). */
const listaEmTexto = (itens: (string | null)[], separador = ", ") => {
  const unicos = [...new Set(itens.filter((i): i is string => !!i))];
  return unicos.length <= 1
    ? (unicos[0] ?? "")
    : `${unicos.slice(0, -1).join(separador)} e ${unicos[unicos.length - 1]}`;
};
/** Os locais das sessões, na ordem das sessões, sem repetir ("A", "A e B", "A; B e C"). */
const locaisDasSessoes = (sessoes: SessaoPratica[]) =>
  listaEmTexto(
    sessoes.map((s) => textoLimpo(s.local)),
    "; "
  );

/** O que o aluno lê sobre a parte prática (e o fim da mensagem do 409). */
export function textoDaPratica(pratica: PraticaDaMatricula): string {
  const s = pratica.sessao;
  const sessoes = pratica.sessoes?.length ? pratica.sessoes : s ? [s] : [];
  const onde = (lista: SessaoPratica[]) => {
    const locais = locaisDasSessoes(lista);
    return locais ? `, em ${locais}` : "";
  };
  // "Cumpridas 8 h das 16 h de prática presencial." (só quando já há horas cumpridas e ainda falta)
  const cumprida = Number(pratica.cumpridaHoras) || 0;
  const exigida = Number(pratica.exigidaHoras) || 0;
  const andamento =
    cumprida > 0 && exigida > cumprida
      ? ` Cumpridas ${fmtHoras(cumprida)} das ${fmtHoras(exigida)} de prática presencial.`
      : "";
  switch (pratica.situacao) {
    case "realizada":
      return `Parte prática: realizada em ${listaEmTexto(sessoes.map((x) => fmtDia(x.data)))}${onde(sessoes)}.`;
    case "agendada":
      return `Parte prática: pendente. Sessão presencial marcada para ${fmtDia(s?.data)}${onde(s ? [s] : [])}.${andamento}`;
    case "insatisfatoria":
      return `Parte prática: resultado insatisfatório. Procure o RH para participar de uma nova sessão.${andamento}`;
    case "parcial":
      return `Parte prática: pendente.${andamento} O RH registra as próximas sessões presenciais.`;
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
      "O certificado deste curso semipresencial só é emitido com toda a carga da parte prática presencial " +
      `registrada como satisfatória. ${textoDaPratica(pratica)}`,
  };
}

/** HH:MM de uma coluna time ("08:00:00" → "08:00"); vazio ou fora do formato vira null. */
const horaCurta = (hora: unknown): string | null => {
  const m = typeof hora === "string" ? /^(\d{2}:\d{2})/.exec(hora.trim()) : null;
  return m ? m[1] : null;
};

/** Uma sessão que valeu, como fica congelada em `dados.pratica.sessoes`. */
export interface SessaoNoCertificado {
  sessao_id: string;
  data: string | null;
  hora_inicio: string | null;
  hora_fim: string | null;
  local: string | null;
  instrutor: { nome: string | null; qualificacao: string | null };
  carga_horas: number | null;
}

export interface PraticaNoCertificado {
  /** A soma das cargas das sessões congeladas (horas). */
  carga_horas: number | null;
  resultado: "satisfatorio";
  /** As sessões que valeram, da mais antiga à mais recente. */
  sessoes: SessaoNoCertificado[];
}

/**
 * `dados.pratica` do certificado: as sessões que valeram (`situacaoDaPratica(...).sessoes`), CONGELADAS (entram no
 * hash). Só valores copiados (nenhuma referência ao objeto da sessão): o RH editar a sessão depois não muda o
 * certificado. Cada sessão leva dia, horário, local, instrutor e carga; `carga_horas` é a soma delas.
 */
export function dadosDaPraticaNoCertificado(sessoes: SessaoPratica[]): PraticaNoCertificado {
  const congeladas = [...sessoes].sort(noTempo).map((sessao): SessaoNoCertificado => {
    const carga = emCentesimos(sessao.carga_horas);
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
      carga_horas: carga > 0 ? carga / 100 : null,
    };
  });
  const total = sessoes.reduce((soma, s) => soma + emCentesimos(s.carga_horas), 0);
  return {
    carga_horas: total > 0 ? total / 100 : null,
    resultado: "satisfatorio",
    sessoes: congeladas,
  };
}

/**
 * `dados.local` do semipresencial: o ambiente da teoria (a plataforma) e o local da prática presencial (os locais
 * das sessões, sem repetir).
 */
export function localComPratica(
  base: { ambiente: string },
  sessoes: SessaoPratica[]
): { ambiente: string; pratica: string | null } {
  return { ambiente: base.ambiente, pratica: locaisDasSessoes([...sessoes].sort(noTempo)) || null };
}

/**
 * O dia em que o treinamento semipresencial termina: o maior entre a conclusão da teoria e o último dia das sessões
 * que valeram (null se nenhum dos dois é uma data). A validade conta DESTE dia, não da conclusão da teoria.
 */
export function fimDoSemipresencial(
  conclusaoDaTeoria: string | null | undefined,
  sessoes: SessaoPratica[]
): string | null {
  const dias = [
    diaValido(String(conclusaoDaTeoria ?? "").slice(0, 10)),
    ...sessoes.map((s) => diaValido(s.data)),
  ].filter((d): d is string => !!d);
  return dias.length ? dias.reduce((a, b) => (a >= b ? a : b)) : null;
}

/**
 * `dados.periodo` do semipresencial: o início e a conclusão passam a cobrir os dias da prática (que podem ser
 * antes do início da teoria ou depois da conclusão dela). A `validade`, quando vem, SUBSTITUI a da teoria: é a
 * contada do fim do treinamento (`fimDoSemipresencial` + validade do curso); sem o argumento, nada muda nela.
 */
export function periodoComPratica<
  P extends { inicio: string | null; conclusao: string | null; validade: string | null },
>(periodo: P, diasDaPratica: (string | null | undefined)[], validade?: string | null): P {
  const dias = diasDaPratica
    .map(diaValido)
    .filter((d): d is string => !!d)
    .sort();
  const comValidade = validade === undefined ? periodo : { ...periodo, validade };
  if (!dias.length) return comValidade;
  const primeiro = dias[0];
  const ultimo = dias[dias.length - 1];
  const inicio = periodo.inicio && periodo.inicio < primeiro ? periodo.inicio : primeiro;
  const conclusao = periodo.conclusao && periodo.conclusao > ultimo ? periodo.conclusao : ultimo;
  return { ...comValidade, inicio, conclusao };
}

/**
 * `dados.periodo` do certificado semipresencial (T12): o início e a conclusão cobrem os dias da prática e a validade
 * conta do FIM do treinamento (`fimDoSemipresencial`) com a validade em meses do curso. A `periodo.validade` que
 * vem da matrícula é a contada da conclusão da TEORIA e é substituída: num curso de 12 meses com a teoria concluída
 * em 01/10/2025 e a prática em 05/10/2026, o certificado sai com validade até 05/10/2027, e não até 01/10/2026
 * (já vencido). `periodo.conclusao` é a conclusão da teoria (`data_conclusao` da matrícula).
 */
export function periodoDoSemipresencial<
  P extends { inicio: string | null; conclusao: string | null; validade: string | null },
>(p: {
  periodo: P;
  sessoes: SessaoPratica[];
  validadeMeses?: number | null;
  modalidade?: string | null;
}): P {
  const fim = fimDoSemipresencial(p.periodo.conclusao, p.sessoes);
  return periodoComPratica(
    p.periodo,
    p.sessoes.map((s) => s.data),
    renovacaoAPartirDe(fim, p.validadeMeses, p.modalidade)
  );
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
  curso:
    | { id: string; modalidade?: string | null; carga_pratica_horas?: number | string | null }
    | null
    | undefined;
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
    cargaPraticaHoras: p.curso.carga_pratica_horas,
  });
  const aoAluno = pratica.sessoes.length ? pratica.sessoes : pratica.sessao ? [pratica.sessao] : [];
  return {
    situacao: pratica.situacao,
    data: pratica.sessao ? diaValido(pratica.sessao.data) : null,
    local: locaisDasSessoes(aoAluno) || null,
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
 * já foi conferida como do aluno (`minhaMatricula`). `cargaPraticaHoras` é a do curso (lido pelo chamador).
 * Falha em qualquer uma = `{ ok: false }` (quem emite responde 503): leitura que falha nunca vira "realizada".
 */
export async function lerPratica(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  p: {
    matriculaId: string;
    cursoId: string;
    empresaId: string;
    hoje: string;
    cargaPraticaHoras?: number | string | null;
  }
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
      cargaPraticaHoras: p.cargaPraticaHoras,
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
