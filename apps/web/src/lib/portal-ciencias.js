/**
 * Ciências de entrega no portal do aluno (T36) — regras puras, sem DOM e sem rede.
 *
 * O servidor devolve em `dados.ciencias` até 30 entregas do funcionário (pendentes e confirmadas, a
 * criada por último primeiro). O portal mostra as pendentes em destaque (botão "Confirmo o
 * recebimento") e as confirmadas num histórico recolhido. Testes em portal-ciencias.test.js.
 */

const instante = (iso) => {
  const t = iso ? new Date(iso).getTime() : NaN;
  return Number.isFinite(t) ? t : -Infinity;
};

/**
 * `{ pendentes, confirmadas }` a partir de `dados.ciencias`. As pendentes ficam na ordem recebida; as
 * confirmadas, da confirmada por último para a mais antiga (sem data de confirmação, vale a de criação;
 * sem nenhuma das duas, vai para o fim). Status desconhecido e itens que não são objeto são ignorados.
 */
export function separarCiencias(ciencias) {
  const lista = Array.isArray(ciencias)
    ? ciencias.filter((c) => c && typeof c === "object" && !Array.isArray(c))
    : [];
  const pendentes = lista.filter((c) => c.status === "pendente");
  const confirmadas = lista
    .filter((c) => c.status === "confirmada")
    .map((c) => ({ c, quando: instante(c.confirmada_em || c.created_at) }))
    // sort do JS é estável: empate mantém a ordem recebida
    .sort((a, b) => b.quando - a.quando)
    .map(({ c }) => c);
  return { pendentes, confirmadas };
}

/** Linha de um item da entrega: "2× Luva (L-1) · CA 12345". Aceita item em texto puro (dado antigo). */
export function textoDoItemDeEntrega(item) {
  if (typeof item === "string") return item;
  if (!item || typeof item !== "object") return "";
  return (
    (item.quantidade ? `${item.quantidade}× ` : "") +
    (item.descricao || item.nome || "") +
    (item.codigo ? ` (${item.codigo})` : "") +
    (item.ca ? ` · CA ${item.ca}` : "")
  );
}

// ---------------------------------------------------------------- histórico parcial

/**
 * Quantas entregas o servidor manda em `dados.ciencias` (a consulta de `entrega_ciencia` do
 * `portal-funcionario` tem `.limit(30)`; o teste confere os dois lados). Pendentes e confirmadas
 * entram juntas nesse limite.
 */
export const LIMITE_CIENCIAS_DO_SERVIDOR = 30;

/**
 * O servidor mandou o limite inteiro? Então pode haver entregas mais antigas que não vieram, e o
 * histórico de confirmadas é só das mais recentes (não o total). Conta tudo o que veio, não só as
 * confirmadas.
 */
export function historicoDeCienciasParcial(ciencias) {
  return Array.isArray(ciencias) && ciencias.length >= LIMITE_CIENCIAS_DO_SERVIDOR;
}

/** Título do bloco do histórico. Parcial: não sugere o total ("Últimas entregas confirmadas (N)"). */
export function tituloDoHistorico(quantidade, parcial = false) {
  return parcial
    ? `Últimas entregas confirmadas (${quantidade})`
    : `Entregas confirmadas (${quantidade})`;
}

export const AVISO_HISTORICO_PARCIAL = `Aparecem só as ${LIMITE_CIENCIAS_DO_SERVIDOR} entregas mais recentes; as mais antigas não são mostradas aqui. Em caso de dúvida, fale com o RH.`;
