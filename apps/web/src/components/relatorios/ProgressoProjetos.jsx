import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { TrendingUp, Download, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ProgressoProjetos({ dados, expandido = false }) {
  const statusAgrupado = dados.reduce((acc, proj) => {
    const status = proj.status_nome || 'Sem Status';
    if (!acc[status]) {
      acc[status] = { nome: status, quantidade: 0, valor: 0 };
    }
    acc[status].quantidade += 1;
    acc[status].valor += proj.valor_estimado || 0;
    return acc;
  }, {});

  const dadosGrafico = Object.values(statusAgrupado);

  // Dados de evolução temporal
  const projetosPorMes = dados.reduce((acc, proj) => {
    const mes = new Date(proj.created_date).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
    if (!acc[mes]) acc[mes] = { mes, quantidade: 0 };
    acc[mes].quantidade += 1;
    return acc;
  }, {});

  const evolucao = Object.values(projetosPorMes).sort((a, b) => a.mes.localeCompare(b.mes));

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', { 
      style: 'currency', 
      currency: 'BRL',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const exportarPDF = async () => {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    
    doc.setFontSize(16);
    doc.text('Progresso de Projetos', 14, 15);
    doc.setFontSize(10);
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 22);
    
    let y = 35;
    dadosGrafico.forEach(item => {
      doc.text(`${item.nome}: ${item.quantidade} projetos - ${formatCurrency(item.valor)}`, 14, y);
      y += 7;
    });
    
    doc.save(`projetos_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-green-600" />
            Progresso de Projetos
          </CardTitle>
          <Button variant="outline" size="sm" onClick={exportarPDF}>
            <Download className="w-4 h-4 mr-2" />
            PDF
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {dadosGrafico.length > 0 ? (
          <div className="space-y-6">
            <ResponsiveContainer width="100%" height={expandido ? 400 : 300}>
              <BarChart data={dadosGrafico}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="nome" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="quantidade" fill="#10b981" name="Projetos" />
              </BarChart>
            </ResponsiveContainer>

            {expandido && evolucao.length > 0 && (
              <>
                <h3 className="font-semibold text-slate-800">Evolução Temporal</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={evolucao}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="mes" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="quantidade" stroke="#3b82f6" name="Projetos" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </>
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