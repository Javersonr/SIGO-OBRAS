import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY");

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const { file_url, tipo_documento, nome_funcionario } = await req.json();

  if (!file_url || !tipo_documento) {
    return Response.json({ error: 'Parâmetros obrigatórios: file_url, tipo_documento' }, { status: 400 });
  }

  const prompts = {
    'ASO - Atestado de Saúde Ocupacional': `Você é um especialista em documentos de Saúde Ocupacional. Analise este documento que deveria ser um ASO (Atestado de Saúde Ocupacional) ${nome_funcionario ? `do funcionário ${nome_funcionario}` : ''}. Verifique: 1) Se realmente é um ASO, 2) Se possui data de emissão e validade visíveis, 3) Se contém nome do funcionário, 4) Se está assinado pelo médico, 5) Se está dentro do prazo de validade. Responda de forma objetiva indicando se está correto ou o que precisa ser verificado.`,
    'CPF': `Analise este documento que deveria ser uma cópia do CPF ${nome_funcionario ? `do funcionário ${nome_funcionario}` : ''}. Verifique se: 1) É realmente um documento de CPF, 2) O número está legível, 3) O nome do titular está visível. Responda indicando se está correto ou o que precisa ser verificado.`,
    'RG': `Analise este documento que deveria ser uma cópia do RG/Identidade ${nome_funcionario ? `do funcionário ${nome_funcionario}` : ''}. Verifique se: 1) É realmente um documento de identidade, 2) Os dados estão legíveis, 3) A foto está presente. Responda indicando se está correto ou o que precisa ser verificado.`,
    'Comprovante de Residência': `Analise este documento que deveria ser um comprovante de residência ${nome_funcionario ? `do funcionário ${nome_funcionario}` : ''}. Verifique se: 1) É realmente um comprovante (conta de água, luz, etc.), 2) Tem data recente (menos de 3 meses), 3) O endereço está legível. Responda indicando se está correto ou o que precisa ser verificado.`,
    'Certidão de Nascimento': `Analise este documento que deveria ser uma certidão de nascimento. Verifique se: 1) É realmente uma certidão de nascimento, 2) Os dados estão legíveis, 3) Parece ser documento oficial. Responda indicando se está correto ou o que precisa ser verificado.`,
    'Certidão de Casamento': `Analise este documento que deveria ser uma certidão de casamento ou declaração de união estável. Verifique se: 1) É realmente este tipo de documento, 2) Os dados estão legíveis, 3) Parece ser documento oficial. Responda indicando se está correto ou o que precisa ser verificado.`,
    'Carteira de Trabalho': `Analise este documento que deveria ser uma cópia da Carteira de Trabalho ${nome_funcionario ? `do funcionário ${nome_funcionario}` : ''}. Verifique se: 1) É realmente uma CTPS, 2) Os dados principais estão visíveis e legíveis. Responda indicando se está correto ou o que precisa ser verificado.`,
    'Título de Eleitor': `Analise este documento que deveria ser uma cópia do Título de Eleitor ${nome_funcionario ? `do funcionário ${nome_funcionario}` : ''}. Verifique se: 1) É realmente um título de eleitor, 2) Os dados estão legíveis. Responda indicando se está correto ou o que precisa ser verificado.`,
    'Certificado de Treinamento': `Você é especialista em segurança do trabalho. Analise este documento que deveria ser um certificado de treinamento ${nome_funcionario ? `do funcionário ${nome_funcionario}` : ''}. Verifique se: 1) É realmente um certificado de treinamento, 2) Possui nome do participante, 3) Possui carga horária, 4) Possui data de realização, 5) Está assinado. Responda indicando se está correto ou o que precisa ser verificado.`,
    'default': `Analise este documento ${nome_funcionario ? `relacionado ao funcionário ${nome_funcionario}` : ''} que deveria ser do tipo "${tipo_documento}". Verifique se: 1) O documento corresponde ao tipo esperado, 2) Os dados estão legíveis, 3) Parece ser um documento válido e oficial. Responda indicando se está correto ou o que precisa ser verificado.`
  };

  const promptKey = Object.keys(prompts).find(k => tipo_documento.includes(k)) || 'default';
  const prompt = prompts[promptKey];

  const body = {
    contents: [{
      parts: [
        { text: prompt + "\n\nIMPORTANTE: Seja direto. Se o documento parecer correto, diga 'Documento aparentemente correto' e o motivo. Se houver problema, descreva claramente o problema em até 2 frases. Responda sempre em português." },
        { inline_data: null }
      ]
    }]
  };

  // Buscar arquivo e converter para base64
  let fileData;
  let mimeType = 'image/jpeg';
  
  try {
    const fileResponse = await fetch(file_url);
    if (!fileResponse.ok) throw new Error('Não foi possível baixar o arquivo');
    
    const contentType = fileResponse.headers.get('content-type') || '';
    if (contentType.includes('pdf')) {
      mimeType = 'application/pdf';
    } else if (contentType.includes('png')) {
      mimeType = 'image/png';
    } else if (contentType.includes('webp')) {
      mimeType = 'image/webp';
    } else {
      mimeType = 'image/jpeg';
    }

    const arrayBuffer = await fileResponse.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    fileData = btoa(binary);
  } catch (err) {
    return Response.json({ error: 'Erro ao processar arquivo: ' + err.message }, { status: 400 });
  }

  body.contents[0].parts[1] = {
    inline_data: {
      mime_type: mimeType,
      data: fileData
    }
  };

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GOOGLE_AI_API_KEY}`;

  const geminiResponse = await fetch(geminiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!geminiResponse.ok) {
    const err = await geminiResponse.text();
    return Response.json({ error: 'Erro no Gemini: ' + err }, { status: 500 });
  }

  const result = await geminiResponse.json();
  const texto = result?.candidates?.[0]?.content?.parts?.[0]?.text || '';

  const isOk = texto.toLowerCase().includes('correto') && 
               !texto.toLowerCase().includes('problema') && 
               !texto.toLowerCase().includes('incorreto') &&
               !texto.toLowerCase().includes('não é') &&
               !texto.toLowerCase().includes('não parece');

  return Response.json({
    ok: isOk,
    mensagem: texto,
    tipo: tipo_documento
  });
});