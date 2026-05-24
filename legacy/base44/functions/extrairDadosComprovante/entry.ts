import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json();
    const file_url = body.file_url;

    if (!file_url) {
      return Response.json({ error: 'file_url é obrigatório' }, { status: 400 });
    }

    const isPdf = file_url.toLowerCase().includes('.pdf') || file_url.toLowerCase().includes('pdf');

    let dados;

    if (isPdf) {
      const result = await base44.asServiceRole.integrations.Core.ExtractDataFromUploadedFile({
        file_url,
        json_schema: {
          type: "object",
          properties: {
            valor: { type: "number", description: "Valor total do documento em reais (número)" },
            fornecedor: { type: "string", description: "Nome completo do emitente/fornecedor/empresa que emitiu" },
            cnpj: { type: "string", description: "CNPJ do fornecedor" },
            endereco: { type: "string", description: "Endereço do fornecedor" },
            telefone: { type: "string", description: "Telefone do fornecedor" },
            descricao: { type: "string", description: "Descrição dos produtos ou serviços" },
            data: { type: "string", description: "Data de emissão no formato YYYY-MM-DD" }
          },
          required: ["valor", "fornecedor", "descricao", "data"]
        }
      });

      if (result.status !== 'success' || !result.output) {
        throw new Error(result.details || 'Falha ao extrair dados do PDF');
      }
      dados = Array.isArray(result.output) ? result.output[0] : result.output;
    } else {
      dados = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: `Você é um especialista em análise de documentos fiscais e financeiros.

Analise este comprovante (nota fiscal, recibo, nota branca, cupom fiscal, NF-e, RPA, etc) e SEMPRE retorne JSON válido com os campos abaixo.

INSTRUÇÕES CRÍTICAS:
1. "valor": SEMPRE procure por valores monetários em R$. Pode ser "Total", "TOTAL", "Subtotal", "Valor a pagar", "Soma", "Total Geral". Se tiver várias linhas, use o maior ou o total final. RETORNE COMO NÚMERO (ex: 123.45, não "R$ 123,45").
2. "fornecedor": SEMPRE o nome COMPLETO da empresa/loja/prestador que EMITIU o documento. Procure por "Razão Social", "CNPJ", "Estabelecimento", "Emitente". NUNCA deixe vazio.
3. "cnpj": CNPJ do fornecedor (apenas números e caracteres). Se não encontrar, deixe vazio ("").
4. "endereco": Endereço completo do fornecedor. Se não encontrar, deixe vazio ("").
5. "telefone": Telefone do fornecedor. Se não encontrar, deixe vazio ("").
6. "descricao": Descrição clara dos PRODUTOS ou SERVIÇOS (ex: "Cimento 50kg, areia, tijolos", "Reparação hidráulica", "Combustível"). Se não conseguir extrair itens específicos, use o tipo de serviço ou nome do fornecedor. NUNCA deixe vazio.
7. "data": Data do documento em YYYY-MM-DD. Se não encontrar data de emissão, use data de vencimento ou competência. NUNCA deixe vazio.

RETORNE SEMPRE JSON VÁLIDO com TODOS os campos preenchidos (use "" ou 0 para campos vazios):`,
        file_urls: [file_url],
        response_json_schema: {
          type: "object",
          properties: {
            valor: { type: "number", description: "Valor total em reais como número" },
            fornecedor: { type: "string", description: "Nome do estabelecimento/fornecedor" },
            cnpj: { type: "string", description: "CNPJ do fornecedor" },
            endereco: { type: "string", description: "Endereço do fornecedor" },
            telefone: { type: "string", description: "Telefone do fornecedor" },
            descricao: { type: "string", description: "Descrição dos produtos ou serviços comprados" },
            data: { type: "string", description: "Data no formato YYYY-MM-DD" }
          },
          required: ["valor", "fornecedor", "descricao", "data"]
        }
      });
    }

    const dadosNormalizados = {
      valor: dados.valor || 0,
      fornecedor: dados.fornecedor || "Fornecedor não identificado",
      cnpj: dados.cnpj || "",
      endereco: dados.endereco || "",
      telefone: dados.telefone || "",
      descricao: dados.descricao || "Comprovante enviado",
      data: dados.data || new Date().toISOString().split('T')[0]
    };

    return Response.json({ sucesso: true, dados: dadosNormalizados });
  } catch (error) {
    console.error('Erro ao extrair dados:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});