import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Função para gerar senha temporária
function gerarSenhaTemporaria() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let senha = '';
  for (let i = 0; i < 8; i++) {
    senha += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return senha;
}

// Hash SHA-256
async function hashSenha(senha) {
  const encoder = new TextEncoder();
  const data = encoder.encode(senha);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return Response.json({ error: 'Método não permitido' }, { status: 405 });
    }

    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { usuario_email } = body;

    if (!usuario_email) {
      return Response.json({ error: 'Email do usuário é obrigatório' }, { status: 400 });
    }

    const emailNormalizado = usuario_email.toLowerCase().trim();
    console.log('[REDEFINI SENHA] Procurando usuário:', emailNormalizado);

    // Gerar nova senha temporária
    const senhaTemporaria = gerarSenhaTemporaria();
    const senhaHash = await hashSenha(senhaTemporaria);

    // Buscar em UsuarioEmpresa para obter dados do usuário
    const usuariosEmpresa = await base44.asServiceRole.entities.UsuarioEmpresa.filter({
      usuario_email: emailNormalizado
    });

    console.log('[REDEFINI SENHA] Encontrados em UsuarioEmpresa:', usuariosEmpresa.length);

    let nomeUsuario = 'Usuário';
    let usuarioEncontrado = false;

    if (usuariosEmpresa.length > 0) {
      nomeUsuario = usuariosEmpresa[0].nome_completo || 'Usuário';
      usuarioEncontrado = true;
    }

    // Buscar ou criar/atualizar UsuarioCustom (onde o login verifica a senha!)
    const usuariosCustom = await base44.asServiceRole.entities.UsuarioCustom.filter({
      email: emailNormalizado
    });

    console.log('[REDEFINI SENHA] Encontrados em UsuarioCustom:', usuariosCustom.length);

    if (usuariosCustom.length > 0) {
      // Atualizar senha no UsuarioCustom existente
      await base44.asServiceRole.entities.UsuarioCustom.update(usuariosCustom[0].id, {
        senha_hash: senhaHash
      });
      if (!usuarioEncontrado) {
        nomeUsuario = usuariosCustom[0].nome_completo || 'Usuário';
      }
      usuarioEncontrado = true;
      console.log('[REDEFINI SENHA] Senha atualizada em UsuarioCustom existente');
    } else if (usuariosEmpresa.length > 0) {
      // Criar UsuarioCustom com a nova senha (ele não tinha ainda)
      const vinculo = usuariosEmpresa[0];
      await base44.asServiceRole.entities.UsuarioCustom.create({
        email: emailNormalizado,
        senha_hash: senhaHash,
        nome_completo: vinculo.nome_completo || 'Usuário',
        empresa_id: vinculo.empresa_id,
        perfil: vinculo.perfil || 'Gestor',
        is_super_admin: false,
        ativo: true
      });
      console.log('[REDEFINI SENHA] Novo UsuarioCustom criado com senha');
    } else {
      return Response.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    console.log('[REDEFINI SENHA] Senha atualizada. Enviando email para:', emailNormalizado);

    // Garantir que usuário existe como nativo Base44
    try {
      await base44.asServiceRole.users.inviteUser(emailNormalizado, 'user');
    } catch (inviteError) {
      console.log('Invite já existente:', inviteError.message);
    }

    // Enviar email via Base44
    await base44.asServiceRole.integrations.Core.SendEmail({
      to: emailNormalizado,
      subject: 'Sua senha foi redefinida - SIGO OBRAS',
      body: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #f59e0b 0%, #ea580c 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">SIGO OBRAS</h1>
          </div>
          <div style="background: #f8fafc; padding: 30px; border-radius: 0 0 10px 10px;">
            <h2 style="color: #1e293b; margin-top: 0;">Senha Redefinida</h2>
            <p style="color: #475569; line-height: 1.6;">Olá, <strong>${nomeUsuario}</strong>!</p>
            <p style="color: #475569; line-height: 1.6;">Sua senha foi redefinida por um administrador. Use a senha temporária abaixo para fazer login:</p>
            <div style="text-align: center; margin: 30px 0; background: white; padding: 20px; border-radius: 8px; border: 2px dashed #f59e0b;">
              <p style="margin: 0 0 8px 0; color: #64748b; font-size: 13px;">Sua nova senha temporária:</p>
              <p style="margin: 0; font-size: 30px; font-weight: bold; color: #1e293b; letter-spacing: 5px;">${senhaTemporaria}</p>
            </div>
            <p style="color: #475569; line-height: 1.6;">Após fazer login, acesse <strong>Configurações → Meu Perfil</strong> para alterar sua senha.</p>
          </div>
        </div>
      `
    });
    console.log('[EMAIL] Enviado com sucesso para:', emailNormalizado);

    return Response.json({
      success: true,
      message: 'Senha redefinida com sucesso. Nova senha enviada por email.',
      debug: {
        usuario_encontrado: usuarioEncontrado,
        nome: nomeUsuario,
        email: emailNormalizado
      }
    });
  } catch (error) {
    console.error('Erro ao redefinir senha:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});