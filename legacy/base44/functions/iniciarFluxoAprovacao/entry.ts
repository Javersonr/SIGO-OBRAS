import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const { solicitacao_id, empresa_id } = await req.json();

    try {
        if (!solicitacao_id || !empresa_id) {
            return new Response(JSON.stringify({ success: false, error: 'Dados obrigatórios faltando' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

        // Buscar solicitação para notificar
        const solicitacoes = await base44.asServiceRole.entities.SolicitacaoCompra.filter({ id: solicitacao_id });
        
        if (!solicitacoes || solicitacoes.length === 0) {
            return new Response(JSON.stringify({ success: false, error: 'Solicitação não encontrada' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
        }

        // Criar record de aprovação
        const aprovacao = await base44.asServiceRole.entities.AprovacaoSolicitacao.create({
            solicitacao_id,
            status: 'Pendente',
            empresa_id
        });

        return new Response(JSON.stringify({ success: true, aprovacao_id: aprovacao.id }), { headers: { 'Content-Type': 'application/json' } });

    } catch (error) {
        console.error('Erro:', error);
        return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
});