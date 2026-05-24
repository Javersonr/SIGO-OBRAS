import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      empresa_id,
      tipo_acao,
      entidade,
      entidade_id,
      descricao,
      dados_anteriores,
      dados_novos,
      status = 'sucesso',
      mensagem_erro
    } = body;

    // Validações básicas
    if (!empresa_id || !tipo_acao || !entidade || !descricao) {
      return Response.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Criar registro de auditoria
    const auditLog = await base44.entities.AuditLog.create({
      empresa_id,
      usuario_email: user.email,
      usuario_nome: user.full_name,
      tipo_acao,
      entidade,
      entidade_id: entidade_id || null,
      descricao,
      dados_anteriores: dados_anteriores ? JSON.stringify(dados_anteriores) : null,
      dados_novos: dados_novos ? JSON.stringify(dados_novos) : null,
      endereco_ip: req.headers.get('x-forwarded-for') || 'unknown',
      user_agent: req.headers.get('user-agent') || 'unknown',
      timestamp: new Date().toISOString(),
      status,
      mensagem_erro: mensagem_erro || null
    });

    return Response.json({ success: true, auditLog });
  } catch (error) {
    console.error('Erro ao registrar audit log:', error);
    return Response.json(
      { error: error.message },
      { status: 500 }
    );
  }
});