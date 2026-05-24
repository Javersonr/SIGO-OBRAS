import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

function gerarSenha() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let senha = '';
  for (let i = 0; i < 8; i++) {
    senha += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return senha;
}

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
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { cotacao_fornecedor_ids, cotacao_id, empresa_id } = await req.json();

    if (!cotacao_fornecedor_ids || !cotacao_id || !empresa_id) {
      return Response.json({ error: 'Parâmetros obrigatórios faltando' }, { status: 400 });
    }

    // Buscar dados da cotação
    const cotacao = await base44.asServiceRole.entities.Cotacao.filter({ id: cotacao_id });
    if (cotacao.length === 0) {
      return Response.json({ error: 'Cotação não encontrada' }, { status: 404 });
    }

    // Buscar empresa
    const empresa = await base44.asServiceRole.entities.Empresa.filter({ id: empresa_id });
    if (empresa.length === 0) {
      return Response.json({ error: 'Empresa não encontrada' }, { status: 404 });
    }

    const enviados = [];
    const erros = [];

    // Processar cada fornecedor
    for (const cotFornecedorId of cotacao_fornecedor_ids) {
      try {
        // Buscar CotacaoFornecedor
        const cotFornecedor = await base44.asServiceRole.entities.CotacaoFornecedor.filter({ 
          id: cotFornecedorId 
        });
        
        if (cotFornecedor.length === 0) continue;

        const fornecedor = cotFornecedor[0];
        
        // Gerar senha provisória
        const senha = gerarSenha();
        const senhaHash = await hashPassword(senha);

        // Criar ou atualizar UsuarioCustom (necessário para login)
        const usuariosCustomExistentes = await base44.asServiceRole.entities.UsuarioCustom.filter({
          email: fornecedor.fornecedor_email
        });

        if (usuariosCustomExistentes.length === 0) {
          await base44.asServiceRole.entities.UsuarioCustom.create({
            email: fornecedor.fornecedor_email,
            nome_completo: fornecedor.fornecedor_nome,
            senha_hash: senhaHash,
            perfil: 'Fornecedor',
            empresa_id: empresa_id,
            is_super_admin: false,
            ativo: true
          });
        } else {
          // Atualizar senha
          await base44.asServiceRole.entities.UsuarioCustom.update(usuariosCustomExistentes[0].id, {
            senha_hash: senhaHash,
            nome_completo: fornecedor.fornecedor_nome
          });
        }

        // Criar ou atualizar usuário do fornecedor no sistema
        const usuariosExistentes = await base44.asServiceRole.entities.UsuarioEmpresa.filter({
          empresa_id,
          usuario_email: fornecedor.fornecedor_email
        });

        if (usuariosExistentes.length === 0) {
          // Criar novo usuário fornecedor
          await base44.asServiceRole.entities.UsuarioEmpresa.create({
            empresa_id,
            usuario_email: fornecedor.fornecedor_email,
            nome_completo: fornecedor.fornecedor_nome,
            perfil: 'Fornecedor',
            permissoes: JSON.stringify({}),
            ativo: true
          });
        }

        // Criar ou atualizar acesso do fornecedor (para senha)
        const acessos = await base44.asServiceRole.entities.FornecedorAcesso.filter({
          empresa_id,
          fornecedor_id: fornecedor.fornecedor_id
        });

        if (acessos.length > 0) {
          await base44.asServiceRole.entities.FornecedorAcesso.update(acessos[0].id, {
            senha_acesso: senha,
            fornecedor_email: fornecedor.fornecedor_email,
            fornecedor_nome: fornecedor.fornecedor_nome
          });
        } else {
          await base44.asServiceRole.entities.FornecedorAcesso.create({
            empresa_id,
            fornecedor_id: fornecedor.fornecedor_id,
            fornecedor_email: fornecedor.fornecedor_email,
            fornecedor_nome: fornecedor.fornecedor_nome,
            senha_acesso: senha,
            ativo: true
          });
        }

        // Enviar email
        const linkCotacao = `${Deno.env.get('BASE_URL') || 'https://app.base44.io'}/#/EntrarSistema`;
        
        const emailHTML = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #f59e0b;">Nova Cotação - ${empresa[0].nome}</h2>
            <p>Olá, <strong>${fornecedor.fornecedor_nome}</strong>!</p>
            <p>Você foi convidado para participar da cotação <strong>${cotacao[0].numero}</strong>.</p>
            
            <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #1e293b;">Dados de Acesso</h3>
              <p><strong>Email:</strong> ${fornecedor.fornecedor_email}</p>
              <p><strong>Senha Provisória:</strong> <span style="font-size: 24px; color: #f59e0b; font-weight: bold;">${senha}</span></p>
            </div>

            <p>Para acessar e responder a cotação:</p>
            <ol>
              <li>Acesse o sistema com o link abaixo</li>
              <li>Faça login com seu email e a senha provisória</li>
              <li>Suas cotações estarão disponíveis para preenchimento</li>
            </ol>

            <a href="${linkCotacao}" 
               style="display: inline-block; background: #f59e0b; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0;">
              Acessar Cotação
            </a>

            <p style="color: #64748b; font-size: 14px; margin-top: 30px;">
              Data limite: ${cotacao[0].data_limite ? new Date(cotacao[0].data_limite).toLocaleDateString('pt-BR') : 'Não definida'}
            </p>
            
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #e2e8f0;" />
            <p style="color: #94a3b8; font-size: 12px;">
              Empresa: ${empresa[0].nome}<br/>
              Email: ${empresa[0].email}
            </p>
          </div>
        `;

        await base44.asServiceRole.integrations.Core.SendEmail({
          to: fornecedor.fornecedor_email,
          subject: `Nova Cotação - ${cotacao[0].numero}`,
          body: emailHTML
        });

        // Atualizar última notificação
        await base44.asServiceRole.entities.CotacaoFornecedor.update(cotFornecedorId, {
          ultima_notificacao: new Date().toISOString()
        });

        enviados.push(fornecedor.fornecedor_nome);
      } catch (error) {
        console.error(`Erro ao enviar para fornecedor ${cotFornecedorId}:`, error);
        erros.push(error.message);
      }
    }

    return Response.json({
      success: true,
      enviados,
      erros,
      total: enviados.length
    });

  } catch (error) {
    console.error('Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});