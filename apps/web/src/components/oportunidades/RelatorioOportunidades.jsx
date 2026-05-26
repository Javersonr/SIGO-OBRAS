import React, { useState, useMemo, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useEmpresa } from "@/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download } from "lucide-react";
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
} from "recharts";
import { format } from "date-fns";

export default function RelatorioOportunidades() {
  const { empresaAtiva } = useEmpresa();
  const [oportunidades, setOportunidades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateStart, setDateStart] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 12);
    return format(d, "yyyy-MM-dd");
  });
  const [dateEnd, setDateEnd] = useState(format(new Date(), "yyyy-MM-dd"));

  useEffect(() => {
    const loadData = async () => {
      if (!empresaAtiva?.id) return;
      try {
        setLoading(true);
        const data = await base44.entities.Oportunidade.filter({
          empresa_id: empresaAtiva.id,
        });
        setOportunidades(data);
      } catch (error) {
        console.error("Erro ao carregar oportunidades:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [empresaAtiva?.id]);

  const filteredData = useMemo(() => {
    const start = new Date(dateStart);
    const end = new Date(dateEnd);
    end.setHours(23, 59, 59, 999);

    return oportunidades.filter((opp) => {
      const oppDate = opp.created_date ? new Date(opp.created_date) : null;
      return oppDate && oppDate >= start && oppDate <= end;
    });
  }, [oportunidades, dateStart, dateEnd]);

  // Agrupar por mês
  const monthlyData = useMemo(() => {
    const grouped = {};

    filteredData.forEach((opp) => {
      const date = new Date(opp.created_date);
      const monthKey = format(date, "yyyy-MM");
      const monthLabel = format(date, "MMM/yy");

      if (!grouped[monthKey]) {
        grouped[monthKey] = {
          month: monthLabel,
          monthKey,
          criadas: 0,
          ganhas: 0,
          arquivadas: 0,
          totalValor: 0,
          valores: [],
        };
      }

      grouped[monthKey].criadas += 1;
      grouped[monthKey].valores.push(opp.valor_estimado || 0);

      if (opp.status_nome === "Ganho" || opp.status_nome === "Ganha") {
        grouped[monthKey].ganhas += 1;
      }
      if (opp.arquivado) {
        grouped[monthKey].arquivadas += 1;
      }

      grouped[monthKey].totalValor += opp.valor_estimado || 0;
    });

    return Object.values(grouped)
      .sort((a, b) => a.monthKey.localeCompare(b.monthKey))
      .map((item) => ({
        ...item,
        ticketMedio:
          item.valores.length > 0 ? Math.round(item.totalValor / item.valores.length) : 0,
      }));
  }, [filteredData]);

  // Cards de resumo
  const stats = useMemo(() => {
    const ganhas = filteredData.filter(
      (opp) => opp.status_nome === "Ganho" || opp.status_nome === "Ganha"
    ).length;
    const arquivadas = filteredData.filter((opp) => opp.arquivado).length;
    const abertas = filteredData.filter(
      (opp) => !opp.arquivado && opp.status_nome !== "Ganho" && opp.status_nome !== "Ganha"
    ).length;

    const totalValor = filteredData.reduce((sum, opp) => sum + (opp.valor_estimado || 0), 0);
    const valorGanho = filteredData
      .filter((opp) => opp.status_nome === "Ganho" || opp.status_nome === "Ganha")
      .reduce((sum, opp) => sum + (opp.valor_estimado || 0), 0);

    const conversao =
      filteredData.length > 0 ? Math.round((ganhas / filteredData.length) * 100) : 0;
    const ticketMedio = filteredData.length > 0 ? Math.round(totalValor / filteredData.length) : 0;

    return {
      total: filteredData.length,
      abertas,
      ganhas,
      arquivadas,
      totalValor,
      valorGanho,
      conversao,
      ticketMedio,
    };
  }, [filteredData]);

  const handleExportPDF = () => {
    alert("Funcionalidade de exportação em desenvolvimento.");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <div className="flex items-end gap-4 bg-white p-4 rounded-lg border border-slate-200">
        <div className="flex-1">
          <label className="text-sm font-medium text-slate-700 block mb-2">Data Início</label>
          <Input
            type="date"
            value={dateStart}
            onChange={(e) => setDateStart(e.target.value)}
            className="max-w-xs"
          />
        </div>
        <div className="flex-1">
          <label className="text-sm font-medium text-slate-700 block mb-2">Data Fim</label>
          <Input
            type="date"
            value={dateEnd}
            onChange={(e) => setDateEnd(e.target.value)}
            className="max-w-xs"
          />
        </div>
        <Button onClick={handleExportPDF} className="gap-2">
          <Download className="w-4 h-4" />
          Exportar PDF
        </Button>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-slate-800">{stats.abertas}</p>
              <p className="text-sm text-slate-500 mt-2">Oportunidades em aberto</p>
              <p className="text-sm font-medium text-amber-600 mt-2">
                R$ {(stats.totalValor / 1000000).toFixed(1)}M
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-slate-800">{stats.ganhas}</p>
              <p className="text-sm text-slate-500 mt-2">Oportunidades ganhas</p>
              <p className="text-sm font-medium text-green-600 mt-2">
                R$ {(stats.valorGanho / 1000000).toFixed(1)}M
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-slate-800">{stats.arquivadas}</p>
              <p className="text-sm text-slate-500 mt-2">Arquivadas</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-slate-800">{stats.conversao}%</p>
              <p className="text-sm text-slate-500 mt-2">Taxa de conversão</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-slate-800">
                R$ {(stats.ticketMedio / 1000).toFixed(0)}K
              </p>
              <p className="text-sm text-slate-500 mt-2">Ticket médio</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Criadas vs Ganhas */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Oportunidades Criadas x Ganhas</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="criadas" fill="#64748b" name="Novas oportunidades" />
                <Bar dataKey="ganhas" fill="#10b981" name="Oportunidades ganhas" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Criadas vs Arquivadas */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Oportunidades Criadas x Arquivadas</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="criadas" fill="#64748b" name="Novas oportunidades" />
                <Bar dataKey="arquivadas" fill="#ef4444" name="Arquivadas" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Ticket Médio e Taxa de Conversão */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Ticket Médio e Taxa de Conversão</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip />
                <Legend />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="ticketMedio"
                  stroke="#f59e0b"
                  name="Ticket Médio (R$)"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
