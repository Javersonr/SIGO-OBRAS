import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  LineChart, Line, BarChart, Bar, ComposedChart, 
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart 
} from 'recharts';
import { TrendingUp, TrendingDown } from 'lucide-react';

export default function GraficosComparativos({ 
  transacoes, 
  filtros,
  tipo = 'dre' // 'dre', 'fluxo', 'balanco'
}) {
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
  };

  // Comparação DRE: Período Atual vs Anterior
  const getDREComparativo = () => {
    const { dataInicio, dataFim } = filtros;
    if (!dataInicio || !dataFim) return [];

    const inicio = new Date(dataInicio);
    const fim = new Date(dataFim);
    const diffDays = (fim - inicio) / (1000 * 60 * 60 * 24);

    const inicioAnterior = new Date(inicio);
    inicioAnterior.setDate(inicioAnterior.getDate() - diffDays);

    const transacoesAtual = transacoes.filter(t => {
      const data = new Date(t.data_vencimento || t.created_date);
      return data >= inicio && data <= fim && t.status === 'Pago';
    });

    const transacoesAnterior = transacoes.filter(t => {
      const data = new Date(t.data_vencimento || t.created_date);
      return data >= inicioAnterior && data < inicio && t.status === 'Pago';
    });

    const calcularDRE = (trans) => ({
      receitas: trans.filter(t => t.tipo === 'Receita').reduce((s, t) => s + (t.valor || 0), 0),
      despesas: trans.filter(t => t.tipo === 'Despesa').reduce((s, t) => s + (t.valor || 0), 0)
    });

    const atual = calcularDRE(transacoesAtual);
    const anterior = calcularDRE(transacoesAnterior);

    return [
      { 
        periodo: 'Anterior', 
        receitas: anterior.receitas, 
        despesas: anterior.despesas,
        lucro: anterior.receitas - anterior.despesas
      },
      { 
        periodo: 'Atual', 
        receitas: atual.receitas, 
        despesas: atual.despesas,
        lucro: atual.receitas - atual.despesas
      }
    ];
  };

  // Fluxo de Caixa: Projetado vs Realizado
  const getFluxoComparativo = () => {
    const fluxoPorMes = {};

    transacoes.forEach(t => {
      const mes = (t.data_vencimento || t.created_date)?.slice(0, 7);
      if (!mes) return;

      if (!fluxoPorMes[mes]) {
        fluxoPorMes[mes] = { 
          mes, 
          realizado: 0, 
          projetado: 0 
        };
      }

      const valor = t.valor || 0;
      const mult = t.tipo === 'Receita' ? 1 : -1;

      if (t.status === 'Pago') {
        fluxoPorMes[mes].realizado += valor * mult;
        fluxoPorMes[mes].projetado += valor * mult;
      } else {
        fluxoPorMes[mes].projetado += valor * mult;
      }
    });

    return Object.values(fluxoPorMes)
      .sort((a, b) => a.mes.localeCompare(b.mes))
      .slice(-6)
      .map(item => ({
        mes: new Date(item.mes + '-01').toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
        realizado: item.realizado,
        projetado: item.projetado
      }));
  };

  // Evolução Mensal das Margens
  const getEvolicaoMargens = () => {
    const margensPorMes = {};

    transacoes.forEach(t => {
      if (t.status !== 'Pago') return;
      
      const mes = (t.data_vencimento || t.created_date)?.slice(0, 7);
      if (!mes) return;

      if (!margensPorMes[mes]) {
        margensPorMes[mes] = { mes, receitas: 0, despesas: 0 };
      }

      if (t.tipo === 'Receita') {
        margensPorMes[mes].receitas += t.valor || 0;
      } else if (t.tipo === 'Despesa') {
        margensPorMes[mes].despesas += t.valor || 0;
      }
    });

    return Object.values(margensPorMes)
      .sort((a, b) => a.mes.localeCompare(b.mes))
      .slice(-6)
      .map(item => ({
        mes: new Date(item.mes + '-01').toLocaleDateString('pt-BR', { month: 'short' }),
        margemBruta: item.receitas > 0 ? ((item.receitas - item.despesas) / item.receitas) * 100 : 0,
        receitas: item.receitas,
        despesas: item.despesas
      }));
  };

  if (tipo === 'dre') {
    const dados = getDREComparativo();
    
    if (dados.length === 0) {
      return (
        <Card>
          <CardContent className="p-6 text-center text-slate-500">
            Selecione um período para visualizar a comparação
          </CardContent>
        </Card>
      );
    }

    const variacao = dados[1] && dados[0] ? 
      ((dados[1].lucro - dados[0].lucro) / Math.abs(dados[0].lucro || 1)) * 100 : 0;

    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Comparativo: Período Atual vs Anterior</CardTitle>
            <div className={`flex items-center gap-2 px-3 py-1 rounded-lg ${variacao >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
              {variacao >= 0 ? <TrendingUp className="w-4 h-4 text-green-600" /> : <TrendingDown className="w-4 h-4 text-red-600" />}
              <span className={`text-sm font-bold ${variacao >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {variacao >= 0 ? '+' : ''}{variacao.toFixed(1)}%
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={dados}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="periodo" />
              <YAxis />
              <Tooltip formatter={(value) => formatCurrency(value)} />
              <Legend />
              <Bar dataKey="receitas" fill="#10b981" name="Receitas" />
              <Bar dataKey="despesas" fill="#ef4444" name="Despesas" />
              <Bar dataKey="lucro" fill="#f59e0b" name="Lucro/Prejuízo" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    );
  }

  if (tipo === 'fluxo') {
    const dados = getFluxoComparativo();

    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Fluxo de Caixa: Projetado vs Realizado</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={dados}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="mes" />
              <YAxis />
              <Tooltip formatter={(value) => formatCurrency(value)} />
              <Legend />
              <Area 
                type="monotone" 
                dataKey="projetado" 
                fill="#94a3b8" 
                stroke="#64748b" 
                name="Projetado"
                fillOpacity={0.3}
              />
              <Line 
                type="monotone" 
                dataKey="realizado" 
                stroke="#f59e0b" 
                strokeWidth={3}
                name="Realizado"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    );
  }

  if (tipo === 'margens') {
    const dados = getEvolicaoMargens();

    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Evolução da Margem de Lucro</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={dados}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="mes" />
              <YAxis />
              <Tooltip 
                formatter={(value, name) => 
                  name === 'margemBruta' ? `${value.toFixed(1)}%` : formatCurrency(value)
                }
              />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="margemBruta" 
                stroke="#10b981" 
                strokeWidth={2}
                name="Margem (%)"
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    );
  }

  return null;
}