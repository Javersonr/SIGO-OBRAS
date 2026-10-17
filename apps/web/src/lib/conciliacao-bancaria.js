/**
 * Regras puras da tela de Conciliação Bancária (ConciliacaoBancaria.jsx).
 *
 * Desde a migração 0156 o extrato_bancario guarda dois tipos de linha:
 *   - "do sistema": geradas pelo banco quando uma transação é paga (0155) —
 *     são o saldo da conta;
 *   - "do banco": importadas do OFX/CSV, só para conciliar — NÃO entram no
 *     saldo. Critério igual ao de public._extrato_eh_do_banco (0156).
 *
 * Valores: a linha do banco nova tem `valor` COM sinal (débito negativo); a
 * importada antes da 0156 tem valor positivo e o sinal só no `tipo`
 * ("debito"/"credito"). A transação tem valor positivo e o sinal no tipo
 * ("despesa"/"receita"). Toda comparação aqui é em centavos e com sinal:
 * débito do banco só casa com despesa, crédito com receita.
 */
import { normalizarTexto } from "./busca";
import { safeParseJSON } from "./json-utils";
import { isDespesa, isReceita, isStatusPago, normalizeStatus } from "./financeiro-utils";

/** Mesmo critério de public._extrato_eh_do_banco (0156). */
export function ehLinhaDoBanco(e) {
  if (!e) return false;
  return (
    e.status_conciliacao != null ||
    e.upload_id != null ||
    String(e.origem ?? "").toUpperCase() === "OFX"
  );
}

/** Linha do banco já ligada a um lançamento (conciliar_extrato recusaria de novo). */
export function extratoConciliado(e) {
  return (
    ehLinhaDoBanco(e) &&
    (!!e.transacao_id || normalizeStatus(e.status_conciliacao) === "conciliado")
  );
}

export function extratoPendente(e) {
  return ehLinhaDoBanco(e) && !extratoConciliado(e);
}

export const centavos = (v) => Math.round((Number(v) || 0) * 100);

/** Valor da linha do extrato com sinal (débito negativo). */
export function valorDoExtrato(e) {
  const tipo = normalizeStatus(e?.tipo);
  const v = Number(e?.valor) || 0;
  if (tipo === "debito") return -Math.abs(v);
  if (tipo === "credito") return Math.abs(v);
  return v;
}

/** Valor do lançamento com sinal (despesa negativa). */
export function valorDaTransacao(t) {
  const v = Number(t?.valor) || 0;
  if (isDespesa(t)) return -Math.abs(v);
  if (isReceita(t)) return Math.abs(v);
  return v;
}

/**
 * Receita só concilia com entrada do banco e despesa só com saída — a mesma
 * regra que conciliar_extrato (0156) aplica no banco (linha antiga: valor sem
 * sinal, sentido em tipo).
 */
export function mesmoSentido(extrato, transacao) {
  const saida = valorDoExtrato(extrato) < 0;
  if (isReceita(transacao)) return !saida;
  if (isDespesa(transacao)) return saida;
  return false;
}

/** Data que deve bater com o extrato: pagamento (se pago) ou vencimento. */
export function dataDaTransacao(t) {
  if (!t) return null;
  if (isStatusPago(t.status)) return t.data_pagamento || t.data_vencimento || t.data || null;
  return t.data_vencimento || t.data || null;
}

/** Diferença em dias entre duas datas "AAAA-MM-DD" (Infinity se faltar alguma). */
export function diasEntre(a, b) {
  const da = Date.parse(String(a ?? "").slice(0, 10));
  const db = Date.parse(String(b ?? "").slice(0, 10));
  if (Number.isNaN(da) || Number.isNaN(db)) return Infinity;
  return Math.abs(da - db) / 86400000;
}

const ehCancelado = (t) => normalizeStatus(t?.status).startsWith("cancel");

/**
 * Lançamento que conciliar_extrato aceita: não conciliado, não cancelado,
 * receita/despesa, e — se ainda em aberto — não parcelado (a RPC recusa
 * parcelado em aberto: a parcela tem de ser paga antes).
 */
export function transacaoConciliavel(t) {
  if (!t || t.conciliado || ehCancelado(t)) return false;
  if (!isDespesa(t) && !isReceita(t)) return false;
  return isStatusPago(t.status) || !t.parcelado;
}

/** Lançamento em aberto: conciliar_extrato vai baixá-lo na data da linha do extrato. */
export const seraBaixadoAoConciliar = (t) => !isStatusPago(t?.status);

function palavrasDaRegra(regra) {
  const lista = Array.isArray(regra?.palavras_chave)
    ? regra.palavras_chave
    : safeParseJSON(regra?.palavras_chave, []);
  if (!Array.isArray(lista)) return [];
  return lista.map((p) => normalizarTexto(p).trim()).filter(Boolean);
}

/**
 * A regra (regra_conciliacao: tipo_match, palavras_chave, ignorar_descricao,
 * tolerancia_valor, tolerancia_dias) liga esta linha do extrato a este lançamento?
 */
export function regraCasa(regra, extrato, transacao) {
  if (!regra || !extrato || !transacao) return false;
  if (!mesmoSentido(extrato, transacao)) return false;

  const tolValor = Math.abs(centavos(regra.tolerancia_valor));
  const difValor = Math.abs(
    centavos(valorDaTransacao(transacao)) - centavos(valorDoExtrato(extrato))
  );
  if (difValor > tolValor) return false;

  const tolDias = Math.abs(Number(regra.tolerancia_dias) || 0);
  if (diasEntre(dataDaTransacao(transacao), extrato.data) > tolDias) return false;

  if (regra.ignorar_descricao) return true;

  const descExtrato = normalizarTexto(extrato.descricao || extrato.historico).trim();
  const descTransacao = normalizarTexto(transacao.descricao).trim();
  if (regra.tipo_match === "exato") {
    return descExtrato.length > 0 && descExtrato === descTransacao;
  }
  if (regra.tipo_match === "contem") {
    // needle vazio NÃO pode casar tudo (extrato sem descrição ≠ coringa)
    return descExtrato.length > 0 && descTransacao.includes(descExtrato);
  }
  if (regra.tipo_match === "palavra_chave") {
    return palavrasDaRegra(regra).some((p) => descExtrato.includes(p));
  }
  return false;
}

/** Regras ativas na ordem da tela de regras: prioridade menor primeiro. */
export function ordenarRegras(regras) {
  return [...(regras || [])]
    .filter((r) => r && r.ativo !== false)
    .sort((a, b) => (Number(a.prioridade) || 0) - (Number(b.prioridade) || 0));
}

/** Badge "sugestão" da lista de pendentes: valor até R$ 0,10 e até 5 dias. */
export function ehSugestao(extrato, transacao) {
  const difValor = Math.abs(
    centavos(valorDaTransacao(transacao)) - centavos(valorDoExtrato(extrato))
  );
  return difValor <= 10 && diasEntre(dataDaTransacao(transacao), extrato.data) <= 5;
}

/**
 * Pontuação (0–100) de um lançamento como par da linha do extrato, para
 * ordenar as sugestões da conciliação manual: valor 40, data 30, descrição 30.
 */
export function pontuarCandidato(extrato, transacao) {
  let score = 0;

  const difValor = Math.abs(
    centavos(valorDaTransacao(transacao)) - centavos(valorDoExtrato(extrato))
  );
  if (difValor === 0) score += 40;
  else if (difValor <= 10) score += 30;
  else if (difValor <= 100) score += 20;
  else if (difValor <= 1000) score += 10;

  const dias = diasEntre(dataDaTransacao(transacao), extrato.data);
  if (dias === 0) score += 30;
  else if (dias <= 1) score += 25;
  else if (dias <= 3) score += 20;
  else if (dias <= 7) score += 10;

  const descExtrato = normalizarTexto(extrato.descricao || extrato.historico).trim();
  const descTransacao = normalizarTexto(transacao.descricao).trim();
  if (descExtrato && descTransacao) {
    if (descExtrato.includes(descTransacao) || descTransacao.includes(descExtrato)) {
      score += 30;
    } else {
      const palavrasTransacao = descTransacao.split(/\s+/);
      const comuns = descExtrato
        .split(/\s+/)
        .filter((p) => p.length > 3 && palavrasTransacao.includes(p));
      score += Math.min(30, comuns.length * 10);
    }
  }

  return { score, valorExato: difValor === 0, dataProxima: dias <= 1 };
}
