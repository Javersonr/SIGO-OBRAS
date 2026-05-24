import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Webhook do Asaas não requer autenticação de usuário
    const body = await req.json();
    
    console.log('Webhook Asaas recebido:', body.event);

    const { event, payment } = body;

    if (!payment || !payment.externalReference) {
      return Response.json({ received: true });
    }

    // Buscar boleto pelo número do documento
    const boletos = await base44.asServiceRole.entities.BoletoBancario.filter({
      numero_documento: payment.externalReference
    });

    if (boletos.length === 0) {
      console.log('Boleto não encontrado:', payment.externalReference);
      return Response.json({ received: true });
    }

    const boleto = boletos[0];

    // Atualizar status do boleto conforme evento
    switch (event) {
      case 'PAYMENT_RECEIVED':
      case 'PAYMENT_CONFIRMED':
        await base44.asServiceRole.entities.BoletoBancario.update(boleto.id, {
          status: 'Pago',
          data_pagamento: new Date().toISOString().split('T')[0],
          valor_pago: payment.value || boleto.valor
        });

        // Atualizar pagamento relacionado
        if (boleto.pagamento_id) {
          await base44.asServiceRole.entities.Pagamento.update(boleto.pagamento_id, {
            status: 'Pago',
            data_pagamento: new Date().toISOString().split('T')[0]
          });
        }
        break;

      case 'PAYMENT_OVERDUE':
        await base44.asServiceRole.entities.BoletoBancario.update(boleto.id, {
          status: 'Vencido'
        });

        if (boleto.pagamento_id) {
          await base44.asServiceRole.entities.Pagamento.update(boleto.pagamento_id, {
            status: 'Atrasado'
          });
        }
        break;

      case 'PAYMENT_DELETED':
      case 'PAYMENT_RESTORED':
        await base44.asServiceRole.entities.BoletoBancario.update(boleto.id, {
          status: event === 'PAYMENT_DELETED' ? 'Cancelado' : 'Emitido'
        });
        break;

      default:
        console.log('Evento não tratado:', event);
    }

    return Response.json({ received: true });

  } catch (error) {
    console.error('Erro no webhook Asaas:', error);
    return Response.json({ 
      received: true,
      error: error.message 
    }, { status: 500 });
  }
});