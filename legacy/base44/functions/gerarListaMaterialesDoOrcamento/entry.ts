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

    const { empresaId, oportunidadeId, projetoId } = await req.json();

    if (!empresaId || (!oportunidadeId && !projetoId)) {
      return Response.json({ error: 'Invalid parameters' }, { status: 400 });
    }

    // Buscar itens do orçamento
    const filtro = { empresa_id: empresaId };
    if (oportunidadeId) filtro.oportunidade_id = oportunidadeId;
    if (projetoId) filtro.projeto_id = projetoId;

    const itensOrcamento = await base44.entities.OrcamentoItem.filter(filtro);

    const materiaisFinais = {};
    const detalhesKits = [];

    // Processar cada item do orçamento
    for (const item of itensOrcamento) {
      if (item.tipo === 'Kit' && item.kit_id) {
        // Buscar materiais dentro do kit
        const kitItems = await base44.entities.KitItem.filter({
          empresa_id: empresaId,
          kit_id: item.kit_id
        });

        for (const kitItem of kitItems) {
          const chave = kitItem.material_id;
          const qtdTotal = (item.quantidade || 1) * kitItem.quantidade;

          if (!materiaisFinais[chave]) {
            materiaisFinais[chave] = {
              material_id: kitItem.material_id,
              material_nome: kitItem.material_nome,
              material_codigo: kitItem.material_codigo,
              material_unidade: kitItem.material_unidade,
              quantidade: 0,
              preco_unitario: kitItem.preco_unitario,
              valor_total: 0
            };
          }

          materiaisFinais[chave].quantidade += qtdTotal;
          materiaisFinais[chave].valor_total = 
            materiaisFinais[chave].quantidade * materiaisFinais[chave].preco_unitario;

          detalhesKits.push({
            kit_id: item.kit_id,
            kit_nome: item.kit_nome,
            material_id: kitItem.material_id,
            quantidade_kit: item.quantidade,
            quantidade_material_no_kit: kitItem.quantidade
          });
        }
      } else if (item.tipo === 'Material' && item.material_id) {
        // Material simples
        const chave = item.material_id;

        if (!materiaisFinais[chave]) {
          materiaisFinais[chave] = {
            material_id: item.material_id,
            material_nome: item.descricao,
            material_codigo: item.codigo,
            material_unidade: item.unidade,
            quantidade: 0,
            preco_unitario: item.valor_unitario,
            valor_total: 0
          };
        }

        materiaisFinais[chave].quantidade += item.quantidade;
        materiaisFinais[chave].valor_total = 
          materiaisFinais[chave].quantidade * materiaisFinais[chave].preco_unitario;
      }
    }

    // Calcular totais
    const totalMateriais = Object.values(materiaisFinais).reduce(
      (sum, m) => sum + (m.valor_total || 0),
      0
    );

    return Response.json({
      materiais: Object.values(materiaisFinais),
      total_itens: Object.keys(materiaisFinais).length,
      valor_total: totalMateriais,
      detalhes_kits: detalhesKits,
      status: 'sucesso'
    });
  } catch (error) {
    console.error('Erro ao gerar lista de materiais:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});