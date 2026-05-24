import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Apenas admin pode consolidar usuários' }, { status: 403 });
    }

    const { nomeUsuario, nomeEmpresa, emailDestino } = await req.json();

    if (!nomeUsuario || !nomeEmpresa || !emailDestino) {
      return Response.json({ error: 'Parâmetros obrigatórios: nomeUsuario, nomeEmpresa, emailDestino' }, { status: 400 });
    }

    // Buscar empresa
    const empresas = await base44.asServiceRole.entities.Empresa.filter({});
    const empresa = empresas.find(e => e.nome?.toLowerCase().includes(nomeEmpresa.toLowerCase()));
    
    if (!empresa) {
      return Response.json({ error: `Empresa "${nomeEmpresa}" não encontrada` }, { status: 404 });
    }

    // Buscar usuários duplicados
    const usuariosEmpresa = await base44.asServiceRole.entities.UsuarioEmpresa.filter({
      empresa_id: empresa.id
    });

    const usuariosDuplicados = usuariosEmpresa.filter(u => 
      u.nome_completo?.toLowerCase() === nomeUsuario.toLowerCase()
    );

    if (usuariosDuplicados.length < 2) {
      return Response.json({ error: `Encontrados apenas ${usuariosDuplicados.length} usuário(s) com esse nome` }, { status: 404 });
    }

    // Encontrar usuário destino (por email)
    const usuarioDestino = usuariosDuplicados.find(u => u.usuario_email === emailDestino);
    if (!usuarioDestino) {
      return Response.json({ error: `Email "${emailDestino}" não encontrado entre os usuários duplicados` }, { status: 404 });
    }

    const usuarioOrigem = usuariosDuplicados.find(u => u.usuario_email !== emailDestino);

    // Migrar todas as referências
    const migrações = [];

    // 1. Buscar e atualizar PerfilPermissao
    const perfis = await base44.asServiceRole.entities.PerfilPermissao.filter({
      empresa_id: empresa.id
    });
    for (const perfil of perfis) {
      if (perfil.usuario_email === usuarioOrigem.usuario_email) {
        await base44.asServiceRole.entities.PerfilPermissao.update(perfil.id, {
          usuario_email: usuarioDestino.usuario_email
        });
        migrações.push(`PerfilPermissao: ${perfil.id}`);
      }
    }

    // 2. Buscar e atualizar GestorAprovacao
    const gestores = await base44.asServiceRole.entities.GestorAprovacao.filter({
      empresa_id: empresa.id
    });
    for (const gestor of gestores) {
      if (gestor.usuario_email === usuarioOrigem.usuario_email) {
        await base44.asServiceRole.entities.GestorAprovacao.update(gestor.id, {
          usuario_email: usuarioDestino.usuario_email
        });
        migrações.push(`GestorAprovacao: ${gestor.id}`);
      }
    }

    // 3. Buscar e atualizar AprovacaoSolicitacao
    const aprovacoes = await base44.asServiceRole.entities.AprovacaoSolicitacao.filter({
      empresa_id: empresa.id
    });
    for (const aprovacao of aprovacoes) {
      if (aprovacao.usuario_email === usuarioOrigem.usuario_email) {
        await base44.asServiceRole.entities.AprovacaoSolicitacao.update(aprovacao.id, {
          usuario_email: usuarioDestino.usuario_email
        });
        migrações.push(`AprovacaoSolicitacao: ${aprovacao.id}`);
      }
    }

    // 4. Buscar e atualizar PreferenciaNotificacao
    const prefs = await base44.asServiceRole.entities.PreferenciaNotificacao.filter({
      empresa_id: empresa.id,
      usuario_email: usuarioOrigem.usuario_email
    });
    for (const pref of prefs) {
      await base44.asServiceRole.entities.PreferenciaNotificacao.delete(pref.id);
      migrações.push(`PreferenciaNotificacao deletada: ${pref.id}`);
    }

    // 5. Deletar usuário original
    await base44.asServiceRole.entities.UsuarioEmpresa.delete(usuarioOrigem.id);
    migrações.push(`UsuarioEmpresa deletado: ${usuarioOrigem.id}`);

    return Response.json({
      sucesso: true,
      mensagem: `Consolidação concluída: ${usuarioOrigem.usuario_email} → ${usuarioDestino.usuario_email}`,
      usuarioMantido: usuarioDestino,
      usuarioDeletado: usuarioOrigem,
      totalMigraçoes: migrações.length,
      migraçoes
    });

  } catch (error) {
    console.error('Erro ao consolidar usuário:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});