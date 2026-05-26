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
} from "recharts";
import { ShoppingCart, FileCheck, Package, Clock, CheckCircle } from "lucide-react";
import KpiCard from "./KpiCard";
import ExportButtons, { exportarCSV, exportarPDF } from "./ExportButtons";

const CORES = ["#f59e0b", "#3b82f6", "#10b981", "#ef4444", "#8b5cf6", "#ec4899"];
const fmt = (v) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
  }).format(v);

export default function RelatorioCompras({ dados }) {
  const { solicitacoes = [], cotacoes = [], pedidos = [] } = dados;

  const kpis = useMemo(() => {
    const totalSol = solicitacoes.length;
    const pendentes = solicitacoes.filter((s) => s.status === "Pendente Aprovação").length;
    const totalPed = pedidos.length;
    const valorPedidos = pedidos.reduce((s, p) => s + (p.valor_total || 0), 0);
    const solAprovadas = solicitacoes.filter(
      (s) => s.status === "Aprovada" || s.status === "Pedido Gerado"
    ).length;
    const txAprovacao = totalSol > 0 ? Math.round((solAprovadas / totalSol) * 100) : 0;
    return { totalSol, pendentes, totalPed, valorPedidos, solAprovadas, txAprovacao };
  }, [solicitacoes, pedidos, cotacoes]);

  const solPorStatus = useMemo(() => {
    const map = {};
    solicitacoes.forEach((s) => {
      const k = s.status || "Sem Status";
      map[k] = (map[k] || 0) + 1;
    });
    return Object.entries(map)
      .map(([nome, quantidade]) => ({ nome, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade);
  }, [solicitacoes]);

  const pedPorStatus = useMemo(() => {
    const map = {};
    pedidos.forEach((p) => {
      const k = p.status || "Sem Status";
      map[k] = (map[k] || 0) + 1;
    });
    return Object.entries(map).map(([nome, quantidade]) => ({ nome, quantidade }));
  }, [pedidos]);

  const porMes = useMemo(() => {
    const map = {};
    solicitacoes.forEach((s) => {
      const d = new Date(s.created_date);
      const key = `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;
      if (!map[key]) map[key] = { mes: key, solicitacoes: 0, pedidos: 0 };
      map[key].solicitacoes++;
    });
    pedidos.forEach((p) => {
      const d = new Date(p.created_date);
      const key = `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;
      if (!map[key]) map[key] = { mes: key, solicitacoes: 0, pedidos: 0 };
      map[key].pedidos++;
    });
    return Object.values(map).sort((a, b) => a.mes.localeCompare(b.mes));
  }, [solicitacoes, pedidos]);

  const handleCSV = () =>
    exportarCSV(
      ["Tipo", "Status", "Quantidade"],
      [
        ...solPorStatus.map((r) => ["Solicitação", r.nome, r.quantidade]),
        ...pedPorStatus.map((r) => ["Pedido", r.nome, r.quantidade]),
      ],
      "relatorio_compras"
    );

  const handlePDF = () =>
    exportarPDF(
      "Relatório de Compras",
      ["Tipo", "Status", "Qtd"],
      [
        ...solPorStatus.map((r) => ["Solicitação", r.nome, r.quantidade]),
        ...pedPorStatus.map((r) => ["Pedido", r.nome, r.quantidade]),
      ],
      "relatorio_compras"
    );

  if (solicitacoes.length === 0 && pedidos.length === 0)
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400">
        <ShoppingCart className="w-12 h-12 mb-3" />
        <p>Nenhum dado de compras encontrado no período</p>
      </div>
    );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-5 h-5 text-amber-600" />
          <h2 className="text-lg font-semibold text-slate-800">Relatório de Compras</h2>
        </div>
        <ExportButtons onCSV={handleCSV} onPDF={handlePDF} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KpiCard
          titulo="Solicitações"
          valor={kpis.totalSol}
          subtitulo="total"
          icon={FileCheck}
          cor="blue"
        />
        <KpiCard
          titulo="Pendentes"
          valor={kpis.pendentes}
          subtitulo="aguardando"
          icon={Clock}
          cor="amber"
        />
        <KpiCard
          titulo="Aprovadas"
          valor={kpis.solAprovadas}
          subtitulo="solicitações"
          icon={CheckCircle}
          cor="green"
        />
        <KpiCard
          titulo="Cotações"
          valor={cotacoes.length}
          subtitulo="total"
          icon={FileCheck}
          cor="purple"
        />
        <KpiCard
          titulo="Pedidos"
          valor={kpis.totalPed}
          subtitulo="total"
          icon={Package}
          cor="slate"
        />
        <KpiCard
          titulo="Tx. Aprovação"
          valor={`${kpis.txAprovacao}%`}
          subtitulo="solicitações"
          icon={ShoppingCart}
          cor="green"
          tendencia={kpis.txAprovacao >= 70 ? "up" : "down"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-slate-700">
              Solicitações por Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={solPorStatus} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" />
                <YAxis type="category" dataKey="nome" width={130} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="quantidade" name="Solicitações" radius={[0, 4, 4, 0]}>
                  {solPorStatus.map((_, i) => (
                    <Cell key={i} fill={CORES[i % CORES.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-slate-700">
              Distribuição de Pedidos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={pedPorStatus}
                  dataKey="quantidade"
                  nameKey="nome"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={({ nome, percent }) => `${(percent * 100).toFixed(0)}%`}
                >
                  {pedPorStatus.map((_, i) => (
                    <Cell key={i} fill={CORES[i % CORES.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-slate-700">
            Evolução Mensal (Solicitações vs Pedidos)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={porMes}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar
                dataKey="solicitacoes"
                fill="#3b82f6"
                name="Solicitações"
                radius={[4, 4, 0, 0]}
              />
              <Bar dataKey="pedidos" fill="#f59e0b" name="Pedidos" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
