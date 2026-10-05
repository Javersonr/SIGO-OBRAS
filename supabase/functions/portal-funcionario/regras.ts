/**
 * Regras do aluno no portal-funcionario (treinamento EAD): módulo PURO.
 *
 * Sem `Deno.*`, sem import de URL e sem banco/rede: o `index.ts` consulta o banco
 * e chama estas funções, que podem ser testadas no Node (`regras.test.ts`).
 * O tempo entra por parâmetro (`agora`, em ms), nunca por `Date.now()` aqui.
 *
 * Saíram do `index.ts` sem mudar comportamento. Duas regras ainda são as de hoje
 * de propósito (o handoff corrige em tarefa própria): `datasDeConclusao` usa o dia
 * em UTC (T8) e `corrigirProva` converte a resposta com `Number()`.
 */

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
 */
export function situacaoDasTentativas(p: {
  usadas: number;
  curso:
    | { max_tentativas?: number | null; intervalo_tentativa_min?: number | null }
    | null
    | undefined;
  matricula: { tentativas_extras?: number | null };
  ultima?: { aprovada?: boolean | null; created_at: string } | null;
  agora: number;
}) {
  const limite = p.curso?.max_tentativas ?? 0;
  const max = limite > 0 ? limite + (p.matricula.tentativas_extras || 0) : null;
  const esgotada = max !== null && p.usadas >= max;
  const intervalo = p.curso?.intervalo_tentativa_min ?? 0;
  let aguardarAte: number | null = null;
  if (p.ultima && !p.ultima.aprovada && intervalo > 0) {
    const libera = Date.parse(p.ultima.created_at) + intervalo * 60_000;
    if (p.agora < libera) aguardarAte = libera;
  }
  return { max, esgotada, aguardarAte };
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
