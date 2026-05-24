import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { DollarSign, TrendingUp, AlertCircle, CheckCircle, TrendingDown } from 'lucide-react';

export default function ResumoFinanceiroTab({ projetoId, empresaAtiva, orcamentoItens, transacoes = [] }) {
  // Usar transacoes passadas pelo pai (já filtradas por projeto_id)
  // Comparação case-insensitive pois o tipo pode ser 'receita' ou 'Receita'
  const despesas = transacoes.filter(t => t.tipo?.toLowerCase() === 'despesa');
  const receitas = transacoes.filter(t => t.tipo?.toLowerCase() === 'receita');

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
  };

  // Calcular orçado (soma dos itens de orçamento)
  const orcado = orcamentoItens?.reduce((sum, item) => sum + (item.valor_total || 0), 0) || 0;

  // Calcular realizado (soma das despesas)
  const realizado = despesas.reduce((sum, desp) => sum + (desp.valor || 0), 0);

  // Calcular receitas
  const totalReceitas = receitas.reduce((sum, rec) => sum + (rec.valor || 0), 0);

  // Calcular resultado
  const resultado = totalReceitas - realizado;

  // Dados para o gráfico comparativo
  const dadosComparativo = [
    {
      nome: 'Orçado',
      valor: orcado
    },
    {
      nome: 'Realizado',
      valor: realizado
    }
  ];

  // Despesas por categoria
  const despesasPorCategoria = {};
  despesas.forEach(desp => {
    const categoria = desp.categoria_nome || 'Sem categoria';
    despesasPorCategoria[categoria] = (despesasPorCategoria[categoria] || 0) + (desp.valor || 0);
  });

  const dadosCategorias = Object.entries(despesasPorCategoria).map(([categoria, valor]) => ({
    categoria,
    valor
  }));

  const percentualGasto = orcado > 0 ? ((realizado / orcado) * 100).toFixed(2) : 0;
  const variacao = orcado - realizado;
  const variacao_percent = orcado > 0 ? ((variacao / orcado) * 100).toFixed(2) : 0;

  return (
    <div className="space-y-6">
      {/* Cards resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 mb-1">Orçado</p>
                <p className="text-2xl font-bold text-slate-800">{formatCurrency(orcado)}</p>
              </div>
              <DollarSign className="w-8 h-8 text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 mb-1">Realizado</p>
                <p className="text-2xl font-bold text-slate-800">{formatCurrency(realizado)}</p>
              </div>
              <TrendingDown className="w-8 h-8 text-red-500 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 mb-1">Receita</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(totalReceitas)}</p>
              </div>
              <TrendingUp className="w-8 h-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 mb-1">Resultado</p>
                <p className={`text-2xl font-bold ${resultado >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(resultado)}
                </p>
              </div>
              {resultado >= 0 ? (
                <CheckCircle className="w-8 h-8 text-green-500 opacity-50" />
              ) : (
                <AlertCircle className="w-8 h-8 text-red-500 opacity-50" />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico Orçado x Realizado */}
      <Card>
        <CardHeader>
          <CardTitle>Orçado x Realizado</CardTitle>
          <p className="text-sm text-slate-500 mt-1">
            Gasto: <span className="font-bold">{percentualGasto}%</span> do orçado
            {variacao !== 0 && (
              <span className={variacao > 0 ? 'text-green-600 ml-4' : 'text-red-600 ml-4'}>
                {variacao > 0 ? '+' : ''}{formatCurrency(variacao)}
              </span>
            )}
          </p>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={dadosComparativo} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="nome" />
              <YAxis />
              <Tooltip 
                formatter={(value) => formatCurrency(value)}
                contentStyle={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}
              />
              <Bar dataKey="valor" fill="#3b82f6" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Despesas por Categoria */}
      {dadosCategorias.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Despesas por Categoria</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dadosCategorias} margin={{ top: 20, right: 30, left: 0, bottom: 60 }} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="categoria" type="category" width={150} />
                <Tooltip 
                  formatter={(value) => formatCurrency(value)}
                  contentStyle={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}
                />
                <Bar dataKey="valor" fill="#ef4444" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Tabela de variação */}
      <Card>
        <CardHeader>
          <CardTitle>Análise Financeira</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
              <span className="text-slate-600">Orçado:</span>
              <span className="font-bold">{formatCurrency(orcado)}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
              <span className="text-slate-600">Realizado:</span>
              <span className="font-bold">{formatCurrency(realizado)}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
              <span className="text-slate-600">Variação:</span>
              <span className={`font-bold ${variacao > 0 ? 'text-green-600' : 'text-red-600'}`}>
                {variacao > 0 ? '+' : ''}{formatCurrency(variacao)} ({variacao_percent}%)
              </span>
            </div>
            <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg border border-green-200">
              <span className="text-green-700 font-medium">Receitas:</span>
              <span className="font-bold text-green-700">{formatCurrency(totalReceitas)}</span>
            </div>
            <div className={`flex justify-between items-center p-3 rounded-lg border ${resultado >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <span className={`font-medium ${resultado >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                Resultado Líquido:
              </span>
              <span className={`font-bold text-lg ${resultado >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {formatCurrency(resultado)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}