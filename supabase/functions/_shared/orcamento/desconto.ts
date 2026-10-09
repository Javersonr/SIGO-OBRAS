/**
 * Contas de dinheiro do orçamento importado da planilha da prefeitura — porte linha a linha de
 * apps/web/src/lib/orcamento-desconto.js para o servidor (spec 2026-10-08 §3). A tela continua com
 * a lib dela; a paridade (mesma entrada, mesmo resultado, mesmas mensagens) é conferida no Vitest
 * (apps/web/src/lib/orcamento-paridade.test.js). O `totalLinhaLegado` das telas antigas não vem.
 *
 * Tudo em inteiros: preço em décimos de milésimo (4 casas), quantidade em milésimos (3 casas) e
 * total em centavos. Os produtos usam BigInt porque podem passar de 2^53. O unitário com desconto
 * é CORTADO na 2ª casa; o total da linha é ARREDONDADO (meio para cima) em 2 casas.
 * Puro: roda no Deno e no Node.
 */

export interface ItemOrcamento {
  id?: string;
  numero?: string | null;
  etapa?: boolean | null;
  descricao?: string | null;
  codigo?: string | null;
  fonte?: string | null;
  unidade?: string | null;
  quantidade?: number | string | null;
  valor_unitario_ref?: number | string | null;
  valor_unitario?: number | string | null;
  valor_total?: number | string | null;
  ordem?: number | null;
}

export interface ResumoOrcamento {
  totalReferencia: number;
  totalProposta: number;
  descontoReal: number;
  itensSemReferencia: number;
  qtdItens: number;
  qtdEtapas: number;
}

/** Texto numérico estrito: ponto decimal, sinal opcional; sem expoente, vírgula nem milhar. */
const NUMERO_ESTRITO = /^\s*[-+]?(\d+\.?\d*|\.\d+)\s*$/;

/**
 * number finito, ou string numérica estrita ("12.5", ".5", "5.", " 2 ", "-3"); vazio, null,
 * undefined e qualquer outra coisa → null. Não lê prefixo: "12abc", "1,5" e "1.234,56" são
 * inválidos.
 */
function paraNumero(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = typeof valor === "string" ? (NUMERO_ESTRITO.test(valor) ? Number(valor) : NaN) : valor;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/** Inteiro na escala pedida (100 = centavos), com o meio arredondado para longe do zero. */
function escalar(valor: number, escala: number): number {
  return Math.sign(valor) * Math.round(Math.abs(valor) * escala);
}

/** Centavos inteiros de um valor em reais (null/vazio → 0). */
function centavos(valor: unknown): number {
  const n = paraNumero(valor);
  return n === null ? 0 : escalar(n, 100);
}

/**
 * Unitário com desconto, cortado na 2ª casa. `ref` com até 4 casas e `pct` com até 2 casas
 * (0 a 99,99), os dois NUMBER. Entrada inválida lança RangeError em vez de virar 0% (preço cheio
 * gravado como proposta). Ex.: precoComDesconto(10.48, 12.35) → 9.18.
 */
export function precoComDesconto(ref: number, pct: number): number {
  if (typeof pct !== "number" || !Number.isFinite(pct) || pct < 0 || pct > 99.99) {
    throw new RangeError("Desconto fora de 0 a 99,99%");
  }
  if (typeof ref !== "number" || !Number.isFinite(ref) || ref < 0) {
    throw new RangeError("Preço de referência inválido");
  }
  const refDezmil = BigInt(escalar(ref, 10000));
  const fator = BigInt(10000 - escalar(pct, 100));
  // refDezmil × fator está em unidades de 1e-8; ÷ 1e6 → centavos. A divisão de BigInt descarta a
  // fração: é o corte (ref ≥ 0).
  const cents = (refDezmil * fator) / 1000000n;
  return Number(cents) / 100;
}

/** Total da linha em CENTAVOS inteiros (a conta de `totalLinha`); null se faltar um dos dois. */
function totalLinhaCentavos(quantidade: unknown, unitario: unknown): number | null {
  const q = paraNumero(quantidade);
  const u = paraNumero(unitario);
  if (q === null || u === null) return null;
  const p = BigInt(escalar(q, 1000)) * BigInt(escalar(u, 10000)); // unidades de 1e-7
  const negativo = p < 0n;
  const abs = negativo ? -p : p;
  const cents = (abs + 50000n) / 100000n;
  return Number(negativo ? -cents : cents);
}

/**
 * Total da linha = arredondar(quantidade × unitário, 2), meio para cima. `quantidade` até 3 casas,
 * `unitario` até 4 (number ou string numérica estrita). null se faltar um dos dois ou se um deles
 * for texto inválido. Ex.: totalLinha(125.5, 9.18) → 1152.09.
 */
export function totalLinha(quantidade: unknown, unitario: unknown): number | null {
  const cents = totalLinhaCentavos(quantidade, unitario);
  return cents === null ? null : cents / 100;
}

/**
 * Valida o "Desconto (%)": aceita "12,35", "12.35", 12.35, espaços e um "%" no fim. Faixa de 0 a
 * 99,99, no máximo 2 casas (zeros à direita não contam: "12,350" vale).
 */
export function validarDesconto(
  entrada: unknown
): { ok: true; valor: number } | { ok: false; erro: string } {
  const texto = String(entrada ?? "")
    .replace(/\s+/g, "")
    .replace(/%$/, "");
  if (texto === "") return { ok: false, erro: "Informe o desconto em %" };
  if (!/^-?\d+([.,]\d+)?$/.test(texto)) return { ok: false, erro: "Desconto inválido" };
  const [inteira, decimais = ""] = texto.replace(",", ".").split(".");
  const valor = Number(`${inteira}.${decimais || "0"}`);
  if (valor < 0 || valor > 99.99) return { ok: false, erro: "O desconto vai de 0 a 99,99%" };
  if (decimais.replace(/0+$/, "").length > 2) {
    return { ok: false, erro: "Use no máximo 2 casas decimais" };
  }
  return { ok: true, valor: Math.round(valor * 100) / 100 || 0 }; // `|| 0`: "-0" não vira −0
}

/**
 * Recalcula os itens importados (os que têm preço de referência) com o desconto. Etapas e itens
 * sem referência (incluídos à mão) ficam de fora. Devolve só o que muda. `pct` inválido lança
 * RangeError (de `precoComDesconto`).
 */
export function aplicarDesconto(
  itens: ItemOrcamento[],
  pct: number
): { id: string | undefined; valor_unitario: number; valor_total: number }[] {
  const saida: { id: string | undefined; valor_unitario: number; valor_total: number }[] = [];
  for (const item of itens || []) {
    if (!item || item.etapa) continue;
    const ref = paraNumero(item.valor_unitario_ref);
    if (ref === null) continue;
    const valor_unitario = precoComDesconto(ref, pct);
    const valor_total = totalLinha(item.quantidade, valor_unitario) ?? 0;
    saida.push({ id: item.id, valor_unitario, valor_total });
  }
  return saida;
}

/**
 * Subtotal de cada etapa: soma (em centavos) dos `valor_total` dos itens (não etapas) cujo
 * `numero` começa com `<numero da etapa>.`. Etapas aninhadas somam os mesmos itens. Chave =
 * `numero` da etapa. Não confunde "1.2" com "1.20".
 */
export function subtotaisEtapas(itens: ItemOrcamento[]): Record<string, number> {
  const somas = new Map<string, number>();
  for (const item of itens || []) {
    if (item?.etapa && item.numero) somas.set(String(item.numero), 0);
  }
  for (const item of itens || []) {
    if (!item || item.etapa || !item.numero) continue;
    const partes = String(item.numero).split(".");
    for (let k = 1; k < partes.length; k++) {
      const prefixo = partes.slice(0, k).join(".");
      const atual = somas.get(prefixo);
      if (atual !== undefined) somas.set(prefixo, atual + centavos(item.valor_total));
    }
  }
  const resultado: Record<string, number> = {};
  for (const [numero, cents] of somas) resultado[numero] = cents / 100;
  return resultado;
}

/**
 * Resumo da aba Orçamento: totalReferencia (Σ quantidade × referência), totalProposta
 * (Σ valor_total dos itens), descontoReal (% com 2 casas sobre os itens com referência),
 * itensSemReferencia, qtdItens e qtdEtapas.
 */
export function resumoOrcamento(itens: ItemOrcamento[]): ResumoOrcamento {
  let refCents = 0;
  let propostaCents = 0;
  let propostaComRefCents = 0;
  let itensSemReferencia = 0;
  let qtdItens = 0;
  let qtdEtapas = 0;
  for (const item of itens || []) {
    if (!item) continue;
    if (item.etapa) {
      qtdEtapas++;
      continue;
    }
    qtdItens++;
    const total = centavos(item.valor_total);
    propostaCents += total;
    if (paraNumero(item.valor_unitario_ref) === null) {
      itensSemReferencia++;
      continue;
    }
    refCents += totalLinhaCentavos(item.quantidade, item.valor_unitario_ref) ?? 0;
    propostaComRefCents += total;
  }
  const descontoReal =
    refCents === 0 ? 0 : Math.round(((refCents - propostaComRefCents) * 10000) / refCents) / 100;
  return {
    totalReferencia: refCents / 100,
    totalProposta: propostaCents / 100,
    descontoReal,
    itensSemReferencia,
    qtdItens,
    qtdEtapas,
  };
}
