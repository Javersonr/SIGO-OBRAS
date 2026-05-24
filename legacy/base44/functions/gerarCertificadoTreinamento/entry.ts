import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { jsPDF } from 'npm:jspdf@2.5.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const { treinamento_id, empresa_id } = await req.json();

    // Buscar treinamento
    const treinamentos = await base44.entities.Treinamento.filter({ id: treinamento_id });
    if (treinamentos.length === 0) {
      return Response.json({ error: 'Treinamento não encontrado' }, { status: 404 });
    }
    const treinamento = treinamentos[0];

    // Buscar dados da empresa
    const empresas = await base44.entities.Empresa.filter({ id: empresa_id });
    const empresa = empresas[0];

    // Criar PDF
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const centerX = pageWidth / 2;

    // Adicionar borda decorativa
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.rect(10, 10, pageWidth - 20, pageHeight - 20);
    doc.rect(12, 12, pageWidth - 24, pageHeight - 24);

    // Logo da empresa (se existir)
    if (empresa?.logo_url) {
      try {
        const logoResponse = await fetch(empresa.logo_url);
        const logoBlob = await logoResponse.blob();
        const logoDataUrl = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(logoBlob);
        });
        doc.addImage(logoDataUrl, 'PNG', 20, 20, 40, 20);
      } catch (error) {
        console.error('Erro ao carregar logo:', error);
      }
    }

    // Título "Certificado"
    doc.setFontSize(36);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 100, 100);
    doc.text('Certificado', centerX, 45, { align: 'center' });

    // Corpo do certificado
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);

    const empresaNome = empresa?.razao_social || empresa?.nome_fantasia || empresa?.nome || 'Empresa';
    doc.text(`A empresa ${empresaNome}, confere a:`, centerX, 62, { align: 'center' });

    // Nome do aluno
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(treinamento.aluno_nome.toUpperCase(), centerX, 72, { align: 'center' });

    // CPF do aluno
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);
    doc.text(`CPF: ${treinamento.aluno_cpf}`, centerX, 79, { align: 'center' });

    // Texto da certificação
    doc.setFontSize(10.5);
    const periodo = treinamento.data_inicio && treinamento.data_fim
      ? `no período de ${new Date(treinamento.data_inicio).toLocaleDateString('pt-BR')} à ${new Date(treinamento.data_fim).toLocaleDateString('pt-BR')}`
      : '';
    
    const textoTreinamento = `A participação no Treinamento ${treinamento.codigo ? treinamento.codigo + ' - ' : ''}${treinamento.nome.toUpperCase()}`;
    const textoAproveitamento = `com aproveitamento satisfatório de ${treinamento.aproveitamento}%`;
    const textoCargaHoraria = treinamento.carga_horaria ? `com duração de ${treinamento.carga_horaria} horas/aula` : '';

    let yPos = 92;
    
    // Quebrar texto em linhas
    const lines = doc.splitTextToSize(
      `${textoTreinamento} ${textoAproveitamento} ${textoCargaHoraria}${periodo ? ', ' + periodo : ''}.`,
      pageWidth - 80
    );
    
    lines.forEach(line => {
      doc.text(line, centerX, yPos, { align: 'center' });
      yPos += 5.5;
    });

    // Local e data
    if (treinamento.local || treinamento.data_fim) {
      yPos += 4;
      const dataEmissao = treinamento.data_fim 
        ? new Date(treinamento.data_fim).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })
        : new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
      
      const localTexto = treinamento.local || '';
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(10);
      doc.text(`${localTexto}${localTexto ? ', ' : ''}${dataEmissao}`, centerX, yPos, { align: 'center' });
    }

    // Assinaturas
    yPos = pageHeight - 45;

    if (treinamento.instrutor_nome) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.line(40, yPos, 90, yPos);
      doc.text(treinamento.instrutor_nome, 65, yPos + 4, { align: 'center' });
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.text('Instrutor', 65, yPos + 8, { align: 'center' });
      if (treinamento.instrutor_cpf) {
        doc.text(`CPF: ${treinamento.instrutor_cpf}`, 65, yPos + 11, { align: 'center' });
      }
    }

    if (treinamento.engenheiro_responsavel_nome) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.line(pageWidth - 90, yPos, pageWidth - 40, yPos);
      doc.text(treinamento.engenheiro_responsavel_nome, pageWidth - 65, yPos + 4, { align: 'center' });
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.text('Engenheiro Responsável', pageWidth - 65, yPos + 8, { align: 'center' });
      if (treinamento.engenheiro_responsavel_crea) {
        doc.text(`CREA: ${treinamento.engenheiro_responsavel_crea}`, pageWidth - 65, yPos + 11, { align: 'center' });
      }
    }

    // Conteúdo programático (segunda página se necessário)
    if (treinamento.conteudo_programatico && treinamento.conteudo_programatico.trim()) {
      doc.addPage();
      
      // Borda decorativa na segunda página
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.5);
      doc.rect(10, 10, pageWidth - 20, pageHeight - 20);
      
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text('Conteúdo Programático', centerX, 25, { align: 'center' });
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(60, 60, 60);
      
      const colWidth = (pageWidth - 40) / 2 - 5;
      const conteudoLines = doc.splitTextToSize(treinamento.conteudo_programatico, colWidth);
      
      let col1Y = 40;
      let col2Y = 40;
      let isCol1 = true;
      
      conteudoLines.forEach(line => {
        if (isCol1) {
          if (col1Y > pageHeight - 25) {
            isCol1 = false;
            col2Y = 40;
          } else {
            doc.text(line, 20, col1Y);
            col1Y += 5.5;
          }
        }
        
        if (!isCol1) {
          if (col2Y > pageHeight - 25) {
            doc.addPage();
            doc.setDrawColor(200, 200, 200);
            doc.setLineWidth(0.5);
            doc.rect(10, 10, pageWidth - 20, pageHeight - 20);
            col1Y = 25;
            col2Y = 25;
            isCol1 = true;
          } else {
            doc.text(line, pageWidth / 2 + 5, col2Y);
            col2Y += 5.5;
          }
        }
      });
    }

    const pdfBytes = doc.output('arraybuffer');

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename=certificado_${treinamento.aluno_nome.replace(/\s+/g, '_')}.pdf`
      }
    });
  } catch (error) {
    console.error('Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});