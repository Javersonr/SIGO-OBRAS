/**
 * Conferência da solicitação de compra ANTES de gravar cotação ou pedido.
 *
 * Desde a migração 0178, mexer em item de solicitação já aprovada a devolve para "Pendente Aprovação", e o
 * banco só deixa a tela mudar o status DENTRO do grupo aprovado (Aprovada, Em Cotação, Cotação Aprovada,
 * Pedido Gerado) ou para "Cancelada"; entrar no grupo é só pela aprovação. As telas de cotação e de pedido
 * gravavam cotação/pedido primeiro e só no fim mudavam o status da solicitação: quando ela tinha voltado a
 * pendente, o banco recusava e ficava tudo pela metade. Por isso: ler a solicitação do BANCO na hora (não
 * a da lista em memória) e parar antes de gravar qualquer coisa.
 */

/** O grupo "aprovada" da 0178 (`aprovados` em solicitacao_compra_aprovacao_so_por_rpc). */
export const STATUS_APROVADOS = ["Aprovada", "Em Cotação", "Cotação Aprovada", "Pedido Gerado"];

export const MENSAGEM_VOLTOU_PARA_APROVACAO =
  "A solicitação voltou para aprovação porque um item foi alterado. Aprove de novo antes de continuar.";

export const MENSAGEM_SOLICITACAO_SUMIU =
  "A solicitação desta compra não foi encontrada (pode ter sido excluída). Atualize a tela.";

/** A solicitação (como está no banco) permite seguir para cotação ou pedido? */
export function avaliarStatusDaSolicitacao(solicitacao) {
  if (!solicitacao) return { ok: false, mensagem: MENSAGEM_SOLICITACAO_SUMIU };
  const status = solicitacao.status;
  if (STATUS_APROVADOS.includes(status)) return { ok: true };
  if (status === "Pendente Aprovação")
    return { ok: false, mensagem: MENSAGEM_VOLTOU_PARA_APROVACAO };
  return {
    ok: false,
    mensagem: `A solicitação está "${status || "sem status"}" e não pode seguir para cotação ou pedido. Atualize a tela.`,
  };
}

/**
 * Lê a solicitação no banco agora e diz se pode continuar: `{ ok: true }` ou `{ ok: false, mensagem }`.
 * Erro de leitura também para (com a mensagem do erro): melhor não gravar do que gravar pela metade.
 */
export async function conferirSolicitacaoAprovada(sigo, solicitacaoId) {
  let atual;
  try {
    atual = await sigo.entities.SolicitacaoCompra.get(solicitacaoId);
  } catch (e) {
    return {
      ok: false,
      mensagem: `Não deu para conferir a situação da solicitação: ${e?.message || "erro desconhecido"}. Tente de novo.`,
    };
  }
  return avaliarStatusDaSolicitacao(atual);
}
