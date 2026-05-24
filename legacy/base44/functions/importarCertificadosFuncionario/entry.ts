import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import JSZip from 'npm:jszip@3.10.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { zipUrl, funcionarioId, empresaId } = await req.json();
    if (!zipUrl || !funcionarioId || !empresaId) {
      return Response.json({ error: 'zipUrl, funcionarioId e empresaId são obrigatórios' }, { status: 400 });
    }

    // Buscar funcionário
    const funcionarios = await base44.asServiceRole.entities.Funcionario.filter({ id: funcionarioId });
    if (funcionarios.length === 0) return Response.json({ error: 'Funcionário não encontrado' }, { status: 404 });
    const funcionario = funcionarios[0];

    // Buscar treinamentos da função
    let treinamentos = [];
    if (funcionario.funcao_id) {
      treinamentos = await base44.asServiceRole.entities.Treinamento.filter({
        empresa_id: empresaId,
        funcao_id: funcionario.funcao_id
      });
    }
    if (treinamentos.length === 0) {
      // fallback: modelos gerais
      const modelos = await base44.asServiceRole.entities.Treinamento.filter({
        empresa_id: empresaId,
        usar_como_modelo: true
      });
      treinamentos = modelos.filter(t => t.ativo !== false);
    }

    // Baixar e descompactar ZIP
    const zipResponse = await fetch(zipUrl);
    const arrayBuffer = await zipResponse.arrayBuffer();
    const zip = new JSZip();
    await zip.loadAsync(arrayBuffer);

    const resultados = [];
    const erros = [];

    // Processar cada PDF do ZIP
    for (const [fileName, file] of Object.entries(zip.files)) {
      if (file.dir) continue;
      if (!fileName.match(/\.(pdf|png|jpg|jpeg)$/i)) continue;

      const nomeArquivo = fileName.split('/').pop();

      try {
        const fileData = await file.async('arraybuffer');
        const ext = nomeArquivo.split('.').pop().toLowerCase();
        const mimeType = ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : 'image/jpeg';
        const blob = new Blob([new Uint8Array(fileData)], { type: mimeType });

        // Upload do arquivo
        const uploadResult = await base44.asServiceRole.integrations.Core.UploadFile({ file: blob });
        const fileUrl = uploadResult.file_url;

        // Analisar com Gemini
        const geminiResponse = await base44.asServiceRole.integrations.Core.InvokeLLM({
          prompt: `Analise este certificado de treinamento de segurança do trabalho e extraia os dados. 
O funcionário é: ${funcionario.nome_completo} (CPF: ${funcionario.cpf}).
Nome do arquivo: ${nomeArquivo}.

Extraia:
1. Nome do treinamento/curso exatamente como aparece no certificado
2. Código do treinamento (ex: NR-10, NR-35, TTRP-001)
3. Data de início (formato AAAA-MM-DD)
4. Data de fim/conclusão (formato AAAA-MM-DD)
5. Carga horária em horas (número)
6. Aproveitamento em % (número)

Tente casar o nome do treinamento com um desses treinamentos existentes da função do funcionário (retorne o ID correspondente se encontrar):
${treinamentos.map(t => `ID: ${t.id} | Nome: ${t.nome} | Código: ${t.codigo || ''}`).join('\n')}

Retorne JSON com: treinamento_nome, treinamento_codigo, treinamento_id_match, data_inicio, data_fim, carga_horaria, aproveitamento`,
          file_urls: [fileUrl],
          response_json_schema: {
            type: 'object',
            properties: {
              treinamento_nome: { type: 'string' },
              treinamento_codigo: { type: 'string' },
              treinamento_id_match: { type: 'string' },
              data_inicio: { type: 'string' },
              data_fim: { type: 'string' },
              carga_horaria: { type: 'number' },
              aproveitamento: { type: 'number' }
            }
          }
        });

        // Tentar casar com treinamento da função
        let treinamentoMatch = null;

        // 1) Pelo ID sugerido pelo Gemini
        if (geminiResponse.treinamento_id_match) {
          treinamentoMatch = treinamentos.find(t => t.id === geminiResponse.treinamento_id_match);
        }

        // 2) Pelo nome/código
        if (!treinamentoMatch && geminiResponse.treinamento_nome) {
          const nomeLower = geminiResponse.treinamento_nome.toLowerCase();
          treinamentoMatch = treinamentos.find(t =>
            t.nome?.toLowerCase() === nomeLower ||
            t.nome?.toLowerCase().includes(nomeLower) ||
            nomeLower.includes(t.nome?.toLowerCase() || '') ||
            (t.codigo && geminiResponse.treinamento_codigo && t.codigo.toLowerCase() === geminiResponse.treinamento_codigo.toLowerCase())
          );
        }

        // 3) Pelo nome do arquivo
        if (!treinamentoMatch) {
          const nomeArquivoLower = nomeArquivo.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ').toLowerCase();
          treinamentoMatch = treinamentos.find(t =>
            t.nome?.toLowerCase().includes(nomeArquivoLower) ||
            nomeArquivoLower.includes(t.nome?.toLowerCase() || '')
          );
        }

        // Atualizar datas do treinamento se encontrou match
        if (treinamentoMatch && (geminiResponse.data_inicio || geminiResponse.data_fim)) {
          const updateData = {};
          if (geminiResponse.data_inicio) updateData.data_inicio = geminiResponse.data_inicio;
          if (geminiResponse.data_fim) updateData.data_fim = geminiResponse.data_fim;
          if (geminiResponse.aproveitamento) updateData.aproveitamento = geminiResponse.aproveitamento;
          await base44.asServiceRole.entities.Treinamento.update(treinamentoMatch.id, updateData);
        }

        resultados.push({
          arquivo: nomeArquivo,
          file_url: fileUrl,
          treinamento_nome: geminiResponse.treinamento_nome || nomeArquivo.replace(/\.[^.]+$/, ''),
          treinamento_id: treinamentoMatch?.id || null,
          treinamento_codigo: geminiResponse.treinamento_codigo || '',
          data_inicio: geminiResponse.data_inicio || '',
          data_fim: geminiResponse.data_fim || '',
          carga_horaria: geminiResponse.carga_horaria || null,
          aproveitamento: geminiResponse.aproveitamento || null,
          status: 'ok',
          match_encontrado: !!treinamentoMatch,
          match_nome: treinamentoMatch?.nome || null
        });

      } catch (error) {
        erros.push({
          arquivo: nomeArquivo,
          motivo: error.message
        });
      }
    }

    return Response.json({
      sucesso: true,
      funcionario_nome: funcionario.nome_completo,
      total: resultados.length + erros.length,
      processados: resultados.length,
      erros_count: erros.length,
      resultados,
      erros
    });

  } catch (error) {
    console.error('Erro geral:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});