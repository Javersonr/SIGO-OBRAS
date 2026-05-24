import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { cotacao_fornecedor_id } = await req.json();

    if (!cotacao_fornecedor_id) {
      return Response.json({ error: 'cotacao_fornecedor_id é obrigatório' }, { status: 400 });
    }

    // Buscar dados da cotação e fornecedor
    const cotacaoFornecedor = await base44.entities.CotacaoFornecedor.filter({ id: cotacao_fornecedor_id });
    
    if (cotacaoFornecedor.length === 0) {
      return Response.json({ error: 'Cotação não encontrada' }, { status: 404 });
    }

    const cf = cotacaoFornecedor[0];

    // Verificar se já respondeu
    if (cf.status === 'Respondida Totalmente') {
      return Response.json({ error: 'Fornecedor já respondeu esta cotação' }, { status: 400 });
    }

    // Buscar dados da cotação
    const cotacao = await base44.entities.Cotacao.filter({ id: cf.cotacao_id });
    if (cotacao.length === 0) {
      return Response.json({ error: 'Cotação não encontrada' }, { status: 404 });
    }

    // Buscar empresa
    const empresa = await base44.entities.Empresa.filter({ id: cf.empresa_id });
    if (empresa.length === 0) {
      return Response.json({ error: 'Empresa não encontrada' }, { status: 404 });
    }

    const linkCotacao = `${Deno.env.get('BASE_URL') || 'https://app.base44.com'}/AcessoFornecedor?token=${cf.token}`;

    const statusTexto = cf.status === 'Enviada' ? 'ainda não visualizou' : 'ainda não respondeu completamente';

    // Enviar email
    await base44.asServiceRole.integrations.Core.SendEmail({
      to: cf.fornecedor_email,
      subject: `LEMBRETE: Cotação Pendente - ${empresa[0].nome}`,
      body: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #f59e0b;">🔔 Lembrete: Cotação Pendente</h2>
          
          <p>Olá <strong>${cf.fornecedor_nome}</strong>,</p>
          
          <p>Este é um lembrete sobre a cotação <strong>#${cotacao[0].numero}</strong> da empresa <strong>${empresa[0].nome}</strong>.</p>
          
          <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0;"><strong>Status atual:</strong> ${cf.status}</p>
            <p style="margin: 5px 0 0 0;">Você ${statusTexto} esta cotação.</p>
          </div>
          
          ${cotacao[0].data_limite ? `
            <p><strong>⏰ Data Limite:</strong> ${new Date(cotacao[0].data_limite).toLocaleDateString('pt-BR')}</p>
          ` : ''}
          
          <p>Por favor, acesse o link abaixo para visualizar e responder:</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${linkCotacao}" 
               style="background: #f59e0b; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
              Acessar Cotação
            </a>
          </div>
          
          <p style="color: #666; font-size: 12px; margin-top: 30px;">
            Este é um email automático. Se você já respondeu, por favor desconsidere.
          </p>
        </div>
      `
    });

    // Atualizar data da última notificação
    await base44.asServiceRole.entities.CotacaoFornecedor.update(cf.id, {
      ultima_notificacao: new Date().toISOString()
    });

    return Response.json({ 
      success: true, 
      mensagem: 'Lembrete enviado com sucesso' 
    });
  } catch (error) {
    console.error('Erro ao enviar lembrete:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});