import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { action, nota_id, payload } = body;

  const FOCUS_API_KEY = Deno.env.get('FOCUSNFE_API_KEY');
  // Use homologacao para testes: homologacao.focusnfe.com.br
  // Para produção: api.focusnfe.com.br
  const FOCUS_BASE_URL = 'https://homologacao.focusnfe.com.br/v2';
  const authHeader = 'Basic ' + btoa(FOCUS_API_KEY + ':');

  // Buscar empresa
  const customAuth = req.headers.get('x-custom-auth') || '{}';

  if (action === 'emitir') {
    // Validar campos obrigatórios
    if (!payload?.destinatario_cnpj || !payload?.itens?.length) {
      return Response.json({ error: 'CNPJ do destinatário e itens são obrigatórios' }, { status: 400 });
    }

    // Buscar dados da empresa emitente
    const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: payload.empresa_id });
    if (!empresas.length) return Response.json({ error: 'Empresa não encontrada' }, { status: 404 });
    const empresa = empresas[0];

    // Gerar referência única
    const focusRef = `DEV-${Date.now()}`;

    // Montar payload Focus NF-e
    const nfePayload = {
      natureza_operacao: 'Devolução de mercadoria ao fornecedor',
      data_emissao: new Date().toISOString(),
      tipo_documento: 1, // Saída
      local_destino: payload.destinatario_uf === (empresa.estado || 'SP') ? 1 : 2, // 1=interna, 2=interestadual
      finalidade_emissao: 4, // Devolução
      consumidor_final: 0,
      presenca_comprador: 9, // Operação não presencial
      emitente: {
        cnpj: (empresa.cnpj || '').replace(/\D/g, ''),
        nome: empresa.razao_social || empresa.nome,
        nome_fantasia: empresa.nome_fantasia || empresa.nome,
        inscricao_estadual: (empresa.inscricao_estadual || '').replace(/\D/g, '') || 'ISENTO',
        regime_tributario: 1, // Simples Nacional (ajustar conforme necessário)
        endereco_logradouro: empresa.endereco || 'Rua sem nome',
        endereco_numero: empresa.numero || 'S/N',
        endereco_complemento: empresa.complemento || '',
        endereco_bairro: empresa.bairro || 'Centro',
        endereco_municipio: empresa.cidade || 'São Paulo',
        endereco_uf: empresa.estado || 'SP',
        endereco_cep: (empresa.cep || '').replace(/\D/g, '') || '01310100',
        endereco_pais: '1058',
        telefone: (empresa.telefone || '').replace(/\D/g, '') || ''
      },
      destinatario: {
        cnpj: payload.destinatario_cnpj.replace(/\D/g, ''),
        nome: payload.destinatario_nome,
        inscricao_estadual: payload.destinatario_ie ? payload.destinatario_ie.replace(/\D/g, '') : 'ISENTO',
        endereco_logradouro: payload.destinatario_endereco || 'Rua sem nome',
        endereco_numero: payload.destinatario_numero || 'S/N',
        endereco_bairro: payload.destinatario_bairro || 'Centro',
        endereco_municipio: payload.destinatario_cidade || 'São Paulo',
        endereco_uf: payload.destinatario_uf || 'SP',
        endereco_cep: (payload.destinatario_cep || '').replace(/\D/g, '') || '01310100',
        endereco_pais: '1058',
        email: payload.destinatario_email || ''
      },
      items: payload.itens.map((item, idx) => ({
        numero_item: idx + 1,
        codigo_produto: item.codigo || `ITEM${idx + 1}`,
        descricao: item.descricao,
        codigo_ncm: (item.ncm || '39269090').replace(/\D/g, ''),
        cfop: item.cfop || (payload.destinatario_uf === (empresa.estado || 'SP') ? '5202' : '6202'),
        unidade_comercial: item.unidade || 'UN',
        quantidade_comercial: item.quantidade,
        valor_unitario_comercial: item.valor_unitario,
        valor_bruto: item.quantidade * item.valor_unitario,
        unidade_tributavel: item.unidade || 'UN',
        quantidade_tributavel: item.quantidade,
        valor_unitario_tributavel: item.valor_unitario,
        codigo_ean: 'SEM GTIN',
        codigo_ean_tributavel: 'SEM GTIN',
        icms_origem: 0,
        icms_modalidade: 400, // ICMS 40 - Isento
        pis_modalidade: 7,    // PIS não incide
        cofins_modalidade: 7  // COFINS não incide
      })),
      notas_fiscais_referenciadas: payload.nfe_referenciada
        ? [{ chave: payload.nfe_referenciada.replace(/\D/g, '') }]
        : [],
      informacoes_adicionais_contribuinte: payload.informacoes_adicionais || `Devolução de mercadoria. Ref. retirada almoxarifado: ${payload.almoxarifado_nome || ''}`
    };

    // Enviar para Focus NF-e
    const focusRes = await fetch(`${FOCUS_BASE_URL}/nfe?ref=${focusRef}`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(nfePayload)
    });

    const focusData = await focusRes.json();

    // Atualizar nota no banco
    if (nota_id) {
      const status = focusData.status === 'autorizado' ? 'Autorizada' :
                     focusData.status === 'erro' ? 'Erro' : 'Enviando';
      
      await base44.asServiceRole.entities.NotaFiscalDevolucao.update(nota_id, {
        focus_ref: focusRef,
        status,
        chave_acesso: focusData.chave_nfe || null,
        protocolo: focusData.protocolo || null,
        pdf_url: focusData.caminho_danfe || null,
        xml_url: focusData.caminho_xml_nota_fiscal || null,
        mensagem_erro: focusData.erros ? JSON.stringify(focusData.erros) : null
      });
    }

    return Response.json({ success: true, focus_ref: focusRef, data: focusData });
  }

  if (action === 'consultar') {
    if (!payload?.focus_ref) return Response.json({ error: 'focus_ref obrigatório' }, { status: 400 });

    const focusRes = await fetch(`${FOCUS_BASE_URL}/nfe/${payload.focus_ref}`, {
      headers: { 'Authorization': authHeader }
    });
    const focusData = await focusRes.json();

    if (nota_id) {
      const status = focusData.status === 'autorizado' ? 'Autorizada' :
                     focusData.status === 'cancelado' ? 'Cancelada' :
                     focusData.status === 'erro' ? 'Erro' : 'Enviando';
      
      await base44.asServiceRole.entities.NotaFiscalDevolucao.update(nota_id, {
        status,
        chave_acesso: focusData.chave_nfe || null,
        protocolo: focusData.protocolo || null,
        pdf_url: focusData.caminho_danfe || null,
        xml_url: focusData.caminho_xml_nota_fiscal || null,
        mensagem_erro: focusData.erros ? JSON.stringify(focusData.erros) : null
      });
    }

    return Response.json({ success: true, data: focusData });
  }

  return Response.json({ error: 'Ação inválida' }, { status: 400 });
});