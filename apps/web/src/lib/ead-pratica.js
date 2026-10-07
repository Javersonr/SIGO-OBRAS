/**
 * Parte prática presencial do curso semipresencial na tela do RH (T12) — regras puras, sem DOM e sem rede.
 *
 * O RH registra cada sessão prática (`treinamento_sessao_pratica`: data, horário, carga, local e instrutor) e,
 * nela, a presença e o resultado de cada matrícula (`treinamento_pratica_participante`), migração 0143. O
 * certificado do semipresencial só é emitido com uma participação "presente" e "satisfatório" numa sessão não
 * apagada do mesmo curso, já realizada (data até hoje, em Brasília). Quem decide é o servidor
 * (`supabase/functions/portal-funcionario/pratica.ts`); `situacaoDaPratica` e `podeEmitirSemipresencial` são o
 * espelho dele (o `pratica.test.ts` confere os dois contra os mesmos casos). O resto do arquivo é da tela: o
 * formulário da sessão, quem pode entrar nela e os rótulos.
 *
 * Só importa arquivos com a extensão (o teste do servidor carrega este arquivo direto, sem o resolvedor do Vite).
 */
import { formatarHoras } from "./ead-requisitos.js";

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const diaValido = (data) =>
  typeof data === "string" && DIA.test(data.trim()) ? data.trim() : null;
const momento = (s) => `${diaValido(s.data)}|${String(s.hora_inicio ?? "")}`;
const maisRecente = (a, b) => (momento(a) >= momento(b) ? a : b);
const maisProxima = (a, b) => (momento(a) <= momento(b) ? a : b);
const viva = (linha) => !!linha && !linha.deleted_at;

/**
 * Situação da parte prática de uma matrícula: `{ situacao, sessao }`, com `situacao` em "realizada" (presente e
 * satisfatório numa sessão já realizada; `sessao` = a mais recente), "agendada" (sessão de hoje em diante ainda
 * sem resultado; a mais próxima), "insatisfatoria" (o último resultado lançado; essa sessão) ou "pendente"
 * (`sessao` null). Espelho de `situacaoDaPratica` do servidor.
 */
export function situacaoDaPratica({
  matriculaId,
  cursoId,
  sessoes = [],
  participacoes = [],
  hoje,
}) {
  const sessaoPorId = new Map();
  for (const s of sessoes ?? []) {
    if (viva(s) && s.curso_id === cursoId && diaValido(s.data)) sessaoPorId.set(s.id, s);
  }
  const minhas = (participacoes ?? [])
    .filter((x) => viva(x) && x.matricula_id === matriculaId)
    .map((x) => ({ participacao: x, sessao: sessaoPorId.get(x.sessao_id) }))
    .filter((x) => !!x.sessao);

  const realizada = (s) => diaValido(s.data) <= hoje;
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
        diaValido(x.sessao.data) >= hoje &&
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

/** O semipresencial só emite com a prática realizada (presente e satisfatório). Espelho do servidor. */
export function podeEmitirSemipresencial(entrada) {
  return situacaoDaPratica(entrada).situacao === "realizada";
}

// ------------------------------------------------------------------------------------------------ a tela do RH

/** Resultados da participação (os valores são os do CHECK da migração 0143). */
export const RESULTADOS_DA_PRATICA = [
  { valor: "pendente", rotulo: "Pendente" },
  { valor: "satisfatorio", rotulo: "Satisfatório" },
  { valor: "insatisfatorio", rotulo: "Insatisfatório" },
];

export function rotuloDoResultado(valor) {
  return RESULTADOS_DA_PRATICA.find((r) => r.valor === valor)?.rotulo ?? "Pendente";
}

/**
 * Tamanhos máximos (os mesmos dos CHECK da 0143). O local tem 120 caracteres porque sai numa linha da frente do
 * certificado, junto com o ambiente da teoria, sem invadir as assinaturas.
 */
export const LIMITES_DA_SESSAO = {
  local: 120,
  instrutor_nome: 120,
  instrutor_qualificacao: 200,
  observacoes: 1000,
  observacao_participante: 300,
};

/** Formulário de uma sessão nova: hoje, a carga prática e o instrutor do curso já preenchidos. */
export function sessaoEmBranco(curso, hoje) {
  const carga = Number(curso?.carga_pratica_horas);
  return {
    data: hoje,
    hora_inicio: "",
    hora_fim: "",
    carga_horas: Number.isFinite(carga) && carga > 0 ? String(carga) : "",
    local: "",
    instrutor_nome: curso?.instrutor_nome || "",
    instrutor_qualificacao: curso?.instrutor_qualificacao || "",
    observacoes: "",
  };
}

const HORA = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/;
/** Minutos desde a meia-noite de "HH:MM" (ou "HH:MM:SS"); null se não for hora. */
const minutosDe = (hora) => {
  const m = typeof hora === "string" ? HORA.exec(hora.trim()) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const horaCurta = (hora) => {
  const m = typeof hora === "string" ? /^(\d{2}:\d{2})/.exec(hora.trim()) : null;
  return m ? m[1] : null;
};
const texto = (v) => (typeof v === "string" ? v.trim() : "");

/**
 * Confere o formulário da sessão e devolve o que vai para o banco: `{ ok: true, dados }` ou `{ ok: false, erro }`
 * (mensagem pronta para o toast). Data, horário de início e de fim, carga, local e instrutor são obrigatórios: a
 * lista de presença e o certificado imprimem os dados reais da sessão (D13). A carga aceita vírgula e não pode
 * passar do tempo entre o início e o fim (o intervalo de almoço só a reduz).
 */
export function validarSessao(form) {
  const data = diaValido(form?.data);
  if (!data) return { ok: false, erro: "Informe a data da sessão" };
  const inicio = minutosDe(form?.hora_inicio);
  const fim = minutosDe(form?.hora_fim);
  if (inicio === null || fim === null) {
    return { ok: false, erro: "Informe o horário de início e de fim da sessão (HH:MM)" };
  }
  if (fim <= inicio)
    return { ok: false, erro: "A sessão termina antes de começar: confira o horário" };
  const carga = Number(String(form?.carga_horas ?? "").replace(",", "."));
  if (!Number.isFinite(carga) || carga <= 0) {
    return { ok: false, erro: "Informe a carga horária da sessão (em horas)" };
  }
  if (Math.round(carga * 60) > fim - inicio) {
    return {
      ok: false,
      erro: `A carga de ${formatarHoras(carga)} não cabe no horário da sessão (${form.hora_inicio} às ${form.hora_fim})`,
    };
  }
  const local = texto(form?.local);
  if (local.length < 3) return { ok: false, erro: "Informe o local da sessão prática" };
  if (local.length > LIMITES_DA_SESSAO.local) {
    return { ok: false, erro: `O local tem de caber em ${LIMITES_DA_SESSAO.local} caracteres` };
  }
  const instrutor = texto(form?.instrutor_nome);
  if (!instrutor) return { ok: false, erro: "Informe o instrutor da sessão prática" };
  if (instrutor.length > LIMITES_DA_SESSAO.instrutor_nome) {
    return {
      ok: false,
      erro: `O nome do instrutor tem de caber em ${LIMITES_DA_SESSAO.instrutor_nome} caracteres`,
    };
  }
  const qualificacao = texto(form?.instrutor_qualificacao);
  if (qualificacao.length > LIMITES_DA_SESSAO.instrutor_qualificacao) {
    return {
      ok: false,
      erro: `A qualificação do instrutor tem de caber em ${LIMITES_DA_SESSAO.instrutor_qualificacao} caracteres`,
    };
  }
  const observacoes = texto(form?.observacoes);
  if (observacoes.length > LIMITES_DA_SESSAO.observacoes) {
    return {
      ok: false,
      erro: `As observações têm de caber em ${LIMITES_DA_SESSAO.observacoes} caracteres`,
    };
  }
  return {
    ok: true,
    dados: {
      data,
      hora_inicio: horaCurta(form.hora_inicio),
      hora_fim: horaCurta(form.hora_fim),
      carga_horas: carga,
      local,
      instrutor_nome: instrutor,
      instrutor_qualificacao: qualificacao || null,
      observacoes: observacoes || null,
    },
  };
}

/**
 * Aviso (não bloqueia) quando a sessão tem menos horas que a carga prática do curso: o certificado declara a carga
 * prática do curso, e a regra de emissão olha só presença e resultado numa sessão.
 */
export function avisoDaCargaDaSessao(sessao, curso) {
  const daSessao = Math.round((Number(sessao?.carga_horas) || 0) * 100);
  const doCurso = Math.round((Number(curso?.carga_pratica_horas) || 0) * 100);
  if (!daSessao || !doCurso || daSessao >= doCurso) return null;
  return (
    `A carga desta sessão (${formatarHoras(daSessao / 100)}) é menor que a carga prática do curso ` +
    `(${formatarHoras(doCurso / 100)}), que é a que sai no certificado. Confira antes de lançar os resultados.`
  );
}

const fmtDia = (dia) => (diaValido(dia) ? dia.split("-").reverse().join("/") : "—");

/** "05/10/2026 · 08:00 às 12:00 · 4 h · Local": a sessão numa linha, para a lista e o título dos diálogos. */
export function descricaoDaSessao(sessao) {
  const inicio = horaCurta(sessao?.hora_inicio);
  const fim = horaCurta(sessao?.hora_fim);
  return [
    fmtDia(sessao?.data),
    inicio && fim ? `${inicio} às ${fim}` : null,
    Number(sessao?.carga_horas) > 0 ? formatarHoras(sessao.carga_horas) : null,
    texto(sessao?.local) || null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** A sessão é de depois de hoje? (o banco não aceita presença nem resultado nela; a tela desliga os campos) */
export function sessaoNoFuturo(sessao, hoje) {
  const dia = diaValido(sessao?.data);
  return !!dia && dia > hoje;
}

/**
 * Quem pode ser incluído na sessão: matrículas vivas do curso, de funcionário ativo (não excluído), que ainda não
 * estão nela (participante apagado pode voltar). `[{ matricula, funcionario }]` em ordem de nome.
 */
export function matriculasParaASessao({
  cursoId,
  matriculas = [],
  participantes = [],
  funcionarios,
}) {
  const naSessao = new Set((participantes ?? []).filter(viva).map((p) => p.matricula_id));
  const funcionario = (id) =>
    funcionarios instanceof Map
      ? funcionarios.get(id)
      : (funcionarios ?? []).find((f) => f.id === id);
  return (matriculas ?? [])
    .filter((m) => viva(m) && m.curso_id === cursoId && !naSessao.has(m.id))
    .map((m) => ({ matricula: m, funcionario: funcionario(m.funcionario_id) }))
    .filter(({ funcionario: f }) => viva(f) && f.ativo !== false)
    .sort((a, b) =>
      String(a.funcionario.nome_completo || "").localeCompare(
        String(b.funcionario.nome_completo || ""),
        "pt-BR"
      )
    );
}

/** Contagem da sessão (só participantes vivos). */
export function resumoDaSessao(participantes = []) {
  const vivos = (participantes ?? []).filter(viva);
  return {
    total: vivos.length,
    presentes: vivos.filter((p) => p.presente === true).length,
    satisfatorios: vivos.filter((p) => p.resultado === "satisfatorio").length,
    insatisfatorios: vivos.filter((p) => p.resultado === "insatisfatorio").length,
    pendentes: vivos.filter((p) => !p.resultado || p.resultado === "pendente").length,
  };
}

/**
 * Confere a linha de presença e resultado antes de gravar: `{ ok: true, dados }` ou `{ ok: false, erro }`.
 * "Satisfatório" exige presença (o banco também recusa); quem lança a avaliação e quando são gravados pelo banco.
 */
export function participanteParaGravar(linha) {
  const resultado = linha?.resultado || "pendente";
  if (!RESULTADOS_DA_PRATICA.some((r) => r.valor === resultado)) {
    return { ok: false, erro: "Resultado inválido" };
  }
  const presente = linha?.presente === true;
  if (resultado === "satisfatorio" && !presente) {
    return { ok: false, erro: "Só quem esteve presente pode ter resultado satisfatório" };
  }
  const observacao = texto(linha?.observacao);
  if (observacao.length > LIMITES_DA_SESSAO.observacao_participante) {
    return {
      ok: false,
      erro: `A observação tem de caber em ${LIMITES_DA_SESSAO.observacao_participante} caracteres`,
    };
  }
  return { ok: true, dados: { presente, resultado, observacao: observacao || null } };
}

const horasOuNull = (valor) => {
  const n = Number(String(valor ?? "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * A divisão da carga que o "Salvar curso" grava (colunas da 0143): só o semipresencial grava a carga teórica e a
 * prática; vazio, zero ou inválido viram null (o banco recusa zero e o requisito CARGAS mostra o que falta). Nos
 * outros cursos as duas são limpas (null) se o curso GRAVADO (`gravado`) tinha alguma: o EAD inteiro é teoria a
 * distância e o apoio não emite certificado. Curso que nunca as teve não manda as colunas: salvar um curso EAD
 * continua funcionando mesmo se o site novo for publicado antes da migração 0143.
 */
export function cargasDoCursoParaGravar(curso, gravado = null) {
  if ((curso?.modalidade || "ead") !== "semipresencial") {
    const tinha = gravado?.carga_teorica_horas != null || gravado?.carga_pratica_horas != null;
    return tinha ? { carga_teorica_horas: null, carga_pratica_horas: null } : {};
  }
  return {
    carga_teorica_horas: horasOuNull(curso.carga_teorica_horas),
    carga_pratica_horas: horasOuNull(curso.carga_pratica_horas),
  };
}

/** Tipos e tamanho da lista de presença assinada digitalizada (bucket `treinamentos`). */
export const ACCEPT_LISTA_ASSINADA = "application/pdf,image/png,image/jpeg";
const TIPOS_DA_LISTA = ACCEPT_LISTA_ASSINADA.split(",");
export const MAX_LISTA_MB = 15;

/** Confere o arquivo da lista assinada antes de enviar: `{ ok: true }` ou `{ ok: false, erro }`. */
export function validarArquivoDaLista(arquivo) {
  if (!arquivo) return { ok: false, erro: "Escolha o arquivo da lista assinada" };
  if (!TIPOS_DA_LISTA.includes(arquivo.type)) {
    return { ok: false, erro: "A lista assinada tem de ser PDF ou foto (PNG ou JPEG)" };
  }
  if (Number(arquivo.size) > MAX_LISTA_MB * 1024 * 1024) {
    return { ok: false, erro: `A lista assinada tem de ter até ${MAX_LISTA_MB} MB` };
  }
  return { ok: true };
}
