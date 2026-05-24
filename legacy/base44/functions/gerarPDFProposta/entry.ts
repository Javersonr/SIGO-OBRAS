import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { jsPDF } from 'npm:jspdf@2.5.2';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { proposta_id } = await req.json();

    if (!proposta_id) {
      return Response.json({ error: 'proposta_id é obrigatório' }, { status: 400 });
    }

    // Buscar dados da proposta
    const [propostas] = await Promise.all([
      base44.asServiceRole.entities.PropostaComercial.filter({ id: proposta_id })
    ]);

    if (propostas.length === 0) {
      return Response.json({ error: 'Proposta não encontrada' }, { status: 404 });
    }

    const proposta = propostas[0];

    // Buscar dados do plano
    const [planos] = await Promise.all([
      base44.asServiceRole.entities.Plano.filter({ id: proposta.plano_id })
    ]);

    const plano = planos[0];

    // Criar PDF
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    const margin = 20;
    let y = 20;

    // Cabeçalho
    doc.setFillColor(245, 158, 11); // Cor primária
    doc.rect(0, 0, pageWidth, 40, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont(undefined, 'bold');
    doc.text('PROPOSTA COMERCIAL', margin, 25);
    
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text(`Nº ${proposta.numero || 'N/A'}`, pageWidth - margin, 25, { align: 'right' });

    y = 55;

    // Dados da Empresa Cliente
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('DADOS DO CLIENTE', margin, y);
    y += 10;

    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text(`Empresa: ${proposta.empresa_nome || 'N/A'}`, margin, y);
    y += 6;
    if (proposta.empresa_cnpj) {
      doc.text(`CNPJ: ${proposta.empresa_cnpj}`, margin, y);
      y += 6;
    }
    if (proposta.contato_nome) {
      doc.text(`Contato: ${proposta.contato_nome}`, margin, y);
      y += 6;
    }
    if (proposta.contato_email) {
      doc.text(`Email: ${proposta.contato_email}`, margin, y);
      y += 6;
    }
    if (proposta.contato_telefone) {
      doc.text(`Telefone: ${proposta.contato_telefone}`, margin, y);
      y += 6;
    }

    y += 5;

    // Linha separadora
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, y, pageWidth - margin, y);
    y += 10;

    // Detalhes do Plano
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('PLANO CONTRATADO', margin, y);
    y += 10;

    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.text(proposta.plano_nome || 'N/A', margin, y);
    y += 8;

    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    
    if (plano?.descricao) {
      const descLines = doc.splitTextToSize(plano.descricao, pageWidth - 2 * margin);
      doc.text(descLines, margin, y);
      y += descLines.length * 5 + 5;
    }

    // Recursos do Plano
    if (plano?.modulos_liberados) {
      try {
        const modulos = JSON.parse(plano.modulos_liberados);
        const modulosAtivos = Object.entries(modulos).filter(([k, v]) => v).map(([k]) => k);
        
        if (modulosAtivos.length > 0) {
          doc.setFont(undefined, 'bold');
          doc.text('Módulos Incluídos:', margin, y);
          y += 6;
          doc.setFont(undefined, 'normal');
          
          modulosAtivos.forEach(mod => {
            doc.text(`• ${mod}`, margin + 5, y);
            y += 5;
          });
          y += 3;
        }
      } catch (e) {
        console.error('Erro ao parsear módulos:', e);
      }
    }

    doc.setFont(undefined, 'bold');
    doc.text(`• Até ${plano?.max_usuarios || 5} usuários`, margin + 5, y);
    y += 5;
    doc.text(`• Até ${plano?.max_projetos || 10} projetos ativos`, margin + 5, y);
    y += 10;

    // Linha separadora
    doc.line(margin, y, pageWidth - margin, y);
    y += 10;

    // Valores
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('VALORES', margin, y);
    y += 10;

    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text(`Valor Mensal do Plano: R$ ${proposta.valor_mensal?.toFixed(2) || '0.00'}`, margin, y);
    y += 6;

    if (proposta.desconto_percentual > 0) {
      doc.setTextColor(220, 38, 38); // Vermelho
      doc.text(`Desconto: ${proposta.desconto_percentual}%`, margin, y);
      doc.setTextColor(0, 0, 0);
      y += 6;
    }

    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(16, 185, 129); // Verde
    doc.text(`Valor Final Mensal: R$ ${proposta.valor_final?.toFixed(2) || proposta.valor_mensal?.toFixed(2) || '0.00'}`, margin, y);
    doc.setTextColor(0, 0, 0);
    y += 10;

    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text(`Vigência do Contrato: ${proposta.vigencia_meses || 12} meses`, margin, y);
    y += 6;

    const valorTotal = (proposta.valor_final || proposta.valor_mensal || 0) * (proposta.vigencia_meses || 12);
    doc.text(`Valor Total do Contrato: R$ ${valorTotal.toFixed(2)}`, margin, y);
    y += 10;

    // Linha separadora
    doc.line(margin, y, pageWidth - margin, y);
    y += 10;

    // Validade da Proposta
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text('VALIDADE DA PROPOSTA', margin, y);
    y += 6;
    doc.setFont(undefined, 'normal');
    
    if (proposta.data_validade) {
      const dataValidade = new Date(proposta.data_validade);
      doc.text(`Esta proposta é válida até: ${dataValidade.toLocaleDateString('pt-BR')}`, margin, y);
      y += 10;
    }

    // Observações
    if (proposta.observacoes) {
      doc.setFont(undefined, 'bold');
      doc.text('OBSERVAÇÕES', margin, y);
      y += 6;
      doc.setFont(undefined, 'normal');
      
      const obsLines = doc.splitTextToSize(proposta.observacoes, pageWidth - 2 * margin);
      doc.text(obsLines, margin, y);
      y += obsLines.length * 5 + 10;
    }

    // Termos e Condições
    if (proposta.termos_condicoes) {
      // Nova página se necessário
      if (y > pageHeight - 60) {
        doc.addPage();
        y = 20;
      }

      doc.setFont(undefined, 'bold');
      doc.text('TERMOS E CONDIÇÕES', margin, y);
      y += 6;
      doc.setFont(undefined, 'normal');
      
      const termosLines = doc.splitTextToSize(proposta.termos_condicoes, pageWidth - 2 * margin);
      doc.text(termosLines, margin, y);
      y += termosLines.length * 5;
    }

    // Rodapé
    const footerY = pageHeight - 20;
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(
      `Gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`,
      pageWidth / 2,
      footerY,
      { align: 'center' }
    );

    // Gerar PDF como array buffer
    const pdfBytes = doc.output('arraybuffer');

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename=proposta_${proposta.numero || 'comercial'}.pdf`
      }
    });
  } catch (error) {
    console.error('Erro ao gerar PDF:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});