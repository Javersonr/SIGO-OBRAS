import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { to, subject, body, from_name } = await req.json();

    if (!to || !subject || !body) {
      return Response.json({ error: 'Campos obrigatórios: to, subject, body' }, { status: 400 });
    }

    await base44.asServiceRole.integrations.Core.SendEmail({
      to,
      subject,
      body: body.replace(/\n/g, '<br>'),
      from_name: from_name || 'SIGO OBRAS'
    });

    return Response.json({ success: true, message: 'Email enviado com sucesso' });
  } catch (error) {
    console.error('Erro ao enviar email:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});