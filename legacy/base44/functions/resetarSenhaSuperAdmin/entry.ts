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
    const body = await req.json();
    const { email, nova_senha } = body;

    if (!email || !nova_senha) {
      return Response.json({ 
        success: false,
        error: 'Email e nova senha são obrigatórios' 
      }, { status: 400 });
    }

    if (nova_senha.length < 6) {
      return Response.json({ 
        success: false,
        error: 'A senha deve ter no mínimo 6 caracteres' 
      }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);
    const emailNormalizado = email.toLowerCase().trim();

    // Buscar super admin
    const usuarios = await base44.asServiceRole.entities.UsuarioCustom.filter({
      email: emailNormalizado,
      is_super_admin: true
    });

    if (usuarios.length === 0) {
      return Response.json({ 
        success: false,
        error: 'Super admin não encontrado' 
      }, { status: 404 });
    }

    const usuario = usuarios[0];
    const novoHash = await hashPassword(nova_senha);

    // Atualizar senha
    await base44.asServiceRole.entities.UsuarioCustom.update(usuario.id, {
      senha_hash: novoHash
    });

    return Response.json({
      success: true,
      message: 'Senha do super admin atualizada com sucesso',
      hash_gerado: novoHash
    });

  } catch (error) {
    console.error('Erro ao resetar senha:', error);
    return Response.json({ 
      success: false,
      error: 'Erro ao processar: ' + error.message 
    }, { status: 500 });
  }
});