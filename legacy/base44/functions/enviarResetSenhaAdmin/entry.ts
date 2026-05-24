import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

function gerarToken() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const { usuario_email } = await req.json();

    if (!usuario_email) {
      return Response.json({ error: 'Email é obrigatório' }, { status: 400 });
    }

    const emailNormalizado = usuario_email.toLowerCase().trim();

    // Buscar usuário
    const [usuariosCustom, usuariosEmpresa] = await Promise.all([
      base44.asServiceRole.entities.UsuarioCustom.filter({ email: emailNormalizado }),
      base44.asServiceRole.entities.UsuarioEmpresa.filter({ usuario_email: emailNormalizado })
    ]);

    let nomeUsuario = 'Usuário';
    let usuarioCustomId = null;
    let empresaId = null;

    if (usuariosCustom.length > 0) {
      nomeUsuario = usuariosCustom[0].nome_completo || nomeUsuario;
      usuarioCustomId = usuariosCustom[0].id;
      empresaId = usuariosCustom[0].empresa_id;
    } else if (usuariosEmpresa.length > 0) {
      nomeUsuario = usuariosEmpresa[0].nome_completo || nomeUsuario;
      empresaId = usuariosEmpresa[0].empresa_id;
    } else {
      return Response.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    // Gerar token com expiração de 24h
    const token = gerarToken();
    const expira = new Date();
    expira.setHours(expira.getHours() + 24);

    // Salvar token no UsuarioCustom
    if (usuarioCustomId) {
      await base44.asServiceRole.entities.UsuarioCustom.update(usuarioCustomId, {
        reset_token: token,
        reset_token_expira: expira.toISOString()
      });
    } else {
      await base44.asServiceRole.entities.UsuarioCustom.create({
        email: emailNormalizado,
        nome_completo: nomeUsuario,
        empresa_id: empresaId,
        senha_hash: '',
        is_super_admin: false,
        ativo: true,
        reset_token: token,
        reset_token_expira: expira.toISOString()
      });
    }

    // Montar link de redefinição - usar origin da requisição como base
    const reqUrl = new URL(req.url);
    const appUrl = `${reqUrl.protocol}//${reqUrl.host}`;
    const linkReset = `${appUrl}?page=RedefinirSenha&token=${token}`;

    return Response.json({ 
      success: true, 
      link: linkReset,
      nome: nomeUsuario
    });

  } catch (error) {
    console.error('[RESET ADMIN] Erro:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});