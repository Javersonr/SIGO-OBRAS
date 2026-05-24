import { base44 } from '@/api/base44Client';

/**
 * Registra uma ação de auditoria
 * @param {Object} auditData - Dados da auditoria
 * @param {string} auditData.empresa_id - ID da empresa
 * @param {string} auditData.tipo_acao - Tipo de ação (criar, editar, deletar, etc)
 * @param {string} auditData.entidade - Tipo de entidade (Funcao, Funcionario, etc)
 * @param {string} auditData.entidade_id - ID da entidade (opcional)
 * @param {string} auditData.descricao - Descrição da ação
 * @param {Object} auditData.dados_anteriores - Dados antes da ação (opcional)
 * @param {Object} auditData.dados_novos - Dados após a ação (opcional)
 */
export async function registrarAudit({
  empresa_id,
  tipo_acao,
  entidade,
  entidade_id,
  descricao,
  dados_anteriores,
  dados_novos
}) {
  try {
    const response = await base44.functions.invoke('registrarAuditLog', {
      empresa_id,
      tipo_acao,
      entidade,
      entidade_id,
      descricao,
      dados_anteriores,
      dados_novos,
      status: 'sucesso'
    });

    return response.data;
  } catch (error) {
    console.error('Erro ao registrar auditoria:', error);
  }
}

/**
 * Registra um erro de auditoria
 */
export async function registrarAuditErro({
  empresa_id,
  tipo_acao,
  entidade,
  entidade_id,
  descricao,
  mensagem_erro
}) {
  try {
    const response = await base44.functions.invoke('registrarAuditLog', {
      empresa_id,
      tipo_acao,
      entidade,
      entidade_id,
      descricao,
      status: 'erro',
      mensagem_erro
    });

    return response.data;
  } catch (error) {
    console.error('Erro ao registrar erro de auditoria:', error);
  }
}

/**
 * Gera descrição padrão para criação
 */
export function descricaoCriacao(entidade, dados) {
  return `${entidade} criado com os seguintes dados: ${Object.keys(dados).join(', ')}`;
}

/**
 * Gera descrição padrão para edição
 */
export function descricaoEdicao(entidade, campos_alterados) {
  return `${entidade} editado. Campos alterados: ${campos_alterados.join(', ')}`;
}

/**
 * Gera descrição padrão para deleção
 */
export function descricaoDeleacao(entidade, id) {
  return `${entidade} (ID: ${id}) deletado`;
}