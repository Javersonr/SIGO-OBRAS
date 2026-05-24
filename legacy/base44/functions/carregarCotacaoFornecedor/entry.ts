import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const { token, marcar_visualizada } = await req.json();

    if (!token) {
      return Response.json({ error: 'Token obrigatório' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);

    const cotacaoFornecedor = await base44.asServiceRole.entities.CotacaoFornecedor.filter({ token });
    if (cotacaoFornecedor.length === 0) {
      return Response.json({ error: 'Cotação não encontrada' }, { status: 404 });
    }

    const cotFornecedorData = cotacaoFornecedor[0];

    // Marcar como visualizada se necessário
    if (marcar_visualizada && cotFornecedorData.status === 'Enviada') {
      await base44.asServiceRole.entities.CotacaoFornecedor.update(cotFornecedorData.id, {
        status: 'Visualizada',
        data_visualizacao: new Date().toISOString()
      });
      cotFornecedorData.status = 'Visualizada';
    }

    const [cotacoes, itens, empresa, respostas] = await Promise.all([
      base44.asServiceRole.entities.Cotacao.filter({ id: cotFornecedorData.cotacao_id }),
      base44.asServiceRole.entities.CotacaoItem.filter({ cotacao_id: cotFornecedorData.cotacao_id }),
      base44.asServiceRole.entities.Empresa.filter({ id: cotFornecedorData.empresa_id }),
      base44.asServiceRole.entities.CotacaoResposta.filter({ cotacao_fornecedor_id: cotFornecedorData.id })
    ]);

    // Enriquecer itens com código - busca em paralelo: SolicitacaoCompraItems + OrcamentoItems do projeto
    const solicitacaoId = cotacoes[0]?.solicitacao_id;
    const projetoId = cotacoes[0]?.projeto_id;

    let solItemMap = {};
    let orcamentoItemMap = {}; // mapa descricao normalizada -> codigo

    const [allSolItems, allOrcItems] = await Promise.all([
      solicitacaoId
        ? base44.asServiceRole.entities.SolicitacaoCompraItem.filter({ solicitacao_id: solicitacaoId }).catch(() => [])
        : Promise.resolve([]),
      projetoId
        ? base44.asServiceRole.entities.OrcamentoItem.filter({ projeto_id: projetoId }).catch(() => [])
        : Promise.resolve([])
    ]);

    allSolItems.forEach(si => { solItemMap[si.id] = si; });

    // Mapa de descrição normalizada -> código (OrcamentoItem)
    const normalize = (str) => (str || '').toLowerCase().trim().replace(/\s+/g, ' ');
    allOrcItems.forEach(oi => {
      if (oi.codigo) orcamentoItemMap[normalize(oi.descricao)] = oi.codigo;
    });

    // Coletar material_ids únicos para lookup no Material
    const materialIds = [...new Set(
      Object.values(solItemMap)
        .filter(si => si.material_id && !si.material_codigo)
        .map(si => si.material_id)
    )];
    const materialMap = {};
    for (const matId of materialIds) {
      try {
        const mats = await base44.asServiceRole.entities.Material.filter({ id: matId });
        if (mats.length > 0) materialMap[matId] = mats[0];
      } catch (_) {}
    }

    // Join em memória: CotacaoItem.material_codigo > SolItem.material_codigo > Material.codigo > OrcamentoItem por descrição
    const itensEnriquecidos = (itens || []).map(item => {
      if (item.material_codigo) return { ...item, codigo: item.material_codigo };
      const solItem = solItemMap[item.solicitacao_item_id];
      if (solItem) {
        if (solItem.material_codigo) return { ...item, codigo: solItem.material_codigo };
        if (solItem.material_id && materialMap[solItem.material_id]?.codigo) {
          return { ...item, codigo: materialMap[solItem.material_id].codigo };
        }
      }
      // Fallback: buscar código pelo OrcamentoItem com mesma descrição
      const codigoOrc = orcamentoItemMap[normalize(item.descricao)];
      if (codigoOrc) return { ...item, codigo: codigoOrc };
      return item;
    });

    return Response.json({
      cotacaoFornecedor: cotFornecedorData,
      cotacao: cotacoes[0] || null,
      itens: itensEnriquecidos,
      empresa: empresa[0] || null,
      respostas: respostas || []
    });
  } catch (error) {
    console.error('Erro ao carregar cotação:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});