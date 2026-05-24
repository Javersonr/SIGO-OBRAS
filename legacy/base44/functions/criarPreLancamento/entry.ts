import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const payload = await req.json();
    const {
      empresa_id,
      comprovante_url,
      dados_extraidos,
      projeto_id,
      projeto_nome,
      conta_financeira_id,
      usuario_email_override
    } = payload;

    if (!empresa_id || !comprovante_url || !dados_extraidos) {
      return Response.json({ error: 'Dados obrigatórios faltando' }, { status: 400 });
    }

    // Tentar obter email do usuário autenticado (pode falhar com auth customizada)
    let userEmail = usuario_email_override || '';
    try {
      const user = await base44.auth.me();
      if (user?.email) userEmail = usuario_email_override || user.email;
    } catch (e) {}

    const preLancamento = await base44.asServiceRole.entities.PreLancamento.create({
      empresa_id,
      usuario_email: userEmail,
      comprovante_url,
      dados_extraidos: JSON.stringify(dados_extraidos),
      status: 'Pendente',
      projeto_id: projeto_id || '',
      projeto_nome: projeto_nome || '',
      conta_financeira_id: conta_financeira_id || '',
      offline: false
    });

    try {
      await base44.asServiceRole.entities.AuditLog.create({
        empresa_id,
        usuario_email: userEmail,
        tipo_acao: 'criar',
        entidade: 'PreLancamento',
        entidade_id: preLancamento.id,
        entidade_nome: `Pré-Lançamento - ${dados_extraidos.fornecedor || ''}`,
        descricao: `Pré-lançamento criado com valor R$ ${dados_extraidos.valor || 0}`,
        modulo: 'Financeiro',
        status: 'sucesso'
      });
    } catch (auditError) {
      console.error('Erro ao registrar audit log:', auditError);
    }

    return Response.json({
      sucesso: true,
      preLancamento: {
        id: preLancamento.id,
        status: preLancamento.status,
        valor: dados_extraidos.valor,
        fornecedor: dados_extraidos.fornecedor
      }
    });
  } catch (error) {
    console.error('Erro ao criar pré-lançamento:', error);
    return Response.json({ error: 'Erro ao criar pré-lançamento: ' + error.message }, { status: 500 });
  }
});