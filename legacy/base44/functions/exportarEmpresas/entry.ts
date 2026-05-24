import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }

    // Buscar todas as empresas
    const empresas = await base44.asServiceRole.entities.Empresa.list();

    // Buscar todos os usuários das empresas
    const usuariosEmpresa = await base44.asServiceRole.entities.UsuarioEmpresa.list();

    // Buscar clientes
    const clientes = await base44.asServiceRole.entities.Cliente.list();

    // Buscar fornecedores
    const fornecedores = await base44.asServiceRole.entities.Fornecedor.list();

    const dados = {
      versao: '1.0',
      data_exportacao: new Date().toISOString(),
      empresas,
      usuariosEmpresa,
      clientes,
      fornecedores
    };

    return Response.json(dados);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});