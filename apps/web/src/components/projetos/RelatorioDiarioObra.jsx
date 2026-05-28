import React, { useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  Download,
  FileSpreadsheet,
  FileText,
  Users,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Calendar,
} from "lucide-react";
import jsPDF from "jspdf";
import * as XLSX from "xlsx";
import { safeParseJSON } from "@/lib/json-utils";

const CORES = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

// Alias local pra manter nome `parseJSON` usado em todo o resto desse arquivo.
const parseJSON = safeParseJSON;

export default function RelatorioDiarioObra({
  open,
  onOpenChange,
  diarios = [],
  projeto,
  empresaAtiva,
}) {
  const [filtroDataInicio, setFiltroDataInicio] = useState("");
  const [filtroDataFim, setFiltroDataFim] = useState("");
  const [filtroClima, setFiltroClima] = useState("all");
  const [filtroProblemas, setFiltroProblemas] = useState("all");

  // Aplicar filtros
  const diariosFiltrados = useMemo(() => {
    return diarios.filter((d) => {
      if (filtroDataInicio && d.data < filtroDataInicio) return false;
      if (filtroDataFim && d.data > filtroDataFim) return false;
      if (filtroClima !== "all" && d.clima !== filtroClima) return false;
      if (filtroProblemas === "com" && !d.problemas) return false;
      if (filtroProblemas === "sem" && d.problemas) return false;
      return true;
    });
  }, [diarios, filtroDataInicio, filtroDataFim, filtroClima, filtroProblemas]);

  // KPIs
  const totalRegistros = diariosFiltrados.length;
  const diasComProblemas = diariosFiltrados.filter((d) => d.problemas).length;
  const totalFotos = diariosFiltrados.reduce((acc, d) => acc + parseJSON(d.fotos, []).length, 0);
  const totalTrabalhadores = diariosFiltrados.reduce((acc, d) => {
    const mo = parseJSON(d.mao_de_obra, []);
    return acc + mo.reduce((s, m) => s + (m.quantidade || 0), 0);
  }, 0);

  // Gráfico progresso ao longo do tempo (atividades por dia)
  const dadosLinha = useMemo(() => {
    return diariosFiltrados
      .slice()
      .reverse()
      .map((d) => ({
        data: new Date(d.data).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
        trabalhadores: parseJSON(d.mao_de_obra, []).reduce((s, m) => s + (m.quantidade || 0), 0),
        fotos: parseJSON(d.fotos, []).length,
        problemas: d.problemas ? 1 : 0,
      }));
  }, [diariosFiltrados]);

  // Distribuição de clima
  const dadosClima = useMemo(() => {
    const map = {};
    diariosFiltrados.forEach((d) => {
      map[d.clima || "N/D"] = (map[d.clima || "N/D"] || 0) + 1;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [diariosFiltrados]);

  // Mão de obra por função
  const dadosMaoObra = useMemo(() => {
    const map = {};
    diariosFiltrados.forEach((d) => {
      parseJSON(d.mao_de_obra, []).forEach((m) => {
        map[m.nome] = (map[m.nome] || 0) + (m.quantidade || 0);
      });
    });
    return Object.entries(map)
      .map(([nome, total]) => ({ nome, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [diariosFiltrados]);

  // Ocorrências por semana
  const dadosOcorrencias = useMemo(() => {
    const semanas = {};
    diariosFiltrados.forEach((d) => {
      const dt = new Date(d.data);
      const semana = `S${Math.ceil(dt.getDate() / 7)}/${dt.getMonth() + 1}`;
      if (!semanas[semana]) semanas[semana] = { semana, total: 0, problemas: 0 };
      semanas[semana].total++;
      if (d.problemas) semanas[semana].problemas++;
    });
    return Object.values(semanas);
  }, [diariosFiltrados]);

  // Export PDF
  const exportarPDF = () => {
    const doc = new jsPDF("p", "mm", "a4");
    const nomeObra = projeto?.nome || "Obra";
    const hoje = new Date().toLocaleDateString("pt-BR");

    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("RELATÓRIO CONSOLIDADO - DIÁRIO DE OBRA", 20, 20);

    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`Obra: ${nomeObra}`, 20, 32);
    doc.text(`Empresa: ${empresaAtiva?.nome || ""}`, 20, 39);
    doc.text(`Gerado em: ${hoje}`, 20, 46);
    if (filtroDataInicio || filtroDataFim) {
      doc.text(`Período: ${filtroDataInicio || "..."} a ${filtroDataFim || "..."}`, 20, 53);
    }

    let y = 62;
    doc.setFillColor(30, 41, 59);
    doc.rect(20, y, 170, 8, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.text("RESUMO EXECUTIVO", 24, y + 5.5);
    doc.setTextColor(0, 0, 0);
    y += 14;

    const kpis = [
      ["Total de Registros", totalRegistros],
      ["Dias com Problemas", diasComProblemas],
      ["Total de Fotos", totalFotos],
      ["Total de Trabalhadores (acumulado)", totalTrabalhadores],
    ];
    kpis.forEach(([label, val]) => {
      doc.setFont("helvetica", "bold");
      doc.text(`${label}:`, 24, y);
      doc.setFont("helvetica", "normal");
      doc.text(`${val}`, 120, y);
      y += 8;
    });

    y += 6;
    doc.setFillColor(30, 41, 59);
    doc.rect(20, y, 170, 8, "F");
    doc.setTextColor(255, 255, 255);
    doc.text("REGISTROS DETALHADOS", 24, y + 5.5);
    doc.setTextColor(0, 0, 0);
    y += 14;

    diariosFiltrados.forEach((d, idx) => {
      if (y > 260) {
        doc.addPage();
        y = 20;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      const dataFmt = new Date(d.data).toLocaleDateString("pt-BR", {
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
      doc.text(
        `${idx + 1}. ${dataFmt} | ${d.clima || ""} ${d.temperatura ? `| ${d.temperatura}°C` : ""}`,
        20,
        y
      );
      y += 6;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      const ativLines = doc.splitTextToSize(`Atividades: ${d.atividades || ""}`, 165);
      doc.text(ativLines, 24, y);
      y += ativLines.length * 4.5;

      if (d.observacoes) {
        const obsLines = doc.splitTextToSize(`Obs: ${d.observacoes}`, 165);
        doc.text(obsLines, 24, y);
        y += obsLines.length * 4.5;
      }
      if (d.problemas) {
        doc.setTextColor(200, 30, 30);
        const probLines = doc.splitTextToSize(`⚠ Problemas: ${d.problemas}`, 165);
        doc.text(probLines, 24, y);
        doc.setTextColor(0, 0, 0);
        y += probLines.length * 4.5;
      }

      const mo = parseJSON(d.mao_de_obra, []);
      if (mo.length > 0) {
        doc.text(`Mão de obra: ${mo.map((m) => `${m.nome} (${m.quantidade})`).join(", ")}`, 24, y);
        y += 5;
      }
      y += 4;
    });

    doc.save(`Relatorio_Diario_Obra_${nomeObra.replace(/\s/g, "_")}.pdf`);
  };

  // Export Excel
  const exportarExcel = () => {
    const rows = diariosFiltrados.map((d) => {
      const mo = parseJSON(d.mao_de_obra, []);
      return {
        Data: new Date(d.data).toLocaleDateString("pt-BR"),
        "Dia Semana": new Date(d.data).toLocaleDateString("pt-BR", { weekday: "long" }),
        Clima: d.clima || "",
        "Temperatura (°C)": d.temperatura || "",
        "Horário Início": d.horario_inicio || "",
        "Horário Fim": d.horario_fim || "",
        Atividades: d.atividades || "",
        Observações: d.observacoes || "",
        Problemas: d.problemas || "",
        "Mão de Obra": mo.map((m) => `${m.nome}: ${m.quantidade}`).join(" | "),
        "Total Trabalhadores": mo.reduce((s, m) => s + (m.quantidade || 0), 0),
        "Qtd Fotos": parseJSON(d.fotos, []).length,
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Diário de Obra");

    // Aba de resumo
    const resumoRows = [
      { Métrica: "Total de Registros", Valor: totalRegistros },
      { Métrica: "Dias com Problemas", Valor: diasComProblemas },
      { Métrica: "Total de Fotos", Valor: totalFotos },
      { Métrica: "Total de Trabalhadores (acum.)", Valor: totalTrabalhadores },
      ...dadosClima.map((c) => ({ Métrica: `Dias com clima: ${c.name}`, Valor: c.value })),
      ...dadosMaoObra.map((m) => ({ Métrica: `Trabalhadores (${m.nome})`, Valor: m.total })),
    ];
    const wsResumo = XLSX.utils.json_to_sheet(resumoRows);
    XLSX.utils.book_append_sheet(wb, wsResumo, "Resumo");

    XLSX.writeFile(
      wb,
      `Relatorio_Diario_Obra_${(projeto?.nome || "Obra").replace(/\s/g, "_")}.xlsx`
    );
  };

  const climaIcon = (c) => ({ Sol: "☀️", Nublado: "☁️", Chuva: "🌧️", Vento: "💨" })[c] || "";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full h-full overflow-y-auto p-0 flex flex-col">
        <SheetHeader className="p-6 border-b sticky top-0 bg-white z-10">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              Relatórios Avançados — Diário de Obra
            </SheetTitle>
            <div className="flex gap-2">
              <Button
                onClick={exportarExcel}
                variant="outline"
                size="sm"
                className="gap-2 text-green-700 border-green-300 hover:bg-green-50"
              >
                <FileSpreadsheet className="w-4 h-4" /> Excel
              </Button>
              <Button
                onClick={exportarPDF}
                size="sm"
                className="gap-2 bg-red-600 hover:bg-red-700 text-white"
              >
                <Download className="w-4 h-4" /> PDF
              </Button>
            </div>
          </div>
        </SheetHeader>

        <div className="p-6 space-y-6 flex-1 overflow-y-auto">
          {/* Filtros */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-slate-700">Filtros</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <Label className="text-xs">Data início</Label>
                  <Input
                    type="date"
                    value={filtroDataInicio}
                    onChange={(e) => setFiltroDataInicio(e.target.value)}
                    className="mt-1 h-8 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">Data fim</Label>
                  <Input
                    type="date"
                    value={filtroDataFim}
                    onChange={(e) => setFiltroDataFim(e.target.value)}
                    className="mt-1 h-8 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">Clima</Label>
                  <Select value={filtroClima} onValueChange={setFiltroClima}>
                    <SelectTrigger className="mt-1 h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="Sol">☀️ Sol</SelectItem>
                      <SelectItem value="Nublado">☁️ Nublado</SelectItem>
                      <SelectItem value="Chuva">🌧️ Chuva</SelectItem>
                      <SelectItem value="Vento">💨 Vento</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Ocorrências</Label>
                  <Select value={filtroProblemas} onValueChange={setFiltroProblemas}>
                    <SelectTrigger className="mt-1 h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="com">Com problemas</SelectItem>
                      <SelectItem value="sem">Sem problemas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                {diariosFiltrados.length} de {diarios.length} registros exibidos
              </p>
            </CardContent>
          </Card>

          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-800">{totalRegistros}</p>
                  <p className="text-xs text-slate-500">Registros</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-800">{diasComProblemas}</p>
                  <p className="text-xs text-slate-500">Dias c/ Problemas</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                  <Users className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-800">{totalTrabalhadores}</p>
                  <p className="text-xs text-slate-500">Trabalhadores (acum.)</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-800">{totalFotos}</p>
                  <p className="text-xs text-slate-500">Fotos Registradas</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Gráfico: Trabalhadores ao longo do tempo */}
          {dadosLinha.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Trabalhadores por Dia</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={dadosLinha}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="data" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="trabalhadores"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      name="Trabalhadores"
                      dot={{ r: 3 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="fotos"
                      stroke="#10b981"
                      strokeWidth={2}
                      name="Fotos"
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Distribuição de clima */}
            {dadosClima.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Clima por Período</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie
                        data={dadosClima}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={65}
                        label={({ name, value }) => `${climaIcon(name)} ${name}: ${value}`}
                      >
                        {dadosClima.map((_, i) => (
                          <Cell key={i} fill={CORES[i % CORES.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Mão de obra por função */}
            {dadosMaoObra.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Mão de Obra Acumulada por Função</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={dadosMaoObra} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis dataKey="nome" type="category" tick={{ fontSize: 10 }} width={90} />
                      <Tooltip />
                      <Bar
                        dataKey="total"
                        fill="#3b82f6"
                        name="Trabalhadores"
                        radius={[0, 4, 4, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Ocorrências por semana */}
          {dadosOcorrencias.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-orange-500" />
                  Registros e Ocorrências por Semana
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={dadosOcorrencias}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="semana" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Bar
                      dataKey="total"
                      fill="#3b82f6"
                      name="Dias trabalhados"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="problemas"
                      fill="#ef4444"
                      name="Ocorrências"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Tabela dos registros filtrados */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Lista de Registros Filtrados</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-slate-50">
                      <th className="text-left p-3 font-semibold text-slate-600">Data</th>
                      <th className="text-left p-3 font-semibold text-slate-600">Clima</th>
                      <th className="text-left p-3 font-semibold text-slate-600">Trabalhadores</th>
                      <th className="text-left p-3 font-semibold text-slate-600">Atividades</th>
                      <th className="text-left p-3 font-semibold text-slate-600">Problemas</th>
                      <th className="text-left p-3 font-semibold text-slate-600">Fotos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diariosFiltrados.map((d) => {
                      const mo = parseJSON(d.mao_de_obra, []);
                      const totalMO = mo.reduce((s, m) => s + (m.quantidade || 0), 0);
                      const fotos = parseJSON(d.fotos, []).length;
                      return (
                        <tr key={d.id} className="border-b hover:bg-slate-50 transition-colors">
                          <td className="p-3 whitespace-nowrap font-medium">
                            {new Date(d.data).toLocaleDateString("pt-BR", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "2-digit",
                            })}
                          </td>
                          <td className="p-3">
                            {climaIcon(d.clima)} {d.clima}
                          </td>
                          <td className="p-3">
                            {totalMO > 0 ? <Badge variant="outline">{totalMO}</Badge> : "-"}
                          </td>
                          <td className="p-3 max-w-xs truncate text-slate-600">
                            {d.atividades?.substring(0, 60)}...
                          </td>
                          <td className="p-3">
                            {d.problemas ? (
                              <Badge className="bg-red-100 text-red-700 text-xs">⚠ Sim</Badge>
                            ) : (
                              <Badge className="bg-green-100 text-green-700 text-xs">✓ Não</Badge>
                            )}
                          </td>
                          <td className="p-3">
                            {fotos > 0 ? <Badge variant="outline">{fotos}</Badge> : "-"}
                          </td>
                        </tr>
                      );
                    })}
                    {diariosFiltrados.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-400">
                          Nenhum registro com os filtros selecionados
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </SheetContent>
    </Sheet>
  );
}
