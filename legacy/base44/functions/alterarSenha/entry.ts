import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

async function hashSenha(senha) {
  const encoder = new TextEncoder();
  const data = encoder.encode(senha);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const { email, senha_atual, nova_senha } = await req.json();

    if (!senha_atual || !nova_senha) {
      return Response.json({ success: false, error: 'Todos os campos são obrigatórios' }, { status: 400 });
    }

    if (nova_senha.length < 6) {
      return Response.json({ success: false, error: 'A nova senha deve ter no mínimo 6 caracteres' }, { status: 400 });
    }

    // Buscar usuário no UsuarioCustom - buscar apenas por email
    const usuarios = await base44.asServiceRole.entities.UsuarioCustom.filter({
      email: email.toLowerCase().trim()
    });

    if (usuarios.length === 0) {
      // BUG FIX: Sem UsuarioCustom, não é possível verificar senha atual.
      // Não permitir alteração sem autenticação prévia.
      return Response.json({ success: false, error: 'Usuário não encontrado. Faça login novamente.' }, { status: 404 });
    }

    const usuario = usuarios[0];

    // Verificar senha atual
    const senhaAtualHash = await hashSenha(senha_atual);
    if (senhaAtualHash !== usuario.senha_hash) {
      return Response.json({ success: false, error: 'Senha atual incorreta' }, { status: 401 });
    }

    // Atualizar para nova senha
    const novaSenhaHash = await hashSenha(nova_senha);
    await base44.asServiceRole.entities.UsuarioCustom.update(usuario.id, {
      senha_hash: novaSenhaHash
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error('Erro ao alterar senha:', error);
    return Response.json({ 
      success: false, 
      error: 'Erro ao processar solicitação' 
    }, { status: 500 });
  }
});