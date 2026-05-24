Deno.serve(async (req) => {
  try {
    const { fotoUrl, ferramenta, fotoOriginalUrl } = await req.json();

    if (!fotoUrl || !ferramenta) {
      return Response.json({ error: 'fotoUrl e ferramenta são obrigatórios' }, { status: 400 });
    }

    const googleApiKey = Deno.env.get('GOOGLE_AI_API_KEY');
    if (!googleApiKey) {
      return Response.json({ error: 'GOOGLE_AI_API_KEY não configurada' }, { status: 500 });
    }

    const prompt = `Você é um especialista em identificação visual de ferramentas e equipamentos.

TAREFA: Compare RIGOROSAMENTE as duas imagens e determine se mostram a MESMA ferramenta física.

IMAGEM 1 (Referência): Foto original cadastrada no sistema
IMAGEM 2 (Inspeção): Foto capturada agora durante inspeção

FERRAMENTA ESPERADA:
- Descrição: ${ferramenta.descricao}
- Marca: ${ferramenta.marca || 'Não informada'}
- Modelo: ${ferramenta.modelo || 'Não informado'}

CRITÉRIOS DE VALIDAÇÃO (em ordem de importância):
1. FORMATO E GEOMETRIA: As ferramentas têm o mesmo formato básico e proporções?
2. TIPO DE FERRAMENTA: São do mesmo tipo/categoria (ex: ambas são alicates, chaves, martelos)?
3. COR PREDOMINANTE: As cores principais são compatíveis?
4. MARCA/LOGO VISÍVEL: Se visível em ambas, são da mesma marca?
5. CARACTERÍSTICAS DISTINTAS: Detalhes únicos (formato do cabo, acabamento, design) são similares?

REGRAS IMPORTANTES:
- Compare características FÍSICAS visíveis, não códigos ou etiquetas
- Se as fotos estão em ângulos diferentes, considere isso
- Pequenas diferenças de desgaste ou sujeira são ACEITÁVEIS
- Focos em diferentes partes da ferramenta são ACEITÁVEIS
- Se não conseguir ver detalhes suficientes, REJEITE (confiança < 50)

EXEMPLOS DE APROVAÇÃO:
✓ Mesma ferramenta em ângulos diferentes
✓ Mesma ferramenta com nível de limpeza diferente
✓ Mesma ferramenta com desgaste do tempo

EXEMPLOS DE REJEIÇÃO:
✗ Tipos diferentes (alicate vs chave)
✗ Tamanhos visivelmente diferentes
✗ Cores completamente diferentes
✗ Formatos incompatíveis
✗ Imagens muito escuras/borradas para confirmar

Responda APENAS em JSON válido:
{
  "mesmaFerramenta": true ou false,
  "confianca": número de 0 a 100,
  "motivo": "explicação clara do porquê aprovou ou rejeitou"
}`;

    // Converter imagens para base64
    const imagesToBase64 = async (urls) => {
      const images = [];
      for (const url of urls) {
        const imgResponse = await fetch(url);
        const arrayBuffer = await imgResponse.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        
        // Converter em chunks para evitar stack overflow
        const chunks = [];
        const chunkSize = 8192;
        for (let i = 0; i < uint8Array.length; i += chunkSize) {
          const chunk = uint8Array.subarray(i, i + chunkSize);
          chunks.push(String.fromCharCode(...chunk));
        }
        
        images.push(btoa(chunks.join('')));
      }
      return images;
    };

    const fileUrls = fotoOriginalUrl ? [fotoOriginalUrl, fotoUrl] : [fotoUrl];
    const base64Images = await imagesToBase64(fileUrls);

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${googleApiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            ...base64Images.map(data => ({
              inline_data: {
                mime_type: 'image/jpeg',
                data: data
              }
            }))
          ]
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 500
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Gemini API Error:', errorData);
      throw new Error(`Gemini API error: ${response.status} - ${errorData}`);
    }

    const data = await response.json();
    
    // Verificar se há candidatos
    if (!data.candidates || data.candidates.length === 0) {
      console.error('Sem candidatos na resposta:', data);
      throw new Error('Resposta da IA inválida - sem candidatos');
    }

    const content = data.candidates[0].content;
    if (!content || !content.parts || content.parts.length === 0) {
      console.error('Sem partes no conteúdo:', content);
      throw new Error('Resposta da IA inválida - sem partes');
    }

    const textoParte = content.parts[0].text;
    console.log('Texto da resposta:', textoParte);

    let resultado;
    try {
      // Limpar markdown se houver
      let textoLimpo = textoParte.trim();
      
      // Remover ```json e ``` se existir
      textoLimpo = textoLimpo.replace(/```json\s*/g, '').replace(/```\s*$/g, '');
      
      // Tentar extrair JSON do texto
      const jsonMatch = textoLimpo.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        resultado = JSON.parse(jsonMatch[0]);
      } else {
        resultado = JSON.parse(textoLimpo);
      }

      // Validar estrutura do resultado
      if (!resultado.hasOwnProperty('mesmaFerramenta') || 
          !resultado.hasOwnProperty('confianca') || 
          !resultado.hasOwnProperty('motivo')) {
        throw new Error('JSON inválido - campos obrigatórios ausentes');
      }

    } catch (parseError) {
      console.error('Erro ao parsear JSON:', parseError);
      console.error('Texto recebido:', textoParte);
      
      // Retornar resposta padrão quando não conseguir processar
      return Response.json({
        mesmaFerramenta: false,
        confianca: 0,
        motivo: 'Erro ao processar: Não foi possível extrair JSON da resposta da IA'
      });
    }

    return Response.json(resultado);

  } catch (error) {
    console.error('Erro na validação com Gemini:', error);
    return Response.json({ 
      error: error.message || 'Erro ao validar com IA'
    }, { status: 500 });
  }
});