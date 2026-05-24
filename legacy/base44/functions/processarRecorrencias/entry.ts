import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Verificar autenticação de admin
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const hoje = new Date().toISOString().split('T')[0];
    let geradas = 0;
    let erros = 0;

    // Buscar todas as recorrências ativas que precisam ser geradas
    const recorrencias = await base44.asServiceRole.entities.TransacaoRecorrente.filter({
      ativo: true
    });

    for (const rec of recorrencias) {
      try {
        // Verificar se já passou da data de fim
        if (rec.data_fim && rec.data_fim < hoje) {
          await base44.asServiceRole.entities.TransacaoRecorrente.update(rec.id, {
            ativo: false
          });
          continue;
        }

        // Verificar se precisa gerar hoje
        if (!rec.proxima_geracao || rec.proxima_geracao <= hoje) {
          // Criar a transação
          await base44.asServiceRole.entities.TransacaoFinanceira.create({
            empresa_id: rec.empresa_id,
            tipo: rec.tipo,
            descricao: rec.descricao,
            valor: rec.valor,
            conta_id: rec.conta_id,
            conta_nome: rec.conta_nome,
            categoria_id: rec.categoria_id || null,
            categoria_nome: rec.categoria_nome || null,
            fornecedor_id: rec.fornecedor_id || null,
            fornecedor_nome: rec.fornecedor_nome || null,
            cliente_id: rec.cliente_id || null,
            cliente_nome: rec.cliente_nome || null,
            projeto_id: rec.projeto_id || null,
            projeto_nome: rec.projeto_nome || null,
            oportunidade_id: rec.oportunidade_id || null,
            oportunidade_nome: rec.oportunidade_nome || null,
            forma_pagamento: rec.forma_pagamento || null,
            observacoes: rec.observacoes || null,
            data_vencimento: rec.proxima_geracao || hoje,
            data: rec.proxima_geracao || hoje,
            status: 'em_aberto'
          });

          // Calcular próxima data de geração
          let proximaData = new Date(rec.proxima_geracao || rec.data_inicio);
          
          switch (rec.frequencia) {
            case 'diaria':
              proximaData.setDate(proximaData.getDate() + 1);
              break;
            case 'semanal':
              proximaData.setDate(proximaData.getDate() + 7);
              break;
            case 'mensal':
              proximaData.setMonth(proximaData.getMonth() + 1);
              if (rec.dia_vencimento) {
                proximaData.setDate(rec.dia_vencimento);
              }
              break;
            case 'anual':
              proximaData.setFullYear(proximaData.getFullYear() + 1);
              break;
          }

          // Atualizar próxima geração
          await base44.asServiceRole.entities.TransacaoRecorrente.update(rec.id, {
            proxima_geracao: proximaData.toISOString().split('T')[0]
          });

          geradas++;
        }
      } catch (error) {
        console.error(`Erro ao processar recorrência ${rec.id}:`, error);
        erros++;
      }
    }

    return Response.json({
      sucesso: true,
      geradas,
      erros,
      processadas: recorrencias.length
    });
  } catch (error) {
    console.error('Erro ao processar recorrências:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});