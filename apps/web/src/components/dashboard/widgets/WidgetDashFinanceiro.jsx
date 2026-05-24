import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useEmpresa } from '../../../Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, TrendingUp, TrendingDown, AlertCircle, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Badge } from '@/components/ui/badge';

export default function WidgetDashFinanceiro({ onDadosCarregados }) {
  const { empresaAtiva } = useEmpresa();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!empresaAtiva?.id) return;
    load();
  }, [empresaAtiva?.id]);

  const load = async () => {
    try {
      const hoje = new Date();
      const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split('T')[0];
      const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().split('T')[0];

      const transacoes = await base44.entities.TransacaoFinanceira.filter({ empresa_id: empresaAtiva.id });

      const doMes = transacoes.filter(t => {
        const d = t.data_lancamento || t.created_date?.split('T')[0];
        return d >= inicioMes && d <= fimMes;
      });

      const receitasMes = doMes.filter(t => t.tipo === 'Receita' || t.tipo === 'receita').reduce((a, t) => a + (t.valor || 0), 0);
      const despesasMes = doMes.filter(t => t.tipo === 'Despesa' || t.tipo === 'despesa').reduce((a, t) => a + (t.valor || 0), 0);
      const saldoMes = receitasMes - despesasMes;

      // Vencimentos nos próximos 7 dias
      const em7 = new Date(); em7.setDate(em7.getDate() + 7);
      const vencendo = transacoes.filter(t => {
        if (t.status === 'Pago' || t.status === 'pago') return false;
        const d = t.data_vencimento;
        if (!d) return false;
        const venc = new Date(d);
        return venc >= hoje && venc <= em7;
      });

      const vencidos = transacoes.filter(t => {
        if (t.status === 'Pago' || t.status === 'pago') return false;
        const d = t.data_vencimento;
        if (!d) return false;
        return new Date(d) < hoje;
      });

      const valorVencidos = vencidos.reduce((a, t) => a + (t.valor || 0), 0);
      const valorVencendo = vencendo.reduce((a, t) => a + (t.valor || 0), 0);

      // Últimos 6 meses
      const meses = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(); d.setMonth(d.getMonth() - i);
        const label = d.toLocaleString('pt-BR', { month: 'short' });
        const mes = d.getMonth(); const ano = d.getFullYear();
        const rec = transacoes.filter(t => {
          const dt = new Date(t.created_date); return dt.getMonth() === mes && dt.getFullYear() === ano && (t.tipo === 'Receita' || t.tipo === 'receita');
        }).reduce((a, t) => a + (t.valor || 0), 0);
        const desp = transacoes.filter(t => {
          const dt = new Date(t.created_date); return dt.getMonth() === mes && dt.getFullYear() === ano && (t.tipo === 'Despesa' || t.tipo === 'despesa');
        }).reduce((a, t) => a + (t.valor || 0), 0);
        meses.push({ label, receitas: rec, despesas: desp });
      }

      const d = { receitasMes, despesasMes, saldoMes, vencendo: vencendo.length, vencidos: vencidos.length, valorVencidos, valorVencendo, meses };
      setData(d); onDadosCarregados?.(d);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact' }).format(v);

  if (loading) return <div className="h-48 bg-slate-100 rounded-xl animate-pulse" />;
  if (!data) return null;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div><p className="text-xs text-slate-500">Receitas Mês</p><p className="text-xl font-bold text-green-600">{fmt(data.receitasMes)}</p></div>
              <ArrowUpCircle className="w-8 h-8 text-green-200" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-red-500">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div><p className="text-xs text-slate-500">Despesas Mês</p><p className="text-xl font-bold text-red-600">{fmt(data.despesasMes)}</p></div>
              <ArrowDownCircle className="w-8 h-8 text-red-200" />
            </div>
          </CardContent>
        </Card>

        <Card className={`border-l-4 ${data.saldoMes >= 0 ? 'border-l-blue-500' : 'border-l-orange-500'}`}>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div><p className="text-xs text-slate-500">Saldo do Mês</p><p className={`text-xl font-bold ${data.saldoMes >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>{fmt(data.saldoMes)}</p></div>
              {data.saldoMes >= 0 ? <TrendingUp className="w-8 h-8 text-blue-200" /> : <TrendingDown className="w-8 h-8 text-orange-200" />}
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-red-600">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div><p className="text-xs text-slate-500">Vencidos</p><p className="text-xl font-bold text-red-700">{fmt(data.valorVencidos)}</p></div>
              <AlertCircle className="w-8 h-8 text-red-200" />
            </div>
            <p className="text-xs text-slate-400 mt-1">{data.vencidos} lançamentos</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-1 pt-3 px-4"><CardTitle className="text-sm">Receitas vs Despesas (6 meses)</CardTitle></CardHeader>
        <CardContent className="px-2 pb-3">
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={data.meses}>
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => fmt(v)} />
              <Tooltip formatter={(v) => fmt(v)} />
              <Bar dataKey="receitas" name="Receitas" fill="#10b981" radius={[4,4,0,0]} />
              <Bar dataKey="despesas" name="Despesas" fill="#ef4444" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}