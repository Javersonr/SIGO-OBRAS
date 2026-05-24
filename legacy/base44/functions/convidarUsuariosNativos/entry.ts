// Convida todos os usuários do UsuarioCustom como usuários nativos Base44
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Acesso negado. Apenas admins.' }, { status: 403 });
    }

    const usuarios = await base44.asServiceRole.entities.UsuarioCustom.filter({ ativo: true });

    const resultados = [];

    for (const u of usuarios) {
      if (!u.email || u.is_super_admin) continue;
      try {
        await base44.users.inviteUser(u.email, 'user');
        resultados.push({ email: u.email, status: 'convidado' });
        console.log(`[CONVITE] ✅ ${u.email}`);
      } catch (err) {
        resultados.push({ email: u.email, status: 'erro', detalhe: err.message });
        console.log(`[CONVITE] ❌ ${u.email} - ${err.message}`);
      }
    }

    return Response.json({ success: true, total: resultados.length, resultados });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});