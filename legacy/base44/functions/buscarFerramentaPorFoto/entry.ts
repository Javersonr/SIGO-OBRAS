import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { fotoUrl, empresaAtiva } = await req.json();

    if (!fotoUrl || !empresaAtiva) {
      return Response.json({ error: 'fotoUrl e empresaAtiva são obrigatórios' }, { status: 400 });
    }

    const googleApiKey = Deno.env.get('GOOGLE_AI_API_KEY');
    if (!googleApiKey) {
      return Response.json({ error: 'GOOGLE_AI_API_KEY não configurada' }, { status: 500 });
    }

    // Buscar apenas ferramentas da empresa (otimizado no banco)
    const ferramentasEmpresa = await base44.asServiceRole.entities.Ferramenta.filter({
      empresa_id: empresaAtiva.id,
      ativo: true
    });

    console.log(`[BUSCA] Empresa: ${empresaAtiva.id} | Total encontradas: ${ferramentasEmpresa.length}`);

    if (ferramentasEmpresa.length === 0) {
      return Response.json({
        encontrada: false,
        ferramentas: [],
        motivo: 'Nenhuma ferramenta cadastrada na empresa'
      });
    }

    // Converter imagem para base64
    const imagemToBase64 = async (url) => {
      try {
        const imgResponse = await fetch(url);
        if (!imgResponse.ok) return null;
        const arrayBuffer = await imgResponse.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        const chunks = [];
        const chunkSize = 8192;
        for (let i = 0; i < uint8Array.length; i += chunkSize) {
          chunks.push(String.fromCharCode(...uint8Array.subarray(i, i + chunkSize)));
        }
        return btoa(chunks.join(''));
      } catch (e) {
        console.error('Erro base64:', e.message);
        return null;
      }
    };

    // Carregar foto capturada
    const base64Capturada = await imagemToBase64(fotoUrl);
    if (!base64Capturada) {
      return Response.json({
        encontrada: false,
        ferramentas: [],
        motivo: 'Não foi possível carregar a foto capturada'
      });
    }

    // PASSO 1: Identificar tipo da foto
    let tipoCapturado = '';
    try {
      const resDeteccao = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${googleApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: 'Qual tipo de ferramenta é esta? Responda APENAS com uma palavra (ex: alicate, martelo, chave). Responda em JSON: {"tipo": "palavra"}' },
              { inline_data: { mime_type: 'image/jpeg', data: base64Capturada } }
            ]
          }],
          generationConfig: { temperature: 0, maxOutputTokens: 20 }
        })
      });

      const dataDeteccao = await resDeteccao.json();
      const textoDeteccao = dataDeteccao.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const match = textoDeteccao.match(/"tipo"\s*:\s*"([^"]+)"/i);
      if (match) {
        tipoCapturado = match[1].toLowerCase().trim();
        console.log(`[TIPO] Detectado: ${tipoCapturado}`);
      }
    } catch (e) {
      console.error('Erro deteccao tipo:', e.message);
    }

    // PASSO 2: Comparar com cada ferramenta
    const resultados = [];

    for (const ferramenta of ferramentasEmpresa) {
      try {
        const codigoCompleto = ferramenta.codigo_secundario 
          ? `${ferramenta.codigo} / ${ferramenta.codigo_secundario}`
          : ferramenta.codigo;

        const parts = [
          {
            text: `A imagem 1 é a ferramenta que estou capturando. A imagem 2 é uma ferramenta cadastrada no sistema como: "${ferramenta.descricao}" (código: ${codigoCompleto}).
          
Pergunta: Eles SÃO O MESMO TIPO DE FERRAMENTA? (não se preocupe com número de série, marca exata, ou estado)

Responda JSON com:
- "match": true se for o mesmo tipo
- "confianca": de 0 a 100 (quanto tem certeza)
- "motivo": breve motivo

IMPORTANTE: Seja generoso - alicate com alicate = match, mesmo que marca/modelo diferentes.`
          }
        ];

        // Adicionar foto capturada (sempre)
        parts.push({ inline_data: { mime_type: 'image/jpeg', data: base64Capturada } });

        // Adicionar foto referência se existir
        if (ferramenta.foto_url) {
          const base64Ref = await imagemToBase64(ferramenta.foto_url);
          if (base64Ref) {
            parts.push({ inline_data: { mime_type: 'image/jpeg', data: base64Ref } });
          }
        }

        const resComparacao = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${googleApiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 100 }
          })
        });

        const dataComparacao = await resComparacao.json();
        const textoComparacao = dataComparacao.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const jsonMatch = textoComparacao.match(/\{[\s\S]*?\}/);

        if (!jsonMatch) {
          console.log(`[${ferramenta.codigo}] Sem resposta JSON`);
          continue;
        }

        const resultado = JSON.parse(jsonMatch[0]);
        console.log(`[${ferramenta.codigo}] Match: ${resultado.match} | Confiança: ${resultado.confianca}`);

        // CRITÉRIO: match=true OU confiança >= 50
        if ((resultado.match === true || resultado.match === 'true') && resultado.confianca >= 40) {
          resultados.push({
            ferramenta,
            confianca: resultado.confianca,
            motivo: resultado.motivo
          });
        } else if (resultado.confianca >= 60) {
          // Ou se a confiança for muito alta mesmo sem match explícito
          resultados.push({
            ferramenta,
            confianca: resultado.confianca,
            motivo: resultado.motivo
          });
        }
      } catch (e) {
        console.error(`[${ferramenta.codigo}] Erro:`, e.message);
        continue;
      }
    }

    // Ordenar por confiança
    resultados.sort((a, b) => b.confianca - a.confianca);

    return Response.json({
      encontrada: resultados.length > 0,
      ferramentas: resultados.slice(0, 5).map(r => ({
        id: r.ferramenta.id,
        codigo: r.ferramenta.codigo,
        codigo_secundario: r.ferramenta.codigo_secundario,
        descricao: r.ferramenta.descricao,
        marca: r.ferramenta.marca,
        modelo: r.ferramenta.modelo,
        numero_serie: r.ferramenta.numero_serie,
        foto_url: r.ferramenta.foto_url,
        confianca: r.confianca,
        motivo: r.motivo
      })),
      motivo: resultados.length > 0 ? `${resultados.length} correspondência(s)` : 'Nenhuma ferramenta similar encontrada'
    });

  } catch (error) {
    console.error('ERRO GERAL:', error);
    return Response.json({
      encontrada: false,
      ferramentas: [],
      error: error.message
    }, { status: 500 });
  }
});