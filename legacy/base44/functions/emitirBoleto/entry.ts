import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Verificar autenticação
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const { boleto_id, gateway } = await req.json();

    if (!boleto_id) {
      return Response.json({ error: 'ID do boleto é obrigatório' }, { status: 400 });
    }

    // Buscar boleto
    const boletos = await base44.asServiceRole.entities.BoletoBancario.filter({ id: boleto_id });
    if (boletos.length === 0) {
      return Response.json({ error: 'Boleto não encontrado' }, { status: 404 });
    }

    const boleto = boletos[0];
    const gatewayEscolhido = gateway || boleto.gateway || 'Asaas';

    // Integração com Asaas
    if (gatewayEscolhido === 'Asaas') {
      const asaasApiKey = Deno.env.get('ASAAS_API_KEY');
      
      if (!asaasApiKey) {
        return Response.json({ 
          error: 'Configure a chave ASAAS_API_KEY nas variáveis de ambiente',
          boleto_manual: true 
        }, { status: 400 });
      }

      // Criar cobrança no Asaas
      const asaasResponse = await fetch('https://sandbox.asaas.com/api/v3/payments', {
        method: 'POST',
        headers: {
          'access_token': asaasApiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          customer: boleto.empresa_id,
          billingType: 'BOLETO',
          value: boleto.valor,
          dueDate: boleto.data_vencimento,
          description: `Boleto ${boleto.numero_documento}`,
          externalReference: boleto.numero_documento,
          postalService: false,
          split: []
        })
      });

      const asaasData = await asaasResponse.json();

      if (!asaasResponse.ok) {
        return Response.json({ 
          error: 'Erro ao emitir boleto no Asaas',
          details: asaasData 
        }, { status: 400 });
      }

      // Atualizar boleto com dados do Asaas
      await base44.asServiceRole.entities.BoletoBancario.update(boleto.id, {
        id_externo: asaasData.id,
        linha_digitavel: asaasData.bankSlipUrl ? 'Disponível no link' : null,
        url_boleto: asaasData.bankSlipUrl,
        status: 'Enviado',
        gateway: 'Asaas'
      });

      return Response.json({
        success: true,
        boleto: {
          id: boleto.id,
          url_boleto: asaasData.bankSlipUrl,
          linha_digitavel: asaasData.identificationField,
          id_externo: asaasData.id,
          gateway: 'Asaas'
        }
      });
    }

    // Integração com Gerencianet
    if (gatewayEscolhido === 'Gerencianet') {
      const gnClientId = Deno.env.get('GERENCIANET_CLIENT_ID');
      const gnClientSecret = Deno.env.get('GERENCIANET_CLIENT_SECRET');

      if (!gnClientId || !gnClientSecret) {
        return Response.json({ 
          error: 'Configure GERENCIANET_CLIENT_ID e GERENCIANET_CLIENT_SECRET',
          boleto_manual: true 
        }, { status: 400 });
      }

      // Aqui entraria a lógica da Gerencianet
      // Similar ao Asaas, mas com os endpoints específicos
      
      return Response.json({ 
        error: 'Integração Gerencianet em desenvolvimento',
        boleto_manual: true 
      }, { status: 501 });
    }

    // Gateway manual - apenas atualiza status
    await base44.asServiceRole.entities.BoletoBancario.update(boleto.id, {
      status: 'Emitido',
      gateway: 'Manual'
    });

    return Response.json({
      success: true,
      boleto_manual: true,
      message: 'Boleto registrado como manual. Configure um gateway para emissão automática.'
    });

  } catch (error) {
    console.error('Erro ao emitir boleto:', error);
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});