
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

async function criarNotificacao(base44, empresa_id, usuario_email, titulo, mensagem, link) {
    try {
        await base44.asServiceRole.entities.Notificacao.create({
            empresa_id,
            usuario_email,
            titulo,
            mensagem,
            link,
            lida: false,
            tipo: 'info',
            prioridade: 'media'
        });
    } catch (error) {
        console.error('Erro ao criar notificação:', error.message);
    }
}

export { criarNotificacao };

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { 
      empresa_id, 
      usuario_email, 
      tipo, 
      titulo, 
      mensagem, 
      link, 
      prioridade = 'Normal',
      icone,
      dados_extra 
    } = await req.json();

    if (!empresa_id || !usuario_email || !tipo || !titulo || !mensagem) {
      return Response.json({ 
        error: 'Campos obrigatórios: empresa_id, usuario_email, tipo, titulo, mensagem' 
      }, { status: 400 });
    }

    // Criar notificação
    const notificacao = await base44.asServiceRole.entities.Notificacao.create({
      empresa_id,
      usuario_email,
      tipo,
      titulo,
      mensagem,
      link: link || null,
      prioridade,
      icone: icone || null,
      dados_extra: dados_extra ? JSON.stringify(dados_extra) : null,
      lida: false
    });

    return Response.json({ 
      success: true, 
      notificacao 
    });
  } catch (error) {
    console.error('Erro ao criar notificação:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
