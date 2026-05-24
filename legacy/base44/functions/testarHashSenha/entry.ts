import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { senha } = body;

    const hash = await hashPassword(senha);
    
    const usuarios = await base44.asServiceRole.entities.UsuarioCustom.filter({
      email: 'admin@sigoobras.com'
    });

    return Response.json({ 
      senha_enviada: senha,
      hash_gerado: hash,
      usuario_encontrado: usuarios.length > 0,
      hash_armazenado: usuarios[0]?.senha_hash,
      coincidem: hash === usuarios[0]?.senha_hash
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});