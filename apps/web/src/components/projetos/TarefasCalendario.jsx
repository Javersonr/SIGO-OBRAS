import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import EditarTarefas from "./EditarTarefas";

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export default function TarefasCalendario({ projetoId, empresaAtiva, usuariosEmpresa }) {
  const [tarefas, setTarefas] = useState([]);
  const [mesAtual, setMesAtual] = useState(new Date());
  const [modalAberto, setModalAberto] = useState(false);
  const [tarefaSelecionada, setTarefaSelecionada] = useState(null);
  const [diaSelecionado, setDiaSelecionado] = useState(null);
  const [dragData, setDragData] = useState(null);

  useEffect(() => {
    if (projetoId) loadTarefas();
  }, [projetoId, mesAtual]);

  const loadTarefas = async () => {
    const result = await base44.entities.TarefaProjeto.filter({
      empresa_id: empresaAtiva.id,
      projeto_id: projetoId,
    });
    setTarefas(result);
  };

  const getDiasDoMes = () => {
    const ano = mesAtual.getFullYear();
    const mes = mesAtual.getMonth();
    const primeiroDia = new Date(ano, mes, 1);
    const ultimoDia = new Date(ano, mes + 1, 0);
    const diasAnteriores = primeiroDia.getDay();
    const diasNoMes = ultimoDia.getDate();

    const dias = [];

    // Dias do mês anterior
    const mesAnterior = new Date(ano, mes, 0);
    for (let i = diasAnteriores - 1; i >= 0; i--) {
      dias.push({
        dia: mesAnterior.getDate() - i,
        mes: mes - 1,
        ano: ano,
        mesAtual: false,
      });
    }

    // Dias do mês atual
    for (let i = 1; i <= diasNoMes; i++) {
      dias.push({
        dia: i,
        mes: mes,
        ano: ano,
        mesAtual: true,
      });
    }

    // Completar semana final
    const diasFaltando = 7 - (dias.length % 7);
    if (diasFaltando < 7) {
      for (let i = 1; i <= diasFaltando; i++) {
        dias.push({
          dia: i,
          mes: mes + 1,
          ano: ano,
          mesAtual: false,
        });
      }
    }

    return dias;
  };

  const getTarefasDoDia = (dia, mes, ano) => {
    const dataStr = `${ano}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
    return tarefas.filter((t) => {
      if (t.data_inicio && t.data_inicio === dataStr) return true;
      if (t.data_fim && t.data_fim === dataStr) return true;
      if (t.data_inicio && t.data_fim) {
        return (
          new Date(t.data_inicio) <= new Date(dataStr) && new Date(t.data_fim) >= new Date(dataStr)
        );
      }
      return false;
    });
  };

  const handleDragStart = (e, tarefa) => {
    setDragData(tarefa);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = async (e, dia, mes, ano) => {
    e.preventDefault();
    if (!dragData) return;

    const novaData = `${ano}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;

    // Calcular duração
    let duracao = 0;
    if (dragData.data_inicio && dragData.data_fim) {
      duracao = Math.ceil(
        (new Date(dragData.data_fim) - new Date(dragData.data_inicio)) / (1000 * 60 * 60 * 24)
      );
    }

    const dataFim =
      duracao > 0
        ? new Date(new Date(novaData).getTime() + duracao * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0]
        : novaData;

    await base44.entities.TarefaProjeto.update(dragData.id, {
      data_inicio: novaData,
      data_fim: dataFim,
    });

    setDragData(null);
    loadTarefas();
  };

  const handleAbrirModal = (tarefa = null, data = null) => {
    setTarefaSelecionada(tarefa);
    setDiaSelecionado(data);
    setModalAberto(true);
  };

  const handleFecharModal = () => {
    setModalAberto(false);
    setTarefaSelecionada(null);
    setDiaSelecionado(null);
    loadTarefas();
  };

  const mesAnterior = () => {
    setMesAtual(new Date(mesAtual.getFullYear(), mesAtual.getMonth() - 1, 1));
  };

  const mesSeguinte = () => {
    setMesAtual(new Date(mesAtual.getFullYear(), mesAtual.getMonth() + 1, 1));
  };

  const handleExportarExcel = () => {
    const dados = tarefas.map((tarefa, idx) => [
      idx + 1,
      tarefa.titulo || "",
      tarefa.descricao || "",
      tarefa.status || "",
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
    link.download = `tarefas_calendario_${MESES[mesAtual.getMonth()]}_${mesAtual.getFullYear()}.csv`;
    link.click();
  };

  const handleExportarPDF = async () => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.setFont(undefined, "bold");
    doc.text("CALENDÁRIO DE TAREFAS", 14, 20);

    doc.setFontSize(10);
    doc.setFont(undefined, "normal");
    doc.text(`Mês: ${MESES[mesAtual.getMonth()]} ${mesAtual.getFullYear()}`, 14, 28);
    doc.text(`Gerado em: ${new Date().toLocaleDateString("pt-BR")}`, 14, 34);

    let y = 45;
    tarefas
      .filter((t) => {
        const mes = mesAtual.getMonth();
        const ano = mesAtual.getFullYear();
        if (!t.data_inicio) return false;
        const dataInicio = new Date(t.data_inicio);
        return dataInicio.getMonth() === mes && dataInicio.getFullYear() === ano;
      })
      .forEach((tarefa, idx) => {
        if (y > 270) {
          doc.addPage();
          y = 20;
        }

        doc.setFontSize(10);
        doc.setFont(undefined, "bold");
        doc.text(`${idx + 1}. ${tarefa.titulo}`, 14, y);
        y += 6;

        doc.setFontSize(9);
        doc.setFont(undefined, "normal");

        if (tarefa.descricao) {
          const desc = doc.splitTextToSize(`Descrição: ${tarefa.descricao}`, 180);
          doc.text(desc, 18, y);
          y += desc.length * 4 + 2;
        }

        doc.text(`Status: ${tarefa.status || "-"}`, 18, y);
        y += 5;
        doc.text(`Responsável: ${tarefa.responsavel_principal_nome || "-"}`, 18, y);
        y += 5;
        doc.text(`Data: ${tarefa.data_inicio || "-"} até ${tarefa.data_fim || "-"}`, 18, y);
        y += 5;
        doc.text(`Progresso: ${tarefa.progresso || 0}%`, 18, y);
        y += 8;
      });

    doc.save(`tarefas_calendario_${MESES[mesAtual.getMonth()]}_${mesAtual.getFullYear()}.pdf`);
  };

  const hoje = new Date();
  const dias = getDiasDoMes();

  return (
    <div className="space-y-4">
      <button data-calendar-export="pdf" onClick={handleExportarPDF} className="hidden" />
      <button data-calendar-export="excel" onClick={handleExportarExcel} className="hidden" />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={mesAnterior}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <h3 className="text-lg font-semibold text-slate-800 min-w-[200px] text-center">
            {MESES[mesAtual.getMonth()]} {mesAtual.getFullYear()}
          </h3>
          <Button variant="outline" size="icon" onClick={mesSeguinte}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <Button onClick={() => setMesAtual(new Date())} variant="outline">
          Hoje
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          {/* Cabeçalho com dias da semana */}
          <div className="grid grid-cols-7 gap-2 mb-2">
            {DIAS_SEMANA.map((dia) => (
              <div key={dia} className="text-center font-semibold text-slate-600 text-sm py-2">
                {dia}
              </div>
            ))}
          </div>

          {/* Grade do calendário */}
          <div className="grid grid-cols-7 gap-2">
            {dias.map((diaInfo, index) => {
              const tarefasDoDia = getTarefasDoDia(diaInfo.dia, diaInfo.mes, diaInfo.ano);
              const isHoje =
                diaInfo.dia === hoje.getDate() &&
                diaInfo.mes === hoje.getMonth() &&
                diaInfo.ano === hoje.getFullYear();
              const dataStr = `${diaInfo.ano}-${String(diaInfo.mes + 1).padStart(2, "0")}-${String(diaInfo.dia).padStart(2, "0")}`;

              return (
                <div
                  key={index}
                  className={cn(
                    "min-h-[120px] border rounded-lg p-2 transition-all cursor-pointer",
                    diaInfo.mesAtual ? "bg-white" : "bg-slate-50",
                    isHoje && "border-2 border-blue-500 bg-blue-50",
                    "hover:shadow-md"
                  )}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, diaInfo.dia, diaInfo.mes, diaInfo.ano)}
                  onClick={() => handleAbrirModal(null, dataStr)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className={cn(
                        "text-sm font-medium",
                        diaInfo.mesAtual ? "text-slate-800" : "text-slate-400",
                        isHoje && "text-blue-600 font-bold"
                      )}
                    >
                      {diaInfo.dia}
                    </span>
                    {tarefasDoDia.length > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        {tarefasDoDia.length}
                      </Badge>
                    )}
                  </div>

                  <div className="space-y-1">
                    {tarefasDoDia.slice(0, 3).map((tarefa) => (
                      <div
                        key={tarefa.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, tarefa)}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAbrirModal(tarefa);
                        }}
                        className={cn(
                          "text-xs p-1.5 rounded cursor-move hover:shadow-md transition-all",
                          tarefa.status === "Concluída" &&
                            "bg-green-100 border-green-300 text-green-800",
                          tarefa.status === "Em Andamento" &&
                            "bg-blue-100 border-blue-300 text-blue-800",
                          tarefa.status === "A Fazer" &&
                            "bg-slate-100 border-slate-300 text-slate-800",
                          tarefa.status === "Bloqueada" && "bg-red-100 border-red-300 text-red-800",
                          "border"
                        )}
                      >
                        <div className="truncate font-medium">{tarefa.titulo}</div>
                        {tarefa.responsavel_principal_nome && (
                          <div className="text-xs opacity-70 truncate">
                            {tarefa.responsavel_principal_nome.split(" ")[0]}
                          </div>
                        )}
                      </div>
                    ))}
                    {tarefasDoDia.length > 3 && (
                      <div className="text-xs text-slate-500 text-center py-1">
                        +{tarefasDoDia.length - 3} mais
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
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
          statusInicial={null}
          dataInicial={diaSelecionado}
          onClose={handleFecharModal}
        />
      )}
    </div>
  );
}
