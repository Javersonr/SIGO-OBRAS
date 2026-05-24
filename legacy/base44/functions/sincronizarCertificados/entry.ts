import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const { empresa_id, funcao_id } = await req.json();

    if (!empresa_id) {
      return Response.json({ error: 'empresa_id é obrigatório' }, { status: 400 });
    }

    // Buscar todos os treinamentos da empresa/função
    const query = { empresa_id };
    if (funcao_id) {
      query.funcao_id = funcao_id;
    }

    const treinamentos = await base44.entities.Treinamento.filter(query);

    if (treinamentos.length === 0) {
      return Response.json({
        sucesso: 0,
        erros: 0,
        mensagem: 'Nenhum treinamento encontrado'
      });
    }

    // Varredura e consolidação
    let sincronizados = 0;
    let erros = 0;
    const problemas = [];

    // Buscar DocumentoEmpresa para referência
    const documentos = await base44.entities.DocumentoEmpresa.filter({
      empresa_id
    });

    // Buscar Funcionários relacionados
    const funcionarios = await base44.entities.Funcionario.filter({
      empresa_id
    });

    // Verificar duplicatas e integridade
    const treinamentosMap = new Map();
    const duplicatas = [];

    for (const treinamento of treinamentos) {
      const chave = `${treinamento.nome}_${treinamento.codigo || ''}`;
      
      if (treinamentosMap.has(chave)) {
        // Encontrou duplicata
        duplicatas.push({
          id: treinamento.id,
          nome: treinamento.nome,
          codigo: treinamento.codigo,
          funcao_id: treinamento.funcao_id,
          chave
        });
      } else {
        treinamentosMap.set(chave, treinamento);
      }
    }

    // Consolidar treinamentos duplicados
    for (const duplicata of duplicatas) {
      try {
        // Se houver múltiplas cópias, manter a mais recente e desativar as antigas
        const original = treinamentosMap.get(duplicata.chave);
        
        if (original && original.created_date < duplicata.id) {
          // A duplicata é mais recente, fazer merge dos dados
          const dadosMerge = {
            ...original,
            ...duplicata,
            ativo: true,
            usar_como_modelo: original.usar_como_modelo || duplicata.funcao_id === null
          };
          
          await base44.entities.Treinamento.update(original.id, dadosMerge);
          await base44.entities.Treinamento.delete(duplicata.id);
        } else {
          // Desativar duplicata e manter original
          await base44.entities.Treinamento.update(duplicata.id, { ativo: false });
        }
        
        sincronizados++;
      } catch (error) {
        erros++;
        problemas.push({
          tipo: 'consolidacao',
          treinamento: duplicata.nome,
          motivo: error.message
        });
      }
    }

    // Verificar e sincronizar dados de treinamentos com funções
    for (const treinamento of treinamentos) {
      try {
        // Se o treinamento tem funcao_id, sincronizar dados da função
        if (treinamento.funcao_id) {
          const funcoes = await base44.entities.Funcao.filter({
            id: treinamento.funcao_id
          });

          if (funcoes.length > 0) {
            const funcao = funcoes[0];
            
            // Atualizar campo de função_id para referência
            if (treinamento.ativo !== false) {
              // Marcar como modelo genérico
              if (!treinamento.usar_como_modelo) {
                await base44.entities.Treinamento.update(treinamento.id, {
                  usar_como_modelo: true
                });
                sincronizados++;
              }
            }
          }
        }

        // Validar integridade de datas
        if (treinamento.data_inicio && treinamento.data_fim) {
          const dataInicio = new Date(treinamento.data_inicio);
          const dataFim = new Date(treinamento.data_fim);
          
          if (dataInicio > dataFim) {
            problemas.push({
              tipo: 'data_invalida',
              treinamento: treinamento.nome,
              motivo: 'Data de início posterior à data de fim'
            });
            erros++;
          }
        }

        // Validar campos obrigatórios
        if (!treinamento.nome || !treinamento.empresa_id) {
          problemas.push({
            tipo: 'campo_obrigatorio',
            treinamento: treinamento.id,
            motivo: 'Faltam campos obrigatórios'
          });
          erros++;
        }
      } catch (error) {
        erros++;
        problemas.push({
          tipo: 'sincronizacao',
          treinamento: treinamento.nome,
          motivo: error.message
        });
      }
    }

    // Registrar auditoria
    try {
      await base44.asServiceRole.entities.AuditLog.create({
        empresa_id,
        usuario_email: 'sistema',
        usuario_nome: 'Sistema',
        tipo_acao: 'configurar',
        entidade: 'Treinamento',
        modulo: 'Segurança do Trabalho',
        descricao: `Sincronização de certificados: ${sincronizados} consolidados, ${erros} erros`,
        status: erros === 0 ? 'sucesso' : 'aviso'
      });
    } catch (auditError) {
      console.error('Erro ao registrar auditoria:', auditError);
    }

    return Response.json({
      sucesso: sincronizados,
      erros,
      total_treinamentos: treinamentos.length,
      duplicatas_encontradas: duplicatas.length,
      problemas_detectados: problemas,
      mensagem: `Sincronização concluída: ${sincronizados} consolidados, ${erros} erros de ${treinamentos.length} treinamentos`
    });
  } catch (error) {
    console.error('Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});