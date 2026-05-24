import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

const ASSINAFY_API_KEY = Deno.env.get("ASSINAFY_API_KEY");
const ASSINAFY_ACCOUNT_ID = Deno.env.get("ASSINAFY_ACCOUNT_ID");
const WHATSAPP_ACCESS_TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
const BASE_URL = "https://api.assinafy.com.br/v1";

const assinafyHeaders = {
    "X-Api-Key": ASSINAFY_API_KEY,
    "Content-Type": "application/json",
};

function gerarHTMLDocumento(tipo, nomeAssinante, itens, empresa, dadosExtras = {}) {
    const dataHoje = new Date().toLocaleDateString('pt-BR');
    const nomeEmpresa = empresa?.razao_social || empresa?.nome || '';
    const logoUrl = empresa?.logo_url || '';

    let tituloDoc, textoDeclaracao, cabecalhoTabela, linhasTabela;

    if (tipo === 'epi') {
        tituloDoc = 'FICHA DE CONTROLE E ENTREGA DE EPI';
        textoDeclaracao = `Recebo da empresa ${nomeEmpresa} para meu uso obrigatório os EPI's constantes nesta ficha, comprometendo-me a utilizá-los corretamente.`;
        cabecalhoTabela = `<th>Qtd</th><th>Descrição</th><th>C.A.</th>`;
        linhasTabela = itens.map(item =>
            `<tr><td>${item.quantidade || 1}</td><td>${item.item || item.descricao || ''}</td><td>${item.ca || ''}</td></tr>`
        ).join('');
    } else if (tipo === 'caminhao') {
        tituloDoc = 'FICHA DE CONTROLE DE FERRAMENTAL DO VEÍCULO';
        textoDeclaracao = `Declaro estar ciente das ferramentas e equipamentos alocados no veículo ${dadosExtras.placa || ''}, comprometendo-me à guarda e conservação dos itens constantes nesta ficha.`;
        cabecalhoTabela = `<th>Código</th><th>Descrição</th><th>Nº Série</th><th>Status</th>`;
        linhasTabela = itens.map(item =>
            `<tr><td>${item.codigo || ''}</td><td>${item.descricao || ''}</td><td>${item.numero_serie || ''}</td><td>${item.status || ''}</td></tr>`
        ).join('');
    } else {
        // ferramenta (por funcionário ou movimentação)
        tituloDoc = 'FICHA DE CONTROLE DE ENTREGA DE FERRAMENTAS';
        textoDeclaracao = `Declaro receber as ferramentas abaixo listadas, comprometendo-me à guarda, conservação e devolução integral dos itens constantes nesta ficha.`;
        cabecalhoTabela = `<th>Qtd</th><th>Descrição</th><th>Nº Série</th>`;
        linhasTabela = itens.map(item =>
            `<tr><td>${item.quantidade || 1}</td><td>${item.ferramenta || item.descricao || ''}</td><td>${item.numero_serie || ''}</td></tr>`
        ).join('');
    }

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; font-size: 11px; margin: 20px; color: #000; }
  h1 { font-size: 14px; text-align: center; margin: 10px 0; }
  .header { display: flex; align-items: center; gap: 20px; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 10px; }
  .logo { max-height: 60px; }
  .dados { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px; margin-bottom: 10px; }
  .dado { border-bottom: 1px solid #000; padding-bottom: 2px; }
  .dado b { display: block; font-size: 9px; }
  .declaracao { background: #f5f5f5; border: 1px solid #ccc; padding: 8px; margin-bottom: 10px; font-size: 10px; text-align: justify; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  th, td { border: 1px solid #000; padding: 5px; font-size: 10px; }
  th { background: #e0e0e0; font-weight: bold; text-align: center; }
  .assinaturas { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 30px; }
  .assinatura { border-top: 1px solid #000; padding-top: 5px; text-align: center; font-weight: bold; font-size: 10px; }
</style>
</head>
<body>
  <div class="header">
    ${logoUrl ? `<img src="${logoUrl}" class="logo" />` : ''}
    <div style="flex:1; text-align:center"><h1>${tituloDoc}</h1></div>
  </div>
  <div class="dados">
    <div class="dado"><b>${tipo === 'caminhao' ? 'VEÍCULO:' : 'NOME:'}</b>${nomeAssinante}</div>
    ${dadosExtras.cpf ? `<div class="dado"><b>CPF:</b>${dadosExtras.cpf}</div>` : ''}
    ${dadosExtras.funcao_nome ? `<div class="dado"><b>FUNÇÃO:</b>${dadosExtras.funcao_nome}</div>` : ''}
    ${dadosExtras.placa ? `<div class="dado"><b>PLACA:</b>${dadosExtras.placa}</div>` : ''}
    ${dadosExtras.motorista ? `<div class="dado"><b>MOTORISTA:</b>${dadosExtras.motorista}</div>` : ''}
    <div class="dado"><b>DATA EMISSÃO:</b>${dataHoje}</div>
    <div class="dado"><b>EMPRESA:</b>${nomeEmpresa}</div>
  </div>
  <div class="declaracao">${textoDeclaracao}</div>
  <table>
    <thead><tr>${cabecalhoTabela}</tr></thead>
    <tbody>${linhasTabela}</tbody>
  </table>
  <div class="assinaturas">
    <div class="assinatura">${tipo === 'caminhao' ? 'Assinatura do Motorista' : 'Assinatura do Funcionário'}</div>
    <div class="assinatura">Responsável pela Entrega</div>
  </div>
</body>
</html>`;
}

async function enviarWhatsApp(telefone, mensagem) {
    const numeroLimpo = telefone.replace(/\D/g, '');
    const numeroFinal = numeroLimpo.startsWith('55') ? numeroLimpo : `55${numeroLimpo}`;

    const url = `https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            messaging_product: "whatsapp",
            to: numeroFinal,
            type: "text",
            text: { body: mensagem }
        })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(`WhatsApp erro: ${JSON.stringify(data)}`);
    return data;
}

async function enviarParaAssinafy(nomeAssinante, email, cpf, htmlDoc, tipo, empresa, base44) {
    // Converter HTML para PDF
    const pdfResponse = await fetch('https://api.html2pdf.app/v1/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: htmlDoc, apiKey: 'demo', orientation: 'landscape', format: 'A4' })
    });

    let docBlob, docFilename, mimeType;
    if (pdfResponse.ok) {
        docBlob = await pdfResponse.arrayBuffer();
        docFilename = `ficha-${tipo}-${nomeAssinante.replace(/\s+/g, '-')}.pdf`;
        mimeType = 'application/pdf';
    } else {
        docBlob = new TextEncoder().encode(htmlDoc).buffer;
        docFilename = `ficha-${tipo}-${nomeAssinante.replace(/\s+/g, '-')}.html`;
        mimeType = 'text/html';
    }

    // Upload no Assinafy
    const formData = new FormData();
    formData.append('file', new Blob([docBlob], { type: mimeType }), docFilename);

    const uploadRes = await fetch(`${BASE_URL}/accounts/${ASSINAFY_ACCOUNT_ID}/documents`, {
        method: 'POST',
        headers: { 'X-Api-Key': ASSINAFY_API_KEY },
        body: formData,
    });
    const uploadData = await uploadRes.json();
    if (!uploadRes.ok || !uploadData.id) throw new Error(`Assinafy upload error: ${JSON.stringify(uploadData)}`);

    const documentId = uploadData.id;

    // Criar signatário
    const signerRes = await fetch(`${BASE_URL}/accounts/${ASSINAFY_ACCOUNT_ID}/signers`, {
        method: 'POST',
        headers: assinafyHeaders,
        body: JSON.stringify({ full_name: nomeAssinante, email }),
    });
    const signerData = await signerRes.json();
    const signerId = signerData?.data?.id;
    if (!signerId) throw new Error(`Erro ao criar signatário: ${JSON.stringify(signerData)}`);

    // Solicitar assinatura
    const assignRes = await fetch(`${BASE_URL}/accounts/${ASSINAFY_ACCOUNT_ID}/documents/${documentId}/assignments`, {
        method: 'POST',
        headers: assinafyHeaders,
        body: JSON.stringify({ signer_id: signerId, message: `Por favor assine a ficha.` }),
    });
    const assignData = await assignRes.json();
    if (!assignRes.ok) throw new Error(`Erro ao solicitar assinatura: ${JSON.stringify(assignData)}`);

    return { documentId, signerId };
}

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { tipo, funcionario_id, caminhao_id, movimentacao_id, empresa_id } = await req.json();

    if (!tipo || !empresa_id) {
        return Response.json({ error: 'Parâmetros obrigatórios: tipo, empresa_id' }, { status: 400 });
    }

    // Buscar empresa
    const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: empresa_id });
    const empresa = empresas[0] || {};

    // ── TIPO: caminhao ─────────────────────────────────────────────────────────
    if (tipo === 'caminhao') {
        if (!caminhao_id) return Response.json({ error: 'caminhao_id obrigatório para tipo caminhao' }, { status: 400 });

        const caminhoes = await base44.asServiceRole.entities.Caminhao.filter({ id: caminhao_id });
        if (!caminhoes.length) return Response.json({ error: 'Caminhão não encontrado' }, { status: 404 });
        const caminhao = caminhoes[0];

        // Buscar motorista pelo campo padrão ou funcionario vinculado
        let telefone = caminhao.motorista_telefone || '';
        let nomeMotorista = caminhao.motorista_padrao_nome || caminhao.placa;
        let emailMotorista = caminhao.motorista_email || `${caminhao.id}@caminhao.local`;

        if (!telefone && caminhao.motorista_padrao_id) {
            const motoristas = await base44.asServiceRole.entities.Funcionario.filter({ id: caminhao.motorista_padrao_id });
            if (motoristas.length) {
                telefone = motoristas[0].telefone || '';
                nomeMotorista = motoristas[0].nome_completo || nomeMotorista;
                emailMotorista = motoristas[0].email || emailMotorista;
            }
        }

        if (!telefone) return Response.json({ error: 'Motorista não possui telefone cadastrado no caminhão' }, { status: 400 });

        // Buscar ferramentas do caminhão
        const ferramentasCaminhao = await base44.asServiceRole.entities.Ferramenta.filter({
            empresa_id,
            caminhao_id
        });
        const ferramentasPorPlaca = await base44.asServiceRole.entities.Ferramenta.filter({
            empresa_id,
            localizacao: caminhao.placa
        });
        const todasFerramentas = [...ferramentasCaminhao, ...ferramentasPorPlaca.filter(f => !ferramentasCaminhao.find(fc => fc.id === f.id))];

        if (todasFerramentas.length === 0) return Response.json({ error: 'Nenhuma ferramenta encontrada neste caminhão' }, { status: 400 });

        const itens = todasFerramentas.map(f => ({ codigo: f.codigo, descricao: f.descricao, numero_serie: f.numero_serie || '', status: f.status || '' }));
        const htmlDoc = gerarHTMLDocumento('caminhao', nomeMotorista, itens, empresa, { placa: caminhao.placa, motorista: nomeMotorista });

        const { documentId, signerId } = await enviarParaAssinafy(nomeMotorista, emailMotorista, '', htmlDoc, 'caminhao', empresa, base44);
        const linkAssinatura = `https://app.assinafy.com.br/sign/${documentId}`;

        const mensagemWpp = `Olá ${nomeMotorista.split(' ')[0]}! 🚛\n\nVocê tem uma *Ficha de Ferramental do Veículo ${caminhao.placa}* aguardando sua assinatura digital.\n\nClique no link abaixo para assinar:\n${linkAssinatura}\n\n_Esta assinatura tem validade jurídica._`;
        await enviarWhatsApp(telefone, mensagemWpp);

        return Response.json({ success: true, document_id: documentId, link_assinatura: linkAssinatura, mensagem: `Ficha enviada via WhatsApp para ${telefone}` });
    }

    // ── TIPO: movimentacao (por movimentação individual) ───────────────────────
    if (tipo === 'movimentacao') {
        if (!movimentacao_id) return Response.json({ error: 'movimentacao_id obrigatório para tipo movimentacao' }, { status: 400 });

        const movs = await base44.asServiceRole.entities.MovimentacaoFerramenta.filter({ id: movimentacao_id });
        if (!movs.length) return Response.json({ error: 'Movimentação não encontrada' }, { status: 404 });
        const mov = movs[0];

        if (!mov.funcionario_id) return Response.json({ error: 'Movimentação não possui funcionário vinculado' }, { status: 400 });

        const funcionarios = await base44.asServiceRole.entities.Funcionario.filter({ id: mov.funcionario_id });
        if (!funcionarios.length) return Response.json({ error: 'Funcionário não encontrado' }, { status: 404 });
        const funcionario = funcionarios[0];

        if (!funcionario.telefone) return Response.json({ error: 'Funcionário não possui telefone cadastrado' }, { status: 400 });

        // Buscar todas movimentações deste funcionário (mesma sessão ou todas realizadas)
        const todasMovs = await base44.asServiceRole.entities.MovimentacaoFerramenta.filter({
            empresa_id,
            funcionario_id: mov.funcionario_id,
            tipo_movimentacao: mov.tipo_movimentacao,
            status: 'Realizada'
        });

        const itens = todasMovs.map(m => ({ quantidade: m.quantidade || 1, descricao: m.ferramenta_descricao, numero_serie: m.ferramenta_codigo || '' }));
        if (itens.length === 0) return Response.json({ error: 'Nenhuma movimentação realizada encontrada' }, { status: 400 });

        const htmlDoc = gerarHTMLDocumento('ferramenta', funcionario.nome_completo, itens, empresa, { cpf: funcionario.cpf, funcao_nome: funcionario.funcao_nome });
        const { documentId, signerId } = await enviarParaAssinafy(
            funcionario.nome_completo,
            funcionario.email || `${funcionario.cpf?.replace(/\D/g, '')}@assinatura.local`,
            funcionario.cpf, htmlDoc, 'ferramenta', empresa, base44
        );
        const linkAssinatura = `https://app.assinafy.com.br/sign/${documentId}`;

        const mensagemWpp = `Olá ${funcionario.nome_completo.split(' ')[0]}! 👷\n\nVocê tem uma *Ficha de Ferramentas* aguardando sua assinatura digital.\n\nClique no link abaixo para assinar:\n${linkAssinatura}\n\n_Esta assinatura tem validade jurídica._`;
        await enviarWhatsApp(funcionario.telefone, mensagemWpp);

        return Response.json({ success: true, document_id: documentId, link_assinatura: linkAssinatura, mensagem: `Ficha enviada via WhatsApp para ${funcionario.telefone}` });
    }

    // ── TIPO: epi / ferramenta (por funcionário) ───────────────────────────────
    if (!funcionario_id) return Response.json({ error: 'funcionario_id obrigatório para tipo epi/ferramenta' }, { status: 400 });

    const funcionarios = await base44.asServiceRole.entities.Funcionario.filter({ id: funcionario_id });
    if (!funcionarios.length) return Response.json({ error: 'Funcionário não encontrado' }, { status: 404 });
    const funcionario = funcionarios[0];

    if (!funcionario.telefone) return Response.json({ error: 'Funcionário não possui telefone cadastrado' }, { status: 400 });

    let itens = [];
    if (tipo === 'epi') {
        const movs = await base44.asServiceRole.entities.MovimentacaoFerramenta.filter({ empresa_id, funcionario_id, tipo_movimentacao: 'Entrega para Funcionário', status: 'Realizada' });
        const ferramentas = await base44.asServiceRole.entities.Ferramenta.filter({ empresa_id, tipo: 'EPI' });
        for (const mov of movs) {
            const ferr = ferramentas.find(f => f.id === mov.ferramenta_id);
            if (ferr) itens.push({ quantidade: mov.quantidade || 1, descricao: ferr.descricao, ca: ferr.ca || '' });
        }
    } else if (tipo === 'ferramenta') {
        if (funcionario.funcao_id) {
            const funcoes = await base44.asServiceRole.entities.Funcao.filter({ id: funcionario.funcao_id });
            if (funcoes.length > 0) {
                try { const ferramentais = JSON.parse(funcoes[0].ferramentais || '[]'); itens = ferramentais; } catch {}
            }
        }
    }

    if (itens.length === 0) return Response.json({ error: `Nenhum item encontrado para gerar a ficha de ${tipo === 'epi' ? 'EPI' : 'ferramentas'}` }, { status: 400 });

    const htmlDoc = gerarHTMLDocumento(tipo, funcionario.nome_completo, itens, empresa, { cpf: funcionario.cpf, funcao_nome: funcionario.funcao_nome });
    const { documentId, signerId } = await enviarParaAssinafy(
        funcionario.nome_completo,
        funcionario.email || `${funcionario.cpf?.replace(/\D/g, '')}@assinatura.local`,
        funcionario.cpf, htmlDoc, tipo, empresa, base44
    );
    const linkAssinatura = `https://app.assinafy.com.br/sign/${documentId}`;

    const nomeDoc = tipo === 'epi' ? 'Ficha de EPI' : 'Ficha de Ferramentas';
    const mensagemWpp = `Olá ${funcionario.nome_completo.split(' ')[0]}! 👷\n\nVocê tem uma *${nomeDoc}* aguardando sua assinatura digital.\n\nClique no link abaixo para assinar:\n${linkAssinatura}\n\n_Esta assinatura tem validade jurídica._`;
    await enviarWhatsApp(funcionario.telefone, mensagemWpp);

    const campoAnexos = tipo === 'epi' ? 'epis_anexos' : 'ferramentais_anexos';
    const anexosAtuais = JSON.parse(funcionario[campoAnexos] || '[]');
    anexosAtuais.push({ nome: `${nomeDoc} - Pendente Assinatura`, url: linkAssinatura, assinafy_document_id: documentId, assinafy_signer_id: signerId, status: 'pendente_assinatura', data_upload: new Date().toISOString() });
    await base44.asServiceRole.entities.Funcionario.update(funcionario_id, { [campoAnexos]: JSON.stringify(anexosAtuais) });

    return Response.json({ success: true, document_id: documentId, link_assinatura: linkAssinatura, mensagem: `Ficha enviada via WhatsApp para ${funcionario.telefone}` });
});