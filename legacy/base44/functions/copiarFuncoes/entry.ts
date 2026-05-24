import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const body = await req.json();
    const { empresa_origem_id, empresa_destino_id } = body;

    if (!empresa_origem_id || !empresa_destino_id) {
      return Response.json({ error: 'IDs de empresa obrigatórios' }, { status: 400 });
    }

    // Buscar todas as funções da empresa origem
    const funcoes = await base44.entities.Funcao.filter({ empresa_id: empresa_origem_id });
    
    // Buscar treinamentos modelo
    const treinamentosModelo = await base44.entities.Treinamento.filter({ 
      empresa_id: empresa_origem_id,
      usar_como_modelo: true
    });

    let copiadas = 0;
    const erros = [];

    // Copiar cada função para a empresa destino
    for (const funcao of funcoes) {
      try {
        const { id, created_date, updated_date, created_by, ...dadosFuncao } = funcao;
        
        // Mudar empresa_id para a empresa destino
        dadosFuncao.empresa_id = empresa_destino_id;

        const novaFuncao = await base44.entities.Funcao.create(dadosFuncao);
        
        // Buscar treinamentos da função origem
        const treinamentosFuncao = await base44.entities.Treinamento.filter({ 
          empresa_id: empresa_origem_id,
          funcao_id: funcao.id
        });
        
        // Copiar treinamentos
        for (const treinamento of treinamentosFuncao) {
          try {
            const { id, created_date, updated_date, created_by, ...dadosTreinamento } = treinamento;
            
            // Se não tiver instrutor/responsavel, buscar do modelo
            if (!dadosTreinamento.instrutor_nome || !dadosTreinamento.responsavel_tecnico_nome) {
              const modelo = treinamentosModelo.find(m => m.codigo === treinamento.codigo);
              if (modelo) {
                dadosTreinamento.instrutor_nome = dadosTreinamento.instrutor_nome || modelo.instrutor_nome;
                dadosTreinamento.instrutor_cpf = dadosTreinamento.instrutor_cpf || modelo.instrutor_cpf;
                dadosTreinamento.instrutor_assinatura_url = dadosTreinamento.instrutor_assinatura_url || modelo.instrutor_assinatura_url;
                dadosTreinamento.responsavel_tecnico_nome = dadosTreinamento.responsavel_tecnico_nome || modelo.responsavel_tecnico_nome;
                dadosTreinamento.responsavel_tecnico_criacao = dadosTreinamento.responsavel_tecnico_criacao || modelo.responsavel_tecnico_criacao;
                dadosTreinamento.engenheiro_responsavel_nome = dadosTreinamento.engenheiro_responsavel_nome || modelo.engenheiro_responsavel_nome;
                dadosTreinamento.engenheiro_responsavel_crea = dadosTreinamento.engenheiro_responsavel_crea || modelo.engenheiro_responsavel_crea;
                dadosTreinamento.engenheiro_responsavel_assinatura_url = dadosTreinamento.engenheiro_responsavel_assinatura_url || modelo.engenheiro_responsavel_assinatura_url;
              }
            }
            
            dadosTreinamento.empresa_id = empresa_destino_id;
            dadosTreinamento.funcao_id = novaFuncao.id;
            
            await base44.entities.Treinamento.create(dadosTreinamento);
          } catch (error) {
            erros.push(`Erro ao copiar treinamento ${treinamento.nome}: ${error.message}`);
          }
        }
        
        copiadas++;
      } catch (error) {
        erros.push(`Erro ao copiar função ${funcao.nome}: ${error.message}`);
      }
    }

    return Response.json({
      sucesso: true,
      total_funcoes: funcoes.length,
      copiadas,
      erros
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});