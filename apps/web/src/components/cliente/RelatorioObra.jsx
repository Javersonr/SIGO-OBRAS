import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Download, Clock, CheckCircle2, AlertTriangle } from "lucide-react";

export default function RelatorioObra({ etapas, oportunidade, empresa }) {
  const formatDate = (date) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString("pt-BR");
  };

  const calcularDias = (inicio, fim) => {
    if (!inicio || !fim) return "-";
    const diffTime = Math.abs(new Date(fim) - new Date(inicio));
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return `${diffDays} dias`;
  };

  const getStatusColor = (status) => {
    const colors = {
      Concluída: "text-green-600 bg-green-50",
      "Em Andamento": "text-blue-600 bg-blue-50",
      Atrasada: "text-red-600 bg-red-50",
      Pausada: "text-yellow-600 bg-yellow-50",
      Planejada: "text-slate-600 bg-slate-50",
    };
    return colors[status] || "text-slate-600 bg-slate-50";
  };

  const etapasConcluidas = etapas.filter((e) => e.status === "Concluída").length;
  const etapasAndamento = etapas.filter((e) => e.status === "Em Andamento").length;
  const etapasAtrasadas = etapas.filter((e) => e.status === "Atrasada").length;
  const progressoGeral =
    etapas.length > 0
      ? Math.round(etapas.reduce((s, e) => s + (e.percentual_conclusao || 0), 0) / etapas.length)
      : 0;

  const handleExportPDF = () => {
    window.print();
  };

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Header do Relatório */}
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Relatório de Obra</h2>
          <p className="text-sm text-slate-500 mt-1">
            Gerado em {new Date().toLocaleDateString("pt-BR")} às{" "}
            {new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
        <Button onClick={handleExportPDF} className="gap-2 bg-blue-600 hover:bg-blue-700">
          <Download className="w-4 h-4" />
          Exportar PDF
        </Button>
      </div>

      {/* Cabeçalho Impresso */}
      <div className="hidden print:block mb-6">
        <div className="flex items-start justify-between mb-4 pb-4 border-b">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 mb-1">{oportunidade?.nome}</h1>
            <p className="text-slate-600">{empresa?.nome}</p>
            <p className="text-sm text-slate-500 mt-2">Relatório de Acompanhamento de Obra</p>
          </div>
          {empresa?.logo_url && (
            <img src={empresa.logo_url} alt={empresa.nome} className="h-16 object-contain" />
          )}
        </div>
        <p className="text-xs text-slate-500 text-right">
          Gerado em {new Date().toLocaleDateString("pt-BR")} às{" "}
          {new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 print:grid-cols-4 print:gap-3">
        <Card>
          <CardContent className="p-4 print:p-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center print:w-8 print:h-8">
                <CheckCircle2 className="w-5 h-5 text-green-600 print:w-4 print:h-4" />
              </div>
              <div>
                <p className="text-xs text-slate-500 print:text-[10px]">Concluídas</p>
                <p className="text-xl font-bold text-green-600 print:text-lg">{etapasConcluidas}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 print:p-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center print:w-8 print:h-8">
                <Clock className="w-5 h-5 text-blue-600 print:w-4 print:h-4" />
              </div>
              <div>
                <p className="text-xs text-slate-500 print:text-[10px]">Em Andamento</p>
                <p className="text-xl font-bold text-blue-600 print:text-lg">{etapasAndamento}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 print:p-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center print:w-8 print:h-8">
                <AlertTriangle className="w-5 h-5 text-red-600 print:w-4 print:h-4" />
              </div>
              <div>
                <p className="text-xs text-slate-500 print:text-[10px]">Atrasadas</p>
                <p className="text-xl font-bold text-red-600 print:text-lg">{etapasAtrasadas}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 print:p-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center print:w-8 print:h-8">
                <Calendar className="w-5 h-5 text-amber-600 print:w-4 print:h-4" />
              </div>
              <div>
                <p className="text-xs text-slate-500 print:text-[10px]">Progresso Geral</p>
                <p className="text-xl font-bold text-amber-600 print:text-lg">{progressoGeral}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabela de Etapas */}
      <Card>
        <CardHeader className="print:p-4">
          <CardTitle className="print:text-base">Cronograma Detalhado</CardTitle>
        </CardHeader>
        <CardContent className="print:p-4">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b-2 border-slate-200">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 print:py-2 print:px-2 print:text-xs">
                    Nº
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 print:py-2 print:px-2 print:text-xs">
                    Etapa
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 print:py-2 print:px-2 print:text-xs">
                    Status
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 print:py-2 print:px-2 print:text-xs">
                    Início Planejado
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 print:py-2 print:px-2 print:text-xs">
                    Fim Planejado
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 print:py-2 print:px-2 print:text-xs">
                    Início Real
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 print:py-2 print:px-2 print:text-xs">
                    Fim Real
                  </th>
                  <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700 print:py-2 print:px-2 print:text-xs">
                    Duração
                  </th>
                  <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700 print:py-2 print:px-2 print:text-xs">
                    Progresso
                  </th>
                </tr>
              </thead>
              <tbody>
                {etapas.map((etapa, index) => (
                  <tr
                    key={etapa.id}
                    className="border-b border-slate-100 hover:bg-slate-50 print:hover:bg-transparent"
                  >
                    <td className="py-3 px-4 text-sm text-slate-600 print:py-2 print:px-2 print:text-xs">
                      {index + 1}
                    </td>
                    <td className="py-3 px-4 print:py-2 print:px-2">
                      <p className="text-sm font-medium text-slate-800 print:text-xs">
                        {etapa.etapa}
                      </p>
                      {etapa.descricao && (
                        <p className="text-xs text-slate-500 mt-1 print:hidden">
                          {etapa.descricao}
                        </p>
                      )}
                    </td>
                    <td className="py-3 px-4 print:py-2 print:px-2">
                      <Badge
                        className={`${getStatusColor(etapa.status)} border-0 print:text-[10px] print:px-1 print:py-0`}
                      >
                        {etapa.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-600 print:py-2 print:px-2 print:text-xs">
                      {formatDate(etapa.data_inicio_planejada)}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-600 print:py-2 print:px-2 print:text-xs">
                      {formatDate(etapa.data_fim_planejada)}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-600 print:py-2 print:px-2 print:text-xs">
                      {formatDate(etapa.data_inicio_real)}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-600 print:py-2 print:px-2 print:text-xs">
                      {formatDate(etapa.data_fim_real)}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-600 text-center print:py-2 print:px-2 print:text-xs">
                      {calcularDias(
                        etapa.data_inicio_real || etapa.data_inicio_planejada,
                        etapa.data_fim_real || etapa.data_fim_planejada
                      )}
                    </td>
                    <td className="py-3 px-4 print:py-2 print:px-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden print:h-1.5">
                          <div
                            className="h-full bg-blue-600 transition-all"
                            style={{ width: `${etapa.percentual_conclusao || 0}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium text-slate-700 w-8 text-right print:text-[10px]">
                          {etapa.percentual_conclusao || 0}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {etapas.length === 0 && (
            <div className="text-center py-12 text-slate-500">
              <Calendar className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Nenhuma etapa cadastrada</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Observações */}
      <Card className="print:break-inside-avoid">
        <CardHeader className="print:p-4">
          <CardTitle className="print:text-base">Observações</CardTitle>
        </CardHeader>
        <CardContent className="print:p-4">
          <div className="space-y-3">
            {etapas
              .filter((e) => e.observacoes)
              .map((etapa, index) => (
                <div key={index} className="p-3 bg-slate-50 rounded-lg print:p-2">
                  <p className="text-sm font-medium text-slate-800 mb-1 print:text-xs">
                    {etapa.etapa}
                  </p>
                  <p className="text-sm text-slate-600 print:text-xs">{etapa.observacoes}</p>
                </div>
              ))}
            {etapas.filter((e) => e.observacoes).length === 0 && (
              <p className="text-sm text-slate-500 text-center py-4 print:text-xs">
                Nenhuma observação registrada
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Footer para impressão */}
      <div className="hidden print:block text-center text-xs text-slate-500 mt-8 pt-4 border-t">
        <p>
          © {new Date().getFullYear()} {empresa?.nome} - Todos os direitos reservados
        </p>
      </div>

      {/* CSS global pra impressão — modo paisagem A4 + preserva cores */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              @page {
                size: A4 landscape;
                margin: 15mm;
              }
              body {
                print-color-adjust: exact;
                -webkit-print-color-adjust: exact;
              }
            }
          `,
        }}
      />
    </div>
  );
}
