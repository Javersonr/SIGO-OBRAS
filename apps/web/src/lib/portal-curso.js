/**
 * Estados do portal e navegação entre aulas (T14) — regras puras, sem DOM e sem rede.
 *
 * Quem usa: pages/PortalFuncionario.jsx (lista de cursos), components/portal-funcionario/
 * CursoPortal.jsx e AvaliacaoPortal.jsx (aulas, prova), e as telas do RH (numeração das aulas).
 * Testes em portal-curso.test.js. O `localStorage` entra por parâmetro (nos testes é um objeto
 * em memória) e toda leitura/gravação nele tolera falha: navegador sem storage só perde o
 * "retomar", nunca trava o aluno.
 */

// ---------------------------------------------------------------- aulas

/** Aulas numeradas pela posição na lista (1, 2, 3...), na ordem recebida. A coluna `ordem` não aparece. */
export function numerarAulas(aulas) {
  if (!Array.isArray(aulas)) return [];
  return aulas.map((a, i) => ({ ...a, numero: i + 1 }));
}

/**
 * A aula que o aluno deve fazer agora: a primeira não concluída. O bloqueio é linear, então ela é
 * a única liberada ainda aberta; se vier bloqueada (dado inconsistente), devolve null para o portal
 * mostrar a lista em vez de abrir uma aula que o servidor recusaria.
 */
export function proximaAulaPendente(aulas) {
  if (!Array.isArray(aulas)) return null;
  const pendente = aulas.find((a) => a && !a.concluida);
  return pendente && pendente.liberada ? pendente : null;
}

/**
 * A aula logo depois da informada, se já estiver liberada (botão "Próxima aula"). Segue a ordem do
 * curso: quem revê uma aula antiga vai para a seguinte, não para a pendente (essa é `proximaAulaPendente`).
 */
export function aulaSeguinte(aulas, aulaId) {
  if (!Array.isArray(aulas) || !aulaId) return null;
  const i = aulas.findIndex((a) => a?.id === aulaId);
  const seguinte = i >= 0 ? aulas[i + 1] : null;
  return seguinte && seguinte.liberada ? seguinte : null;
}

/** Aulas feitas e total do curso; `semAulas` = curso sem nenhuma aula cadastrada. */
export function progressoDoCurso(aulas) {
  const lista = Array.isArray(aulas) ? aulas.filter(Boolean) : [];
  const total = lista.length;
  const feitas = lista.filter((a) => a.concluida).length;
  return {
    total,
    feitas,
    percentual: total ? Math.floor((feitas * 100) / total) : 0,
    semAulas: total === 0,
  };
}

// ----------------------------------------------------------- matrículas

const CHAVE_ORDEM_STATUS = { em_andamento: 0, pendente: 1 };
const COLATOR = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });

const quando = (v) => {
  const t = v ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? t : null;
};

const nomeDoCurso = (item) => String(item?.curso?.nome ?? "");

/** Concluídos: o mais recente primeiro; sem data vai para o fim. */
function compararConcluidos(a, b) {
  const ta = quando(a.matricula?.data_conclusao);
  const tb = quando(b.matricula?.data_conclusao);
  if (ta !== tb) {
    if (ta === null) return 1;
    if (tb === null) return -1;
    return tb - ta;
  }
  return compararAtribuicao(b, a) || COLATOR.compare(nomeDoCurso(a), nomeDoCurso(b));
}

/** Pela data em que o RH atribuiu o curso; sem data, nada a dizer. */
function compararAtribuicao(a, b) {
  const ta = quando(a.matricula?.created_at);
  const tb = quando(b.matricula?.created_at);
  if (ta === tb) return 0;
  if (ta === null) return 1;
  if (tb === null) return -1;
  return ta - tb;
}

/**
 * Ordem da lista do aluno: em andamento, depois os ainda não iniciados (a atribuição mais antiga
 * primeiro, depois o nome do curso) e, no fim, os concluídos (o mais recente primeiro). Uma
 * renovação (nova matrícula do mesmo curso) fica antes da antiga. Não altera a lista recebida.
 */
export function ordenarMatriculas(itens) {
  if (!Array.isArray(itens)) return [];
  const rank = (i) => {
    const s = i?.matricula?.status;
    if (s === "concluido") return 99;
    return CHAVE_ORDEM_STATUS[s] ?? 2;
  };
  return itens
    .filter(Boolean)
    .map((item, indice) => ({ item, indice }))
    .sort((x, y) => {
      const ra = rank(x.item);
      const rb = rank(y.item);
      if (ra !== rb) return ra - rb;
      const c =
        ra === 99
          ? compararConcluidos(x.item, y.item)
          : compararAtribuicao(x.item, y.item) ||
            COLATOR.compare(nomeDoCurso(x.item), nomeDoCurso(y.item));
      return c || x.indice - y.indice;
    })
    .map((x) => x.item);
}

/** `{ andamento, concluidos }`, cada grupo já ordenado (a tela mostra "Concluídos" separado). */
export function agruparMatriculas(itens) {
  const ordenados = ordenarMatriculas(itens);
  return {
    andamento: ordenados.filter((i) => i.matricula?.status !== "concluido"),
    concluidos: ordenados.filter((i) => i.matricula?.status === "concluido"),
  };
}

/** Matrícula ainda não concluída de um curso que o aluno já concluiu antes: é a renovação. */
export function ehRenovacao(item, itens) {
  if (!item?.matricula || !Array.isArray(itens) || item.matricula.status === "concluido") {
    return false;
  }
  const cursoId = item.matricula.curso_id;
  return itens.some(
    (o) =>
      o?.matricula?.id !== item.matricula.id &&
      o?.matricula?.curso_id === cursoId &&
      o.matricula.status === "concluido"
  );
}

/** O RH tirou o curso de publicação (`curso.ativo` vem do servidor; ausente = publicado). */
export function cursoDespublicado(curso) {
  return curso?.ativo === false;
}

// -------------------------------------------------- retomar o vídeo

/** Abaixo disto o vídeo recomeça do início; também nos últimos segundos antes do fim. */
export const MARGEM_RETOMADA_SEG = 5;

export const PREFIXO_POSICAO = "sigo_portal_pos:";
export const PREFIXO_PROVA = "sigo_portal_prova:";

const segundosValidos = (v) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);

/**
 * Segundo em que o vídeo deve voltar a tocar. A posição guardada no aparelho (último ponto em
 * que o aluno parou) vale mais que o tempo contado pelo servidor, que serve quando ela não
 * existe (outro aparelho). Aula concluída, começo e fim do vídeo recomeçam do início.
 */
export function posicaoParaRetomar({ salva, segundosAssistidos, duracao, concluida } = {}) {
  if (concluida) return 0;
  const candidata = segundosValidos(salva) ?? segundosValidos(segundosAssistidos);
  if (candidata === null) return 0;
  const pos = Math.floor(candidata);
  if (pos < MARGEM_RETOMADA_SEG) return 0;
  const d = segundosValidos(duracao);
  if (d && pos >= d - MARGEM_RETOMADA_SEG) return 0;
  return pos;
}

function tentar(fn, padrao) {
  try {
    return fn();
  } catch {
    return padrao;
  }
}

const chavePosicao = (matriculaId, aulaId) => `${PREFIXO_POSICAO}${matriculaId}:${aulaId}`;

/** Guarda o segundo atual do vídeo (para baixo). Valor inválido não sobrescreve o que havia. */
export function guardarPosicao(storage, matriculaId, aulaId, segundos) {
  const s = segundosValidos(segundos);
  if (!storage || s === null) return;
  tentar(() => storage.setItem(chavePosicao(matriculaId, aulaId), String(Math.floor(s))));
}

/** Posição guardada (inteiro em segundos) ou null. */
export function lerPosicao(storage, matriculaId, aulaId) {
  if (!storage) return null;
  const bruto = tentar(() => storage.getItem(chavePosicao(matriculaId, aulaId)), null);
  if (bruto === null || bruto === "") return null;
  const n = Number(bruto);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

// ---------------------------------------------------------------- prova

const respondida = (v) => Number.isInteger(v) && v >= 0;

/**
 * Quantas questões já têm resposta e qual é a primeira sem resposta (índice na ordem exibida,
 * -1 se não falta nenhuma). Resposta 0 (primeira alternativa) conta como respondida.
 */
export function resumoRespostas(questoes, respostas) {
  const lista = Array.isArray(questoes) ? questoes.filter(Boolean) : [];
  const r = respostas && typeof respostas === "object" ? respostas : {};
  const feitas = lista.filter((q) => respondida(r[q.id])).length;
  return {
    total: lista.length,
    respondidas: feitas,
    faltam: lista.length - feitas,
    primeiraSemResposta: lista.findIndex((q) => !respondida(r[q.id])),
    completa: lista.length > 0 && feitas === lista.length,
  };
}

/** Só as respostas de questões que ainda existem e para alternativas que ainda existem. */
export function respostasValidas(questoes, respostas) {
  if (!Array.isArray(questoes) || !respostas || typeof respostas !== "object") return {};
  const saida = {};
  for (const q of questoes) {
    const v = respostas[q?.id];
    if (respondida(v) && v < (q.opcoes?.length ?? 0)) saida[q.id] = v;
  }
  return saida;
}

const chaveProva = (matriculaId, tentativa) => `${PREFIXO_PROVA}${matriculaId}:${tentativa}`;

/** Guarda as respostas da prova em andamento (por matrícula e tentativa). Sem respostas, apaga. */
export function guardarRascunhoProva(storage, matriculaId, tentativa, respostas) {
  if (!storage) return;
  const limpas = {};
  for (const [id, v] of Object.entries(
    respostas && typeof respostas === "object" ? respostas : {}
  )) {
    if (respondida(v)) limpas[id] = v;
  }
  const chave = chaveProva(matriculaId, tentativa);
  if (Object.keys(limpas).length === 0) {
    tentar(() => storage.removeItem(chave));
    return;
  }
  tentar(() =>
    storage.setItem(chave, JSON.stringify({ respostas: limpas, salvoEm: new Date().toISOString() }))
  );
}

/** Respostas guardadas que ainda valem para esta prova (a prova pode ter mudado). */
export function lerRascunhoProva(storage, matriculaId, tentativa, questoes) {
  if (!storage) return {};
  const bruto = tentar(() => storage.getItem(chaveProva(matriculaId, tentativa)), null);
  if (!bruto) return {};
  const dados = tentar(() => JSON.parse(bruto), null);
  const respostas = dados && typeof dados === "object" ? dados.respostas : null;
  if (!respostas || typeof respostas !== "object" || Array.isArray(respostas)) return {};
  return respostasValidas(questoes, respostas);
}

export function limparRascunhoProva(storage, matriculaId, tentativa) {
  if (!storage) return;
  tentar(() => storage.removeItem(chaveProva(matriculaId, tentativa)));
}

/** Ao sair do portal: apaga o que o portal guardou no aparelho (posições e respostas de prova). */
export function limparRascunhosPortal(storage) {
  if (!storage) return;
  tentar(() => {
    const chaves = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && (k.startsWith(PREFIXO_POSICAO) || k.startsWith(PREFIXO_PROVA))) chaves.push(k);
    }
    for (const k of chaves) storage.removeItem(k);
  });
}

// ------------------------------------------------ nova tentativa da prova

/** Maior espera que o `setTimeout` aceita (acima disso dispara na hora). */
export const MAX_ESPERA_MS = 2147483647;

/** Milissegundos até `proxima_em`, no máximo `MAX_ESPERA_MS`; 0 se já passou ou não há horário. */
export function msAteLiberar(proximaEm, agora) {
  const t = proximaEm ? Date.parse(proximaEm) : NaN;
  if (!Number.isFinite(t)) return 0;
  const falta = t - agora;
  return falta > 0 ? Math.min(falta, MAX_ESPERA_MS) : 0;
}

/** A nova tentativa da prova ainda não está liberada (o intervalo entre tentativas não acabou). */
export function provaAguardando(proximaEm, agora) {
  return msAteLiberar(proximaEm, agora) > 0;
}

// --------------------------------------------------------- mensagens

export const MSG_SEM_CONEXAO =
  "Não foi possível falar com o servidor. Verifique sua conexão com a internet e tente de novo.";
export const MSG_FALHA_PADRAO = "Algo deu errado. Tente de novo; se continuar, avise o RH.";

const FALHA_DE_REDE =
  /failed to send a request|relay error|failed to fetch|networkerror|load failed|network request failed/i;

/**
 * Texto do erro para o aluno. As falhas de conexão chegam em inglês (supabase-js e navegadores):
 * viram uma frase em português. O que o servidor respondeu (já em português) passa como veio.
 */
export function mensagemDeFalha(erro) {
  const texto = typeof erro?.message === "string" ? erro.message.trim() : "";
  if (!texto) return MSG_FALHA_PADRAO;
  return FALHA_DE_REDE.test(texto) ? MSG_SEM_CONEXAO : texto;
}
