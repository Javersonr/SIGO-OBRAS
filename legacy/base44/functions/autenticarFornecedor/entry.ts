import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    
    const { email, senha } = body;

    if (!email || !senha) {
      return Response.json({ error: 'Email e senha são obrigatórios' }, { status: 400 });
    }

    // Buscar acesso do fornecedor (tenta lowercase e original para compatibilidade)
    let acessos = await base44.asServiceRole.entities.FornecedorAcesso.filter({ 
      fornecedor_email: email.toLowerCase(),
      ativo: true
    });
    if (acessos.length === 0) {
      acessos = await base44.asServiceRole.entities.FornecedorAcesso.filter({ 
        fornecedor_email: email,
        ativo: true
      });
    }

    if (acessos.length === 0) {
      return Response.json({ error: 'Email não encontrado' }, { status: 404 });
    }

    const acesso = acessos[0];

    // Validar senha
    if (acesso.senha_acesso !== senha) {
      return Response.json({ error: 'Senha incorreta' }, { status: 401 });
    }

    // Buscar dados do fornecedor
    const fornecedores = await base44.asServiceRole.entities.Fornecedor.filter({ 
      id: acesso.fornecedor_id
    });

    if (fornecedores.length === 0) {
      return Response.json({ error: 'Fornecedor não encontrado' }, { status: 404 });
    }

    return Response.json({ 
      success: true,
      fornecedor_id: acesso.fornecedor_id,
      fornecedor_nome: acesso.fornecedor_nome,
      email: acesso.fornecedor_email,
      empresa_id: acesso.empresa_id
    });

  } catch (error) {
    console.error('Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});