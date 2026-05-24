import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Buscar todas as empresas ativas
    const empresas = await base44.asServiceRole.entities.Empresa.filter({ ativo: true });
    
    const alertas = [];
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    
    const seteDiasFrente = new Date(hoje);
    seteDiasFrente.setDate(seteDiasFrente.getDate() + 7);

    for (const empresa of empresas) {
      // Buscar ferramentas com manutenção configurada
      const ferramentas = await base44.asServiceRole.entities.Ferramenta.filter({
        empresa_id: empresa.id,
        ativo: true
      });

      const ferramentasComAlerta = [];

      for (const ferramenta of ferramentas) {
        let alertaGerado = false;
        let mensagem = '';

        // Verificar manutenção por data
        if (ferramenta.proxima_manutencao) {
          const proxManut = new Date(ferramenta.proxima_manutencao);
          proxManut.setHours(0, 0, 0, 0);

          if (proxManut < hoje) {
            mensagem = `Manutenção ATRASADA desde ${proxManut.toLocaleDateString('pt-BR')}`;
            alertaGerado = true;
          } else if (proxManut <= seteDiasFrente) {
            const diasRestantes = Math.ceil((proxManut - hoje) / (1000 * 60 * 60 * 24));
            mensagem = `Manutenção programada em ${diasRestantes} dia${diasRestantes !== 1 ? 's' : ''}`;
            alertaGerado = true;
          }
        }

        // Verificar manutenção por horas de uso
        if (ferramenta.intervalo_manutencao_horas > 0 && ferramenta.horas_uso !== undefined) {
          const horasRestantes = ferramenta.intervalo_manutencao_horas - (ferramenta.horas_uso % ferramenta.intervalo_manutencao_horas);
          
          if (horasRestantes <= 50) {
            if (mensagem) mensagem += ' | ';
            mensagem += `Faltam ${horasRestantes}h de uso para manutenção`;
            alertaGerado = true;
          }
        }

        if (alertaGerado) {
          ferramentasComAlerta.push({
            codigo: ferramenta.codigo,
            descricao: ferramenta.descricao,
            mensagem
          });

          // Atualizar flag de alerta na ferramenta
          await base44.asServiceRole.entities.Ferramenta.update(ferramenta.id, {
            alerta_manutencao: true
          });
        } else if (ferramenta.alerta_manutencao) {
          // Limpar alerta se não há mais necessidade
          await base44.asServiceRole.entities.Ferramenta.update(ferramenta.id, {
            alerta_manutencao: false
          });
        }
      }

      // Criar notificações para gestores e admins
      if (ferramentasComAlerta.length > 0) {
        const usuarios = await base44.asServiceRole.entities.UsuarioEmpresa.filter({
          empresa_id: empresa.id,
          ativo: true
        });

        const usuariosNotificar = usuarios.filter(u => 
          u.perfil === 'Admin' || u.perfil === 'Gestor'
        );

        for (const usuario of usuariosNotificar) {
          const mensagemNotif = ferramentasComAlerta.length === 1
            ? `${ferramentasComAlerta[0].codigo}: ${ferramentasComAlerta[0].mensagem}`
            : `${ferramentasComAlerta.length} ferramentas precisam de manutenção`;

          // Verificar se já existe notificação não lida recente (últimas 24h)
          const ultimaNotif = await base44.asServiceRole.entities.Notificacao.filter({
            empresa_id: empresa.id,
            usuario_email: usuario.usuario_email,
            tipo: 'Manutenção',
            lida: false
          }, '-created_date', 1);

          const jaNotificouRecentemente = ultimaNotif.length > 0 && 
            new Date() - new Date(ultimaNotif[0].created_date) < 24 * 60 * 60 * 1000;

          if (!jaNotificouRecentemente) {
            await base44.asServiceRole.entities.Notificacao.create({
              empresa_id: empresa.id,
              usuario_email: usuario.usuario_email,
              tipo: 'Manutenção',
              prioridade: ferramentasComAlerta.some(f => f.mensagem.includes('ATRASADA')) ? 'Urgente' : 'Alta',
              titulo: 'Alerta de Manutenção',
              mensagem: mensagemNotif,
              link: '/Ferramental',
              lida: false,
              icone: 'Wrench'
            });
          }
        }

        alertas.push({
          empresa: empresa.nome,
          ferramentas: ferramentasComAlerta.length
        });

        // Enviar e-mail se empresa tiver configuração de email
        if (empresa.email) {
          const listaFerramentas = ferramentasComAlerta
            .map(f => `• ${f.codigo} - ${f.descricao}: ${f.mensagem}`)
            .join('\n');

          try {
            await base44.asServiceRole.integrations.Core.SendEmail({
              to: empresa.email,
              subject: `[SIGO OBRAS] Alerta de Manutenção - ${ferramentasComAlerta.length} ferramenta(s)`,
              body: `
Olá,

Este é um alerta automático do sistema SIGO OBRAS.

As seguintes ferramentas precisam de atenção:

${listaFerramentas}

Acesse o sistema para mais detalhes: ${req.headers.get('origin')}/Ferramental

---
Sistema SIGO OBRAS
              `.trim()
            });
          } catch (emailError) {
            console.error('Erro ao enviar email:', emailError);
          }
        }
      }
    }

    return Response.json({
      success: true,
      verificadas: empresas.length,
      alertas: alertas.length,
      detalhes: alertas
    });

  } catch (error) {
    console.error('Erro:', error);
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
});