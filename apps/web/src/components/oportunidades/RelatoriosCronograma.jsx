import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { FileText, Download, Printer } from 'lucide-react';
import { base44 } from '@/api/base44Client';


export default function RelatoriosCronograma({ etapas = [], nomeObra, clienteNome, empresaAtiva, onExportKanban, onExportCalendar, onExportTimeline }) {
  const [incluirDetalhes, setIncluirDetalhes] = useState(true);
  const [incluirResponsaveis, setIncluirResponsaveis] = useState(true);
  const [incluirDatas, setIncluirDatas] = useState(true);
  const [incluirStatus, setIncluirStatus] = useState(true);
  const [incluirPercentual, setIncluirPercentual] = useState(true);
  const [incluirDescricao, setIncluirDescricao] = useState(true);
  const [incluirSubtarefas, setIncluirSubtarefas] = useState(true);
  const [incluirObservacoes, setIncluirObservacoes] = useState(true);
  const [gerando, setGerando] = useState(false);

  // Organizar tarefas em hierarquia (tarefas principais e subtarefas)
  const tarefasOrganizadas = React.useMemo(() => {
    const tarefasPrincipais = etapas.filter(t => !t.tarefa_pai_id);
    return tarefasPrincipais.map(tarefa => ({
      ...tarefa,
      subtarefas: etapas.filter(sub => sub.tarefa_pai_id === tarefa.id)
    }));
  }, [etapas]);

  const handleGerarPDF = async () => {
    setGerando(true);
    try {
      console.log('🚀 Iniciando geração de PDF...');
      console.log('Etapas:', etapas);
      
      const { jsPDF } = await import('jspdf');
      console.log('✅ jsPDF importado com sucesso');
      
      const doc = new jsPDF('landscape');
      console.log('✅ Documento PDF criado');
      
      // Cabeçalho
      doc.setFontSize(18);
      doc.setFont(undefined, 'bold');
      doc.text('CRONOGRAMA DE OBRA', 14, 20);
      
      doc.setFontSize(11);
      doc.setFont(undefined, 'normal');
      doc.text(`Obra: ${nomeObra || 'Não informado'}`, 14, 28);
      doc.text(`Cliente: ${clienteNome || 'Não informado'}`, 14, 34);
      doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, 14, 40);

      // Desenhar tabela manualmente
      let y = 48;
      
      // Cabeçalho da tabela
      doc.setFillColor(245, 158, 11);
      doc.rect(14, y, 260, 8, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(9);
      doc.setFont(undefined, 'bold');
      
      let x = 18;
      doc.text('Nº', x, y + 5);
      x += 20;
      doc.text('Etapa', x, y + 5);
      x += 80;
      if (incluirStatus) { doc.text('Status', x, y + 5); x += 35; }
      if (incluirDatas) { 
        doc.text('Início', x, y + 5); x += 35;
        doc.text('Fim', x, y + 5); x += 35;
      }
      if (incluirPercentual) { doc.text('%', x, y + 5); x += 25; }
      if (incluirResponsaveis) { doc.text('Responsável', x, y + 5); }
      
      y += 10;
      
      // Linhas da tabela - tarefas principais
      doc.setTextColor(0, 0, 0);
      doc.setFont(undefined, 'normal');
      
      let numeroSequencial = 1;
      tarefasOrganizadas.forEach((tarefa, idx) => {
        if (y > 180) {
          doc.addPage();
          y = 20;
        }
        
        // Tarefa principal
        if (idx % 2 === 0) {
          doc.setFillColor(250, 250, 250);
          doc.rect(14, y - 4, 260, 8, 'F');
        }
        
        doc.setFont(undefined, 'bold');
        x = 18;
        doc.text(numeroSequencial.toString(), x, y);
        numeroSequencial++;
        x += 20;
        doc.text((tarefa.titulo || tarefa.etapa || '-').substring(0, 35), x, y);
        x += 80;
        if (incluirStatus) { doc.text((tarefa.status || '-').substring(0, 15), x, y); x += 35; }
        if (incluirDatas) {
          doc.text(tarefa.data_inicio || tarefa.data_inicio_planejada ? new Date((tarefa.data_inicio || tarefa.data_inicio_planejada) + 'T00:00:00').toLocaleDateString('pt-BR') : '-', x, y);
          x += 35;
          doc.text(tarefa.data_conclusao || tarefa.data_fim_planejada ? new Date((tarefa.data_conclusao || tarefa.data_fim_planejada) + 'T00:00:00').toLocaleDateString('pt-BR') : '-', x, y);
          x += 35;
        }
        if (incluirPercentual) { doc.text(`${tarefa.progresso || tarefa.percentual_conclusao || 0}%`, x, y); x += 25; }
        if (incluirResponsaveis) {
          const respNome = tarefa.responsavel_principal_nome || tarefa.responsavel_nome || '-';
          doc.text(respNome.substring(0, 20), x, y);
        }
        
        y += 8;
        
        // Subtarefas (se houver e se opção marcada)
        if (incluirSubtarefas && tarefa.subtarefas && tarefa.subtarefas.length > 0) {
          doc.setFont(undefined, 'normal');
          doc.setFontSize(8);
          tarefa.subtarefas.forEach((sub, subIdx) => {
            if (y > 180) {
              doc.addPage();
              y = 20;
            }
            
            x = 25;
            doc.text(`${numeroSequencial - 1}.${subIdx + 1}`, x, y);
            x += 15;
            doc.text((sub.titulo || '-').substring(0, 28), x, y);
            x += 75;
            if (incluirStatus) { doc.text((sub.status || '-').substring(0, 12), x, y); x += 35; }
            if (incluirDatas) {
              doc.text(sub.data_inicio ? new Date(sub.data_inicio + 'T00:00:00').toLocaleDateString('pt-BR') : '-', x, y);
              x += 35;
              doc.text(sub.data_fim ? new Date(sub.data_fim + 'T00:00:00').toLocaleDateString('pt-BR') : '-', x, y);
              x += 35;
            }
            if (incluirPercentual) { doc.text(`${sub.progresso || 0}%`, x, y); x += 25; }
            
            y += 6;
          });
          doc.setFontSize(9);
        }
      });

      // Adicionar detalhes se solicitado
      if (incluirDetalhes && tarefasOrganizadas.length > 0) {
        doc.addPage();
        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.text('DETALHES DAS TAREFAS', 14, 20);
        
        let y = 30;
        let numeroTarefa = 1;
        tarefasOrganizadas.forEach((tarefa, idx) => {
          if (y > 180) {
            doc.addPage();
            y = 20;
          }

          doc.setFontSize(11);
          doc.setFont(undefined, 'bold');
          doc.text(`${numeroTarefa}. ${tarefa.titulo || tarefa.etapa}`, 14, y);
          numeroTarefa++;
          y += 7;

          doc.setFontSize(9);
          doc.setFont(undefined, 'normal');
          
          if (incluirDescricao && tarefa.descricao) {
            const splitDesc = doc.splitTextToSize(`Descrição: ${tarefa.descricao}`, 260);
            doc.text(splitDesc, 18, y);
            y += splitDesc.length * 5 + 3;
          }

          if (incluirStatus) {
            doc.text(`Status: ${tarefa.status || '-'}`, 18, y);
            y += 5;
          }

          if (tarefa.prioridade) {
            doc.text(`Prioridade: ${tarefa.prioridade}`, 18, y);
            y += 5;
          }

          if (incluirDatas && (tarefa.data_inicio || tarefa.data_inicio_planejada)) {
            const dataInicio = tarefa.data_inicio || tarefa.data_inicio_planejada;
            const dataConclusao = tarefa.data_conclusao || tarefa.data_fim_planejada;
            doc.text(`Período: ${new Date(dataInicio + 'T00:00:00').toLocaleDateString('pt-BR')} até ${dataConclusao ? new Date(dataConclusao + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}`, 18, y);
            y += 5;
          }

          if (incluirResponsaveis) {
            const respNome = tarefa.responsavel_principal_nome || tarefa.responsavel_nome || '-';
            doc.text(`Responsável: ${respNome}`, 18, y);
            y += 5;
          }

          if (incluirPercentual) {
            doc.text(`Conclusão: ${tarefa.progresso || tarefa.percentual_conclusao || 0}%`, 18, y);
            y += 5;
          }

          if (incluirObservacoes && tarefa.observacoes) {
            const splitObs = doc.splitTextToSize(`Observações: ${tarefa.observacoes}`, 260);
            doc.text(splitObs, 18, y);
            y += splitObs.length * 5 + 3;
          }

          // Subtarefas organizadas
          if (incluirSubtarefas && tarefa.subtarefas && tarefa.subtarefas.length > 0) {
            doc.setFont(undefined, 'bold');
            doc.text(`Subtarefas (${tarefa.subtarefas.length}):`, 18, y);
            y += 5;
            doc.setFont(undefined, 'normal');
            
            tarefa.subtarefas.forEach((sub, subIdx) => {
              if (y > 180) {
                doc.addPage();
                y = 20;
              }
              const status = sub.status === 'Concluída' ? '[✓]' : '[ ]';
              doc.text(`  ${numeroTarefa - 1}.${subIdx + 1}. ${status} ${sub.titulo}`, 22, y);
              y += 5;
              
              if (sub.descricao) {
                const subDesc = doc.splitTextToSize(`     ${sub.descricao}`, 240);
                doc.text(subDesc, 22, y);
                y += subDesc.length * 4;
              }
              
              if (sub.responsavel_principal_nome) {
                doc.text(`     Responsável: ${sub.responsavel_principal_nome}`, 22, y);
                y += 4;
              }
              
              y += 2;
            });
          }

          y += 8;
        });
      }

      // Rodapé em todas as páginas
      const pageCount = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(`Página ${i} de ${pageCount}`, 280, 200, { align: 'right' });
        if (empresaAtiva?.nome) {
          doc.text(empresaAtiva.nome, 14, 200);
        }
      }

      const filename = `cronograma_${(nomeObra || 'obra').replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
      console.log('💾 Salvando arquivo:', filename);
      doc.save(filename);
      console.log('✅ PDF gerado com sucesso!');
    } catch (error) {
      console.error('❌ Erro ao gerar PDF:', error);
      alert('Erro ao gerar PDF: ' + error.message);
    } finally {
      setGerando(false);
    }
  };

  const handleImprimir = () => {
    window.print();
  };

  const handleGerarGanttPDF = async () => {
    setGerando(true);
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF('landscape', 'mm', 'a4');
      
      // Cabeçalho com informações da empresa
      doc.setFillColor(240, 240, 240);
      doc.rect(0, 0, 297, 40, 'F');
      
      // Logo (se existir) - com melhor qualidade
      if (empresaAtiva?.logo_url) {
        try {
          const img = new Image();
          img.crossOrigin = 'Anonymous';
          img.src = empresaAtiva.logo_url;
          await new Promise((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject();
          });
          doc.addImage(img, 'PNG', 10, 5, 25, 25, undefined, 'FAST');
        } catch (e) {
          console.log('Não foi possível carregar o logo');
        }
      }
      
      // Informações da empresa
      doc.setTextColor(60, 60, 60);
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text(empresaAtiva?.razao_social || empresaAtiva?.nome || 'EMPRESA', 40, 10);
      
      doc.setFontSize(9);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(80, 80, 80);
      doc.text(empresaAtiva?.cnpj || '', 40, 15);
      doc.text(empresaAtiva?.endereco ? `${empresaAtiva.endereco}${empresaAtiva.numero ? ', ' + empresaAtiva.numero : ''}` : '', 40, 19);
      doc.text(empresaAtiva?.cidade && empresaAtiva?.estado ? `${empresaAtiva.cidade} - ${empresaAtiva.estado}` : '', 40, 23);
      doc.text(empresaAtiva?.telefone || '', 40, 27);
      
      // Dados do cliente e obra
      doc.setTextColor(60, 60, 60);
      doc.setFontSize(11);
      doc.setFont(undefined, 'bold');
      doc.text('CRONOGRAMA DE OBRA', 180, 10);
      
      doc.setFontSize(9);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(80, 80, 80);
      doc.text(`Cliente: ${clienteNome || 'Não informado'}`, 180, 16);
      doc.text(`Obra: ${nomeObra || 'Não informado'}`, 180, 21);
      doc.text(`Emitido em: ${new Date().toLocaleDateString('pt-BR')}`, 180, 26);
      
      // Calcular intervalo de datas
      const todasDatas = tarefasOrganizadas
        .filter(t => t.data_inicio || t.data_inicio_planejada)
        .flatMap(t => [
          new Date((t.data_inicio || t.data_inicio_planejada) + 'T12:00:00'),
          t.data_fim || t.data_fim_planejada ? new Date((t.data_fim || t.data_fim_planejada) + 'T12:00:00') : new Date((t.data_inicio || t.data_inicio_planejada) + 'T12:00:00')
        ]);
      
      if (todasDatas.length === 0) {
        alert('Nenhuma tarefa com datas definidas');
        setGerando(false);
        return;
      }
      
      const dataMin = new Date(Math.min(...todasDatas));
      const dataMax = new Date(Math.max(...todasDatas));
      
      // Ajustar para início/fim do mês
      dataMin.setDate(1);
      dataMax.setMonth(dataMax.getMonth() + 1);
      dataMax.setDate(0);
      
      const meses = [];
      const currentDate = new Date(dataMin);
      while (currentDate <= dataMax) {
        meses.push({
          mes: currentDate.getMonth(),
          ano: currentDate.getFullYear(),
          nome: currentDate.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
          dias: new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate()
        });
        currentDate.setMonth(currentDate.getMonth() + 1);
      }
      
      const totalDias = meses.reduce((acc, m) => acc + m.dias, 0);
      const larguraDisponivel = 207;
      const larguraColuna = Math.min(3.5, larguraDisponivel / totalDias);
      
      const yInicio = 45;
      
      // Desenhar tarefas
      let yTarefa = yInicio + 34;
      const alturaTarefa = 10;
      
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(9);
      doc.setFont(undefined, 'normal');
      
      const desenharCabecalho = (yPos) => {
        // Cabeçalho de tarefas
        doc.setFillColor(180, 180, 180);
        doc.rect(10, yPos, 80, 24, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(16);
        doc.text('TAREFAS', 50, yPos + 15, { align: 'center' });
        
        // Cabeçalho de meses
        let xMes = 90;
        meses.forEach(mes => {
          const larguraMes = mes.dias * larguraColuna;
          
          doc.setFillColor(180, 180, 180);
          doc.rect(xMes, yPos, larguraMes, 12, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(10);
          doc.setFont(undefined, 'bold');
          const mesNome = new Date(mes.ano, mes.mes).toLocaleDateString('pt-BR', { month: 'long' }).toUpperCase();
          doc.text(`${mesNome}/${mes.ano}`, xMes + larguraMes / 2, yPos + 8, { align: 'center' });
          
          // Semanas
          const semanas = [];
          let semanaAtual = { inicio: 1, fim: null };
          
          for (let dia = 1; dia <= mes.dias; dia++) {
            const data = new Date(mes.ano, mes.mes, dia);
            const diaSemana = data.getDay();
            
            if (diaSemana === 0 || dia === mes.dias) {
              semanaAtual.fim = dia;
              semanas.push({ ...semanaAtual });
              semanaAtual = { inicio: dia + 1, fim: null };
            }
          }
          
          doc.setFillColor(245, 245, 245);
          doc.rect(xMes, yPos + 12, larguraMes, 12, 'F');
          doc.setTextColor(70, 70, 70);
          doc.setFontSize(9);
          doc.setFont(undefined, 'normal');
          
          let xSemana = xMes;
          semanas.forEach((semana, idx) => {
            const diasSemana = semana.fim - semana.inicio + 1;
            const larguraSemana = diasSemana * larguraColuna;
            
            // Linha vertical
            doc.setDrawColor(180, 180, 180);
            doc.setLineWidth(0.4);
            doc.line(xSemana, yPos + 12, xSemana, 190);
            
            doc.setFontSize(9);
            doc.text(`${idx + 1}`, xSemana + larguraSemana / 2, yPos + 20, { align: 'center' });
            xSemana += larguraSemana;
          });
          
          doc.setDrawColor(180, 180, 180);
          doc.setLineWidth(0.4);
          doc.line(xSemana, yPos + 12, xSemana, 190);
          
          xMes += larguraMes;
        });
        
        // Linha horizontal após cabeçalho
        doc.setDrawColor(150, 150, 150);
        doc.setLineWidth(0.5);
        doc.line(10, yPos + 24, xMes, yPos + 24);
      };

      // Desenhar cabeçalho inicial
      desenharCabecalho(yInicio);

      tarefasOrganizadas.forEach((tarefa, idx) => {
        if (yTarefa > 178) {
          doc.addPage();
          yTarefa = 20;
          desenharCabecalho(20);
          yTarefa = 20 + 34;
        }
        
        // Nome da tarefa - texto completo com quebra
        doc.setFillColor(250, 250, 250);
        doc.rect(10, yTarefa, 80, 10, 'F');
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.3);
        doc.rect(10, yTarefa, 80, 10, 'S');
        
        // Linhas verticais da coluna de tarefas
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.2);
        for (let xLine = 90; xLine <= 90 + (totalDias * larguraColuna); xLine += larguraColuna) {
          doc.line(xLine, yTarefa, xLine, yTarefa + 10);
        }
        doc.setTextColor(0, 0, 0);
        const tituloCompleto = `${idx + 1}. ${tarefa.titulo || tarefa.etapa || ''}`;
        const linhasTitulo = doc.splitTextToSize(tituloCompleto, 76);
        doc.text(linhasTitulo[0], 12, yTarefa + 6.5);
        
        // Calcular posição da barra
        if (tarefa.data_inicio || tarefa.data_inicio_planejada) {
          const dataInicioTarefa = new Date((tarefa.data_inicio || tarefa.data_inicio_planejada) + 'T12:00:00');
          const dataFimTarefa = tarefa.data_fim || tarefa.data_fim_planejada 
            ? new Date((tarefa.data_fim || tarefa.data_fim_planejada) + 'T12:00:00')
            : new Date(dataInicioTarefa);
          
          // Calcular dias desde o início
          let diasDesdeInicio = 0;
          const mesInicio = new Date(dataMin);
          
          while (mesInicio < dataInicioTarefa) {
            diasDesdeInicio++;
            mesInicio.setDate(mesInicio.getDate() + 1);
          }
          
          // Calcular duração
          const duracao = Math.max(1, Math.ceil((dataFimTarefa - dataInicioTarefa) / (1000 * 60 * 60 * 24)) + 1);
          
          const xBarra = 90 + (diasDesdeInicio * larguraColuna);
          const larguraBarra = duracao * larguraColuna;
          
          // Desenhar barra
          const cor = tarefa.status === 'Concluída' ? [16, 185, 129] :
                     tarefa.status === 'Em Andamento' ? [59, 130, 246] :
                     tarefa.status === 'Bloqueada' ? [239, 68, 68] : [14, 165, 233];
          
          doc.setFillColor(...cor);
          doc.roundedRect(xBarra, yTarefa + 1, larguraBarra, 8, 2, 2, 'F');
          
          // Progresso
          if (tarefa.progresso > 0 && tarefa.status !== 'Concluída') {
            doc.setFillColor(cor[0] - 30, cor[1] - 30, cor[2] - 30);
            doc.roundedRect(xBarra, yTarefa + 1, (larguraBarra * tarefa.progresso / 100), 8, 2, 2, 'F');
          }
          
          // Adicionar datas dentro da barra
          doc.setTextColor(0, 0, 0);
          doc.setFontSize(7);
          doc.setFont(undefined, 'bold');
          const dataInicioFormatada = dataInicioTarefa.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
          const dataFimFormatada = dataFimTarefa.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
          const textoData = `${dataInicioFormatada} - ${dataFimFormatada}`;
          doc.text(textoData, xBarra + larguraBarra / 2, yTarefa + 6, { align: 'center' });
        }
        
        yTarefa += alturaTarefa;
        
        // Subtarefas
        if (incluirSubtarefas && tarefa.subtarefas && tarefa.subtarefas.length > 0) {
          doc.setFontSize(8);
          tarefa.subtarefas.forEach((sub, subIdx) => {
            if (yTarefa > 178) {
              doc.addPage();
              yTarefa = 20;
            }
            
            doc.setFillColor(245, 247, 250);
            doc.rect(10, yTarefa, 80, 8, 'F');
            doc.setDrawColor(200, 200, 200);
            doc.setLineWidth(0.3);
            doc.rect(10, yTarefa, 80, 8, 'S');
            
            // Linhas verticais da coluna de subtarefas
            doc.setDrawColor(200, 200, 200);
            doc.setLineWidth(0.2);
            for (let xLine = 90; xLine <= 90 + (totalDias * larguraColuna); xLine += larguraColuna) {
              doc.line(xLine, yTarefa, xLine, yTarefa + 8);
            }
            doc.setTextColor(80, 80, 80);
            const tituloSub = `   ${idx + 1}.${subIdx + 1} ${sub.titulo || ''}`;
            const linhasSub = doc.splitTextToSize(tituloSub, 76);
            doc.text(linhasSub[0], 12, yTarefa + 5.5);
            
            if (sub.data_inicio) {
              const dataInicioSub = new Date(sub.data_inicio + 'T12:00:00');
              const dataFimSub = sub.data_fim ? new Date(sub.data_fim + 'T12:00:00') : new Date(dataInicioSub);
              
              let diasDesdeInicio = 0;
              const mesInicio = new Date(dataMin);
              
              while (mesInicio < dataInicioSub) {
                diasDesdeInicio++;
                mesInicio.setDate(mesInicio.getDate() + 1);
              }
              
              const duracao = Math.max(1, Math.ceil((dataFimSub - dataInicioSub) / (1000 * 60 * 60 * 24)) + 1);
              
              const xBarra = 90 + (diasDesdeInicio * larguraColuna);
              const larguraBarra = duracao * larguraColuna;
              
              doc.setFillColor(100, 180, 200);
              doc.roundedRect(xBarra, yTarefa + 1, larguraBarra, 6, 1.5, 1.5, 'F');
              
              // Adicionar datas nas subtarefas
              doc.setTextColor(0, 0, 0);
              doc.setFontSize(6);
              doc.setFont(undefined, 'bold');
              const dataInicioFormatada = dataInicioSub.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
              const dataFimFormatada = dataFimSub.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
              doc.text(`${dataInicioFormatada}-${dataFimFormatada}`, xBarra + larguraBarra / 2, yTarefa + 5, { align: 'center' });
            }
            
            yTarefa += 8;
          });
          doc.setFontSize(9);
        }
      });
      
      // Legenda
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.3);
      doc.line(10, 185, 287, 185);
      
      doc.setFontSize(7);
      doc.setTextColor(100, 100, 100);
      doc.text('LEGENDA:', 12, 190);
      
      doc.setFillColor(16, 185, 129);
      doc.rect(30, 187.5, 4, 3, 'F');
      doc.text('Concluída', 36, 190);
      
      doc.setFillColor(59, 130, 246);
      doc.rect(60, 187.5, 4, 3, 'F');
      doc.text('Em Andamento', 66, 190);
      
      doc.setFillColor(14, 165, 233);
      doc.rect(100, 187.5, 4, 3, 'F');
      doc.text('A Fazer', 106, 190);
      
      doc.setFillColor(239, 68, 68);
      doc.rect(130, 187.5, 4, 3, 'F');
      doc.text('Bloqueada', 136, 190);
      
      // Rodapé
      doc.setFontSize(7);
      doc.setTextColor(120, 120, 120);
      doc.text(`${empresaAtiva?.razao_social || empresaAtiva?.nome || ''} - Documento gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, 12, 198);
      
      const filename = `cronograma_gantt_${(nomeObra || 'projeto').replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(filename);
    } catch (error) {
      console.error('Erro ao gerar Gantt PDF:', error);
      alert('Erro ao gerar cronograma visual: ' + error.message);
    } finally {
      setGerando(false);
    }
  };

  const handleExportarExcel = async () => {
    try {
      const XLSX = await import('xlsx');
      
      // Calcular intervalo de datas
      const todasDatas = tarefasOrganizadas
        .filter(t => t.data_inicio || t.data_inicio_planejada)
        .flatMap(t => [
          new Date((t.data_inicio || t.data_inicio_planejada) + 'T12:00:00'),
          t.data_fim || t.data_fim_planejada ? new Date((t.data_fim || t.data_fim_planejada) + 'T12:00:00') : new Date((t.data_inicio || t.data_inicio_planejada) + 'T12:00:00')
        ]);
      
      if (todasDatas.length === 0) {
        alert('Nenhuma tarefa com datas definidas');
        return;
      }
      
      const dataMin = new Date(Math.min(...todasDatas));
      const dataMax = new Date(Math.max(...todasDatas));
      
      dataMin.setDate(1);
      dataMax.setMonth(dataMax.getMonth() + 1);
      dataMax.setDate(0);
      
      // Calcular semanas
      const semanas = [];
      const currentDate = new Date(dataMin);
      let semanaNum = 1;
      
      while (currentDate <= dataMax) {
        const inicioSemana = new Date(currentDate);
        const fimSemana = new Date(currentDate);
        fimSemana.setDate(fimSemana.getDate() + 6);
        
        semanas.push({
          numero: semanaNum++,
          inicio: new Date(inicioSemana),
          fim: new Date(fimSemana),
          label: `Sem ${semanaNum - 1}\n${inicioSemana.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`
        });
        
        currentDate.setDate(currentDate.getDate() + 7);
      }
      
      // Criar cabeçalhos
      const headers = ['Nº', 'Tarefa', 'Status', 'Início', 'Fim', '%'];
      semanas.forEach(sem => headers.push(sem.label));
      
      // Criar linhas de dados
      const dados = [];
      let numeroTarefa = 1;
      
      tarefasOrganizadas.forEach((tarefa, idx) => {
        const linha = [
          numeroTarefa++,
          tarefa.titulo || tarefa.etapa || '',
          tarefa.status || '',
          tarefa.data_inicio || tarefa.data_inicio_planejada || '',
          tarefa.data_conclusao || tarefa.data_fim_planejada || '',
          (tarefa.progresso || tarefa.percentual_conclusao || 0) + '%'
        ];
        
        // Preencher semanas com marcação visual
        if (tarefa.data_inicio || tarefa.data_inicio_planejada) {
          const dataInicioTarefa = new Date((tarefa.data_inicio || tarefa.data_inicio_planejada) + 'T12:00:00');
          const dataFimTarefa = tarefa.data_fim || tarefa.data_fim_planejada 
            ? new Date((tarefa.data_fim || tarefa.data_fim_planejada) + 'T12:00:00')
            : new Date(dataInicioTarefa);
          
          semanas.forEach(semana => {
            // Verificar se a tarefa está ativa nesta semana
            if (dataFimTarefa >= semana.inicio && dataInicioTarefa <= semana.fim) {
              linha.push('█████');
            } else {
              linha.push('');
            }
          });
        } else {
          semanas.forEach(() => linha.push(''));
        }
        
        dados.push(linha);
        
        // Subtarefas
        if (incluirSubtarefas && tarefa.subtarefas && tarefa.subtarefas.length > 0) {
          tarefa.subtarefas.forEach((sub, subIdx) => {
            const linhaSub = [
              `${numeroTarefa - 1}.${subIdx + 1}`,
              `  ${sub.titulo || ''}`,
              sub.status || '',
              sub.data_inicio || '',
              sub.data_fim || '',
              (sub.progresso || 0) + '%'
            ];
            
            if (sub.data_inicio) {
              const dataInicioSub = new Date(sub.data_inicio + 'T12:00:00');
              const dataFimSub = sub.data_fim ? new Date(sub.data_fim + 'T12:00:00') : new Date(dataInicioSub);
              
              semanas.forEach(semana => {
                if (dataFimSub >= semana.inicio && dataInicioSub <= semana.fim) {
                  linhaSub.push('▓▓▓');
                } else {
                  linhaSub.push('');
                }
              });
            } else {
              semanas.forEach(() => linhaSub.push(''));
            }
            
            dados.push(linhaSub);
          });
        }
      });
      
      // Criar workbook
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([
        [`CRONOGRAMA GANTT - ${nomeObra || 'Obra'}`],
        [`Cliente: ${clienteNome || 'Não informado'}`],
        [`Data: ${new Date().toLocaleDateString('pt-BR')}`],
        [],
        headers,
        ...dados
      ]);
      
      // Ajustar larguras das colunas
      const colWidths = [
        { wch: 8 },  // Nº
        { wch: 35 }, // Tarefa
        { wch: 15 }, // Status
        { wch: 12 }, // Início
        { wch: 12 }, // Fim
        { wch: 6 },  // %
      ];
      semanas.forEach(() => colWidths.push({ wch: 10 }));
      ws['!cols'] = colWidths;
      
      XLSX.utils.book_append_sheet(wb, ws, 'Cronograma');
      
      const filename = `cronograma_gantt_${(nomeObra || 'obra').replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, filename);
    } catch (error) {
      console.error('Erro ao exportar Excel:', error);
      alert('Erro ao exportar para Excel: ' + error.message);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Configurações do Relatório</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="incluir-status" 
                checked={incluirStatus}
                onCheckedChange={setIncluirStatus}
              />
              <Label htmlFor="incluir-status">Incluir Status</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox 
                id="incluir-datas" 
                checked={incluirDatas}
                onCheckedChange={setIncluirDatas}
              />
              <Label htmlFor="incluir-datas">Incluir Datas</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox 
                id="incluir-percentual" 
                checked={incluirPercentual}
                onCheckedChange={setIncluirPercentual}
              />
              <Label htmlFor="incluir-percentual">Incluir % Conclusão</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox 
                id="incluir-responsaveis" 
                checked={incluirResponsaveis}
                onCheckedChange={setIncluirResponsaveis}
              />
              <Label htmlFor="incluir-responsaveis">Incluir Responsáveis</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox 
                id="incluir-descricao" 
                checked={incluirDescricao}
                onCheckedChange={setIncluirDescricao}
              />
              <Label htmlFor="incluir-descricao">Incluir Descrição</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox 
                id="incluir-observacoes" 
                checked={incluirObservacoes}
                onCheckedChange={setIncluirObservacoes}
              />
              <Label htmlFor="incluir-observacoes">Incluir Observações</Label>
            </div>

            <div className="flex items-center space-x-2 col-span-2">
              <Checkbox 
                id="incluir-subtarefas" 
                checked={incluirSubtarefas}
                onCheckedChange={setIncluirSubtarefas}
              />
              <Label htmlFor="incluir-subtarefas">Incluir Subtarefas</Label>
            </div>

            <div className="flex items-center space-x-2 col-span-2">
              <Checkbox 
                id="incluir-detalhes" 
                checked={incluirDetalhes}
                onCheckedChange={setIncluirDetalhes}
              />
              <Label htmlFor="incluir-detalhes">Incluir Página de Detalhes</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Gerar Relatório</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label className="text-sm font-medium text-slate-700">Cronograma (Gantt)</Label>
            <div className="flex gap-2">
              <Button 
                onClick={handleGerarGanttPDF}
                disabled={gerando || etapas.length === 0}
                className="flex-1 bg-amber-500 hover:bg-amber-600"
              >
                <FileText className="w-4 h-4 mr-2" />
                {gerando ? 'Gerando...' : 'PDF'}
              </Button>

              <Button 
                onClick={handleExportarExcel}
                disabled={etapas.length === 0}
                variant="outline"
                className="flex-1"
              >
                <Download className="w-4 h-4 mr-2 text-green-600" />
                Excel
              </Button>
            </div>
          </div>

          <Button 
            onClick={handleImprimir}
            disabled={etapas.length === 0}
            variant="outline"
            className="w-full"
          >
            <Printer className="w-4 h-4 mr-2" />
            Imprimir Cronograma
          </Button>

          {etapas.length === 0 && (
            <p className="text-sm text-slate-500 text-center mt-4">
              Nenhuma etapa cadastrada para gerar relatório
            </p>
          )}
        </CardContent>
      </Card>

      {/* Preview para impressão */}
      <div className="print:block hidden">
        <div className="p-8">
          <h1 className="text-2xl font-bold mb-4">CRONOGRAMA DE OBRA</h1>
          <p className="mb-2"><strong>Obra:</strong> {nomeObra || 'Não informado'}</p>
          <p className="mb-2"><strong>Cliente:</strong> {clienteNome || 'Não informado'}</p>
          <p className="mb-6"><strong>Data:</strong> {new Date().toLocaleDateString('pt-BR')}</p>

          <table className="w-full border-collapse border border-slate-300">
            <thead>
              <tr className="bg-amber-500 text-white">
                <th className="border border-slate-300 p-2">Nº</th>
                <th className="border border-slate-300 p-2">Etapa</th>
                {incluirStatus && <th className="border border-slate-300 p-2">Status</th>}
                {incluirDatas && (
                  <>
                    <th className="border border-slate-300 p-2">Início</th>
                    <th className="border border-slate-300 p-2">Fim</th>
                  </>
                )}
                {incluirPercentual && <th className="border border-slate-300 p-2">%</th>}
              </tr>
            </thead>
            <tbody>
              {tarefasOrganizadas.map((tarefa, idx) => (
                <React.Fragment key={tarefa.id}>
                  <tr className="font-bold bg-slate-50">
                    <td className="border border-slate-300 p-2 text-center">{idx + 1}</td>
                    <td className="border border-slate-300 p-2">{tarefa.titulo || tarefa.etapa}</td>
                    {incluirStatus && <td className="border border-slate-300 p-2">{tarefa.status}</td>}
                    {incluirDatas && (
                      <>
                        <td className="border border-slate-300 p-2">
                          {(tarefa.data_inicio || tarefa.data_inicio_planejada) ? new Date((tarefa.data_inicio || tarefa.data_inicio_planejada) + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}
                        </td>
                        <td className="border border-slate-300 p-2">
                          {(tarefa.data_conclusao || tarefa.data_fim_planejada) ? new Date((tarefa.data_conclusao || tarefa.data_fim_planejada) + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}
                        </td>
                      </>
                    )}
                    {incluirPercentual && <td className="border border-slate-300 p-2 text-center">{tarefa.progresso || tarefa.percentual_conclusao || 0}%</td>}
                  </tr>
                  {incluirSubtarefas && tarefa.subtarefas && tarefa.subtarefas.map((sub, subIdx) => (
                    <tr key={sub.id} className="bg-blue-50/30">
                      <td className="border border-slate-300 p-2 text-center text-xs">{idx + 1}.{subIdx + 1}</td>
                      <td className="border border-slate-300 p-2 pl-8 text-sm">{sub.titulo}</td>
                      {incluirStatus && <td className="border border-slate-300 p-2 text-sm">{sub.status}</td>}
                      {incluirDatas && (
                        <>
                          <td className="border border-slate-300 p-2 text-sm">
                            {sub.data_inicio ? new Date(sub.data_inicio + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}
                          </td>
                          <td className="border border-slate-300 p-2 text-sm">
                            {sub.data_fim ? new Date(sub.data_fim + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}
                          </td>
                        </>
                      )}
                      {incluirPercentual && <td className="border border-slate-300 p-2 text-center text-sm">{sub.progresso || 0}%</td>}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}