import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();

    // Pode ser chamado por automação (entity delete) ou diretamente
    const ferramenta = payload?.data || payload;
    const ferramentaDescricao = (ferramenta?.descricao || '').toLowerCase().trim();
    const ferramentaId = ferramenta?.id || payload?.event?.entity_id;
    const empresaId = ferramenta?.empresa_id;

    if (!ferramentaDescricao && !ferramentaId) {
      return Response.json({ message: 'Nada a limpar' });
    }

    // Buscar todas as funções da empresa
    const funcoes = empresaId
      ? await base44.asServiceRole.entities.Funcao.filter({ empresa_id: empresaId })
      : await base44.asServiceRole.entities.Funcao.list();

    let totalAtualizadas = 0;

    for (const funcao of funcoes) {
      let atualizar = false;
      let novoModeloFerramentas = funcao.modelo_ferramentas;
      let novoModeloEpi = funcao.modelo_epi;

      // Limpar de modelo_ferramentas
      try {
        const itens = JSON.parse(funcao.modelo_ferramentas || '[]');
        const filtrados = itens.filter(i => {
          const desc = (i.ferramenta || i.descricao || i.nome || '').toLowerCase().trim();
          return desc !== ferramentaDescricao;
        });
        if (filtrados.length !== itens.length) {
          novoModeloFerramentas = JSON.stringify(filtrados);
          atualizar = true;
        }
      } catch {}

      // Limpar de modelo_epi
      try {
        const itens = JSON.parse(funcao.modelo_epi || '[]');
        const filtrados = itens.filter(i => {
          const desc = (i.item || i.descricao || i.nome || '').toLowerCase().trim();
          return desc !== ferramentaDescricao;
        });
        if (filtrados.length !== itens.length) {
          novoModeloEpi = JSON.stringify(filtrados);
          atualizar = true;
        }
      } catch {}

      if (atualizar) {
        await base44.asServiceRole.entities.Funcao.update(funcao.id, {
          modelo_ferramentas: novoModeloFerramentas,
          modelo_epi: novoModeloEpi,
        });
        totalAtualizadas++;
      }
    }

    return Response.json({ success: true, funcoes_atualizadas: totalAtualizadas });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});