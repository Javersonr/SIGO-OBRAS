/**
 * Baixa / estorno de despesa e receita com o extrato DERIVADO pelo banco
 * (migração 0155): a tela grava só a transação — `status` + `data_pagamento`,
 * ou o JSON `parcelas` — e o banco cria/ajusta/retira a linha do extrato na
 * mesma gravação. A tela nunca mais mexe em extrato_bancario.
 *
 * Lançamento conciliado com a linha do extrato do banco (OFX) não pode ser
 * estornado nem excluído enquanto conciliado (trigger da 0155): antes é preciso
 * desfazer a conciliação pela RPC desconciliar_transacao (0156).
 */
import { hojeLocalISO } from "@/components/financeiro/utils";
import { STATUS_FINANCEIRO, isStatusPago } from "@/lib/financeiro-utils";

export const PERGUNTA_DESCONCILIAR =
  "Este pagamento está conciliado com o extrato do banco. Desfazer a conciliação e estornar?";

/**
 * Campos da transação ao pagar (na data informada; sem data = hoje) ou ao
 * voltar para em aberto (sem data de pagamento).
 */
export function camposDaBaixa(pagar, dataPagamento) {
  return pagar
    ? { status: STATUS_FINANCEIRO.PAGO, data_pagamento: dataPagamento || hojeLocalISO() }
    : { status: STATUS_FINANCEIRO.EM_ABERTO, data_pagamento: null };
}

/**
 * Erro do banco por lançamento/linha conciliados (0155:
 * trg_transacao_conciliada_sem_estorno e trg_extrato_banco_conciliado_sem_apagar,
 * ambos "… desfaça a conciliação antes de …").
 */
export function ehErroConciliacao(err) {
  const msg = String(err?.message ?? err ?? "");
  return /desfa[çc]a a concilia[çc][ãa]o/i.test(msg);
}

/**
 * Separa os selecionados da baixa em lote. Parcelada é paga parcela a parcela
 * (o banco lê o JSON `parcelas`, não o status da transação) e a já paga
 * (pago/Pago/Realizado) fica como está.
 */
export function classificarBaixaEmLote(itens) {
  const baixar = [];
  const parceladas = [];
  const jaPagas = [];
  for (const t of itens || []) {
    if (!t) continue;
    if (t.parcelado === true) parceladas.push(t);
    else if (isStatusPago(t.status)) jaPagas.push(t);
    else baixar.push(t);
  }
  return { baixar, parceladas, jaPagas };
}

/** Aviso final da baixa em lote: quantas baixadas, quantas puladas e por quê. */
export function resumoBaixaEmLote(
  { baixadas = 0, parceladas = 0, jaPagas = 0, falhas = [] },
  { itens = "despesa(s)", baixadasRotulo = "baixada(s)", pagasRotulo = "paga(s)" } = {}
) {
  const linhas = [`✅ ${baixadas} ${itens} ${baixadasRotulo}.`];
  const puladas = parceladas + jaPagas;
  if (puladas > 0) {
    const motivos = [];
    if (parceladas > 0) {
      motivos.push(
        `${parceladas} parcelada(s) — o pagamento é feito parcela a parcela, no detalhe`
      );
    }
    if (jaPagas > 0) motivos.push(`${jaPagas} já estava(m) ${pagasRotulo}`);
    linhas.push(`⏭️ ${puladas} pulada(s): ${motivos.join("; ")}.`);
  }
  if (falhas.length > 0) {
    linhas.push(`❌ ${falhas.length} com erro:`);
    linhas.push(...falhas.slice(0, 10));
    if (falhas.length > 10) linhas.push(`... e mais ${falhas.length - 10}`);
  }
  return linhas.join("\n");
}

/**
 * Estorno (pago → em aberto). Conciliado com o extrato do banco, o banco recusa
 * (0155): com o ok do usuário, desfaz a conciliação (0156) e só então estorna.
 * Se a lista ainda mostrava o lançamento sem conciliação (conciliado em outra
 * tela), o erro do banco leva ao mesmo caminho. Devolve false se o usuário
 * desistiu.
 */
export async function estornarLancamento({ conciliado, estornar, desconciliar, confirmar }) {
  if (conciliado) {
    if (!confirmar()) return false;
    await desconciliar();
    await estornar();
    return true;
  }
  try {
    await estornar();
  } catch (err) {
    if (!ehErroConciliacao(err)) throw err;
    if (!confirmar()) return false;
    await desconciliar();
    await estornar();
  }
  return true;
}

/** RPC da 0156: solta a linha do extrato do banco e a transação, juntas. */
export async function desconciliarTransacao(client, transacaoId) {
  if (!client) throw new Error("Backend não configurado");
  const { error } = await client.rpc("desconciliar_transacao", { p_transacao_id: transacaoId });
  if (error) throw error;
}

/**
 * Parcela paga / em aberto no JSON `parcelas`. O banco (0155,
 * financeiro_extrato_esperado) lê de cada parcela `status` (pago/realizado),
 * `valor` e `data_pagamento` (sem ela, `data_vencimento`). Devolve um array
 * NOVO — o original (às vezes o próprio objeto da lista) não é alterado.
 */
export function marcarParcela(parcelas, index, { pago, dataPagamento, comprovanteUrl } = {}) {
  return (parcelas || []).map((p, i) => {
    if (i !== index) return p;
    return pago
      ? {
          ...p,
          status: STATUS_FINANCEIRO.PAGO,
          data_pagamento: dataPagamento || hojeLocalISO(),
          comprovante_url: comprovanteUrl || null,
        }
      : { ...p, status: STATUS_FINANCEIRO.EM_ABERTO, data_pagamento: null, comprovante_url: null };
  });
}

/**
 * Paga / desfaz UMA parcela no banco (financeiro_marcar_parcela, 0155): a
 * transação é travada e só essa parcela muda — a tela não regrava mais o JSON
 * inteiro a partir da cópia que tinha aberta (pagar a 2 com o detalhe
 * desatualizado "despagava" a 1). Devolve as parcelas gravadas.
 */
export async function marcarParcelaNoBanco(
  client,
  transacaoId,
  indice,
  { pago, dataPagamento, comprovanteUrl } = {}
) {
  if (!client) throw new Error("Backend não configurado");
  const { data, error } = await client.rpc("financeiro_marcar_parcela", {
    p_transacao_id: transacaoId,
    p_indice: indice,
    p_pago: !!pago,
    p_data_pagamento: pago ? dataPagamento || hojeLocalISO() : null,
    p_comprovante_url: pago ? comprovanteUrl || null : null,
  });
  if (error) throw error;
  return data;
}

/**
 * Ao salvar a edição de uma parcelada, o pagamento de cada parcela vem do
 * BANCO (pode ter sido pago pelo detalhe ou por outra pessoa depois que o
 * formulário abriu); do formulário vêm valor, vencimento e número.
 */
export function preservarPagamentosDasParcelas(parcelasForm, parcelasBanco) {
  const banco = Array.isArray(parcelasBanco) ? parcelasBanco : [];
  return (parcelasForm || []).map((p, i) => {
    const gravada = banco[i];
    if (!gravada || typeof gravada !== "object") return p;
    return {
      ...p,
      status: gravada.status ?? p.status,
      data_pagamento: gravada.data_pagamento ?? null,
      comprovante_url: gravada.comprovante_url ?? null,
    };
  });
}

/**
 * Status da despesa parcelada a partir das parcelas (o extrato segue as
 * parcelas, 0155): todas pagas → pago; senão em aberto (ou o status em aberto
 * que já tinha, ex.: atrasado). Cancelada continua cancelada.
 */
export function statusDaParcelada(parcelas, statusAtual) {
  if (String(statusAtual || "").toLowerCase() === STATUS_FINANCEIRO.CANCELADO) return statusAtual;
  const lista = (parcelas || []).filter((p) => p && typeof p === "object");
  if (lista.length > 0 && lista.every((p) => isStatusPago(p.status))) return STATUS_FINANCEIRO.PAGO;
  return isStatusPago(statusAtual) || !statusAtual ? STATUS_FINANCEIRO.EM_ABERTO : statusAtual;
}
