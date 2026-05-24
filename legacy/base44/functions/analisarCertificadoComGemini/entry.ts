import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const { file_url, treinamento_id, funcionario_id } = await req.json();

    if (!file_url || !treinamento_id) {
      return Response.json({ error: 'file_url e treinamento_id são obrigatórios' }, { status: 400 });
    }

    // Buscar dados do treinamento para comparação de nome
    const treinamentos = await base44.entities.Treinamento.filter({ id: treinamento_id });
    if (treinamentos.length === 0) {
      return Response.json({ error: 'Treinamento não encontrado' }, { status: 404 });
    }
    
    const treinamento = treinamentos[0];
    const nomeTreinamentoEsperado = treinamento.nome || '';

    // Função auxiliar para retry com backoff exponencial
    const invokeWithRetry = async (maxRetries = 3) => {
      let lastError;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          return await base44.integrations.Core.InvokeLLM({
            prompt: `Analise este certificado de treinamento e retorne JSON com:
- data_inicio (YYYY-MM-DD ou null)
- data_fim (YYYY-MM-DD ou null)
- aproveitamento (0-100 ou null)
- nome_treinamento (string ou null)
- hash_documento (hash único do conteúdo para detectar duplicatas)
- problemas_detectados (array de strings: ilegível, sem assinatura, nome diferente de "${nomeTreinamentoEsperado}", dados suspeitos, etc.)
- status: "válido", "incompleto" ou "inválido"
- mensagem (resumo em português)

Treinamento esperado: "${nomeTreinamentoEsperado}"`,
            file_urls: [file_url],
            add_context_from_internet: false,
            response_json_schema: {
              type: "object",
              properties: {
                data_inicio: { type: "string", nullable: true },
                data_fim: { type: "string", nullable: true },
                aproveitamento: { type: "number", nullable: true },
                nome_treinamento: { type: "string", nullable: true },
                hash_documento: { type: "string", description: "Hash para detectar duplicatas" },
                problemas_detectados: { type: "array", items: { type: "string" } },
                status: { type: "string", enum: ["válido", "incompleto", "inválido"] },
                mensagem: { type: "string" }
              },
              required: ["status", "mensagem", "problemas_detectados"]
            }
          });
        } catch (err) {
          lastError = err;
          console.warn(`⚠️ Tentativa ${attempt} falhou:`, err.message);
          
          const isRetryable = err.message?.includes('503') || 
                            err.message?.includes('timeout') ||
                            err.message?.includes('ECONNREFUSED') ||
                            err.message?.includes('ETIMEDOUT');
          
          if (isRetryable && attempt < maxRetries) {
            const delay = Math.pow(2, attempt) * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
      throw lastError || new Error('Falha ao analisar certificado após múltiplas tentativas');
    };

    const response = await invokeWithRetry();

    console.log('🔍 Análise Gemini:', response);

    if (!response || typeof response !== 'object' || !response.status || !response.mensagem) {
      return Response.json({
        status: 'incompleto',
        mensagem: 'Resposta incompleta da IA. Tente novamente.',
        error: 'Validação falhou'
      }, { status: 400 });
    }

    // Verificar se é documento duplicado
    if (funcionario_id && response.hash_documento) {
      const funcionarios = await base44.asServiceRole.entities.Funcionario.filter({ id: funcionario_id });
      if (funcionarios.length > 0) {
        const funcionario = funcionarios[0];
        const anexosExistentes = JSON.parse(funcionario.treinamentos_anexos || '[]');
        
        const documentoDuplicado = anexosExistentes.some(a => 
          a.analise_gemini?.hash_documento === response.hash_documento
        );
        
        if (documentoDuplicado) {
          response.status = 'inválido';
          response.mensagem = '❌ Este documento já foi anexado anteriormente (duplicado detectado).';
          if (!response.problemas_detectados) response.problemas_detectados = [];
          response.problemas_detectados.unshift('Documento duplicado - mesmo arquivo já existe');
        }
      }
    }

    // Formatar mensagem
    if (response.status === 'válido') {
      response.mensagem = `✅ ${response.mensagem || 'Certificado válido e sem problemas detectados.'}`;
    } else if (response.status === 'inválido' && !response.mensagem.startsWith('❌')) {
      response.mensagem = `❌ ${response.mensagem}`;
    } else if (response.status === 'incompleto' && !response.mensagem.startsWith('⚠️')) {
      response.mensagem = `⚠️ ${response.mensagem}`;
    }

    // Se foi válido ou incompleto, SEMPRE atualizar datas/aproveitamento encontrados pela IA
    if (response.status === "válido" || response.status === "incompleto") {
      const dadosAtualizacao = {};

      if (response.data_inicio) dadosAtualizacao.data_inicio = response.data_inicio;
      if (response.data_fim) dadosAtualizacao.data_fim = response.data_fim;
      if (response.aproveitamento !== null && response.aproveitamento !== undefined) {
        dadosAtualizacao.aproveitamento = response.aproveitamento;
      }

      if (Object.keys(dadosAtualizacao).length > 0) {
        await base44.entities.Treinamento.update(treinamento_id, dadosAtualizacao);
        console.log('✅ Treinamento atualizado com dados do certificado:', dadosAtualizacao);
        response.atualizado = true;
        response.campos_atualizados = dadosAtualizacao;
      } else {
        response.atualizado = false;
      }
    }

    return Response.json(response);
  } catch (error) {
    console.error('❌ Erro ao analisar certificado:', error);
    return Response.json({ 
      error: error.message || 'Erro ao analisar certificado',
      status: 'erro'
    }, { status: 500 });
  }
});