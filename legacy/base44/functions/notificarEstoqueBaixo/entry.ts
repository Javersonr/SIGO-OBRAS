import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Função para notificar usuários sobre estoque baixo
 * Deve ser executada por automação ou manualmente
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const { empresa_id } = await req.json();

    if (!empresa_id) {
      return Response.json({ error: 'empresa_id obrigatório' }, { status: 400 });
    }

    // Buscar materiais com estoque baixo
    const materiais = await base44.asServiceRole.entities.Material.filter({ 
      empresa_id,
      ativo: true
    });

    const materiaisBaixo = materiais.filter(m => 
      m.estoque_minimo > 0 && m.estoque <= m.estoque_minimo
    );

    const materiaisCriticos = materiaisBaixo.filter(m => 
      m.estoque <= (m.estoque_minimo * 0.5)
    );

    if (materiaisBaixo.length === 0) {
      return Response.json({ 
        success: true, 
        mensagem: 'Nenhum material com estoque baixo' 
      });
    }

    // Buscar usuários para notificar (Admin, Estoque, Compras)
    const vinculos = await base44.asServiceRole.entities.UsuarioEmpresa.filter({ 
      empresa_id,
      ativo: true
    });

    const usuariosNotificar = vinculos
      .filter(v => {
        if (v.perfil === 'Admin' || v.is_owner) return true;
        
        try {
          const permissoes = v.permissoes ? JSON.parse(v.permissoes) : {};
          return permissoes?.Estoque || permissoes?.Compras;
        } catch {
          return false;
        }
      })
      .map(v => v.usuario_email);

    // Enviar notificações para materiais críticos
    const notificacoesCriticas = await Promise.allSettled(
      materiaisCriticos.map(material =>
        base44.asServiceRole.functions.invoke('enviarNotificacao', {
          empresa_id,
          usuarios_emails: usuariosNotificar,
          tipo_notificacao: 'estoque_critico',
          dados: {
            material_nome: material.nome,
            quantidade: material.estoque,
            estoque_minimo: material.estoque_minimo
          }
        })
      )
    );

    // Enviar notificações para materiais com estoque baixo (não críticos)
    const materiaisNormais = materiaisBaixo.filter(m => 
      m.estoque > (m.estoque_minimo * 0.5)
    );

    const notificacoesNormais = await Promise.allSettled(
      materiaisNormais.map(material =>
        base44.asServiceRole.functions.invoke('enviarNotificacao', {
          empresa_id,
          usuarios_emails: usuariosNotificar,
          tipo_notificacao: 'estoque_baixo',
          dados: {
            material_nome: material.nome,
            quantidade: material.estoque,
            estoque_minimo: material.estoque_minimo
          }
        })
      )
    );

    const totalEnviadas = notificacoesCriticas.filter(r => r.status === 'fulfilled').length +
                          notificacoesNormais.filter(r => r.status === 'fulfilled').length;

    return Response.json({ 
      success: true,
      materiais_baixo: materiaisBaixo.length,
      materiais_criticos: materiaisCriticos.length,
      notificacoes_enviadas: totalEnviadas
    });
  } catch (error) {
    console.error('Erro ao notificar estoque baixo:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});