import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { empresa_origem_id, empresa_destino_id, categorias } = await req.json();

    if (!empresa_origem_id || !empresa_destino_id || !categorias?.length) {
      return Response.json({ error: 'Parâmetros inválidos' }, { status: 400 });
    }

    const resultados = {};

    // Mapeamento de categoria -> entidade
    const ENTIDADES = {
      'treinamentos': 'Treinamento',
      'funcoes': 'Funcao',
      'ferramentas': 'Ferramenta',
      'mao_de_obra': 'MaoDeObra',
      'materiais': 'Material',
      'contas_financeiras': 'ContaFinanceira',
      'categorias_financeiras': 'CategoriaFinanceira',
      'fornecedores': 'Fornecedor',
      'clientes': 'Cliente',
      'almoxarifados': 'Almoxarifado',
    };

    // Campos que NÃO devem ser copiados (metadados do registro original)
    const CAMPOS_EXCLUIR = ['id', 'created_date', 'updated_date', 'created_by'];

    for (const categoria of categorias) {
      const entidade = ENTIDADES[categoria];
      if (!entidade) continue;

      try {
        const registros = await base44.asServiceRole.entities[entidade].filter({ empresa_id: empresa_origem_id });

        if (registros.length === 0) {
          resultados[categoria] = { copiados: 0, total: 0 };
          continue;
        }

        // Remover campos de metadados e trocar empresa_id
        const novosRegistros = registros.map(r => {
          const novo = { ...r };
          CAMPOS_EXCLUIR.forEach(campo => delete novo[campo]);
          novo.empresa_id = empresa_destino_id;
          // Resetar estoque para 0 se for material
          if (categoria === 'materiais') {
            novo.estoque = 0;
            novo.preco_medio = 0;
          }
          return novo;
        });

        // Criar em lotes de 20 para não sobrecarregar
        let copiados = 0;
        for (let i = 0; i < novosRegistros.length; i += 20) {
          const lote = novosRegistros.slice(i, i + 20);
          await base44.asServiceRole.entities[entidade].bulkCreate(lote);
          copiados += lote.length;
        }

        resultados[categoria] = { copiados, total: registros.length };
      } catch (err) {
        console.error(`Erro ao copiar ${categoria}:`, err.message);
        resultados[categoria] = { copiados: 0, total: 0, erro: err.message };
      }
    }

    return Response.json({ success: true, resultados });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});