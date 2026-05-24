import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { empresa_id } = body;

    if (!empresa_id) {
      return Response.json({ error: 'empresa_id é obrigatório' }, { status: 400 });
    }

    // Buscar todos os saldos da empresa
    const todosOsSaldos = await base44.entities.EstoqueSaldo.filter({
      empresa_id: empresa_id
    });

    // Contar quantos têm quantidade > 0
    const saldosComValor = todosOsSaldos.filter(s => (s.quantidade || 0) > 0);

    return Response.json({
      total_saldos: todosOsSaldos.length,
      saldos_com_valor: saldosComValor.length,
      taxa_ocupacao: ((saldosComValor.length / todosOsSaldos.length) * 100).toFixed(2) + '%',
      detalhes: saldosComValor.map(s => ({
        id: s.id,
        material_id: s.material_id,
        almoxarifado: s.almoxarifado_nome,
        quantidade: s.quantidade
      }))
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});