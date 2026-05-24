import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const WHATSAPP_ACCESS_TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");

Deno.serve(async (req) => {
    try {
        const { to, message, template_name, template_params } = await req.json();

        if (!to || (!message && !template_name)) {
            return Response.json({ error: 'Parâmetros obrigatórios: to e message (ou template_name)' }, { status: 400 });
        }

        const url = `https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

        let payload;

        if (template_name) {
            // Envio via template
            payload = {
                messaging_product: "whatsapp",
                to,
                type: "template",
                template: {
                    name: template_name,
                    language: { code: "pt_BR" },
                    components: template_params ? [{
                        type: "body",
                        parameters: template_params.map(p => ({ type: "text", text: p }))
                    }] : []
                }
            };
        } else {
            // Envio de mensagem de texto simples
            payload = {
                messaging_product: "whatsapp",
                to,
                type: "text",
                text: { body: message }
            };
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('[WhatsApp] Erro ao enviar:', JSON.stringify(data));
            return Response.json({ error: 'Erro ao enviar mensagem', details: data }, { status: 500 });
        }

        return Response.json({ success: true, message_id: data.messages?.[0]?.id });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});