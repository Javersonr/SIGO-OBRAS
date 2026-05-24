import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { pedido_id, empresa_id, orcamento_url, nota_fiscal_url, recibo_url } = await req.json();

    if (!pedido_id || !empresa_id) {
      return Response.json({ error: 'pedido_id e empresa_id são obrigatórios' }, { status: 400 });
    }

    // Validar anexos obrigatórios
    if (!orcamento_url || !nota_fiscal_url || !recibo_url) {
      return Response.json({
        error: 'Anexos obrigatórios: orçamento assinado, nota fiscal e recibo',
        faltando: {
          orcamento: !orcamento_url,
          nota_fiscal: !nota_fiscal_url,
          recibo: !recibo_url
        }
      }, { status: 400 });
    }

    // Buscar pedido
    const pedidos = await base44.entities.PedidoCompra.filter({
      id: pedido_id,
      empresa_id
    });

    if (pedidos.length === 0) {
      return Response.json({ error: 'Pedido não encontrado' }, { status: 404 });
    }

    const pedido = pedidos[0];

    // Buscar fornecedor
    const fornecedores = await base44.entities.Fornecedor.filter({
      id: pedido.fornecedor_id,
      empresa_id
    });

    const fornecedor = fornecedores[0];

    // Buscar categorias financeiras
    const categorias = await base44.entities.CategoriaFinanceira.filter({
      empresa_id,
      tipo: 'Despesa'
    });

    let categoriaId = null;
    if (categorias.length > 0) {
      // Procurar categoria "Materiais" ou usar a primeira
      const catMateriais = categorias.find(c => c.nome.toLowerCase().includes('material'));
      categoriaId = catMateriais?.id || categorias[0].id;
    }

    // Criar despesa para pagamento
    const despesa = await base44.entities.TransacaoFinanceira.create({
      empresa_id,
      tipo: 'Despesa',
      categoria_id: categoriaId,
      descricao: `Pagamento Pedido ${pedido.numero} - ${fornecedor?.nome_razao || 'Fornecedor'}`,
      valor: pedido.total || 0,
      data: new Date().toISOString().split('T')[0],
      status: 'Pendente',
      referencia: `PED-${pedido.id}`,
      observacoes: `Pedido: ${pedido.numero}\nFornecedor: ${fornecedor?.nome_razao || ''}`
    });

    // Criar anexos da transação
    const anexos = [
      { nome: 'Orçamento Assinado', url: orcamento_url },
      { nome: 'Nota Fiscal', url: nota_fiscal_url },
      { nome: 'Recibo', url: recibo_url }
    ];

    for (const anexo of anexos) {
      await base44.entities.TransacaoAnexo.create({
        empresa_id,
        transacao_id: despesa.id,
        nome: anexo.nome,
        url: anexo.url,
        tipo: 'documento'
      });
    }

    // Atualizar status do pedido para Entregue
    await base44.entities.PedidoCompra.update(pedido.id, {
      status: 'Entregue',
      data_entrega: new Date().toISOString().split('T')[0]
    });

    return Response.json({
      success: true,
      message: 'Pedido finalizado e despesa criada com sucesso',
      despesa_id: despesa.id,
      pedido_status: 'Entregue',
      anexos_criados: anexos.length
    });
  } catch (error) {
    console.error('Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});