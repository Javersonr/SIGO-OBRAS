import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const { token } = await req.json();

    if (!token) {
      return Response.json({ error: 'Token não fornecido' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);

    // Buscar usuário com este token
    const usuarios = await base44.asServiceRole.entities.UsuarioEmpresa.filter({
      reset_token: token
    });

    if (usuarios.length === 0) {
      return Response.json({ 
        success: false,
        error: 'Token não encontrado ou já foi utilizado'
      });
    }

    const usuario = usuarios[0];

    // Verificar se token expirou
    const agora = new Date();
    const expiracao = new Date(usuario.reset_token_expira);

    if (agora > expiracao) {
      return Response.json({ 
        success: false,
        error: 'Este link de convite expirou. Solicite um novo convite.'
      });
    }

    return Response.json({
      success: true,
      usuario: {
        id: usuario.id,
        usuario_email: usuario.usuario_email,
        nome_completo: usuario.nome_completo,
        empresa_id: usuario.empresa_id
      }
    });
  } catch (error) {
    console.error('Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});