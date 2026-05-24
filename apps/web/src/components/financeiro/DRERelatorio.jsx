import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TrendingUp, TrendingDown, FileDown, FileSpreadsheet } from 'lucide-react';

export default function DRERelatorio({ transacoes, versao = 'real', dataInicio, dataFim, categorias = [] }) {
  const transacoesFiltradas = versao === 'contabil' 
    ? transacoes.filter(t => t.numero_documento)
    : transacoes;

  // Agrupar por categoria
  const receitasPorCategoria = {};
  const despesasPorCategoria = {};

  transacoesFiltradas.forEach(t => {
    if (t.status !== 'Pago') return;
    
    const catNome = categorias.find(c => c.id === t.categoria_id)?.nome || 'Sem Categoria';
    
    if (t.tipo === 'Receita') {
      receitasPorCategoria[catNome] = (receitasPorCategoria[catNome] || 0) + (t.valor || 0);
    } else if (t.tipo === 'Despesa') {
      despesasPorCategoria[catNome] = (despesasPorCategoria[catNome] || 0) + (t.valor || 0);
    }
  });

  const receitasBrutas = transacoesFiltradas
    .filter(t => t.tipo === 'Receita' && t.status === 'Pago')
    .reduce((sum, t) => sum + (t.valor || 0), 0);

  const deducoes = 0; // Impostos sobre vendas (pode ser calculado depois)
  const receitasLiquidas = receitasBrutas - deducoes;

  const custosVariaveis = transacoesFiltradas
    .filter(t => t.tipo === 'Despesa' && t.status === 'Pago' && t.tipo_despesa === 'material')
    .reduce((sum, t) => sum + (t.valor || 0), 0);

  const despesasOperacionais = transacoesFiltradas
    .filter(t => t.tipo === 'Despesa' && t.status === 'Pago' && t.tipo_despesa !== 'material')
    .reduce((sum, t) => sum + (t.valor || 0), 0);

  // Calcular resultados
  const lucroBruto = receitasLiquidas - custosVariaveis;
  const margemBruta = receitasLiquidas > 0 ? (lucroBruto / receitasLiquidas) * 100 : 0;

  const lucroOperacional = lucroBruto - despesasOperacionais;
  const margemOperacional = receitasLiquidas > 0 ? (lucroOperacional / receitasLiquidas) * 100 : 0;

  const lucroLiquido = lucroOperacional;
  const margemLiquida = receitasLiquidas > 0 ? (lucroLiquido / receitasLiquidas) * 100 : 0;

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
  };

  const handleExportarCSV = () => {
    const dados = [
      ['Item', 'Valor'],
      ['Receita Bruta', receitasBrutas],
      ['Deduções', deducoes],
      ['Receita Líquida', receitasLiquidas],
      ['Custos Variáveis', custosVariaveis],
      [`Lucro Bruto (${margemBruta.toFixed(1)}%)`, lucroBruto],
      ['Despesas Operacionais', despesasOperacionais],
      [`Lucro Operacional (${margemOperacional.toFixed(1)}%)`, lucroOperacional],
      [`Lucro Líquido (${margemLiquida.toFixed(1)}%)`, lucroLiquido]
    ];

    const csv = dados.map(row => row.join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `dre_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const handleExportarPDF = async () => {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text('DRE - Demonstração do Resultado', 14, 20);
    doc.setFontSize(10);
    doc.text(`Período: ${dataInicio || 'Início'} a ${dataFim || 'Hoje'}`, 14, 28);
    doc.text(`Regime: ${versao === 'real' ? 'Real' : 'Contábil (NF-e)'}`, 14, 34);
    
    let y = 45;
    doc.setFontSize(12);
    
    const items = [
      { label: 'Receita Bruta', valor: receitasBrutas, negrito: true },
      { label: 'Deduções', valor: -deducoes },
      { label: 'Receita Líquida', valor: receitasLiquidas, negrito: true },
      { label: 'Custos Variáveis', valor: -custosVariaveis },
      { label: `Lucro Bruto (${margemBruta.toFixed(1)}%)`, valor: lucroBruto, negrito: true },
      { label: 'Despesas Operacionais', valor: -despesasOperacionais },
      { label: `Lucro Operacional (${margemOperacional.toFixed(1)}%)`, valor: lucroOperacional, negrito: true },
      { label: `Lucro Líquido (${margemLiquida.toFixed(1)}%)`, valor: lucroLiquido, negrito: true }
    ];

    items.forEach(item => {
      if (item.negrito) doc.setFont(undefined, 'bold');
      doc.text(item.label, 14, y);
      doc.text(formatCurrency(Math.abs(item.valor)), 150, y);
      if (item.negrito) doc.setFont(undefined, 'normal');
      y += 8;
    });

    doc.save(`dre_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const LinhaRelatorio = ({ label, valor, destaque = false, negrito = false, identacao = 0 }) => (
    <div 
      className={`flex justify-between py-2 ${destaque ? 'border-t-2 border-slate-300 pt-3' : 'border-t border-slate-100'}`}
      style={{ paddingLeft: `${identacao * 20}px` }}
    >
      <span className={negrito ? 'font-semibold text-slate-800' : 'text-slate-700'}>{label}</span>
      <span className={`${negrito ? 'font-bold' : 'font-medium'} ${valor < 0 ? 'text-red-600' : 'text-slate-900'}`}>
        {formatCurrency(Math.abs(valor))}
      </span>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Demonstração do Resultado do Exercício (DRE)</CardTitle>
            <p className="text-sm text-slate-500 mt-1">
              {dataInicio && dataFim 
                ? `Período: ${new Date(dataInicio).toLocaleDateString('pt-BR')} a ${new Date(dataFim).toLocaleDateString('pt-BR')}`
                : 'Todos os períodos'}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExportarCSV}>
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              CSV
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportarPDF}>
              <FileDown className="w-4 h-4 mr-2" />
              PDF
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        <LinhaRelatorio label="(+) Receita Bruta" valor={receitasBrutas} negrito />
        <LinhaRelatorio label="(-) Deduções" valor={-deducoes} identacao={1} />
        <LinhaRelatorio label="(=) Receita Líquida" valor={receitasLiquidas} negrito destaque />
        
        <LinhaRelatorio label="(-) Custos Variáveis (Materiais)" valor={-custosVariaveis} identacao={1} />
        <LinhaRelatorio 
          label={`(=) Lucro Bruto (${margemBruta.toFixed(1)}%)`} 
          valor={lucroBruto} 
          negrito 
          destaque 
        />
        
        <LinhaRelatorio label="(-) Despesas Operacionais" valor={-despesasOperacionais} identacao={1} />
        <LinhaRelatorio 
          label={`(=) Lucro Operacional (${margemOperacional.toFixed(1)}%)`} 
          valor={lucroOperacional} 
          negrito 
          destaque 
        />
        
        <LinhaRelatorio 
          label={`(=) Lucro Líquido (${margemLiquida.toFixed(1)}%)`} 
          valor={lucroLiquido} 
          negrito 
          destaque 
        />

        <div className="mt-6 p-4 bg-slate-50 rounded-lg">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs text-slate-500 mb-1">Margem Bruta</p>
              <p className="text-lg font-bold text-slate-800">{margemBruta.toFixed(1)}%</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Margem Operacional</p>
              <p className="text-lg font-bold text-slate-800">{margemOperacional.toFixed(1)}%</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Margem Líquida</p>
              <p className={`text-lg font-bold ${lucroLiquido >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {margemLiquida.toFixed(1)}%
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}