import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { token } = await req.json();

    console.log('[DEBUG] Token recebido:', token);

    if (!token) {
      console.log('[DEBUG] Token não fornecido');
      return Response.json({ valido: false }, { status: 400 });
    }

    const usuarios = await base44.asServiceRole.entities.UsuarioCustom.filter({ reset_token: token });
    console.log('[DEBUG] Usuários encontrados:', usuarios.length);

    if (usuarios.length === 0) {
      console.log('[DEBUG] Nenhum usuário encontrado com esse token');
      return Response.json({ valido: false });
    }

    const usuario = usuarios[0];
    console.log('[DEBUG] Usuário:', usuario.email);
    console.log('[DEBUG] Token do usuário:', usuario.reset_token);
    console.log('[DEBUG] Expira em:', usuario.reset_token_expira);

    if (!usuario.reset_token_expira) {
      console.log('[DEBUG] Data de expiração não definida');
      return Response.json({ valido: false });
    }

    const agora = new Date();
    const expira = new Date(usuario.reset_token_expira);
    console.log('[DEBUG] Agora:', agora.toISOString());
    console.log('[DEBUG] Expira:', expira.toISOString());
    console.log('[DEBUG] Token expirado?', agora > expira);

    if (agora > expira) {
      console.log('[DEBUG] Token expirado');
      return Response.json({ valido: false });
    }

    console.log('[DEBUG] Token válido!');
    return Response.json({ valido: true });
  } catch (error) {
    console.error('[ERROR] Erro ao validar token:', error);
    return Response.json({ valido: false }, { status: 500 });
  }
});