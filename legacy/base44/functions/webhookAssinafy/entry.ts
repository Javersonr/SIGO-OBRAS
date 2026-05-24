import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

const ASSINAFY_API_KEY = Deno.env.get("ASSINAFY_API_KEY");
const ASSINAFY_ACCOUNT_ID = Deno.env.get("ASSINAFY_ACCOUNT_ID");
const BASE_URL = "https://api.assinafy.com.br/v1";

Deno.serve(async (req) => {
    // Webhook não requer autenticação do usuário - validar via payload
    if (req.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    const payload = await req.json();
    console.log('[webhookAssinafy] Evento recebido:', JSON.stringify(payload));

    // Eventos de assinatura concluída
    const evento = payload?.event || payload?.type || '';
    const documentId = payload?.document?.id || payload?.data?.document_id || payload?.document_id;

    if (!documentId) {
        console.log('[webhookAssinafy] Sem document_id, ignorando');
        return Response.json({ ok: true });
    }

    // Verificar se é evento de documento assinado/finalizado
    const eventoAssinado = ['document.signed', 'document.completed', 'assignment.signed', 'signed', 'completed'].some(e =>
        evento.toLowerCase().includes(e.replace('document.', '').replace('assignment.', ''))
    );

    if (!eventoAssinado) {
        console.log('[webhookAssinafy] Evento ignorado:', evento);
        return Response.json({ ok: true });
    }

    // Inicializar SDK sem usuário (service role)
    const base44 = createClientFromRequest(req);

    // Baixar o PDF assinado do Assinafy
    const downloadRes = await fetch(`${BASE_URL}/accounts/${ASSINAFY_ACCOUNT_ID}/documents/${documentId}/download`, {
        headers: { 'X-Api-Key': ASSINAFY_API_KEY }
    });

    if (!downloadRes.ok) {
        console.error('[webhookAssinafy] Erro ao baixar documento:', downloadRes.status);
        return Response.json({ ok: true }); // Retornar 200 para evitar retry infinito
    }

    const pdfBuffer = await downloadRes.arrayBuffer();
    const pdfBlob = new Blob([pdfBuffer], { type: 'application/pdf' });

    // Buscar funcionário que tem este documento_id pendente
    // Procurar em epis_anexos e ferramentais_anexos
    let funcionarioEncontrado = null;
    let campoAnexos = null;

    const funcionarios = await base44.asServiceRole.entities.Funcionario.list();

    for (const func of funcionarios) {
        for (const campo of ['epis_anexos', 'ferramentais_anexos']) {
            try {
                const anexos = JSON.parse(func[campo] || '[]');
                const idx = anexos.findIndex(a => a.assinafy_document_id === documentId);
                if (idx !== -1) {
                    funcionarioEncontrado = func;
                    campoAnexos = campo;
                    break;
                }
            } catch {}
        }
        if (funcionarioEncontrado) break;
    }

    if (!funcionarioEncontrado) {
        console.warn('[webhookAssinafy] Funcionário não encontrado para document_id:', documentId);
        return Response.json({ ok: true });
    }

    // Fazer upload do PDF assinado
    const uploadForm = new FormData();
    const nomeDoc = campoAnexos === 'epis_anexos' ? 'ficha-epi-assinada' : 'ficha-ferramentas-assinada';
    uploadForm.append('file', pdfBlob, `${nomeDoc}-${new Date().toISOString().split('T')[0]}.pdf`);

    const uploadRes = await fetch('https://api.base44.com/v1/files/upload', {
        method: 'POST',
        body: uploadForm
    });

    let pdfUrl = null;

    if (uploadRes.ok) {
        const uploadData = await uploadRes.json();
        pdfUrl = uploadData.file_url || uploadData.url;
    }

    // Se não conseguiu fazer upload via Base44, usar URL direta do Assinafy
    if (!pdfUrl) {
        pdfUrl = `${BASE_URL}/accounts/${ASSINAFY_ACCOUNT_ID}/documents/${documentId}/download`;
    }

    // Atualizar o registro do funcionário: substituir entrada pendente pelo PDF assinado
    const anexosAtuais = JSON.parse(funcionarioEncontrado[campoAnexos] || '[]');
    const idx = anexosAtuais.findIndex(a => a.assinafy_document_id === documentId);

    const nomeLabel = campoAnexos === 'epis_anexos' ? 'Ficha de EPI' : 'Ficha de Ferramentas';

    if (idx !== -1) {
        // Substituir entrada pendente pelo documento assinado
        anexosAtuais[idx] = {
            nome: `${nomeLabel} - Assinada`,
            url: pdfUrl,
            assinafy_document_id: documentId,
            status: 'assinado',
            data_upload: new Date().toISOString()
        };
    } else {
        // Adicionar novo
        anexosAtuais.push({
            nome: `${nomeLabel} - Assinada`,
            url: pdfUrl,
            assinafy_document_id: documentId,
            status: 'assinado',
            data_upload: new Date().toISOString()
        });
    }

    await base44.asServiceRole.entities.Funcionario.update(funcionarioEncontrado.id, {
        [campoAnexos]: JSON.stringify(anexosAtuais)
    });

    console.log(`[webhookAssinafy] Documento ${documentId} assinado salvo para funcionário ${funcionarioEncontrado.nome_completo}`);
    return Response.json({ ok: true });
});