import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const body = await req.json();
    const { empresas = [], usuariosEmpresa = [], clientes = [], fornecedores = [] } = body;

    const resultado = {
      empresas_importadas: 0,
      usuarios_importados: 0,
      clientes_importados: 0,
      fornecedores_importados: 0,
      erros: []
    };

    // Importar empresas
    for (const empresa of empresas) {
      try {
        const { id, created_date, updated_date, created_by, ...dadosEmpresa } = empresa;
        await base44.asServiceRole.entities.Empresa.create(dadosEmpresa);
        resultado.empresas_importadas++;
      } catch (error) {
        resultado.erros.push(`Erro ao importar empresa ${empresa.nome}: ${error.message}`);
      }
    }

    // Importar usuários
    for (const usuario of usuariosEmpresa) {
      try {
        const { id, created_date, updated_date, created_by, ...dadosUsuario } = usuario;
        await base44.asServiceRole.entities.UsuarioEmpresa.create(dadosUsuario);
        resultado.usuarios_importados++;
      } catch (error) {
        resultado.erros.push(`Erro ao importar usuário ${usuario.usuario_email}: ${error.message}`);
      }
    }

    // Importar clientes
    for (const cliente of clientes) {
      try {
        const { id, created_date, updated_date, created_by, ...dadosCliente } = cliente;
        await base44.asServiceRole.entities.Cliente.create(dadosCliente);
        resultado.clientes_importados++;
      } catch (error) {
        resultado.erros.push(`Erro ao importar cliente ${cliente.nome_razao}: ${error.message}`);
      }
    }

    // Importar fornecedores
    for (const fornecedor of fornecedores) {
      try {
        const { id, created_date, updated_date, created_by, ...dadosFornecedor } = fornecedor;
        await base44.asServiceRole.entities.Fornecedor.create(dadosFornecedor);
        resultado.fornecedores_importados++;
      } catch (error) {
        resultado.erros.push(`Erro ao importar fornecedor ${fornecedor.nome_razao}: ${error.message}`);
      }
    }

    return Response.json(resultado);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});