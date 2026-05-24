import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { numero } = body;

    if (!numero) {
      return Response.json({ error: 'Número da reserva é obrigatório' }, { status: 400 });
    }

    // Buscar a reserva pelo número
    const reservas = await base44.asServiceRole.entities.ReservaMaterial.filter({
      numero: numero
    });

    if (reservas.length === 0) {
      return Response.json({ 
        error: 'Reserva não encontrada',
        numero: numero
      }, { status: 404 });
    }

    // Pegar o grupo_id da primeira reserva (todas as do mesmo grupo tem o mesmo grupo_id)
    const grupo_id = reservas[0].grupo_id;

    // Buscar todos os materiais dessa reserva pelo grupo_id
    const materiaisReserva = await base44.asServiceRole.entities.ReservaMaterial.filter({
      grupo_id: grupo_id
    });

    return Response.json({
      numero_reserva: numero,
      grupo_id: grupo_id,
      total_materiais: materiaisReserva.length,
      materiais: materiaisReserva.map(m => ({
        id: m.id,
        material_codigo: m.material_codigo,
        material_descricao: m.material_descricao,
        quantidade_reservada: m.quantidade_reservada,
        unidade: m.unidade,
        almoxarifado_nome: m.almoxarifado_nome,
        projeto_nome: m.projeto_nome,
        status: m.status
      }))
    });
  } catch (error) {
    console.error('Erro ao verificar materiais:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});