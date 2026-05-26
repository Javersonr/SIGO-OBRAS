import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts";
import { Target, TrendingUp, DollarSign, CheckCircle, XCircle, Clock } from "lucide-react";
import KpiCard from "./KpiCard";
import ExportButtons, { exportarCSV, exportarPDF } from "./ExportButtons";

const CORES = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#84cc16",
];

const fmt = (v) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
  }).format(v);

export default function RelatorioVendas({ dados }) {
  const oportunidades = dados.oportunidades || [];

  const kpis = useMemo(() => {
    const total = oportunidades.length;
    const ganhas = oportunidades.filter(
      (o) =>
        o.status_nome?.toLowerCase().includes("ganho") ||
        o.status_nome?.toLowerCase().includes("aprovado")
    ).length;
    const perdidas = oportunidades.filter(
      (o) =>
        o.status_nome?.toLowerCase().includes("perdido") ||
        o.status_nome?.toLowerCase().includes("cancelado")
    ).length;
    const abertas = total - ganhas - perdidas;
    const valorTotal = oportunidades.reduce((s, o) => s + (o.valor_estimado || 0), 0);
    const valorGanho = oportunidades
      .filter((o) => o.status_nome?.toLowerCase().includes("ganho"))
      .reduce((s, o) => s + (o.valor_estimado || 0), 0);
    const txConversao = total > 0 ? Math.round((ganhas / total) * 100) : 0;
    return { total, ganhas, perdidas, abertas, valorTotal, valorGanho, txConversao };
  }, [oportunidades]);

  const porStatus = useMemo(() => {
    const map = {};
    oportunidades.forEach((o) => {
      const s = o.status_nome || "Sem Status";
      if (!map[s]) map[s] = { nome: s, quantidade: 0, valor: 0 };
      map[s].quantidade++;
      map[s].valor += o.valor_estimado || 0;
    });
    return Object.values(map).sort((a, b) => b.valor - a.valor);
  }, [oportunidades]);

  const porMes = useMemo(() => {
    const map = {};
    oportunidades.forEach((o) => {
      const d = new Date(o.created_date);
      const key = `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;
      if (!map[key]) map[key] = { mes: key, abertas: 0, valor: 0 };
      map[key].abertas++;
      map[key].valor += o.valor_estimado || 0;
    });
    return Object.values(map).sort((a, b) => a.mes.localeCompare(b.mes));
  }, [oportunidades]);

  const porOrigem = useMemo(() => {
    const map = {};
    oportunidades.forEach((o) => {
      const k = o.origem_nome || "Não informado";
      if (!map[k]) map[k] = { nome: k, quantidade: 0 };
      map[k].quantidade++;
    });
    return Object.values(map).sort((a, b) => b.quantidade - a.quantidade);
  }, [oportunidades]);

  const handleCSV = () =>
    exportarCSV(
      ["Status", "Quantidade", "Valor Total"],
      porStatus.map((r) => [r.nome, r.quantidade, r.valor]),
      "relatorio_vendas"
    );

  const handlePDF = () =>
    exportarPDF(
      "Relatório de Vendas - Oportunidades",
      ["Status", "Qtd", "Valor"],
      porStatus.map((r) => [r.nome, r.quantidade, fmt(r.valor)]),
      "relatorio_vendas"
    );

  if (oportunidades.length === 0)
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400">
        <Target className="w-12 h-12 mb-3" />
        <p>Nenhuma oportunidade encontrada no período</p>
      </div>
    );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="w-5 h-5 text-blue-600" />
          <h2 className="text-lg font-semibold text-slate-800">Relatório de Vendas</h2>
        </div>
        <ExportButtons onCSV={handleCSV} onPDF={handlePDF} />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KpiCard
          titulo="Total"
          valor={kpis.total}
          subtitulo="oportunidades"
          icon={Target}
          cor="blue"
        />
        <KpiCard
          titulo="Ganhas"
          valor={kpis.ganhas}
          subtitulo="oportunidades"
          icon={CheckCircle}
          cor="green"
        />
        <KpiCard
          titulo="Perdidas"
          valor={kpis.perdidas}
          subtitulo="oportunidades"
          icon={XCircle}
          cor="red"
        />
        <KpiCard
          titulo="Em Aberto"
          valor={kpis.abertas}
          subtitulo="oportunidades"
          icon={Clock}
          cor="amber"
        />
        <KpiCard
          titulo="Valor Total"
          valor={fmt(kpis.valorTotal)}
          subtitulo="estimado"
          icon={DollarSign}
          cor="purple"
        />
        <KpiCard
          titulo="Conversão"
          valor={`${kpis.txConversao}%`}
          subtitulo="taxa de ganho"
          icon={TrendingUp}
          cor="green"
          tendencia={kpis.txConversao >= 50 ? "up" : "down"}
        />
      </div>

      {/* Gráficos linha 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-slate-700">
              Oportunidades por Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={porStatus} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" />
                <YAxis type="category" dataKey="nome" width={110} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v, n) => [
                    n === "valor" ? fmt(v) : v,
                    n === "quantidade" ? "Qtd" : "Valor",
                  ]}
                />
                <Legend />
                <Bar dataKey="quantidade" fill="#3b82f6" name="Qtd" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-slate-700">
              Distribuição por Valor
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={porStatus.slice(0, 6)}
                  dataKey="valor"
                  nameKey="nome"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={({ nome, percent }) =>
                    `${nome.length > 10 ? nome.slice(0, 10) + "…" : nome} ${(percent * 100).toFixed(0)}%`
                  }
                  labelLine={false}
                >
                  {porStatus.map((_, i) => (
                    <Cell key={i} fill={CORES[i % CORES.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => fmt(v)} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos linha 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-slate-700">
              Evolução Mensal (Novas Oportunidades)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={porMes}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="abertas"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  name="Novas"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-slate-700">
              Origem das Oportunidades
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={porOrigem.slice(0, 8)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="nome" tick={{ fontSize: 10 }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="quantidade" name="Quantidade" radius={[4, 4, 0, 0]}>
                  {porOrigem.map((_, i) => (
                    <Cell key={i} fill={CORES[i % CORES.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
