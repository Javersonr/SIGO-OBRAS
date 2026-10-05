/**
 * Cronograma físico-financeiro da oportunidade (spec
 * docs/superpowers/specs/2026-10-05-cronograma-fisico-financeiro-design.md §3 e §5).
 *
 * Funções puras, testadas em cronograma-ff.test.js. A aritmética é inteira: o % vira
 * centésimos (10000 = 100%) e o R$, centavos. O R$ nunca é gravado: sai do subtotal com
 * desconto de cada etapa de nível 1 (`subtotaisEtapas`) a cada cálculo.
 *
 * Cronograma = { meses, pct: { [numero da etapa]: number[] }, origem?, arquivo_nome?,
 *                atualizado_em? }
 * EtapaCron  = { numero, descricao, centavos }
 */
import { subtotaisEtapas } from "./orcamento-desconto";
import { compararNumeroItem, ordenarItensOportunidade } from "./orcamento-registros";

export const MAX_MESES = 60;

const ORIGENS = ["importado", "manual"];

/** Centésimos inteiros de um % com até 2 casas (33.33 → 3333; não numérico → 0). */
function centesimos(p) {
  const n = Number(p);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** Arredonda em 2 casas, meio para cima, sem o erro de 1.005 × 100 = 100.49999… */
function duasCasas(v) {
  const s = String(v);
  const r = /e/i.test(s) ? Math.round(v * 100) / 100 : Number(`${Math.round(Number(`${s}e2`))}e-2`);
  return r === 0 ? 0 : r; // sem −0
}

/** parte ÷ total em %, com 2 casas (0 com total zero). */
function percentual(parte, total) {
  if (!total) return 0;
  return duasCasas((parte * 100) / total);
}

/** Inteiro de 1 a MAX_MESES; o resto lança RangeError. */
function conferirMeses(novoN) {
  if (!Number.isInteger(novoN) || novoN < 1 || novoN > MAX_MESES) {
    throw new RangeError(`O número de meses vai de 1 a ${MAX_MESES}`);
  }
  return novoN;
}

/** Corta ou completa com 0 até `n` posições. */
function noTamanho(linha, n) {
  return Array.from({ length: n }, (_, j) => linha[j] ?? 0);
}

/**
 * centavos × centésimos ÷ 10000, arredondado (meio para longe do zero). O produto passa de
 * 2^53 com etapas acima de R$ 9 bilhões: aí a conta vai em BigInt.
 */
function parteDaEtapa(cents, cent) {
  const p = cents * cent;
  if (Number.isSafeInteger(p)) return Math.sign(p) * Math.round(Math.abs(p) / 10000);
  const big = BigInt(cents) * BigInt(cent);
  const negativo = big < 0n;
  const q = ((negativo ? -big : big) + 5000n) / 10000n;
  return Number(negativo ? -q : q);
}

/**
 * Etapas de nível 1 do orçamento (`etapa === true` e `numero` sem ponto), na ordem da tela
 * (`ordenarItensOportunidade`: `ordem`, depois `numero`), com o subtotal com desconto em
 * centavos. Número repetido entra uma vez só (a primeira).
 */
export function etapasDoOrcamento(itens) {
  const lista = (itens || []).filter(Boolean);
  const subtotais = subtotaisEtapas(lista);
  const vistos = new Set();
  const etapas = [];
  for (const item of ordenarItensOportunidade(lista)) {
    if (item.etapa !== true || item.numero === null || item.numero === undefined) continue;
    const numero = String(item.numero).trim();
    if (!numero || numero.includes(".") || vistos.has(numero)) continue;
    vistos.add(numero);
    const subtotal = subtotais[String(item.numero)];
    etapas.push({
      numero,
      descricao: item.descricao ?? "",
      centavos: typeof subtotal === "number" ? Math.round(subtotal * 100) : 0,
    });
  }
  return etapas;
}

/**
 * Cronograma limpo a partir do que veio do banco (`oportunidade.cronograma_ff`).
 * - `{}`, null, array ou qualquer coisa que não seja objeto → { meses: 0, pct: {} };
 * - `meses` inteiro de 0 a MAX_MESES (fração cortada, fora da faixa vai ao limite);
 * - com `meses` 0 não sobra linha; com `meses` > 0 cada array é cortado ou completado com 0;
 * - % fora de 0 a 100 ou que não seja number vira 0; o resto fica com 2 casas;
 * - chave cujo valor não é array sai;
 * - `origem`, `arquivo_nome` e `atualizado_em` só ficam quando válidos.
 */
export function normalizarCronograma(obj) {
  const vazio = { meses: 0, pct: {} };
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return vazio;
  const m = Number(obj.meses);
  const meses = Number.isFinite(m) ? Math.min(MAX_MESES, Math.max(0, Math.trunc(m))) : 0;
  const pct = {};
  const origemPct =
    obj.pct && typeof obj.pct === "object" && !Array.isArray(obj.pct) ? obj.pct : {};
  if (meses > 0) {
    for (const [numero, linha] of Object.entries(origemPct)) {
      if (!Array.isArray(linha)) continue;
      pct[numero] = noTamanho(linha, meses).map((v) =>
        typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100 ? duasCasas(v) : 0
      );
    }
  }
  const saida = { meses, pct };
  if (ORIGENS.includes(obj.origem)) saida.origem = obj.origem;
  if (typeof obj.arquivo_nome === "string") saida.arquivo_nome = obj.arquivo_nome;
  if (typeof obj.atualizado_em === "string") saida.atualizado_em = obj.atualizado_em;
  return saida;
}

/**
 * % digitado na grade: number, "12,5", "12.5", "12,5%", com espaços.
 * Vazio (null, undefined, "", só espaços, "%") → null. Texto que não seja número, sinal,
 * milhar ou valor fora de 0 a 100 → NaN. O resultado vem com 2 casas (33,335 → 33,34), e o
 * arredondamento vem antes da faixa: 100,004 → 100, mas 100,005 → 100,01 → NaN.
 */
export function lerPercentual(entrada) {
  if (entrada === null || entrada === undefined) return null;
  let n;
  if (typeof entrada === "number") {
    n = entrada;
  } else if (typeof entrada === "string") {
    const texto = entrada.replace(/\s+/g, "").replace(/%$/, "");
    if (texto === "") return null;
    if (!/^(\d+([.,]\d*)?|[.,]\d+)$/.test(texto)) return NaN;
    n = Number(texto.replace(",", "."));
  } else {
    return NaN;
  }
  if (!Number.isFinite(n)) return NaN;
  const v = duasCasas(n);
  return v < 0 || v > 100 ? NaN : v;
}

/** Soma da linha em centésimos (10000 = 100,00%). */
export function somaCentesimos(linha) {
  return (linha || []).reduce((soma, p) => soma + centesimos(p), 0);
}

/** A linha soma exatamente 100,00%? */
export function linhaFecha(linha) {
  return somaCentesimos(linha) === 10000;
}

/**
 * R$ de cada mês da etapa, em centavos: arredondar(subtotal × % ÷ 100).
 * Se a linha fecha 100,00%, o último mês com % > 0 recebe a diferença, e a linha soma
 * exatamente o subtotal. Se não fecha, cada célula é só o arredondamento dela.
 */
export function valoresDaLinha(linha, centavosEtapa) {
  const cents = Math.round(Number(centavosEtapa) || 0);
  const cs = (linha || []).map(centesimos);
  const valores = cs.map((c) => parteDaEtapa(cents, c));
  if (cs.reduce((s, c) => s + c, 0) === 10000) {
    let ultimo = -1;
    cs.forEach((c, j) => {
      if (c > 0) ultimo = j;
    });
    const outros = valores.reduce((s, v, j) => (j === ultimo ? s : s + v), 0);
    valores[ultimo] = cents - outros;
  }
  return valores;
}

/**
 * Tudo o que a grade e a exportação mostram.
 * - linhas: uma por etapa, na ordem das etapas (etapa sem linha no cronograma = zeros), com
 *   peso (% da etapa no total), pct, valores (centavos), fecha e diferenca (100 − soma);
 * - meses: R$ do mês, % do mês sobre o total, acumulado em R$ e acumulado em %;
 * - totalCentavos: soma dos subtotais das etapas;
 * - todasFecham: há etapa e todas somam 100,00% (é o que libera o Exportar);
 * - orfas: números com linha no cronograma e sem etapa no orçamento (ordem natural).
 */
export function resumoCronograma(etapas, cron) {
  const c = normalizarCronograma(cron);
  const lista = etapas || [];
  const totalCentavos = lista.reduce((s, e) => s + (Number(e.centavos) || 0), 0);
  const linhas = lista.map((e) => {
    const pct = c.pct[e.numero] ? [...c.pct[e.numero]] : new Array(c.meses).fill(0);
    const soma = somaCentesimos(pct);
    return {
      numero: e.numero,
      descricao: e.descricao,
      centavos: e.centavos,
      peso: percentual(e.centavos, totalCentavos),
      pct,
      valores: valoresDaLinha(pct, e.centavos),
      fecha: soma === 10000,
      diferenca: (10000 - soma) / 100,
    };
  });
  const meses = [];
  let acumCentavos = 0;
  for (let j = 0; j < c.meses; j++) {
    const centavos = linhas.reduce((s, l) => s + l.valores[j], 0);
    acumCentavos += centavos;
    meses.push({
      centavos,
      pct: percentual(centavos, totalCentavos),
      acumCentavos,
      acumPct: percentual(acumCentavos, totalCentavos),
    });
  }
  const numeros = new Set(lista.map((e) => e.numero));
  const orfas = Object.keys(c.pct)
    .filter((n) => !numeros.has(n))
    .sort(compararNumeroItem);
  return {
    linhas,
    meses,
    totalCentavos,
    todasFecham: linhas.length > 0 && linhas.every((l) => l.fecha),
    orfas,
  };
}

/**
 * Muda o número de meses sem reperiodizar: a mais, colunas com 0; a menos, corta as do fim.
 * `cortouValores` = alguma coluna cortada tinha % > 0 (a tela pede confirmação).
 * Os outros campos (origem, arquivo_nome, atualizado_em) ficam como estão.
 * `novoN` fora de 1 a MAX_MESES (ou não inteiro) lança RangeError.
 */
export function ajustarMeses(cron, novoN) {
  const n = conferirMeses(novoN);
  const c = normalizarCronograma(cron);
  let cortouValores = false;
  const pct = {};
  for (const [numero, linha] of Object.entries(c.pct)) {
    if (linha.slice(n).some((v) => v > 0)) cortouValores = true;
    pct[numero] = noTamanho(linha, n);
  }
  return { cronograma: { ...c, meses: n, pct }, cortouValores };
}

/**
 * Reperiodiza uma linha de N para `novoN` meses mantendo a forma da curva:
 * 1. curva acumulada C nos limites dos meses (C(0) = 0 … C(N) = soma), linear entre eles;
 * 2. novos limites em t = j·N/M; o mês j recebe C(j·N/M) − C((j−1)·N/M);
 * 3. arredonda em centésimos pelo maior resto (empate: o mês mais cedo), e a soma da linha
 *    fica igual à de antes (100,00 se fechava).
 * Conta exata em inteiros: M·C(j·N/M) = M·C(q) + a[q]·r, com q = ⌊j·N/M⌋ e r = j·N mod M.
 * Linha vazia → zeros. `novoN` fora de 1 a MAX_MESES lança RangeError.
 */
export function reperiodizarLinha(linha, novoN) {
  const M = conferirMeses(novoN);
  const a = (linha || []).map(centesimos);
  const N = a.length;
  if (N === 0) return new Array(M).fill(0);
  const acum = [0];
  for (const v of a) acum.push(acum[acum.length - 1] + v);
  // D(j) = M × C(j·N/M), inteiro
  const D = (j) => {
    const q = Math.floor((j * N) / M);
    const r = (j * N) % M;
    return M * acum[q] + (r === 0 ? 0 : a[q] * r);
  };
  const base = [];
  const restos = [];
  for (let j = 1; j <= M; j++) {
    const exato = D(j) - D(j - 1); // M × (novo % em centésimos)
    base.push(Math.floor(exato / M));
    restos.push({ j: j - 1, resto: exato - Math.floor(exato / M) * M });
  }
  let falta = acum[N] - base.reduce((s, v) => s + v, 0);
  restos.sort((x, y) => y.resto - x.resto || x.j - y.j);
  for (let k = 0; falta > 0 && k < restos.length; k++, falta--) base[restos[k].j] += 1;
  return base.map((c) => c / 100);
}

/** Reperiodiza todas as linhas para `novoN` meses; o resultado é `origem: "manual"`. */
export function reperiodizar(cron, novoN) {
  const M = conferirMeses(novoN);
  const c = normalizarCronograma(cron);
  const pct = {};
  for (const [numero, linha] of Object.entries(c.pct)) pct[numero] = reperiodizarLinha(linha, M);
  return { ...c, meses: M, pct, origem: "manual" };
}
