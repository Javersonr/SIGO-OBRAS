import React, { useState, useEffect } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { sigo } from "@/api/sigoClient";
import { safeParseJSON } from "@/lib/json-utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Plus, CheckCircle2, AlertCircle, Calendar, Timer, Paperclip } from "lucide-react";
import { cn } from "@/lib/utils";
import EditarTarefas from "./EditarTarefas";

const COLUNAS = [
  { id: "A Fazer", titulo: "A Fazer", cor: "bg-slate-100 border-slate-300" },
  { id: "Em Andamento", titulo: "Em Andamento", cor: "bg-blue-100 border-blue-300" },
  { id: "Em Revisão", titulo: "Em Revisão", cor: "bg-yellow-100 border-yellow-300" },
  { id: "Concluída", titulo: "Concluída", cor: "bg-green-100 border-green-300" },
  { id: "Bloqueada", titulo: "Bloqueada", cor: "bg-red-100 border-red-300" },
];

const CORES_PRIORIDADE = {
  Baixa: "bg-slate-100 text-slate-700 border-slate-300",
  Normal: "bg-blue-100 text-blue-700 border-blue-300",
  Alta: "bg-orange-100 text-orange-700 border-orange-300",
  Urgente: "bg-red-100 text-red-700 border-red-300",
};

export default function TarefasKanban({ projetoId, empresaAtiva, usuariosEmpresa }) {
  const [tarefas, setTarefas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [tarefaSelecionada, setTarefaSelecionada] = useState(null);
  const [statusModal, setStatusModal] = useState(null);

  useEffect(() => {
    if (projetoId) loadTarefas();
  }, [projetoId]);

  const loadTarefas = async () => {
    setLoading(true);
    try {
      const result = await sigo.entities.TarefaProjeto.filter({
        empresa_id: empresaAtiva.id,
        projeto_id: projetoId,
      });
      setTarefas(result.sort((a, b) => a.ordem - b.ordem));
    } catch (error) {
      console.error("Erro ao carregar tarefas:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDragEnd = async (result) => {
    if (!result.destination) return;

    const { draggableId, destination } = result;
    const novoStatus = destination.droppableId;
    const tarefa = tarefas.find((t) => t.id === draggableId);

    if (tarefa.status === novoStatus) return;

    // Verificar dependências
    if (novoStatus === "Em Andamento" || novoStatus === "Concluída") {
      // dependencias é JSONB → array do supabase-js, string em legacy
      const dependencias = safeParseJSON(tarefa.dependencias, []);
      const tarefasBloqueadas = tarefas.filter(
        (t) =>
          Array.isArray(dependencias) && dependencias.includes(t.id) && t.status !== "Concluída"
      );

      if (tarefasBloqueadas.length > 0) {
        alert(
          "Esta tarefa possui dependências não concluídas:\n" +
            tarefasBloqueadas.map((t) => `- ${t.titulo}`).join("\n")
        );
        return;
      }
    }

    try {
      await sigo.entities.TarefaProjeto.update(draggableId, {
        status: novoStatus,
        data_conclusao: novoStatus === "Concluída" ? new Date().toISOString().split("T")[0] : null,
        progresso: novoStatus === "Concluída" ? 100 : tarefa.progresso,
      });
      loadTarefas();
    } catch (error) {
      console.error("Erro ao atualizar status:", error);
    }
  };

  const handleAbrirModal = (tarefa = null, status = null) => {
    setTarefaSelecionada(tarefa);
    setStatusModal(status);
    setModalAberto(true);
  };

  const handleFecharModal = () => {
    setModalAberto(false);
    setTarefaSelecionada(null);
    setStatusModal(null);
    loadTarefas();
  };

  const getTarefasPorStatus = (status) => {
    return tarefas
      .filter((t) => t.status === status && !t.tarefa_pai_id)
      .sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
  };

  const getSubtarefas = (tarefaId) => {
    return tarefas.filter((t) => t.tarefa_pai_id === tarefaId);
  };

  const temDependenciasBloqueadas = (tarefa) => {
    const dependencias = safeParseJSON(tarefa.dependencias, []);
    if (!Array.isArray(dependencias)) return false;
    return tarefas.some((t) => dependencias.includes(t.id) && t.status !== "Concluída");
  };

  const handleExportarExcel = () => {
    const dados = tarefas.map((tarefa, idx) => [
      idx + 1,
      tarefa.titulo || "",
      tarefa.descricao || "",
      tarefa.status || "",
      tarefa.prioridade || "",
      tarefa.responsavel_principal_nome || "",
      tarefa.data_inicio || "",
      tarefa.data_fim || "",
      tarefa.progresso || 0,
      tarefa.observacoes || "",
    ]);

    const headers = [
      "Nº",
      "Título",
      "Descrição",
      "Status",
      "Prioridade",
      "Responsável",
      "Data Início",
      "Data Fim",
      "Progresso %",
      "Observações",
    ];
    const linhas = [headers, ...dados];
    const csv = linhas
      .map((row) =>
        row
          .map((cell) => {
            const cellStr = String(cell).replace(/"/g, '""');
            return cellStr.includes(";") || cellStr.includes("\n") || cellStr.includes('"')
              ? `"${cellStr}"`
              : cellStr;
          })
          .join(";")
      )
      .join("\n");

    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `tarefas_kanban_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  const handleExportarPDF = async () => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.setFont(undefined, "bold");
    doc.text("TAREFAS - KANBAN", 14, 20);

    doc.setFontSize(10);
    doc.setFont(undefined, "normal");
    doc.text(`Gerado em: ${new Date().toLocaleDateString("pt-BR")}`, 14, 28);

    let y = 40;
    COLUNAS.forEach((coluna) => {
      const tarefasColuna = getTarefasPorStatus(coluna.id);
      if (tarefasColuna.length === 0) return;

      doc.setFontSize(12);
      doc.setFont(undefined, "bold");
      doc.text(`${coluna.titulo} (${tarefasColuna.length})`, 14, y);
      y += 8;

      doc.setFontSize(9);
      doc.setFont(undefined, "normal");

      tarefasColuna.forEach((tarefa, idx) => {
        if (y > 270) {
          doc.addPage();
          y = 20;
        }

        doc.text(`${idx + 1}. ${tarefa.titulo}`, 18, y);
        y += 5;

        if (tarefa.descricao) {
          const desc = doc.splitTextToSize(`   ${tarefa.descricao}`, 170);
          doc.text(desc, 18, y);
          y += desc.length * 4;
        }

        doc.text(`   Responsável: ${tarefa.responsavel_principal_nome || "-"}`, 18, y);
        y += 4;
        doc.text(`   Datas: ${tarefa.data_inicio || "-"} até ${tarefa.data_fim || "-"}`, 18, y);
        y += 4;
        doc.text(`   Progresso: ${tarefa.progresso || 0}%`, 18, y);
        y += 8;
      });

      y += 5;
    });

    doc.save(`tarefas_kanban_${new Date().toISOString().split("T")[0]}.pdf`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button data-kanban-export="pdf" onClick={handleExportarPDF} className="hidden" />
      <button data-kanban-export="excel" onClick={handleExportarExcel} className="hidden" />

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: 0 }}>
          {COLUNAS.map((coluna) => {
            const tarefasColuna = getTarefasPorStatus(coluna.id);

            return (
              <div key={coluna.id} className="flex flex-col flex-shrink-0 w-72">
                <div className={cn("p-3 rounded-t-lg border-t-4 border-l border-r", coluna.cor)}>
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-slate-800">{coluna.titulo}</h3>
                    <Badge variant="secondary" className="bg-white">
                      {tarefasColuna.length}
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleAbrirModal(null, coluna.id)}
                    className="w-full mt-2 gap-1 text-xs"
                  >
                    <Plus className="w-3 h-3" />
                    Nova Tarefa
                  </Button>
                </div>

                <Droppable droppableId={coluna.id}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={cn(
                        "flex-1 p-2 border-l border-r border-b rounded-b-lg space-y-2 min-h-[200px]",
                        coluna.cor.replace("100", "50"),
                        snapshot.isDraggingOver && "bg-blue-100/50"
                      )}
                    >
                      {tarefasColuna.map((tarefa, index) => {
                        const subtarefas = getSubtarefas(tarefa.id);
                        const responsaveis = safeParseJSON(tarefa.responsaveis_nomes, []);
                        const dependenciasBloqueadas = temDependenciasBloqueadas(tarefa);
                        const anexos = safeParseJSON(tarefa.anexos, []);

                        return (
                          <Draggable key={tarefa.id} draggableId={tarefa.id} index={index}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                              >
                                <Card
                                  className={cn(
                                    "cursor-pointer hover:shadow-md transition-all",
                                    snapshot.isDragging && "rotate-2 shadow-lg",
                                    dependenciasBloqueadas && "border-red-300"
                                  )}
                                  onClick={() => handleAbrirModal(tarefa)}
                                >
                                  <CardContent className="p-3 space-y-2">
                                    <div className="flex items-start justify-between gap-2">
                                      <h4 className="text-sm font-medium text-slate-800 flex-1">
                                        {tarefa.titulo}
                                      </h4>
                                      {tarefa.prioridade !== "Normal" && (
                                        <Badge
                                          className={cn(
                                            "text-xs border",
                                            CORES_PRIORIDADE[tarefa.prioridade]
                                          )}
                                        >
                                          {tarefa.prioridade}
                                        </Badge>
                                      )}
                                    </div>

                                    {tarefa.descricao && (
                                      <p className="text-xs text-slate-600 line-clamp-2">
                                        {tarefa.descricao}
                                      </p>
                                    )}

                                    {/* Indicadores */}
                                    <div className="flex items-center gap-2 flex-wrap text-xs text-slate-500">
                                      {subtarefas.length > 0 && (
                                        <div className="flex items-center gap-1">
                                          <CheckCircle2 className="w-3 h-3" />
                                          {
                                            subtarefas.filter((s) => s.status === "Concluída")
                                              .length
                                          }
                                          /{subtarefas.length}
                                        </div>
                                      )}

                                      {dependenciasBloqueadas && (
                                        <div className="flex items-center gap-1 text-red-600">
                                          <AlertCircle className="w-3 h-3" />
                                          Bloqueada
                                        </div>
                                      )}

                                      {tarefa.data_fim && (
                                        <div className="flex items-center gap-1">
                                          <Calendar className="w-3 h-3" />
                                          {new Date(tarefa.data_fim).toLocaleDateString("pt-BR", {
                                            day: "2-digit",
                                            month: "2-digit",
                                          })}
                                        </div>
                                      )}

                                      {tarefa.tempo_estimado_horas && (
                                        <div className="flex items-center gap-1">
                                          <Timer className="w-3 h-3" />
                                          {tarefa.tempo_estimado_horas}h
                                        </div>
                                      )}

                                      {anexos.length > 0 && (
                                        <div className="flex items-center gap-1">
                                          <Paperclip className="w-3 h-3" />
                                          {anexos.length}
                                        </div>
                                      )}
                                    </div>

                                    {/* Responsáveis */}
                                    {responsaveis.length > 0 && (
                                      <div className="flex items-center gap-1 -space-x-2">
                                        {responsaveis.slice(0, 3).map((nome, idx) => (
                                          <Avatar
                                            key={idx}
                                            className="w-6 h-6 border-2 border-white"
                                          >
                                            <AvatarFallback className="text-xs bg-blue-100 text-blue-700">
                                              {nome.substring(0, 2).toUpperCase()}
                                            </AvatarFallback>
                                          </Avatar>
                                        ))}
                                        {responsaveis.length > 3 && (
                                          <div className="w-6 h-6 rounded-full bg-slate-200 border-2 border-white flex items-center justify-center">
                                            <span className="text-xs text-slate-600">
                                              +{responsaveis.length - 3}
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    {/* Barra de Progresso */}
                                    {tarefa.progresso > 0 && tarefa.status !== "Concluída" && (
                                      <div className="w-full bg-slate-200 rounded-full h-1.5">
                                        <div
                                          className="bg-blue-600 h-1.5 rounded-full transition-all"
                                          style={{ width: `${tarefa.progresso}%` }}
                                        />
                                      </div>
                                    )}
                                  </CardContent>
                                </Card>
                              </div>
                            )}
                          </Draggable>
                        );
                      })}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </DragDropContext>

      {modalAberto && (
        <EditarTarefas
          tarefa={tarefaSelecionada}
          projetoId={projetoId}
          empresaAtiva={empresaAtiva}
          usuariosEmpresa={usuariosEmpresa}
          tarefas={tarefas}
          statusInicial={statusModal}
          onClose={handleFecharModal}
        />
      )}
    </div>
  );
}
