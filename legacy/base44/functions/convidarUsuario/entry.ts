import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

function gerarTokenConvite() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { email, nome_completo, telefone, empresa_id, perfil, permissoes, projeto_id, projeto_nome } = await req.json();

    if (!email || !empresa_id) {
      return Response.json({ error: 'Email e empresa são obrigatórios' }, { status: 400 });
    }

    // Verificar se usuário já existe nesta empresa
    const existentes = await base44.asServiceRole.entities.UsuarioEmpresa.filter({
      usuario_email: email.toLowerCase(),
      empresa_id: empresa_id
    });

    if (existentes.length > 0) {
      return Response.json({ error: 'Usuário já cadastrado nesta empresa' }, { status: 400 });
    }

    // Gerar token de convite
    const token = gerarTokenConvite();
    const expiraEm = new Date();
    expiraEm.setDate(expiraEm.getDate() + 7); // Expira em 7 dias

    // Criar usuário com status pendente
    await base44.asServiceRole.entities.UsuarioEmpresa.create({
      usuario_email: email.toLowerCase(),
      nome_completo: nome_completo || '',
      telefone: telefone || '',
      empresa_id,
      perfil: perfil || 'Gestor',
      permissoes: permissoes ? JSON.stringify(permissoes) : null,
      projeto_id: projeto_id || null,
      projeto_nome: projeto_nome || null,
      ativo: false, // Inativo até definir senha
      reset_token: token,
      reset_token_expira: expiraEm.toISOString()
    });

    // Buscar dados da empresa
    const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: empresa_id });
    const empresa = empresas[0];

    // Enviar email de convite
    const appUrl = Deno.env.get('BASE44_APP_URL') || `https://${req.headers.get('host') || 'sigoobras.com'}`;
    const linkConvite = `${appUrl}/PrimeiroAcesso?token=${token}`;
    
    const emailBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #f59e0b;">Bem-vindo ao SIGO OBRAS</h2>
        <p>Olá${nome_completo ? ' ' + nome_completo : ''},</p>
        <p>Você foi convidado para fazer parte da empresa <strong>${empresa?.nome || 'nossa empresa'}</strong> no sistema SIGO OBRAS.</p>
        <p>Para concluir seu cadastro e criar sua senha, clique no botão abaixo:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${linkConvite}" style="background-color: #f59e0b; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Criar Minha Senha
          </a>
        </div>
        <p style="color: #666; font-size: 14px;">Este link expira em 7 dias.</p>
        <p style="color: #666; font-size: 14px;">Se você não solicitou este convite, ignore este email.</p>
      </div>
    `;

    await base44.asServiceRole.integrations.Core.SendEmail({
      to: email,
      from_name: empresa?.nome || 'SIGO OBRAS',
      subject: `Convite para ${empresa?.nome || 'SIGO OBRAS'}`,
      body: emailBody
    });

    return Response.json({ 
      success: true,
      message: 'Convite enviado com sucesso'
    });
  } catch (error) {
    console.error('Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});