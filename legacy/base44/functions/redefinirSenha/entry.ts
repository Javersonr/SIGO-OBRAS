import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Função para hash SHA-256
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { token, nova_senha } = await req.json();

    if (!token || !nova_senha) {
      return Response.json({ 
        success: false, 
        error: 'Token e senha são obrigatórios' 
      }, { status: 400 });
    }

    if (nova_senha.length < 6) {
      return Response.json({ 
        success: false, 
        error: 'Senha deve ter pelo menos 6 caracteres' 
      }, { status: 400 });
    }

    // Buscar usuário pelo token
    const usuarios = await base44.asServiceRole.entities.UsuarioCustom.filter({ reset_token: token });

    if (usuarios.length === 0) {
      return Response.json({ success: false, error: 'Token inválido' }, { status: 400 });
    }

    const usuarioCustom = usuarios[0];
    const agora = new Date();
    const expira = new Date(usuarioCustom.reset_token_expira);

    if (agora > expira) {
      return Response.json({ success: false, error: 'Token expirado' }, { status: 400 });
    }

    // Hash da nova senha
    const senhaHash = await hashPassword(nova_senha);

    // Atualizar senha no UsuarioCustom
    await base44.asServiceRole.entities.UsuarioCustom.update(usuarioCustom.id, {
      senha_hash: senhaHash,
      reset_token: null,
      reset_token_expira: null
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error('Erro ao redefinir senha:', error);
    return Response.json({ 
      success: false, 
      error: 'Erro ao processar solicitação' 
    }, { status: 500 });
  }
});