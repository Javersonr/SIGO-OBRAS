import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { jsPDF } from 'npm:jspdf@2.5.2';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { inspecao_id, enviar_email, emails_destino } = await req.json();

    if (!inspecao_id) {
      return Response.json({ error: 'inspecao_id é obrigatório' }, { status: 400 });
    }

    // Buscar dados da inspeção
    const inspecoes = await base44.entities.InspecaoCaminhao.filter({ id: inspecao_id });
    if (inspecoes.length === 0) {
      return Response.json({ error: 'Inspeção não encontrada' }, { status: 404 });
    }
    const inspecao = inspecoes[0];

    // Buscar empresa
    const empresas = await base44.entities.Empresa.filter({ id: inspecao.empresa_id });
    const empresa = empresas.length > 0 ? empresas[0] : null;

    // Buscar ferramentas da inspeção
    const ferramentasCaminhao = await base44.entities.Ferramenta.filter({
      empresa_id: inspecao.empresa_id,
      localizacao: inspecao.caminhao_placa
    });

    // Buscar dados de inspeção das ferramentas
    const inspecoesFerramental = await base44.entities.InspecaoFerramental.filter({
      empresa_id: inspecao.empresa_id,
      inspecao_id: inspecao_id
    });

    // Criar PDF
    const doc = new jsPDF();
    let yPos = 20;

    // Header com logo/empresa
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text(empresa?.nome_fantasia || empresa?.nome || 'Relatório de Inspeção', 105, yPos, { align: 'center' });
    yPos += 10;

    // Linha separadora
    doc.setDrawColor(245, 158, 11);
    doc.setLineWidth(0.5);
    doc.line(20, yPos, 190, yPos);
    yPos += 10;

    // Informações da Inspeção
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('INFORMAÇÕES DA INSPEÇÃO', 20, yPos);
    yPos += 8;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Caminhão: ${inspecao.caminhao_placa} - ${inspecao.caminhao_modelo || ''}`, 20, yPos);
    yPos += 6;
    doc.text(`Data: ${new Date(inspecao.data_inspecao).toLocaleDateString('pt-BR')}`, 20, yPos);
    yPos += 6;
    doc.text(`Inspetor: ${inspecao.usuario_nome || 'N/A'}`, 20, yPos);
    yPos += 6;
    doc.text(`Status: ${inspecao.status === 'concluida' ? 'Concluída' : inspecao.status === 'reprovada' ? 'Reprovada' : 'Em Andamento'}`, 20, yPos);
    yPos += 6;
    doc.text(`Total de Ferramentas: ${inspecao.total_ferramentas}`, 20, yPos);
    yPos += 6;
    doc.text(`Ferramentas Inspecionadas: ${inspecao.ferramentas_inspecionadas}`, 20, yPos);
    yPos += 10;

    if (inspecao.observacoes) {
      doc.setFont('helvetica', 'bold');
      doc.text('Observações:', 20, yPos);
      yPos += 6;
      doc.setFont('helvetica', 'normal');
      const obsLines = doc.splitTextToSize(inspecao.observacoes, 170);
      doc.text(obsLines, 20, yPos);
      yPos += obsLines.length * 5 + 5;
    }

    // Linha separadora
    doc.setDrawColor(226, 232, 240);
    doc.line(20, yPos, 190, yPos);
    yPos += 10;

    // Resumo
    const aprovadas = inspecoesFerramental.filter(i => i.status_validacao === 'aprovada').length;
    const reprovadas = inspecoesFerramental.filter(i => i.status_validacao === 'reprovada').length;
    const pendentes = ferramentasCaminhao.length - inspecoesFerramental.length;

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('RESUMO DA INSPEÇÃO', 20, yPos);
    yPos += 8;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(22, 163, 74); // Verde
    doc.text(`✓ Aprovadas: ${aprovadas}`, 20, yPos);
    doc.setTextColor(239, 68, 68); // Vermelho
    doc.text(`✗ Reprovadas: ${reprovadas}`, 80, yPos);
    doc.setTextColor(100, 116, 139); // Cinza
    doc.text(`⏳ Pendentes: ${pendentes}`, 140, yPos);
    doc.setTextColor(0, 0, 0); // Reset
    yPos += 12;

    // Detalhes das Ferramentas
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('DETALHES DAS FERRAMENTAS', 20, yPos);
    yPos += 8;

    doc.setFontSize(9);

    for (const ferramenta of ferramentasCaminhao) {
      const inspecaoFerramenta = inspecoesFerramental.find(i => i.ferramenta_id === ferramenta.id);

      // Verificar se precisa de nova página
      if (yPos > 260) {
        doc.addPage();
        yPos = 20;
      }

      // Box para cada ferramenta
      doc.setDrawColor(226, 232, 240);
      doc.setFillColor(248, 250, 252);
      doc.rect(20, yPos - 5, 170, 25, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.text(`${ferramenta.codigo} - ${ferramenta.descricao}`, 25, yPos);
      yPos += 5;

      doc.setFont('helvetica', 'normal');
      doc.text(`Tipo: ${ferramenta.tipo || 'N/A'}`, 25, yPos);
      doc.text(`Marca: ${ferramenta.marca || 'N/A'}`, 100, yPos);
      yPos += 5;

      if (inspecaoFerramenta) {
        const statusColor = inspecaoFerramenta.status_validacao === 'aprovada' 
          ? [22, 163, 74] 
          : inspecaoFerramenta.status_validacao === 'reprovada' 
          ? [239, 68, 68] 
          : [100, 116, 139];
        
        doc.setTextColor(...statusColor);
        doc.text(`Status: ${inspecaoFerramenta.status_validacao === 'aprovada' ? '✓ APROVADA' : inspecaoFerramenta.status_validacao === 'reprovada' ? '✗ REPROVADA' : 'PENDENTE'}`, 25, yPos);
        doc.setTextColor(0, 0, 0);
        
        doc.text(`Inspeção: ${new Date(inspecaoFerramenta.created_date).toLocaleDateString('pt-BR')}`, 100, yPos);
        yPos += 5;

        if (inspecaoFerramenta.observacoes) {
          doc.setFontSize(8);
          const obsLines = doc.splitTextToSize(`Obs: ${inspecaoFerramenta.observacoes}`, 165);
          doc.text(obsLines, 25, yPos);
          yPos += obsLines.length * 4;
          doc.setFontSize(9);
        }
      } else {
        doc.setTextColor(100, 116, 139);
        doc.text('Status: PENDENTE DE INSPEÇÃO', 25, yPos);
        doc.setTextColor(0, 0, 0);
        yPos += 5;
      }

      yPos += 8;
    }

    // Rodapé
    if (yPos > 250) {
      doc.addPage();
      yPos = 20;
    }
    doc.setFontSize(8);
    doc.setTextColor(156, 163, 175);
    doc.text(`Relatório gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, 105, 285, { align: 'center' });
    doc.text(`${empresa?.nome_fantasia || empresa?.nome || 'Sistema de Gestão'}`, 105, 290, { align: 'center' });

    // Gerar PDF
    const pdfBytes = doc.output('arraybuffer');

    // Se deve enviar por email
    if (enviar_email && emails_destino && emails_destino.length > 0) {
      const pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(pdfBytes)));
      
      const emailPromises = emails_destino.map(async (email) => {
        try {
          await base44.integrations.Core.SendEmail({
            to: email,
            subject: `Relatório de Inspeção - ${inspecao.caminhao_placa}`,
            body: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 20px; border-radius: 8px 8px 0 0;">
                  <h2 style="color: white; margin: 0;">📋 Relatório de Inspeção</h2>
                </div>
                
                <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
                  <p style="color: #1f2937; font-size: 16px; margin-bottom: 20px;">
                    Segue em anexo o relatório de inspeção do caminhão <strong>${inspecao.caminhao_placa}</strong>.
                  </p>
                  
                  <div style="background: #f8fafc; padding: 15px; border-radius: 6px; margin-bottom: 20px;">
                    <p style="margin: 5px 0; color: #475569;"><strong>Data da Inspeção:</strong> ${new Date(inspecao.data_inspecao).toLocaleDateString('pt-BR')}</p>
                    <p style="margin: 5px 0; color: #475569;"><strong>Inspetor:</strong> ${inspecao.usuario_nome || 'N/A'}</p>
                    <p style="margin: 5px 0; color: #475569;"><strong>Total de Ferramentas:</strong> ${inspecao.total_ferramentas}</p>
                    <p style="margin: 5px 0; color: #475569;"><strong>Inspecionadas:</strong> ${inspecao.ferramentas_inspecionadas}</p>
                  </div>
                  
                  <div style="background: #ecfdf5; padding: 15px; border-radius: 6px; border-left: 4px solid #10b981;">
                    <p style="margin: 0; color: #065f46;">
                      <strong>✓ Aprovadas:</strong> ${aprovadas} | 
                      <strong>✗ Reprovadas:</strong> ${reprovadas} | 
                      <strong>⏳ Pendentes:</strong> ${pendentes}
                    </p>
                  </div>
                  
                  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 25px 0;">
                  
                  <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                    Este é um email automático do sistema ${empresa?.nome_fantasia || empresa?.nome || 'SIGO OBRAS'}.<br>
                    Por favor, não responda este email.
                  </p>
                </div>
              </div>
            `,
            attachments: [{
              content: pdfBase64,
              filename: `inspecao_${inspecao.caminhao_placa}_${new Date().toISOString().split('T')[0]}.pdf`,
              type: 'application/pdf',
              disposition: 'attachment'
            }]
          });
          return { email, success: true };
        } catch (error) {
          console.error(`Erro ao enviar email para ${email}:`, error);
          return { email, success: false, error: error.message };
        }
      });

      const resultados = await Promise.all(emailPromises);
      const enviados = resultados.filter(r => r.success).length;
      const falhas = resultados.filter(r => !r.success).length;

      return Response.json({
        success: true,
        emails_enviados: enviados,
        emails_falha: falhas,
        resultados
      });
    }

    // Retornar PDF para download
    return new Response(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename=inspecao_${inspecao.caminhao_placa}_${new Date().toISOString().split('T')[0]}.pdf`
      }
    });
  } catch (error) {
    console.error('Erro ao gerar relatório:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});