import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { GoogleGenerativeAI } from 'npm:@google/generative-ai@0.21.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { fotoUrl, ferramenta } = await req.json();

    if (!fotoUrl || !ferramenta) {
      return Response.json({ error: 'fotoUrl e ferramenta são obrigatórios' }, { status: 400 });
    }

    const apiKey = Deno.env.get('GOOGLE_AI_API_KEY');
    if (!apiKey) {
      return Response.json({ error: 'GOOGLE_AI_API_KEY não configurada' }, { status: 500 });
    }

    // Inicializar Google AI
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-1.5-flash'
    });

    // Baixar imagem
    const imageResponse = await fetch(fotoUrl);
    const imageBuffer = await imageResponse.arrayBuffer();
    
    // Converter para base64 de forma segura (evita stack overflow em arquivos grandes)
    const uint8Array = new Uint8Array(imageBuffer);
    const chunks = [];
    const chunkSize = 8192; // 8KB por vez
    
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(i, i + chunkSize);
      chunks.push(String.fromCharCode.apply(null, chunk));
    }
    
    const imageBase64 = btoa(chunks.join(''));

    const prompt = `
Analise esta foto de uma ferramenta/equipamento e compare com a descrição da ferramenta esperada.

FERRAMENTA ESPERADA:
- Descrição: ${ferramenta.descricao}
- Código: ${ferramenta.codigo}
${ferramenta.numero_serie ? `- Número de Série: ${ferramenta.numero_serie}` : ''}

VALIDAÇÃO:
1. É a mesma ferramenta descrita?
2. Está em bom estado de conservação?
3. Consegue visualizar identificações (série, código)?

Responda APENAS em formato JSON válido, sem nenhum texto adicional:
{
  "valido": true ou false,
  "confianca": número de 0 a 100,
  "motivo": "explicação breve"
}
`;

    const result = await model.generateContent({
      contents: [{
        role: 'user',
        parts: [
          {
            inlineData: {
              data: imageBase64,
              mimeType: 'image/jpeg'
            }
          },
          { text: prompt }
        ]
      }]
    });

    const response = await result.response;
    const text = response.text();

    // Extrair JSON da resposta
    let jsonResponse;
    try {
      // Tentar limpar a resposta se vier com markdown
      const cleanText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      jsonResponse = JSON.parse(cleanText);
    } catch (e) {
      console.error('Erro ao parsear resposta:', text);
      return Response.json({ 
        error: 'Resposta da IA inválida',
        rawResponse: text 
      }, { status: 500 });
    }

    return Response.json(jsonResponse);

  } catch (error) {
    console.error('Erro na validação com Gemini:', error);
    return Response.json({ 
      error: error.message || 'Erro ao validar com Google AI'
    }, { status: 500 });
  }
});