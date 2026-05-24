import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { DollarSign } from 'lucide-react';

export default function ValorTransacionado({ dados }) {
  const calcularTotal = (items) => items.reduce((sum, item) => sum + (item.valor_estimado || item.total || 0), 0);

  const valorOportunidades = calcularTotal(dados.oportunidades);
  const valorProjetos = calcularTotal(dados.projetos);
  const valorPedidos = calcularTotal(dados.pedidos);

  const dadosGrafico = [
    { categoria: 'Oportunidades', valor: valorOportunidades },
    { categoria: 'Projetos', valor: valorProjetos },
    { categoria: 'Pedidos', valor: valorPedidos }
  ];

  // Evolução ao longo do tempo
  const meses = {};
  
  [...dados.oportunidades, ...dados.projetos].forEach(item => {
    const mes = new Date(item.created_date).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
    if (!meses[mes]) meses[mes] = { mes, valor: 0 };
    meses[mes].valor += item.valor_estimado || 0;
  });

  const evolucao = Object.values(meses).sort((a, b) => a.mes.localeCompare(b.mes));

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', { 
      style: 'currency', 
      currency: 'BRL',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-green-600" />
          Valor Transacionado
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Cards de resumo */}
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <p className="text-xs text-blue-600 font-medium">Oportunidades</p>
              <p className="text-lg font-bold text-blue-700 mt-1">
                {formatCurrency(valorOportunidades)}
              </p>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <p className="text-xs text-green-600 font-medium">Projetos</p>
              <p className="text-lg font-bold text-green-700 mt-1">
                {formatCurrency(valorProjetos)}
              </p>
            </div>
            <div className="text-center p-4 bg-amber-50 rounded-lg">
              <p className="text-xs text-amber-600 font-medium">Pedidos</p>
              <p className="text-lg font-bold text-amber-700 mt-1">
                {formatCurrency(valorPedidos)}
              </p>
            </div>
          </div>

          {/* Gráfico de evolução */}
          {evolucao.length > 0 && (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={evolucao}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mes" />
                <YAxis />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Legend />
                <Line type="monotone" dataKey="valor" stroke="#10b981" strokeWidth={2} name="Valor Total" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}