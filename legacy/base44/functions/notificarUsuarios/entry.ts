import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Notifica múltiplos usuários com base em permissões e filtros
 * 
 * Payload:
 * - empresa_id: ID da empresa
 * - tipo: Tipo de notificação (Cotação, Projeto, etc)
 * - titulo: Título da notificação
 * - mensagem: Mensagem
 * - link: Link opcional
 * - prioridade: Baixa, Normal, Alta, Urgente
 * - filtro_perfis: Array de perfis (Admin, Gestor, Compras, etc) - opcional
 * - filtro_usuarios: Array de emails específicos - opcional
 * - modulo_permissao: Nome do módulo para verificar permissão - opcional
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { 
      empresa_id, 
      tipo, 
      titulo, 
      mensagem, 
      link,
      prioridade = 'Normal',
      filtro_perfis,
      filtro_usuarios,
      modulo_permissao
    } = await req.json();

    if (!empresa_id || !tipo || !titulo || !mensagem) {
      return Response.json({ 
        error: 'Campos obrigatórios: empresa_id, tipo, titulo, mensagem' 
      }, { status: 400 });
    }

    // Buscar todos os vínculos da empresa
    const vinculos = await base44.asServiceRole.entities.UsuarioEmpresa.filter({ 
      empresa_id, 
      ativo: true 
    });

    let usuariosParaNotificar = vinculos;

    // Filtrar por perfis específicos
    if (filtro_perfis && filtro_perfis.length > 0) {
      usuariosParaNotificar = usuariosParaNotificar.filter(v => 
        filtro_perfis.includes(v.perfil)
      );
    }

    // Filtrar por usuários específicos
    if (filtro_usuarios && filtro_usuarios.length > 0) {
      usuariosParaNotificar = usuariosParaNotificar.filter(v => 
        filtro_usuarios.includes(v.usuario_email)
      );
    }

    // Filtrar por permissão de módulo
    if (modulo_permissao) {
      usuariosParaNotificar = usuariosParaNotificar.filter(v => {
        if (v.perfil === 'Admin') return true;
        
        try {
          const permissoes = v.permissoes ? JSON.parse(v.permissoes) : {};
          const moduloPerm = permissoes[modulo_permissao];
          
          if (typeof moduloPerm === 'boolean') return moduloPerm;
          if (typeof moduloPerm === 'object') {
            return Object.values(moduloPerm).some(val => val === true);
          }
          return false;
        } catch (e) {
          return false;
        }
      });
    }

    // Criar notificações para todos os usuários filtrados
    const notificacoesCriadas = [];
    for (const vinculo of usuariosParaNotificar) {
      const notif = await base44.asServiceRole.entities.Notificacao.create({
        empresa_id,
        usuario_email: vinculo.usuario_email,
        tipo,
        titulo,
        mensagem,
        link: link || null,
        prioridade,
        lida: false
      });
      notificacoesCriadas.push(notif);
    }

    return Response.json({ 
      success: true, 
      total: notificacoesCriadas.length,
      notificacoes: notificacoesCriadas 
    });
  } catch (error) {
    console.error('Erro ao notificar usuários:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});