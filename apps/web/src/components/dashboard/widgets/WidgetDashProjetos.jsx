import React, { useEffect, useState } from "react";
import { sigo } from "@/api/sigoClient";
import { useEmpresa } from "../../../Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FolderKanban, CheckCircle, Clock, AlertCircle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

export default function WidgetDashProjetos({ onDadosCarregados }) {
  const { empresaAtiva } = useEmpresa();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!empresaAtiva?.id) return;
    load();
  }, [empresaAtiva?.id]);

  const load = async () => {
    try {
      const projetos = await sigo.entities.Projeto.filter({ empresa_id: empresaAtiva.id });

      const ativos = projetos.filter((p) => p.status === "Em Andamento" || p.status === "Ativo");
      const concluidos = projetos.filter(
        (p) => p.status === "Concluído" || p.status === "Finalizado"
      );
      const pausados = projetos.filter((p) => p.status === "Pausado" || p.status === "Suspenso");
      const atrasados = ativos.filter((p) => {
        if (!p.data_fim_prevista) return false;
        return new Date(p.data_fim_prevista) < new Date();
      });

      const valorTotal = projetos.reduce((acc, p) => acc + (p.valor_contrato || 0), 0);
      const valorAtivos = ativos.reduce((acc, p) => acc + (p.valor_contrato || 0), 0);

      // Por status para gráfico
      const statusMap = {};
      projetos.forEach((p) => {
        const s = p.status || "Indefinido";
        statusMap[s] = (statusMap[s] || 0) + 1;
      });
      const porStatus = Object.entries(statusMap).map(([name, value]) => ({ name, value }));

      const d = {
        total: projetos.length,
        ativos: ativos.length,
        concluidos: concluidos.length,
        pausados: pausados.length,
        atrasados: atrasados.length,
        valorTotal,
        valorAtivos,
        porStatus,
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
  const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

  if (loading) return <div className="h-48 bg-slate-100 rounded-xl animate-pulse" />;
  if (!data) return null;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">Ativos</p>
                <p className="text-2xl font-bold text-blue-600">{data.ativos}</p>
              </div>
              <FolderKanban className="w-8 h-8 text-blue-200" />
            </div>
            <p className="text-xs text-slate-400 mt-1">{fmt(data.valorAtivos)}</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">Concluídos</p>
                <p className="text-2xl font-bold text-green-600">{data.concluidos}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-200" />
            </div>
            <p className="text-xs text-slate-400 mt-1">&nbsp;</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-yellow-500">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">Pausados</p>
                <p className="text-2xl font-bold text-yellow-600">{data.pausados}</p>
              </div>
              <Clock className="w-8 h-8 text-yellow-200" />
            </div>
            <p className="text-xs text-slate-400 mt-1">&nbsp;</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-red-500">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">Atrasados</p>
                <p className="text-2xl font-bold text-red-600">{data.atrasados}</p>
              </div>
              <AlertCircle className="w-8 h-8 text-red-200" />
            </div>
            <p className="text-xs text-slate-400 mt-1">prazo vencido</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-sm">Por Status</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-3">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={data.porStatus} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={80} />
                <Tooltip />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {data.porStatus.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-sm">Resumo Financeiro</CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            <div className="flex justify-between items-center p-2 bg-slate-50 rounded">
              <span className="text-xs text-slate-600">Total em Contratos</span>
              <span className="text-sm font-bold text-slate-800">{fmt(data.valorTotal)}</span>
            </div>
            <div className="flex justify-between items-center p-2 bg-blue-50 rounded">
              <span className="text-xs text-blue-600">Projetos Ativos</span>
              <span className="text-sm font-bold text-blue-700">{fmt(data.valorAtivos)}</span>
            </div>
            <div className="flex justify-between items-center p-2 bg-slate-50 rounded">
              <span className="text-xs text-slate-600">Total de Projetos</span>
              <span className="text-sm font-bold text-slate-800">{data.total}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
