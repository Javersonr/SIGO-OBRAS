import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { integracao_id } = await req.json();

    if (!integracao_id) {
      return Response.json({ error: 'integracao_id é obrigatório' }, { status: 400 });
    }

    // Buscar integração
    const integracoes = await base44.asServiceRole.entities.IntegracaoBancaria.filter({
      id: integracao_id
    });

    if (integracoes.length === 0) {
      return Response.json({ error: 'Integração não encontrada' }, { status: 404 });
    }

    const integracao = integracoes[0];

    // Em produção, aqui você faria a chamada para a API do banco via Open Finance
    // Por exemplo:
    // const response = await fetch('https://api.banco.com.br/transacoes', {
    //   headers: {
    //     'Authorization': `Bearer ${integracao.token_acesso}`,
    //     'Content-Type': 'application/json'
    //   }
    // });
    // const transacoesBanco = await response.json();

    // Para demonstração, vamos simular algumas transações
    const transacoesSimuladas = [
      {
        data: new Date().toISOString().split('T')[0],
        descricao: 'PIX RECEBIDO CLIENTE XYZ',
        valor: 1500.00,
        tipo: 'credito'
      },
      {
        data: new Date(Date.now() - 86400000).toISOString().split('T')[0],
        descricao: 'PAGAMENTO FORNECEDOR ABC',
        valor: 850.00,
        tipo: 'debito'
      }
    ];

    let novasTransacoes = 0;

    // Processar transações e aplicar regras de categorização
    for (const transacao of transacoesSimuladas) {
      // Buscar regras de categorização
      const regras = await base44.asServiceRole.entities.RegraConciliacao.filter({
        empresa_id: integracao.empresa_id,
        ativo: true
      });

      // Ordenar por prioridade
      regras.sort((a, b) => (b.prioridade || 5) - (a.prioridade || 5));

      let categoriaId = null;
      let categoriaNome = null;
      let fornecedorId = null;
      let fornecedorNome = null;
      let clienteId = null;
      let clienteNome = null;
      let centroCustoId = null;
      let centroCustoNome = null;
      let projetoId = null;
      let projetoNome = null;

      // Aplicar regras
      for (const regra of regras) {
        let match = true;

        // Verificar tipo
        if (regra.tipo !== 'Ambos') {
          const tipoTransacao = transacao.tipo === 'credito' ? 'Receita' : 'Despesa';
          if (regra.tipo !== tipoTransacao) continue;
        }

        // Verificar texto
        if (regra.contem_texto) {
          if (!transacao.descricao.toLowerCase().includes(regra.contem_texto.toLowerCase())) {
            match = false;
          }
        }

        if (regra.nao_contem_texto) {
          if (transacao.descricao.toLowerCase().includes(regra.nao_contem_texto.toLowerCase())) {
            match = false;
          }
        }

        // Verificar valor
        if (regra.valor_minimo && transacao.valor < regra.valor_minimo) {
          match = false;
        }

        if (regra.valor_maximo && transacao.valor > regra.valor_maximo) {
          match = false;
        }

        if (match) {
          categoriaId = regra.categoria_id;
          categoriaNome = regra.categoria_nome;
          fornecedorId = regra.fornecedor_id;
          fornecedorNome = regra.fornecedor_nome;
          clienteId = regra.cliente_id;
          clienteNome = regra.cliente_nome;
          centroCustoId = regra.centro_custo_id;
          centroCustoNome = regra.centro_custo_nome;
          projetoId = regra.projeto_id;
          projetoNome = regra.projeto_nome;

          // Atualizar contador de aplicações
          await base44.asServiceRole.entities.RegraConciliacao.update(regra.id, {
            aplicacoes: (regra.aplicacoes || 0) + 1
          });

          break; // Usar apenas a primeira regra que corresponder
        }
      }

      // Se não encontrou categoria, tentar usar IA
      if (!categoriaId) {
        try {
          const resultado = await base44.asServiceRole.integrations.Core.InvokeLLM({
            prompt: `Analise esta transação bancária e sugira a categoria mais apropriada:
            Descrição: ${transacao.descricao}
            Valor: R$ ${transacao.valor}
            Tipo: ${transacao.tipo === 'credito' ? 'Receita' : 'Despesa'}
            
            Responda apenas com o nome da categoria, escolha entre: Vendas, Serviços, Salários, Fornecedores, Impostos, Aluguel, Utilidades, Marketing, Outros`,
            response_json_schema: {
              type: 'object',
              properties: {
                categoria: { type: 'string' },
                confianca: { type: 'number' }
              }
            }
          });

          if (resultado.confianca > 0.7) {
            // Buscar ou criar categoria
            const categorias = await base44.asServiceRole.entities.CategoriaFinanceira.filter({
              empresa_id: integracao.empresa_id,
              nome: resultado.categoria
            });

            if (categorias.length > 0) {
              categoriaId = categorias[0].id;
              categoriaNome = categorias[0].nome;
            }
          }
        } catch (error) {
          console.error('Erro ao usar IA para categorização:', error);
        }
      }

      // Criar transação financeira
      await base44.asServiceRole.entities.TransacaoFinanceira.create({
        empresa_id: integracao.empresa_id,
        conta_id: integracao.conta_id,
        tipo: transacao.tipo === 'credito' ? 'Receita' : 'Despesa',
        descricao: transacao.descricao,
        valor: transacao.valor,
        data: transacao.data,
        data_vencimento: transacao.data,
        status: 'pago',
        categoria_id: categoriaId,
        categoria_nome: categoriaNome,
        fornecedor_id: fornecedorId,
        fornecedor_nome: fornecedorNome,
        cliente_id: clienteId,
        cliente_nome: clienteNome,
        centro_custo_id: centroCustoId,
        centro_custo_nome: centroCustoNome,
        projeto_id: projetoId,
        projeto_nome: projetoNome,
        referencia_tipo: 'OFX',
        conciliado: true
      });

      novasTransacoes++;
    }

    return Response.json({
      success: true,
      novasTransacoes,
      message: `${novasTransacoes} transações importadas e categorizadas`
    });

  } catch (error) {
    console.error('Erro ao sincronizar conta:', error);
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});