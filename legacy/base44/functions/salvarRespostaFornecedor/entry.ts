import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const { token, action } = body;

    if (!token) {
      return Response.json({ error: 'Token obrigatório' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);

    // Buscar cotação fornecedor pelo token (sem autenticação)
    const cotacaoFornecedor = await base44.asServiceRole.entities.CotacaoFornecedor.filter({ token });
    if (cotacaoFornecedor.length === 0) {
      return Response.json({ error: 'Cotação não encontrada' }, { status: 404 });
    }

    const cotFornecedorData = cotacaoFornecedor[0];
    const cotacaoId = cotFornecedorData.cotacao_id;
    const empresaId = cotFornecedorData.empresa_id;

    // Ação: Impossível Responder
    if (action === 'impossivel') {
      const { motivo_recusa } = body;
      await base44.asServiceRole.entities.CotacaoFornecedor.update(cotFornecedorData.id, {
        status: 'Impossível Responder',
        motivo_recusa: motivo_recusa || '',
        data_resposta: new Date().toISOString()
      });
      return Response.json({ success: true });
    }

    // Ação: Upload arquivo
    if (action === 'upload_arquivo') {
      const { arquivo } = body;
      const novoArquivo = await base44.asServiceRole.entities.ArquivoCotacaoFornecedor.create({
        empresa_id: empresaId,
        cotacao_id: cotacaoId,
        cotacao_fornecedor_id: cotFornecedorData.id,
        fornecedor_id: cotFornecedorData.fornecedor_id,
        fornecedor_nome: cotFornecedorData.fornecedor_nome,
        ...arquivo
      });
      return Response.json({ success: true, arquivo: novoArquivo });
    }

    // Ação: Responder cotação
    if (action === 'responder') {
      const { respostas, responsavel, itens } = body;

      if (!respostas || !itens) {
        return Response.json({ error: 'Dados incompletos' }, { status: 400 });
      }

      // Salvar cada resposta
      for (const item of itens) {
        const resp = respostas[item.id];
        if (!resp || !resp.valor_unitario) continue;

        // Verificar se já existe resposta
        const respostaExistente = await base44.asServiceRole.entities.CotacaoResposta.filter({
          cotacao_id: cotacaoId,
          cotacao_fornecedor_id: cotFornecedorData.id,
          item_id: item.id
        });

        const respostaData = {
          empresa_id: empresaId,
          cotacao_id: cotacaoId,
          cotacao_fornecedor_id: cotFornecedorData.id,
          fornecedor_id: cotFornecedorData.fornecedor_id,
          item_id: item.id,
          item_descricao: item.descricao,
          valor_unitario: parseFloat(resp.valor_unitario),
          valor_total: parseFloat(resp.valor_unitario) * item.quantidade,
          prazo_entrega_dias: parseInt(resp.prazo_entrega) || null,
          observacoes: resp.observacoes || ''
        };

        if (respostaExistente.length > 0) {
          await base44.asServiceRole.entities.CotacaoResposta.update(respostaExistente[0].id, respostaData);
        } else {
          await base44.asServiceRole.entities.CotacaoResposta.create(respostaData);
        }
      }

      // Verificar se respondeu todos os itens
      const todosRespondidos = itens.every(i => respostas[i.id]?.valor_unitario);
      const novoStatus = todosRespondidos ? 'Respondida Totalmente' : 'Respondida Parcialmente';

      await base44.asServiceRole.entities.CotacaoFornecedor.update(cotFornecedorData.id, {
        status: novoStatus,
        data_resposta: new Date().toISOString()
      });

      // Verificar se todos os fornecedores responderam
      const todosFornecedores = await base44.asServiceRole.entities.CotacaoFornecedor.filter({ cotacao_id: cotacaoId });
      const todosResponderam = todosFornecedores.every(cf =>
        cf.id === cotFornecedorData.id
          ? true
          : cf.status === 'Respondida Totalmente' || cf.status === 'Respondida Parcialmente' || cf.status === 'Impossível Responder'
      );

      if (todosResponderam) {
        await base44.asServiceRole.entities.Cotacao.update(cotacaoId, { status: 'Respostas Recebidas' });
      }

      return Response.json({ success: true });
    }

    return Response.json({ error: 'Ação não reconhecida' }, { status: 400 });

  } catch (error) {
    console.error('Erro ao salvar resposta fornecedor:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});