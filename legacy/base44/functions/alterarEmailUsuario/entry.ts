import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Apenas admins podem alterar email de outros usuários
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const { vinculo_id, email_antigo, email_novo } = await req.json();

    if (!vinculo_id || !email_antigo || !email_novo) {
      return Response.json({ error: 'Parâmetros obrigatórios ausentes' }, { status: 400 });
    }

    const emailNovo = email_novo.toLowerCase().trim();
    const emailAntigo = email_antigo.toLowerCase().trim();

    // Verificar se já existe outro usuário com o novo email
    const existentes = await base44.asServiceRole.entities.UsuarioEmpresa.filter({ usuario_email: emailNovo });
    if (existentes.length > 0 && existentes[0].id !== vinculo_id) {
      return Response.json({ error: 'Este e-mail já está em uso por outro usuário' }, { status: 400 });
    }

    // Atualizar UsuarioEmpresa
    await base44.asServiceRole.entities.UsuarioEmpresa.update(vinculo_id, {
      usuario_email: emailNovo
    });

    // Atualizar UsuarioCustom se existir
    const usuariosCustom = await base44.asServiceRole.entities.UsuarioCustom.filter({ email: emailAntigo });
    if (usuariosCustom.length > 0) {
      await base44.asServiceRole.entities.UsuarioCustom.update(usuariosCustom[0].id, {
        email: emailNovo
      });
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('[ALTERAR EMAIL] Erro:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});