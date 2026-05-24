import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Buscar empresa por nome
    const empresas = await base44.asServiceRole.entities.Empresa.filter({
      nome: 'Eletro e Energia Ltda'
    });

    if (empresas.length === 0) {
      return Response.json({ error: 'Empresa não encontrada' }, { status: 404 });
    }

    const empresa_id = empresas[0].id;

    // Verificar se o usuário é admin
    const usuarioEmpresa = await base44.asServiceRole.entities.UsuarioEmpresa.filter({
      usuario_email: user.email,
      empresa_id: empresa_id
    });

    if (usuarioEmpresa.length === 0 || usuarioEmpresa[0].perfil !== 'Admin') {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }

    // Dados dos caminhões a migrar
    const caminhoesParaMigrar = [
      { nome: 'Caminhão Mercedes BBH-3E72', placa: 'BBH-3E72', marca: 'Mercedes', modelo: '-' },
      { nome: 'Caminhão VW HMT4E02', placa: 'HMT4E02', marca: 'VW', modelo: '-' }
    ];

    const resultados = { criados: [], ferramentasAtualizadas: 0, erros: [] };

    for (const c of caminhoesParaMigrar) {
      try {
        // Buscar ferramentas com essa localização
        const ferramentas = await base44.asServiceRole.entities.Ferramenta.filter({
          empresa_id: empresa_id,
          localizacao: c.nome
        });

        // Criar caminhão
        const novoCaminhao = await base44.asServiceRole.entities.Caminhao.create({
          empresa_id: empresa_id,
          placa: c.placa,
          marca: c.marca,
          modelo: c.modelo,
          ativo: true
        });

        // Vincular ferramentas ao caminhão via caminhao_id
        for (const ferr of ferramentas) {
          await base44.asServiceRole.entities.Ferramenta.update(ferr.id, {
            caminhao_id: novoCaminhao.id
          });
        }

        resultados.criados.push({
          placa: c.placa,
          caminhoesCount: novoCaminhao.id,
          ferramentasTransferidas: ferramentas.length
        });
        resultados.ferramentasAtualizadas += ferramentas.length;
      } catch (err) {
        resultados.erros.push({ caminhao: c.placa, erro: err.message });
      }
    }

    return Response.json(resultados);
  } catch (error) {
    console.error('Erro na migração:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});