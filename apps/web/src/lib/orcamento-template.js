/**
 * "Aplicar Template" do orçamento (oportunidade e projeto): converte um item
 * salvo no template (TemplateOportunidade/TemplateProjeto.campos_padrao, que
 * guarda a linha inteira do orcamento_item) no registro a gravar.
 *
 * - Item antigo (sem `numero`/`etapa`): o mapeamento de sempre (tipo "Material"
 *   e unidade "UN" por padrão, números nulos viram 0), com as colunas novas nulas.
 * - Orçamento importado da planilha da prefeitura: leva `numero`, `etapa`,
 *   `fonte` e `valor_unitario_ref`; o item mantém o tipo nulo e a etapa fica sem
 *   unidade, quantidade e valores, como na importação.
 *
 * Todas as chaves vão em todos os registros (o insert em lote grava NULL na
 * chave ausente). Nada da linha salva vaza (id, created_by, deleted_at, dono antigo).
 * Spec: docs/superpowers/specs/2026-09-29-orcamento-planilha-prefeitura-design.md (§11).
 */
import { rotuloItem } from "./orcamento-registros";

/**
 * @param {object} item linha salva no template
 * @param {number} indice posição na lista do template (vira `ordem`)
 * @param {object} dono { empresa_id, oportunidade_id } ou { empresa_id, projeto_id }
 */
export function montarRegistroTemplate(item, indice, dono) {
  const etapa = item.etapa === true;
  const numero = item.numero || null;
  return {
    ...dono,
    item: rotuloItem({ numero }, indice),
    numero,
    etapa,
    tipo: item.tipo || (numero ? null : "Material"),
    descricao: item.descricao || "",
    codigo: item.codigo || "",
    fonte: item.fonte || null,
    unidade: etapa ? null : item.unidade || "UN",
    quantidade: etapa ? null : item.quantidade || 0,
    valor_unitario_ref: etapa ? null : (item.valor_unitario_ref ?? null),
    valor_unitario: etapa ? null : item.valor_unitario || 0,
    bdi: item.bdi || 0,
    imposto: item.imposto || 0,
    valor_total: etapa ? null : item.valor_total || 0,
    ordem: indice,
  };
}
