import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Função auxiliar para criar notificações específicas do sistema
 * 
 * Tipos de notificação suportados:
 * - nova_cotacao: Nova cotação recebida
 * - cotacao_respondida: Fornecedor respondeu cotação
 * - inspecao_concluida: Inspeção de ferramenta concluída
 * - inspecao_falha: Item falhou na inspeção
 * - manutencao_vencendo: Manutenção de ferramenta vencendo
 * - manutencao_vencida: Manutenção de ferramenta vencida
 * - estoque_baixo: Item com estoque abaixo do mínimo
 * - estoque_critico: Item com estoque crítico
 * - solicitacao_aprovada: Solicitação de compra aprovada
 * - solicitacao_rejeitada: Solicitação de compra rejeitada
 */

const configNotificacoes = {
  nova_cotacao: {
    tipo: 'Cotação',
    prioridade: 'Alta',
    titulo: 'Nova Cotação Recebida',
    getMessage: (dados) => `Cotação #${dados.numero} para o projeto ${dados.projeto_nome}`,
    getLink: (dados) => `/cotacoes?id=${dados.id}`
  },
  cotacao_respondida: {
    tipo: 'Cotação',
    prioridade: 'Normal',
    titulo: 'Fornecedor Respondeu Cotação',
    getMessage: (dados) => `${dados.fornecedor_nome} enviou proposta para cotação #${dados.numero}`,
    getLink: (dados) => `/cotacoes?id=${dados.cotacao_id}`
  },
  inspecao_concluida: {
    tipo: 'Inspeção',
    prioridade: 'Normal',
    titulo: 'Inspeção Concluída',
    getMessage: (dados) => `Inspeção de ${dados.funcionario_nome} concluída com ${dados.total_fotografadas} itens`,
    getLink: (dados) => `/ferramental?tab=inspecao`
  },
  inspecao_falha: {
    tipo: 'Inspeção',
    prioridade: 'Alta',
    titulo: 'Item Falhou na Inspeção',
    getMessage: (dados) => `${dados.ferramenta_descricao} (${dados.ferramenta_codigo}) falhou na validação`,
    getLink: (dados) => `/ferramental?tab=inspecao`
  },
  manutencao_vencendo: {
    tipo: 'Manutenção',
    prioridade: 'Alta',
    titulo: 'Manutenção Vencendo',
    getMessage: (dados) => `${dados.ferramenta_descricao} precisa de manutenção em ${dados.dias_restantes} dias`,
    getLink: (dados) => `/ferramental?tab=manutencao`
  },
  manutencao_vencida: {
    tipo: 'Manutenção',
    prioridade: 'Urgente',
    titulo: 'Manutenção Vencida',
    getMessage: (dados) => `${dados.ferramenta_descricao} está com manutenção vencida há ${dados.dias_vencidos} dias`,
    getLink: (dados) => `/ferramental?tab=manutencao`
  },
  estoque_baixo: {
    tipo: 'Estoque',
    prioridade: 'Normal',
    titulo: 'Estoque Baixo',
    getMessage: (dados) => `${dados.material_nome} está abaixo do estoque mínimo (${dados.quantidade} unidades)`,
    getLink: (dados) => `/estoque`
  },
  estoque_critico: {
    tipo: 'Estoque',
    prioridade: 'Urgente',
    titulo: 'Estoque Crítico',
    getMessage: (dados) => `${dados.material_nome} está em nível crítico (${dados.quantidade} unidades)`,
    getLink: (dados) => `/estoque`
  },
  solicitacao_aprovada: {
    tipo: 'Compra',
    prioridade: 'Normal',
    titulo: 'Solicitação Aprovada',
    getMessage: (dados) => `Solicitação de compra #${dados.numero} foi aprovada`,
    getLink: (dados) => `/compras?tab=solicitacoes`
  },
  solicitacao_rejeitada: {
    tipo: 'Compra',
    prioridade: 'Alta',
    titulo: 'Solicitação Rejeitada',
    getMessage: (dados) => `Solicitação de compra #${dados.numero} foi rejeitada: ${dados.motivo}`,
    getLink: (dados) => `/compras?tab=solicitacoes`
  }
};

// Função para processar eventos de automação
async function processarEventoAutomacao(base44, payload) {
  const { event, data, old_data } = payload;
  
  // Processar CotacaoFornecedor
  if (event.entity_name === 'CotacaoFornecedor' && event.type === 'update') {
    const statusNovo = data.status;
    const statusAntigo = old_data?.status;
    
    // Notificar apenas quando status mudar para Respondida
    if ((statusNovo === 'Respondida Totalmente' || statusNovo === 'Respondida Parcialmente' || statusNovo === 'Impossível Responder') 
        && statusAntigo !== statusNovo) {
      
      // Buscar cotação
      const cotacoes = await base44.asServiceRole.entities.Cotacao.filter({ 
        id: data.cotacao_id 
      });
      
      if (cotacoes.length === 0) return Response.json({ error: 'Cotação não encontrada' }, { status: 404 });
      
      const cotacao = cotacoes[0];
      
      // Buscar usuários do perfil Compras ou Admin
      const usuarios = await base44.asServiceRole.entities.UsuarioEmpresa.filter({ 
        empresa_id: data.empresa_id,
        ativo: true
      });
      
      const usuariosCompras = usuarios.filter(u => 
        u.perfil === 'Admin' || u.perfil === 'Compras' || u.is_owner === true
      );
      
      if (usuariosCompras.length === 0) {
        return Response.json({ message: 'Nenhum usuário de compras para notificar' });
      }
      
      const emails = usuariosCompras.map(u => u.usuario_email);
      
      // Criar notificações
      return await enviarNotificacaoDireta(base44, {
        empresa_id: data.empresa_id,
        usuarios_emails: emails,
        tipo_notificacao: 'cotacao_respondida',
        dados: {
          cotacao_id: cotacao.id,
          numero: cotacao.numero,
          fornecedor_nome: data.fornecedor_nome,
          status: statusNovo,
          motivo: data.motivo_recusa || null
        }
      });
    }
  }
  
  // Processar InspecaoCaminhao
  if (event.entity_name === 'InspecaoCaminhao' && event.type === 'update') {
    const statusNovo = data.status;
    const statusAntigo = old_data?.status;
    
    // Notificar quando status mudar para concluida
    if (statusNovo === 'concluida' && statusAntigo !== 'concluida') {
      
      // Buscar usuários Admin ou Gestor
      const usuarios = await base44.asServiceRole.entities.UsuarioEmpresa.filter({ 
        empresa_id: data.empresa_id,
        ativo: true
      });
      
      const usuariosGestores = usuarios.filter(u => 
        u.perfil === 'Admin' || u.perfil === 'Gestor' || u.is_owner === true
      );
      
      if (usuariosGestores.length === 0) {
        return Response.json({ message: 'Nenhum gestor para notificar' });
      }
      
      const emails = usuariosGestores.map(u => u.usuario_email);
      
      // Criar notificações
      return await enviarNotificacaoDireta(base44, {
        empresa_id: data.empresa_id,
        usuarios_emails: emails,
        tipo_notificacao: 'inspecao_concluida',
        dados: {
          inspecao_id: data.id,
          funcionario_nome: data.usuario_nome || 'Funcionário',
          caminhao_placa: data.caminhao_placa,
          total_fotografadas: data.ferramentas_inspecionadas || 0
        }
      });
    }
  }
  
  return Response.json({ message: 'Evento processado, mas sem ação necessária' });
}

// Função auxiliar para enviar notificação direta
async function enviarNotificacaoDireta(base44, { empresa_id, usuarios_emails, tipo_notificacao, dados }) {
  const config = configNotificacoes[tipo_notificacao];
  if (!config) {
    return Response.json({ error: `Tipo de notificação inválido: ${tipo_notificacao}` }, { status: 400 });
  }

  const emails = Array.isArray(usuarios_emails) ? usuarios_emails : [usuarios_emails];
  
  const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: empresa_id });
  const empresa = empresas.length > 0 ? empresas[0] : null;
  const nomeEmpresa = empresa?.nome_fantasia || empresa?.razao_social || empresa?.nome || 'Sistema';

  const notificacoes = await Promise.all(
    emails.map(email => 
      base44.asServiceRole.entities.Notificacao.create({
        empresa_id,
        usuario_email: email,
        tipo: config.tipo,
        prioridade: config.prioridade,
        titulo: config.titulo,
        mensagem: config.getMessage(dados),
        link: config.getLink(dados),
        dados_extra: JSON.stringify(dados),
        lida: false
      })
    )
  );

  const emailsEnviados = await Promise.allSettled(
    emails.map(async (email) => {
      try {
        const linkCompleto = `${Deno.env.get('BASE_URL') || 'https://app.base44.com'}/#${config.getLink(dados)}`;
        
        const prioridadeEmoji = {
          'Baixa': '🔵',
          'Normal': '⚪',
          'Alta': '🟠',
          'Urgente': '🔴'
        }[config.prioridade] || '⚪';

        await base44.asServiceRole.integrations.Core.SendEmail({
          to: email,
          subject: `${prioridadeEmoji} ${config.titulo} - ${nomeEmpresa}`,
          body: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 20px; border-radius: 8px 8px 0 0;">
                <h2 style="color: white; margin: 0;">${config.titulo}</h2>
              </div>
              
              <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
                <div style="background: ${
                  config.prioridade === 'Urgente' ? '#fee2e2' :
                  config.prioridade === 'Alta' ? '#fed7aa' :
                  config.prioridade === 'Normal' ? '#dbeafe' : '#e0e7ff'
                }; padding: 15px; border-radius: 6px; margin-bottom: 20px; border-left: 4px solid ${
                  config.prioridade === 'Urgente' ? '#dc2626' :
                  config.prioridade === 'Alta' ? '#ea580c' :
                  config.prioridade === 'Normal' ? '#2563eb' : '#6366f1'
                };">
                  <p style="margin: 0; color: #1f2937; font-size: 16px;">
                    <strong>${config.getMessage(dados)}</strong>
                  </p>
                </div>
                
                <div style="margin: 25px 0;">
                  <p style="color: #6b7280; margin: 0 0 10px 0;">
                    <strong>Tipo:</strong> ${config.tipo}<br>
                    <strong>Prioridade:</strong> ${config.prioridade}
                  </p>
                </div>
                
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${linkCompleto}" 
                     style="background: #f59e0b; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                    Acessar Sistema
                  </a>
                </div>
                
                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 25px 0;">
                
                <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                  Esta é uma notificação automática do sistema ${nomeEmpresa}.<br>
                  Por favor, não responda este email.
                </p>
              </div>
            </div>
          `
        });
        
        return { email, success: true };
      } catch (error) {
        console.error(`Erro ao enviar email para ${email}:`, error);
        return { email, success: false, error: error.message };
      }
    })
  );

  const emailsSuccesso = emailsEnviados.filter(r => r.status === 'fulfilled' && r.value.success).length;
  const emailsErro = emailsEnviados.filter(r => r.status === 'rejected' || !r.value?.success).length;

  return Response.json({ 
    success: true, 
    notificacoes_criadas: notificacoes.length,
    emails_enviados: emailsSuccesso,
    emails_falha: emailsErro,
    notificacoes 
  });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Verificar se veio de automação de entidade
    const body = await req.json();
    
    // Se veio de automação, processar o evento
    if (body.event && body.data) {
      return await processarEventoAutomacao(base44, body);
    }
    
    // Se não, é uma chamada direta
    const { 
      empresa_id,
      usuarios_emails, // Array de emails ou email único
      tipo_notificacao, // Tipo da notificação (chave do configNotificacoes)
      dados // Dados específicos para a notificação
    } = body;

    if (!empresa_id || !usuarios_emails || !tipo_notificacao || !dados) {
      return Response.json({ 
        error: 'Campos obrigatórios: empresa_id, usuarios_emails, tipo_notificacao, dados' 
      }, { status: 400 });
    }

    const config = configNotificacoes[tipo_notificacao];
    if (!config) {
      return Response.json({ 
        error: `Tipo de notificação inválido: ${tipo_notificacao}` 
      }, { status: 400 });
    }

    // Chamar função auxiliar
    return await enviarNotificacaoDireta(base44, {
      empresa_id,
      usuarios_emails,
      tipo_notificacao,
      dados
    });
  } catch (error) {
    console.error('Erro ao enviar notificação:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});