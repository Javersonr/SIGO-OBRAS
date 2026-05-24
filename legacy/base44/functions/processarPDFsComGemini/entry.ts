import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import JSZip from 'npm:jszip';

export default async function processarPDFsComGemini(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    
    const { zipBase64, funcionarioId, empresaId } = body;

    if (!zipBase64) {
      return new Response(
        JSON.stringify({ error: 'ZIP não fornecido' }),
        { status: 400 }
      );
    }

    // Decodificar ZIP
    const zipBuffer = Buffer.from(zipBase64, 'base64');
    const zip = await JSZip.loadAsync(zipBuffer);

    const pdfFiles = [];
    zip.forEach((relativePath, file) => {
      if (relativePath.toLowerCase().endsWith('.pdf') && !file.dir) {
        pdfFiles.push({ path: relativePath, file });
      }
    });

    if (pdfFiles.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Nenhum PDF encontrado no ZIP' }),
        { status: 400 }
      );
    }

    const treinamentosExtraidos = [];

    // Processar cada PDF
    for (const { path, file } of pdfFiles) {
      try {
        const pdfBuffer = await file.async('arraybuffer');
        const base64PDF = Buffer.from(pdfBuffer).toString('base64');

        // Upload do PDF
        const uploadResponse = await base44.integrations.Core.UploadFile({
          file: `data:application/pdf;base64,${base64PDF}`
        });

        const fileUrl = uploadResponse.file_url;

        // Analisar PDF com Gemini Vision
        const analiseResponse = await base44.integrations.Core.InvokeLLM({
          prompt: `Analise este PDF de treinamento e extraia as seguintes informações em formato JSON:
          {
            "nome_treinamento": "Nome do treinamento/norma (ex: NR-10, NR-35, NR-33)",
            "codigo": "Código se existir",
            "carga_horaria": "Carga horária em horas",
            "data_inicio": "Data de início no formato YYYY-MM-DD",
            "data_fim": "Data de fim no formato YYYY-MM-DD",
            "aluno_nome": "Nome do aluno/participante",
            "instrutor_nome": "Nome do instrutor se disponível",
            "conteudo_programatico": "Resumo do conteúdo",
            "validade_meses": "Meses de validade"
          }
          
          Retorne APENAS o JSON, sem explicações adicionais.`,
          add_context_from_internet: false,
          file_urls: [fileUrl],
          response_json_schema: {
            type: 'object',
            properties: {
              nome_treinamento: { type: 'string' },
              codigo: { type: 'string' },
              carga_horaria: { type: 'number' },
              data_inicio: { type: 'string' },
              data_fim: { type: 'string' },
              aluno_nome: { type: 'string' },
              instrutor_nome: { type: 'string' },
              conteudo_programatico: { type: 'string' },
              validade_meses: { type: 'number' }
            }
          }
        });

        treinamentosExtraidos.push({
          ...analiseResponse,
          pdf_url: fileUrl,
          arquivo_original: path
        });
      } catch (error) {
        console.error(`Erro ao processar PDF ${path}:`, error);
        treinamentosExtraidos.push({
          arquivo_original: path,
          erro: 'Falha ao analisar PDF',
          pdf_url: null
        });
      }
    }

    return new Response(
      JSON.stringify({
        sucesso: true,
        totalPDFs: pdfFiles.length,
        treinamentos: treinamentosExtraidos
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Erro:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500 }
    );
  }
}