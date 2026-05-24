import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const { decisao, solicitacao_id, empresa_id } = await req.json();

    try {
        if (!decisao || !solicitacao_id) {
            return new Response(JSON.stringify({ success: false, error: 'Dados obrigatórios faltando' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

        const novoStatus = decisao === 'Rejeitado' ? 'Rejeitada' : 'Em Cotação';
        await base44.asServiceRole.entities.SolicitacaoCompra.update(solicitacao_id, { status: novoStatus });

        // Buscar solicitação para notificar
        const solicitacoes = await base44.asServiceRole.entities.SolicitacaoCompra.filter({ 
          id: solicitacao_id 
        });

        if (solicitacoes.length > 0) {
          const solicitacao = solicitacoes[0];
          
          try {
            // Notificar solicitante
            await base44.asServiceRole.functions.invoke('enviarNotificacao', {
              empresa_id,
              usuarios_emails: [solicitacao.solicitante_email],
              tipo_notificacao: decisao === 'Rejeitado' ? 'solicitacao_rejeitada' : 'solicitacao_aprovada',
              dados: {
                numero: solicitacao.numero,
                projeto_nome: solicitacao.projeto_nome,
                motivo: decisao === 'Rejeitado' ? 'Solicitação não aprovada' : ''
              }
            });
          } catch (error) {
            console.error('Erro ao enviar notificação:', error);
          }
        }

        // Se aprovado, criar cotação automática
        if (novoStatus === 'Em Cotação') {
            try {
                const itens = await base44.asServiceRole.entities.SolicitacaoCompraItem.filter({ solicitacao_id });
                const solicitacoes = await base44.asServiceRole.entities.SolicitacaoCompra.filter({ id: solicitacao_id });
                
                if (solicitacoes.length > 0 && itens.length > 0) {
                    const sol = solicitacoes[0];
                    const numeroAno = new Date().getFullYear();
                    const cotacoes = await base44.asServiceRole.entities.Cotacao.filter({ empresa_id });
                    const numero = `COT${numeroAno}-${String(cotacoes.length + 1).padStart(4, '0')}`;
                    
                    const cotacao = await base44.asServiceRole.entities.Cotacao.create({
                        empresa_id,
                        numero,
                        solicitacao_id,
                        solicitacao_numero: sol.numero,
                        projeto_id: sol.projeto_id,
                        projeto_nome: sol.projeto_nome,
                        status: 'Aberta',
                        total_fornecedores: 0
                    });

                    await Promise.all(itens.map(item =>
                        base44.asServiceRole.entities.CotacaoItem.create({
                            empresa_id,
                            cotacao_id: cotacao.id,
                            solicitacao_item_id: item.id,
                            descricao: item.descricao,
                            quantidade: item.quantidade,
                            unidade: item.unidade
                        })
                    ));
                }
            } catch (e) {
                console.error('Erro ao criar cotação automática:', e);
            }
        }

        return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });

    } catch (error) {
        console.error('Erro:', error);
        return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
});