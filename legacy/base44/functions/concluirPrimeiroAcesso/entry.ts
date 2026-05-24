import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  try {
    const { token, senha } = await req.json();

    if (!token || !senha) {
      return Response.json({ error: 'Dados incompletos' }, { status: 400 });
    }

    if (senha.length < 6) {
      return Response.json({ error: 'Senha deve ter no mínimo 6 caracteres' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);

    // Buscar usuário com este token
    const usuarios = await base44.asServiceRole.entities.UsuarioEmpresa.filter({
      reset_token: token
    });

    if (usuarios.length === 0) {
      return Response.json({ 
        success: false,
        error: 'Token não encontrado'
      });
    }

    const usuario = usuarios[0];

    // Verificar se token expirou
    const agora = new Date();
    const expiracao = new Date(usuario.reset_token_expira);

    if (agora > expiracao) {
      return Response.json({ 
        success: false,
        error: 'Link expirado. Solicite um novo convite.'
      });
    }

    // Criar hash da senha
    const senhaHash = await hashPassword(senha);

    // Atualizar usuário com senha e ativar
    await base44.asServiceRole.entities.UsuarioEmpresa.update(usuario.id, {
      ativo: true,
      reset_token: null,
      reset_token_expira: null
    });

    // BUG FIX: O login verifica senha em UsuarioCustom, não em UsuarioEmpresa.
    // Criar ou atualizar UsuarioCustom com a senha definida.
    const usuariosCustom = await base44.asServiceRole.entities.UsuarioCustom.filter({
      email: usuario.usuario_email
    });

    if (usuariosCustom.length > 0) {
      await base44.asServiceRole.entities.UsuarioCustom.update(usuariosCustom[0].id, {
        senha_hash: senhaHash,
        ativo: true
      });
    } else {
      await base44.asServiceRole.entities.UsuarioCustom.create({
        email: usuario.usuario_email,
        nome_completo: usuario.nome_completo || usuario.usuario_email.split('@')[0],
        empresa_id: usuario.empresa_id,
        senha_hash: senhaHash,
        is_super_admin: false,
        ativo: true
      });
    }

    return Response.json({
      success: true,
      message: 'Senha criada com sucesso!'
    });
  } catch (error) {
    console.error('Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});