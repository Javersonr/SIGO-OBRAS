// v9 - envio via Resend (HTTP API)
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function gerarSenhaTemporaria() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let senha = '';
  for (let i = 0; i < 8; i++) {
    senha += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return senha;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const email = (body.email || '').toLowerCase().trim();

    console.log('[RESET] Email recebido:', email);

    if (!email) {
      return Response.json({ success: false, error: 'Email é obrigatório' }, { status: 400 });
    }

    // Buscar nas duas tabelas em paralelo
    const [vinculos, usuariosCustom] = await Promise.all([
      base44.asServiceRole.entities.UsuarioEmpresa.filter({ usuario_email: email, ativo: true }),
      base44.asServiceRole.entities.UsuarioCustom.filter({ email })
    ]);

    console.log('[RESET] Vínculos UsuarioEmpresa:', vinculos.length, '| UsuarioCustom:', usuariosCustom.length);

    // Determinar nome e empresa_id do usuário
    let nomeUsuario = 'Usuário';
    let empresaId = null;
    let perfilUsuario = 'Gestor';

    if (vinculos.length > 0) {
      nomeUsuario = vinculos[0].nome_completo || nomeUsuario;
      empresaId = vinculos[0].empresa_id;
      perfilUsuario = vinculos[0].perfil || perfilUsuario;
    } else if (usuariosCustom.length > 0) {
      nomeUsuario = usuariosCustom[0].nome_completo || nomeUsuario;
      empresaId = usuariosCustom[0].empresa_id;
      perfilUsuario = usuariosCustom[0].perfil || perfilUsuario;
    } else {
      // Usuário não encontrado - retornar sucesso sem revelar
      console.log('[RESET] Usuário não encontrado:', email);
      return Response.json({ success: true });
    }

    // Gerar senha temporária
    const senhaTemporaria = gerarSenhaTemporaria();
    const senhaHash = await hashPassword(senhaTemporaria);

    console.log('[RESET] Senha temporária gerada. Garantindo usuário nativo Base44...');

    console.log('[RESET] Senha temporária gerada. Atualizando UsuarioCustom...');

    // Atualizar ou criar UsuarioCustom
    if (usuariosCustom.length > 0) {
      await base44.asServiceRole.entities.UsuarioCustom.update(usuariosCustom[0].id, {
        senha_hash: senhaHash
      });
      console.log('[RESET] UsuarioCustom atualizado com nova senha');
    } else {
      await base44.asServiceRole.entities.UsuarioCustom.create({
        email,
        empresa_id: empresaId,
        nome_completo: nomeUsuario,
        senha_hash: senhaHash,
        perfil: perfilUsuario,
        is_super_admin: false,
        ativo: true
      });
      console.log('[RESET] Novo UsuarioCustom criado com senha temporária');
    }

    // Enviar email via Base44
    await base44.asServiceRole.integrations.Core.SendEmail({
      to: email,
      subject: 'Senha Temporária - SIGO OBRAS',
      body: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #f59e0b 0%, #ea580c 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">SIGO OBRAS</h1>
          </div>
          <div style="background: #f8fafc; padding: 30px; border-radius: 0 0 10px 10px;">
            <h2 style="color: #1e293b; margin-top: 0;">Recuperação de Senha</h2>
            <p style="color: #475569; line-height: 1.6;">Olá, <strong>${nomeUsuario}</strong>!</p>
            <p style="color: #475569; line-height: 1.6;">Recebemos uma solicitação de recuperação de senha. Use a senha temporária abaixo para fazer login:</p>
            <div style="text-align: center; margin: 30px 0; background: white; padding: 20px; border-radius: 8px; border: 2px dashed #f59e0b;">
              <p style="margin: 0 0 8px 0; color: #64748b; font-size: 13px;">Sua senha temporária:</p>
              <p style="margin: 0; font-size: 30px; font-weight: bold; color: #1e293b; letter-spacing: 5px;">${senhaTemporaria}</p>
            </div>
            <p style="color: #475569; line-height: 1.6;">Após fazer login, acesse <strong>Configurações → Meu Perfil</strong> para alterar sua senha.</p>
            <p style="color: #94a3b8; font-size: 12px; margin-top: 20px;">Se você não solicitou esta recuperação, ignore este email.</p>
          </div>
        </div>
      `
    });

    console.log('[RESET] Email enviado com sucesso para:', email);

    return Response.json({ success: true });

  } catch (error) {
    console.error('[RESET] Erro:', error.message);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});