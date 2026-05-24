import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

const WHATSAPP_ACCESS_TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        const to = "5538999448281";
        const message = "🔧 Teste SIGO OBRAS - Se você recebeu esta mensagem, o WhatsApp está funcionando!";

        const url = `https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

        const payload = {
            messaging_product: "whatsapp",
            to,
            type: "text",
            text: { body: message }
        };

        console.log('[Teste WA] Phone Number ID:', WHATSAPP_PHONE_NUMBER_ID);
        console.log('[Teste WA] Token (primeiros 20 chars):', WHATSAPP_ACCESS_TOKEN?.substring(0, 20));
        console.log('[Teste WA] Enviando para:', to);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        console.log('[Teste WA] Status HTTP:', response.status);
        console.log('[Teste WA] Resposta API:', JSON.stringify(data));

        return Response.json({
            status_http: response.status,
            ok: response.ok,
            resposta_api: data,
            numero_enviado: to,
            phone_number_id: WHATSAPP_PHONE_NUMBER_ID
        });
    } catch (error) {
        console.error('[Teste WA] Erro:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});