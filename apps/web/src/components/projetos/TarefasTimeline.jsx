import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, AlertCircle, FileText, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import EditarTarefas from './EditarTarefas';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export default function TarefasTimeline({ projetoId, empresaAtiva, usuariosEmpresa }) {
  const [tarefas, setTarefas] = useState([]);
  const [escala, setEscala] = useState('semanas'); // dias, semanas, meses
  const [dataInicio, setDataInicio] = useState(new Date());
  const [modalAberto, setModalAberto] = useState(false);
  const [tarefaSelecionada, setTarefaSelecionada] = useState(null);

  useEffect(() => {
    if (projetoId) loadTarefas();
  }, [projetoId]);

  const loadTarefas = async () => {
    const result = await base44.entities.TarefaProjeto.filter({
      empresa_id: empresaAtiva.id,
      projeto_id: projetoId
    });
    
    // Ordenar por data de início
    const ordenadas = result
      .filter(t => !t.tarefa_pai_id) // Apenas tarefas principais
      .sort((a, b) => {
        if (!a.data_inicio) return 1;
        if (!b.data_inicio) return -1;
        return new Date(a.data_inicio) - new Date(b.data_inicio);
      });
    
    setTarefas(ordenadas);

    // Ajustar data inicial ao projeto
    if (ordenadas.length > 0 && ordenadas[0].data_inicio) {
      setDataInicio(new Date(ordenadas[0].data_inicio));
    }
  };

  const getPeriodos = () => {
    const periodos = [];
    const hoje = new Date();
    const inicio = new Date(dataInicio);
    inicio.setDate(inicio.getDate() - 7);

    if (escala === 'dias') {
      for (let i = 0; i < 30; i++) {
        const data = new Date(inicio);
        data.setDate(inicio.getDate() + i);
        periodos.push({
          label: `${data.getDate()}/${data.getMonth() + 1}`,
          data: data,
          width: 80
        });
      }
    } else if (escala === 'semanas') {
      for (let i = 0; i < 12; i++) {
        const data = new Date(inicio);
        data.setDate(inicio.getDate() + (i * 7));
        periodos.push({
          label: `Sem ${i + 1}`,
          data: data,
          width: 100
        });
      }
    } else {
      for (let i = 0; i < 12; i++) {
        const data = new Date(inicio);
        data.setMonth(inicio.getMonth() + i);
        periodos.push({
          label: data.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
          data: data,
          width: 120
        });
      }
    }

    return periodos;
  };

  const calcularPosicao = (dataInicio, dataFim) => {
    if (!dataInicio) return { left: 0, width: 0 };

    const periodos = getPeriodos();
    const inicio = new Date(dataInicio);
    const fim = dataFim ? new Date(dataFim) : new Date(inicio);
    
    const primeiraData = periodos[0].data;
    const diasDesdeInicio = Math.floor((inicio - primeiraData) / (1000 * 60 * 60 * 24));
    const duracao = Math.max(1, Math.ceil((fim - inicio) / (1000 * 60 * 60 * 24)));

    const pixelPorDia = escala === 'dias' ? 80 / 1 : escala === 'semanas' ? 100 / 7 : 120 / 30;

    return {
      left: Math.max(0, diasDesdeInicio * pixelPorDia),
      width: Math.max(20, duracao * pixelPorDia)
    };
  };

  const temDependenciasBloqueadas = (tarefa) => {
    const dependencias = tarefa.dependencias ? JSON.parse(tarefa.dependencias) : [];
    return tarefas.some(t => dependencias.includes(t.id) && t.status !== 'Concluída');
  };

  const handleExportarExcel = () => {
    const dados = tarefas.map((tarefa, idx) => [
      idx + 1,
      tarefa.titulo || '',
      tarefa.descricao || '',
      tarefa.status || '',
      tarefa.responsavel_principal_nome || '',
      tarefa.data_inicio || '',
      tarefa.data_fim || '',
      tarefa.progresso || 0,
      tarefa.observacoes || ''
    ]);

    const headers = ['Nº', 'Título', 'Descrição', 'Status', 'Responsável', 'Data Início', 'Data Fim', 'Progresso %', 'Observações'];
    const linhas = [headers, ...dados];
    const csv = linhas.map(row => row.map(cell => {
      const cellStr = String(cell).replace(/"/g, '""');
      return cellStr.includes(';') || cellStr.includes('\n') || cellStr.includes('"') ? `"${cellStr}"` : cellStr;
    }).join(';')).join('\n');
    
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `tarefas_timeline_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const handleExportarPDF = async () => {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF('landscape');
    
    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.text('CRONOGRAMA - TIMELINE/GANTT', 14, 20);
    
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 28);
    
    let y = 40;
    doc.setFontSize(9);
    
    tarefas.forEach((tarefa, idx) => {
      if (y > 180) {
        doc.addPage();
        y = 20;
      }
      
      doc.setFont(undefined, 'bold');
      doc.text(`${idx + 1}. ${tarefa.titulo}`, 14, y);
      y += 6;
      
      doc.setFont(undefined, 'normal');
      
      if (tarefa.descricao) {
        const desc = doc.splitTextToSize(`Descrição: ${tarefa.descricao}`, 250);
        doc.text(desc, 18, y);
        y += desc.length * 5;
      }
      
      doc.text(`Status: ${tarefa.status || '-'}`, 18, y);
      y += 5;
      doc.text(`Responsável: ${tarefa.responsavel_principal_nome || '-'}`, 18, y);
      y += 5;
      doc.text(`Período: ${tarefa.data_inicio || '-'} até ${tarefa.data_fim || '-'}`, 18, y);
      y += 5;
      doc.text(`Progresso: ${tarefa.progresso || 0}%`, 18, y);
      y += 5;
      
      if (tarefa.observacoes) {
        const obs = doc.splitTextToSize(`Observações: ${tarefa.observacoes}`, 250);
        doc.text(obs, 18, y);
        y += obs.length * 5;
      }
      
      y += 5;
    });
    
    doc.save(`tarefas_timeline_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const periodos = getPeriodos();
  const larguraTotal = periodos.reduce((acc, p) => acc + p.width, 0);

  return (
    <div className="space-y-4">
      <button data-timeline-export="pdf" onClick={handleExportarPDF} className="hidden" />
      <button data-timeline-export="excel" onClick={handleExportarExcel} className="hidden" />
      
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => {
            const nova = new Date(dataInicio);
            nova.setDate(nova.getDate() - 7);
            setDataInicio(nova);
          }}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => {
            const nova = new Date(dataInicio);
            nova.setDate(nova.getDate() + 7);
            setDataInicio(nova);
          }}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={escala === 'dias' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setEscala('dias')}
          >
            Dias
          </Button>
          <Button
            variant={escala === 'semanas' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setEscala('semanas')}
          >
            Semanas
          </Button>
          <Button
            variant={escala === 'meses' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setEscala('meses')}
          >
            Meses
          </Button>
        </div>

        <Button variant="outline" size="sm" onClick={() => setDataInicio(new Date())}>
          Hoje
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="flex">
            {/* Coluna de tarefas */}
            <div className="w-64 border-r">
              <div className="h-12 border-b bg-slate-50 flex items-center px-4 font-semibold text-slate-700">
                Tarefas
              </div>
              <ScrollArea className="h-[600px]">
                {tarefas.map(tarefa => {
                  const bloqueada = temDependenciasBloqueadas(tarefa);
                  return (
                    <div
                      key={tarefa.id}
                      className="h-16 border-b px-4 flex items-center hover:bg-slate-50 cursor-pointer"
                      onClick={() => {
                        setTarefaSelecionada(tarefa);
                        setModalAberto(true);
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">{tarefa.titulo}</span>
                          {bloqueada && (
                            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">
                            {tarefa.status}
                          </Badge>
                          {tarefa.responsavel_principal_nome && (
                            <span className="text-xs text-slate-500 truncate">
                              {tarefa.responsavel_principal_nome.split(' ')[0]}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {tarefas.length === 0 && (
                  <div className="h-64 flex items-center justify-center text-slate-500">
                    Nenhuma tarefa encontrada
                  </div>
                )}
              </ScrollArea>
            </div>

            {/* Timeline */}
            <div className="flex-1 overflow-x-auto">
              {/* Cabeçalho de períodos */}
              <div className="h-12 border-b bg-slate-50 flex" style={{ width: larguraTotal }}>
                {periodos.map((periodo, idx) => (
                  <div
                    key={idx}
                    className="border-r flex items-center justify-center text-xs font-medium text-slate-600"
                    style={{ width: periodo.width }}
                  >
                    {periodo.label}
                  </div>
                ))}
              </div>

              {/* Barras de tarefas */}
              <ScrollArea className="h-[600px]">
                <div style={{ width: larguraTotal }}>
                  {tarefas.map(tarefa => {
                    const posicao = calcularPosicao(tarefa.data_inicio, tarefa.data_fim);
                    const dependencias = tarefa.dependencias ? JSON.parse(tarefa.dependencias) : [];
                    const bloqueada = temDependenciasBloqueadas(tarefa);

                    return (
                      <div key={tarefa.id} className="h-16 border-b relative">
                        {/* Linhas de grade */}
                        {periodos.map((_, idx) => (
                          <div
                            key={idx}
                            className="absolute top-0 bottom-0 border-r border-slate-100"
                            style={{ left: periodos.slice(0, idx + 1).reduce((acc, p) => acc + p.width, 0) }}
                          />
                        ))}

                        {/* Barra da tarefa */}
                        {tarefa.data_inicio && (
                          <div
                            className={cn(
                              "absolute top-2 bottom-2 rounded cursor-pointer transition-all hover:shadow-lg group",
                              tarefa.status === 'Concluída' && "bg-green-500",
                              tarefa.status === 'Em Andamento' && "bg-blue-500",
                              tarefa.status === 'A Fazer' && "bg-slate-400",
                              tarefa.status === 'Bloqueada' && "bg-red-500",
                              bloqueada && "border-2 border-red-600"
                            )}
                            style={{
                              left: posicao.left,
                              width: posicao.width
                            }}
                            onClick={() => {
                              setTarefaSelecionada(tarefa);
                              setModalAberto(true);
                            }}
                          >
                            <div className="h-full px-2 flex items-center justify-between text-white text-xs font-medium">
                              <span className="truncate">{tarefa.titulo}</span>
                              {tarefa.progresso > 0 && tarefa.status !== 'Concluída' && (
                                <span className="text-xs">{tarefa.progresso}%</span>
                              )}
                            </div>

                            {/* Barra de progresso */}
                            {tarefa.progresso > 0 && tarefa.status !== 'Concluída' && (
                              <div
                                className="absolute bottom-0 left-0 h-1 bg-white/50 rounded-b"
                                style={{ width: `${tarefa.progresso}%` }}
                              />
                            )}
                          </div>
                        )}

                        {/* Linhas de dependência */}
                        {dependencias.map(depId => {
                          const tarefaDep = tarefas.find(t => t.id === depId);
                          if (!tarefaDep?.data_fim || !tarefa.data_inicio) return null;

                          const posicaoDep = calcularPosicao(tarefaDep.data_inicio, tarefaDep.data_fim);
                          const posicaoAtual = calcularPosicao(tarefa.data_inicio, tarefa.data_fim);

                          return (
                            <svg
                              key={depId}
                              className="absolute top-0 left-0 pointer-events-none"
                              style={{ width: larguraTotal, height: '100%' }}
                            >
                              <line
                                x1={posicaoDep.left + posicaoDep.width}
                                y1="50%"
                                x2={posicaoAtual.left}
                                y2="50%"
                                stroke="#ef4444"
                                strokeWidth="2"
                                strokeDasharray="4"
                              />
                            </svg>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          </div>
        </CardContent>
      </Card>

      {modalAberto && (
        <EditarTarefas
          tarefa={tarefaSelecionada}
          projetoId={projetoId}
          empresaAtiva={empresaAtiva}
          usuariosEmpresa={usuariosEmpresa}
          tarefas={tarefas}
          onClose={() => {
            setModalAberto(false);
            setTarefaSelecionada(null);
            loadTarefas();
          }}
        />
      )}
    </div>
  );
}