import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const BASE44_APP_ID = Deno.env.get("BASE44_APP_ID");
const WHATSAPP_ACCESS_TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
const WHATSAPP_VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN");
const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");

async function sendWhatsAppMessage(to, text) {
    console.log(`[WA] Enviando mensagem para: ${to}`);
    console.log(`[WA] PHONE_NUMBER_ID: ${WHATSAPP_PHONE_NUMBER_ID ? WHATSAPP_PHONE_NUMBER_ID.substring(0,6)+'...' : 'NÃO DEFINIDO'}`);
    console.log(`[WA] ACCESS_TOKEN presente: ${!!WHATSAPP_ACCESS_TOKEN}`);
    console.log(`[WA] Texto (primeiros 100): ${String(text).substring(0, 100)}`);

    const url = `https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
    const payload = {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text }
    };
    console.log(`[WA] URL: ${url}`);

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    const resText = await res.text();
    console.log(`[WA] Status resposta: ${res.status}`);
    console.log(`[WA] Resposta API: ${resText.substring(0, 300)}`);

    if (!res.ok) {
        console.error(`[WA] ERRO ao enviar mensagem para ${to}: ${resText.substring(0, 300)}`);
    } else {
        console.log(`[WA] Mensagem enviada com sucesso para ${to}`);
    }
}

async function downloadWhatsAppMedia(mediaId) {
    const urlRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
        headers: { 'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}` }
    });
    const urlData = await urlRes.json();
    if (!urlData.url) return null;

    const mediaRes = await fetch(urlData.url, {
        headers: { 'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}` }
    });
    const buffer = await mediaRes.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return { base64: btoa(binary), mimeType: urlData.mime_type || 'image/jpeg' };
}

// Salva estado do fluxo WhatsApp num AuditLog
// Usa campo `modulo` = 'whatsapp_estado' e `descricao` = stage (empresa|projeto)
// `dados_novos` = JSON com todos os dados do fluxo
async function salvarEstado(base44, usuarioEmail, empresaId, stage, dados) {
    const telefone = dados.fromPhone || 'sem_telefone';
    return await base44.asServiceRole.entities.AuditLog.create({
        empresa_id: empresaId,
        usuario_email: usuarioEmail,
        tipo_acao: 'visualizar',
        entidade: 'PreLancamento',
        entidade_id: `whatsapp_${telefone}`,
        modulo: 'whatsapp_estado',
        descricao: stage,
        dados_novos: JSON.stringify(dados)
    });
}

// Busca o estado ativo do fluxo WhatsApp por TELEFONE (não por email)
async function buscarEstado(base44, fromPhone) {
    const entidadeId = `whatsapp_${fromPhone}`;
    console.log('[Estado] Buscando por entidade_id:', entidadeId);

    // Filtrar apenas por entidade_id para evitar problemas com filtros compostos
    const logs = await base44.asServiceRole.entities.AuditLog.filter({
        entidade_id: entidadeId
    }, '-created_date', 10);

    console.log('[Estado] Total logs encontrados:', logs.length);

    // Filtrar apenas os do modulo whatsapp_estado
    const estadoLogs = logs.filter(l => l.modulo === 'whatsapp_estado');
    console.log('[Estado] Logs de estado WhatsApp:', estadoLogs.length);

    if (estadoLogs.length === 0) {
        console.log('[Estado] Nenhum log de fluxo encontrado para telefone', fromPhone);
        return null;
    }

    // Pegar o mais recente
    const log = estadoLogs[0];
    const diffMinutos = (Date.now() - new Date(log.created_date).getTime()) / 1000 / 60;
    console.log('[Estado] Log encontrado, stage:', log.descricao, 'há', Math.round(diffMinutos), 'min, id:', log.id);

    if (diffMinutos > 30) {
        console.log('[Estado] Log expirado, ignorando');
        for (const l of estadoLogs) {
            try { await base44.asServiceRole.entities.AuditLog.delete(l.id); } catch (e) {}
        }
        return null;
    }

    const dados = JSON.parse(log.dados_novos || '{}');
    console.log('[Estado] Dados recuperados, stage:', log.descricao, 'keys:', Object.keys(dados).join(','));
    return { id: log.id, stage: log.descricao, ...dados };
}

async function deletarEstados(base44, fromPhone) {
    try {
        const entidadeId = `whatsapp_${fromPhone}`;
        const logs = await base44.asServiceRole.entities.AuditLog.filter({
            entidade_id: entidadeId
        }, '-created_date', 20);
        const estadoLogs = logs.filter(l => l.modulo === 'whatsapp_estado');
        console.log('[Estado] Deletando', estadoLogs.length, 'logs de estado para', entidadeId);
        for (const l of estadoLogs) {
            await base44.asServiceRole.entities.AuditLog.delete(l.id);
        }
    } catch (e) {
        console.error('[Estado] Erro ao deletar estados:', e.message);
    }
}

Deno.serve(async (req) => {
    console.log(`[Webhook] ===== NOVA REQUISIÇÃO =====`);
    console.log(`[Webhook] Método: ${req.method}`);
    console.log(`[Webhook] URL: ${req.url}`);

    const url = new URL(req.url);

    // GET - Verificação do webhook pelo Meta
    if (req.method === 'GET') {
        const mode = url.searchParams.get('hub.mode');
        const token = url.searchParams.get('hub.verify_token');
        const challenge = url.searchParams.get('hub.challenge');
        if (mode === 'subscribe' && token === WHATSAPP_VERIFY_TOKEN) {
            console.log('[Webhook] Verificação Meta aceita');
            return new Response(challenge, { status: 200 });
        }
        return new Response('Forbidden', { status: 403 });
    }

    if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

    const base44 = createClientFromRequest(req);

    let body;
    try {
        const rawText = await req.text();
        console.log(`[Webhook] Body raw (primeiros 500): ${rawText.substring(0, 500)}`);
        body = JSON.parse(rawText);
    } catch (e) {
        console.error(`[Webhook] Erro ao parsear body: ${e.message}`);
        return new Response('OK', { status: 200 });
    }

    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    console.log(`[Webhook] Message extraído: ${message ? JSON.stringify(message).substring(0, 200) : 'NULO'}`);
    if (!message) return new Response('OK', { status: 200 });

    const fromPhone = message.from;
    const msgType = message.type;
    console.log(`[Webhook] Mensagem de ${fromPhone}, tipo: ${msgType}`);

    // Normaliza qualquer formato de número para DDD + 8 dígitos (sem 55, sem 9 extra)
    // Aceita: 5538999448281, 5538 99448281, 38999448281, 38 99448281, etc.
    const normalizar = (n) => {
        let d = String(n || '').replace(/\D/g, '');
        // Remove código do país 55 se presente
        if (d.startsWith('55') && d.length > 11) d = d.slice(2);
        // Agora temos DDD + número: pode ter 10 (sem 9 extra) ou 11 (com 9 extra) dígitos
        // Se 11 dígitos e o 3º dígito é 9 (9 extra após DDD), remove o 9 extra
        if (d.length === 11 && d[2] === '9') d = d.slice(0, 2) + d.slice(3);
        return d; // sempre DDD + 8 dígitos = 10 dígitos
    };
    const telBusca = normalizar(fromPhone);
    console.log(`[Webhook] fromPhone bruto: ${fromPhone} → normalizado: ${telBusca}`);

    // ============================================
    // FLUXO FERRAMENTAL: mensagem de funcionário cadastrado
    // Só processa se NÃO há fluxo de pré-lançamento ativo para este número
    // ============================================
    if (msgType === 'text') {
        // Checar estado ativo de pré-lançamento ANTES de verificar funcionários
        const estadoAtivo = await buscarEstado(base44, fromPhone);
        const temFluxoAtivo = estadoAtivo && (estadoAtivo.stage === 'empresa' || estadoAtivo.stage === 'projeto');

    }

    // ============================================
    // FLUXO PRÉ-LANÇAMENTO: identificar usuário do sistema pelo telefone
    // ============================================
    const todosVinculos = await base44.asServiceRole.entities.UsuarioEmpresa.filter({ ativo: true });
    const vinculosPorTelefone = todosVinculos.filter(v => v.telefone && normalizar(v.telefone) === telBusca);
    console.log(`[Webhook] Vínculos encontrados pelo telefone: ${vinculosPorTelefone.length}`);

    if (vinculosPorTelefone.length === 0) {
        await sendWhatsAppMessage(fromPhone, '❌ Seu número não está cadastrado no sistema. Entre em contato com o administrador.');
        return new Response('OK', { status: 200 });
    }

    // Deduplicar: um único vínculo por empresa_id
    const vinculosUnicos = [];
    const empresasVistas = new Set();
    for (const v of vinculosPorTelefone) {
        if (!empresasVistas.has(v.empresa_id)) {
            empresasVistas.add(v.empresa_id);
            vinculosUnicos.push(v);
        }
    }

    const usuarioVinculo = vinculosUnicos[0];
    const usuarioEmail = usuarioVinculo.usuario_email;
    console.log('[Webhook] Usuário identificado:', usuarioEmail, '| Empresas únicas:', vinculosUnicos.length);

    // ============================================
    // IMAGEM ou DOCUMENTO (PDF): Extrair dados e pedir empresa
    // ============================================
    if (msgType === 'image' || msgType === 'document') {
        const mediaId = msgType === 'image' ? message.image?.id : message.document?.id;
        const caption = msgType === 'image'
            ? (message.image?.caption || '')
            : (message.document?.caption || message.document?.filename || '');

        await sendWhatsAppMessage(fromPhone, '🔄 Processando seu comprovante...');

        // Download da imagem
        const mediaData = await downloadWhatsAppMedia(mediaId);
        if (!mediaData) {
            await sendWhatsAppMessage(fromPhone, '❌ Não foi possível baixar a imagem. Tente novamente.');
            return new Response('OK', { status: 200 });
        }

        // Upload para storage
        let comprovanteUrl = null;
        try {
            const bytes = Uint8Array.from(atob(mediaData.base64), c => c.charCodeAt(0));
            let ext = 'jpg';
            if (mediaData.mimeType.includes('png')) ext = 'png';
            else if (mediaData.mimeType.includes('pdf')) ext = 'pdf';
            const file = new File([bytes], `comprovante.${ext}`, { type: mediaData.mimeType });
            console.log('[Webhook] Fazendo upload, tamanho:', bytes.length, 'bytes, tipo:', mediaData.mimeType);
            const res = await base44.asServiceRole.integrations.Core.UploadFile({ file });
            comprovanteUrl = res.file_url;
            console.log('[Webhook] Upload OK:', comprovanteUrl);
        } catch (e) {
            console.error('[Webhook] Erro no upload:', e.message);
            await sendWhatsAppMessage(fromPhone, '❌ Erro ao fazer upload do comprovante. Tente novamente.');
            return new Response('OK', { status: 200 });
        }

        if (!comprovanteUrl) {
            await sendWhatsAppMessage(fromPhone, '❌ Não foi possível salvar o comprovante. Tente novamente.');
            return new Response('OK', { status: 200 });
        }

        // Extrair dados com IA
        let dadosExtraidos = {};
        const isPDF = mediaData.mimeType.includes('pdf');
        console.log('[Webhook] Iniciando extração IA. Tipo:', mediaData.mimeType, '| isPDF:', isPDF);
        try {
            const GOOGLE_API_KEY = Deno.env.get('GOOGLE_AI_API_KEY');
            if (!GOOGLE_API_KEY) throw new Error('GOOGLE_AI_API_KEY não configurada');

            const prompt = `LEIA ESTE COMPROVANTE COM ATENÇÃO MÁXIMA E RESPONDA APENAS EM JSON VÁLIDO.

Extraia OBRIGATORIAMENTE estes campos:
1. valor: número (procure Total, Subtotal, Valor a pagar)
2. fornecedor: nome exato da empresa/loja
3. cnpj: CNPJ se visível
4. descricao: produtos ou serviços listados
5. data: em formato YYYY-MM-DD
6. forma_pagamento: dinheiro, pix, cartão, etc

RESPONDA APENAS COM JSON, SEM MARKDOWN OU EXPLICAÇÕES:
{"valor": 123.45, "fornecedor": "Nome da Loja", "cnpj": "12.345.678/0001-00", "descricao": "Produtos", "data": "2026-03-05", "forma_pagamento": "cartão"}`;

            let geminiRes, geminiData;

            if (isPDF) {
                // PDF: usar URL pública (Gemini não aceita PDF via inlineData)
                console.log('[Webhook] PDF detectado, enviando via URL para Gemini:', comprovanteUrl);
                geminiRes = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GOOGLE_API_KEY}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{
                                parts: [
                                    { text: prompt },
                                    {
                                        fileData: {
                                            mimeType: 'application/pdf',
                                            fileUri: comprovanteUrl
                                        }
                                    }
                                ]
                            }],
                            generationConfig: { temperature: 0, maxOutputTokens: 1000 }
                        })
                    }
                );
            } else {
                // Imagem: enviar inline (base64)
                console.log('[Webhook] Imagem detectada, enviando inline para Gemini');
                geminiRes = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GOOGLE_API_KEY}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{
                                parts: [
                                    { text: prompt },
                                    {
                                        inlineData: {
                                            mimeType: mediaData.mimeType,
                                            data: mediaData.base64
                                        }
                                    }
                                ]
                            }],
                            generationConfig: { temperature: 0, maxOutputTokens: 1000 }
                        })
                    }
                );
            }

            geminiData = await geminiRes.json();
            console.log('[Webhook] Status Gemini:', geminiRes.status);

            if (!geminiRes.ok) {
                throw new Error(`Erro Gemini ${geminiRes.status}: ${JSON.stringify(geminiData).substring(0, 300)}`);
            }

            const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
            console.log('[Webhook] Texto bruto Gemini:', text.substring(0, 500));

            // Limpar markdown e extrair JSON
            const jsonText = text.replace(/```json\n?|\n?```/g, '').trim();
            const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    dadosExtraidos = JSON.parse(jsonMatch[0]);
                    console.log('[Webhook] JSON parsed:', JSON.stringify(dadosExtraidos));
                } catch (parseErr) {
                    console.error('[Webhook] Erro ao fazer parse do JSON:', parseErr.message);
                }
            } else {
                console.error('[Webhook] Nenhum JSON encontrado. Texto:', text.substring(0, 300));
            }

            // Validar e garantir tipos corretos
            dadosExtraidos.valor = Number(dadosExtraidos.valor) || 0;
            dadosExtraidos.fornecedor = String(dadosExtraidos.fornecedor || 'Estabelecimento').trim();
            dadosExtraidos.cnpj = String(dadosExtraidos.cnpj || '').trim();
            dadosExtraidos.descricao = String(dadosExtraidos.descricao || 'Comprovante').trim();
            dadosExtraidos.data = String(dadosExtraidos.data || new Date().toISOString().split('T')[0]).trim();
            dadosExtraidos.forma_pagamento = String(dadosExtraidos.forma_pagamento || '').trim();

            console.log('[Webhook] Dados validados:', JSON.stringify(dadosExtraidos));
        } catch (e) {
            console.error('[Webhook] ERRO na extração Gemini:', e.message);
            dadosExtraidos = {
                valor: 0,
                fornecedor: 'Estabelecimento',
                cnpj: '',
                descricao: 'Comprovante enviado',
                data: new Date().toISOString().split('T')[0],
                forma_pagamento: ''
            };
        }

        // Buscar empresas dos vínculos únicos (já deduplicados por empresa_id)
        const empresasInfo = (await Promise.all(
            vinculosUnicos.map(async v => {
                const emps = await base44.asServiceRole.entities.Empresa.filter({ id: v.empresa_id, ativo: true });
                return emps.length > 0 ? { id: v.empresa_id, nome: emps[0].nome, usuario_email: v.usuario_email } : null;
            })
        )).filter(Boolean);

        if (empresasInfo.length === 0) {
            await sendWhatsAppMessage(fromPhone, '❌ Nenhuma empresa ativa encontrada para seu usuário.');
            return new Response('OK', { status: 200 });
        }

        // Limpar estados anteriores e salvar novo
        await deletarEstados(base44, fromPhone);
        await salvarEstado(base44, usuarioEmail, empresasInfo[0].id, 'empresa', {
            fromPhone,
            empresas: empresasInfo, // cada item tem { id, nome, usuario_email }
            dadosExtraidos,
            comprovanteUrl,
            caption
        });

        // Enviar resumo dos dados extraídos
        const valorFmt = dadosExtraidos.valor
            ? `R$ ${Number(dadosExtraidos.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
            : 'Não identificado';

        let msgDados = `✅ *Comprovante analisado!*\n\n📋 *Dados extraídos:*\n`;
        msgDados += `• Valor: ${valorFmt}\n`;
        msgDados += `• Fornecedor: ${dadosExtraidos.fornecedor || 'Não identificado'}\n`;
        msgDados += `• Descrição: ${dadosExtraidos.descricao || 'Não identificada'}\n`;
        msgDados += `• Data: ${dadosExtraidos.data || 'Não identificada'}\n`;
        msgDados += `• Pagamento: ${dadosExtraidos.forma_pagamento || 'Não identificado'}`;

        let msgEmpresa = `🏢 *Selecione a empresa* respondendo com o número:\n\n`;
        empresasInfo.forEach((emp, i) => { msgEmpresa += `${i + 1}. ${emp.nome}\n`; });

        await sendWhatsAppMessage(fromPhone, msgDados);
        await sendWhatsAppMessage(fromPhone, msgEmpresa);
        return new Response('OK', { status: 200 });
    }

    // ============================================
    // TEXTO: Processar respostas do fluxo de pré-lançamento
    // ============================================
    if (msgType === 'text') {
        const textBody = message.text?.body?.trim() || '';
        // Reusar estado já buscado no bloco ferramental (se disponível via variável de escopo)
        const estado = await buscarEstado(base44, fromPhone);

        console.log('[Webhook] Estado encontrado:', estado ? `stage=${estado.stage}` : 'nenhum');

        // STAGE: seleção de empresa
        if (estado && estado.stage === 'empresa') {
            const empresas = estado.empresas || [];
            const escolha = parseInt(textBody);
            let empresaSelecionada = null;

            if (!isNaN(escolha) && escolha >= 1 && escolha <= empresas.length) {
                empresaSelecionada = empresas[escolha - 1];
            } else {
                // Busca por nome
                empresaSelecionada = empresas.find(e => e.nome.toLowerCase().includes(textBody.toLowerCase()));
            }

            if (!empresaSelecionada) {
                await sendWhatsAppMessage(fromPhone, `❌ Opção inválida. Responda com um número (1-${empresas.length}) ou parte do nome da empresa.`);
                return new Response('OK', { status: 200 });
            }

            console.log('[Webhook] Empresa selecionada:', empresaSelecionada.nome);

            // Buscar projetos da empresa
            let projetos = [];
            try {
                projetos = await base44.asServiceRole.entities.Projeto.filter({ empresa_id: empresaSelecionada.id, arquivado: false });
                console.log('[Webhook] Projetos encontrados:', projetos.length);
            } catch (e) {
                console.error('[Webhook] Erro ao buscar projetos:', e.message);
            }

            // O e-mail correto é o do vínculo com aquela empresa específica
            const emailEmpresa = empresaSelecionada.usuario_email || usuarioEmail;

            // Atualizar estado para stage 'projeto'
            await deletarEstados(base44, fromPhone);
            await salvarEstado(base44, emailEmpresa, empresaSelecionada.id, 'projeto', {
                fromPhone,
                usuario_email: emailEmpresa,
                empresa_id: empresaSelecionada.id,
                empresa_nome: empresaSelecionada.nome,
                projetos: projetos.slice(0, 10).map(p => ({ id: p.id, nome: p.nome })),
                dadosExtraidos: estado.dadosExtraidos,
                comprovanteUrl: estado.comprovanteUrl,
                caption: estado.caption
            });

            let msg = `✅ Empresa *${empresaSelecionada.nome}* selecionada!\n\n📁 *Qual o projeto deste lançamento?*\n\n`;
            if (projetos.length > 0) {
                projetos.slice(0, 10).forEach((p, i) => { msg += `${i + 1}. ${p.nome}\n`; });
                msg += `\nOu *digite o nome do projeto* livremente.\n`;
                msg += `0. Sem projeto (despesa geral)`;
            } else {
                msg += `Nenhum projeto cadastrado. *Digite o nome do projeto* ou responda *0* para sem projeto.`;
            }

            await sendWhatsAppMessage(fromPhone, msg);
            return new Response('OK', { status: 200 });
        }

        // STAGE: seleção de projeto → criar PreLancamento
        if (estado && estado.stage === 'projeto') {
            const projetos = estado.projetos || [];
            let projetoId = '';
            let projetoNome = '';
            let projetoLivre = ''; // nome digitado livremente

            const escolha = parseInt(textBody);

            if (textBody === '0' || textBody.toLowerCase() === 'sem projeto') {
                // Sem projeto
                projetoId = '';
                projetoNome = '';
            } else if (!isNaN(escolha) && escolha >= 1 && escolha <= projetos.length) {
                // Número válido da lista
                projetoId = projetos[escolha - 1].id;
                projetoNome = projetos[escolha - 1].nome;
            } else {
                // Nome digitado livremente - buscar na lista ou salvar como observação
                const match = projetos.find(p => p.nome.toLowerCase().includes(textBody.toLowerCase()));
                if (match) {
                    projetoId = match.id;
                    projetoNome = match.nome;
                } else {
                    // Projeto não existe no banco - salvar como livre
                    projetoId = '';
                    projetoNome = '';
                    projetoLivre = textBody;
                }
            }

            // Limpar estados
            await deletarEstados(base44, fromPhone);

            const empresaId = estado.empresa_id;
            const emailFinal = estado.usuario_email || usuarioEmail;
            const dadosExtraidos = estado.dadosExtraidos || {};
            const comprovanteUrl = estado.comprovanteUrl || '';
            const caption = estado.caption || '';

            // Data formatada
            let dataFormatada = new Date().toISOString().split('T')[0];
            if (dadosExtraidos.data) {
                try {
                    const d = new Date(dadosExtraidos.data);
                    if (!isNaN(d.getTime())) dataFormatada = dadosExtraidos.data;
                } catch (e) {}
            }

            // Conta financeira padrão
            let contaId = '';
            try {
                const contas = await base44.asServiceRole.entities.ContaFinanceira.filter({ empresa_id: empresaId, ativo: true }, '', 1);
                if (contas.length > 0) contaId = contas[0].id;
            } catch (e) {}

            // Observações: combinar caption + projeto livre se houver
            let observacoes = caption || '';
            if (projetoLivre) {
                observacoes += (observacoes ? '\n' : '') + `Projeto informado pelo usuário: ${projetoLivre}`;
            }

            // Criar PreLancamento
            const preLancamento = await base44.asServiceRole.entities.PreLancamento.create({
                empresa_id: empresaId,
                usuario_email: emailFinal,
                comprovante_url: comprovanteUrl,
                dados_extraidos: JSON.stringify({
                    valor: Number(dadosExtraidos.valor) || 0,
                    fornecedor: dadosExtraidos.fornecedor || '',
                    cnpj: dadosExtraidos.cnpj || '',
                    descricao: dadosExtraidos.descricao || 'Comprovante WhatsApp',
                    data: dataFormatada,
                    forma_pagamento: dadosExtraidos.forma_pagamento || ''
                }),
                status: 'Pendente',
                projeto_id: projetoId,
                projeto_nome: projetoNome || projetoLivre,
                conta_financeira_id: contaId,
                observacoes: observacoes
            });

            console.log('[Webhook] PreLancamento criado:', preLancamento.id);

            let msg = `✅ *Pré-lançamento criado com sucesso!*\n\n`;
            if (projetoNome) msg += `📁 Projeto: *${projetoNome}*\n`;
            else if (projetoLivre) msg += `📁 Projeto (a confirmar): *${projetoLivre}*\n`;
            else msg += `📁 Sem projeto vinculado\n`;
            msg += `\n📋 Acesse *Financeiro > Pré-Lançamentos* para revisar e conciliar.`;

            await sendWhatsAppMessage(fromPhone, msg);
            return new Response('OK', { status: 200 });
        }

        // Sem estado ativo - mensagem de ajuda
        console.log('[Webhook] Sem estado ativo, enviando mensagem de ajuda');
        await sendWhatsAppMessage(fromPhone,
            `👋 Olá! Sou o assistente financeiro do *SIGO OBRAS*.\n\n📸 Envie uma *foto do comprovante* ou *nota fiscal* para criar um pré-lançamento financeiro automaticamente.`
        );
    }

    return new Response('OK', { status: 200 });
});