import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { empresaId, itensOrcamento } = await req.json();

    if (!Array.isArray(itensOrcamento) || !empresaId) {
      return Response.json({ error: 'Invalid parameters' }, { status: 400 });
    }

    const materiaisExpandidos = [];

    for (const item of itensOrcamento) {
      if (item.kit_id) {
        // Se é um kit, expande para os materiais dentro dele
        const kitItems = await base44.entities.KitItem.filter({
          empresa_id: empresaId,
          kit_id: item.kit_id
        });

        for (const kitItem of kitItems) {
          materiaisExpandidos.push({
            material_id: kitItem.material_id,
            material_nome: kitItem.material_nome,
            material_codigo: kitItem.material_codigo,
            material_unidade: kitItem.material_unidade,
            quantidade: (item.quantidade || 1) * kitItem.quantidade,
            preco_unitario: kitItem.preco_unitario,
            origem_kit_id: item.kit_id,
            origem_kit_nome: item.kit_nome,
            origem_quantidade_kit: item.quantidade
          });
        }
      } else {
        // Se é material simples, mantém como está
        materiaisExpandidos.push({
          material_id: item.material_id,
          material_nome: item.material_nome,
          material_codigo: item.material_codigo,
          material_unidade: item.material_unidade,
          quantidade: item.quantidade,
          preco_unitario: item.preco_unitario
        });
      }
    }

    // Agrupar materiais com mesmo ID (consolidar quantidades)
    const materiaisConsolidados = {};

    for (const material of materiaisExpandidos) {
      const chave = material.material_id;

      if (!materiaisConsolidados[chave]) {
        materiaisConsolidados[chave] = {
          ...material,
          quantidade: 0,
          detalhes_kits: []
        };
      }

      materiaisConsolidados[chave].quantidade += material.quantidade;

      if (material.origem_kit_id) {
        materiaisConsolidados[chave].detalhes_kits.push({
          kit_id: material.origem_kit_id,
          kit_nome: material.origem_kit_nome,
          quantidade_kit: material.origem_quantidade_kit,
          quantidade_material_no_kit: material.quantidade / material.origem_quantidade_kit
        });
      }
    }

    return Response.json({
      materiais_expandidos: Object.values(materiaisConsolidados),
      total_itens: Object.keys(materiaisConsolidados).length,
      status: 'sucesso'
    });
  } catch (error) {
    console.error('Erro ao expandir kits:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});