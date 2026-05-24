import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import JSZip from 'npm:jszip@3.10.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const { zipUrl, empresaId } = await req.json();

    if (!zipUrl || !empresaId) {
      return Response.json({ error: 'ZIP URL and empresa ID required' }, { status: 400 });
    }

    // Baixar ZIP da URL
    const zipResponse = await fetch(zipUrl);
    const arrayBuffer = await zipResponse.arrayBuffer();
    const zip = new JSZip();
    await zip.loadAsync(arrayBuffer);

    const processados = [];
    const erros = [];

    // Processar cada arquivo do ZIP
    for (const [fileName, file] of Object.entries(zip.files)) {
      if (file.dir) continue;

      try {
         // Extrair nome do funcionário da pasta (suporta vários formatos)
         const partes = fileName.split('/').filter(p => p.trim());

         if (partes.length < 2) continue; // Precisa estar dentro de uma pasta

         const nomePasta = partes[0];
         const nomeArquivo = partes[partes.length - 1];

         // Ignorar arquivos que não são PDF ou imagem
         if (!nomeArquivo.match(/\.(pdf|png|jpg|jpeg)$/i)) continue;

        // Obter dados do arquivo
        const fileData = await file.async('arraybuffer');
        const mimeType = file.name.endsWith('.pdf') ? 'application/pdf' : file.name.endsWith('.jpg') || file.name.endsWith('.jpeg') ? 'image/jpeg' : 'image/png';

        // Criar Blob com dados do arquivo
        const blob = new Blob([new Uint8Array(fileData)], { type: mimeType });

        // Fazer upload do arquivo
        const uploadResult = await base44.integrations.Core.UploadFile({ file: blob });

        // Usar Gemini IA para extrair informações do certificado
        const geminiResponse = await base44.integrations.Core.InvokeLLM({
          prompt: `Analise este certificado de treinamento e extraia os seguintes dados:
1. Nome completo do funcionário
2. CPF do funcionário (se visível)
3. Nome do treinamento/curso
4. Código do treinamento (se houver)
5. Data de início do treinamento
6. Data de fim do treinamento
7. Carga horária
8. Aproveitamento/aprovação (percentual ou texto)
9. Nome do instrutor
10. Nome do responsável técnico

Retorne em formato JSON com as seguintes chaves: funcionario_nome, funcionario_cpf, treinamento_nome, treinamento_codigo, data_inicio, data_fim, carga_horaria, aproveitamento, instrutor_nome, responsavel_tecnico_nome`,
          file_urls: [uploadResult.file_url],
          response_json_schema: {
            type: 'object',
            properties: {
              funcionario_nome: { type: 'string' },
              funcionario_cpf: { type: 'string' },
              treinamento_nome: { type: 'string' },
              treinamento_codigo: { type: 'string' },
              data_inicio: { type: 'string' },
              data_fim: { type: 'string' },
              carga_horaria: { type: 'number' },
              aproveitamento: { type: 'string' },
              instrutor_nome: { type: 'string' },
              responsavel_tecnico_nome: { type: 'string' }
            }
          }
        });

        // Buscar funcionário pelo CPF extraído do certificado
        let funcionario = null;
        if (geminiResponse.funcionario_cpf) {
          const funcionarios = await base44.asServiceRole.entities.Funcionario.filter({
            empresa_id: empresaId,
            cpf: geminiResponse.funcionario_cpf.replace(/\D/g, '')
          });
          if (funcionarios.length > 0) funcionario = funcionarios[0];
        }

        // Se não encontrou pelo CPF, tentar pelo nome da pasta (primeira prioridade)
        if (!funcionario) {
          const nomeParaNormalizacao = nomePasta.replace(/[_-]/g, ' ').trim();
          const funcionarios = await base44.asServiceRole.entities.Funcionario.filter({
            empresa_id: empresaId
          });
          funcionario = funcionarios.find(f => 
            f.nome_completo?.toLowerCase() === nomeParaNormalizacao.toLowerCase() ||
            f.nome_completo?.toLowerCase().includes(nomeParaNormalizacao.toLowerCase())
          );
        }

        // Se não encontrou, tentar pelo nome do certificado
        if (!funcionario && geminiResponse.funcionario_nome) {
          const funcionarios = await base44.asServiceRole.entities.Funcionario.filter({
            empresa_id: empresaId
          });
          funcionario = funcionarios.find(f => 
            f.nome_completo?.toLowerCase().includes(geminiResponse.funcionario_nome.toLowerCase())
          );
        }

        if (!funcionario) {
          erros.push({
            arquivo: nomeArquivo,
            motivo: `Funcionário não encontrado: ${geminiResponse.funcionario_nome}`
          });
          continue;
        }

        // Buscar ou criar treinamento
        let treinamento = null;
        const treinamentos = await base44.asServiceRole.entities.Treinamento.filter({
          empresa_id: empresaId,
          nome: geminiResponse.treinamento_nome
        });

        if (treinamentos.length > 0) {
          treinamento = treinamentos[0];
        } else {
          // Criar novo treinamento se não existir
          treinamento = await base44.asServiceRole.entities.Treinamento.create({
            empresa_id: empresaId,
            nome: geminiResponse.treinamento_nome,
            codigo: geminiResponse.treinamento_codigo || '',
            data_inicio: geminiResponse.data_inicio || null,
            data_fim: geminiResponse.data_fim || null,
            carga_horaria: geminiResponse.carga_horaria || 0,
            instrutor_nome: geminiResponse.instrutor_nome || '',
            responsavel_tecnico_nome: geminiResponse.responsavel_tecnico_nome || ''
          });
        }

        // Atualizar certificado_url e datas do funcionário
        const certificadosExistentes = funcionario.certificados_treinamentos ? 
          JSON.parse(funcionario.certificados_treinamentos) : [];

        const certIndex = certificadosExistentes.findIndex(c => c.treinamento_id === treinamento.id);
        const certData = {
          treinamento_id: treinamento.id,
          treinamento_nome: treinamento.nome,
          certificado_url: uploadResult.file_url,
          data_inicio: geminiResponse.data_inicio || treinamento.data_inicio,
          data_fim: geminiResponse.data_fim || treinamento.data_fim,
          aproveitamento: geminiResponse.aproveitamento || '',
          data_criacao: new Date().toISOString()
        };

        if (certIndex >= 0) {
          certificadosExistentes[certIndex] = certData;
        } else {
          certificadosExistentes.push(certData);
        }

        // Salvar funcionário atualizado
        await base44.asServiceRole.entities.Funcionario.update(funcionario.id, {
          certificados_treinamentos: JSON.stringify(certificadosExistentes)
        });

        // Se datas do treinamento estão vazias, atualizar com dados do certificado
        if (!treinamento.data_inicio && geminiResponse.data_inicio) {
          await base44.asServiceRole.entities.Treinamento.update(treinamento.id, {
            data_inicio: geminiResponse.data_inicio,
            data_fim: geminiResponse.data_fim || null
          });
        }

        processados.push({
          arquivo: nomeArquivo,
          funcionario: funcionario.nome_completo,
          treinamento: treinamento.nome,
          data_inicio: geminiResponse.data_inicio || treinamento.data_inicio,
          data_fim: geminiResponse.data_fim || treinamento.data_fim,
          certificado_url: uploadResult.file_url
        });
      } catch (error) {
        console.error('Erro ao processar arquivo:', fileName, error);
        erros.push({
          arquivo: fileName,
          motivo: error.message
        });
      }
    }

    return Response.json({
      sucesso: processados.length,
      erros_count: erros.length,
      processados,
      erros
    });
  } catch (error) {
    console.error('Erro geral:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});