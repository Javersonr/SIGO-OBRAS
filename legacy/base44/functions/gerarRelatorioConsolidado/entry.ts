import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { jsPDF } from 'npm:jspdf@2.5.2';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { 
      empresa_id, 
      data_inicio, 
      data_fim, 
      caminhao_id,
      status,
      enviar_email,
      emails_destino
    } = await req.json();

    if (!empresa_id || !data_inicio || !data_fim) {
      return Response.json({ 
        error: 'empresa_id, data_inicio e data_fim são obrigatórios' 
      }, { status: 400 });
    }

    // Buscar empresa
    const empresas = await base44.entities.Empresa.filter({ id: empresa_id });
    const empresa = empresas.length > 0 ? empresas[0] : null;

    // Construir filtro
    const filtro = {
      empresa_id,
      data_inspecao: {
        $gte: data_inicio,
        $lte: data_fim
      }
    };

    if (caminhao_id) filtro.caminhao_id = caminhao_id;
    if (status) filtro.status = status;

    // Buscar inspeções
    const inspecoes = await base44.entities.InspecaoCaminhao.filter(filtro);
    inspecoes.sort((a, b) => new Date(b.data_inspecao) - new Date(a.data_inspecao));

    // Buscar todas as ferramentas inspecionadas
    const inspecoesIds = inspecoes.map(i => i.id);
    let todasFerramentais = [];
    if (inspecoesIds.length > 0) {
      todasFerramentais = await base44.entities.InspecaoFerramental.filter({
        empresa_id,
        inspecao_id: { $in: inspecoesIds }
      });
    }

    // Criar PDF
    const doc = new jsPDF();
    let yPos = 20;

    // Header
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('RELATÓRIO CONSOLIDADO DE INSPEÇÕES', 105, yPos, { align: 'center' });
    yPos += 8;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(empresa?.nome_fantasia || empresa?.nome || 'Sistema', 105, yPos, { align: 'center' });
    yPos += 10;

    // Linha separadora
    doc.setDrawColor(245, 158, 11);
    doc.setLineWidth(0.5);
    doc.line(20, yPos, 190, yPos);
    yPos += 10;

    // Período e filtros
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('PERÍODO E FILTROS', 20, yPos);
    yPos += 6;

    doc.setFont('helvetica', 'normal');
    doc.text(`Período: ${new Date(data_inicio).toLocaleDateString('pt-BR')} a ${new Date(data_fim).toLocaleDateString('pt-BR')}`, 20, yPos);
    yPos += 5;
    if (caminhao_id) {
      doc.text(`Caminhão: ${caminhao_id}`, 20, yPos);
      yPos += 5;
    }
    if (status) {
      doc.text(`Status: ${status}`, 20, yPos);
      yPos += 5;
    }
    yPos += 5;

    // Estatísticas gerais
    const totalInspecoes = inspecoes.length;
    const concluidas = inspecoes.filter(i => i.status === 'concluida').length;
    const reprovadas = inspecoes.filter(i => i.status === 'reprovada').length;
    const emAndamento = inspecoes.filter(i => i.status === 'em_andamento').length;
    const totalFerramentasInsp = todasFerramentais.length;
    const ferramentasAprovadas = todasFerramentais.filter(f => f.status_validacao === 'aprovada').length;
    const ferramentasReprovadas = todasFerramentais.filter(f => f.status_validacao === 'reprovada').length;

    doc.setFont('helvetica', 'bold');
    doc.text('RESUMO GERAL', 20, yPos);
    yPos += 6;

    doc.setFont('helvetica', 'normal');
    doc.text(`Total de Inspeções: ${totalInspecoes}`, 20, yPos);
    yPos += 5;
    
    doc.setTextColor(22, 163, 74);
    doc.text(`✓ Concluídas: ${concluidas}`, 30, yPos);
    yPos += 5;
    
    doc.setTextColor(239, 68, 68);
    doc.text(`✗ Reprovadas: ${reprovadas}`, 30, yPos);
    yPos += 5;
    
    doc.setTextColor(100, 116, 139);
    doc.text(`⏳ Em Andamento: ${emAndamento}`, 30, yPos);
    doc.setTextColor(0, 0, 0);
    yPos += 8;

    doc.text(`Total de Ferramentas Inspecionadas: ${totalFerramentasInsp}`, 20, yPos);
    yPos += 5;
    
    doc.setTextColor(22, 163, 74);
    doc.text(`✓ Aprovadas: ${ferramentasAprovadas}`, 30, yPos);
    yPos += 5;
    
    doc.setTextColor(239, 68, 68);
    doc.text(`✗ Reprovadas: ${ferramentasReprovadas}`, 30, yPos);
    doc.setTextColor(0, 0, 0);
    yPos += 10;

    // Linha separadora
    doc.setDrawColor(226, 232, 240);
    doc.line(20, yPos, 190, yPos);
    yPos += 10;

    // Detalhes das inspeções
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('DETALHAMENTO DAS INSPEÇÕES', 20, yPos);
    yPos += 8;

    doc.setFontSize(9);

    for (const inspecao of inspecoes) {
      // Verificar se precisa de nova página
      if (yPos > 250) {
        doc.addPage();
        yPos = 20;
      }

      // Box da inspeção
      doc.setDrawColor(226, 232, 240);
      doc.setFillColor(248, 250, 252);
      doc.rect(20, yPos - 5, 170, 30, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.text(`${inspecao.caminhao_placa} - ${inspecao.caminhao_modelo || ''}`, 25, yPos);
      yPos += 5;

      doc.setFont('helvetica', 'normal');
      doc.text(`Data: ${new Date(inspecao.data_inspecao).toLocaleDateString('pt-BR')}`, 25, yPos);
      doc.text(`Inspetor: ${inspecao.usuario_nome || 'N/A'}`, 100, yPos);
      yPos += 5;

      const statusColor = inspecao.status === 'concluida' 
        ? [22, 163, 74] 
        : inspecao.status === 'reprovada' 
        ? [239, 68, 68] 
        : [100, 116, 139];
      
      doc.setTextColor(...statusColor);
      const statusLabel = inspecao.status === 'concluida' ? '✓ CONCLUÍDA' : 
                         inspecao.status === 'reprovada' ? '✗ REPROVADA' : 
                         '⏳ EM ANDAMENTO';
      doc.text(`Status: ${statusLabel}`, 25, yPos);
      doc.setTextColor(0, 0, 0);
      yPos += 5;

      doc.text(`Total: ${inspecao.total_ferramentas} | Inspecionadas: ${inspecao.ferramentas_inspecionadas}`, 25, yPos);
      yPos += 5;

      // Buscar ferramentais desta inspeção
      const ferramentaisInsp = todasFerramentais.filter(f => f.inspecao_id === inspecao.id);
      const aprovadas = ferramentaisInsp.filter(f => f.status_validacao === 'aprovada').length;
      const reprovadas = ferramentaisInsp.filter(f => f.status_validacao === 'reprovada').length;

      doc.setTextColor(22, 163, 74);
      doc.text(`Aprovadas: ${aprovadas}`, 25, yPos);
      doc.setTextColor(239, 68, 68);
      doc.text(`Reprovadas: ${reprovadas}`, 80, yPos);
      doc.setTextColor(0, 0, 0);
      yPos += 5;

      if (inspecao.observacoes) {
        doc.setFontSize(8);
        const obsLines = doc.splitTextToSize(`Obs: ${inspecao.observacoes}`, 165);
        doc.text(obsLines, 25, yPos);
        yPos += obsLines.length * 4;
        doc.setFontSize(9);
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
            subject: `Relatório Consolidado de Inspeções - ${new Date(data_inicio).toLocaleDateString('pt-BR')} a ${new Date(data_fim).toLocaleDateString('pt-BR')}`,
            body: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 20px; border-radius: 8px 8px 0 0;">
                  <h2 style="color: white; margin: 0;">📊 Relatório Consolidado</h2>
                </div>
                
                <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
                  <p style="color: #1f2937; font-size: 16px; margin-bottom: 20px;">
                    Segue em anexo o relatório consolidado de inspeções do período.
                  </p>
                  
                  <div style="background: #f8fafc; padding: 15px; border-radius: 6px; margin-bottom: 20px;">
                    <p style="margin: 5px 0; color: #475569;"><strong>Período:</strong> ${new Date(data_inicio).toLocaleDateString('pt-BR')} a ${new Date(data_fim).toLocaleDateString('pt-BR')}</p>
                    <p style="margin: 5px 0; color: #475569;"><strong>Total de Inspeções:</strong> ${totalInspecoes}</p>
                  </div>
                  
                  <div style="background: #ecfdf5; padding: 15px; border-radius: 6px; border-left: 4px solid #10b981;">
                    <p style="margin: 0; color: #065f46;">
                      <strong>✓ Concluídas:</strong> ${concluidas} | 
                      <strong>✗ Reprovadas:</strong> ${reprovadas} | 
                      <strong>⏳ Em Andamento:</strong> ${emAndamento}
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
              filename: `relatorio_consolidado_${new Date().toISOString().split('T')[0]}.pdf`,
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
        'Content-Disposition': `attachment; filename=relatorio_consolidado_${new Date().toISOString().split('T')[0]}.pdf`
      }
    });
  } catch (error) {
    console.error('Erro ao gerar relatório consolidado:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});