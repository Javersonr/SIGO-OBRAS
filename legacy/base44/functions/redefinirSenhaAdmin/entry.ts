import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

async function hashSenha(senha) {
  const encoder = new TextEncoder();
  const data = encoder.encode(senha);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const { usuario_email, nova_senha } = await req.json();

    if (!usuario_email || !nova_senha) {
      return Response.json({ error: 'Parâmetros obrigatórios ausentes' }, { status: 400 });
    }

    if (nova_senha.length < 6) {
      return Response.json({ success: false, error: 'A senha deve ter no mínimo 6 caracteres' }, { status: 400 });
    }

    const email = usuario_email.toLowerCase().trim();
    const senhaHash = await hashSenha(nova_senha);

    // Buscar ou criar UsuarioCustom
    const usuariosCustom = await base44.asServiceRole.entities.UsuarioCustom.filter({ email });

    if (usuariosCustom.length > 0) {
      await base44.asServiceRole.entities.UsuarioCustom.update(usuariosCustom[0].id, {
        senha_hash: senhaHash
      });
    } else {
      // Criar registro
      const vinculos = await base44.asServiceRole.entities.UsuarioEmpresa.filter({ usuario_email: email, ativo: true });
      const vinculo = vinculos[0] || {};
      await base44.asServiceRole.entities.UsuarioCustom.create({
        email,
        senha_hash: senhaHash,
        nome_completo: vinculo.nome_completo || 'Usuário',
        empresa_id: vinculo.empresa_id || '',
        ativo: true
      });
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('[REDEFINIR SENHA ADMIN] Erro:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});