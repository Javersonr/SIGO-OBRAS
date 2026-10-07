/**
 * Parte prática presencial do curso semipresencial na tela do RH (T12) — regras puras, sem DOM e sem rede.
 *
 * O RH registra cada sessão prática (`treinamento_sessao_pratica`: data, horário, carga, local e instrutor) e,
 * nela, a presença e o resultado de cada matrícula (`treinamento_pratica_participante`), migração 0143. O
 * certificado do semipresencial só é emitido com a CARGA da prática cumprida: a soma das cargas das sessões não
 * apagadas do mesmo curso, já realizadas (data até hoje, em Brasília), em que a matrícula esteve "presente" e
 * "satisfatório" tem de chegar à carga prática do curso. Quem decide é o servidor
 * (`supabase/functions/portal-funcionario/pratica.ts`); `situacaoDaPratica` e `podeEmitirSemipresencial` são o
 * espelho dele (o `pratica.test.ts` confere os dois contra os mesmos casos). NENHUMA tela os usa hoje (A6, T12 N7):
 * existem só para a paridade das duas cópias, e a tela do RH ainda não mostra "8 h de 16 h" por aluno nem quem já
 * pode emitir; quem os ligar a uma tela mantém a regra em um lugar só. O resto do arquivo é da tela: o formulário
 * da sessão, quem pode entrar nela e os rótulos.
 *
 * Só importa arquivos com a extensão (o teste do servidor carrega este arquivo direto, sem o resolvedor do Vite).
 */
import { formatarHoras } from "./ead-requisitos.js";
import { diaBrasilia } from "./data-brasilia.js";

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const diaValido = (data) =>
  typeof data === "string" && DIA.test(data.trim()) ? data.trim() : null;
const momento = (s) => `${diaValido(s.data)}|${String(s.hora_inicio ?? "")}`;
const maisRecente = (a, b) => (momento(a) >= momento(b) ? a : b);
const maisProxima = (a, b) => (momento(a) <= momento(b) ? a : b);
const noTempo = (a, b) => (momento(a) < momento(b) ? -1 : momento(a) > momento(b) ? 1 : 0);
const viva = (linha) => !!linha && !linha.deleted_at;

/** Horas em centésimos de hora (inteiro: a soma não carrega erro de ponto flutuante). Valor que não é > 0 vale 0. */
const emCentesimos = (horas) => {
  const n = Number(horas);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
};

/** Minutos desde 00:00 de "HH:MM" ou "HH:MM:SS"; null se não for um horário. */
const minutosDoDia = (hora) => {
  const m = typeof hora === "string" ? /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(hora.trim()) : null;
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
};

/**
 * Horas (em centésimos) que as sessões de UMA matrícula realmente cobrem (A6, T12 N1). A soma das cargas
 * declaradas inflava quando o RH lançava a mesma sessão duas vezes (mesmo dia e horário), ou duas sessões que
 * se cruzam: duas de 8 h iguais davam 16 h de prática para um dia só. Por dia: a mesma sessão lançada mais de uma
 * vez (mesmo início e mesmo fim) vale uma vez, com a maior carga (A7: com a carga menor que o horário, como 4 h
 * das 08 às 17, a união dos horários não a segurava e ela contava em dobro); depois, a soma das cargas limitada ao
 * tempo de relógio que os horários das sessões do dia cobrem (a união dos intervalos): as que se cruzam valem o
 * tempo coberto, e os turnos separados (manhã e tarde) somam. Sessão sem horário válido (o CHECK do banco não
 * deixa, mas a regra não presume) vale a carga declarada, sem limite. Dias diferentes sempre somam. Quem muda esta
 * conta muda também a cópia do front (lib/ead-pratica.js).
 */
function creditoEmCentesimos(sessoes) {
  const porDia = new Map();
  for (const s of sessoes) {
    const dia = diaValido(s.data) ?? "";
    porDia.set(dia, [...(porDia.get(dia) ?? []), s]);
  }
  let total = 0;
  for (const doDia of porDia.values()) {
    // a mesma sessão lançada mais de uma vez (mesmo início e fim no dia) vale uma vez, com a maior carga
    const porHorario = new Map();
    for (const s of doDia) {
      const carga = emCentesimos(s.carga_horas);
      const de = minutosDoDia(s.hora_inicio);
      const ate = minutosDoDia(s.hora_fim);
      if (de !== null && ate !== null && ate > de) {
        const chave = `${de}-${ate}`;
        const anterior = porHorario.get(chave);
        if (!anterior || carga > anterior.carga) porHorario.set(chave, { de, ate, carga });
      } else {
        total += carga;
      }
    }
    const intervalos = [];
    let declarada = 0; // as cargas das sessões do dia que têm horário válido (uma por horário)
    for (const { de, ate, carga } of porHorario.values()) {
      intervalos.push([de, ate]);
      declarada += carga;
    }
    intervalos.sort((a, b) => a[0] - b[0]);
    let coberto = 0;
    let fimAtual = -1;
    for (const [de, ate] of intervalos) {
      if (de > fimAtual) {
        coberto += ate - de;
        fimAtual = ate;
      } else if (ate > fimAtual) {
        coberto += ate - fimAtual;
        fimAtual = ate;
      }
    }
    total += Math.min(declarada, Math.round((coberto / 60) * 100));
  }
  return total;
}

/**
 * As sessões que valem no certificado: da mais antiga em diante, as primeiras cuja soma cobre a carga exigida (a
 * sessão que não acrescenta tempo, como a lançada duas vezes, fica de fora). Sem carga exigida, a mais recente.
 * `satisfatorias` já vem da mais antiga à mais recente.
 */
function sessoesQueValeram(satisfatorias, exigida) {
  if (exigida === null) return satisfatorias.slice(-1);
  const valeram = [];
  let credito = 0;
  for (const s of satisfatorias) {
    const novo = creditoEmCentesimos([...valeram, s]);
    if (novo <= credito) continue;
    valeram.push(s);
    credito = novo;
    if (credito >= exigida) break;
  }
  return valeram;
}

/**
 * Situação da parte prática de uma matrícula: `{ situacao, sessao, sessoes, cumpridaHoras, exigidaHoras }`, com
 * `situacao` em "realizada" (a carga prática do curso está coberta pela soma das sessões já realizadas em que a
 * matrícula esteve presente e satisfatória; `sessoes` = as que valeram, da mais antiga à mais recente, e `sessao` =
 * a última), "agendada" (sessão de hoje em diante ainda sem resultado; a mais próxima), "insatisfatoria" (o último
 * resultado lançado; essa sessão), "parcial" (há sessão satisfatória, mas a soma ainda não cobre a carga) ou
 * "pendente" (`sessao` null). `cargaPraticaHoras` é a carga prática do curso (sem ela, vale uma sessão
 * satisfatória). Espelho de `situacaoDaPratica` do servidor.
 */
export function situacaoDaPratica({
  matriculaId,
  cursoId,
  sessoes = [],
  participacoes = [],
  hoje,
  cargaPraticaHoras = null,
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
  // uma sessão conta uma vez só, mesmo que a matrícula apareça duas vezes nela
  const satisfatoriasPorId = new Map();
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
  const cumprida = creditoEmCentesimos(satisfatorias);
  const exigida = emCentesimos(cargaPraticaHoras) || null;
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
        diaValido(x.sessao.data) >= hoje &&
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
 * O semipresencial só emite com a prática realizada (presente e satisfatório, com a carga prática do curso coberta
 * pela soma das sessões). Espelho do servidor.
 */
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
 * Aviso (não bloqueia) quando a sessão tem menos horas que a carga prática do curso. O certificado declara a carga
 * prática do curso, e o servidor só o emite quando a SOMA das cargas das sessões satisfatórias do aluno chega a
 * ela: uma sessão curta é normal na prática de vários dias, mas o RH precisa saber que faltam sessões.
 */
export function avisoDaCargaDaSessao(sessao, curso) {
  const daSessao = emCentesimos(sessao?.carga_horas);
  const doCurso = emCentesimos(curso?.carga_pratica_horas);
  if (!daSessao || !doCurso || daSessao >= doCurso) return null;
  return (
    `A carga desta sessão (${formatarHoras(daSessao / 100)}) é menor que a carga prática do curso ` +
    `(${formatarHoras(doCurso / 100)}), que é a que sai no certificado. O certificado só é liberado quando a ` +
    "soma das sessões satisfatórias do aluno chegar a essa carga: registre as demais sessões."
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

/** A linha de presença e resultado de um participante como a tela a edita. */
export const linhaDoParticipante = (p) => ({
  presente: p?.presente === true,
  resultado: p?.resultado || "pendente",
  observacao: p?.observacao || "",
});

/** As duas linhas (de `linhaDoParticipante`) diferem? */
export const linhaMudou = (a, b) =>
  a.presente !== b.presente || a.resultado !== b.resultado || a.observacao !== b.observacao;

/**
 * O rascunho da lista de presença depois de recarregar os participantes (A6, T12 M6). Recarregar (incluir um
 * participante, salvar outra linha) zerava tudo o que o RH tinha marcado e ainda não salvo. Agora: a linha que ele
 * MEXEU (rascunho diferente do que estava gravado antes) fica como está; a que ele não mexeu recebe o gravado novo;
 * participante novo entra com o gravado; o que saiu da sessão some. `rascunhos`, `antigas` e `novas` são mapas
 * id -> linha (`linhaDoParticipante`).
 */
export function mesclarRascunhos({ rascunhos, antigas, novas } = {}) {
  const saida = {};
  for (const [id, nova] of Object.entries(novas ?? {})) {
    const rascunho = rascunhos?.[id];
    const antiga = antigas?.[id];
    saida[id] = rascunho && antiga && linhaMudou(rascunho, antiga) ? rascunho : nova;
  }
  return saida;
}

const SITUACAO_DA_MATRICULA = {
  pendente: "pendente",
  em_andamento: "em andamento",
  concluido: "concluída",
};

/**
 * Rótulo curto da matrícula na lista de quem pode entrar na sessão (A6, T12 N3): "matrícula de 05/10/2026,
 * concluída". A renovação cria uma matrícula nova e deixa a antiga, concluída e já certificada, viva: o mesmo
 * funcionário aparece duas vezes com o mesmo nome, e marcar a antiga deixa a nova "pendente". O dia é o de Brasília.
 */
export function rotuloDaMatriculaDoCandidato(matricula) {
  if (!matricula) return "";
  const dia = matricula.created_at ? diaBrasilia(matricula.created_at) : "";
  const situacao = SITUACAO_DA_MATRICULA[matricula.status] ?? "";
  const comDia = dia && dia !== "—" ? `matrícula de ${dia}` : "matrícula";
  if (!situacao) return comDia;
  return comDia === "matrícula" ? `${comDia} ${situacao}` : `${comDia}, ${situacao}`;
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
