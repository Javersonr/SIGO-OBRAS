import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useEmpresa } from "../../../Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShoppingCart, Clock, CheckCircle, FileText } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export default function WidgetDashCompras({ onDadosCarregados }) {
  const { empresaAtiva } = useEmpresa();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!empresaAtiva?.id) return;
    load();
  }, [empresaAtiva?.id]);

  const load = async () => {
    try {
      const [solicitacoes, cotacoes, pedidos] = await Promise.all([
        base44.entities.SolicitacaoCompra.filter({ empresa_id: empresaAtiva.id }),
        base44.entities.Cotacao.filter({ empresa_id: empresaAtiva.id }),
        base44.entities.PedidoCompra.filter({ empresa_id: empresaAtiva.id }),
      ]);

      const solPendentes = solicitacoes.filter((s) => s.status === "Pendente Aprovação");
      const solAprovadas = solicitacoes.filter((s) => s.status === "Aprovada");
      const cotAbertas = cotacoes.filter(
        (c) =>
          c.status === "Aberta" ||
          c.status === "Enviada aos Fornecedores" ||
          c.status === "Aguardando Respostas"
      );
      const pedPendentes = pedidos.filter(
        (p) => p.status === "Pendente" || p.status === "Aprovado"
      );
      const pedEntregues = pedidos.filter(
        (p) => p.status === "Entregue" || p.status === "Concluído"
      );

      const valorPedidos = pedidos.reduce((acc, p) => acc + (p.valor_total || 0), 0);
      const valorPendente = pedPendentes.reduce((acc, p) => acc + (p.valor_total || 0), 0);

      // Meses
      const meses = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const label = d.toLocaleString("pt-BR", { month: "short" });
        const mes = d.getMonth();
        const ano = d.getFullYear();
        const count = pedidos.filter((p) => {
          const dt = new Date(p.created_date);
          return dt.getMonth() === mes && dt.getFullYear() === ano;
        }).length;
        meses.push({ label, count });
      }

      const d = {
        solPendentes: solPendentes.length,
        solAprovadas: solAprovadas.length,
        cotAbertas: cotAbertas.length,
        pedPendentes: pedPendentes.length,
        pedEntregues: pedEntregues.length,
        valorPedidos,
        valorPendente,
        meses,
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

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-l-4 border-l-yellow-500">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">Sol. Pendentes</p>
                <p className="text-2xl font-bold text-yellow-600">{data.solPendentes}</p>
              </div>
              <Clock className="w-8 h-8 text-yellow-200" />
            </div>
            <p className="text-xs text-slate-400 mt-1">aguardando aprovação</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">Cotações Abertas</p>
                <p className="text-2xl font-bold text-blue-600">{data.cotAbertas}</p>
              </div>
              <FileText className="w-8 h-8 text-blue-200" />
            </div>
            <p className="text-xs text-slate-400 mt-1">em andamento</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-orange-500">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">Pedidos Abertos</p>
                <p className="text-2xl font-bold text-orange-600">{data.pedPendentes}</p>
              </div>
              <ShoppingCart className="w-8 h-8 text-orange-200" />
            </div>
            <p className="text-xs text-slate-400 mt-1">{fmt(data.valorPendente)}</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">Entregues</p>
                <p className="text-2xl font-bold text-green-600">{data.pedEntregues}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-200" />
            </div>
            <p className="text-xs text-slate-400 mt-1">{fmt(data.valorPedidos)} total</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-1 pt-3 px-4">
          <CardTitle className="text-sm">Pedidos por mês</CardTitle>
        </CardHeader>
        <CardContent className="px-2 pb-3">
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={data.meses}>
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="#f97316" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
