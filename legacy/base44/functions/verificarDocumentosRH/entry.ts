import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import JSZip from 'npm:jszip@3.10.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { zipUrl, funcionarioId, empresaId } = await req.json();

    if (!zipUrl) {
      return Response.json({ error: 'ZIP URL is required' }, { status: 400 });
    }

    // Baixar o ZIP
    const zipResponse = await fetch(zipUrl);
    const zipBuffer = await zipResponse.arrayBuffer();
    const zip = new JSZip();
    await zip.loadAsync(zipBuffer);

    const documentos = [];
    const erros = [];

    // Processar arquivos do ZIP
    for (const [fileName, file] of Object.entries(zip.files)) {
      if (file.dir) continue;

      try {
        // Ignorar pastas e arquivos ocultos
        if (fileName.startsWith('__MACOSX') || fileName.startsWith('.')) continue;

        const fileContent = await file.async('arraybuffer');
        const base64Content = btoa(String.fromCharCode(...new Uint8Array(fileContent)));

        // Determinar tipo MIME
        let mimeType = 'application/octet-stream';
        if (fileName.toLowerCase().endsWith('.pdf')) mimeType = 'application/pdf';
        else if (fileName.match(/\.(jpg|jpeg)$/i)) mimeType = 'image/jpeg';
        else if (fileName.toLowerCase().endsWith('.png')) mimeType = 'image/png';

        // Usar IA para analisar e classificar o documento
        const analise = await base44.integrations.Core.InvokeLLM({
          prompt: `Você é um especialista em análise de documentos RH. Analise o nome e conteúdo do arquivo (se aplicável) e faça as seguintes análises:

Nome do arquivo: ${fileName}

Tarefas:
1. Identifique qual tipo de documento RH é (ASO - Atestado de Saúde Ocupacional, Exames Médicos, Registro de Empregado, ou Outro)
2. Extraia a data do documento se visível
3. Identifique se há datas de validade ou vencimento
4. Liste informações essenciais encontradas (nome do funcionário, data de emissão, validade, etc)
5. Identifique possíveis inconsistências ou informações faltantes
6. Avalie o nível de confiança na classificação (Alto, Médio, Baixo)

Responda em JSON com esta estrutura:
{
  "tipo_documento": "ASO|ExamesMedicos|RegistroEmpregado|Outro",
  "data_documento": "DD/MM/YYYY ou null",
  "data_validade": "DD/MM/YYYY ou null",
  "informacoes_essenciais": ["info1", "info2"],
  "inconsistencias": ["problema1", "problema2"],
  "confianca": "Alto|Médio|Baixo",
  "motivo": "explicação breve"
}`,
          file_urls: [`data:${mimeType};base64,${base64Content}`],
          response_json_schema: {
            type: "object",
            properties: {
              tipo_documento: { type: "string" },
              data_documento: { type: ["string", "null"] },
              data_validade: { type: ["string", "null"] },
              informacoes_essenciais: { type: "array", items: { type: "string" } },
              inconsistencias: { type: "array", items: { type: "string" } },
              confianca: { type: "string" },
              motivo: { type: "string" }
            }
          }
        });

        documentos.push({
          arquivo: fileName,
          analise: analise
        });
      } catch (error) {
        erros.push({
          arquivo: fileName,
          erro: error.message
        });
      }
    }

    // Organizar documentos por tipo
    const documentosOrganizados = {
      aso: [],
      exames: [],
      registro: [],
      outros: []
    };

    for (const doc of documentos) {
      const tipo = doc.analise.tipo_documento?.toLowerCase() || 'outro';
      if (tipo === 'aso') documentosOrganizados.aso.push(doc);
      else if (tipo === 'examesmedicosé') documentosOrganizados.exames.push(doc);
      else if (tipo === 'registroempregado') documentosOrganizados.registro.push(doc);
      else documentosOrganizados.outros.push(doc);
    }

    return Response.json({
      sucesso: true,
      documentos: documentosOrganizados,
      erros: erros,
      total_processados: documentos.length,
      total_erros: erros.length
    });
  } catch (error) {
    console.error('Erro ao verificar documentos RH:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});