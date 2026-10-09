/**
 * Registros do orçamento importado (modelo SIGO) e ordem/rótulo dos itens da oportunidade — porte
 * linha a linha das funções de apps/web/src/lib/orcamento-registros.js que o conector do Claude usa
 * (spec 2026-10-08 §3). As que só a tela usa (proximaOrdem, ordenarItensProjeto, semEtapas e as
 * gravações pendentes) não vêm. Paridade no Vitest (apps/web/src/lib/orcamento-paridade.test.js).
 * Puro: roda no Deno e no Node.
 */
import { precoComDesconto, totalLinha, type ItemOrcamento } from "./desconto.ts";

/** Linha lida do modelo (lerPlanilhaModelo na tela; validarLinhasModelo no conector). */
export interface ItemModelo {
  linha: number;
  numero: string;
  etapa: boolean;
  codigo: string | null;
  fonte: string | null;
  descricao: string;
  unidade: string | null;
  quantidade: number | null;
  valor_unitario_ref: number | null;
  total_informado: number | null;
}

/** Linha de `orcamento_item` (sem id, created_at e deleted_at: quem grava é a RPC 0153). */
export interface RegistroOrcamento {
  empresa_id: string;
  oportunidade_id: string;
  numero: string;
  item: string;
  etapa: boolean;
  tipo: null;
  codigo: string | null;
  fonte: string | null;
  descricao: string;
  unidade: string | null;
  quantidade: number | null;
  valor_unitario_ref: number | null;
  valor_unitario: number | null;
  bdi: 0;
  imposto: 0;
  valor_total: number | null;
  ordem: number;
}

/** `oportunidade.orcamento_info` (aba Informações do modelo). */
export interface InfoOrcamento {
  orgao: string | null;
  objeto: string | null;
  edital: string | null;
  data_base: string | null;
  bdi: string | null;
  fonte: string | null;
  total_prefeitura: number | null;
  observacoes: string | null;
}

/**
 * Converte os itens lidos do modelo em linhas de `orcamento_item`. Todas as chaves vão em todos
 * os registros (o INSERT em lote grava NULL na chave ausente, e `etapa` é NOT NULL). `linha` e
 * `total_informado` não são colunas: ficam de fora. Desconto nulo ou ausente = 0; o resto vai
 * direto ao precoComDesconto, que recusa (RangeError) o que não for number de 0 a 99,99.
 */
export function montarRegistrosImportacao(
  itens: ItemModelo[],
  o: { empresaId: string; oportunidadeId: string; descontoPct: number | null | undefined }
): RegistroOrcamento[] {
  const pct = o.descontoPct ?? 0;
  return (itens || []).map((it, indice) => {
    const etapa = it.etapa === true;
    const ref = etapa ? null : (it.valor_unitario_ref ?? null);
    const quantidade = etapa ? null : (it.quantidade ?? null);
    const valorUnitario = ref == null ? null : precoComDesconto(ref, pct);
    return {
      empresa_id: o.empresaId,
      oportunidade_id: o.oportunidadeId,
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
] as const;

/** InfoOrcamento + nome do arquivo e data da importação, para `oportunidade.orcamento_info`. */
export function montarInfoOrcamento(
  info: Partial<InfoOrcamento> | null,
  o: { arquivoNome: string; importadoEm: string }
): InfoOrcamento & { arquivo_nome: string; importado_em: string } {
  const origem = (info || {}) as Record<string, unknown>;
  const saida: Record<string, unknown> = {};
  for (const chave of CHAVES_INFO_ORCAMENTO) saida[chave] = origem[chave] ?? null;
  saida.arquivo_nome = o.arquivoNome;
  saida.importado_em = o.importadoEm;
  return saida as unknown as InfoOrcamento & { arquivo_nome: string; importado_em: string };
}

/** Fatia a lista em lotes de `tamanho` (padrão 200, o do bulkCreate do repositório). */
export function emLotes<T>(lista: T[], tamanho = 200): T[][] {
  if (!Number.isInteger(tamanho) || tamanho < 1) {
    throw new Error(`Tamanho de lote inválido: ${tamanho}`);
  }
  const itens = lista || [];
  const lotes: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) lotes.push(itens.slice(i, i + tamanho));
  return lotes;
}

/** Ordem natural de número hierárquico: "1.2" antes de "1.10", "1" antes de "1.1". */
export function compararNumeroItem(a: unknown, b: unknown): -1 | 0 | 1 {
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
function rotuloItem(item: ItemOrcamento, indice: number): string {
  return item.numero ?? String(indice + 1);
}

/**
 * Ordem dos itens na Oportunidade (a de loadOrcamentoData em pages/Oportunidades.jsx: `ordem`,
 * nula como 0), desempate por `numero`, e rótulo `item` = `numero` ou a posição. Objetos novos.
 */
export function ordenarItensOportunidade<T extends ItemOrcamento>(
  itens: T[]
): (T & { item: string })[] {
  return [...(itens || [])]
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || compararNumeroItem(a.numero, b.numero))
    .map((item, i) => ({ ...item, item: rotuloItem(item, i) }));
}
