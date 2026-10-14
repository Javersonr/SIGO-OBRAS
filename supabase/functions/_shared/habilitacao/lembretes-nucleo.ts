/**
 * Lembretes de habilitação por WhatsApp: esvazia a fila gravada pelo banco
 * (alertar_documentos_habilitacao, migração 0155). Quem decide O QUE enviar é o banco; aqui só se
 * envia o que está na fila, uma vez cada. Puro: a fila, o envio e o telefone entram injetados.
 *
 * Uma mensagem não sai duas vezes: quem vai enviar RESERVA o item antes (reivindicado_em), e outra
 * execução que chegue durante o envio não o enxerga. A reserva vale RESERVA_MINUTOS: se a execução
 * morrer no meio, o item volta a ficar disponível depois desse prazo.
 */
export const MAX_POR_RODADA = 50;
export const MAX_TENTATIVAS = 3;
export const VALIDADE_DA_FILA_HORAS = 36;
export const RESERVA_MINUTOS = 10;
/** Tamanho máximo do erro gravado no item. */
const LIMITE_DO_ERRO = 300;

export interface ItemFila {
  id: string;
  telefone: string;
  texto: string;
  tentativas: number;
}

export interface DepsFila {
  /**
   * pendentes (enviado_em nulo, tentativas < MAX_TENTATIVAS, criados nas últimas 36 h) SEM reserva viva
   * (reivindicado_em nulo ou mais antigo que RESERVA_MINUTOS), os mais antigos primeiro
   */
  pendentes(limite: number): Promise<ItemFila[]>;
  /**
   * reserva o item para esta execução: soma 1 em tentativas e grava reivindicado_em = agora, se ninguém
   * pegou antes (tentativas ainda = item.tentativas, não enviado, sem reserva viva); false = outro pegou
   */
  reivindicar(item: ItemFila): Promise<boolean>;
  normalizar(telefone: string): string | null;
  enviar(numero: string, texto: string): Promise<void>;
  /** grava enviado_em e solta a reserva; LANÇA se a gravação falhar */
  marcarEnviado(id: string): Promise<void>;
  /**
   * grava o erro e solta a reserva; definitivo = true também esgota as tentativas (o item não volta);
   * LANÇA se a gravação falhar
   */
  marcarErro(id: string, erro: string, definitivo: boolean): Promise<void>;
  /** true quando o erro é "canal não configurado" (para a rodada sem gastar as outras tentativas) */
  canalForaDoAr(e: unknown): boolean;
}

const textoDoErro = (e: unknown) =>
  String((e as Error)?.message ?? e ?? "erro desconhecido").slice(0, LIMITE_DO_ERRO);

/**
 * Grava o erro do item. Se a gravação falhar, a rodada segue: o log leva só o id (nem telefone nem
 * texto), e a reserva do item expira sozinha em RESERVA_MINUTOS.
 */
async function registrarErro(
  deps: DepsFila,
  id: string,
  erro: string,
  definitivo: boolean
): Promise<void> {
  try {
    await deps.marcarErro(id, erro, definitivo);
  } catch {
    console.error(`[habilitacao-lembretes] item ${id}: não foi possível gravar o erro do envio`);
  }
}

export async function esvaziarFila(
  deps: DepsFila
): Promise<{ lidos: number; enviados: number; falhas: number; parou: boolean }> {
  const itens = await deps.pendentes(MAX_POR_RODADA);
  let enviados = 0;
  let falhas = 0;
  for (const item of itens) {
    // telefone que não dá para normalizar nunca vai dar: erro definitivo, antes de reservar (não gasta
    // tentativa de envio)
    const numero = deps.normalizar(item.telefone);
    if (!numero) {
      falhas++;
      await registrarErro(deps, item.id, "telefone inválido", true);
      continue;
    }

    if (!(await deps.reivindicar(item))) continue;

    // 1. o envio: se falhar, o erro fica no item e a reserva é solta (ele volta a ser tentado)
    try {
      await deps.enviar(numero, item.texto);
    } catch (e) {
      falhas++;
      await registrarErro(deps, item.id, textoDoErro(e), false);
      if (deps.canalForaDoAr(e)) return { lidos: itens.length, enviados, falhas, parou: true };
      continue;
    }

    // 2. a mensagem SAIU. Uma falha ao gravar isso não é falha de envio: marcar erro devolveria o item
    //    à fila e ele sairia de novo. Fica só o log, com o id.
    enviados++;
    try {
      await deps.marcarEnviado(item.id);
    } catch {
      console.error(
        `[habilitacao-lembretes] item ${item.id}: enviado, mas não foi possível gravar o envio`
      );
    }
  }
  return { lidos: itens.length, enviados, falhas, parou: false };
}
