import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

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
    const { email, senha } = body;

    console.log('=== DEBUG LOGIN ===');
    console.log('Email recebido:', email);

    if (!email || !senha) {
      return Response.json({ 
        success: false,
        error: 'Email e senha são obrigatórios' 
      }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);
    const emailNormalizado = email.toLowerCase().trim();
    const senhaHash = await hashPassword(senha);
    
    console.log('[Login] Email normalizado:', emailNormalizado);
    console.log('[Login] Senha hash calculada:', senhaHash.substring(0, 10) + '...');

    // BUSCAR TUDO EM PARALELO - UMA ÚNICA VEZ
    const [usuariosCustom, vinculos, clientes] = await Promise.all([
      base44.asServiceRole.entities.UsuarioCustom.filter({ email: emailNormalizado }),
      base44.asServiceRole.entities.UsuarioEmpresa.filter({ usuario_email: emailNormalizado, ativo: true }),
      base44.asServiceRole.entities.ClientePortalUsuario.filter({ email: emailNormalizado, ativo: true })
    ]);
    
    console.log('[Login] UsuariosCustom encontrados:', usuariosCustom.length);
    console.log('[Login] Vínculos UsuarioEmpresa encontrados:', vinculos.length);
    console.log('[Login] ClientePortalUsuario encontrados:', clientes.length);
    
    if (usuariosCustom.length > 0) {
      console.log('[Login] UsuarioCustom email:', usuariosCustom[0].email);
      console.log('[Login] UsuarioCustom senha_hash:', usuariosCustom[0].senha_hash ? usuariosCustom[0].senha_hash.substring(0, 10) + '...' : 'NULL');
      console.log('[Login] Senhas conferem?', usuariosCustom[0].senha_hash && senhaHash === usuariosCustom[0].senha_hash);
    }

    // Verificar se existe UsuarioCustom
    if (usuariosCustom.length > 0) {
      const usuarioCustom = usuariosCustom[0];
      
      // Verificar senha
      if (!usuarioCustom.senha_hash || senhaHash !== usuarioCustom.senha_hash) {
        return Response.json({ 
          success: false,
          error: 'Usuário ou senha incorretos' 
        }, { status: 200 });
      }

      // Super admin
      if (usuarioCustom.is_super_admin === true) {
        return Response.json({
          success: true,
          usuario: {
            id: usuarioCustom.id,
            email: usuarioCustom.email,
            nome_completo: usuarioCustom.nome_completo,
            perfil: 'Admin',
            tipo_usuario: 'super_admin',
            is_super_admin: true,
            empresa_id: usuarioCustom.empresa_id,
            empresa_nome: 'Super Admin'
          }
        });
      }
    }
    
    // Usuário normal
    if (vinculos.length === 0 && clientes.length === 0) {
      return Response.json({ 
        success: false,
        error: 'Usuário ou senha incorretos' 
      }, { status: 200 });
    }

    // Se tem vínculo mas não tem UsuarioCustom, ainda não tem senha definida
    if (vinculos.length > 0 && usuariosCustom.length === 0) {
      return Response.json({ 
        success: false,
        error: 'Usuário sem senha definida. Verifique seu email de convite para criar sua senha.' 
      }, { status: 200 });
    } else if (vinculos.length > 0 && usuariosCustom.length > 0) {
      // Verificar senha
      if (senhaHash !== usuariosCustom[0].senha_hash) {
        return Response.json({ 
          success: false,
          error: 'Usuário ou senha incorretos' 
        }, { status: 200 });
      }
    }

    // Processar vínculos de usuário
    if (vinculos.length > 0) {
      const empresasUnicas = [...new Set(vinculos.map(v => v.empresa_id))];
      
      // Múltiplas empresas
      if (empresasUnicas.length > 1) {
        const empresasList = await Promise.all(
          empresasUnicas.map(id => 
            base44.asServiceRole.entities.Empresa.filter({ id, ativo: true })
          )
        ).then(results => results.flat());

        // Buscar grupos vinculados ao usuário
        const usuarioGrupos = await base44.asServiceRole.entities.UsuarioEmpresa.filter({
          usuario_email: emailNormalizado,
          ativo: true
        });

        // Extrair IDs únicos de grupos
        const gruposUnicos = [...new Set(usuarioGrupos.map(u => u.grupo_id))].filter(Boolean);
        const grupos = gruposUnicos.length > 0 
          ? await base44.asServiceRole.entities.GrupoEmpresarial.filter({
              id: { $in: gruposUnicos }
            })
          : [];

        return Response.json({
          success: true,
          multiplas_empresas: true,
          empresas: empresasList.map(emp => ({
            id: emp.id,
            nome: emp.razao_social || emp.nome_fantasia || emp.nome,
            logo_url: emp.logo_url
          })),
          grupos: grupos.map(g => ({
            id: g.id,
            nome: g.nome,
            cnpj_principal: g.cnpj_principal,
            logo_url: g.logo_url
          })),
          usuario_base: {
            id: vinculos[0].id,
            email: emailNormalizado,
            nome_completo: vinculos[0].nome_completo,
            perfil: vinculos[0].perfil
          }
        });
      }

      // Uma empresa - MAS pode ser Admin Holding de um grupo
      const vinculo = vinculos[0];
      
      // Se é Admin Holding, mostrar seleção de grupo/empresa
      if (vinculo.perfil === 'Admin Holding' && vinculo.grupo_id) {
        const gruposUnicos = [...new Set(vinculos.map(v => v.grupo_id).filter(Boolean))];
        const grupos = gruposUnicos.length > 0 
          ? await base44.asServiceRole.entities.GrupoEmpresarial.filter({
              id: { $in: gruposUnicos }
            })
          : [];

        const empresasIds = [...new Set(vinculos.map(v => v.empresa_id))];
        const empresasList = await Promise.all(
          empresasIds.map(id => 
            base44.asServiceRole.entities.Empresa.filter({ id, ativo: true })
          )
        ).then(results => results.flat());

        return Response.json({
          success: true,
          multiplas_empresas: true,
          empresas: empresasList.map(emp => ({
            id: emp.id,
            nome: emp.razao_social || emp.nome_fantasia || emp.nome,
            logo_url: emp.logo_url
          })),
          grupos: grupos.map(g => ({
            id: g.id,
            nome: g.nome,
            cnpj_principal: g.cnpj_principal,
            logo_url: g.logo_url
          })),
          usuario_base: {
            id: vinculo.id,
            email: emailNormalizado,
            nome_completo: vinculo.nome_completo,
            perfil: vinculo.perfil,
            grupo_selecionado: vinculo.grupo_id
          }
        });
      }
      
      // Login direto em empresa normal
      const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: vinculo.empresa_id });
      
      return Response.json({
        success: true,
        usuario: {
          id: vinculo.id,
          email: vinculo.usuario_email,
          nome_completo: vinculo.nome_completo,
          perfil: vinculo.perfil,
          tipo_usuario: 'interno',
          empresa_id: vinculo.empresa_id,
          empresa_nome: empresas[0]?.nome || 'Empresa'
        }
      });
    }

    // Cliente portal
    if (clientes.length > 0) {
      const cliente = clientes[0];
      
      // Verificar senha
      if (senhaHash !== cliente.senha_hash) {
        return Response.json({ 
          success: false,
          error: 'Usuário ou senha incorretos' 
        }, { status: 200 });
      }

      const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: cliente.empresa_id });
      return Response.json({
        success: true,
        usuario: {
          id: cliente.id,
          email: cliente.email,
          nome_completo: cliente.nome,
          perfil: 'Cliente',
          tipo_usuario: 'cliente',
          empresa_id: cliente.empresa_id,
          projeto_id: cliente.projeto_id,
          empresa_nome: empresas[0]?.nome || 'Empresa'
        }
      });
    }

    // Nenhum caso encontrado
    return Response.json({ 
      success: false,
      error: 'Usuário ou senha incorretos' 
    }, { status: 200 });

  } catch (error) {
    console.error('Erro no login:', error);
    return Response.json({ 
      success: false,
      error: 'Erro ao processar login. Tente novamente.' 
    }, { status: 500 });
  }
});