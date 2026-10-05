/**
 * Registros do orçamento importado da planilha da prefeitura (modelo SIGO) e
 * utilitários de ordem/rótulo dos itens (oportunidade e projeto).
 *
 * Funções puras (sem sigoClient), testadas em orcamento-registros.test.js.
 * Spec: docs/superpowers/specs/2026-09-29-orcamento-planilha-prefeitura-design.md (§6, §7, §11).
 */
import { precoComDesconto, totalLinha } from "./orcamento-desconto";

/**
 * Converte os itens lidos do modelo (ItemModelo) em linhas de `orcamento_item`.
 *
 * Todas as chaves vão em todos os registros: o insert em lote do PostgREST
 * grava NULL na chave ausente (não o default da coluna), e `etapa` é NOT NULL.
 * `linha` e `total_informado` não são colunas: ficam de fora.
 */
export function montarRegistrosImportacao(itensModelo, { empresaId, oportunidadeId, descontoPct }) {
  // nulo ou ausente = sem desconto; o resto vai direto ao precoComDesconto, que recusa (RangeError)
  // o que não for number de 0 a 99,99 em vez de gravar o preço cheio como se fosse a proposta
  const pct = descontoPct ?? 0;
  return (itensModelo || []).map((it, indice) => {
    const etapa = it.etapa === true;
    const ref = etapa ? null : (it.valor_unitario_ref ?? null);
    const quantidade = etapa ? null : (it.quantidade ?? null);
    const valorUnitario = ref == null ? null : precoComDesconto(ref, pct);
    return {
      empresa_id: empresaId,
      oportunidade_id: oportunidadeId,
      numero: it.numero,
      item: it.numero,
      etapa,
      tipo: null,
      codigo: it.codigo ?? null,
      fonte: it.fonte ?? null,
      descricao: it.descricao,
      unidade: etapa ? null : (it.unidade ?? null),
      quantidade,
      valor_unitario_ref: ref,
      valor_unitario: valorUnitario,
      bdi: 0,
      imposto: 0,
      valor_total: etapa ? null : totalLinha(quantidade, valorUnitario),
      ordem: indice,
    };
  });
}

const CHAVES_INFO_ORCAMENTO = [
  "orgao",
  "objeto",
  "edital",
  "data_base",
  "bdi",
  "fonte",
  "total_prefeitura",
  "observacoes",
];

/** InfoOrcamento + nome do arquivo e data da importação, para `oportunidade.orcamento_info`. */
export function montarInfoOrcamento(info, { arquivoNome, importadoEm }) {
  const origem = info || {};
  const saida = {};
  for (const chave of CHAVES_INFO_ORCAMENTO) saida[chave] = origem[chave] ?? null;
  saida.arquivo_nome = arquivoNome;
  saida.importado_em = importadoEm;
  return saida;
}

/** Fatia a lista em lotes de `tamanho` (padrão 200, o do bulkCreate do repositório). */
export function emLotes(lista, tamanho = 200) {
  if (!Number.isInteger(tamanho) || tamanho < 1) {
    throw new Error(`Tamanho de lote inválido: ${tamanho}`);
  }
  const itens = lista || [];
  const lotes = [];
  for (let i = 0; i < itens.length; i += tamanho) lotes.push(itens.slice(i, i + tamanho));
  return lotes;
}

/** `ordem` do próximo item: max(ordem) + 1 (ordem nula conta como 0), ou 0 com a lista vazia. */
export function proximaOrdem(itens) {
  const lista = itens || [];
  if (lista.length === 0) return 0;
  return lista.reduce((max, i) => Math.max(max, Number(i.ordem) || 0), 0) + 1;
}

/** Ordem natural de número hierárquico: "1.2" antes de "1.10", "1" antes de "1.1". */
export function compararNumeroItem(a, b) {
  const sa = String(a ?? "").split(".");
  const sb = String(b ?? "").split(".");
  const n = Math.max(sa.length, sb.length);
  for (let i = 0; i < n; i++) {
    if (sa[i] === undefined) return -1;
    if (sb[i] === undefined) return 1;
    const na = Number(sa[i]);
    const nb = Number(sb[i]);
    const ambosNumeros = sa[i] !== "" && sb[i] !== "" && Number.isFinite(na) && Number.isFinite(nb);
    const c = ambosNumeros ? na - nb : sa[i].localeCompare(sb[i]);
    if (c !== 0) return c < 0 ? -1 : 1;
  }
  return 0;
}

/** Rótulo da coluna Nº: o `numero` do item importado, senão a posição (1, 2, 3…). */
export function rotuloItem(item, indice) {
  return item.numero ?? String(indice + 1);
}

const temNumero = (itens) => itens.some((i) => !!i.numero);

/**
 * Ordem dos itens no Projeto. Com `numero` (orçamento importado): por `ordem`
 * (nula por último), desempate por `numero`. Sem `numero`: a ordem alfabética
 * por descrição de sempre (comparação copiada de pages/Projetos.jsx).
 * Devolve uma lista nova; não altera a recebida.
 */
export function ordenarItensProjeto(itens) {
  const lista = [...(itens || [])];
  if (temNumero(lista)) {
    return lista.sort((a, b) => {
      const oa = a.ordem ?? null;
      const ob = b.ordem ?? null;
      if (oa === null && ob !== null) return 1;
      if (oa !== null && ob === null) return -1;
      if (oa !== null && ob !== null && oa !== ob) return oa - ob;
      return compararNumeroItem(a.numero, b.numero);
    });
  }
  return lista.sort((a, b) => {
    const descA = (a.descricao || "").toLowerCase();
    const descB = (b.descricao || "").toLowerCase();
    return descA.localeCompare(descB);
  });
}

/**
 * Ordem dos itens na Oportunidade (a mesma de loadOrcamentoData em
 * pages/Oportunidades.jsx: `ordem`, nula como 0), desempate por `numero`, e
 * rótulo `item` = `numero` ou a posição. Devolve objetos novos.
 */
export function ordenarItensOportunidade(itens) {
  return [...(itens || [])]
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || compararNumeroItem(a.numero, b.numero))
    .map((item, i) => ({ ...item, item: rotuloItem(item, i) }));
}

/** Tira as linhas de etapa (título), para compras, relatórios e somas. */
export function semEtapas(itens) {
  return (itens || []).filter((i) => !i.etapa);
}

/**
 * Cancela as gravações por campo ainda pendentes (debounce de 1,5 s do
 * handleUpdateItem, que regrava a LINHA INTEIRA). Chamar antes de importar ou
 * aplicar o desconto, senão a linha antiga volta por cima. Devolve quantas havia.
 */
export function cancelarGravacoesPendentes(ref) {
  const pendentes = ref?.current;
  if (!pendentes || typeof pendentes !== "object") return 0;
  const timers = Object.values(pendentes);
  timers.forEach((t) => clearTimeout(t));
  ref.current = {};
  return timers.length;
}
