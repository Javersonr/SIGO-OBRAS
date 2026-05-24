import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useEmpresa } from '../../../Layout';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../../../utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DollarSign, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function WidgetContasPagar() {
  const { empresaAtiva, perfil, vinculo } = useEmpresa();
  const [contas, setContas] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Apenas Admin ou sem permissões granulares pode ver
  const permissoes = vinculo?.permissoes ? JSON.parse(vinculo.permissoes) : {};
  const temPermissoesGranulares = Object.keys(permissoes).length > 0;
  const podeVerContas = perfil === 'Admin' && !temPermissoesGranulares;

  useEffect(() => {
    if (!podeVerContas) {
      setLoading(false);
      return;
    }
    if (empresaAtiva) {
      loadContas();
    }
  }, [empresaAtiva, podeVerContas]);

  const loadContas = async () => {
    try {
      const hoje = new Date().toISOString().split('T')[0];
      const transacoes = await base44.entities.TransacaoFinanceira.filter({
        empresa_id: empresaAtiva.id,
        tipo: 'Despesa',
        status: 'Pendente'
      });

      const proximas = transacoes
        .filter(t => t.data_vencimento >= hoje)
        .sort((a, b) => a.data_vencimento?.localeCompare(b.data_vencimento))
        .slice(0, 5);

      setContas(proximas);
    } catch (error) {
      console.error('Erro:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!podeVerContas) {
    return null;
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-slate-200 rounded" />
            <div className="h-4 bg-slate-200 rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-red-600" />
            Próximas Contas a Pagar
          </div>
          <Link to={createPageUrl('Financeiro')}>
            <Button variant="ghost" size="sm" className="text-xs">
              Ver todas
            </Button>
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {contas.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-4">
            Nenhuma conta a pagar
          </p>
        ) : (
          contas.map(conta => (
            <div key={conta.id} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{conta.descricao}</p>
                <p className="text-xs text-slate-500">
                  Vence: {new Date(conta.data_vencimento).toLocaleDateString('pt-BR')}
                </p>
              </div>
              <span className="text-sm font-semibold text-red-600 ml-2">
                R$ {(conta.valor || 0).toFixed(2)}
              </span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}