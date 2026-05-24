import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrendingUp, TrendingDown, DollarSign } from 'lucide-react';

export default function ApuracaoResultados({ transacoes, categorias, versao = 'real' }) {
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState('todas');

  const dadosFiltrados = useMemo(() => {
    let filtradas = transacoes.filter(t => 
      t.status === 'pago' &&
      (versao === 'real' || t.numero_documento)
    );

    if (dataInicio) {
      filtradas = filtradas.filter(t => new Date(t.data) >= new Date(dataInicio));
    }
    if (dataFim) {
      filtradas = filtradas.filter(t => new Date(t.data) <= new Date(dataFim));
    }
    if (categoriaFiltro !== 'todas') {
      filtradas = filtradas.filter(t => t.categoria_id === categoriaFiltro);
    }

    return filtradas;
  }, [transacoes, dataInicio, dataFim, categoriaFiltro, versao]);

  // Calcular receitas
  const receitas = useMemo(() => {
    const lista = dadosFiltrados.filter(t => t.tipo === 'receita');
    const total = lista.reduce((sum, t) => sum + (t.valor || 0), 0);
    
    const porCategoria = {};
    lista.forEach(t => {
      const cat = t.categoria_nome || 'Sem categoria';
      porCategoria[cat] = (porCategoria[cat] || 0) + (t.valor || 0);
    });

    return { total, lista, porCategoria };
  }, [dadosFiltrados]);

  // Calcular despesas
  const despesas = useMemo(() => {
    const lista = dadosFiltrados.filter(t => t.tipo === 'despesa');
    const total = lista.reduce((sum, t) => sum + (t.valor || 0), 0);
    
    const porCategoria = {};
    lista.forEach(t => {
      const cat = t.categoria_nome || 'Sem categoria';
      porCategoria[cat] = (porCategoria[cat] || 0) + (t.valor || 0);
    });

    return { total, lista, porCategoria };
  }, [dadosFiltrados]);

  const resultado = receitas.total - despesas.total;
  const margemLucro = receitas.total > 0 ? (resultado / receitas.total) * 100 : 0;

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Apuração de Resultados</CardTitle>
          <Badge variant={versao === 'real' ? 'default' : 'outline'}>
            {versao === 'real' ? 'Regime Real' : 'Regime Contábil (NF-e)'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Filtros */}
        <div className="grid grid-cols-3 gap-4 p-4 bg-slate-50 rounded-lg">
          <div>
            <Label className="text-xs">Data Início</Label>
            <Input
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Data Fim</Label>
            <Input
              type="date"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Categoria</Label>
            <Select value={categoriaFiltro} onValueChange={setCategoriaFiltro}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                {categorias.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Cards de Resumo */}
        <div className="grid grid-cols-3 gap-4">
          <div className="p-6 bg-green-50 rounded-lg border border-green-200">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-5 h-5 text-green-600" />
              <p className="text-sm text-green-700 font-medium">Receitas</p>
            </div>
            <p className="text-3xl font-bold text-green-700">{formatCurrency(receitas.total)}</p>
            <p className="text-xs text-green-600 mt-1">{receitas.lista.length} transações</p>
          </div>

          <div className="p-6 bg-red-50 rounded-lg border border-red-200">
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown className="w-5 h-5 text-red-600" />
              <p className="text-sm text-red-700 font-medium">Despesas</p>
            </div>
            <p className="text-3xl font-bold text-red-700">{formatCurrency(despesas.total)}</p>
            <p className="text-xs text-red-600 mt-1">{despesas.lista.length} transações</p>
          </div>

          <div className={`p-6 rounded-lg border ${resultado >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'}`}>
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className={`w-5 h-5 ${resultado >= 0 ? 'text-blue-600' : 'text-orange-600'}`} />
              <p className={`text-sm font-medium ${resultado >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
                {resultado >= 0 ? 'Lucro' : 'Prejuízo'}
              </p>
            </div>
            <p className={`text-3xl font-bold ${resultado >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
              {formatCurrency(Math.abs(resultado))}
            </p>
            <p className={`text-xs mt-1 ${resultado >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
              Margem: {margemLucro.toFixed(1)}%
            </p>
          </div>
        </div>

        {/* Resultado Visual */}
        <div className="p-6 bg-slate-50 rounded-lg">
          <h4 className="font-semibold text-slate-800 mb-4">Composição do Resultado</h4>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-sm text-slate-600">Receitas</span>
                <span className="text-sm font-semibold text-green-600">{formatCurrency(receitas.total)}</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-3">
                <div className="bg-green-500 h-3 rounded-full" style={{ width: '100%' }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-sm text-slate-600">Despesas</span>
                <span className="text-sm font-semibold text-red-600">{formatCurrency(despesas.total)}</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-3">
                <div 
                  className="bg-red-500 h-3 rounded-full" 
                  style={{ width: receitas.total > 0 ? `${(despesas.total / receitas.total) * 100}%` : '0%' }} 
                />
              </div>
            </div>
          </div>
        </div>

        {/* Detalhamento por Categoria */}
        <div className="grid grid-cols-2 gap-6">
          <div>
            <h4 className="font-semibold text-slate-800 mb-3">Receitas por Categoria</h4>
            <div className="space-y-2">
              {Object.entries(receitas.porCategoria)
                .sort((a, b) => b[1] - a[1])
                .map(([cat, valor]) => (
                  <div key={cat} className="flex justify-between items-center p-2 bg-green-50 rounded">
                    <span className="text-sm text-slate-700">{cat}</span>
                    <span className="text-sm font-semibold text-green-700">{formatCurrency(valor)}</span>
                  </div>
                ))}
            </div>
          </div>

          <div>
            <h4 className="font-semibold text-slate-800 mb-3">Despesas por Categoria</h4>
            <div className="space-y-2">
              {Object.entries(despesas.porCategoria)
                .sort((a, b) => b[1] - a[1])
                .map(([cat, valor]) => (
                  <div key={cat} className="flex justify-between items-center p-2 bg-red-50 rounded">
                    <span className="text-sm text-slate-700">{cat}</span>
                    <span className="text-sm font-semibold text-red-700">{formatCurrency(valor)}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}