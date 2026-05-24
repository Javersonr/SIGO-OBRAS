import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, AreaChart, Area
} from 'recharts';
import { FolderKanban, TrendingUp, DollarSign, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import KpiCard from './KpiCard';
import ExportButtons, { exportarCSV, exportarPDF } from './ExportButtons';

const CORES = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 }).format(v);

export default function RelatorioProjetos({ dados }) {
  const projetos = dados.projetos || [];

  const kpis = useMemo(() => {
    const total = projetos.length;
    const concluidos = projetos.filter(p => p.status_nome?.toLowerCase().includes('conclu') || p.status_nome?.toLowerCase().includes('entregue')).length;
    const emAndamento = projetos.filter(p => p.status_nome?.toLowerCase().includes('andamento') || p.status_nome?.toLowerCase().includes('execu')).length;
    const atrasados = projetos.filter(p => {
      if (!p.data_fechamento_prevista) return false;
      return new Date(p.data_fechamento_prevista) < new Date() && !p.status_nome?.toLowerCase().includes('conclu');
    }).length;
    const valorTotal = projetos.reduce((s, p) => s + (p.valor_estimado || 0), 0);
    const valorConcluido = projetos.filter(p => p.status_nome?.toLowerCase().includes('conclu')).reduce((s, p) => s + (p.valor_estimado || 0), 0);
    return { total, concluidos, emAndamento, atrasados, valorTotal, valorConcluido };
  }, [projetos]);

  const porStatus = useMemo(() => {
    const map = {};
    projetos.forEach(p => {
      const s = p.status_nome || 'Sem Status';
      if (!map[s]) map[s] = { nome: s, quantidade: 0, valor: 0 };
      map[s].quantidade++;
      map[s].valor += p.valor_estimado || 0;
    });
    return Object.values(map).sort((a, b) => b.quantidade - a.quantidade);
  }, [projetos]);

  const porMes = useMemo(() => {
    const map = {};
    projetos.forEach(p => {
      const d = new Date(p.created_date);
      const key = `${String(d.getMonth() + 1).padStart(2,'0')}/${String(d.getFullYear()).slice(2)}`;
      if (!map[key]) map[key] = { mes: key, novos: 0, valor: 0 };
      map[key].novos++;
      map[key].valor += p.valor_estimado || 0;
    });
    return Object.values(map).sort((a, b) => a.mes.localeCompare(b.mes));
  }, [projetos]);

  const porCliente = useMemo(() => {
    const map = {};
    projetos.forEach(p => {
      const k = p.cliente_nome || 'Sem Cliente';
      if (!map[k]) map[k] = { nome: k, quantidade: 0, valor: 0 };
      map[k].quantidade++;
      map[k].valor += p.valor_estimado || 0;
    });
    return Object.values(map).sort((a, b) => b.valor - a.valor).slice(0, 8);
  }, [projetos]);

  const handleCSV = () => exportarCSV(
    ['Status', 'Quantidade', 'Valor Total'],
    porStatus.map(r => [r.nome, r.quantidade, r.valor]),
    'relatorio_projetos'
  );

  const handlePDF = () => exportarPDF(
    'Relatório de Projetos',
    ['Status', 'Qtd', 'Valor'],
    porStatus.map(r => [r.nome, r.quantidade, fmt(r.valor)]),
    'relatorio_projetos'
  );

  if (projetos.length === 0) return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-400">
      <FolderKanban className="w-12 h-12 mb-3" />
      <p>Nenhum projeto encontrado no período</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderKanban className="w-5 h-5 text-green-600" />
          <h2 className="text-lg font-semibold text-slate-800">Relatório de Projetos</h2>
        </div>
        <ExportButtons onCSV={handleCSV} onPDF={handlePDF} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KpiCard titulo="Total" valor={kpis.total} subtitulo="projetos" icon={FolderKanban} cor="blue" />
        <KpiCard titulo="Concluídos" valor={kpis.concluidos} subtitulo="projetos" icon={CheckCircle} cor="green" />
        <KpiCard titulo="Em Andamento" valor={kpis.emAndamento} subtitulo="projetos" icon={Clock} cor="amber" />
        <KpiCard titulo="Atrasados" valor={kpis.atrasados} subtitulo="projetos" icon={AlertCircle} cor="red" tendencia={kpis.atrasados > 0 ? 'down' : 'up'} />
        <KpiCard titulo="Valor Total" valor={fmt(kpis.valorTotal)} subtitulo="estimado" icon={DollarSign} cor="purple" />
        <KpiCard titulo="Valor Concluído" valor={fmt(kpis.valorConcluido)} subtitulo="entregue" icon={TrendingUp} cor="green" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold text-slate-700">Projetos por Status</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={porStatus} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" />
                <YAxis type="category" dataKey="nome" width={120} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="quantidade" name="Projetos" radius={[0, 4, 4, 0]}>
                  {porStatus.map((_, i) => <Cell key={i} fill={CORES[i % CORES.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold text-slate-700">Valor por Status</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={porStatus.filter(d => d.valor > 0)} dataKey="valor" nameKey="nome" cx="50%" cy="50%" outerRadius={100}
                  label={({ nome, percent }) => `${(percent * 100).toFixed(0)}%`}>
                  {porStatus.map((_, i) => <Cell key={i} fill={CORES[i % CORES.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => fmt(v)} />
                <Legend formatter={(v) => v.length > 14 ? v.slice(0,14)+'…' : v} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold text-slate-700">Novos Projetos por Mês</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={porMes}>
                <defs>
                  <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip />
                <Area type="monotone" dataKey="novos" stroke="#10b981" fill="url(#grad)" strokeWidth={2} name="Novos Projetos" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold text-slate-700">Top Clientes por Valor</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={porCliente} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickFormatter={(v) => fmt(v).replace('R$', 'R$').slice(0,10)} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="nome" width={100} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => fmt(v)} />
                <Bar dataKey="valor" fill="#10b981" name="Valor" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}