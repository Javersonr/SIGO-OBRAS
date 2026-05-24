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
    const { email, senha, nome_completo, empresa_id, perfil } = await req.json();

    if (!email || !senha || !nome_completo || !empresa_id) {
      return Response.json({ error: 'Dados incompletos' }, { status: 400 });
    }

    if (senha.length < 6) {
      return Response.json({ error: 'Senha deve ter no mínimo 6 caracteres' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);
    
    // Verificar se email já existe
    const usuariosExistentes = await base44.asServiceRole.entities.UsuarioEmpresa.filter({ 
      usuario_email: email.toLowerCase() 
    });

    if (usuariosExistentes.length > 0) {
      return Response.json({ error: 'Email já cadastrado' }, { status: 400 });
    }

    // Criar usuário
    const senhaHash = await hashPassword(senha);
    const novoUsuario = await base44.asServiceRole.entities.UsuarioEmpresa.create({
      usuario_email: email.toLowerCase(),
      senha_hash: senhaHash,
      nome_completo,
      empresa_id,
      perfil: perfil || 'Gestor',
      ativo: true
    });

    return Response.json({
      success: true,
      usuario: {
        id: novoUsuario.id,
        email: novoUsuario.usuario_email,
        nome_completo: novoUsuario.nome_completo
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});