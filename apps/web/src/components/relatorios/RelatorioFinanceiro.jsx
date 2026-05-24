import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, AreaChart, Area
} from 'recharts';
import { DollarSign, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Scale } from 'lucide-react';
import KpiCard from './KpiCard';
import ExportButtons, { exportarCSV, exportarPDF } from './ExportButtons';

const CORES_REC = '#10b981';
const CORES_DESP = '#ef4444';
const CORES_PIE = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 }).format(v);

export default function RelatorioFinanceiro({ empresaId, filtros }) {
  const [transacoes, setTransacoes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!empresaId) return;
    base44.entities.TransacaoFinanceira.filter({ empresa_id: empresaId })
      .then(setTransacoes).finally(() => setLoading(false));
  }, [empresaId]);

  const dadosFiltrados = useMemo(() => {
    return transacoes.filter(t => {
      if (filtros?.dataInicio && new Date(t.data_vencimento || t.created_date) < new Date(filtros.dataInicio)) return false;
      if (filtros?.dataFim && new Date(t.data_vencimento || t.created_date) > new Date(filtros.dataFim)) return false;
      return true;
    });
  }, [transacoes, filtros]);

  const kpis = useMemo(() => {
    const receitas = dadosFiltrados.filter(t => t.tipo === 'Receita');
    const despesas = dadosFiltrados.filter(t => t.tipo === 'Despesa');
    const totalReceitas = receitas.reduce((s, t) => s + (t.valor || 0), 0);
    const totalDespesas = despesas.reduce((s, t) => s + (t.valor || 0), 0);
    const saldo = totalReceitas - totalDespesas;
    const pagas = dadosFiltrados.filter(t => t.status === 'Pago' || t.status === 'Recebido').length;
    const pendentes = dadosFiltrados.filter(t => t.status === 'Pendente' || t.status === 'A Vencer').length;
    const atrasadas = dadosFiltrados.filter(t => {
      if (!t.data_vencimento) return false;
      return new Date(t.data_vencimento) < new Date() && t.status !== 'Pago' && t.status !== 'Recebido';
    }).length;
    return { totalReceitas, totalDespesas, saldo, pagas, pendentes, atrasadas };
  }, [dadosFiltrados]);

  const porMes = useMemo(() => {
    const map = {};
    dadosFiltrados.forEach(t => {
      const d = new Date(t.data_vencimento || t.created_date);
      const key = `${String(d.getMonth() + 1).padStart(2,'0')}/${String(d.getFullYear()).slice(2)}`;
      if (!map[key]) map[key] = { mes: key, receitas: 0, despesas: 0 };
      if (t.tipo === 'Receita') map[key].receitas += t.valor || 0;
      if (t.tipo === 'Despesa') map[key].despesas += t.valor || 0;
    });
    return Object.values(map).sort((a, b) => a.mes.localeCompare(b.mes))
      .map(m => ({ ...m, saldo: m.receitas - m.despesas }));
  }, [dadosFiltrados]);

  const porCategoria = useMemo(() => {
    const map = {};
    dadosFiltrados.filter(t => t.tipo === 'Despesa').forEach(t => {
      const k = t.categoria_nome || 'Sem Categoria';
      if (!map[k]) map[k] = { nome: k, valor: 0 };
      map[k].valor += t.valor || 0;
    });
    return Object.values(map).sort((a, b) => b.valor - a.valor).slice(0, 8);
  }, [dadosFiltrados]);

  const handleCSV = () => exportarCSV(
    ['Tipo', 'Descrição', 'Valor', 'Status', 'Vencimento'],
    dadosFiltrados.map(t => [t.tipo, t.descricao || '', t.valor || 0, t.status || '', t.data_vencimento || '']),
    'relatorio_financeiro'
  );

  const handlePDF = () => exportarPDF(
    'Relatório Financeiro',
    ['Tipo', 'Descrição', 'Valor', 'Status'],
    dadosFiltrados.slice(0, 50).map(t => [t.tipo, (t.descricao || '').slice(0,30), fmt(t.valor || 0), t.status || '']),
    'relatorio_financeiro'
  );

  if (loading) return <div className="flex items-center justify-center py-12"><div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" /></div>;

  if (dadosFiltrados.length === 0) return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-400">
      <DollarSign className="w-12 h-12 mb-3" />
      <p>Nenhuma transação encontrada no período</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-green-600" />
          <h2 className="text-lg font-semibold text-slate-800">Relatório Financeiro</h2>
        </div>
        <ExportButtons onCSV={handleCSV} onPDF={handlePDF} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KpiCard titulo="Total Receitas" valor={fmt(kpis.totalReceitas)} icon={TrendingUp} cor="green" tendencia="up" />
        <KpiCard titulo="Total Despesas" valor={fmt(kpis.totalDespesas)} icon={TrendingDown} cor="red" tendencia="down" />
        <KpiCard titulo="Saldo" valor={fmt(kpis.saldo)} icon={Scale} cor={kpis.saldo >= 0 ? 'green' : 'red'} tendencia={kpis.saldo >= 0 ? 'up' : 'down'} />
        <KpiCard titulo="Pagas/Recebidas" valor={kpis.pagas} subtitulo="transações" icon={ArrowUpRight} cor="green" />
        <KpiCard titulo="Pendentes" valor={kpis.pendentes} subtitulo="transações" icon={DollarSign} cor="amber" />
        <KpiCard titulo="Atrasadas" valor={kpis.atrasadas} subtitulo="transações" icon={ArrowDownRight} cor="red" tendencia={kpis.atrasadas > 0 ? 'down' : 'up'} />
      </div>

      {/* Receitas vs Despesas por Mês */}
      <Card>
        <CardHeader><CardTitle className="text-sm font-semibold text-slate-700">Receitas vs Despesas por Mês</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={porMes}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => fmt(v).slice(0, 10)} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v) => fmt(v)} />
              <Legend />
              <Bar dataKey="receitas" fill={CORES_REC} name="Receitas" radius={[4, 4, 0, 0]} />
              <Bar dataKey="despesas" fill={CORES_DESP} name="Despesas" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Saldo Acumulado */}
        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold text-slate-700">Saldo Mensal</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={porMes}>
                <defs>
                  <linearGradient id="saldoGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => fmt(v).slice(0, 10)} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => fmt(v)} />
                <Area type="monotone" dataKey="saldo" stroke="#10b981" fill="url(#saldoGrad)" strokeWidth={2} name="Saldo" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Despesas por Categoria */}
        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold text-slate-700">Despesas por Categoria</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={porCategoria} dataKey="valor" nameKey="nome" cx="50%" cy="50%" outerRadius={90}
                  label={({ nome, percent }) => `${(percent * 100).toFixed(0)}%`}>
                  {porCategoria.map((_, i) => <Cell key={i} fill={CORES_PIE[i % CORES_PIE.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => fmt(v)} />
                <Legend formatter={(v) => v.length > 14 ? v.slice(0,14)+'…' : v} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}