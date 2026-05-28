/**
 * Rascunho de Solicitação de Compra entre páginas.
 *
 * Substitui o anti-pattern `window.solicitacaoCompraData` que era usado
 * pra empurrar dados de Estoque → Compras. Problemas do window: estado
 * global silencioso, perde no F5, race condition no useEffect que lia.
 *
 * Agora usamos sessionStorage com chave única:
 *   - Sobrevive a reload
 *   - É inspecionável no DevTools
 *   - 1 só consumidor: Compras.jsx faz `consumirDraftSC()` no mount,
 *     que LÊ e LIMPA atomicamente (não dá pra acidentar duas vezes)
 *
 * Shape do draft:
 *   {
 *     origem: "Manual" | "Orcamento" | "Estoque",
 *     projeto_id?: string,
 *     projeto_nome?: string,
 *     oportunidade_id?: string,
 *     oportunidade_nome?: string,
 *     prioridade?: "Baixa" | "Normal" | "Alta" | "Urgente",
 *     observacoes?: string,
 *     itens: [{
 *       material_id?: string,
 *       material_codigo?: string,
 *       descricao: string,
 *       quantidade: number,
 *       unidade?: string,
 *       preco_unitario_estimado?: number,
 *       especificacoes?: string,
 *     }]
 *   }
 */

const STORAGE_KEY = "sigo_sc_draft";

/**
 * Salva o rascunho. Quem chama deve depois fazer
 * `navigate('/Compras')` pra disparar o consumo.
 */
export function salvarDraftSC(draft) {
  if (!draft || typeof draft !== "object") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch (err) {
    console.warn("[sc-draft] falha ao salvar rascunho:", err);
  }
}

/**
 * Lê e LIMPA o rascunho. Use só uma vez por sessão (Compras.jsx).
 * Retorna null se não há rascunho ou se está corrompido.
 */
export function consumirDraftSC() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(STORAGE_KEY); // consume = remove
    return JSON.parse(raw);
  } catch (err) {
    console.warn("[sc-draft] rascunho corrompido, descartando:", err);
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

/** Apenas pra debug/UI condicional — não consome. */
export function temDraftSC() {
  return sessionStorage.getItem(STORAGE_KEY) != null;
}
