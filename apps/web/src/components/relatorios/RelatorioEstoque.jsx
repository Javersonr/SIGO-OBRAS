import React, { useState, useEffect, useMemo } from "react";
import { sigo } from "@/api/sigoClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
} from "recharts";
import { Package, AlertTriangle, TrendingDown, DollarSign, Archive } from "lucide-react";
import KpiCard from "./KpiCard";
import ExportButtons, { exportarCSV, exportarPDF } from "./ExportButtons";

const CORES = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];
const fmt = (v) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
  }).format(v);

export default function RelatorioEstoque({ empresaId }) {
  const [materiais, setMateriais] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!empresaId) return;
    sigo.entities.Material.filter({ empresa_id: empresaId, ativo: true })
      .then(setMateriais)
      .finally(() => setLoading(false));
  }, [empresaId]);

  const kpis = useMemo(() => {
    const total = materiais.length;
    const abaixoMinimo = materiais.filter(
      (m) => (m.estoque || 0) <= (m.estoque_minimo || 0) && (m.estoque_minimo || 0) > 0
    ).length;
    const semEstoque = materiais.filter((m) => (m.estoque || 0) === 0).length;
    const valorTotal = materiais.reduce(
      (s, m) => s + (m.estoque || 0) * (m.preco_medio || m.preco || 0),
      0
    );
    const totalItens = materiais.reduce((s, m) => s + (m.estoque || 0), 0);
    return { total, abaixoMinimo, semEstoque, valorTotal, totalItens };
  }, [materiais]);

  const porCategoria = useMemo(() => {
    const map = {};
    materiais.forEach((m) => {
      const k = m.categoria || "Sem Categoria";
      if (!map[k]) map[k] = { nome: k, quantidade: 0, valor: 0, itens: 0 };
      map[k].quantidade++;
      map[k].itens += m.estoque || 0;
      map[k].valor += (m.estoque || 0) * (m.preco_medio || m.preco || 0);
    });
    return Object.values(map)
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 8);
  }, [materiais]);

  const abaixoMinimo = useMemo(
    () =>
      materiais
        .filter((m) => (m.estoque || 0) <= (m.estoque_minimo || 0) && (m.estoque_minimo || 0) > 0)
        .sort((a, b) => (a.estoque || 0) - (b.estoque || 0))
        .slice(0, 10),
    [materiais]
  );

  const handleCSV = () =>
    exportarCSV(
      ["Nome", "Categoria", "Estoque", "Estoque Mínimo", "Preço Médio", "Valor Total"],
      materiais.map((m) => [
        m.nome,
        m.categoria || "",
        m.estoque || 0,
        m.estoque_minimo || 0,
        m.preco_medio || m.preco || 0,
        (m.estoque || 0) * (m.preco_medio || m.preco || 0),
      ]),
      "relatorio_estoque"
    );

  const handlePDF = () =>
    exportarPDF(
      "Relatório de Estoque",
      ["Material", "Categoria", "Qtd", "Mín", "Valor"],
      materiais
        .slice(0, 50)
        .map((m) => [
          m.nome,
          m.categoria || "-",
          m.estoque || 0,
          m.estoque_minimo || 0,
          fmt((m.estoque || 0) * (m.preco_medio || m.preco || 0)),
        ]),
      "relatorio_estoque"
    );

  if (loading)
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );

  if (materiais.length === 0)
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400">
        <Package className="w-12 h-12 mb-3" />
        <p>Nenhum material cadastrado</p>
      </div>
    );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="w-5 h-5 text-green-600" />
          <h2 className="text-lg font-semibold text-slate-800">Relatório de Estoque</h2>
        </div>
        <ExportButtons onCSV={handleCSV} onPDF={handlePDF} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard
          titulo="Materiais"
          valor={kpis.total}
          subtitulo="cadastrados"
          icon={Package}
          cor="blue"
        />
        <KpiCard
          titulo="Total Itens"
          valor={kpis.totalItens.toLocaleString("pt-BR")}
          subtitulo="em estoque"
          icon={Archive}
          cor="green"
        />
        <KpiCard
          titulo="Abaixo Mínimo"
          valor={kpis.abaixoMinimo}
          subtitulo="materiais"
          icon={AlertTriangle}
          cor="amber"
          tendencia={kpis.abaixoMinimo > 0 ? "down" : "up"}
        />
        <KpiCard
          titulo="Sem Estoque"
          valor={kpis.semEstoque}
          subtitulo="materiais"
          icon={TrendingDown}
          cor="red"
        />
        <KpiCard
          titulo="Valor Total"
          valor={fmt(kpis.valorTotal)}
          subtitulo="em estoque"
          icon={DollarSign}
          cor="purple"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-slate-700">
              Valor por Categoria
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={porCategoria} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={(v) => fmt(v).slice(0, 10)}
                  tick={{ fontSize: 10 }}
                />
                <YAxis type="category" dataKey="nome" width={110} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => fmt(v)} />
                <Bar dataKey="valor" name="Valor" radius={[0, 4, 4, 0]}>
                  {porCategoria.map((_, i) => (
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
              Qtd Materiais por Categoria
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={porCategoria}
                  dataKey="quantidade"
                  nameKey="nome"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={({ nome, percent }) => `${(percent * 100).toFixed(0)}%`}
                >
                  {porCategoria.map((_, i) => (
                    <Cell key={i} fill={CORES[i % CORES.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend formatter={(v) => (v.length > 14 ? v.slice(0, 14) + "…" : v)} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {abaixoMinimo.length > 0 && (
        <Card className="border-amber-200">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-amber-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> Materiais Abaixo do Estoque Mínimo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-2 text-slate-600 font-medium">Material</th>
                    <th className="text-right py-2 text-slate-600 font-medium">Categoria</th>
                    <th className="text-right py-2 text-slate-600 font-medium">Estoque Atual</th>
                    <th className="text-right py-2 text-slate-600 font-medium">Estoque Mínimo</th>
                    <th className="text-right py-2 text-slate-600 font-medium">Diferença</th>
                  </tr>
                </thead>
                <tbody>
                  {abaixoMinimo.map((m) => (
                    <tr key={m.id} className="border-b border-slate-100 hover:bg-amber-50">
                      <td className="py-2 font-medium text-slate-800">{m.nome}</td>
                      <td className="py-2 text-right text-slate-500">{m.categoria || "-"}</td>
                      <td className="py-2 text-right font-bold text-red-600">
                        {m.estoque || 0} {m.unidade}
                      </td>
                      <td className="py-2 text-right text-slate-600">
                        {m.estoque_minimo || 0} {m.unidade}
                      </td>
                      <td className="py-2 text-right text-amber-700 font-medium">
                        {(m.estoque_minimo || 0) - (m.estoque || 0)} {m.unidade}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
