/**
 * Tipos de aula e a "Nova aula" da tela do RH (aba Treinamentos EAD) — regra pura, sem DOM e sem rede.
 *
 * Atividades interativas (spec 2026-10-14, §5.2): além de vídeo, PDF e texto, a aula pode ser questionário do
 * módulo, caso com decisões ou atividade de estudo (tarefa). As aulas sem arquivo (texto e as três atividades) são
 * montadas aqui; vídeo e PDF continuam na tela, que sobe o arquivo. O tempo informado é o tempo PREVISTO: soma na
 * carga horária (requisito LASTRO) e, fora do vídeo, não decide a conclusão (A5).
 *
 * Quem usa: components/seguranca/TreinamentosEadTab.jsx e AulaLinhaEad.jsx. Testes: ead-aula-nova.test.js.
 */

/** Os botões de tipo da "Nova aula", na ordem da tela. */
export const TIPOS_DE_AULA = Object.freeze([
  Object.freeze({ valor: "video", rotulo: "Vídeo" }),
  Object.freeze({ valor: "pdf", rotulo: "PDF" }),
  Object.freeze({ valor: "texto", rotulo: "Texto" }),
  Object.freeze({ valor: "questionario", rotulo: "Questionário" }),
  Object.freeze({ valor: "caso", rotulo: "Caso" }),
  Object.freeze({ valor: "tarefa", rotulo: "Tarefa" }),
]);

/** As atividades interativas (concluem pelas ações próprias ou pelo "Fiz a atividade"). */
export const TIPOS_DE_ATIVIDADE = Object.freeze(["questionario", "caso", "tarefa"]);

const NOME_DO_TIPO = {
  video: "Vídeo",
  pdf: "Apostila em PDF",
  texto: "Texto",
  questionario: "Questionário do módulo",
  caso: "Caso com decisões",
  tarefa: "Atividade de estudo",
};

/** Nome do tipo para a linha da aula; aula antiga, sem tipo, é vídeo. Tipo desconhecido aparece como veio. */
export function nomeDoTipoDeAula(tipo) {
  const t = tipo || "video";
  return Object.hasOwn(NOME_DO_TIPO, t) ? NOME_DO_TIPO[t] : String(t);
}

export function ehAtividade(tipo) {
  return TIPOS_DE_ATIVIDADE.includes(tipo);
}

/** Maior tempo previsto aceito numa aula (24 h): acima disso é engano de digitação. */
export const LIMITE_DE_MINUTOS_DA_AULA = 1440;

/** Minutos digitados (número ou texto, vírgula decimal) em segundos inteiros; inválido ou fora da faixa vale 0. */
export function segundosDosMinutos(valor) {
  if (valor === null || valor === undefined) return 0;
  const n = Number(String(valor).trim().replace(",", "."));
  if (!Number.isFinite(n) || n <= 0 || n > LIMITE_DE_MINUTOS_DA_AULA) return 0;
  return Math.round(n * 60);
}

/** O rótulo do campo de tempo: leitura no PDF e no texto; tempo previsto nas atividades. */
export function rotuloDoTempo(tipo) {
  return tipo === "pdf" || tipo === "texto"
    ? "Tempo previsto de leitura (min)"
    : "Tempo previsto (min)";
}

const SEM_ARQUIVO = ["texto", ...TIPOS_DE_ATIVIDADE];
const ERRO_DO_TEXTO = {
  texto: "Escreva o texto da aula",
  tarefa: "Escreva as instruções da atividade (o que fazer e o que produzir)",
};
const erroDoTempo = (tipo) =>
  tipo === "pdf" || tipo === "texto"
    ? "Informe o tempo previsto de leitura (minutos)"
    : "Informe o tempo previsto (minutos)";
const textoLimpo = (v) => (typeof v === "string" ? v.trim() : "");

/**
 * Os dados de uma aula nova SEM arquivo (texto, questionário, caso, tarefa), a partir do formulário da tela
 * (`{ tipo, minutos, texto }`). Questionário e caso nascem sem texto (as questões e o roteiro vêm depois); texto e
 * tarefa exigem o texto. Devolve `{ ok: true, dados }` (campos da linha de `treinamento_aula`, sem título, módulo e
 * ordem) ou `{ ok: false, erro }`.
 */
export function montarAulaSemArquivo(novaAula) {
  const tipo = novaAula?.tipo;
  if (!SEM_ARQUIVO.includes(tipo)) {
    return { ok: false, erro: "Este tipo de aula precisa de arquivo ou link" };
  }
  const duracao_seg = segundosDosMinutos(novaAula.minutos);
  if (!duracao_seg) return { ok: false, erro: erroDoTempo(tipo) };
  const comTexto = tipo === "texto" || tipo === "tarefa";
  const texto = textoLimpo(novaAula.texto);
  if (comTexto && !texto) return { ok: false, erro: ERRO_DO_TEXTO[tipo] };
  return {
    ok: true,
    dados: {
      fonte: "upload",
      youtube_id: null,
      arquivo_ref: null,
      conteudo_texto: comTexto ? texto : null,
      duracao_seg,
    },
  };
}

/**
 * O que a edição de uma aula que não é vídeo grava, além do título e do módulo: o tempo previsto e, no texto e na
 * tarefa, o texto (§5.2: antes a tela não editava o texto, e a correção era por SQL). `{ ok: true, patch }` ou
 * `{ ok: false, erro }`.
 */
export function camposDaEdicaoSemVideo(edicao) {
  const tipo = edicao?.tipo;
  const duracao_seg = segundosDosMinutos(edicao?.minutos);
  if (!duracao_seg) return { ok: false, erro: erroDoTempo(tipo) };
  if (tipo !== "texto" && tipo !== "tarefa") return { ok: true, patch: { duracao_seg } };
  const texto = textoLimpo(edicao.texto);
  if (!texto) return { ok: false, erro: ERRO_DO_TEXTO[tipo] };
  return { ok: true, patch: { duracao_seg, conteudo_texto: texto } };
}

const porOrdem = (a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0);

/**
 * As questões do curso separadas: `prova` (sem `aula_id`: a avaliação final) e `porAula` (Map aula_id → questões
 * do questionário daquela aula). Cada grupo em ordem; apagadas ficam de fora. A lista recebida não muda.
 */
export function separarQuestoes(questoes) {
  const prova = [];
  const porAula = new Map();
  for (const q of Array.isArray(questoes) ? questoes : []) {
    if (!q || q.deleted_at) continue;
    if (q.aula_id) {
      const doQuestionario = porAula.get(q.aula_id) ?? [];
      doQuestionario.push(q);
      porAula.set(q.aula_id, doQuestionario);
    } else {
      prova.push(q);
    }
  }
  prova.sort(porOrdem);
  for (const lista of porAula.values()) lista.sort(porOrdem);
  return { prova, porAula };
}

/** A ordem da próxima questão do grupo (a maior + 1). */
export function proximaOrdem(questoes) {
  return (
    Math.max(0, ...(Array.isArray(questoes) ? questoes : []).map((q) => Number(q?.ordem) || 0)) + 1
  );
}

/**
 * Selos da linha de uma atividade na lista de aulas: `resumo` (ex.: "8 questões") e `pendencia` (o que impede o
 * aluno de fazer a aula: "sem questões", "sem roteiro", "sem instruções"). Vídeo, PDF e texto: nada daqui.
 */
export function situacaoDaAtividade(aula, { questoes = [], temRoteiro = false } = {}) {
  const tipo = aula?.tipo;
  if (tipo === "questionario") {
    const n = Array.isArray(questoes) ? questoes.length : 0;
    return n
      ? { resumo: n === 1 ? "1 questão" : `${n} questões`, pendencia: null }
      : { resumo: null, pendencia: "sem questões" };
  }
  if (tipo === "caso") return { resumo: null, pendencia: temRoteiro ? null : "sem roteiro" };
  if (tipo === "tarefa") {
    return { resumo: null, pendencia: textoLimpo(aula.conteudo_texto) ? null : "sem instruções" };
  }
  return { resumo: null, pendencia: null };
}
