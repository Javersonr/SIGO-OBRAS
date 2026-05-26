import React, { useEffect, useState } from "react";
import { sigo } from "@/api/sigoClient";
import { useEmpresa } from "../../../Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Target, TrendingUp, CheckCircle, XCircle } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

export default function WidgetDashOportunidades({ onDadosCarregados }) {
  const { empresaAtiva } = useEmpresa();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!empresaAtiva?.id) return;
    load();
  }, [empresaAtiva?.id]);

  const load = async () => {
    try {
      const [oportunidades, status] = await Promise.all([
        sigo.entities.Oportunidade.filter({ empresa_id: empresaAtiva.id }),
        sigo.entities.StatusOportunidade.filter({ empresa_id: empresaAtiva.id }),
      ]);

      const abertas = oportunidades.filter((o) => {
        const s = status.find((s) => s.id === o.status_id);
        return s?.tipo === "aberto";
      });
      const ganhas = oportunidades.filter((o) => {
        const s = status.find((s) => s.id === o.status_id);
        return s?.tipo === "ganho";
      });
      const perdidas = oportunidades.filter((o) => {
        const s = status.find((s) => s.id === o.status_id);
        return s?.tipo === "perdido";
      });

      const valorTotal = abertas.reduce((acc, o) => acc + (o.valor || 0), 0);
      const valorGanho = ganhas.reduce((acc, o) => acc + (o.valor || 0), 0);

      // Por status
      const porStatus = status
        .map((s) => ({
          name: s.nome,
          value: oportunidades.filter((o) => o.status_id === s.id).length,
          cor: s.cor || "#64748b",
        }))
        .filter((s) => s.value > 0);

      // Últimos 6 meses
      const meses = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const label = d.toLocaleString("pt-BR", { month: "short" });
        const mes = d.getMonth();
        const ano = d.getFullYear();
        const count = oportunidades.filter((o) => {
          const dt = new Date(o.created_date);
          return dt.getMonth() === mes && dt.getFullYear() === ano;
        }).length;
        meses.push({ label, count });
      }

      const d = {
        abertas: abertas.length,
        ganhas: ganhas.length,
        perdidas: perdidas.length,
        valorTotal,
        valorGanho,
        porStatus,
        meses,
        total: oportunidades.length,
      };
      setData(d);
      onDadosCarregados?.(d);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fmt = (v) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      notation: "compact",
    }).format(v);

  if (loading) return <div className="h-48 bg-slate-100 rounded-xl animate-pulse" />;
  if (!data) return null;

  const taxa =
    data.total > 0 ? ((data.ganhas / (data.ganhas + data.perdidas || 1)) * 100).toFixed(0) : 0;

  return (
    <div className="space-y-3">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">Em Aberto</p>
                <p className="text-2xl font-bold text-blue-600">{data.abertas}</p>
              </div>
              <Target className="w-8 h-8 text-blue-200" />
            </div>
            <p className="text-xs text-slate-400 mt-1">{fmt(data.valorTotal)} potencial</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">Ganhas</p>
                <p className="text-2xl font-bold text-green-600">{data.ganhas}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-200" />
            </div>
            <p className="text-xs text-slate-400 mt-1">{fmt(data.valorGanho)} fechado</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-red-500">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">Perdidas</p>
                <p className="text-2xl font-bold text-red-600">{data.perdidas}</p>
              </div>
              <XCircle className="w-8 h-8 text-red-200" />
            </div>
            <p className="text-xs text-slate-400 mt-1">&nbsp;</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-purple-500">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">Taxa Conversão</p>
                <p className="text-2xl font-bold text-purple-600">{taxa}%</p>
              </div>
              <TrendingUp className="w-8 h-8 text-purple-200" />
            </div>
            <p className="text-xs text-slate-400 mt-1">ganhas / fechadas</p>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-sm">Novas por mês</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-3">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={data.meses}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-sm">Por Status</CardTitle>
          </CardHeader>
          <CardContent className="pb-3">
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie
                  data={data.porStatus}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={60}
                  label={({ name, value }) => `${name}: ${value}`}
                  labelLine={false}
                  fontSize={10}
                >
                  {data.porStatus.map((entry, i) => (
                    <Cell key={i} fill={entry.cor || COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
