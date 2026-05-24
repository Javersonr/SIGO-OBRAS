import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { ShoppingCart } from 'lucide-react';

export default function StatusCompras({ dados, expandido = false }) {
  const solicitacoesPorStatus = dados.solicitacoes.reduce((acc, sol) => {
    const status = sol.status || 'Sem Status';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

  const cotacoesPorStatus = dados.cotacoes.reduce((acc, cot) => {
    const status = cot.status || 'Sem Status';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

  const pedidosPorStatus = dados.pedidos.reduce((acc, ped) => {
    const status = ped.status || 'Sem Status';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

  const dadosConsolidados = [
    { tipo: 'Solicitações', quantidade: dados.solicitacoes.length },
    { tipo: 'Cotações', quantidade: dados.cotacoes.length },
    { tipo: 'Pedidos', quantidade: dados.pedidos.length }
  ];

  const CORES = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShoppingCart className="w-5 h-5 text-blue-600" />
          Status de Compras
        </CardTitle>
      </CardHeader>
      <CardContent>
        {dadosConsolidados.some(d => d.quantidade > 0) ? (
          <div className="space-y-6">
            <ResponsiveContainer width="100%" height={expandido ? 350 : 250}>
              <BarChart data={dadosConsolidados}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="tipo" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="quantidade" fill="#3b82f6" name="Quantidade" />
              </BarChart>
            </ResponsiveContainer>

            {expandido && (
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <h4 className="font-medium text-slate-700 mb-3">Solicitações</h4>
                  <div className="space-y-2">
                    {Object.entries(solicitacoesPorStatus).map(([status, qtd]) => (
                      <div key={status} className="flex justify-between text-sm">
                        <span className="text-slate-600">{status}</span>
                        <span className="font-medium">{qtd}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="font-medium text-slate-700 mb-3">Cotações</h4>
                  <div className="space-y-2">
                    {Object.entries(cotacoesPorStatus).map(([status, qtd]) => (
                      <div key={status} className="flex justify-between text-sm">
                        <span className="text-slate-600">{status}</span>
                        <span className="font-medium">{qtd}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="font-medium text-slate-700 mb-3">Pedidos</h4>
                  <div className="space-y-2">
                    {Object.entries(pedidosPorStatus).map(([status, qtd]) => (
                      <div key={status} className="flex justify-between text-sm">
                        <span className="text-slate-600">{status}</span>
                        <span className="font-medium">{qtd}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-12 text-slate-500">
            <p>Nenhum dado disponível</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}