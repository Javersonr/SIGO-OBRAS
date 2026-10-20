/**
 * Cálculos PUROS dos relatórios financeiros (DRE, Balanço, Índices,
 * comparativo de períodos e filtros vindos da IA).
 *
 * Os componentes em components/financeiro/ só chamam estas funções e
 * desenham o resultado — assim a regra contábil fica testável e igual em
 * todos os relatórios (antes cada tela tinha o seu critério e os números
 * não batiam entre DRE, Balanço e Índices).
 *
 * Os dados gravados misturam grafias ("Despesa"/"receita", "pago"/"Realizado")
 * — por isso TODA comparação de tipo/status passa pelos helpers normalizados.
 */
import {
  isReceita,
  isDespesa,
  isStatusPago,
  isStatusPendente,
  normalizeStatus,
} from "./financeiro-utils";
import { normalizarTexto } from "./busca";

/** Abas que existem em RelatoriosTab — a IA só pode trocar para uma destas. */
export const TIPOS_RELATORIO = ["dre", "balanco", "fluxo", "indices", "evolucao", "apuracao"];

/**
 * ISS/INSS retidos na medição: a RPC de faturamento lança a Receita já
 * LÍQUIDA deles e lança cada imposto como Despesa "pago" com esta referência.
 */
export const REFERENCIA_IMPOSTO_MEDICAO = "medicao_obra_imposto";

/** Tipos de conta que contam como disponibilidade (dinheiro em mãos/banco). */
export const TIPOS_CONTA_DISPONIVEL = ["Banco", "Caixa", "Fundo Fixo", "Investimento"];

/**
 * Conta que é dinheiro (banco, caixa, fundo fixo, investimento). O plano de
 * contas mora na mesma tabela (conta_financeira) com tipo_natureza
 * Passivo/Receita/...: essas não entram como disponibilidade.
 */
export function contaDisponivel(c) {
  if (!TIPOS_CONTA_DISPONIVEL.includes(c?.tipo)) return false;
  return !c?.tipo_natureza || normalizeStatus(c.tipo_natureza) === "ativo";
}

const DIA_MS = 24 * 60 * 60 * 1000;

const arred = (v) => Math.round((Number(v) || 0) * 100) / 100;
const valorDe = (t) => Number(t?.valor) || 0;
const soma = (lista) => arred(lista.reduce((s, t) => s + valorDe(t), 0));

/**
 * Data usada pelos filtros de período (mesmo critério em todos os relatórios e
 * no extrato do banco, 0155): o que foi pago conta na data do PAGAMENTO
 * (regime de caixa); o que está em aberto, no vencimento. Antes um pagamento
 * feito em outubro de uma conta vencida em setembro caía em setembro.
 */
export function dataReferencia(t) {
  const pagoEm = isStatusPago(t?.status) ? t?.data_pagamento : null;
  return String(pagoEm || t?.data_vencimento || t?.data || t?.created_date || "").slice(0, 10);
}

// número do JSON das parcelas: 123.45 | "123.45" | "1.234,56" | lixo → 0 (= _numero_br da 0155)
function numeroBR(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  let txt = String(v ?? "").trim();
  if (!txt) return 0;
  if (txt.includes(",")) txt = txt.replace(/\./g, "").replace(",", ".");
  const n = Number(txt);
  return Number.isFinite(n) ? n : 0;
}

// parcelas gravadas como array, string JSON ou string JSON de string JSON
function lerParcelas(valor) {
  let v = valor;
  for (let i = 0; i < 2 && typeof v === "string"; i += 1) {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  return Array.isArray(v) ? v : null;
}

const dataISOouNull = (v) =>
  /^\d{4}-\d{2}-\d{2}/.test(String(v ?? "")) ? String(v).slice(0, 10) : null;

/**
 * Lançamento parcelado vira uma linha por parcela — valor, vencimento,
 * pagamento e status da PRÓPRIA parcela —, exatamente como o extrato do banco
 * (0155) os lança. Antes a despesa parcelada entrava inteira pelo status geral:
 * parcelas já pagas contavam como em aberto e o total caía numa data só.
 * Chamar ANTES dos filtros de período.
 */
export function expandirParcelas(transacoes) {
  return (transacoes || []).flatMap((t) => {
    const parcelas = t?.parcelado ? lerParcelas(t.parcelas) : null;
    if (!parcelas || parcelas.length === 0) return [t];
    const cancelada = normalizeStatus(t.status) === "cancelado";
    return parcelas
      .filter((parcela) => parcela && typeof parcela === "object")
      .map((parcela, i) => {
        const paga = isStatusPago(parcela.status);
        return {
          ...t,
          id: `${t.id}:p${i + 1}`,
          transacao_id: t.id,
          parcela_numero: parcela.numero ?? i + 1,
          valor: Math.abs(numeroBR(parcela.valor)),
          data_vencimento: dataISOouNull(parcela.data_vencimento) || t.data_vencimento,
          data_pagamento: paga ? dataISOouNull(parcela.data_pagamento) : null,
          status: cancelada ? t.status : paga ? "pago" : "pendente",
        };
      });
  });
}

/** Regime contábil = só lançamentos com documento fiscal. */
export function filtrarPorVersao(transacoes, versao = "real") {
  const lista = transacoes || [];
  return versao === "contabil" ? lista.filter((t) => !!t.numero_documento) : lista;
}

const ehImpostoMedicao = (t) => t?.referencia_tipo === REFERENCIA_IMPOSTO_MEDICAO;

// competência: o lançamento só existe na posição de datas a partir dela
const dataCompetencia = (t) =>
  String(t?.data || t?.created_date || t?.data_vencimento || "").slice(0, 10);

/**
 * Em aberto na data-base: já lançado e ainda não pago NAQUELA data (pago
 * depois dela conta como aberto). Sem data-base, é a posição de hoje. Antes o
 * balanço só via títulos com vencimento até a data-base: uma conta a pagar do
 * mês seguinte sumia do passivo.
 */
export function abertoNaData(t, dataBase) {
  if (!dataBase) return isStatusPendente(t?.status);
  const competencia = dataCompetencia(t);
  if (competencia && competencia > dataBase) return false;
  if (isStatusPendente(t?.status)) return true;
  if (isStatusPago(t?.status)) {
    const pagoEm = dataReferencia(t);
    return !!pagoEm && pagoEm > dataBase;
  }
  return false;
}

// efeito, com sinal, que o extrato do sistema (0155) registra para o lançamento pago
function movimentoNoCaixa(t) {
  if (!t?.conta_id || !isStatusPago(t.status) || ehImpostoMedicao(t)) return 0;
  const v = Math.abs(valorDe(t));
  if (isReceita(t)) return v;
  if (isDespesa(t)) return -v;
  return 0;
}

/**
 * Saldo das contas na data-base: saldo atual menos o que entrou/saiu depois
 * dela. Vale porque o extrato do sistema é derivado das transações pagas
 * (0155) e as transferências entre contas próprias se anulam no total.
 * `transacoesCaixa` são TODAS as transações da empresa (já com as parcelas
 * expandidas), sem os filtros de categoria/projeto da tela.
 */
export function saldoContasNaData(contas, transacoesCaixa, dataBase) {
  const lista = (contas || []).filter(contaDisponivel);
  const atual = lista.reduce((s, c) => s + (Number(c.saldo_atual) || 0), 0);
  if (!dataBase) return arred(atual);
  const ids = new Set(lista.map((c) => c.id));
  const depois = (transacoesCaixa || [])
    .filter((t) => ids.has(t.conta_id) && dataReferencia(t) > dataBase)
    .reduce((s, t) => s + movimentoNoCaixa(t), 0);
  return arred(atual - depois);
}

// ---------------------------------------------------------------------------
// DRE
// ---------------------------------------------------------------------------

/**
 * DRE gerencial (regime de caixa: só lançamentos pagos).
 *
 * - Deduções = ISS/INSS retidos (despesas pagas `medicao_obra_imposto`).
 *   Como a Receita da medição já vem líquida deles, Receita Bruta = receitas
 *   pagas + deduções e Receita Líquida = receitas pagas — e os impostos NÃO
 *   entram de novo em custos/despesas (antes eram descontados duas vezes).
 * - Custos diretos de obra = despesas pagas vinculadas a projeto.
 * - Despesas operacionais = despesas pagas sem projeto.
 * - Não há IR/CSLL no sistema: o resultado final é "antes de IR/CSLL".
 */
export function calcularDRE(transacoes, versao = "real") {
  const pagas = filtrarPorVersao(transacoes, versao).filter((t) => isStatusPago(t.status));
  const receitas = pagas.filter((t) => isReceita(t));
  const despesas = pagas.filter((t) => isDespesa(t));
  const demaisDespesas = despesas.filter((t) => !ehImpostoMedicao(t));

  const deducoes = soma(despesas.filter(ehImpostoMedicao));
  const receitaLiquida = soma(receitas);
  const receitaBruta = arred(receitaLiquida + deducoes);
  const custosDiretos = soma(demaisDespesas.filter((t) => !!t.projeto_id));
  const despesasOperacionais = soma(demaisDespesas.filter((t) => !t.projeto_id));

  const lucroBruto = arred(receitaLiquida - custosDiretos);
  const resultadoAntesIR = arred(lucroBruto - despesasOperacionais);
  const margem = (v) => (receitaLiquida > 0 ? (v / receitaLiquida) * 100 : 0);

  return {
    receitaBruta,
    deducoes,
    receitaLiquida,
    custosDiretos,
    lucroBruto,
    margemBruta: margem(lucroBruto),
    despesasOperacionais,
    resultadoAntesIR,
    margemAntesIR: margem(resultadoAntesIR),
  };
}

// ---------------------------------------------------------------------------
// Balanço patrimonial (gerencial)
// ---------------------------------------------------------------------------

/**
 * Balanço gerencial que SEMPRE fecha (Ativo = Passivo + PL), na data-base.
 *
 * Ativo = saldo das contas na data-base + contas a receber em aberto nela;
 * Passivo = contas a pagar em aberto nela; PL = Ativo − Passivo, decomposto em
 * capital/saldos iniciais (Σ saldo_inicial das contas) + resultado acumulado.
 * Antes o PL era receitas − despesas do período e nunca fechava.
 *
 * @param {Array} transacoes       transações (com filtros da tela, parcelas expandidas)
 * @param {Array} contas
 * @param {string} [versao]
 * @param {string} [dataBase]      "YYYY-MM-DD"; sem ela, posição de hoje
 * @param {Array} [transacoesCaixa] todas as transações da empresa (saldo na data-base)
 */
export function calcularBalanco(transacoes, contas, versao = "real", dataBase, transacoesCaixa) {
  const lista = filtrarPorVersao(transacoes, versao);
  const disponiveis = (contas || []).filter(contaDisponivel);

  const saldoContas = saldoContasNaData(disponiveis, transacoesCaixa || transacoes, dataBase);
  const capital = arred(disponiveis.reduce((s, c) => s + (Number(c.saldo_inicial) || 0), 0));
  const contasReceber = soma(lista.filter((t) => isReceita(t) && abertoNaData(t, dataBase)));
  const contasPagar = soma(lista.filter((t) => isDespesa(t) && abertoNaData(t, dataBase)));

  const ativoCirculante = arred(saldoContas + contasReceber);
  const ativoTotal = ativoCirculante;
  const passivoCirculante = contasPagar;
  const patrimonioLiquido = arred(ativoTotal - passivoCirculante);
  const resultadoAcumulado = arred(patrimonioLiquido - capital);
  const passivoTotal = arred(passivoCirculante + patrimonioLiquido);

  return {
    saldoContas,
    contasReceber,
    ativoCirculante,
    ativoTotal,
    contasPagar,
    passivoCirculante,
    capital,
    resultadoAcumulado,
    patrimonioLiquido,
    passivoTotal,
  };
}

// ---------------------------------------------------------------------------
// Datas / períodos
// ---------------------------------------------------------------------------

/** "YYYY-MM-DD" → ms UTC (null se inválida; rejeita 2026-02-31). */
function parseDataISO(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s ?? ""));
  if (!m) return null;
  const ano = Number(m[1]);
  const mes = Number(m[2]) - 1;
  const dia = Number(m[3]);
  const ms = Date.UTC(ano, mes, dia);
  const d = new Date(ms);
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes || d.getUTCDate() !== dia) return null;
  return ms;
}

const formatarDataISO = (ms) => new Date(ms).toISOString().slice(0, 10);

export function dataISOValida(s) {
  return parseDataISO(s) !== null;
}

/** Data local de hoje em "YYYY-MM-DD" (sem o deslocamento UTC do toISOString). */
export function dataLocalISO(agora = new Date()) {
  const dois = (n) => String(n).padStart(2, "0");
  return `${agora.getFullYear()}-${dois(agora.getMonth() + 1)}-${dois(agora.getDate())}`;
}

/** Nº de dias do período, contando início e fim (01 a 30 = 30 dias). */
export function diasDoPeriodo(dataInicio, dataFim) {
  const ini = parseDataISO(dataInicio);
  const fim = parseDataISO(dataFim);
  if (ini === null || fim === null || fim < ini) return null;
  return Math.round((fim - ini) / DIA_MS) + 1;
}

/**
 * Período imediatamente anterior, com o MESMO nº de dias.
 * Antes subtraía só (fim − início) e o período anterior ficava 1 dia menor.
 */
export function periodoAnterior(dataInicio, dataFim) {
  const dias = diasDoPeriodo(dataInicio, dataFim);
  if (!dias) return null;
  const ini = parseDataISO(dataInicio);
  return {
    inicio: formatarDataISO(ini - dias * DIA_MS),
    fim: formatarDataISO(ini - DIA_MS),
  };
}

function dentroDoIntervalo(t, inicio, fim) {
  const d = dataReferencia(t);
  return !!d && d >= inicio && d <= fim;
}

/**
 * Receitas/despesas/lucro (mesmo critério da DRE) do período atual e do
 * anterior. Recebe as transações SEM o filtro de data — senão o "Anterior"
 * fica sempre zerado.
 */
export function calcularComparativoPeriodos(transacoes, dataInicio, dataFim) {
  const anterior = periodoAnterior(dataInicio, dataFim);
  if (!anterior) return [];
  const lista = transacoes || [];

  const totais = (periodo, inicio, fim) => {
    const dre = calcularDRE(lista.filter((t) => dentroDoIntervalo(t, inicio, fim)));
    const despesas = arred(dre.custosDiretos + dre.despesasOperacionais);
    return {
      periodo,
      receitas: dre.receitaLiquida,
      despesas,
      lucro: dre.resultadoAntesIR,
    };
  };

  return [totais("Anterior", anterior.inicio, anterior.fim), totais("Atual", dataInicio, dataFim)];
}

/** Variação % entre períodos; null quando a base (anterior) é zero. */
export function variacaoPercentual(atual, anterior) {
  const base = Number(anterior) || 0;
  if (base === 0) return null;
  return (((Number(atual) || 0) - base) / Math.abs(base)) * 100;
}

// ---------------------------------------------------------------------------
// Índices financeiros
// ---------------------------------------------------------------------------

const dividir = (a, b) => (b > 0 ? a / b : null);

/**
 * Índices sem fatores inventados (antes: receitas × 0,3, AC × 0,8/0,6/0,4).
 * Índice que não dá para calcular (divisor zero) volta `null` → "n/d".
 *
 * @param {object} p
 * @param {Array} p.transacoes          transações do período (fluxo: receitas/resultado)
 * @param {Array} [p.transacoesPosicao] transações para a posição na data-fim (contas a receber/pagar)
 * @param {Array} [p.transacoesCaixa]   todas as transações da empresa (saldo das contas na data-fim)
 * @param {Array} p.contas
 * @param {string} [p.versao]
 * @param {string} [p.dataInicio]
 * @param {string} [p.dataFim]
 */
export function calcularIndices({
  transacoes,
  transacoesPosicao,
  transacoesCaixa,
  contas,
  versao = "real",
  dataInicio,
  dataFim,
}) {
  const dre = calcularDRE(transacoes, versao);
  const posicao = filtrarPorVersao(transacoesPosicao || transacoes, versao);

  const receitas = dre.receitaLiquida;
  const despesas = arred(dre.custosDiretos + dre.despesasOperacionais);
  const lucroLiquido = dre.resultadoAntesIR;

  const disponibilidades = saldoContasNaData(
    contas,
    transacoesCaixa || transacoesPosicao || transacoes,
    dataFim
  );
  const contasReceber = soma(posicao.filter((t) => isReceita(t) && abertoNaData(t, dataFim)));
  const passivoCirculante = soma(posicao.filter((t) => isDespesa(t) && abertoNaData(t, dataFim)));

  const ativoCirculante = arred(disponibilidades + contasReceber);
  const ativoTotal = ativoCirculante;
  const patrimonioLiquido = arred(ativoTotal - passivoCirculante);
  const dias = diasDoPeriodo(dataInicio, dataFim);

  const pct = (a, b) => {
    const r = dividir(a, b);
    return r === null ? null : r * 100;
  };

  return {
    receitas,
    despesas,
    lucroLiquido,
    disponibilidades,
    contasReceber,
    ativoCirculante,
    ativoTotal,
    passivoCirculante,
    patrimonioLiquido,
    liquidezCorrente: dividir(ativoCirculante, passivoCirculante),
    liquidezImediata: dividir(disponibilidades, passivoCirculante),
    margemLiquida: pct(lucroLiquido, receitas),
    roe: pct(lucroLiquido, patrimonioLiquido),
    roa: pct(lucroLiquido, ativoTotal),
    grauEndividamento: pct(passivoCirculante, ativoTotal),
    giroAtivo: dividir(receitas, ativoTotal),
    prazoMedioRecebimento: dias && receitas > 0 ? (contasReceber / receitas) * dias : null,
  };
}

// ---------------------------------------------------------------------------
// Insights IA
// ---------------------------------------------------------------------------

/**
 * Totais enviados à IA + uma `chave` estável: o componente só chama a IA de
 * novo quando a chave muda (antes chamava a cada render — custo por chamada).
 */
export function resumoParaInsights(transacoes, categorias = []) {
  const lista = transacoes || [];
  const pagas = lista.filter((t) => isStatusPago(t.status));
  const receitas = pagas.filter((t) => isReceita(t));
  const despesas = pagas.filter((t) => isDespesa(t));

  const totalReceitas = soma(receitas);
  const totalDespesas = soma(despesas);
  const margemLiquida =
    totalReceitas > 0 ? ((totalReceitas - totalDespesas) / totalReceitas) * 100 : 0;

  const porCategoria = {};
  despesas.forEach((d) => {
    const cat =
      d.categoria_nome ||
      (categorias || []).find((c) => c.id === d.categoria_id)?.nome ||
      "Sem Categoria";
    porCategoria[cat] = (porCategoria[cat] || 0) + valorDe(d);
  });
  const categoriasMaiores = Object.entries(porCategoria)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([cat, valor]) => `${cat}: R$ ${valor.toFixed(2)}`);

  return {
    totalReceitas,
    totalDespesas,
    margemLiquida,
    categoriasMaiores,
    quantidade: lista.length,
    chave: `${lista.length}|${totalReceitas.toFixed(2)}|${totalDespesas.toFixed(2)}`,
  };
}

// ---------------------------------------------------------------------------
// Assistente IA → filtros
// ---------------------------------------------------------------------------

const VALORES_TODOS = new Set(["", "all", "todos", "todas", "nenhum", "null"]);

/**
 * Traduz o que a IA devolveu (id OU nome) para o id da lista. Desconhecido
 * vira "all" — a IA recebe NOMES, mas o filtro compara ids.
 */
export function resolverIdPorNome(valor, lista = []) {
  if (valor === null || valor === undefined) return "all";
  const bruto = String(valor).trim();
  const alvo = normalizarTexto(bruto).trim();
  if (VALORES_TODOS.has(alvo)) return "all";

  const porId = lista.find((i) => i?.id != null && String(i.id) === bruto);
  if (porId) return porId.id;

  const porNome = lista.find((i) => {
    const nome = normalizarTexto(i?.nome).trim();
    const comCodigo = i?.codigo ? normalizarTexto(`${i.codigo} - ${i.nome}`).trim() : null;
    return nome === alvo || comCodigo === alvo;
  });
  return porNome ? porNome.id : "all";
}

/**
 * Filtros sugeridos pela IA → filtros aceitos pelo RelatoriosTab.
 * Só passam chaves conhecidas; datas precisam ser "YYYY-MM-DD" válidas;
 * categoria/centro de custo são traduzidos de nome para id.
 */
export function traduzirFiltrosIA(filtrosIA, { categorias = [], centrosCusto = [] } = {}) {
  const f = filtrosIA && typeof filtrosIA === "object" ? filtrosIA : {};
  const saida = {};

  let inicio = dataISOValida(f.dataInicio) ? f.dataInicio : null;
  let fim = dataISOValida(f.dataFim) ? f.dataFim : null;
  if (inicio && fim && inicio > fim) [inicio, fim] = [fim, inicio];
  if (inicio) saida.dataInicio = inicio;
  if (fim) saida.dataFim = fim;

  const categoria = f.categoriaId ?? f.categoria;
  if (categoria !== undefined) saida.categoriaId = resolverIdPorNome(categoria, categorias);

  const centro = f.centroCustoId ?? f.centroCusto ?? f.centro_custo;
  if (centro !== undefined) saida.centroCustoId = resolverIdPorNome(centro, centrosCusto);

  if (f.versao === "real" || f.versao === "contabil") saida.versao = f.versao;

  return saida;
}

/** Tipo de relatório devolvido pela IA, se for uma aba que existe. */
export function tipoRelatorioValido(tipo) {
  const t = normalizarTexto(tipo).trim();
  return TIPOS_RELATORIO.includes(t) ? t : null;
}
