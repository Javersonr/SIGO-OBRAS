import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Buscar todas as tarefas ativas
    const todasTarefas = await base44.asServiceRole.entities.TarefaProjeto.filter({});

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const notificacoesCriadas = [];

    for (const tarefa of todasTarefas) {
      if (tarefa.status === 'Concluída') continue;

      // Verificar prazo próximo (3 dias)
      if (tarefa.data_fim) {
        const dataFim = new Date(tarefa.data_fim);
        dataFim.setHours(0, 0, 0, 0);
        const diasRestantes = Math.ceil((dataFim - hoje) / (1000 * 60 * 60 * 24));

        if (diasRestantes <= 3 && diasRestantes >= 0) {
          // Notificar responsável principal
          if (tarefa.responsavel_principal_email) {
            await base44.asServiceRole.entities.Notificacao.create({
              empresa_id: tarefa.empresa_id,
              usuario_email: tarefa.responsavel_principal_email,
              tipo: 'Projeto',
              titulo: `Tarefa próxima do prazo: ${tarefa.titulo}`,
              mensagem: `A tarefa "${tarefa.titulo}" vence em ${diasRestantes} ${diasRestantes === 1 ? 'dia' : 'dias'}`,
              prioridade: diasRestantes === 0 ? 'Urgente' : diasRestantes === 1 ? 'Alta' : 'Normal',
              icone: 'Clock'
            });
            notificacoesCriadas.push({
              tipo: 'prazo_proximo',
              tarefa: tarefa.titulo,
              dias: diasRestantes
            });
          }

          // Notificar responsáveis adicionais
          if (tarefa.responsaveis_ids) {
            const responsaveisIds = JSON.parse(tarefa.responsaveis_ids);
            const usuarios = await base44.asServiceRole.entities.UsuarioEmpresa.filter({
              empresa_id: tarefa.empresa_id
            });

            for (const usuarioId of responsaveisIds) {
              const usuario = usuarios.find(u => (u.usuario_id || u.id) === usuarioId);
              if (usuario && usuario.usuario_email !== tarefa.responsavel_principal_email) {
                await base44.asServiceRole.entities.Notificacao.create({
                  empresa_id: tarefa.empresa_id,
                  usuario_email: usuario.usuario_email,
                  tipo: 'Projeto',
                  titulo: `Tarefa próxima do prazo: ${tarefa.titulo}`,
                  mensagem: `A tarefa "${tarefa.titulo}" vence em ${diasRestantes} ${diasRestantes === 1 ? 'dia' : 'dias'}`,
                  prioridade: diasRestantes === 0 ? 'Urgente' : diasRestantes === 1 ? 'Alta' : 'Normal',
                  icone: 'Clock'
                });
              }
            }
          }
        }
      }

      // Verificar dependências bloqueadas
      if (tarefa.status !== 'Bloqueada' && tarefa.dependencias) {
        const dependencias = JSON.parse(tarefa.dependencias);
        const tarefasBloqueadas = todasTarefas.filter(t =>
          dependencias.includes(t.id) && t.status !== 'Concluída'
        );

        if (tarefasBloqueadas.length > 0 && tarefa.status === 'Em Andamento') {
          // Atualizar status para bloqueada
          await base44.asServiceRole.entities.TarefaProjeto.update(tarefa.id, {
            status: 'Bloqueada'
          });

          // Notificar responsável
          if (tarefa.responsavel_principal_email) {
            await base44.asServiceRole.entities.Notificacao.create({
              empresa_id: tarefa.empresa_id,
              usuario_email: tarefa.responsavel_principal_email,
              tipo: 'Projeto',
              titulo: `Tarefa bloqueada: ${tarefa.titulo}`,
              mensagem: `A tarefa "${tarefa.titulo}" foi bloqueada devido a dependências não concluídas: ${tarefasBloqueadas.map(t => t.titulo).join(', ')}`,
              prioridade: 'Alta',
              icone: 'AlertCircle'
            });
            notificacoesCriadas.push({
              tipo: 'dependencia_bloqueada',
              tarefa: tarefa.titulo,
              bloqueadoras: tarefasBloqueadas.length
            });
          }
        }
      }

      // Desbloquear tarefa se dependências foram concluídas
      if (tarefa.status === 'Bloqueada' && tarefa.dependencias) {
        const dependencias = JSON.parse(tarefa.dependencias);
        const tarefasPendentes = todasTarefas.filter(t =>
          dependencias.includes(t.id) && t.status !== 'Concluída'
        );

        if (tarefasPendentes.length === 0) {
          await base44.asServiceRole.entities.TarefaProjeto.update(tarefa.id, {
            status: 'A Fazer'
          });

          if (tarefa.responsavel_principal_email) {
            await base44.asServiceRole.entities.Notificacao.create({
              empresa_id: tarefa.empresa_id,
              usuario_email: tarefa.responsavel_principal_email,
              tipo: 'Projeto',
              titulo: `Tarefa desbloqueada: ${tarefa.titulo}`,
              mensagem: `A tarefa "${tarefa.titulo}" foi desbloqueada e pode ser iniciada`,
              prioridade: 'Normal',
              icone: 'CheckCircle2'
            });
            notificacoesCriadas.push({
              tipo: 'tarefa_desbloqueada',
              tarefa: tarefa.titulo
            });
          }
        }
      }
    }

    return Response.json({
      success: true,
      tarefas_verificadas: todasTarefas.length,
      notificacoes_criadas: notificacoesCriadas.length,
      detalhes: notificacoesCriadas
    });
  } catch (error) {
    console.error('Erro ao verificar tarefas:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});