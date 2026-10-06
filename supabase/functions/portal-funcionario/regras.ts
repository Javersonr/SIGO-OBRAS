/**
 * Regras do aluno no portal-funcionario (treinamento EAD): módulo PURO.
 *
 * Sem `Deno.*`, sem import de URL e sem banco/rede: o `index.ts` consulta o banco
 * e chama estas funções, que podem ser testadas no Node (`regras.test.ts`).
 * O tempo entra por parâmetro (`agora`, em ms), nunca por `Date.now()` aqui.
 *
 * Saíram do `index.ts` sem mudar comportamento (a exceção é `logoAssinadoParaPdf`, que já
 * nasceu aqui, na T15). Duas regras ainda são as de hoje de propósito (o handoff corrige em
 * tarefa própria): `datasDeConclusao` usa o dia em UTC (T8) e `corrigirProva` converte a
 * resposta com `Number()` (o envio já chega validado por `validarEnvio`, que só deixa passar inteiro).
 *
 * A T16 acrescentou, no fim do arquivo, a prova no servidor (sorteio, início, validação do envio e
 * resposta da correção) e a regra das aulas bloqueadas sem conteúdo. A T27 acrescentou, no fim, o limite
 * de tentativas das reconfirmações de senha (`reconfirmarSenha`).
 */

import type { Consumo, Limite } from "../_shared/limite-tentativas.ts";

/** Vídeo conclui sozinho a partir de 90% assistidos. */
export const PCT_CONCLUSAO = 0.9;
/** Folga de rede (s) por sinal de progresso. */
export const TOLERANCIA_SEG = 2;
/** Caracteres do JSON do detalhe de um evento. */
export const MAX_DETALHE = 2000;
/** Nota mínima quando o curso não define uma. */
export const NOTA_MINIMA_PADRAO = 70;

export interface TrilhaDoCurso {
  aulas: { id: unknown }[];
  feitas: Set<unknown>;
}

/** Progresso linear: só libera a aula se todas as anteriores estão concluídas. */
export function aulaLiberada(trilha: TrilhaDoCurso, aulaId: string) {
  for (const a of trilha.aulas) {
    if (a.id === aulaId) return true;
    if (!trilha.feitas.has(a.id)) return false;
  }
  return false;
}

/**
 * Conclusão do curso a partir do que o SERVIDOR gravou: todas as aulas da trilha
 * concluídas e, se o curso tem prova, uma tentativa APROVADA. Trilha vazia nunca
 * conclui.
 */
export function situacaoDaTrilha(p: {
  aulas: { id: unknown }[];
  feitas: Set<unknown>;
  temAvaliacao: boolean;
  aprovacao: { numero: number; nota: number } | null;
}) {
  const aulasOk = p.aulas.length > 0 && p.aulas.every((a) => p.feitas.has(a.id));
  const { temAvaliacao, aprovacao } = p;
  return { aulasOk, temAvaliacao, aprovacao, concluido: aulasOk && (!temAvaliacao || !!aprovacao) };
}

/**
 * Crédito de tempo assistido. O navegador informa o TOTAL; o servidor só aceita o
 * que cabe no tempo real passado desde o último sinal do aluno (mais a folga de
 * rede) e nunca passa da duração cadastrada. `ajustado` = o pedido passou da folga
 * (vira o evento `progresso_ajustado`). Sem sinal anterior, decorrido = 0.
 */
export function creditarTempo(p: {
  jaTinha: number;
  informado: unknown;
  ultimoSinalEm?: string | null;
  agora: number;
  duracao: number | null;
}) {
  const ultimoSinal = p.ultimoSinalEm ? Date.parse(p.ultimoSinalEm) : p.agora;
  const decorrido = Math.max(0, (p.agora - ultimoSinal) / 1000);
  const pedido = Math.max(0, Math.floor(Number(p.informado) || 0) - p.jaTinha);
  const aceito = Math.min(pedido, Math.floor(decorrido + TOLERANCIA_SEG));
  let novoSeg = p.jaTinha + aceito;
  if (p.duracao) novoSeg = Math.min(novoSeg, p.duracao);
  return { decorrido, pedido, aceito, novoSeg, ajustado: pedido > aceito + TOLERANCIA_SEG };
}

/**
 * Conclusão de UMA aula. Vídeo conclui sozinho aos 90% (arredondado para cima);
 * apostila (pdf/texto) exige o tempo de leitura COMPLETO e o clique explícito em
 * "Marcar como lida" (`pediuConcluir === true`). Aula sem duração nunca atinge o
 * tempo. `concluirCedo` = clicou em concluir a apostila antes do tempo (o servidor
 * recusa); `podeConcluir` = apostila com o tempo completo, só falta o clique.
 */
export function conclusaoDaAula(p: {
  tipo?: string | null;
  duracao: number;
  segundos: number;
  jaConcluida?: boolean | null;
  pediuConcluir?: unknown;
}) {
  const ehVideo = !p.tipo || p.tipo === "video";
  const minimoSeg = ehVideo ? Math.ceil(p.duracao * PCT_CONCLUSAO) : p.duracao;
  const atingiuTempo = p.duracao > 0 && p.segundos >= minimoSeg;
  const pediu = p.pediuConcluir === true;
  const concluirCedo = pediu && !ehVideo && !atingiuTempo;
  const concluiu = !!p.jaConcluida || (ehVideo ? atingiuTempo : atingiuTempo && pediu);
  return {
    ehVideo,
    minimoSeg,
    atingiuTempo,
    concluirCedo,
    faltamSeg: p.duracao - p.segundos,
    concluiu,
    podeConcluir: !ehVideo && atingiuTempo && !concluiu,
  };
}

/**
 * Correção da prova: acerto = resposta marcada (convertida com `Number`) igual à
 * alternativa correta. Questão sem resposta erra; resposta de questão que não é da
 * prova é ignorada; se a questão vem repetida, vale a última. A nota é inteira
 * (arredondada) e a aprovação compara a nota já arredondada com a mínima.
 */
export function corrigirProva(p: {
  questoes: { id: string; correta: number }[];
  respostas: { questao_id: string; resposta: unknown }[];
  notaMinima?: number | null;
}) {
  const marcada = new Map(
    p.respostas.map((r): [string, number] => [r.questao_id, Number(r.resposta)])
  );
  const acertou = (q: { id: string; correta: number }) => marcada.get(q.id) === q.correta;
  const acertos = p.questoes.filter(acertou).length;
  const total = p.questoes.length;
  const nota = Math.round((acertos / total) * 100);
  const minima = p.notaMinima ?? NOTA_MINIMA_PADRAO;
  return { marcada, acertou, acertos, total, nota, minima, aprovada: nota >= minima };
}

/**
 * Limite e intervalo entre tentativas da avaliação.
 * - `max`: limite do curso + tentativas extras liberadas na matrícula (null = sem limite).
 * - `esgotada`: já usou todas as tentativas.
 * - `aguardarAte` (ms): reprovado na última tentativa e o intervalo ainda corre
 *   (`agora < última + intervalo`); null quando já pode tentar.
 * `usadas` = quantas tentativas a matrícula já tem; `ultima` = a de maior número.
 * `liberadaEm` (ms, T18): a liberação mais recente do RH para esta matrícula (evento
 * `tentativa_liberada`). Se veio DEPOIS da última tentativa, o intervalo não vale: o aluno liberado
 * faz a prova na hora. Liberação anterior à última tentativa já foi usada e não vale mais.
 */
export function situacaoDasTentativas(p: {
  usadas: number;
  curso:
    | { max_tentativas?: number | null; intervalo_tentativa_min?: number | null }
    | null
    | undefined;
  matricula: { tentativas_extras?: number | null };
  ultima?: { aprovada?: boolean | null; created_at: string } | null;
  liberadaEm?: number | null;
  agora: number;
}) {
  const limite = p.curso?.max_tentativas ?? 0;
  const max = limite > 0 ? limite + (p.matricula.tentativas_extras || 0) : null;
  const esgotada = max !== null && p.usadas >= max;
  const intervalo = p.curso?.intervalo_tentativa_min ?? 0;
  let aguardarAte: number | null = null;
  if (p.ultima && !p.ultima.aprovada && intervalo > 0) {
    const tentouEm = Date.parse(p.ultima.created_at);
    const liberada = typeof p.liberadaEm === "number" && p.liberadaEm > tentouEm;
    const libera = tentouEm + intervalo * 60_000;
    if (!liberada && p.agora < libera) aguardarAte = libera;
  }
  return { max, esgotada, aguardarAte };
}

/**
 * Instante (ms) da liberação mais recente dentre as linhas de `treinamento_evento` com evento
 * `tentativa_liberada` (a consulta já filtra pelo nome), ou null. Não depende da ordem das linhas;
 * data ausente ou inválida é ignorada.
 */
export function ultimaLiberacao(
  eventos: { created_at?: unknown }[] | null | undefined
): number | null {
  let maisRecente: number | null = null;
  for (const e of eventos ?? []) {
    const t = typeof e?.created_at === "string" ? Date.parse(e.created_at) : Number.NaN;
    if (Number.isFinite(t) && (maisRecente === null || t > maisRecente)) maisRecente = t;
  }
  return maisRecente;
}

/** `ultimaLiberacao` de cada matrícula (o `dados` consulta as de todas de uma vez). */
export function liberacoesPorMatricula(
  eventos: { matricula_id?: string | null; created_at?: unknown }[] | null | undefined
): Map<string, number> {
  const porMatricula = new Map<string, { created_at?: unknown }[]>();
  for (const e of eventos ?? []) {
    if (!e?.matricula_id) continue;
    const lista = porMatricula.get(e.matricula_id) ?? [];
    lista.push(e);
    porMatricula.set(e.matricula_id, lista);
  }
  const saida = new Map<string, number>();
  for (const [matriculaId, lista] of porMatricula) {
    const t = ultimaLiberacao(lista);
    if (t !== null) saida.set(matriculaId, t);
  }
  return saida;
}

/** Quando o reprovado poderá tentar de novo (ms), ou null se não há intervalo ou foi aprovado. */
export function proximaTentativaEm(
  aprovada: boolean,
  intervaloMin: number | null | undefined,
  agora: number
) {
  const intervalo = intervaloMin ?? 0;
  return !aprovada && intervalo > 0 ? agora + intervalo * 60_000 : null;
}

/**
 * Datas gravadas ao concluir: `data_conclusao` e, se o curso tem validade em
 * meses, `proxima_renovacao`. Comportamento de hoje: dia em UTC (às 21h em
 * Brasília já é o dia seguinte) e dia 31 que não existe no mês de destino estoura
 * para o mês seguinte. A T8 corrige o fuso.
 */
export function datasDeConclusao(hoje: Date, validadeMeses?: number | null) {
  const datas: { data_conclusao: string; proxima_renovacao?: string } = {
    data_conclusao: hoje.toISOString().slice(0, 10),
  };
  if (validadeMeses) {
    const renova = new Date(hoje);
    renova.setUTCMonth(renova.getUTCMonth() + validadeMeses);
    datas.proxima_renovacao = renova.toISOString().slice(0, 10);
  }
  return datas;
}

/**
 * O curso está publicado? O portal mostra um selo quando o RH o despublicou (T14).
 * Só `ativo === false` conta como despublicado: campo ausente ou nulo (legado) é publicado.
 */
export function cursoPublicado(curso: { ativo?: boolean | null } | null | undefined) {
  return curso?.ativo !== false;
}

/**
 * Detalhe do evento vindo do navegador, limitado: objeto pequeno passa como
 * veio; o resto vira { cortado, tamanho, json } com o JSON serializado cortado.
 */
export function detalheLimitado(d: unknown): Record<string, unknown> | null {
  if (d === null || d === undefined) return null;
  let json: string | undefined;
  try {
    json = JSON.stringify(d);
  } catch {
    return { invalido: true };
  }
  if (json === undefined) return null;
  const objeto = typeof d === "object" && !Array.isArray(d);
  if (objeto && json.length <= MAX_DETALHE) return d as Record<string, unknown>;
  return {
    cortado: json.length > MAX_DETALHE,
    tamanho: json.length,
    json: json.slice(0, MAX_DETALHE),
  };
}

/**
 * URL assinada do logo da empresa para o PDF do certificado baixado pelo aluno (T15), ou null
 * (o PDF sai sem logo). O banco guarda a referência "bucket/caminho": só ela vira URL. URL do
 * Base44 (arquivo perdido), link externo, imagem embutida, valor vazio e ref de outra empresa
 * ficam sem logo. `assinar` é o `assinarDaEmpresa` ligado à empresa da sessão: ele só assina a
 * pasta dela, então o que ficar fora do mapa devolvido não tem logo. Falha ao assinar também
 * vira null: o logo é só enfeite e nunca derruba o `dados` (a tela inicial do portal).
 */
export async function logoAssinadoParaPdf(
  logoUrl: unknown,
  assinar: (refs: string[]) => Promise<Map<string, string>>
): Promise<string | null> {
  if (typeof logoUrl !== "string") return null;
  const ref = logoUrl.trim();
  if (!ref || /base44\./i.test(ref)) return null;
  try {
    const assinadas = await assinar([ref]);
    return assinadas.get(ref) || null;
  } catch {
    return null;
  }
}

/**
 * Envolve o `assinar` do logo para deixar rastro nos logs da função quando ele FALHA, e relança o
 * mesmo erro. `logoAssinadoParaPdf` engole a falha de propósito (o PDF sai sem logo), então sem
 * isto "o certificado saiu sem logotipo" não teria pista nenhuma no servidor. `registrar` é o
 * `console.error` do `index.ts` (injetado para este módulo continuar puro); se ele próprio falhar,
 * o erro que sobe continua sendo o da assinatura.
 */
export function comRastroDeFalha<A extends unknown[], R>(
  executar: (...args: A) => Promise<R> | R,
  registrar: (erro: unknown) => void
): (...args: A) => Promise<R> {
  return async (...args: A) => {
    try {
      return await executar(...args);
    } catch (erro) {
      try {
        registrar(erro);
      } catch {
        // o registro nunca esconde o erro de verdade
      }
      throw erro;
    }
  };
}

// ============================================================================
// Prova no servidor (T16)
// ============================================================================
// O navegador deixou de sortear a prova e de dizer a ordem exibida: o servidor sorteia ao abrir a
// prova (`iniciar_avaliacao`), grava o sorteio na trilha (evento `avaliacao_iniciada`) e confere o
// envio contra esse sorteio. O gabarito nunca sai do servidor antes da aprovação.

/**
 * Evento de servidor gravado ao abrir a prova, com a ordem sorteada. Não está em `EVENTOS_CLIENTE`:
 * o navegador não consegue gravar um evento com este nome.
 */
export const EVENTO_PROVA_INICIADA = "avaliacao_iniciada";

/**
 * DECISÃO D10 em aberto: tempo mínimo (em segundos, POR QUESTÃO) entre abrir a prova e enviá-la.
 * 0 = sem mínimo, como era antes da T16. O mecanismo está pronto e testado: o valor sugerido pelo
 * handoff é 10, mas quem decide é o Javerson. Trocar o número aqui e publicar a função basta.
 */
export const TEMPO_MINIMO_PROVA_POR_QUESTAO_SEG = 0;

/**
 * DECISÃO D10 em aberto: o reprovado vê a nota, os acertos e o total? O padrão `true` mantém o
 * comportamento de antes da T16 (o reprovado recebe nota, acertos e total) até a D10 ser decidida.
 * `false` = só "insatisfatório", as tentativas e a próxima liberação: fecha a dedução do gabarito
 * (acertos e total, em prova de 5 ou 6 questões, deixam deduzir as respostas certas; T16, item 3);
 * o RH vê tudo na trilha. Trocar o valor aqui e publicar a função basta (a prévia do RT espelha o
 * valor em `apps/web/src/lib/portal-previa.js`).
 */
export const REPROVADO_VE_NOTA = true;

/** Questão sorteada para uma tentativa: sem gabarito, com as alternativas na ordem mostrada. */
export interface QuestaoSorteada {
  id: string;
  pergunta: string;
  /** textos das alternativas, na ORDEM EM QUE SÃO MOSTRADAS */
  opcoes: string[];
  /** índice ORIGINAL (o do banco) da alternativa de cada posição; a resposta volta por esse índice */
  ordem_opcoes: number[];
}

/** Sorteio de uma questão como fica gravado na trilha. */
export interface OrdemDaQuestao {
  questao_id: string;
  ordem_opcoes: number[];
}

/** O que a trilha guardou ao abrir a prova. */
export interface InicioDaProva {
  tentativa: number;
  /** quando o servidor abriu a prova (ms) */
  iniciadaEm: number;
  /** questões na ordem em que foram mostradas */
  ordem: OrdemDaQuestao[];
}

/** `opcoes` é jsonb: lista, texto JSON (legado) ou quebrado (vira lista vazia). */
function opcoesDaQuestao(opcoes: unknown): string[] {
  let lista = opcoes;
  if (typeof lista === "string") {
    try {
      lista = JSON.parse(lista);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(lista)) return [];
  return lista.map((o) => (typeof o === "string" ? o : String(o ?? "")));
}

function sortear(n: number, aleatorio: (n: number) => number) {
  const j = aleatorio(n);
  if (!Number.isInteger(j) || j < 0 || j >= n) throw new RangeError("sorteio fora do intervalo");
  return j;
}

/** Fisher–Yates: embaralha uma cópia, com um sorteio uniforme de verdade (se `aleatorio` for). */
function embaralhar<T>(itens: T[], aleatorio: (n: number) => number): T[] {
  const a = [...itens];
  for (let i = a.length - 1; i > 0; i--) {
    const j = sortear(i + 1, aleatorio);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Sorteia a prova de UMA tentativa: a ordem das questões e a das alternativas de cada uma. Devolve só
 * `id`, `pergunta`, `opcoes` (já na ordem mostrada) e `ordem_opcoes` (índice original de cada
 * posição), nunca o gabarito nem o comentário, mesmo que a questão chegue com eles. `aleatorio(n)`
 * devolve um inteiro em [0, n) e entra por parâmetro: o servidor passa o sorteio criptográfico
 * (`inteiroAleatorioSeguro`) e o teste passa um sorteio conhecido. Valor fora do intervalo é erro.
 */
export function sortearProva(
  questoes: { id: string; pergunta?: unknown; opcoes?: unknown }[],
  aleatorio: (n: number) => number
): QuestaoSorteada[] {
  const sorteadas = questoes.map((q) => {
    const opcoes = opcoesDaQuestao(q.opcoes);
    const ordem = embaralhar(
      opcoes.map((_, i) => i),
      aleatorio
    );
    return {
      id: q.id,
      pergunta: String(q.pergunta ?? ""),
      opcoes: ordem.map((i) => opcoes[i]),
      ordem_opcoes: ordem,
    };
  });
  return embaralhar(sorteadas, aleatorio);
}

/** O sorteio de cada questão, no formato que vai para a trilha (sem os textos). */
export function ordemDaProva(prova: QuestaoSorteada[]): OrdemDaQuestao[] {
  return prova.map((q) => ({ questao_id: q.id, ordem_opcoes: [...q.ordem_opcoes] }));
}

const ehPermutacao = (lista: unknown, n: number): lista is number[] =>
  Array.isArray(lista) &&
  lista.length === n &&
  lista.every((i) => Number.isInteger(i) && i >= 0 && i < n) &&
  new Set(lista).size === n;

/**
 * Refaz a prova mostrada ao aluno a partir da ordem gravada na trilha e das questões de HOJE, ou
 * null se as duas não conferem: questão que sumiu, que apareceu, repetida, ou alternativas que
 * mudaram de quantidade (o RH mexeu na prova depois do sorteio).
 */
export function provaDaOrdem(
  questoes: { id: string; pergunta?: unknown; opcoes?: unknown }[],
  ordem: unknown
): QuestaoSorteada[] | null {
  if (!Array.isArray(ordem) || ordem.length !== questoes.length) return null;
  const porId = new Map(questoes.map((q) => [q.id, q]));
  const vistas = new Set<string>();
  const prova: QuestaoSorteada[] = [];
  for (const item of ordem) {
    const id = item && typeof item === "object" ? (item as OrdemDaQuestao).questao_id : undefined;
    const q = typeof id === "string" ? porId.get(id) : undefined;
    if (!q || vistas.has(q.id)) return null;
    vistas.add(q.id);
    const opcoes = opcoesDaQuestao(q.opcoes);
    const indices = (item as OrdemDaQuestao).ordem_opcoes;
    if (!ehPermutacao(indices, opcoes.length)) return null;
    prova.push({
      id: q.id,
      pergunta: String(q.pergunta ?? ""),
      opcoes: indices.map((i) => opcoes[i]),
      ordem_opcoes: [...indices],
    });
  }
  return prova;
}

/**
 * `detalhe` do evento `avaliacao_iniciada`: de qual tentativa é, quando o servidor abriu a prova (a
 * hora é do servidor), o tempo mínimo que valia na ocasião e o sorteio. `inicioDaProva` lê isto.
 */
export function detalheDaProvaIniciada(p: {
  tentativa: number;
  agora: number;
  prova: QuestaoSorteada[];
  tempoMinimoPorQuestaoSeg?: number;
}) {
  return {
    tentativa: p.tentativa,
    iniciada_em: new Date(p.agora).toISOString(),
    tempo_minimo_seg: tempoMinimoDaProva(p.prova.length, p.tempoMinimoPorQuestaoSeg),
    prova: ordemDaProva(p.prova),
  };
}

const ordemGravadaValida = (x: unknown): x is OrdemDaQuestao =>
  !!x &&
  typeof x === "object" &&
  typeof (x as OrdemDaQuestao).questao_id === "string" &&
  Array.isArray((x as OrdemDaQuestao).ordem_opcoes) &&
  (x as OrdemDaQuestao).ordem_opcoes.every((i) => Number.isInteger(i));

/**
 * Lê uma linha da trilha (`treinamento_evento`) do tipo `avaliacao_iniciada`. null se o detalhe não
 * tem a forma esperada ou não há hora: a prova conta como não iniciada. A hora vale a do detalhe;
 * sem ela, a da linha (`created_at`).
 */
export function inicioDaProva(
  evento: { created_at?: unknown; detalhe?: unknown } | null | undefined
): InicioDaProva | null {
  const d = evento?.detalhe;
  if (!d || typeof d !== "object" || Array.isArray(d)) return null;
  const detalhe = d as Record<string, unknown>;
  const tentativa = detalhe.tentativa;
  if (typeof tentativa !== "number" || !Number.isInteger(tentativa) || tentativa < 1) return null;
  const ordem = detalhe.prova;
  if (!Array.isArray(ordem) || !ordem.every(ordemGravadaValida)) return null;
  const iniciadaEm = [detalhe.iniciada_em, evento?.created_at]
    .map((h) => (typeof h === "string" ? Date.parse(h) : Number.NaN))
    .find((ms) => Number.isFinite(ms));
  if (iniciadaEm === undefined) return null;
  return {
    tentativa,
    iniciadaEm,
    ordem: ordem.map((o) => ({ questao_id: o.questao_id, ordem_opcoes: [...o.ordem_opcoes] })),
  };
}

/** Tempo mínimo (s) da prova toda: segundos por questão vezes o número de questões. */
function tempoMinimoDaProva(
  totalQuestoes: number,
  porQuestaoSeg: number | undefined = TEMPO_MINIMO_PROVA_POR_QUESTAO_SEG
) {
  const porQuestao = Number.isFinite(porQuestaoSeg) ? Math.max(0, porQuestaoSeg) : 0;
  return porQuestao * totalQuestoes;
}

const textoDaEspera = (seg: number) => (seg >= 120 ? `${Math.ceil(seg / 60)} min` : `${seg} s`);

export type EnvioValido = {
  ok: true;
  /** a prova como foi mostrada: ordem das questões e das alternativas sorteadas pelo servidor */
  prova: QuestaoSorteada[];
  /** uma resposta (índice ORIGINAL da alternativa) por questão, na ordem da prova */
  respostas: { questao_id: string; resposta: number }[];
};

export type EnvioRecusado = {
  ok: false;
  status: number;
  codigo: string;
  mensagem: string;
  extra?: Record<string, unknown>;
};

/**
 * Confere o envio da prova ANTES de corrigir. Recusa, nesta ordem:
 * 1. prova não aberta nesta tentativa (409 `PROVA_NAO_INICIADA`): sem `avaliacao_iniciada`, ou com
 *    o início de outra tentativa (o de uma já enviada não vale para a próxima);
 * 2. questões que mudaram desde o sorteio (409 `PROVA_ALTERADA`);
 * 3. questão sem resposta válida (400 `RESPOSTAS_INCOMPLETAS`): só vale número inteiro dentro das
 *    alternativas, e `null`, texto, fração ou índice fora do intervalo não valem (antes `null`
 *    era lido como 0);
 * 4. envio antes do tempo mínimo desde a abertura (409 `TEMPO_MINIMO_PROVA`).
 * Resposta de questão que não é da prova é ignorada; se a questão vem repetida, vale a última.
 * `numero` é o da tentativa que seria gravada agora (as já feitas + 1).
 */
export function validarEnvio(p: {
  questoes: { id: string; pergunta?: unknown; opcoes?: unknown }[];
  respostas: unknown;
  inicio: InicioDaProva | null;
  numero: number;
  agora: number;
  tempoMinimoPorQuestaoSeg?: number;
}): EnvioValido | EnvioRecusado {
  const recusa = (
    status: number,
    codigo: string,
    mensagem: string,
    extra?: Record<string, unknown>
  ): EnvioRecusado => ({ ok: false, status, codigo, mensagem, ...(extra ? { extra } : {}) });

  const { inicio } = p;
  if (!inicio || inicio.tentativa !== p.numero) {
    return recusa(
      409,
      "PROVA_NAO_INICIADA",
      "Abra a prova de novo para enviar as respostas: esta tentativa não foi iniciada."
    );
  }
  const prova = provaDaOrdem(p.questoes, inicio.ordem);
  if (!prova) {
    return recusa(
      409,
      "PROVA_ALTERADA",
      "As questões desta prova foram alteradas pelo RH enquanto você respondia. Abra a prova de novo."
    );
  }

  const marcadas = new Map<string, unknown>();
  for (const r of Array.isArray(p.respostas) ? p.respostas : []) {
    const id = r && typeof r === "object" ? (r as { questao_id?: unknown }).questao_id : undefined;
    if (typeof id === "string") marcadas.set(id, (r as { resposta?: unknown }).resposta);
  }
  const respostas: { questao_id: string; resposta: number }[] = [];
  for (const q of prova) {
    const v = marcadas.get(q.id);
    if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v < q.opcoes.length) {
      respostas.push({ questao_id: q.id, resposta: v });
    }
  }
  const faltam = prova.length - respostas.length;
  if (faltam > 0) {
    return recusa(
      400,
      "RESPOSTAS_INCOMPLETAS",
      `Responda todas as questões antes de enviar: ${faltam === 1 ? "falta 1" : `faltam ${faltam}`}.`,
      { faltam }
    );
  }

  const minimoSeg = tempoMinimoDaProva(prova.length, p.tempoMinimoPorQuestaoSeg);
  const decorridoSeg = Math.max(0, (p.agora - inicio.iniciadaEm) / 1000);
  if (decorridoSeg < minimoSeg) {
    const faltamSeg = Math.ceil(minimoSeg - decorridoSeg);
    return recusa(
      409,
      "TEMPO_MINIMO_PROVA",
      `Releia as questões antes de enviar: o envio é liberado em ${textoDaEspera(faltamSeg)}.`,
      { faltam_seg: faltamSeg }
    );
  }
  return { ok: true, prova, respostas };
}

/**
 * Resposta da ação `avaliacao` depois de corrigir. Aprovado: tudo, como antes (nota, acertos, total
 * e a correção comentada) mais o conceito `satisfatorio`. Reprovado: `insatisfatorio`, a nota mínima,
 * as tentativas e a próxima liberação, mais nota, acertos e total quando `reprovadoVeNota` (padrão
 * `REPROVADO_VE_NOTA`, D10 em aberto); com `false` o reprovado não recebe nota, acertos nem total
 * (o RH vê tudo na trilha). A correção comentada só vai ao aprovado, qualquer que seja o valor.
 */
export function respostaDaCorrecao(
  p: {
    aprovada: boolean;
    nota: number;
    notaMinima: number;
    acertos: number;
    total: number;
    tentativa: number;
    tentativasMax: number | null;
    proximaEm: string | null;
    cursoConcluido: boolean;
    revisao: unknown;
  },
  reprovadoVeNota: boolean = REPROVADO_VE_NOTA
) {
  const comum = {
    nota_minima: p.notaMinima,
    tentativa: p.tentativa,
    tentativas_max: p.tentativasMax,
    proxima_em: p.proximaEm,
  };
  if (p.aprovada) {
    return {
      resultado: "satisfatorio",
      aprovada: true,
      nota: p.nota,
      acertos: p.acertos,
      total: p.total,
      ...comum,
      curso_concluido: p.cursoConcluido,
      revisao: p.revisao,
    };
  }
  return {
    resultado: "insatisfatorio",
    aprovada: false,
    ...(reprovadoVeNota ? { nota: p.nota, acertos: p.acertos, total: p.total } : {}),
    ...comum,
    curso_concluido: false,
    revisao: null,
  };
}

/**
 * A matrícula como o aluno a recebe em `dados`. Com `reprovadoVeNota` (padrão `REPROVADO_VE_NOTA`,
 * D10 em aberto) ela vai inteira. Com `false`, a nota da última tentativa não sai enquanto ele não
 * foi aprovado (senão esconder a nota na resposta da prova não adiantaria: ela estaria aqui).
 */
export function matriculaParaAluno<T extends { avaliacao_aprovada?: boolean | null }>(
  matricula: T,
  reprovadoVeNota: boolean = REPROVADO_VE_NOTA
): T & { nota_avaliacao?: unknown } {
  if (reprovadoVeNota || matricula.avaliacao_aprovada) return matricula;
  return { ...matricula, nota_avaliacao: null };
}

// -------------------------------------------------- aulas bloqueadas sem conteúdo (T16)

export interface AulaDoBanco {
  id: string;
  ordem?: unknown;
  modulo?: unknown;
  tipo?: string | null;
  titulo?: unknown;
  fonte?: string | null;
  youtube_id?: string | null;
  video_ref?: string | null;
  legenda_ref?: string | null;
  arquivo_ref?: string | null;
  conteudo_texto?: string | null;
  duracao_seg?: number | null;
}

/** Progresso gravado de uma aula nesta matrícula (undefined = nunca abriu). */
export type ProgressoDaAula =
  | { concluida?: boolean | null; segundos_assistidos?: number | null }
  | null
  | undefined;

/**
 * Bloqueio linear de todas as aulas de uma matrícula, na ordem recebida: cada uma só está liberada
 * se todas as anteriores estão concluídas. Mesma regra de `aulaLiberada`.
 */
export function liberacaoDasAulas(
  aulas: { id: string }[],
  progresso: (aulaId: string) => ProgressoDaAula
) {
  let anterioresOk = true;
  return aulas.map((a) => {
    const concluida = !!progresso(a.id)?.concluida;
    const liberada = anterioresOk;
    anterioresOk = anterioresOk && concluida;
    return { id: a.id, concluida, liberada };
  });
}

/** Referências de arquivo que a aula pode ter, por tipo: vídeo próprio, legenda e apostila. */
function refsDaAula(a: AulaDoBanco) {
  return {
    video: a.tipo === "video" && a.fonte === "upload" ? a.video_ref : null,
    legenda: a.legenda_ref,
    arquivo: a.tipo === "pdf" ? a.arquivo_ref : null,
  };
}

/**
 * Referências "bucket/caminho" que o `dados` assina para uma matrícula: SÓ as das aulas liberadas.
 * As URLs valem 3 horas e podem ser repassadas, então aula bloqueada não ganha URL nenhuma.
 */
export function refsDasAulasLiberadas(
  aulas: AulaDoBanco[],
  progresso: (aulaId: string) => ProgressoDaAula
): string[] {
  const liberacao = liberacaoDasAulas(aulas, progresso);
  const refs = new Set<string>();
  aulas.forEach((a, i) => {
    if (!liberacao[i].liberada) return;
    const { video, legenda, arquivo } = refsDaAula(a);
    for (const ref of [video, legenda, arquivo]) if (ref) refs.add(ref);
  });
  return [...refs];
}

/**
 * Aulas de uma matrícula como o aluno as recebe em `dados`. A lista vem inteira (título, módulo,
 * tipo, duração, conclusão e se está liberada), mas só a aula LIBERADA leva `video_url`,
 * `legenda_url`, `arquivo_url`, `conteudo_texto` e `youtube_id`; nas bloqueadas esses campos vão
 * nulos e `urlDe` nem é consultado. `urlDe` devolve a URL assinada de uma referência (ou null).
 */
export function aulasParaAluno(p: {
  aulas: AulaDoBanco[];
  progresso: (aulaId: string) => ProgressoDaAula;
  urlDe: (ref?: string | null) => string | null;
  tempoMinimoPadrao: number;
}) {
  const liberacao = liberacaoDasAulas(p.aulas, p.progresso);
  return p.aulas.map((a, i) => {
    const { concluida, liberada } = liberacao[i];
    const refs = refsDaAula(a);
    return {
      id: a.id,
      ordem: a.ordem,
      modulo: a.modulo,
      tipo: a.tipo || "video",
      titulo: a.titulo,
      fonte: a.fonte || "youtube",
      youtube_id: liberada ? (a.youtube_id ?? null) : null,
      video_url: liberada ? p.urlDe(refs.video) : null,
      legenda_url: liberada ? p.urlDe(refs.legenda) : null,
      arquivo_url: liberada ? p.urlDe(refs.arquivo) : null,
      conteudo_texto: liberada && a.tipo === "texto" ? (a.conteudo_texto ?? null) : null,
      duracao_seg: a.duracao_seg || (a.tipo === "video" ? null : p.tempoMinimoPadrao),
      segundos_assistidos: p.progresso(a.id)?.segundos_assistidos ?? 0,
      concluida,
      liberada,
    };
  });
}

// ---------------------------------------------------- reconfirmação de senha (T27)

/**
 * Escopo do limitador das reconfirmações de senha com a SESSÃO já aberta: assinar o certificado
 * (`certificado`) e trocar a senha informando a atual (`trocar_senha`). As duas dividem o mesmo contador
 * de propósito, porque conferem a mesma senha: alternar entre elas não dá o dobro de tentativas. É um
 * escopo só delas, separado do login (`funcionario-login`), então errar a assinatura não afeta o login
 * nem o contrário.
 */
export const ESCOPO_RECONFIRMAR_SENHA = "funcionario-reconfirmar-senha";
/** Janela do contador (s): 15 minutos, como o login. */
export const JANELA_RECONFIRMAR_SENHA_SEG = 15 * 60;
/**
 * Tentativas por funcionário na janela. A sexta é barrada ainda que a senha esteja certa: a tentativa é
 * consumida ANTES de conferir, como no login, para uma rajada paralela não passar do teto.
 */
export const MAX_TENTATIVAS_RECONFIRMAR_SENHA = 5;

export type ResultadoReconfirmacao = "ok" | "incorreta" | "limite";

/**
 * Reconfirma a senha do funcionário com limite de tentativas: consome uma tentativa da conta DELE
 * (nunca por IP: aparelho compartilhado de obra não tranca os colegas), confere a senha e, se estiver
 * certa, libera o contador. `limite` = não chegou nem a conferir a senha: o chamador responde 429
 * (`MSG_MUITAS_TENTATIVAS`, `codigo: "LIMITE"`). Limitador fora do ar não tranca (como no login): a
 * conferência da senha segue valendo.
 *
 * As três dependências entram por parâmetro (o `index.ts` liga `consumirTentativa`, `verifyPassword` e
 * `liberarTentativas`), para a ordem poder ser testada no Node.
 */
export async function reconfirmarSenha(p: {
  funcionarioId: string;
  consumir: (escopo: string, janelaSeg: number, limites: Limite[]) => Promise<Consumo>;
  conferir: () => Promise<boolean>;
  liberar: (consumo: Consumo) => Promise<void>;
}): Promise<ResultadoReconfirmacao> {
  const consumo = await p.consumir(ESCOPO_RECONFIRMAR_SENHA, JANELA_RECONFIRMAR_SENHA_SEG, [
    { tipo: "conta", valor: p.funcionarioId, max: MAX_TENTATIVAS_RECONFIRMAR_SENHA },
  ]);
  if (!consumo.permitido) return "limite";
  if (!(await p.conferir())) return "incorreta";
  await p.liberar(consumo);
  return "ok";
}
