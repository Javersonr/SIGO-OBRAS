/**
 * Validação das linhas do orçamento que o conector do Claude recebe em JSON, com as MESMAS regras e
 * as MESMAS mensagens de `lerPlanilhaModelo` (apps/web/src/lib/orcamento-modelo.js), sem o xlsx
 * (spec 2026-10-08 §2). A paridade é conferida no Vitest (apps/web/src/lib/modelo-paridade.test.js),
 * montando com `aoa_to_sheet` o workbook equivalente e comparando os dois resultados.
 *
 * Como cada campo do JSON corresponde a uma célula do modelo:
 * - "Linha n" = índice + 2 (linha 1 = cabeçalho, como no Excel);
 * - campo null, ausente ou só com espaços = célula vazia; linha com os 8 campos vazios é pulada;
 * - texto: aparado; número inteiro vira "93358"; item número não inteiro dá o mesmo aviso
 *   "Item lido como número" da tela;
 * - informações: número vira texto pt-BR (até 10 casas, sem milhar), como a célula numérica;
 *   `total_prefeitura` por `lerNumeroBR` (inválido vira aviso e é ignorado).
 * O que só existe na planilha (fórmula sem valor salvo, número que o Excel virou data, cabeçalho)
 * não tem equivalente no JSON. O inverso também vale: o que só o JSON permite (linha que não é
 * objeto, campo que é objeto ou lista) a tela não tem como produzir. O despacho do conector só
 * confere campos a mais, não tipos; por isso aqui isso é erro (nas informações, aviso), e nunca
 * uma linha pulada ou o texto "[object Object]" gravado.
 *
 * `itensSemEtapa` é o que o conector bloqueia e a tela só avisa (contrato do Plano 2, decisão 23).
 * Puro: roda no Deno e no Node.
 */
import { totalLinha } from "./desconto.ts";
import { lerNumeroBR } from "./numeros.ts";
import type { InfoOrcamento, ItemModelo } from "./registros.ts";

export const LIMITE_LINHAS = 3000;
export const CAMPOS_LINHA_CONECTOR = [
  "item",
  "codigo",
  "fonte",
  "descricao",
  "unidade",
  "quantidade",
  "preco_unitario",
  "total",
] as const;
export const CAMPOS_INFORMACOES_CONECTOR = [
  "orgao",
  "objeto",
  "edital",
  "data_base",
  "bdi",
  "fonte_precos",
  "total_prefeitura",
  "observacoes",
] as const;

export interface LinhaConector {
  item: string | number | null;
  codigo?: string | number | null;
  fonte?: string | null;
  descricao: string | null;
  unidade?: string | null;
  quantidade?: number | string | null;
  preco_unitario?: number | string | null;
  total?: number | string | null;
}

export interface InformacoesConector {
  orgao?: string | null;
  objeto?: string | null;
  edital?: string | null;
  data_base?: string | null;
  bdi?: string | number | null;
  fonte_precos?: string | null;
  total_prefeitura?: number | string | null;
  observacoes?: string | null;
}

export interface ResultadoModelo {
  itens: ItemModelo[];
  info: InfoOrcamento;
  erros: string[];
  avisos: string[];
  totais: { referencia: number; prefeitura: number | null; qtdEtapas: number; qtdItens: number };
  /** números dos itens sem etapa acima; todos os itens quando não há etapa (o conector bloqueia; a tela só avisa) */
  itensSemEtapa: string[];
}

const ABA_ORCAMENTO = "Orçamento";
/** Linha do rótulo "Data-base" na aba Informações do modelo (ROTULOS_INFO), para o aviso igual ao da tela. */
const LINHA_DATA_BASE = 4;

/** Tetos das colunas do banco: quantidade numeric(14,3), preços numeric(14,4), total numeric(14,2). */
const LIMITE_QUANTIDADE = 1e11;
const LIMITE_PRECO = 1e10;
const LIMITE_TOTAL = 1e12;
/** Dígitos significativos sem ruído de ponto flutuante (ver orcamento-modelo.js). */
const CIFRAS_RUIDO = 15;
const PADRAO_ITEM = /^\d+(\.\d+)*$/;

/** Rótulos das colunas do modelo (CABECALHOS_MODELO), para as mensagens de tipo inválido. */
const ROTULO_LINHA: Record<(typeof CAMPOS_LINHA_CONECTOR)[number], string> = {
  item: "Item",
  codigo: "Código",
  fonte: "Fonte",
  descricao: "Descrição",
  unidade: "Unidade",
  quantidade: "Quantidade",
  preco_unitario: "Preço unitário",
  total: "Total (R$)",
};
/** Rótulos da aba Informações (ROTULOS_INFO). */
const ROTULO_INFO: Record<(typeof CAMPOS_INFORMACOES_CONECTOR)[number], string> = {
  orgao: "Órgão",
  objeto: "Objeto",
  edital: "Edital/Processo",
  data_base: "Data-base",
  bdi: "BDI (%)",
  fonte_precos: "Fonte de preços",
  total_prefeitura: "Total da prefeitura (R$)",
  observacoes: "Observações",
};

/** Objeto ou lista: valor que o JSON permite e uma célula da planilha não tem. */
function composto(v: unknown): boolean {
  return typeof v === "object" && v !== null;
}

/** O campo equivale a uma célula vazia: null, ausente ou texto só com espaços. */
function vazio(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

/** Texto do campo, como o `textoCelula` da tela (número inteiro → "93358"). */
function texto(v: unknown): string {
  return v === null || v === undefined ? "" : String(v).trim();
}

function lerCampoNumerico(
  v: unknown,
  rotulo: string
): { valor: number | null; erro: string | null } {
  const bruto = v === undefined ? null : v;
  const valor = lerNumeroBR(bruto);
  if (Number.isNaN(valor)) return { valor: null, erro: `${rotulo} não é um número ("${bruto}")` };
  return { valor, erro: null };
}

/** Casas decimais pela representação mais curta do número (0.1 → 1; 1e-7 → 7). */
function casasDecimais(v: number): number {
  const m = /^(\d+)(?:\.(\d+))?(?:e([+-]\d+))?$/i.exec(String(Math.abs(v)));
  if (!m) return 0;
  return Math.max(0, (m[2] || "").length - Number(m[3] || 0));
}

/** Tira o ruído de ponto flutuante (11.528000000000002 → 11.528). */
function semRuido(v: number): number {
  return Number(v.toPrecision(CIFRAS_RUIDO));
}

/** Arredonda (meio para cima) sem o erro de 1.005 × 100 = 100.49999… */
function arredondarCasas(v: number, casas: number): number {
  const s = String(v);
  if (/e/i.test(s)) return Math.round(v * 10 ** casas) / 10 ** casas;
  return Number(`${Math.round(Number(`${s}e${casas}`))}e-${casas}`);
}

function formatar(v: number, minimo: number, maximo: number, agrupar = true): string {
  return v.toLocaleString("pt-BR", {
    minimumFractionDigits: minimo,
    maximumFractionDigits: maximo,
    useGrouping: agrupar,
  });
}

const moeda = (v: number) => formatar(v, 2, 2);

/** "1.2" pode vir depois de "1.1" (irmão), "1" (filho .1) ou "1.1.3" (irmão de um ancestral). */
function sequenciaValida(anterior: string, atual: string): boolean {
  const a = anterior.split(".").map(Number);
  const b = atual.split(".").map(Number);
  const mesmoInicio = (n: number) => b.slice(0, n).every((s, i) => s === a[i]);
  if (b.length === a.length + 1 && mesmoInicio(a.length) && b[b.length - 1] === 1) return true;
  const k = b.length;
  return k <= a.length && mesmoInicio(k - 1) && b[k - 1] === a[k - 1] + 1;
}

function temEtapaAcima(numero: string, etapasVistas: Set<string>): boolean {
  const partes = numero.split(".");
  for (let k = partes.length - 1; k >= 1; k--) {
    if (etapasVistas.has(partes.slice(0, k).join("."))) return true;
  }
  return false;
}

function infoVazia(): InfoOrcamento {
  return {
    orgao: null,
    objeto: null,
    edital: null,
    data_base: null,
    bdi: null,
    fonte: null,
    total_prefeitura: null,
    observacoes: null,
  };
}

/** Texto da aba Informações: número em pt-BR (até 10 casas, sem milhar), como a célula numérica. */
function textoInfo(v: unknown): string {
  if (vazio(v)) return "";
  if (typeof v === "number") return formatar(v, 0, 10, false);
  return texto(v);
}

/** Campos de `informacoes` na ordem dos rótulos da aba (a ordem dos avisos é a da tela). */
const CHAVE_DA_INFO: Record<(typeof CAMPOS_INFORMACOES_CONECTOR)[number], keyof InfoOrcamento> = {
  orgao: "orgao",
  objeto: "objeto",
  edital: "edital",
  data_base: "data_base",
  bdi: "bdi",
  fonte_precos: "fonte",
  total_prefeitura: "total_prefeitura",
  observacoes: "observacoes",
};

function lerInformacoes(informacoes: InformacoesConector | null, avisos: string[]): InfoOrcamento {
  const info = infoVazia();
  if (informacoes === null || informacoes === undefined) return info;
  if (typeof informacoes !== "object" || Array.isArray(informacoes)) {
    avisos.push("Informações: deve ser um objeto com os campos do modelo; foram ignoradas.");
    return info;
  }
  const origem = informacoes as Record<string, unknown>;
  for (const campo of CAMPOS_INFORMACOES_CONECTOR) {
    const v = origem[campo];
    const chave = CHAVE_DA_INFO[campo];
    if (composto(v)) {
      avisos.push(`Informações: ${ROTULO_INFO[campo]} deve ser texto ou número; foi ignorado.`);
      continue;
    }
    if (chave === "total_prefeitura") {
      const { valor, erro } = lerCampoNumerico(v, "Total da prefeitura (R$)");
      if (erro) avisos.push(`Informações: ${erro}; foi ignorado.`);
      else info.total_prefeitura = valor;
      continue;
    }
    const t = textoInfo(v) || null;
    info[chave] = t;
    // Número puro na Data-base (45901): não dá para saber se era data; vai como o número.
    if (chave === "data_base" && t !== null && typeof v === "number") {
      avisos.push(`Informações, linha ${LINHA_DATA_BASE}: Data-base numérica (${t}) — confira.`);
    }
  }
  return info;
}

/** Linha em branco: null/undefined, ou objeto com os 8 campos vazios. Outros tipos são erro. */
function linhaVazia(l: unknown): boolean {
  if (l === null || l === undefined) return true;
  if (typeof l !== "object" || Array.isArray(l)) return false;
  const o = l as Record<string, unknown>;
  return CAMPOS_LINHA_CONECTOR.every((c) => vazio(o[c]));
}

/**
 * Valida as linhas do orçamento (regras da spec 2026-09-29 §7, como a tela). Com `erros` não
 * vazio nada é gravado; `avisos` só informam. Ver o cabeçalho do arquivo para a correspondência
 * campo × célula.
 */
export function validarLinhasModelo(
  linhas: LinhaConector[],
  informacoes: InformacoesConector | null
): ResultadoModelo {
  const erros: string[] = [];
  const avisos: string[] = [];
  const itens: ItemModelo[] = [];
  const itensSemEtapa: string[] = [];
  const info = lerInformacoes(informacoes, avisos);
  const totais = { referencia: 0, prefeitura: info.total_prefeitura, qtdEtapas: 0, qtdItens: 0 };
  const resultado = (): ResultadoModelo => ({ itens, info, erros, avisos, totais, itensSemEtapa });

  const lista = Array.isArray(linhas) ? linhas : [];
  const comDados: number[] = [];
  lista.forEach((l, i) => {
    if (!linhaVazia(l)) comDados.push(i);
  });
  if (comDados.length > LIMITE_LINHAS) {
    erros.push(
      `A aba "${ABA_ORCAMENTO}" tem ${formatar(comDados.length, 0, 0)} linhas preenchidas; ` +
        `o limite é ${formatar(LIMITE_LINHAS, 0, 0)}.`
    );
    return resultado();
  }

  const linhaDoNumero = new Map<string, number>();
  let refCents = 0;
  for (const i of comDados) {
    const bruta: unknown = lista[i];
    const n = i + 2;
    if (typeof bruta !== "object" || bruta === null || Array.isArray(bruta)) {
      erros.push(`Linha ${n}: a linha deve ser um objeto com os campos do modelo.`);
      continue;
    }
    const l = bruta as Record<string, unknown>;
    const compostos = CAMPOS_LINHA_CONECTOR.filter((c) => composto(l[c]));
    if (compostos.length > 0) {
      for (const c of compostos)
        erros.push(`Linha ${n}: ${ROTULO_LINHA[c]} deve ser texto ou número.`);
      continue;
    }
    const errosAntes = erros.length;

    const bruto = l.item;
    let numero = texto(bruto);
    if (typeof bruto === "number" && !Number.isInteger(bruto)) {
      numero = String(bruto);
      avisos.push(
        `Linha ${n}: Item lido como número (${numero}); se era ${numero}0, ` +
          `formate a coluna A como Texto e digite de novo.`
      );
    }
    if (!numero) {
      erros.push(`Linha ${n}: Item vazio.`);
    } else if (!PADRAO_ITEM.test(numero)) {
      erros.push(`Linha ${n}: Item "${numero}" fora do padrão (use 1, 1.1, 1.1.2).`);
    } else if (linhaDoNumero.has(numero)) {
      erros.push(
        `Linha ${n}: Item ${numero} repetido (já está na linha ${linhaDoNumero.get(numero)}).`
      );
    } else {
      linhaDoNumero.set(numero, n);
    }

    const descricao = texto(l.descricao);
    if (!descricao) erros.push(`Linha ${n}: Descrição vazia.`);

    const qtd = lerCampoNumerico(l.quantidade, "Quantidade");
    const preco = lerCampoNumerico(l.preco_unitario, "Preço unitário");
    if (qtd.erro) erros.push(`Linha ${n}: ${qtd.erro}.`);
    if (preco.erro) erros.push(`Linha ${n}: ${preco.erro}.`);

    const etapa = !qtd.erro && !preco.erro && qtd.valor === null && preco.valor === null;
    let quantidade: number | null = null;
    let ref: number | null = null;
    if (!etapa && !qtd.erro && !preco.erro) {
      if (preco.valor === null) erros.push(`Linha ${n}: Quantidade sem Preço unitário.`);
      else if (qtd.valor === null) erros.push(`Linha ${n}: Preço unitário sem Quantidade.`);
      else {
        // O ruído sai antes de contar as casas. Acima do teto não se arredonda nem se avisa.
        quantidade = semRuido(qtd.valor);
        ref = semRuido(preco.valor);
        if (Math.abs(quantidade) < LIMITE_QUANTIDADE && casasDecimais(quantidade) > 3) {
          quantidade = arredondarCasas(quantidade, 3);
          avisos.push(
            `Linha ${n}: Quantidade com mais de 3 casas; arredondada para ${formatar(quantidade, 0, 3)}.`
          );
        }
        if (Math.abs(ref) < LIMITE_PRECO && casasDecimais(ref) > 4) {
          ref = arredondarCasas(ref, 4);
          avisos.push(
            `Linha ${n}: Preço unitário com mais de 4 casas; arredondado para ${formatar(ref, 2, 4)}.`
          );
        }
        if (quantidade >= LIMITE_QUANTIDADE) {
          erros.push(
            `Linha ${n}: Quantidade acima do limite (menos de ${formatar(LIMITE_QUANTIDADE, 0, 0)}).`
          );
        } else if (quantidade <= 0) {
          erros.push(`Linha ${n}: Quantidade deve ser maior que zero.`);
        }
        if (ref >= LIMITE_PRECO) {
          erros.push(
            `Linha ${n}: Preço unitário acima do limite (menos de ${formatar(LIMITE_PRECO, 0, 0)}).`
          );
        } else if (ref < 0) {
          erros.push(`Linha ${n}: Preço unitário negativo.`);
        }
      }
    }

    const tot = lerCampoNumerico(l.total, "Total (R$)");
    if (tot.erro) avisos.push(`Linha ${n}: ${tot.erro}; foi ignorado.`);
    const totalInformado = tot.erro ? null : tot.valor;

    if (erros.length > errosAntes) continue;

    const unidade = texto(l.unidade) || null;
    if (etapa && (unidade !== null || totalInformado !== null)) {
      avisos.push(`Linha ${n}: linha sem quantidade e preço tratada como etapa — confira.`);
    }
    if (!etapa) {
      // Quantidade e preço já estão abaixo dos tetos: a conta em BigInt não lança.
      const calculado = totalLinha(quantidade, ref) as number;
      if (calculado >= LIMITE_TOTAL) {
        erros.push(
          `Linha ${n}: Total da linha acima do limite (menos de ${formatar(LIMITE_TOTAL, 0, 0)}).`
        );
        continue;
      }
      if (unidade === null) avisos.push(`Linha ${n}: item sem unidade.`);
      refCents += Math.round(calculado * 100);
      if (
        totalInformado !== null &&
        Math.abs(Math.round(totalInformado * 100) - Math.round(calculado * 100)) > 1
      ) {
        avisos.push(
          `Linha ${n}: Total (R$) informado ${moeda(totalInformado)} difere do calculado ` +
            `${moeda(calculado)}.`
        );
      }
    }

    itens.push({
      linha: n,
      numero,
      etapa,
      codigo: texto(l.codigo) || null,
      fonte: texto(l.fonte) || null,
      descricao,
      unidade,
      quantidade: etapa ? null : quantidade,
      valor_unitario_ref: etapa ? null : ref,
      total_informado: totalInformado,
    });
  }

  totais.referencia = refCents / 100;
  totais.qtdEtapas = itens.filter((i) => i.etapa).length;
  totais.qtdItens = itens.length - totais.qtdEtapas;

  if (totais.qtdItens === 0) {
    erros.push(`Nenhum item com Quantidade e Preço unitário na aba "${ABA_ORCAMENTO}".`);
    return resultado();
  }

  // Estrutura: sequência da numeração e etapa acima de cada item.
  const etapasVistas = new Set<string>();
  let anterior: string | null = null;
  for (const item of itens) {
    if (anterior !== null && !sequenciaValida(anterior, item.numero)) {
      avisos.push(
        `Linha ${item.linha}: Item ${item.numero} fora de sequência (depois de ${anterior}).`
      );
    }
    if (!item.etapa && totais.qtdEtapas === 0) itensSemEtapa.push(item.numero);
    if (!item.etapa && totais.qtdEtapas > 0 && !temEtapaAcima(item.numero, etapasVistas)) {
      avisos.push(`Linha ${item.linha}: item ${item.numero} sem etapa acima.`);
      itensSemEtapa.push(item.numero);
    }
    if (item.etapa) etapasVistas.add(item.numero);
    anterior = item.numero;
  }
  if (totais.qtdEtapas === 0) {
    avisos.push("A planilha não tem linhas de etapa; os itens ficam sem subtotal.");
  }

  if (info.total_prefeitura !== null) {
    const diferenca = Math.abs(refCents - Math.round(info.total_prefeitura * 100));
    if (diferenca > 1) {
      avisos.push(
        `Soma dos itens (R$ ${moeda(totais.referencia)}) difere do Total da prefeitura ` +
          `(R$ ${moeda(info.total_prefeitura)}) em R$ ${moeda(diferenca / 100)}.`
      );
    }
  }

  return resultado();
}
