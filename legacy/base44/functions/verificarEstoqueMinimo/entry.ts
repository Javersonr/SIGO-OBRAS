import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { movimento_id, empresa_id } = await req.json();

    if (!movimento_id || !empresa_id) {
      return Response.json({ error: 'movimento_id e empresa_id são obrigatórios' }, { status: 400 });
    }

    // Buscar o movimento de estoque
    const movimentos = await base44.entities.EstoqueMovimento.filter({
      id: movimento_id,
      empresa_id
    });

    if (movimentos.length === 0) {
      return Response.json({ error: 'Movimento não encontrado' }, { status: 404 });
    }

    const movimento = movimentos[0];

    // Buscar o material
    const materiais = await base44.entities.Material.filter({
      id: movimento.material_id,
      empresa_id
    });

    if (materiais.length === 0) {
      return Response.json({ error: 'Material não encontrado' }, { status: 404 });
    }

    const material = materiais[0];

    // Verificar se estoque atingiu o mínimo
    const saldoAtual = material.estoque || 0;
    const estoqueMinimo = material.estoque_minimo || 0;

    if (saldoAtual <= estoqueMinimo) {
      // Criar solicitação de compra automática
      const quantidadeComSecao = Math.ceil(estoqueMinimo * 1.5);

      const solicitacao = await base44.entities.SolicitacaoCompra.create({
        empresa_id,
        numero: `SC-${Date.now()}`,
        status: 'Pendente Aprovação',
        prioridade: 'Alta',
        total_itens: 1,
        observacoes: `Solicitação automática - Material ${material.nome} atingiu estoque mínimo`
      });

      // Criar item da solicitação
      await base44.entities.SolicitacaoCompraItem.create({
        empresa_id,
        solicitacao_id: solicitacao.id,
        material_id: material.id,
        material_codigo: material.codigo,
        descricao: material.nome,
        quantidade: quantidadeComSecao,
        unidade: material.unidade,
        observacoes: `Estoque atual: ${saldoAtual}. Mínimo: ${estoqueMinimo}`
      });

      return Response.json({
        success: true,
        message: 'Solicitação de compra criada automaticamente',
        solicitacao_id: solicitacao.id,
        quantidade: quantidadeComSecao
      });
    }

    return Response.json({
      success: true,
      message: 'Estoque acima do mínimo',
      saldo_atual: saldoAtual,
      estoque_minimo: estoqueMinimo
    });
  } catch (error) {
    console.error('Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});