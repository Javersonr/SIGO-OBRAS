import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useEmpresa } from '../../../Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, TrendingUp, TrendingDown } from 'lucide-react';

export default function WidgetResumoFinanceiro() {
  const { empresaAtiva, perfil, vinculo } = useEmpresa();
  const [resumo, setResumo] = useState({ receitas: 0, despesas: 0, saldo: 0 });
  const [loading, setLoading] = useState(true);
  
  // Apenas Admin ou sem permissões granulares pode ver o resumo
  const permissoes = vinculo?.permissoes ? JSON.parse(vinculo.permissoes) : {};
  const temPermissoesGranulares = Object.keys(permissoes).length > 0;
  const podeVerResumo = perfil === 'Admin' && !temPermissoesGranulares;

  useEffect(() => {
    if (!podeVerResumo) {
      setLoading(false);
      return;
    }
    if (empresaAtiva?.id) {
      loadResumo();
    } else {
      setLoading(false);
    }
  }, [empresaAtiva?.id, podeVerResumo]);

  const loadResumo = async () => {
    try {
      const hoje = new Date();
      const primeiroDiaMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split('T')[0];
      const ultimoDiaMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().split('T')[0];

      // Otimizado: buscar apenas transações do mês atual e pagas
      const [receitasList, despesasList] = await Promise.all([
        base44.entities.TransacaoFinanceira.filter({
          empresa_id: empresaAtiva.id,
          tipo: 'Receita',
          status: 'Pago'
        }),
        base44.entities.TransacaoFinanceira.filter({
          empresa_id: empresaAtiva.id,
          tipo: 'Despesa',
          status: 'Pago'
        })
      ]);

      // Filtrar por mês em memória (mais rápido que buscar tudo)
      const receitasMes = receitasList.filter(t => 
        t.data_vencimento >= primeiroDiaMes && t.data_vencimento <= ultimoDiaMes
      );
      const despesasMes = despesasList.filter(t => 
        t.data_vencimento >= primeiroDiaMes && t.data_vencimento <= ultimoDiaMes
      );

      const receitas = receitasMes.reduce((sum, t) => sum + (t.valor || 0), 0);
      const despesas = despesasMes.reduce((sum, t) => sum + (t.valor || 0), 0);

      setResumo({ receitas, despesas, saldo: receitas - despesas });
    } catch (error) {
      console.error('Erro:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!podeVerResumo) {
    return null;
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-slate-200 rounded w-1/2" />
            <div className="h-8 bg-slate-200 rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-green-600" />
          Resumo Financeiro
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-600">Receitas</span>
          <span className="font-semibold text-green-600">
            R$ {resumo.receitas.toFixed(2)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-600">Despesas</span>
          <span className="font-semibold text-red-600">
            R$ {resumo.despesas.toFixed(2)}
          </span>
        </div>
        <div className="pt-3 border-t flex items-center justify-between">
          <span className="font-medium text-slate-700">Saldo</span>
          <div className="flex items-center gap-2">
            {resumo.saldo >= 0 ? (
              <TrendingUp className="w-4 h-4 text-green-600" />
            ) : (
              <TrendingDown className="w-4 h-4 text-red-600" />
            )}
            <span className={`font-bold ${resumo.saldo >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              R$ {Math.abs(resumo.saldo).toFixed(2)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}