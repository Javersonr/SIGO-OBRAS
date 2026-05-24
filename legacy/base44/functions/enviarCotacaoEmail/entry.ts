import { Resend } from 'npm:resend@3.2.0';

const resend = new Resend(Deno.env.get('RESEND_API_KEY'));

Deno.serve(async (req) => {
  try {
    const { 
      fornecedor_email, 
      fornecedor_nome,
      cotacao_numero,
      empresa_nome,
      data_limite,
      link_cotacao,
      token,
      arquivo_url
    } = await req.json();

    if (!fornecedor_email || !fornecedor_nome || !cotacao_numero) {
      return Response.json({ error: 'Parâmetros obrigatórios faltando' }, { status: 400 });
    }

    const emailHTML = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #f59e0b;">Nova Cotação - ${empresa_nome}</h2>
        <p>Olá, <strong>${fornecedor_nome}</strong>!</p>
        <p>Você foi convidado para participar da cotação <strong>${cotacao_numero}</strong>.</p>
        
        <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #1e293b;">Informações da Cotação</h3>
          <p><strong>Número:</strong> ${cotacao_numero}</p>
          <p><strong>Empresa:</strong> ${empresa_nome}</p>
          ${data_limite ? `<p><strong>Data Limite:</strong> ${new Date(data_limite).toLocaleDateString('pt-BR')}</p>` : ''}
        </div>

        <p>Para acessar e responder a cotação:</p>
        <ol>
          <li>Clique no link abaixo</li>
          <li>Faça login com seus dados</li>
          <li>Preencha a cotação com seus valores</li>
        </ol>

        ${token ? `
          <a href="https://sigoobras.base44.app/cotacao/${token}" 
             style="display: inline-block; background: #f59e0b; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0;">
            Acessar Cotação
          </a>
        ` : ''}

        <hr style="margin: 30px 0; border: none; border-top: 1px solid #e2e8f0;" />
        <p style="color: #94a3b8; font-size: 12px;">
          Este é um email automático. Não responda diretamente.
        </p>
      </div>
    `;

    const emailConfig = {
      from: 'Cotações <onboarding@resend.dev>',
      to: fornecedor_email,
      subject: `Nova Cotação - ${cotacao_numero}`,
      html: emailHTML
    };

    if (arquivo_url) {
      const response = await fetch(arquivo_url);
      const buffer = await response.arrayBuffer();
      emailConfig.attachments = [{
        filename: `cotacao_${cotacao_numero}.pdf`,
        content: buffer
      }];
    }

    const result = await resend.emails.send(emailConfig);

    console.log('Email enviado com sucesso:', result.id);

    return Response.json({
      success: true,
      message: `Email enviado para ${fornecedor_email}`,
      messageId: result.id
    });

  } catch (error) {
    console.error('Erro ao enviar email:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});