import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

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
    const { usuario_email, nome_completo, empresa_id, senha, apenas_senha } = body;

    if (!usuario_email || !senha) {
      return Response.json({ error: 'Email e senha são obrigatórios' }, { status: 400 });
    }

    const senhaHash = await hashSenha(senha);

    // Modo: apenas atualizar senha de usuário existente
    if (apenas_senha) {
      if (!usuario_email) {
        return Response.json({ error: 'Email é obrigatório' }, { status: 400 });
      }

      const existing = await base44.asServiceRole.entities.UsuarioCustom.filter({ email: usuario_email });
      if (existing.length === 0) {
        // Se usuário não existe em UsuarioCustom, criar com a senha
        const novoUsuario = await base44.asServiceRole.entities.UsuarioCustom.create({
          email: usuario_email,
          nome_completo: usuario_email.split('@')[0],
          empresa_id: '00000000-0000-0000-0000-000000000000',
          senha_hash: senhaHash,
          is_super_admin: false,
          ativo: true
        });
        return Response.json({ success: true, message: 'Senha definida com sucesso', usuarioCustomId: novoUsuario.id });
      }

      await base44.asServiceRole.entities.UsuarioCustom.update(existing[0].id, {
        senha_hash: senhaHash
      });
      return Response.json({ success: true, message: 'Senha atualizada com sucesso' });
    }

    // Modo: criar novo usuário
    if (!nome_completo || !empresa_id) {
      return Response.json({ error: 'Dados obrigatórios faltando' }, { status: 400 });
    }

    // Verificar se usuário já existe
    const existing = await base44.asServiceRole.entities.UsuarioCustom.filter({ email: usuario_email });

    if (existing.length > 0) {
      // Já existe, apenas atualiza a senha
      await base44.asServiceRole.entities.UsuarioCustom.update(existing[0].id, {
        senha_hash: senhaHash,
        ativo: true
      });
      return Response.json({ success: true, message: 'Senha atualizada para usuário existente', usuarioCustomId: existing[0].id });
    }

    // Criar UsuarioCustom com a senha definida pelo admin
    const usuarioCustom = await base44.asServiceRole.entities.UsuarioCustom.create({
      email: usuario_email,
      nome_completo: nome_completo,
      empresa_id: empresa_id,
      senha_hash: senhaHash,
      is_super_admin: false,
      ativo: true
    });

    // Convidar como usuário nativo da Base44
    try {
      await base44.asServiceRole.users.inviteUser(usuario_email, 'user');
    } catch (inviteError) {
      console.log('Invite já existente ou erro ignorado:', inviteError.message);
    }

    return Response.json({
      success: true,
      message: 'Usuário criado com sucesso.',
      usuarioCustomId: usuarioCustom.id
    });
  } catch (error) {
    console.error('Erro ao criar usuário:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});