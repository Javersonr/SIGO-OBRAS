/**
 * Lembretes de habilitação por WhatsApp: esvazia a fila gravada pelo banco
 * (alertar_documentos_habilitacao, migração 0155). Quem decide O QUE enviar é o banco; aqui só se
 * envia o que está na fila, uma vez cada. Puro: a fila, o envio e o telefone entram injetados.
 */
export const MAX_POR_RODADA = 50;
export const MAX_TENTATIVAS = 3;
export const VALIDADE_DA_FILA_HORAS = 36;

export interface ItemFila {
  id: string;
  telefone: string;
  texto: string;
  tentativas: number;
}

export interface DepsFila {
  /** pendentes (enviado_em nulo, tentativas < MAX_TENTATIVAS, criados nas últimas 36 h), os mais antigos primeiro */
  pendentes(limite: number): Promise<ItemFila[]>;
  /** soma 1 em tentativas se ninguém pegou antes (tentativas ainda = item.tentativas); false = outro pegou */
  reivindicar(item: ItemFila): Promise<boolean>;
  normalizar(telefone: string): string | null;
  enviar(numero: string, texto: string): Promise<void>;
  marcarEnviado(id: string): Promise<void>;
  marcarErro(id: string, erro: string): Promise<void>;
  /** true quando o erro é "canal não configurado" (para a rodada sem gastar as outras tentativas) */
  canalForaDoAr(e: unknown): boolean;
}

export async function esvaziarFila(
  deps: DepsFila
): Promise<{ lidos: number; enviados: number; falhas: number; parou: boolean }> {
  const itens = await deps.pendentes(MAX_POR_RODADA);
  let enviados = 0;
  let falhas = 0;
  for (const item of itens) {
    if (!(await deps.reivindicar(item))) continue;
    const numero = deps.normalizar(item.telefone);
    if (!numero) {
      await deps.marcarErro(item.id, "telefone inválido");
      falhas++;
      continue;
    }
    try {
      await deps.enviar(numero, item.texto);
      await deps.marcarEnviado(item.id);
      enviados++;
    } catch (e) {
      await deps.marcarErro(item.id, ((e as Error)?.message ?? String(e)).slice(0, 300));
      falhas++;
      if (deps.canalForaDoAr(e)) return { lidos: itens.length, enviados, falhas, parou: true };
    }
  }
  return { lidos: itens.length, enviados, falhas, parou: false };
}
