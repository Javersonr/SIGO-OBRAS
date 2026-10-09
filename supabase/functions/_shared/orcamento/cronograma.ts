/**
 * Cronograma físico-financeiro no servidor (spec 2026-10-08 §2 e §3):
 * - porte linha a linha das contas de apps/web/src/lib/cronograma-ff.js (normalizar, ler %, somar,
 *   R$ por mês, etapas do orçamento e resumo); `ajustarMeses` e `reperiodizar` não vêm, porque o
 *   conector grava o cronograma como veio;
 * - `validarCronogramaConector`: as regras e as mensagens de `lerAbaCronograma`
 *   (apps/web/src/lib/cronograma-modelo.js) sobre o JSON do conector, sem o xlsx.
 * A paridade é conferida no Vitest (apps/web/src/lib/cronograma-paridade.test.js).
 *
 * Aritmética inteira: o % vira centésimos (10000 = 100%) e o R$, centavos. Puro (Deno e Node).
 */
import { subtotaisEtapas, type ItemOrcamento } from "./desconto.ts";
import { compararNumeroItem, ordenarItensOportunidade } from "./registros.ts";

export const MAX_MESES = 60;

export interface Cronograma {
  meses: number;
  pct: Record<string, number[]>;
  origem?: "importado" | "manual";
  arquivo_nome?: string;
  atualizado_em?: string;
}

export interface EtapaCron {
  numero: string;
  descricao: string;
  centavos: number;
}

export interface ResumoCronograma {
  linhas: {
    numero: string;
    descricao: string;
    centavos: number;
    peso: number;
    pct: number[];
    valores: number[];
    fecha: boolean;
    diferenca: number;
  }[];
  meses: { centavos: number; pct: number; acumCentavos: number; acumPct: number }[];
  totalCentavos: number;
  todasFecham: boolean;
  orfas: string[];
}

export interface LinhaCronogramaConector {
  item: string | number | null;
  pct: (number | string | null)[];
}

export interface ResultadoCronograma {
  cronograma: { meses: number; pct: Record<string, number[]>; origem: "importado" } | null;
  erros: string[];
  avisos: string[];
  resumo: { meses: number; linhas: number; ignoradas: number; faltando: number };
  /** itens que não são etapa de nível 1 do orçamento (a tela avisa e ignora; o conector bloqueia) */
  naoEtapas: string[];
}

const ORIGENS = ["importado", "manual"];
const ABA_CRONOGRAMA = "Cronograma";

/** Centésimos inteiros de um % com até 2 casas (33.33 → 3333; não numérico → 0). */
function centesimos(p: unknown): number {
  const n = Number(p);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** Arredonda em 2 casas, meio para cima, sem o erro de 1.005 × 100 = 100.49999… */
function duasCasas(v: number): number {
  const s = String(v);
  const r = /e/i.test(s) ? Math.round(v * 100) / 100 : Number(`${Math.round(Number(`${s}e2`))}e-2`);
  return r === 0 ? 0 : r; // sem −0
}

/** parte ÷ total em %, com 2 casas (0 com total zero). */
function percentual(parte: number, total: number): number {
  if (!total) return 0;
  return duasCasas((parte * 100) / total);
}

/** Corta ou completa com 0 até `n` posições. */
function noTamanho(linha: unknown[], n: number): unknown[] {
  return Array.from({ length: n }, (_, j) => linha[j] ?? 0);
}

/** centavos × centésimos ÷ 10000, arredondado (meio para longe do zero); BigInt acima de 2^53. */
function parteDaEtapa(cents: number, cent: number): number {
  const p = cents * cent;
  if (Number.isSafeInteger(p)) return Math.sign(p) * Math.round(Math.abs(p) / 10000);
  const big = BigInt(cents) * BigInt(cent);
  const negativo = big < 0n;
  const q = ((negativo ? -big : big) + 5000n) / 10000n;
  return Number(negativo ? -q : q);
}

/**
 * Etapas de nível 1 do orçamento (`etapa === true` e `numero` sem ponto), na ordem da tela, com o
 * subtotal com desconto em centavos. Número repetido entra uma vez só (a primeira).
 */
export function etapasDoOrcamento(itens: ItemOrcamento[]): EtapaCron[] {
  const lista = (itens || []).filter(Boolean);
  const subtotais = subtotaisEtapas(lista);
  const vistos = new Set<string>();
  const etapas: EtapaCron[] = [];
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
 * Cronograma limpo a partir do que veio do banco (`oportunidade.cronograma_ff`): `meses` de 0 a
 * MAX_MESES; cada linha cortada ou completada com 0; % fora de 0 a 100 vira 0; 2 casas; `origem`,
 * `arquivo_nome` e `atualizado_em` só quando válidos.
 */
export function normalizarCronograma(obj: unknown): Cronograma {
  const vazio: Cronograma = { meses: 0, pct: {} };
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return vazio;
  const o = obj as Record<string, unknown>;
  const m = Number(o.meses);
  const meses = Number.isFinite(m) ? Math.min(MAX_MESES, Math.max(0, Math.trunc(m))) : 0;
  const pct: Record<string, number[]> = {};
  const origemPct =
    o.pct && typeof o.pct === "object" && !Array.isArray(o.pct)
      ? (o.pct as Record<string, unknown>)
      : {};
  if (meses > 0) {
    for (const [numero, linha] of Object.entries(origemPct)) {
      if (!Array.isArray(linha)) continue;
      pct[numero] = noTamanho(linha, meses).map((v) =>
        typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100 ? duasCasas(v) : 0
      );
    }
  }
  const saida: Cronograma = { meses, pct };
  if (typeof o.origem === "string" && ORIGENS.includes(o.origem)) {
    saida.origem = o.origem as "importado" | "manual";
  }
  if (typeof o.arquivo_nome === "string") saida.arquivo_nome = o.arquivo_nome;
  if (typeof o.atualizado_em === "string") saida.atualizado_em = o.atualizado_em;
  return saida;
}

/**
 * % digitado: number, "12,5", "12.5", "12,5%", com espaços nas pontas e antes do %. Vazio → null.
 * Texto que não seja número, sinal, milhar ou valor fora de 0 a 100 → NaN. Resultado com 2 casas;
 * o arredondamento vem antes da faixa (100,004 → 100; 100,005 → NaN).
 */
export function lerPercentual(entrada: unknown): number | null {
  if (entrada === null || entrada === undefined) return null;
  let n: number;
  if (typeof entrada === "number") {
    n = entrada;
  } else if (typeof entrada === "string") {
    const texto = entrada.trim().replace(/\s*%$/, "");
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
export function somaCentesimos(linha: unknown[]): number {
  return (linha || []).reduce((soma: number, p) => soma + centesimos(p), 0);
}

/** A linha soma exatamente 100,00%? */
export function linhaFecha(linha: unknown[]): boolean {
  return somaCentesimos(linha) === 10000;
}

/** Centavos da etapa pelo maior resto (linha que fecha 100,00%): soma exata, sem célula negativa. */
function maiorRestoDaEtapa(cents: number, cs: number[]): number[] {
  const total = BigInt(Math.abs(cents));
  const base = cs.map((c) => (total * BigInt(c)) / 10000n);
  const restos = cs.map((c, j) => ({ j, resto: (total * BigInt(c)) % 10000n }));
  let falta = total - base.reduce((s, v) => s + v, 0n);
  restos.sort((x, y) => (x.resto === y.resto ? x.j - y.j : x.resto < y.resto ? 1 : -1));
  for (let k = 0; falta > 0n; k++, falta--) base[restos[k].j] += 1n;
  return base.map((v) => Number(cents < 0 ? -v : v));
}

/**
 * R$ de cada mês da etapa, em centavos: arredondar(subtotal × % ÷ 100). Se a linha fecha 100,00%,
 * o último mês com % > 0 recebe a diferença (ou, se ela trocaria o sinal, a linha vai pelo maior
 * resto). Ex.: valoresDaLinha([20, 35, 30, 15], 141747296) → [28349459, 49611554, 42524189, 21262094].
 */
export function valoresDaLinha(linha: unknown[], centavosEtapa: unknown): number[] {
  const cents = Math.round(Number(centavosEtapa) || 0);
  const cs = (linha || []).map(centesimos);
  const valores = cs.map((c) => parteDaEtapa(cents, c));
  if (cs.reduce((s, c) => s + c, 0) === 10000) {
    let ultimo = -1;
    cs.forEach((c, j) => {
      if (c > 0) ultimo = j;
    });
    const outros = valores.reduce((s, v, j) => (j === ultimo ? s : s + v), 0);
    const diferenca = cents - outros;
    if (diferenca * Math.sign(cents) < 0) return maiorRestoDaEtapa(cents, cs);
    valores[ultimo] = diferenca;
  }
  return valores;
}

/**
 * Tudo o que a grade e a exportação mostram: linhas por etapa (peso, pct, valores em centavos,
 * fecha, diferença), meses (R$, %, acumulados), total, todasFecham e órfãs (linhas sem etapa).
 */
export function resumoCronograma(etapas: EtapaCron[], cron: unknown): ResumoCronograma {
  const c = normalizarCronograma(cron);
  const lista = etapas || [];
  const totalCentavos = lista.reduce((s, e) => s + (Number(e.centavos) || 0), 0);
  const linhas = lista.map((e) => {
    const pct = c.pct[e.numero] ? [...c.pct[e.numero]] : new Array<number>(c.meses).fill(0);
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
  const meses: ResumoCronograma["meses"] = [];
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

// ------------------------------------------------- validação do JSON do conector (lerAbaCronograma)

function vazio(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

function formatar(v: number, minimo: number, maximo: number): string {
  return v.toLocaleString("pt-BR", {
    minimumFractionDigits: minimo,
    maximumFractionDigits: maximo,
  });
}

const pct2 = (v: number) => formatar(v, 2, 2);

/** % de um mês: { valor } (0 a 100, 2 casas), com `maisCasas` quando foi arredondado, ou { erro }. Vazio = 0. */
function lerValorPct(v: unknown): { valor: number; maisCasas: boolean } | { erro: string } {
  if (vazio(v)) return { valor: 0, maisCasas: false };
  if (typeof v === "number" && Number.isFinite(v)) {
    const valor = lerPercentual(v) as number;
    if (Number.isNaN(valor)) {
      return { erro: `% ${v < 0 ? "negativo" : "acima de 100"} (${formatar(v, 0, 4)})` };
    }
    return { valor, maisCasas: Math.abs(v * 100 - Math.round(v * 100)) > 1e-6 };
  }
  if (typeof v === "string") {
    const texto = v.trim();
    const valor = lerPercentual(texto);
    if (Number.isNaN(valor)) return { erro: `"${texto}" não é um % de 0 a 100` };
    const decimais = (/[.,](\d+)/.exec(texto)?.[1] ?? "").replace(/0+$/, "");
    return { valor: valor ?? 0, maisCasas: decimais.length > 2 };
  }
  return { erro: `"${String(v)}" não é um número` };
}

/**
 * Valida o cronograma que o conector recebe: `meses` (inteiro de 1 a MAX_MESES) e uma linha por
 * etapa de nível 1 (`{ item, pct }`), com as regras e as mensagens de `lerAbaCronograma`
 * ("Linha n" = índice + 2, como no Excel; vazio = 0). Diferenças, por não haver cabeçalho:
 * - `meses` fora de 1 a 60 → erro "O número de meses vai de 1 a 60";
 * - `pct` mais longo que `meses` → erro "Linha n: tem X meses, mais que os N informados.";
 *   mais curto → completa com 0;
 * - o despacho do conector só confere campos a mais, não tipos: linha que não é objeto, `item` que
 *   é objeto ou lista e `pct` que não é lista (ausente ou null = vazio, como a célula em branco)
 *   são erro, e não linha em branco (só null/undefined é linha em branco).
 * `naoEtapas` lista os itens que não são etapa (a tela só avisa; o conector bloqueia).
 */
export function validarCronogramaConector(
  meses: unknown,
  linhas: LinhaCronogramaConector[],
  numerosEtapas: string[]
): ResultadoCronograma {
  const erros: string[] = [];
  const avisos: string[] = [];
  const resumo = { meses: 0, linhas: 0, ignoradas: 0, faltando: 0 };
  const pct: Record<string, number[]> = {};
  const naoEtapas: string[] = [];
  const resultado = (): ResultadoCronograma => ({
    cronograma: erros.length === 0 ? { meses: resumo.meses, pct, origem: "importado" } : null,
    erros,
    avisos,
    resumo,
    naoEtapas,
  });

  if (typeof meses !== "number" || !Number.isInteger(meses) || meses < 1 || meses > MAX_MESES) {
    erros.push(`O número de meses vai de 1 a ${MAX_MESES}`);
    return resultado();
  }
  resumo.meses = meses;

  const lista = Array.isArray(linhas) ? linhas : [];
  const etapas = new Set((numerosEtapas || []).map(String));
  const linhaDoNumero = new Map<string, number>();
  let comDados = 0;
  lista.forEach((l, i) => {
    const n = i + 2;
    if (l === null || l === undefined) return; // linha em branco
    if (typeof l !== "object" || Array.isArray(l)) {
      erros.push(`Linha ${n}: a linha deve ser um objeto { item, pct }.`);
      return;
    }
    const item: unknown = l.item;
    if (typeof item === "object" && item !== null) {
      erros.push(`Linha ${n}: Item deve ser texto ou número.`);
      return;
    }
    const pctBruto: unknown = l.pct;
    const pctInvalido = pctBruto !== null && pctBruto !== undefined && !Array.isArray(pctBruto);
    const valores: unknown[] = Array.isArray(pctBruto) ? pctBruto : [];
    // linha em branco: Item e os meses vazios (como a linha da planilha sem nenhuma célula)
    if (vazio(item) && !pctInvalido && valores.slice(0, meses).every(vazio)) return;
    comDados++;
    const numero = vazio(item) ? "" : String(item).trim();
    if (!numero) {
      avisos.push(`Linha ${n}: linha sem Item; foi ignorada.`);
      resumo.ignoradas++;
      return;
    }
    if (linhaDoNumero.has(numero)) {
      erros.push(
        `Linha ${n}: Item ${numero} repetido (já está na linha ${linhaDoNumero.get(numero)}).`
      );
      return;
    }
    linhaDoNumero.set(numero, n);
    if (!etapas.has(numero)) {
      avisos.push(`Linha ${n}: Item ${numero} não é etapa do orçamento; foi ignorado.`);
      resumo.ignoradas++;
      naoEtapas.push(numero);
      return;
    }
    if (pctInvalido) {
      erros.push(`Linha ${n}: pct deve ser uma lista de percentuais, um por mês.`);
      return;
    }
    if (valores.length > meses) {
      erros.push(`Linha ${n}: tem ${valores.length} meses, mais que os ${meses} informados.`);
      return;
    }
    const lidos: number[] = [];
    let comErro = false;
    for (let j = 1; j <= meses; j++) {
      const r = lerValorPct(valores[j - 1]);
      if ("erro" in r) {
        erros.push(`Linha ${n}, Mês ${j}: ${r.erro}.`);
        comErro = true;
        continue;
      }
      if (r.maisCasas) {
        avisos.push(
          `Linha ${n}, Mês ${j}: % com mais de 2 casas; arredondado para ${pct2(r.valor)}.`
        );
      }
      lidos.push(r.valor);
    }
    if (comErro) return;
    pct[numero] = lidos;
    resumo.linhas++;
    const soma = somaCentesimos(lidos);
    if (soma !== 10000) {
      avisos.push(
        `Linha ${n}: a etapa ${numero} soma ${pct2(soma / 100)}%, e não 100,00%; ` +
          `fica vermelha até ser corrigida.`
      );
    }
  });

  if (erros.length === 0 && resumo.linhas === 0) {
    erros.push(
      comDados === 0
        ? `A aba "${ABA_CRONOGRAMA}" não tem linhas preenchidas.`
        : `Nenhuma linha da aba "${ABA_CRONOGRAMA}" tem o Item de uma etapa do orçamento.`
    );
    return resultado();
  }
  for (const numero of etapas) {
    if (linhaDoNumero.has(numero)) continue;
    avisos.push(`Etapa ${numero} do orçamento sem linha no cronograma; fica vazia.`);
    resumo.faltando++;
  }
  return resultado();
}
