import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const { preLancamentoId, empresaId, observacoes } = await req.json();

    if (!preLancamentoId || !empresaId) {
      return Response.json({ error: 'Dados obrigatórios faltando' }, { status: 400 });
    }

    // Buscar pré-lançamento
    const prelancs = await base44.asServiceRole.entities.PreLancamento.filter({ id: preLancamentoId });
    if (prelancs.length === 0) {
      return Response.json({ error: 'Pré-lançamento não encontrado' }, { status: 404 });
    }

    const preLancamento = prelancs[0];
    const dados = JSON.parse(preLancamento.dados_extraidos || '{}');

    const hoje = new Date().toISOString().split('T')[0];
    const dataLancamento = dados.data || hoje;

    // Buscar conta financeira
    let contaId = preLancamento.conta_financeira_id || '';
    let contaNome = '';
    if (contaId) {
      const contas = await base44.asServiceRole.entities.ContaFinanceira.filter({ id: contaId });
      if (contas.length > 0) contaNome = contas[0].nome || '';
    } else {
      // Buscar conta padrão da empresa
      const contas = await base44.asServiceRole.entities.ContaFinanceira.filter({ empresa_id: empresaId, ativo: true }, '', 1);
      if (contas.length > 0) { contaId = contas[0].id; contaNome = contas[0].nome || ''; }
    }

    // Criar transação financeira como DESPESA REALIZADA (paga)
    const transacao = await base44.asServiceRole.entities.TransacaoFinanceira.create({
      empresa_id: empresaId,
      tipo: 'Despesa',
      status: 'Realizado',
      conta_id: contaId,
      conta_nome: contaNome,
      projeto_id: preLancamento.projeto_id || '',
      projeto_nome: preLancamento.projeto_nome || '',
      fornecedor_nome: dados.fornecedor || '',
      descricao: dados.descricao || dados.fornecedor || 'Comprovante',
      valor: parseFloat(dados.valor) || 0,
      data: dataLancamento,
      data_pagamento: hoje,
      forma_pagamento: dados.forma_pagamento || '',
      observacoes: `Originado de pré-lançamento.${observacoes ? ' ' + observacoes : ''}`,
      referencia_tipo: 'Manual',
      pre_lancamento_id: preLancamentoId,
      pre_lancamento_aprovado: true,
      conciliado: false
    });

    // Atualizar pré-lançamento para Conciliado
    await base44.asServiceRole.entities.PreLancamento.update(preLancamentoId, {
      status: 'Conciliado',
      transacao_id: transacao.id
    });

    // Audit log
    try {
      await base44.asServiceRole.entities.AuditLog.create({
        empresa_id: empresaId,
        tipo_acao: 'editar',
        entidade: 'PreLancamento',
        entidade_id: preLancamentoId,
        entidade_nome: `Reconciliação - ${dados.fornecedor || ''}`,
        descricao: `Pré-lançamento reconciliado e convertido em despesa paga`,
        modulo: 'Financeiro',
        status: 'sucesso'
      });
    } catch (auditError) {
      console.error('Erro ao registrar audit log:', auditError);
    }

    return Response.json({
      sucesso: true,
      transacao: { id: transacao.id, valor: transacao.valor, descricao: transacao.descricao }
    });
  } catch (error) {
    console.error('Erro ao reconciliar pré-lançamento:', error);
    return Response.json({ error: 'Erro ao reconciliar: ' + error.message }, { status: 500 });
  }
});