import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Função para notificar usuários sobre manutenções vencendo
 * Deve ser executada por automação diária
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

    const hoje = new Date();
    const diasAlerta = 7; // Alertar 7 dias antes

    // Buscar ferramentas com manutenção programada
    const ferramentas = await base44.asServiceRole.entities.Ferramenta.filter({ 
      empresa_id,
      ativo: true
    });

    const ferramentasComManutencao = ferramentas.filter(f => 
      f.proxima_manutencao && !f.alerta_manutencao
    );

    const manutencoesPendentes = [];
    const manutencoesVencidas = [];

    ferramentasComManutencao.forEach(ferramenta => {
      const proximaManutencao = new Date(ferramenta.proxima_manutencao);
      const diasRestantes = Math.ceil((proximaManutencao - hoje) / (1000 * 60 * 60 * 24));
      
      if (diasRestantes < 0) {
        // Vencida
        manutencoesVencidas.push({
          ferramenta,
          dias_vencidos: Math.abs(diasRestantes)
        });
      } else if (diasRestantes <= diasAlerta) {
        // Vencendo
        manutencoesPendentes.push({
          ferramenta,
          dias_restantes: diasRestantes
        });
      }
    });

    if (manutencoesPendentes.length === 0 && manutencoesVencidas.length === 0) {
      return Response.json({ 
        success: true, 
        mensagem: 'Nenhuma manutenção vencendo ou vencida' 
      });
    }

    // Buscar usuários para notificar (Admin, Ferramental)
    const vinculos = await base44.asServiceRole.entities.UsuarioEmpresa.filter({ 
      empresa_id,
      ativo: true
    });

    const usuariosNotificar = vinculos
      .filter(v => {
        if (v.perfil === 'Admin' || v.is_owner) return true;
        
        try {
          const permissoes = v.permissoes ? JSON.parse(v.permissoes) : {};
          return permissoes?.['Ferramental e EPI'];
        } catch {
          return false;
        }
      })
      .map(v => v.usuario_email);

    // Enviar notificações para manutenções vencidas
    const notificacoesVencidas = await Promise.allSettled(
      manutencoesVencidas.map(item =>
        base44.asServiceRole.functions.invoke('enviarNotificacao', {
          empresa_id,
          usuarios_emails: usuariosNotificar,
          tipo_notificacao: 'manutencao_vencida',
          dados: {
            ferramenta_descricao: item.ferramenta.descricao,
            ferramenta_codigo: item.ferramenta.codigo,
            dias_vencidos: item.dias_vencidos
          }
        })
      )
    );

    // Enviar notificações para manutenções vencendo
    const notificacoesVencendo = await Promise.allSettled(
      manutencoesPendentes.map(item =>
        base44.asServiceRole.functions.invoke('enviarNotificacao', {
          empresa_id,
          usuarios_emails: usuariosNotificar,
          tipo_notificacao: 'manutencao_vencendo',
          dados: {
            ferramenta_descricao: item.ferramenta.descricao,
            ferramenta_codigo: item.ferramenta.codigo,
            dias_restantes: item.dias_restantes
          }
        })
      )
    );

    // Marcar ferramentas com alerta enviado
    await Promise.all([
      ...manutencoesVencidas.map(item =>
        base44.asServiceRole.entities.Ferramenta.update(item.ferramenta.id, {
          alerta_manutencao: true
        })
      ),
      ...manutencoesPendentes.map(item =>
        base44.asServiceRole.entities.Ferramenta.update(item.ferramenta.id, {
          alerta_manutencao: true
        })
      )
    ]);

    const totalEnviadas = notificacoesVencidas.filter(r => r.status === 'fulfilled').length +
                          notificacoesVencendo.filter(r => r.status === 'fulfilled').length;

    return Response.json({ 
      success: true,
      manutencoes_vencidas: manutencoesVencidas.length,
      manutencoes_vencendo: manutencoesPendentes.length,
      notificacoes_enviadas: totalEnviadas
    });
  } catch (error) {
    console.error('Erro ao notificar manutenções:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});