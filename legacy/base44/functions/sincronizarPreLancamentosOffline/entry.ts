import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { itensOffline } = await req.json();

    if (!Array.isArray(itensOffline) || itensOffline.length === 0) {
      return Response.json({ error: 'Nenhum item para sincronizar' }, { status: 400 });
    }

    const resultados = [];
    const erros = [];

    // Sincronizar cada item
    for (const item of itensOffline) {
      try {
        // Upload do comprovante se não estiver já na nuvem
        let comprovanteUrl = item.comprovante_url;
        
        if (item.comprovante_url?.startsWith('data:')) {
          // É base64 local, fazer upload
          const blob = await fetch(item.comprovante_url).then(r => r.blob());
          const uploadResult = await base44.integrations.Core.UploadFile({
            file: blob
          });
          comprovanteUrl = uploadResult.file_url;
        }

        // Criar pré-lançamento na nuvem
        const preLancamento = await base44.entities.PreLancamento.create({
          empresa_id: item.empresa_id,
          usuario_email: user.email,
          comprovante_url: comprovanteUrl,
          dados_extraidos: JSON.stringify(item.dados_extraidos),
          status: 'Pendente',
          projeto_id: item.projeto_id,
          projeto_nome: item.projeto_nome,
          conta_financeira_id: item.conta_financeira_id,
          offline: true
        });

        resultados.push({
          idLocal: item.id,
          idRemoto: preLancamento.id,
          sucesso: true
        });
      } catch (error) {
        console.error('Erro ao sincronizar item:', error);
        erros.push({
          idLocal: item.id,
          erro: error.message
        });
      }
    }

    return Response.json({
      sucesso: true,
      sincronizados: resultados.length,
      erros: erros.length,
      detalhes: {
        sucesso: resultados,
        erros: erros
      }
    });
  } catch (error) {
    console.error('Erro na sincronização:', error);
    return Response.json(
      { error: 'Erro ao sincronizar: ' + error.message },
      { status: 500 }
    );
  }
});