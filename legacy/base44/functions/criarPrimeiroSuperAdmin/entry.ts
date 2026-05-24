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
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { email, nome_completo, senha } = body;

    // Validação
    if (!email || !nome_completo || !senha) {
      return Response.json({ 
        success: false,
        error: 'Email, nome e senha são obrigatórios' 
      }, { status: 400 });
    }

    // Verificar se JÁ EXISTE algum super admin
    const superAdminsExistentes = await base44.asServiceRole.entities.UsuarioCustom.filter({ 
      is_super_admin: true 
    });

    if (superAdminsExistentes.length > 0) {
      return Response.json({ 
        success: false,
        error: 'Já existe um super admin. Use a função normal para criar outros.' 
      }, { status: 400 });
    }

    // Verificar se email já existe
    const usuariosExistentes = await base44.asServiceRole.entities.UsuarioCustom.filter({ 
      email: email.toLowerCase().trim() 
    });

    if (usuariosExistentes.length > 0) {
      return Response.json({ 
        success: false,
        error: 'Email já cadastrado' 
      }, { status: 400 });
    }

    // Criar empresa dummy para o super admin
    const empresaDummy = await base44.asServiceRole.entities.Empresa.create({
      nome: 'Super Admin',
      razao_social: 'Super Admin',
      nome_fantasia: 'Super Admin',
      email: email,
      ativo: true
    });

    // Criar o primeiro super admin
    const senhaHash = await hashPassword(senha);
    
    await base44.asServiceRole.entities.UsuarioCustom.create({
      email: email.toLowerCase().trim(),
      senha_hash: senhaHash,
      nome_completo: nome_completo,
      empresa_id: empresaDummy.id,
      perfil: 'Admin',
      is_super_admin: true,
      ativo: true
    });

    return Response.json({ 
      success: true,
      message: 'Primeiro super admin criado com sucesso!' 
    });

  } catch (error) {
    console.error('Erro ao criar primeiro super admin:', error);
    return Response.json({ 
      success: false,
      error: 'Erro ao criar super admin: ' + error.message 
    }, { status: 500 });
  }
});