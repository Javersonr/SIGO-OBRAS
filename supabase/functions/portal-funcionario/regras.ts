/**
 * Regras do aluno no portal-funcionario (treinamento EAD): módulo PURO.
 *
 * Sem `Deno.*`, sem import de URL e sem banco/rede: o `index.ts` consulta o banco
 * e chama estas funções, que podem ser testadas no Node (`regras.test.ts`).
 * O tempo entra por parâmetro (`agora`, em ms), nunca por `Date.now()` aqui.
 *
 * Saíram do `index.ts` sem mudar comportamento (a exceção é `logoAssinadoParaPdf`, que já
 * nasceu aqui, na T15). Uma regra ainda é a de hoje de propósito (o handoff corrige em tarefa
 * própria): `corrigirProva` converte a resposta com `Number()` (o envio já chega validado por
 * `validarEnvio`, que só deixa passar inteiro). `datasDeConclusao` passou para o dia de Brasília na T8.
 *
 * A T16 acrescentou, no fim do arquivo, a prova no servidor (sorteio, início, validação do envio e
 * resposta da correção) e a regra das aulas bloqueadas sem conteúdo. A T27 acrescentou, no fim, o limite
 * de tentativas das reconfirmações de senha (`reconfirmarSenha`). A T31 acrescentou o limite de volume
 * de `evento` e `progresso` (`dentroDoVolume`), a trava otimista do sinal de progresso
 * (`travaDoSinal`, `resultadoDoSinal`) e a lista fixa de colunas da matrícula.
 */

import type { Consumo, Limite } from "../_shared/limite-tentativas.ts";
import { dataBrasilia, hashDoCertificado } from "../_shared/portal-funcionario.ts";
import { formatarHoras, modalidadeDoCurso } from "./requisitos.ts";

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

/** A hora (HH:MM) de Brasília de um instante em ISO: a que o aluno lê em "liberada às ..." e no bloqueio do login. */
export function horaDeBrasilia(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Datas gravadas ao concluir: `data_conclusao` e, se o curso tem validade em meses,
 * `proxima_renovacao`. Os dois dias são os de BRASÍLIA (T8): o `toISOString()` dava o dia em UTC e, entre
 * 21h e 24h em Brasília, a conclusão saía com a data do dia seguinte. A renovação soma os meses sobre a
 * data de Brasília. Dia 31 que não existe no mês de destino estoura para o mês seguinte (comportamento
 * de sempre; o teste fixa).
 *
 * Curso de APOIO (D3, 06/10/2026) é material de estudo e nunca emite certificado: não há o que renovar,
 * então só a `data_conclusao` é gravada, qualquer que seja a validade do curso. Quem lê a matrícula (portal,
 * Ficha, tela do RH) não mostra "renova" para ele.
 */
export function datasDeConclusao(
  hoje: Date,
  validadeMeses?: number | null,
  modalidade?: string | null
) {
  const dia = dataBrasilia(hoje);
  const datas: { data_conclusao: string; proxima_renovacao?: string } = { data_conclusao: dia };
  const renovacao = renovacaoAPartirDe(dia, validadeMeses, modalidade);
  if (renovacao) datas.proxima_renovacao = renovacao;
  return datas;
}

/**
 * Eventos da conclusão que o SERVIDOR grava sozinho (A6, revisão 2). Nenhum está em `EVENTOS_CLIENTE` (o navegador
 * não consegue gravá-los) e nenhum é "estudar": quem decide a janela de atividade do aluno, no relatório do RH, os
 * deixa de fora (`EVENTOS_DO_SISTEMA`, no front).
 *
 * - `conclusao_adiada`: o aluno cumpriu a trilha (última aula ou aprovação) e a conclusão NÃO pôde ser gravada na
 *   hora (a leitura do curso falhou ou a gravação deu erro). É a pendência que a abertura do portal retoma: só a
 *   matrícula marcada aqui é concluída depois, nunca uma trilha que apenas parece completa.
 * - `conclusao_registrada`: a conclusão adiada foi gravada depois, pela abertura do portal (rastro de quando e
 *   como; também encerra a pendência). Não é `curso_concluido`: abrir o portal não é estudar.
 */
export const EVENTO_CONCLUSAO_ADIADA = "conclusao_adiada";
export const EVENTO_CONCLUSAO_REGISTRADA = "conclusao_registrada";

/**
 * O momento em que a trilha ficou completa: o mais recente entre a conclusão da última aula (só as aulas vivas do
 * curso) e a aprovação na prova. É dele que vem o dia da `data_conclusao` (NR-1: a validade conta do treinamento
 * feito, não do dia em que o sistema o registrou). Null se nenhum dos dois traz uma data válida.
 * `concluidaEm`: aula_id → `concluida_em` das aulas que o aluno concluiu.
 */
export function marcoDaTrilha(p: {
  aulas: { id: unknown }[];
  concluidaEm: ReadonlyMap<unknown, string | null | undefined>;
  aprovadaEm?: string | null;
}): Date | null {
  let maior = Number.NEGATIVE_INFINITY;
  const considerar = (iso: unknown) => {
    const t = typeof iso === "string" ? Date.parse(iso) : Number.NaN;
    if (Number.isFinite(t) && t > maior) maior = t;
  };
  for (const aula of p.aulas) considerar(p.concluidaEm.get(aula.id));
  considerar(p.aprovadaEm);
  return Number.isFinite(maior) ? new Date(maior) : null;
}

/**
 * O que fazer quando a trilha pode estar completa (A6): o resultado que o `index.ts` devolve e, se concluiu,
 * o que grava na matrícula (`status`, `data_conclusao` e, fora do apoio, `proxima_renovacao`).
 *
 * `cursoLido: false` = a leitura do curso (validade e modalidade) FALHOU. A conclusão é permanente (a
 * matrícula vira `concluido` e nenhuma ação a regrava), então concluir sem o curso gravaria a validade errada
 * para sempre: o EAD sairia sem renovação, e o curso de apoio, que não renova, não teria como ser distinguido.
 * Nesse caso a conclusão fica ADIADA (`adiada: true`, `motivo: "curso_nao_lido"`; o `index.ts` grava o evento
 * `conclusao_adiada`) e a próxima abertura do portal a retoma (`retomarConclusoes`): só as matrículas adiadas,
 * nunca uma trilha que apenas parece completa pelo estado de hoje do curso (A6, revisão 2). Sem essa segunda
 * chance o curso de apoio (sem certificado) e o curso sem prova ficariam `em_andamento` para sempre: nenhuma outra
 * ação chama a conclusão depois da última aula. Curso que não existe (sem erro) segue o comportamento de sempre:
 * conclui só com a data.
 *
 * Leituras da trilha (A7): `sit.trilhaLida: false` = a leitura das aulas ou do progresso FALHOU. A trilha lida
 * assim parece vazia, e o progresso chama a conclusão em toda aula concluída: não dá para saber se era a última,
 * então não conclui e NÃO marca (marcar às cegas deixaria a retomada concluir uma trilha incompleta, como a da aula
 * que o RH apagou). Quem chama faz uma segunda leitura antes de desistir (`concluirSeCompleto`, conclusao.ts).
 * `sit.provaLida: false` = a leitura das questões ou da tentativa aprovada FALHOU: sem ela a conta da trilha tomaria
 * o curso por "sem prova" (conclusão sem aprovação, permanente) ou o aprovado por "sem aprovação". Com as aulas
 * lidas e completas a conclusão fica ADIADA (`motivo: "prova_nao_lida"`): a retomada relê tudo e mantém as duas
 * travas (a trilha completa pelo banco e "fez a prova e não passou"). Ausentes, as duas valem `true` (lidas).
 *
 * `marco` = o momento em que a trilha ficou completa (`marcoDaTrilha`): a `data_conclusao` é o dia de Brasília
 * dele, e a renovação conta dele; sem marco, ou com um marco depois de `hoje`, vale `hoje`. Na conclusão feita
 * logo depois da última aula é a mesma data de sempre; na retomada, dias depois, não estende a validade.
 *
 * `precisaAvaliacao` = "é a hora da prova": só com todas as aulas feitas e a prova ainda pendente.
 */
export function decisaoDeConclusao(p: {
  sit: {
    aulasOk: boolean;
    temAvaliacao: boolean;
    concluido: boolean;
    /** false quando a leitura das aulas ou do progresso deu erro (A7). */
    trilhaLida?: boolean;
    /** false quando a leitura das questões ou da tentativa aprovada deu erro (A7). */
    provaLida?: boolean;
  };
  curso?: { validade_meses?: number | null; modalidade?: string | null } | null;
  /** false quando a leitura do curso deu erro (não confundir com curso que não existe). */
  cursoLido?: boolean;
  hoje: Date;
  /** O momento em que a trilha ficou completa; o dia da conclusão vem dele. */
  marco?: Date | null;
}) {
  const { sit } = p;
  const andamento = (
    precisaAvaliacao: boolean,
    motivo: "curso_nao_lido" | "prova_nao_lida" | null = null
  ) => ({
    resultado: { status: "em_andamento", concluiu: false, precisaAvaliacao },
    patch: null as Record<string, unknown> | null,
    adiada: motivo !== null,
    motivo,
  });
  // sem as aulas e o progresso lidos, nada a decidir (nem a marca: não se sabe se a trilha fechou)
  if (sit.trilhaLida === false) return andamento(false);
  if (!sit.aulasOk) return andamento(false);
  // aulas completas, prova ilegível: nem conclui (podia faltar a aprovação) nem diz que é a hora da prova
  if (sit.provaLida === false) return andamento(false, "prova_nao_lida");
  if (!sit.concluido) return andamento(sit.temAvaliacao);
  if (p.cursoLido === false) return andamento(false, "curso_nao_lido");
  const marco = p.marco && !Number.isNaN(p.marco.getTime()) ? p.marco : null;
  const diaDaConclusao = marco && marco.getTime() <= p.hoje.getTime() ? marco : p.hoje;
  return {
    resultado: { status: "concluido", concluiu: true, precisaAvaliacao: false },
    patch: {
      status: "concluido",
      // curso de apoio não renova (D3): só a data da conclusão
      ...datasDeConclusao(diaDaConclusao, p.curso?.validade_meses, modalidadeDoCurso(p.curso)),
    } as Record<string, unknown> | null,
    adiada: false,
    motivo: null as "curso_nao_lido" | "prova_nao_lida" | null,
  };
}

/** Por que a conclusão ficou adiada (detalhe do evento `conclusao_adiada`; o front mostra o texto de cada um). */
export type MotivoDaConclusaoAdiada = "curso_nao_lido" | "prova_nao_lida" | "gravacao_falhou";

/**
 * A trilha ilegível (aulas, progresso, questões ou aprovação) no pedido de certificado, na aula, no progresso e na
 * prova (A7): 503 e tentar de novo, não "Conclua o curso", "Aula não pertence ao curso" ou "aula bloqueada".
 */
export const MSG_TRILHA_INDISPONIVEL =
  "Não foi possível conferir o andamento do curso agora. Tente de novo em instantes.";

/**
 * O pedido de certificado confere a trilha no servidor (aulas, progresso, questões e aprovação). Leitura que
 * falhou é 503 (tentar de novo): dizer "Conclua o curso" a quem concluiu manda o aluno refazer o que já fez. Trilha
 * lida e incompleta é 409. Null = pode seguir.
 */
export function bloqueioDaTrilhaNoCertificado(sit: {
  lida: boolean;
  concluido: boolean;
}): { status: 409 | 503; mensagem: string } | null {
  if (!sit.lida) return { status: 503, mensagem: MSG_TRILHA_INDISPONIVEL };
  if (!sit.concluido) {
    return { status: 409, mensagem: "Conclua o curso antes de emitir o certificado" };
  }
  return null;
}

/**
 * Fecha a marca `conclusao_adiada` quando a matrícula é concluída por outro caminho (A7): a conclusão normal
 * posterior (a aula ou a aprovação que vieram depois) ou a do pedido de certificado. Sem isso a trilha mostraria
 * "Conclusão adiada" para sempre ao lado da matrícula concluída. Lê as marcas SÓ desta matrícula e grava o
 * `conclusao_registrada` (por `registrarConclusao`) só se havia marca pendente: a conclusão comum não ganha evento
 * a mais. NUNCA lança (a conclusão já foi gravada; o rastro que falta não pode derrubar a resposta ao aluno): erro
 * vai para `registrar`. Devolve true se gravou.
 */
export async function fecharConclusaoAdiada(p: {
  matriculaId: string;
  lerAdiadas: (matriculaIds: string[]) => Promise<ReadonlySet<string>>;
  registrarConclusao: () => Promise<unknown>;
  registrar: (mensagem: string, causa?: unknown) => void;
}): Promise<boolean> {
  try {
    const pendentes = await p.lerAdiadas([p.matriculaId]);
    if (!pendentes.has(p.matriculaId)) return false;
    return (await p.registrarConclusao()) === true;
  } catch (erro) {
    p.registrar("fecharConclusaoAdiada: a marca da conclusão adiada não foi fechada", erro);
    return false;
  }
}

/**
 * Das linhas de `treinamento_evento` (`conclusao_adiada` e `conclusao_registrada`), as matrículas cuja conclusão
 * está adiada e ainda não foi registrada: a última `conclusao_adiada` é mais recente que a última
 * `conclusao_registrada` (ou esta não existe). Não depende da ordem das linhas; ignora linha sem matrícula, de outro
 * evento ou com data inválida. No mesmo instante vale a registrada (a conclusão já foi feita).
 */
export function conclusoesAdiadas(
  eventos: {
    matricula_id?: string | null;
    evento?: string | null;
    created_at?: string | null;
  }[]
): Set<string> {
  const adiada = new Map<string, number>();
  const registrada = new Map<string, number>();
  for (const e of eventos) {
    const t = Date.parse(String(e.created_at ?? ""));
    if (!e.matricula_id || !Number.isFinite(t)) continue;
    const mapa =
      e.evento === EVENTO_CONCLUSAO_ADIADA
        ? adiada
        : e.evento === EVENTO_CONCLUSAO_REGISTRADA
          ? registrada
          : null;
    if (mapa && t > (mapa.get(e.matricula_id) ?? Number.NEGATIVE_INFINITY)) {
      mapa.set(e.matricula_id, t);
    }
  }
  return new Set(
    [...adiada]
      .filter(([id, t]) => t > (registrada.get(id) ?? Number.NEGATIVE_INFINITY))
      .map(([id]) => id)
  );
}

/**
 * As matrículas que o banco ainda tem abertas (`status` diferente de `concluido`) e que a trilha dá por completas
 * (todas as aulas e, se há prova, a aprovação), pelo estado de hoje do curso. É só o primeiro filtro da segunda
 * chance da conclusão: uma trilha que parece completa NÃO basta para concluir (o RH pode ter apagado a aula que o
 * aluno não fez ou as questões que ele não acertou); `matriculasComConclusaoPorRegistrar` escolhe, entre elas, as
 * que tiveram a conclusão adiada. `concluidoNaTrilha` só é consultado para quem ainda não está concluído no
 * banco: o caso comum (curso já concluído ou nenhum curso pronto) não custa nada.
 */
export function matriculasAbertasComTrilhaCompleta<M extends { status?: string | null }>(
  matriculas: M[],
  concluidoNaTrilha: (matricula: M) => boolean
): M[] {
  return matriculas.filter((m) => m.status !== "concluido" && concluidoNaTrilha(m));
}

/**
 * Das matrículas abertas com a trilha completa, as que a segunda chance conclui (A6, revisão 2): as que tiveram a
 * conclusão ADIADA (`adiadas`, de `conclusoesAdiadas`: a trilha estava mesmo completa quando a conclusão falhou) e
 * em que o aluno NÃO fez a prova sem passar (`provaSemAprovacao`: com tentativas e nenhuma aprovada, a trilha só
 * parece completa porque o RH apagou as questões, e concluir daria validade a quem não foi aprovado).
 */
export function matriculasComConclusaoPorRegistrar<M extends { id?: string | null }>(
  abertasComTrilhaCompleta: M[],
  adiadas: ReadonlySet<string>,
  provaSemAprovacao: (matricula: M) => boolean
): M[] {
  return abertasComTrilhaCompleta.filter(
    (m) => !!m.id && adiadas.has(m.id) && !provaSemAprovacao(m)
  );
}

/**
 * Segunda chance da conclusão (A6, revisões 1 e 2): conclui de novo as matrículas cuja conclusão foi ADIADA
 * (a leitura do curso falhou quando o aluno terminou a trilha) e, se concluiu, relê a linha e a atualiza NO LUGAR com
 * o que o banco ficou (a mesma linha que o `dados` devolve ao aluno e que o pré-requisito dos outros cursos lê).
 *
 * Quem entra: aberta no banco, trilha completa (`concluidoNaTrilha`), conclusão adiada (`lerAdiadas`, uma leitura
 * só, e só quando há candidata) e sem prova feita e não aprovada (`provaSemAprovacao`). Uma trilha que só parece
 * completa porque o RH refez a prova ou apagou uma aula NÃO é concluída aqui. `concluir` grava a `data_conclusao` do
 * dia do último marco da trilha, não o da abertura do portal.
 *
 * As matrículas andam em paralelo. NUNCA lança: erro ao ler as pendências, ao concluir ou ao reler vai para
 * `registrar` e a matrícula segue como estava, para a próxima abertura do portal tentar de novo (uma segunda chance
 * que derrubasse o `dados` tiraria o portal do ar por causa de um problema de leitura). Releitura sem linha
 * (`null`) também só é registrada. Não grava `curso_concluido` (abrir o portal não é estudar): o `concluir` do
 * `index.ts` grava o `conclusao_registrada`, que mostra à auditoria quando e como a conclusão foi registrada.
 */
export async function retomarConclusoes<
  M extends { id?: string | null; status?: string | null },
>(p: {
  matriculas: M[];
  concluidoNaTrilha: (matricula: M) => boolean;
  provaSemAprovacao: (matricula: M) => boolean;
  lerAdiadas: (matriculaIds: string[]) => Promise<ReadonlySet<string>>;
  concluir: (matricula: M) => Promise<{ concluiu: boolean; data_conclusao?: string | null }>;
  reler: (matricula: M) => Promise<M | null>;
  registrar: (mensagem: string, causa?: unknown) => void;
}): Promise<void> {
  let escolhidas: M[] = [];
  try {
    const abertas = matriculasAbertasComTrilhaCompleta(p.matriculas, p.concluidoNaTrilha);
    if (!abertas.length) return;
    const adiadas = await p.lerAdiadas(abertas.map((m) => String(m.id)));
    escolhidas = matriculasComConclusaoPorRegistrar(abertas, adiadas, p.provaSemAprovacao);
  } catch (erro) {
    p.registrar("retomarConclusao: não deu para saber quais conclusões estão adiadas", erro);
    return;
  }
  await Promise.all(
    escolhidas.map(async (matricula) => {
      try {
        if (!(await p.concluir(matricula)).concluiu) return;
        const atual = await p.reler(matricula);
        if (!atual) {
          p.registrar("retomarConclusao: a matrícula concluída não foi relida (sem linha)");
          return;
        }
        Object.assign(matricula, atual);
      } catch (erro) {
        p.registrar("retomarConclusao: falhou", erro);
      }
    })
  );
}

/**
 * O dia em que o treinamento volta a vencer: `dia` (AAAA-MM-DD, calendário de Brasília) mais `validadeMeses`.
 * Null se o curso não tem validade, ou é de apoio, ou o dia não é uma data. É a conta de `datasDeConclusao`
 * (mesmo estouro de dia 31) para quem parte de um dia que não é hoje: o semipresencial (T12) conta a validade
 * do FIM do treinamento, que pode ser o dia da prática presencial, depois da conclusão da teoria.
 */
export function renovacaoAPartirDe(
  dia: string | null | undefined,
  validadeMeses?: number | null,
  modalidade?: string | null
): string | null {
  const partes = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dia ?? "").trim());
  if (!partes || !validadeMeses || modalidade === "apoio") return null;
  const [, a, m, d] = partes.map(Number);
  const renova = new Date(Date.UTC(a, m - 1, d));
  if (Number.isNaN(renova.getTime())) return null;
  renova.setUTCMonth(renova.getUTCMonth() + validadeMeses);
  return renova.toISOString().slice(0, 10);
}

/** Dia de Brasília de um timestamp do banco; null se vazio ou se não for data. */
function diaBrasiliaOuNull(instante: unknown): string | null {
  if (typeof instante !== "string" || !instante) return null;
  const data = new Date(instante);
  return Number.isNaN(data.getTime()) ? null : dataBrasilia(data);
}

/**
 * `periodo` do certificado. O início é o dia de BRASÍLIA em que o aluno começou (`iniciado_em`, ou a
 * criação da matrícula se ele nunca registrou início); conclusão e validade já são datas de calendário
 * gravadas pelo servidor em `datasDeConclusao`.
 */
export function periodoDoCertificado(mat: {
  iniciado_em?: string | null;
  created_at?: string | null;
  data_conclusao?: string | null;
  proxima_renovacao?: string | null;
}) {
  return {
    inicio: diaBrasiliaOuNull(mat.iniciado_em) ?? diaBrasiliaOuNull(mat.created_at),
    conclusao: mat.data_conclusao ?? null,
    validade: mat.proxima_renovacao ?? null,
  };
}

/**
 * Onde o treinamento foi realizado (NR-1, 1.7.1.1: o certificado traz o local). No EAD, é a plataforma;
 * no semipresencial, `dados.local` leva também o local da prática presencial (`localComPratica`, T12).
 */
export const LOCAL_DO_CERTIFICADO = {
  ambiente: "Plataforma SIGO Obras — https://www.sigoobras.com.br/PortalFuncionario",
};

/**
 * Texto da modalidade impresso em `dados.curso.modalidade` do certificado (e no PDF e na validação
 * pública). O texto do EAD é o que os certificados já emitidos trazem. O semipresencial (T12) diz quanto é
 * teoria e quanto é prática, com as cargas do curso EAD: "Semipresencial: teoria EAD (X h) + prática
 * presencial (Y h)"; sem as duas cargas (o requisito CARGAS não deixa emitir assim), o texto genérico.
 */
export function textoDaModalidade(
  modalidade: string | null | undefined,
  curso?: { carga_teorica_horas?: unknown; carga_pratica_horas?: unknown } | null
): string {
  const m = modalidade || "ead";
  if (m === "ead") return "Ensino a distância (EAD) — NR-1, Anexo II";
  if (m === "semipresencial") {
    const teorica = Number(curso?.carga_teorica_horas);
    const pratica = Number(curso?.carga_pratica_horas);
    if (teorica > 0 && pratica > 0) {
      return (
        `Semipresencial: teoria EAD (${formatarHoras(teorica)}) + ` +
        `prática presencial (${formatarHoras(pratica)})`
      );
    }
    return "Semipresencial — teoria em ensino a distância (EAD) e prática presencial";
  }
  if (m === "apoio") return "Material de apoio ao treinamento presencial (não emite certificado)";
  return `Modalidade não reconhecida (${m})`;
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
 * DECISÃO D10 (Javerson, 06/10/2026): o reprovado vê só "insatisfatório". `false` = ele recebe o
 * conceito, as tentativas e a próxima liberação, e NÃO recebe nota, acertos nem total: em prova de 5
 * ou 6 questões, acertos e total deixam deduzir as respostas certas (T16, item 3). O RH vê tudo na
 * trilha. `true` devolveria o comportamento de antes da T16; trocar o valor aqui e publicar a função
 * basta (a prévia do RT espelha o valor em `apps/web/src/lib/portal-previa.js`: troque os dois).
 */
export const REPROVADO_VE_NOTA = false;

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
 * `REPROVADO_VE_NOTA`, D10); com `false` o reprovado não recebe nota, acertos nem total
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
 * Colunas da matrícula que vão ao navegador do aluno (T31): lista FIXA. Antes `dados` lia a matrícula
 * com `select("*")` e devolvia a linha inteira, então coluna nova no banco (uma observação do RH, um
 * campo interno) saía para o aluno sem ninguém decidir. Agora só sai o que a tela do aluno usa: o
 * andamento (`status`, datas), a aprovação e a nota (esta, sujeita à regra D10). O resto é do servidor
 * (`empresa_id`, `funcionario_id`, `tentativas_extras`, `updated_at`, `deleted_at`).
 */
export const COLUNAS_MATRICULA_ALUNO = [
  "id",
  "curso_id",
  "status",
  "iniciado_em",
  "data_conclusao",
  "proxima_renovacao",
  "avaliacao_aprovada",
  "nota_avaliacao",
  "avaliacao_em",
  "created_at",
] as const;

/**
 * O `select` da matrícula no servidor: as colunas do aluno mais `tentativas_extras`, que só o servidor
 * lê (o teto de tentativas soma as extras que o RH liberou), `tipo` e `motivo_eventual` (T23: vão para o
 * certificado, não para a tela do aluno). Serve a `minhaMatricula` (todas as ações) e
 * ao `dados`. Quem passar a ler outra coluna de `mat` no `index.ts` acrescenta aqui (o
 * `endurecimento.test.ts` acusa a que faltar).
 */
export const COLUNAS_MATRICULA_PORTAL = [
  ...COLUNAS_MATRICULA_ALUNO,
  "tentativas_extras",
  // o tipo do treinamento e o motivo do eventual (T23) só o servidor lê: entram no certificado na emissão
  "tipo",
  "motivo_eventual",
].join(", ");

/**
 * A matrícula como o aluno a recebe em `dados`: só as `COLUNAS_MATRICULA_ALUNO` (a coluna que a consulta
 * não trouxe continua ausente). `reprovadoVeNota` vale `REPROVADO_VE_NOTA` (D10) por padrão: com
 * `false`, a nota da última tentativa não sai enquanto ele não foi aprovado (senão esconder a nota na
 * resposta da prova não adiantaria: ela estaria aqui); com `true`, a nota vai como está.
 */
export function matriculaParaAluno(
  matricula: { avaliacao_aprovada?: boolean | null } & Record<string, unknown>,
  reprovadoVeNota: boolean = REPROVADO_VE_NOTA
): Record<string, unknown> {
  const saida: Record<string, unknown> = {};
  for (const coluna of COLUNAS_MATRICULA_ALUNO) {
    if (coluna in matricula) saida[coluna] = matricula[coluna];
  }
  if (!reprovadoVeNota && !matricula.avaliacao_aprovada) saida.nota_avaliacao = null;
  return saida;
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
 * Senha VAZIA (ou que nem é texto) é "incorreta" na hora, sem consumir tentativa e sem conferir: o
 * portal já desliga o botão sem senha, então só um pedido direto com o token do aluno chega aqui assim, e
 * ele não pode queimar as 5 tentativas da conta (T27).
 *
 * As três dependências entram por parâmetro (o `index.ts` liga `consumirTentativa`, `verifyPassword` e
 * `liberarTentativas`), para a ordem poder ser testada no Node.
 */
export async function reconfirmarSenha(p: {
  funcionarioId: string;
  /** A senha digitada, só para saber se veio vazia; quem a confere é `conferir`. */
  senha: string;
  consumir: (escopo: string, janelaSeg: number, limites: Limite[]) => Promise<Consumo>;
  conferir: () => Promise<boolean>;
  liberar: (consumo: Consumo) => Promise<void>;
}): Promise<ResultadoReconfirmacao> {
  if (typeof p.senha !== "string" || p.senha === "") return "incorreta";
  const consumo = await p.consumir(ESCOPO_RECONFIRMAR_SENHA, JANELA_RECONFIRMAR_SENHA_SEG, [
    { tipo: "conta", valor: p.funcionarioId, max: MAX_TENTATIVAS_RECONFIRMAR_SENHA },
  ]);
  if (!consumo.permitido) return "limite";
  if (!(await p.conferir())) return "incorreta";
  await p.liberar(consumo);
  return "ok";
}

// ------------------------------- limite de volume: evento (3 tetos) e progresso (T31)

/**
 * Teto de chamadas por funcionário das ações que o navegador repete sozinho. Sem teto, um aluno (ou um
 * script com o token dele, que vale 12 h) enchia a trilha de auditoria, que é só de inclusão (0135) e
 * não se limpa depois, e o banco com pedidos de progresso. A tentativa é consumida ANTES do trabalho,
 * como no login (`consumirTentativa`, janela fixa, uma linha por funcionário e ação).
 *
 * Os números têm folga sobre o ritmo do portal: o progresso sai a cada 10 s com a aula tocando (60 em 10
 * min; duas abas abertas, 120) mais um envio a cada pausa ou troca de aula. Passar do teto só atrasa: o
 * progresso reenvia o TOTAL assistido e o servidor credita o tempo real decorrido desde o último sinal,
 * então nada que o aluno assistiu se perde. Escopos próprios, separados do login e da senha.
 *
 * O evento tem TRÊS tetos, porque um só deixava o play repetido travar a troca de aula (T31, revisão):
 * no YouTube cada volta de BUFFERING para PLAYING manda um `play`, e com internet ruim de obra isso
 * esgotava o teto e o aluno ficava até 10 min sem conseguir abrir outra aula.
 *  - `abrir_aula`: a navegação do aluno. Escopo só dela, nada que o player faz a esgota. Uma troca a
 *    cada 5 s, sem parar, por 10 min, ainda passa (120).
 *  - `player`: `play` e `pausa` (a travada do vídeo gera um par; um par a cada 5 s por 10 min são 240
 *    eventos, e há folga até 300). Estourou só barra o próprio player, sem afetar mais nada.
 *  - `evento`: o resto (abrir curso, fim do vídeo, aba oculta ou visível, prova, projeto, certificado),
 *    dezenas em 10 min já é uso intenso.
 * Somados, o pior caso por funcionário é 570 em 10 min (abrir_aula 120 + player 300 + evento 150), pouco
 * mais de três vezes o teto único antigo.
 */
export const VOLUME_POR_ACAO = {
  evento: { escopo: "portal-evento", janelaSeg: 10 * 60, max: 150 },
  abrir_aula: { escopo: "portal-abrir-aula", janelaSeg: 10 * 60, max: 120 },
  player: { escopo: "portal-player", janelaSeg: 10 * 60, max: 300 },
  progresso: { escopo: "portal-progresso", janelaSeg: 10 * 60, max: 180 },
} as const;

export type AcaoComVolume = keyof typeof VOLUME_POR_ACAO;

/**
 * Qual teto vale para o evento que o navegador relatou (`body.evento`): `abrir_aula` e `play`/`pausa`
 * têm o seu; o resto, e qualquer nome desconhecido ou que nem é texto, cai no teto geral (`evento`).
 * Vem ANTES de validar o nome: um nome inventado também gasta o teto geral.
 */
export function acaoDeVolumeDoEvento(nome: unknown): Exclude<AcaoComVolume, "progresso"> {
  if (nome === "abrir_aula") return "abrir_aula";
  if (nome === "play" || nome === "pausa") return "player";
  return "evento";
}

/** Mensagem do 429 de volume (o portal mostra o texto que o servidor manda). */
export const MSG_MUITAS_ACOES =
  "Muitas ações em pouco tempo. Aguarde alguns minutos e tente de novo.";

/**
 * Consome uma chamada do funcionário e diz se ainda está dentro do teto da ação. É por FUNCIONÁRIO,
 * nunca por IP (aparelho compartilhado de obra não tranca os colegas). Limitador fora do ar não derruba
 * o portal (como no login). O `index.ts` liga `consumirTentativa`; a dependência entra por parâmetro
 * para a regra poder ser testada no Node.
 */
export async function dentroDoVolume(p: {
  acao: AcaoComVolume;
  funcionarioId: string;
  consumir: (escopo: string, janelaSeg: number, limites: Limite[]) => Promise<Consumo>;
}): Promise<boolean> {
  const { escopo, janelaSeg, max } = VOLUME_POR_ACAO[p.acao];
  const consumo = await p.consumir(escopo, janelaSeg, [
    { tipo: "conta", valor: p.funcionarioId, max },
  ]);
  return consumo.permitido;
}

// --------------------------------------------- trava otimista em ultimo_sinal_em (T31)

/** Mensagem do 409 de quem perdeu a corrida pelo sinal (o portal mostra o texto que o servidor manda). */
export const MSG_SINAL_CONCORRENTE =
  "O progresso desta aula foi enviado ao mesmo tempo por outra aba ou aparelho. " +
  "Seu tempo continua contando e será enviado de novo em instantes.";

/**
 * Faz o UPDATE do `ultimo_sinal_em` valer só se a coluna ainda tem o valor que o pedido LEU no começo
 * (sem sinal anterior: só se continua sem sinal). Sem isso, dois `progresso` simultâneos (duas abas, ou
 * um script) liam o mesmo sinal, cada um creditava o mesmo tempo decorrido e o aluno ganhava o dobro.
 * Com a trava, o UPDATE do Postgres serializa as chamadas: só a primeira acha a linha como a leu, e a
 * outra grava zero linhas (`resultadoDoSinal` = "mudou"). Recebe a consulta do supabase-js (já com o
 * `update` e o filtro do funcionário) e devolve a mesma, para o chamador seguir com `.select(...)`.
 */
export function travaDoSinal<
  Q extends { eq(coluna: string, valor: string): Q; is(coluna: string, valor: null): Q },
>(consulta: Q, lido: string | null | undefined): Q {
  return lido ? consulta.eq("ultimo_sinal_em", lido) : consulta.is("ultimo_sinal_em", null);
}

export type ResultadoDoSinal = "gravado" | "mudou" | "erro";

/**
 * O que a gravação do sinal quer dizer: `erro` = o banco falhou (o pedido não credita nada e responde
 * erro: antes a falha passava em silêncio e o sinal ficava velho, o que dava crédito a mais no próximo
 * pedido); `mudou` = nenhuma linha casou, outro pedido gravou o sinal primeiro (responde 409, sem
 * creditar; o navegador reenvia o total no próximo ciclo e o servidor credita o tempo real); `gravado`
 * = este pedido é o dono do sinal e segue.
 */
export function resultadoDoSinal(p: {
  erro: unknown;
  linhas: number | null | undefined;
}): ResultadoDoSinal {
  if (p.erro) return "erro";
  return (p.linhas ?? 0) > 0 ? "gravado" : "mudou";
}

// ------------------------- emissão do certificado: o hash tem de se reproduzir pelo banco (T10, M5)

/** Autor da revogação feita pelo próprio sistema (`treinamento_certificado.revogado_por`). */
export const POR_SISTEMA = "sistema";

/**
 * Motivo gravado quando a emissão é anulada. Aparece na consulta pública do certificado (texto curto, de
 * uma linha, sem dado pessoal).
 */
export const MOTIVO_EMISSAO_ANULADA =
  "Emissão anulada automaticamente: o selo de integridade do certificado não pôde ser conferido. " +
  "Procure o RH da empresa.";

/**
 * Texto do 500 da emissão que não conferiu. Nada foi entregue ao aluno. Uma nova tentativa não ajuda: o
 * certificado anulado continua ocupando a matrícula (um por matrícula) e o mesmo conteúdo daria o mesmo
 * resultado. Não existe botão de "refazer a emissão": o caminho real é o RH remover a matrícula (pode,
 * porque o certificado anulado já consta como revogado) e matricular o aluno de novo, o que recomeça o
 * curso do início (matrícula nova, sem o progresso da anterior). O texto diz isso, para o aluno não
 * esperar uma correção que o RH não tem como fazer na mesma matrícula.
 */
export const MSG_EMISSAO_ANULADA =
  "Não foi possível concluir a emissão do certificado: o selo de integridade não pôde ser conferido " +
  "e nada foi entregue. Avise o RH: ele precisa remover esta matrícula e matricular você de novo " +
  "no curso (o curso recomeça do início).";

/**
 * As únicas colunas que a anulação grava (as mesmas da revogação, migração 0119): hora do servidor, o
 * sistema como autor e o motivo.
 */
export function dadosDaAnulacaoNaEmissao(agora: Date) {
  return {
    revogado_em: agora.toISOString(),
    revogado_por: POR_SISTEMA,
    motivo_revogacao: MOTIVO_EMISSAO_ANULADA,
  };
}

export type ConferenciaDaEmissao = { entregar: true } | { entregar: false; anulado: boolean };

/**
 * Como o certificado de uma matrícula que já tem um sai para o aluno: a linha do banco mais `revogado`,
 * lido de `revogado_em` (a coluna que a revogação e a anulação gravam). Nunca fixa `false`: um
 * certificado revogado ou anulado não pode voltar como válido só porque o aluno pediu de novo.
 */
export function certificadoParaResposta<T extends { revogado_em?: string | null }>(linha: T) {
  return { ...linha, revogado: !!linha.revogado_em };
}

/**
 * Depois do INSERT, refaz o hash a partir do que o banco DEVOLVEU (o `jsonb` pode ter mudado alguma
 * coisa) e compara com o que foi gravado. Se não bate, o certificado apareceria na validação pública como
 * "Dados não conferem" desde o primeiro minuto: então NÃO é entregue e é anulado (`anular` revoga a linha;
 * o servidor não apaga, a trilha é só de inclusão, migração 0135). `anulado: false` = a anulação também
 * falhou (ou lançou): o chamador deixa rastro no log e responde o mesmo erro. Nunca lança. Se a anulação
 * LANÇAR, a causa vai para `aoFalharAnulacao` (o `index.ts` a escreve no `console.error`; injetado para
 * este módulo continuar puro), e um aviso que ele próprio lance não derruba a resposta.
 */
export async function conferirEmissaoDoCertificado(p: {
  hashEmitido: string;
  gravado: { codigo: string; dados: unknown; assinatura_aluno: unknown };
  anular: () => Promise<boolean>;
  /** Recebe o hash refeito a partir do banco, para o log. */
  aoDivergir?: (hashRefeito: string) => void;
  /** Recebe a exceção lançada pela anulação (a causa, que antes se perdia), para o log. */
  aoFalharAnulacao?: (erro: unknown) => void;
}): Promise<ConferenciaDaEmissao> {
  const refeito = await hashDoCertificado(
    p.gravado.codigo,
    p.gravado.dados,
    p.gravado.assinatura_aluno
  );
  if (refeito === p.hashEmitido) return { entregar: true };
  p.aoDivergir?.(refeito);
  let anulado = false;
  try {
    anulado = await p.anular();
  } catch (erro) {
    anulado = false;
    try {
      p.aoFalharAnulacao?.(erro);
    } catch {
      // o log nunca derruba a resposta
    }
  }
  return { entregar: false, anulado };
}
